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
	commits90d: number;
	/** slug -> name of the projects this person is connected to */
	projects: Map<string, string>;
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
	projects: new Map(),
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
	const declared = new Map<
		string,
		{ login: string; via: "declared" | "contributor"; myCommits12m?: number }
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
							? [{ fullName: { in: [...declared.keys()] } }]
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
		},
	} as any);

	const projectSlugs = new Set<string>();
	for (const r of repos.docs as any[]) {
		const owner = String(r.owner ?? "").toLowerCase();
		const full = String(r.fullName ?? "");
		const d = declared.get(full.toLowerCase());
		const login = lower.has(owner) ? owner : d?.login;
		if (!login) continue;
		const e = get(login);
		const commits90d = Number(r.activitySignals?.commits90d ?? 0);
		e.repos.push({
			fullName: full,
			url: r.url || `https://github.com/${full}`,
			stars: Number(r.stars ?? 0),
			lastCommitAt: r.lastCommitAt ?? null,
			commits90d,
			projectSlug: r.projectSlug ?? null,
			projectName: null,
			via: lower.has(owner) ? "owner" : (d?.via ?? "declared"),
			myCommits12m: lower.has(owner) ? undefined : d?.myCommits12m,
		});
		e.stars += Number(r.stars ?? 0);
		e.commits90d += commits90d;
		if (r.lastCommitAt && (!e.lastCommitAt || r.lastCommitAt > e.lastCommitAt))
			e.lastCommitAt = r.lastCommitAt;
		if (r.projectSlug) {
			e.projects.set(String(r.projectSlug), "");
			projectSlugs.add(String(r.projectSlug));
		}
	}

	// project names + projects whose GitHub org is the person
	const projs = await payload.find({
		collection: "projects",
		where: {
			and: [
				{ status: { in: ["Development", "Pre-Release", "Live"] } },
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
	for (const e of out.values()) {
		for (const [slug, name] of e.projects) {
			if (name) continue;
			const n = nameOf.get(slug);
			if (n) e.projects.set(slug, n);
			else e.projects.delete(slug); // inactive/unknown project: don't advertise it
		}
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
	if (d <= 0) return "today";
	if (d === 1) return "yesterday";
	if (d < 30) return `${d}d ago`;
	if (d < 365) return `${Math.floor(d / 30)}mo ago`;
	return `${Math.floor(d / 365)}y ago`;
}
