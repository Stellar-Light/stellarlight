/**
 * Review one hackathon submission from a link, with no sign-in:
 *
 *   GET /api/hackathons/review?link=github.com/rajkaria/toll
 *   GET /api/hackathons/review?link=https://dorahacks.io/buidl/42585
 *   GET /api/hackathons/review?link=github.com/owner/name&hackathon=hackmeridian-2026
 *
 * Composition lives in src/lib/hackathon-review.ts: the submission's stored
 * facts, mechanical checks, the submissions closest in meaning, and the SCF
 * pitch view over its summary. With `hackathon`, the event's judging criteria
 * are mapped to evidence (src/lib/hackathon-judging.ts) from a bounded live
 * read of the repo (src/lib/repo-live-read.ts), and a GitHub repo with no
 * stored submission is reviewed from that read alone (stored: false).
 */
import { type NextRequest, NextResponse } from "next/server";
import { rateLimited } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import { repoFullNameOf } from "@/lib/hackathon-build-links";
import { getHackathonBuildsIndex } from "@/lib/hackathon-builds";
import {
	buildJudging,
	JUDGED_EVENT_SLUGS,
	JUDGED_EVENTS,
	type RepoSource,
	repoEvidence,
	scfEvidence,
} from "@/lib/hackathon-judging";
import { buildHackathonReview } from "@/lib/hackathon-review";
import { heldRepoNames } from "@/lib/held-repos";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { callerKey, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import {
	LIVE_READ_BUDGET_MS,
	LIVE_READ_PARTS,
	readRepoLive,
} from "@/lib/repo-live-read";
import { fetchScfRounds } from "@/lib/scf-rounds";
import { serverTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

const SUPPORTED_PARAMS = ["link", "hackathon"] as const;
const UNAVAILABLE =
	"The submissions store did not answer. This is an outage, not a finding about the project. Retry after a moment.";
const NOTE =
	"Evidence, not a verdict. Each check is a fact about the submission (ok null = could not be checked, never a no). similar = the stored submissions closest in meaning to it. pitch = the SCF pitch view over its summary: live round, funded peers, competitors, maturity, prior art and the vertical's supply gap.";
const JUDGING_NOTE =
	"judging = each of the event's judging criteria, in its record's words, with the evidence a judge would find in the repo, read live from GitHub (repo.readAt), or checkable false with the reason. An item's state could-not-check is never a no; not-found holds only within what its finding says was read. No score and no pass or fail.";

/** The live repo read, never longer than its budget, beside the live SCF
 * round, which waits no longer than the same budget. */
async function judgingFor(
	slug: string,
	repo: string | null,
	held: boolean,
	caller: string,
): Promise<{ source: RepoSource; judging: ReturnType<typeof buildJudging> }> {
	const event = JUDGED_EVENTS.find((h) => h.uname === slug);
	if (!event) throw new Error(`no criteria for ${slug}`);
	const source: Promise<RepoSource> = held
		? Promise.resolve({
				state: "none",
				reason: "The repo is held for malware, so Scout does not read it.",
			})
		: repo
			? readRepoLive(repo, { caller })
			: Promise.resolve({
					state: "none",
					reason:
						"No GitHub repo is linked on the submission (or only an account), so nothing in the code can be checked.",
				});
	let timer: ReturnType<typeof setTimeout> | undefined;
	const scf = Promise.race([
		fetchScfRounds().catch(() => null),
		new Promise<null>((r) => {
			timer = setTimeout(() => r(null), LIVE_READ_BUDGET_MS);
		}),
	]).finally(() => clearTimeout(timer));
	const [src, rounds] = await Promise.all([source, scf]);
	return {
		source: src,
		judging: buildJudging(event, repoEvidence(src), scfEvidence(rounds)),
	};
}

/** The read's own facts: when, how long, what did not answer. */
function repoBlock(src: RepoSource, asked: string) {
	if (src.state === "none" || src.state === "missing") return null;
	return src.state === "read"
		? {
				fullName: src.facts.fullName,
				url: src.facts.url,
				commit: src.facts.commit,
				readAt: src.readAt,
				readMs: src.readMs,
				unread: src.unread,
			}
		: {
				fullName: asked,
				url: `https://github.com/${asked}`,
				commit: null,
				readAt: src.readAt,
				readMs: src.readMs,
				unread: [...LIVE_READ_PARTS],
			};
}

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const sp = req.nextUrl.searchParams;
	const unknown = [...new Set(sp.keys())].filter(
		(k) => !(SUPPORTED_PARAMS as readonly string[]).includes(k),
	);
	if (unknown.length)
		return NextResponse.json(
			{
				error: `Unsupported query parameter(s): ${unknown.join(", ")}.`,
				supportedParams: SUPPORTED_PARAMS,
			},
			{ status: 400 },
		);
	const link = sp.get("link")?.trim();
	if (!link)
		return NextResponse.json(
			{
				error:
					"Pass `link`: the submission's GitHub repo or its DoraHacks link.",
				examples: [
					"link=github.com/rajkaria/toll",
					"link=https://dorahacks.io/buidl/42585",
				],
			},
			{ status: 400 },
		);
	const judgedSlugs = JUDGED_EVENT_SLUGS;
	const slug = sp.has("hackathon")
		? (sp.get("hackathon") ?? "").trim().toLowerCase()
		: null;
	if (slug !== null && !judgedSlugs.includes(slug))
		return NextResponse.json(
			{
				error: `hackathon '${slug}' is not an event whose judging criteria Scout holds.`,
				validHackathons: judgedSlugs,
			},
			{ status: 400 },
		);
	// With hackathon a live GitHub read may run: each caller's window is
	// checked before any work. Without it nothing changes.
	const limit =
		slug === null
			? null
			: rateLimit(req, {
					endpoint: "/api/hackathons/review?hackathon",
					limit: 20,
					windowMs: 60_000,
				});
	if (limit && !limit.allowed) return rateLimited(limit, { startedAt });
	const payload = await getPayloadSafe();
	if (!payload)
		return NextResponse.json(
			{ error: "submissions store unavailable", advisory: UNAVAILABLE },
			{ status: 503, headers: { "Retry-After": "2" } },
		);
	let review: Awaited<ReturnType<typeof buildHackathonReview>>;
	try {
		review = await buildHackathonReview(
			payload,
			link,
			await getHackathonBuildsIndex(),
		);
	} catch {
		return NextResponse.json(
			{ error: "submissions store unavailable", advisory: UNAVAILABLE },
			{ status: 503, headers: { "Retry-After": "2" } },
		);
	}
	const repo =
		repoFullNameOf(link) ??
		(/^[\w.-]+\/[\w.-]+$/.test(link)
			? link.toLowerCase().replace(/\.git$/, "")
			: null);
	if (!review && !(slug && repo))
		return NextResponse.json(
			{
				error: `No stored Stellar hackathon submission matches '${link}'.`,
				advisory: `Not stored here is not proof it was never submitted: the store holds submissions to ended Stellar hackathons on DoraHacks. For a GitHub repo entering an event whose judging criteria Scout holds (${judgedSlugs.join(", ")}), pass hackathon=<slug> to read the repo live against those criteria. For a repo's trust signals use getRepoTrust; for an idea, vetIdea or scfPitch.`,
			},
			{ status: 404 },
		);
	if (review && !slug) {
		try {
			logApiHit({
				endpoint: "/api/hackathons/review",
				query: link,
				req,
				startedAt,
				status: 200,
			});
		} catch {}
		return NextResponse.json(
			{
				meta: {
					source: "https://stellarlight.xyz/api/hackathons/review",
					generatedAt: new Date().toISOString(),
					note: NOTE,
				},
				review,
			},
			{ headers: serverTiming(startedAt) },
		);
	}
	const log = (status: number) => {
		try {
			logApiHit({
				endpoint: "/api/hackathons/review",
				query: link,
				filters: { hackathon: slug },
				req,
				startedAt,
				status,
			});
		} catch {}
	};
	const headers = () => ({
		...serverTiming(startedAt),
		...(limit ? rateLimitHeaders(limit) : {}),
	});
	if (review) {
		const stored = review.submission;
		const held = !!stored.security;
		const { source, judging } = await judgingFor(
			slug as string,
			held ? null : stored.repo,
			held,
			callerKey(req),
		);
		log(200);
		return NextResponse.json(
			{
				meta: {
					source: "https://stellarlight.xyz/api/hackathons/review",
					generatedAt: new Date().toISOString(),
					note: `${NOTE} ${JUDGING_NOTE}`,
				},
				review: {
					...review,
					stored: true,
					repo: stored.repo ? repoBlock(source, stored.repo) : null,
					judging,
				},
			},
			{ headers: headers() },
		);
	}
	const unstored = repo as string;
	let held = false;
	try {
		held = (await heldRepoNames(payload)).has(unstored);
	} catch {
		return NextResponse.json(
			{ error: "submissions store unavailable", advisory: UNAVAILABLE },
			{ status: 503, headers: { "Retry-After": "2" } },
		);
	}
	const { source, judging } = await judgingFor(
		slug as string,
		unstored,
		held,
		callerKey(req),
	);
	if (source.state === "missing") {
		log(404);
		return NextResponse.json(
			{
				error: `No public GitHub repo answers at ${unstored}.`,
				advisory:
					"It does not exist or is not public. Judges review the GitHub repo, so a private repo shows them nothing; make it public, then ask again. Not stored here either: the submissions store holds ended Stellar hackathons on DoraHacks.",
			},
			{ status: 404, headers: headers() },
		);
	}
	log(200);
	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/api/hackathons/review",
				generatedAt: new Date().toISOString(),
				note: `Evidence, not a verdict. stored false: no stored submission matches the link, so the review is the live read of the GitHub repo alone, with no stored checks, similar submissions or pitch. ${JUDGING_NOTE}`,
			},
			review: {
				link,
				stored: false,
				// The caller's own link is echoed, so the stored builds' "link
				// withheld" note would not hold here.
				...(held
					? {
							security: {
								held: true,
								note: "This repo carried malware when last checked, so Scout does not read it. Do not clone it, open it in VS Code or Cursor, or run npm install in it.",
							},
						}
					: {}),
				repo: repoBlock(source, unstored),
				judging,
			},
		},
		{ headers: headers() },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
