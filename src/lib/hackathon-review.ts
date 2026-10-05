/**
 * Review a hackathon submission from a link: Copilot's "get feedback on your
 * own project", answered from evidence and with no sign-in.
 *
 * A composite over what already exists; it computes nothing new:
 *   - the submission's own stored facts (stack, categories, repo activity,
 *     the project it became, that project's status and SCF funding);
 *   - the submissions closest in meaning to it, by its own embedding;
 *   - the SCF pitch view over its summary (live round, funded peers, the
 *     vet-idea competitors, maturity, prior art and supply gap);
 *   - checks, each one a fact with its evidence. No verdict and no prose:
 *     the builder decides what matters for their pitch.
 */
import type { Payload } from "payload";
import { distribution, KEPT_BUILDING_DAYS } from "@/lib/hackathon-analytics";
import {
	parseBuildId,
	type REVIEW_CHECK_IDS,
	type REVIEW_RESOLVED_BY,
	repoFullNameOf,
} from "@/lib/hackathon-build-links";
import { similarToBuild } from "@/lib/hackathon-build-semantic";
import {
	type BuildDetail,
	buildDetailFromStored,
	type IndexedBuild,
	readProjectFacts,
} from "@/lib/hackathon-builds";
import { buildScfPitch, type ScfPitchReport } from "@/lib/scf-pitch";
import type { HackathonBuild } from "@/payload-types";

/** A write-up shorter than this gives a reviewer little to go on. */
const SHORT_WRITE_UP = 600;
const DAY = 86_400_000;

/** Which stored submission a link names: a DoraHacks buidl link or id, or a
 * GitHub repo (owner/name or its URL), resolved to that repo's submission.
 * A repo submitted more than once resolves to its placed entry, then the
 * newest. null when the link names no stored submission. */
export function resolveReviewLink(
	link: string,
	index: IndexedBuild[],
): {
	buildId: string;
	resolvedBy: (typeof REVIEW_RESOLVED_BY)[number];
	others: number;
} | null {
	const id = parseBuildId(link);
	if (id && index.some((b) => b.id === id))
		return { buildId: id, resolvedBy: "submission", others: 0 };
	const s = link.trim();
	const repo =
		repoFullNameOf(s) ??
		(/^[\w.-]+\/[\w.-]+$/.test(s)
			? s.toLowerCase().replace(/\.git$/, "")
			: null);
	if (!repo) return null;
	const hits = index
		.filter((b) => repoFullNameOf(b.githubUrl) === repo)
		.sort(
			(a, b) =>
				Number(b.isWinner) - Number(a.isWinner) ||
				(b.hackathon.endedAt ?? "").localeCompare(a.hackathon.endedAt ?? ""),
		);
	return hits.length
		? { buildId: hits[0].id, resolvedBy: "repo", others: hits.length - 1 }
		: null;
}

export interface ReviewCheck {
	id: (typeof REVIEW_CHECK_IDS)[number];
	/** true = in place, false = missing or a warning sign, null = could not
	 * be checked (never read as false). */
	ok: boolean | null;
	finding: string;
}

/** Mechanical checks over the submission's own facts. */
export function reviewChecks(d: BuildDetail, now = Date.now()): ReviewCheck[] {
	const out: ReviewCheck[] = [];
	out.push(
		d.repo
			? { id: "repo", ok: true, finding: `Repo linked: github.com/${d.repo}.` }
			: {
					id: "repo",
					ok: false,
					finding:
						"No repository linked on the submission (or only an account), so nothing about the code can be checked.",
				},
	);
	const end = Date.parse(d.hackathon.endedAt ?? "");
	const mark = end + KEPT_BUILDING_DAYS * DAY;
	if (d.repoMissingAt && (!d.stackReadAt || d.repoMissingAt > d.stackReadAt))
		out.push({
			id: "activity",
			ok: false,
			finding: `The repo answered not found on ${d.repoMissingAt.slice(0, 10)}: deleted, renamed or private.`,
		});
	else if (!d.activity)
		out.push({
			id: "activity",
			ok: null,
			finding: "Repo activity not read yet.",
		});
	else if (d.activity.archived)
		out.push({
			id: "activity",
			ok: false,
			finding: "The repo is archived on GitHub.",
		});
	else {
		const last = Date.parse(d.activity.lastCommitAt ?? "");
		const lastDay = d.activity.lastCommitAt?.slice(0, 10) ?? "unknown";
		if (Number.isFinite(last) && Number.isFinite(end) && last >= mark)
			out.push({
				id: "activity",
				ok: true,
				finding: `Commits continued ${KEPT_BUILDING_DAYS}+ days after the event (last on ${lastDay}).`,
			});
		else if (Number.isFinite(end) && now < mark)
			out.push({
				id: "activity",
				ok: null,
				finding: `The event ended under ${KEPT_BUILDING_DAYS} days ago; last commit ${lastDay}.`,
			});
		else
			out.push({
				id: "activity",
				ok: false,
				finding: `No commits on the submitted repo ${KEPT_BUILDING_DAYS}+ days after the event (last on ${lastDay}). If the work moved to another repo, link that one.`,
			});
	}
	out.push(
		!d.stack
			? {
					id: "stack",
					ok: null,
					finding: "The repo's manifests were not read.",
				}
			: d.stack.length
				? {
						id: "stack",
						ok: true,
						finding: `Declares ${d.stack.length} Stellar package(s): ${d.stack.join(", ")}.`,
					}
				: {
						id: "stack",
						ok: false,
						finding:
							"Its package.json and Cargo.toml files declare no Stellar package, so the Stellar integration is not visible from the manifests.",
					},
	);
	if (d.project === undefined)
		out.push({
			id: "directory",
			ok: null,
			finding: "Directory link not checked.",
		});
	else if (!d.project)
		out.push({
			id: "directory",
			ok: false,
			finding:
				"Not linked to a project in the Stellar directory (no project lists the repo, and the demo site is no project's website). A listing is how reviewers and agents find it.",
		});
	else {
		const p = d.project;
		out.push({
			id: "directory",
			ok: true,
			finding: `Became the directory project ${p.name} (${p.slug}), linked by ${p.basis ?? "repo"}.`,
		});
		if (p.status !== undefined)
			out.push({
				id: "status",
				ok: p.status == null ? null : p.status !== "Inactive",
				finding: `Directory status today: ${p.status ?? "unknown"}.`,
			});
		if (p.scfAwarded !== undefined)
			out.push({
				id: "scf",
				ok: p.scfAwarded,
				finding: p.scfAwarded
					? "The project has SCF funding."
					: "The project has no SCF award on record.",
			});
	}
	const w = d.writeUp?.length ?? 0;
	out.push(
		d.writeUpReadAt == null
			? {
					id: "writeUp",
					ok: null,
					finding: "The submission page was not read.",
				}
			: {
					id: "writeUp",
					ok: w >= SHORT_WRITE_UP,
					finding:
						w >= SHORT_WRITE_UP
							? `Full write-up of ${w} characters.`
							: `The write-up is ${w} characters: little for a reviewer to go on.`,
				},
	);
	out.push(
		d.links.demo || d.links.video
			? {
					id: "demo",
					ok: true,
					finding: `Has ${[d.links.demo && "a demo", d.links.video && "a video"].filter(Boolean).join(" and ")}.`,
				}
			: {
					id: "demo",
					ok: false,
					finding: "No demo or video link on the submission.",
				},
	);
	return out;
}

export interface HackathonReview {
	link: string;
	resolvedBy: (typeof REVIEW_RESOLVED_BY)[number];
	/** Other stored submissions of the same repo, not reviewed here. */
	otherSubmissionsOfRepo: number;
	submission: BuildDetail;
	checks: ReviewCheck[];
	/** The submissions closest in meaning, by this one's own embedding. */
	similar: {
		checked: boolean;
		builds: Array<{
			id: string;
			name: string;
			hackathon: string;
			isWinner: boolean;
			placement: string | null;
			similarity: number;
			project?: IndexedBuild["project"];
		}>;
	};
	/** How crowded its top category is across every stored submission. */
	categoryContext: {
		type: string;
		submissions: number;
		winners: number;
		shareOfSubmissions: number | null;
	} | null;
	/** The SCF pitch view over its summary: live round, funded peers, the
	 * vet-idea competitors, maturity, prior art and supply gap, and angles. */
	pitch: ScfPitchReport;
}

export async function buildHackathonReview(
	payload: Payload,
	link: string,
	index: IndexedBuild[],
): Promise<HackathonReview | null> {
	const subject = resolveReviewLink(link, index);
	if (!subject) return null;
	const res = await payload.find({
		collection: "hackathon-builds",
		where: {
			and: [
				{ buildId: { equals: subject.buildId } },
				{ hiddenUpstream: { not_equals: true } },
			],
		},
		limit: 1,
		depth: 0,
		select: { embedding: false, embeddingTextHash: false },
	});
	const doc = res.docs[0] as HackathonBuild | undefined;
	if (!doc) return null;
	const facts = doc.projectSlug
		? (await readProjectFacts(payload, [doc.projectSlug]))?.get(doc.projectSlug)
		: undefined;
	const submission = buildDetailFromStored(doc, facts);
	const idea = [submission.name, submission.summary].filter(Boolean).join(". ");
	const [similar, pitch] = await Promise.all([
		similarToBuild(subject.buildId, { limit: 10 }),
		buildScfPitch(payload, idea),
	]);
	const byId = new Map(index.map((b) => [b.id, b]));
	const top = submission.categories?.[0]?.type;
	const cat = top ? distribution(index, "category", { value: top }) : null;
	return {
		link,
		resolvedBy: subject.resolvedBy,
		otherSubmissionsOfRepo: subject.others,
		submission,
		checks: reviewChecks(submission),
		similar: {
			checked: similar !== null,
			builds: [...(similar ?? new Map<string, number>())]
				.map(([id, s]) => ({ b: byId.get(id), s }))
				.filter((x): x is { b: IndexedBuild; s: number } => !!x.b)
				.slice(0, 5)
				.map(({ b, s }) => ({
					id: b.id,
					name: b.name,
					hackathon: b.hackathon.title,
					isWinner: b.isWinner,
					placement: b.hackathonPlacement,
					similarity: Math.round(s * 1000) / 1000,
					...(b.project !== undefined ? { project: b.project } : {}),
				})),
		},
		categoryContext:
			top && cat
				? {
						type: top,
						submissions: cat.values[0]?.builds ?? 0,
						winners: cat.values[0]?.winners ?? 0,
						shareOfSubmissions: cat.values[0]?.share ?? null,
					}
				: null,
		pitch,
	};
}
