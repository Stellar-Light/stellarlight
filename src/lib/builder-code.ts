/**
 * What a builder has actually shipped on Stellar, from the repos WE index,
 * keyed by GitHub login. Used by /builders (cards) and /builders/[username]
 * (repo table). Three ways a person connects to a repo/project:
 *   1. they own the repo (repos.owner === login)
 *   2. they declared the repo on Stellar Passport (matched by fullName)
 *   3. a project's GitHub org IS the person (projects.github.orgLogin === login)
 * Contributions to org repos come from the GitHub contributor pass
 * (builders.contributions, filled by scripts/enrich-builder-contributions.ts)
 * and are merged in here when present.
 */
import type { Payload } from "payload";
import { ACTIVE_PROJECT_STATUSES } from "./project-status";

export type CodeRepo = {
	fullName: string;
	url: string;
	stars: number;
	lastCommitAt: string | null;
	commits90d: number;
	projectSlug: string | null;
	projectName: string | null;
	/** how this person connects to the repo */
	via: "owner" | "declared" | "contributor";
	/** commits by this person in the last 12 months (contributor pass only) */
	myCommits12m?: number;
};

export type CodeActivity = {
	repos: CodeRepo[];
	stars: number;
	lastCommitAt: string | null;
	/**
	 * 90-day commits across repos this person OWNS. Contributor repos are
	 * excluded on purpose: a repo's commits90d is everyone's work, and adding
	 * it here credited one contributor with the whole org's output
	 * (0xdevcollins read "318 commits, 90d" against 35 real). See
	 * `contributedCommits12m` for their share of others' repos.
	 */
	commits90d: number;
	/** commits by this person into repos they don't own, last 12 months (contributor pass) */
	contributedCommits12m: number;
	/** slug -> name of the projects this person BUILDS: their own repos, or the project's GitHub org is them */
	projects: Map<string, string>;
	/** slug -> name of projects they only CONTRIBUTE to (org repos they committed to or declared) */
	contributesTo: Map<string, string>;
	/** primary languages across their indexed repos, most common first */
	languages: string[];
};

export type BuilderLike = {
	github_username?: string | null;
	projects?: Array<{
		repos?: Array<{ full_name?: string | null }> | null;
	} | null> | null;
	contributions?: Array<{
		fullName: string;
		commits12m?: number | null;
	}> | null;
};

const empty = (): CodeActivity => ({
	repos: [],
	stars: 0,
	lastCommitAt: null,
	commits90d: 0,
	contributedCommits12m: 0,
	projects: new Map(),
	contributesTo: new Map(),
	languages: [],
});

export async function builderCodeActivity(
	payload: Payload,
	builders: BuilderLike[],
): Promise<Map<string, CodeActivity>> {
	const out = new Map<string, CodeActivity>();
	const logins = builders
		.map((b) => String(b.github_username ?? ""))
		.filter(Boolean);
	if (!logins.length) return out;
	const lower = new Set(logins.map((l) => l.toLowerCase()));
	const get = (k: string) => {
		const e = out.get(k) ?? empty();
		out.set(k, e);
		return e;
	};

	// repos this person named on Passport, or that the contributor pass found
	// keyed by lowercase name for matching; the QUERY uses names as stored, because
	// Payload's `in` is exact-match and "moonlight-protocol/provider-platform"
	// never matched Moonlight-Protocol/provider-platform
	const declared = new Map<
		string,
		{
			login: string;
			via: "declared" | "contributor";
			myCommits12m?: number;
			asStored: string;
		}
	>();
	for (const b of builders) {
		const login = String(b.github_username ?? "").toLowerCase();
		if (!login) continue;
		for (const pr of b.projects ?? []) {
			for (const rp of pr?.repos ?? []) {
				if (rp?.full_name)
					declared.set(String(rp.full_name).toLowerCase(), {
						login,
						via: "declared",
						asStored: String(rp.full_name),
					});
			}
		}
		for (const c of b.contributions ?? []) {
			if (c?.fullName) {
				const k = String(c.fullName).toLowerCase();
				if (!declared.has(k))
					declared.set(k, {
						login,
						via: "contributor",
						myCommits12m: c.commits12m ?? undefined,
						asStored: String(c.fullName),
					});
			}
		}
	}

	const repos = await payload.find({
		collection: "repos",
		where: {
			and: [
				{
					or: [
						{ owner: { in: logins } },
						...(declared.size
							? [
									{
										fullName: {
											in: [...declared.values()].map((d) => d.asStored),
										},
									},
								]
							: []),
					],
				},
				{ tier: { not_equals: "archive" } },
			],
		},
		limit: 5000,
		depth: 0,
		select: {
			owner: true,
			fullName: true,
			url: true,
			projectSlug: true,
			stars: true,
			lastCommitAt: true,
			activitySignals: true,
			primaryLanguage: true,
		},
	} as any);
	const langCount = new Map<string, Map<string, number>>();

	const projectSlugs = new Set<string>();
	for (const r of repos.docs as any[]) {
		const owner = String(r.owner ?? "").toLowerCase();
		const full = String(r.fullName ?? "");
		const d = declared.get(full.toLowerCase());
		const login = lower.has(owner) ? owner : d?.login;
		if (!login) continue;
		const e = get(login);
		const commits90d = Number(r.activitySignals?.commits90d ?? 0);
		const owns = lower.has(owner);
		e.repos.push({
			fullName: full,
			url: r.url || `https://github.com/${full}`,
			stars: Number(r.stars ?? 0),
			lastCommitAt: r.lastCommitAt ?? null,
			commits90d,
			projectSlug: r.projectSlug ?? null,
			projectName: null,
			via: owns ? "owner" : (d?.via ?? "declared"),
			myCommits12m: owns ? undefined : d?.myCommits12m,
		});
		e.stars += Number(r.stars ?? 0);
		// Only their own repos' activity goes under their name. A repo they
		// merely committed to counts through myCommits12m — their share, not
		// the org's total.
		if (owns) e.commits90d += commits90d;
		else e.contributedCommits12m += Number(d?.myCommits12m ?? 0);
		if (r.primaryLanguage) {
			const m = langCount.get(login) ?? new Map<string, number>();
			m.set(
				String(r.primaryLanguage),
				(m.get(String(r.primaryLanguage)) ?? 0) + 1,
			);
			langCount.set(login, m);
		}
		if (r.lastCommitAt && (!e.lastCommitAt || r.lastCommitAt > e.lastCommitAt))
			e.lastCommitAt = r.lastCommitAt;
		if (r.projectSlug) {
			// contributing to (or naming) a project's repo is not building that project
			(lower.has(owner) ? e.projects : e.contributesTo).set(
				String(r.projectSlug),
				"",
			);
			projectSlugs.add(String(r.projectSlug));
		}
	}

	// project names + projects whose GitHub org is the person
	const projs = await payload.find({
		collection: "projects",
		where: {
			and: [
				{ status: { in: [...ACTIVE_PROJECT_STATUSES] } },
				{
					or: [
						{ "github.orgLogin": { in: logins } },
						...(projectSlugs.size ? [{ slug: { in: [...projectSlugs] } }] : []),
					],
				},
			],
		},
		limit: 2000,
		depth: 0,
		select: { name: true, slug: true, github: true },
	} as any);
	const nameOf = new Map<string, string>();
	for (const pj of projs.docs as any[]) {
		nameOf.set(String(pj.slug), String(pj.name));
		const org = String(pj.github?.orgLogin ?? "").toLowerCase();
		if (org && lower.has(org))
			get(org).projects.set(String(pj.slug), String(pj.name));
	}
	for (const [login, e] of out) {
		e.languages = [...(langCount.get(login) ?? new Map()).entries()]
			.sort((a, b) => b[1] - a[1])
			.map(([l]) => l);
		for (const m of [e.projects, e.contributesTo]) {
			for (const [slug, name] of m) {
				if (name) continue;
				const n = nameOf.get(slug);
				if (n) m.set(slug, n);
				else m.delete(slug); // inactive/unknown project: don't advertise it
			}
		}
		// a project they build is not also one they merely contribute to
		for (const slug of e.projects.keys()) e.contributesTo.delete(slug);
		for (const r of e.repos)
			r.projectName = r.projectSlug
				? (nameOf.get(r.projectSlug) ?? null)
				: null;
		// most recently touched first
		e.repos.sort(
			(a, b) =>
				Date.parse(b.lastCommitAt ?? "0") - Date.parse(a.lastCommitAt ?? "0"),
		);
	}
	return out;
}

export function ago(iso: string | null | undefined): string | null {
	if (!iso) return null;
	const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
	if (!Number.isFinite(d)) return null;
	// Short, capitalised units — these sit in stat cells and table columns
	// where "10 days ago" breaks the baseline (2026-08-22).
	if (d <= 0) return "Today";
	if (d < 30) return `${d}D`;
	if (d < 365) return `${Math.floor(d / 30)}M`;
	return `${Math.floor(d / 365)}Y`;
}

/** Prose form for sentences: "today" / "10D ago". */
export function agoSentence(iso: string | null | undefined): string | null {
	const a = ago(iso);
	if (!a) return null;
	return a === "Today" ? "today" : `${a} ago`;
}
