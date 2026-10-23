/**
 * Prize-labels replay (lane PL).
 *
 * Runs the real GET handlers of getHackathon, searchHackathonBuilds and
 * getHackathonSubmission over an index and store rebuilt from a capture of
 * the live API (capture.ts), with the clock pinned and no database, and
 * writes each response body's sha256 and length to REPLAY_OUT and the body
 * itself to REPLAY_BODIES. Run once on the base tree and once on the
 * lane's; diff.mjs lists every difference.
 *
 *   CAPTURE_DIR=<capture> REPLAY_OUT=<file> REPLAY_BODIES=<dir> npx vitest run \
 *     --config improvements/audits/2026-10-23-prize-labels/vitest.replay.config.mts
 *
 * Keep REPLAY_BODIES out of the repo: bodies carry third-party project text.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import type { DoraHacksHackathon } from "@/lib/integrations/dorahacks";
import { EVENTS, WINNERS } from "./capture";

const CAP = process.env.CAPTURE_DIR ?? "";
const OUT = process.env.REPLAY_OUT ?? "";
const BODIES = process.env.REPLAY_BODIES ?? "";
const NOW = new Date("2026-10-23T20:45:00.000Z");

type Json = Record<string, unknown>;
const read = (p: string): Json =>
	JSON.parse(readFileSync(join(CAP, p), "utf8")) as Json;

const state = vi.hoisted(() => ({
	index: [] as unknown[],
	events: [] as unknown[],
	storedEvents: new Map<string, unknown>(),
	hidden: new Map<string, unknown[]>(),
	buildRows: new Map<string, unknown[]>(),
	projects: [] as unknown[],
}));

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/hackathon-build-semantic", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-build-semantic")>()),
	semanticBuildScores: vi.fn(async () => null),
	similarToBuild: vi.fn(async () => null),
}));
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => state.index),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => state.events),
	fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
		hackathons: state.events,
		complete: true,
	})),
	fetchHackathonSubmissions: vi.fn(async () => []),
}));
// No database: stored event pages, hidden winners, a submission's stored
// rows and its event's winners all come from the capture.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(
			async (a: {
				collection: string;
				where?: {
					slug?: { equals?: string; in?: string[] };
					and?: Array<{
						buildId?: { equals?: string };
						hackathonSlug?: { equals?: string; in?: string[] };
					}>;
				};
			}) => {
				const docs = (() => {
					if (a.collection === "hackathon-events") {
						const d = state.storedEvents.get(a.where?.slug?.equals ?? "");
						return d ? [d] : [];
					}
					if (a.collection === "projects") {
						const wanted = a.where?.slug?.in ?? [];
						return (state.projects as Array<{ slug: string }>).filter((p) =>
							wanted.includes(p.slug),
						);
					}
					if (a.collection !== "hackathon-builds") return [];
					const first = a.where?.and?.[0];
					if (first?.buildId?.equals)
						return state.buildRows.get(first.buildId.equals) ?? [];
					// The winners of a submission's events, as stored rows.
					if (first?.hackathonSlug?.in) {
						const slugs = first.hackathonSlug.in;
						return (state.index as IndexedBuild[])
							.filter((b) => b.isWinner && slugs.includes(b.hackathon.slug))
							.map((b) => ({
								buildId: b.id,
								hackathonSlug: b.hackathon.slug,
								placement: b.hackathonPlacement,
								award: b.award,
							}));
					}
					return state.hidden.get(first?.hackathonSlug?.equals ?? "") ?? [];
				})();
				return { docs, totalDocs: docs.length };
			},
		),
	})),
}));

// ---- the captured index, events and pages ------------------------------
const list = read("list.json").hackathons as Json[];
const measured = new Map(
	(
		((read("analyze-category.json").meta as Json).facet as Json)
			.measured as Array<{ type: string; precision: number; recall: number }>
	).map((m) => [m.type, { precision: m.precision, recall: m.recall }]),
);
const detail = new Map(
	EVENTS.map((s) => [s, read(`detail/${s}.json`)] as const),
);
const at = (date: unknown) =>
	Math.floor(Date.parse(`${String(date)}T12:00:00Z`) / 1000);

state.events = list.map((r): DoraHacksHackathon => {
	const org = r.organizer as { id: string; name: string } | null;
	return {
		id: Number(String(r.id).replace(/^dorahacks-/, "")),
		title: String(r.name),
		uname: String(r.slug),
		description: (r.description as string | null) ?? undefined,
		start_time: at(r.startDate),
		end_time: at(r.endDate),
		bonus_price: (r.prizePoolUSD as number | undefined) ?? 0,
		hackers_count: (r.hackersCount as number | undefined) ?? 0,
		winner_announced: null,
		status: r.status === "completed" ? 2 : 1,
		organization: org
			? {
					id: Number(String(org.id).replace(/^dorahacks-org-/, "")),
					name: org.name,
				}
			: undefined,
		external_url: (r.externalUrl as string | null) ?? undefined,
		source: r.source as "dorahacks" | "curated",
	} as DoraHacksHackathon;
});

for (const [slug, d] of detail) {
	const h = d.hackathon as Json;
	const stats = h.stats as Json;
	const rules = h.rules as Json | undefined;
	if (rules || stats.upstreamSubmissions != null)
		state.storedEvents.set(slug, {
			id: `event-${slug}`,
			slug,
			title: h.name,
			description: h.description,
			upstreamSubmissions: stats.upstreamSubmissions ?? null,
			...(rules
				? {
						detailReadAt: rules.readAt,
						repoRequired: rules.repoRequired,
						videoRequired: rules.videoRequired,
						submissionQuestions: rules.submissionQuestions,
						requirementsSection: rules.requirements,
						judgingSection: rules.judgingCriteria,
					}
				: {}),
		});
	state.hidden.set(
		slug,
		((stats.hiddenWinners as Json[] | null) ?? []).map((x, i) => ({
			buildId: `hidden-${slug}-${i}`,
			placement: x.placement ?? null,
			award: x.award ?? null,
		})),
	);
	const subs = new Map(
		(d.submissions as Json[]).map((s) => [String(s.id), s] as const),
	);
	const wins = new Map(
		(d.winners as Json[]).map((s) => [String(s.id), s] as const),
	);
	// In the order the live page lists them: the store's order.
	const order = [...subs.keys()];
	const rows = (read(`builds/${slug}.json`) as unknown as Json[]).sort(
		(a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)),
	);
	for (const r of rows) {
		const id = String(r.id);
		const description = (r.description as string | null) ?? null;
		const track = (r.track as string | null) ?? null;
		const award = (r.award as string | null) ?? null;
		const b: IndexedBuild = {
			id,
			name: String(r.name),
			description,
			githubUrl: (r.githubUrl as string | null) ?? null,
			...(r.security
				? { security: r.security as { held: true; note: string } }
				: {}),
			demoUrl: (r.demoUrl as string | null) ?? null,
			videoUrl: (subs.get(id)?.videoUrl as string | null) ?? null,
			track,
			hackathonPlacement: (r.placement as string | null) ?? null,
			award,
			isWinner: !!r.isWinner,
			...(wins.get(id)?.winnerSource
				? { winnerSource: String(wins.get(id)?.winnerSource) }
				: {}),
			voteCount: null,
			url: String(r.url),
			source: "dorahacks",
			hackathon: {
				title: String(r.hackathon),
				slug: String(r.hackathonSlug),
				endedAt: (r.endedAt as string | null) ?? null,
			},
			haystack:
				`${String(r.name)} ${description ?? ""} ${track ?? ""} ${award ?? ""}`.toLowerCase(),
			...("project" in r
				? { project: r.project as IndexedBuild["project"] }
				: {}),
			...(r.stack ? { stack: r.stack as string[] } : {}),
			...(r.categories
				? {
						categories: (r.categories as string[]).map((type) => ({
							type,
							score: 1,
							...measured.get(type),
						})),
					}
				: {}),
			...(r.afterEvent === "repo not found" ? { repoMissing: true } : {}),
			...("lastCommitAt" in r
				? {
						activity: {
							lastCommitAt: (r.lastCommitAt as string | null) ?? null,
							archived: r.afterEvent === "archived",
						},
					}
				: {}),
		};
		state.index.push(b);
	}
}

// A hand-checked submission's stored rows, one per event it entered, from
// its captured detail.
for (const id of WINNERS) {
	const d = read(`build/${id}.json`).build as Json;
	const links = d.links as Json;
	const project = d.project as Json | null | undefined;
	const activity = d.activity as Json | undefined;
	if (project && typeof project.status !== "undefined")
		state.projects.push({
			slug: project.slug,
			status: project.status,
			scf: { awarded: project.scfAwarded },
		});
	state.buildRows.set(
		id,
		(d.entries as Json[]).map((e, i) => {
			const ev = e.hackathon as Json;
			return {
				id: `${id}-${i}`,
				buildId: id,
				name: d.name,
				vision: d.summary,
				description: d.writeUp,
				selfTags: d.selfTags,
				hackathonSlug: ev.slug,
				hackathonTitle: ev.title,
				endedAt: ev.endedAt,
				track: e.track,
				placement: e.placement,
				award: e.award,
				isWinner: e.isWinner,
				url: links.dorahacks,
				githubUrl: links.github,
				demoUrl: links.demo,
				videoUrl: links.video,
				repoFullName: d.repo,
				...(project !== undefined
					? {
							linkCheckedAt: "2026-10-23T00:00:00.000Z",
							projectSlug: project?.slug ?? null,
							projectName: project?.name ?? null,
							projectLinkBasis: project?.basis ?? null,
						}
					: {}),
				stack: d.stack ?? [],
				stackReadAt: d.stackReadAt,
				repoMissingAt: d.repoMissingAt,
				categories: d.categories ?? null,
				categoriesAt: d.categoriesAt,
				categoriesMethod: d.categoriesMethod,
				activityCheckedAt: d.activityCheckedAt,
				repoLastCommitAt: activity?.lastCommitAt ?? null,
				repoArchived: activity?.archived ?? false,
				firstSeenAt: d.firstSeenAt,
				lastSeenAt: d.lastSeenAt,
				detailReadAt: d.writeUpReadAt,
			};
		}),
	);
}

// ---- the requests -------------------------------------------------------
type Req = { key: string; route: "event" | "builds" | "build"; qs: string };
const reqs: Req[] = [];
for (const s of EVENTS) {
	reqs.push({ key: `event/${s}`, route: "event", qs: s });
	const n = (state.index as IndexedBuild[]).filter(
		(b) => b.hackathon.slug === s,
	).length;
	for (let offset = 0; offset < n; offset += 100) {
		const qs = `hackathon=${s}&limit=100&offset=${offset}`;
		reqs.push({ key: `builds?${qs}`, route: "builds", qs });
	}
}
for (const qs of [
	"winnersOnly=1&limit=100",
	// q on award text: matchedTerms say where a word matched.
	"q=xlm%20prize&hackathon=stellar-hacks-zk&limit=100",
])
	reqs.push({ key: `builds?${qs}`, route: "builds", qs });
for (const id of WINNERS)
	reqs.push({ key: `build/${id}`, route: "build", qs: id });

const results: Record<
	string,
	{ status: number; chars: number; sha256: string }
> = {};

async function call(r: Req): Promise<{ status: number; text: string }> {
	if (r.route === "event") {
		const { GET } = await import("@/app/api/hackathons/[slug]/route");
		const res = await GET(
			new NextRequest(`https://x.test/api/hackathons/${r.qs}`),
			{ params: Promise.resolve({ slug: r.qs }) },
		);
		return { status: res.status, text: await res.text() };
	}
	if (r.route === "build") {
		const { GET } = await import("@/app/api/hackathons/builds/[id]/route");
		const res = await GET(
			new NextRequest(`https://x.test/api/hackathons/builds/${r.qs}`),
			{ params: Promise.resolve({ id: r.qs }) },
		);
		return { status: res.status, text: await res.text() };
	}
	const { GET } = await import("@/app/api/hackathons/builds/route");
	const res = await GET(
		new NextRequest(`https://x.test/api/hackathons/builds?${r.qs}`),
	);
	return { status: res.status, text: await res.text() };
}

describe("replay", () => {
	it("answers every request", async () => {
		vi.stubEnv("VOYAGE_API_KEY", "");
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		if (BODIES) mkdirSync(BODIES, { recursive: true });
		for (const r of reqs) {
			const { status, text } = await call(r);
			results[r.key] = {
				status,
				chars: text.length,
				sha256: createHash("sha256").update(text).digest("hex"),
			};
			if (BODIES)
				writeFileSync(
					join(BODIES, `${r.key.replace(/[^a-z0-9=&,.-]+/gi, "_")}.json`),
					text,
				);
		}
		vi.useRealTimers();
		vi.unstubAllEnvs();
		expect(Object.keys(results)).toHaveLength(reqs.length);
	});
});

afterAll(() => {
	if (!OUT) return;
	writeFileSync(
		OUT,
		`${JSON.stringify({ capturedNow: NOW.toISOString(), results }, null, 1)}\n`,
	);
});
