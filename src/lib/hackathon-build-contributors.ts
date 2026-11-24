/**
 * Who contributed to a stored hackathon build's repo, and the builds a
 * builder row shows from it.
 *
 * The sync lane (scripts/sync-hackathon-builds.ts) reads each build repo's
 * human contributors from GitHub and stores them, lowercased, on the build
 * row with the read date. /api/builders and the profile page join a login to
 * those lists. A contributor has commits on the repo's default branch; that
 * is not the same as a team member who entered the event.
 */
import type { Payload } from "payload";
import { overlayWinnerOf } from "@/data/winner-overlay";
import { CURATED_BUILD_ID } from "@/lib/hackathon-build-links";

/** AI coding agents GitHub lists as plain User accounts. */
const AGENT_LOGINS = new Set([
	"claude",
	"codex",
	"copilot",
	"cursoragent",
	"v0",
]);

/** A person: not a GitHub App or bot account (type), not a `[bot]` login,
 * not an account named as a bot or agent (`ebuks-bot`, `openhands-agent`,
 * `emergent-agent-e1`), not a known AI coding agent. */
export function isHumanContributor(
	login: string,
	type?: string | null,
): boolean {
	const l = login.toLowerCase();
	if (type && type !== "User") return false;
	if (l.endsWith("[bot]") || AGENT_LOGINS.has(l)) return false;
	return !/(^|[-_])(bot|agent)([-_]|$)/.test(l);
}

/** The human logins in a contributor or commit-author list: lowercased,
 * first seen first, each once. An author GitHub links to no account is
 * left out. */
export function humanLogins(
	list: Array<{ login?: string | null; type?: string | null } | null>,
): string[] {
	const out = new Set<string>();
	for (const c of list)
		if (c?.login && isHumanContributor(c.login, c.type))
			out.add(c.login.toLowerCase());
	return [...out];
}

/** Why a build is on a builder row: one basis today, the list the spec
 * serves as the enum. */
export const BUILDER_BUILD_BASES = ["contributor"] as const;

/** One stored build a login is a contributor to, as /api/builders serves it.
 * Names follow /api/hackathons/builds rows: `id` is the build id there. */
export interface BuilderHackathonBuild {
	id: string;
	name: string;
	hackathon: string;
	hackathonSlug: string;
	endedAt: string | null;
	placement: string | null;
	isWinner: boolean;
	url: string;
	basis: (typeof BUILDER_BUILD_BASES)[number];
	contributorCount: number;
	contributorsReadAt: string;
}

export interface ContributorBuildRow {
	buildId: string;
	name: string;
	hackathonTitle: string;
	hackathonSlug: string;
	endedAt?: string | null;
	placement?: string | null;
	isWinner?: boolean | null;
	url: string;
	contributors?: string[] | null;
	contributorsReadAt?: string | null;
}

/** Each login's builds from the stored rows: newest event first, then by
 * name (the order is not a rank). A row counts only once its contributors
 * were read. One entry per event, keyed as the builds index keys a build: a
 * DoraHacks resubmission under a new id with the same name in the same event
 * is one build there and one here. */
export function contributorBuildsByLogin(
	rows: ContributorBuildRow[],
	logins: string[],
): Map<string, BuilderHackathonBuild[]> {
	const want = new Set(logins.map((l) => l.toLowerCase()));
	const out = new Map<string, BuilderHackathonBuild[]>();
	const seen = new Set<string>();
	// A placed entry of a resubmitted build wins its key.
	const ordered = [...rows].sort(
		(a, b) => Number(!!b.isWinner) - Number(!!a.isWinner),
	);
	for (const r of ordered) {
		if (!r.contributorsReadAt || !r.contributors?.length) continue;
		const key = CURATED_BUILD_ID.test(r.buildId)
			? `${r.hackathonSlug}::${r.buildId}`
			: `${r.hackathonSlug}::${r.name.trim().toLowerCase()}`;
		// The same off-DoraHacks win every reader applies (winner-overlay.ts).
		const won = r.isWinner ? null : overlayWinnerOf(r.buildId, r.hackathonSlug);
		for (const login of new Set(r.contributors)) {
			if (!want.has(login) || seen.has(`${login}|${key}`)) continue;
			seen.add(`${login}|${key}`);
			const list = out.get(login) ?? [];
			list.push({
				id: r.buildId,
				name: r.name,
				hackathon: r.hackathonTitle,
				hackathonSlug: r.hackathonSlug,
				endedAt: r.endedAt ?? null,
				placement: won?.placement ?? r.placement ?? null,
				isWinner: !!r.isWinner || !!won,
				url: r.url,
				basis: "contributor",
				contributorCount: r.contributors.length,
				contributorsReadAt: r.contributorsReadAt,
			});
			out.set(login, list);
		}
	}
	for (const list of out.values())
		list.sort(
			(a, b) =>
				(b.endedAt ?? "").localeCompare(a.endedAt ?? "") ||
				a.name.localeCompare(b.name),
		);
	return out;
}

/** The served builds each login contributed to, by lowercased login. Throws
 * when the read fails: the caller serves null (could not check), never []. */
export async function readContributorBuilds(
	payload: Payload,
	logins: string[],
): Promise<Map<string, BuilderHackathonBuild[]>> {
	const lower = [...new Set(logins.map((l) => l.toLowerCase()))].filter(
		Boolean,
	);
	if (!lower.length) return new Map();
	const res = await payload.find({
		collection: "hackathon-builds",
		where: {
			and: [
				{ hiddenUpstream: { not_equals: true } },
				// A repo held for malware can name anyone as an author (commit
				// emails are not verified): it credits no one.
				{ securityHeld: { not_equals: true } },
				// Exact element match on the stored lowercased logins.
				{ contributors: { in: lower } },
			],
		},
		pagination: false,
		depth: 0,
		// No repo fields: the held-repo read hook has nothing to withhold.
		select: {
			buildId: true,
			name: true,
			hackathonTitle: true,
			hackathonSlug: true,
			endedAt: true,
			placement: true,
			isWinner: true,
			url: true,
			contributors: true,
			contributorsReadAt: true,
		},
	});
	return contributorBuildsByLogin(
		res.docs as unknown as ContributorBuildRow[],
		lower,
	);
}
