/**
 * A project's own repos, as searchProjects, getLeaderboard and the project
 * page list them, and the pool the gone-repos probe asks GitHub about.
 * Pinned by src/lib/__tests__/project-repos.test.ts and
 * project-repos-surfaces.test.ts.
 *
 * The rule on every surface: a repo marked gone is never LISTED as the
 * project's repo, and every aggregate beside the list (lastActivityAt, stars,
 * issues, commit volume, audit drift) still counts it. GitHub answers 404 for
 * a private repo and a deleted one alike, and a repo going private is not the
 * project stopping.
 *
 * Measured live 2026-11-12: project rows cited 55 repos that GitHub answers
 * 404 for. Two gaps let them through:
 *  - the per-project join dropped the archive tier but not codeScanState
 *    `gone`, which searchRepos and codeReferences already drop (NOT_GONE);
 *  - the probe that writes `gone` read only rows at error/gone, and 56 of the
 *    82 project-linked 404s sat at `scanned`. enrich-repos is upsert-only: a
 *    repo GitHub stops returning is skipped, so its row keeps its projectSlug
 *    and its old lastEnrichedAt forever. A stale stamp puts the row in the
 *    probe's pool; the probe's GitHub read is the verdict.
 */

/** A row the gone-repos probe marked: GitHub answered 404 for the repo. */
export const isGone = (r: { codeScanState?: unknown }) =>
	r.codeScanState === "gone";

export interface ProjectRepoRef {
	fullName: string;
	url: string;
	primaryLanguage: string | null;
	stars: number;
	repoScore: number;
	repoScoreLabel: string | null;
	judgeScore: number | null;
	hackathonWinner: boolean;
	lastCommitAt: string | null;
}

export interface ProjectRepoGroup {
	/** Served as the row's `repos`: the top `cap` rows, never a gone one. */
	repos: ProjectRepoRef[];
	/** The top `cap` rows gone ones included: the set lastActivityAt and the
	 *  audit drift read before gone rows left `repos`. A private or deleted
	 *  repo is not proof the project stopped, so its commits keep counting. */
	activity: ProjectRepoRef[];
	lastActivityAt: string | null;
}

const ref = (r: Record<string, unknown>): ProjectRepoRef => ({
	fullName: String(r.fullName),
	url: (r.url as string) ?? `https://github.com/${r.fullName}`,
	primaryLanguage: (r.primaryLanguage as string) ?? null,
	stars: (r.stars as number) ?? 0,
	repoScore: (r.repoScore as number) ?? 0,
	repoScoreLabel: (r.repoScoreLabel as string) ?? null,
	judgeScore: (r.judgeScore as number) ?? null,
	hackathonWinner: !!r.hackathonWinner,
	lastCommitAt: (r.lastCommitAt as string) ?? null,
});

/** Group repo rows (already sorted by repoScore, best first) by projectSlug. */
export function groupProjectRepos(
	rows: Array<Record<string, unknown>>,
	cap = 5,
): Map<string, ProjectRepoGroup> {
	const out = new Map<string, ProjectRepoGroup>();
	for (const r of rows) {
		const slug = r.projectSlug as string | undefined;
		if (!slug) continue;
		const g = out.get(slug) ?? {
			repos: [],
			activity: [],
			lastActivityAt: null,
		};
		const one = ref(r);
		if (g.activity.length < cap) {
			g.activity.push(one);
			if (
				one.lastCommitAt &&
				(!g.lastActivityAt || one.lastCommitAt > g.lastActivityAt)
			)
				g.lastActivityAt = one.lastCommitAt;
		}
		if (g.repos.length < cap && !isGone(r)) g.repos.push(one);
		out.set(slug, g);
	}
	return out;
}

/** enrich-repos runs at least weekly (Monday 08:00 UTC), so a project-linked
 *  row it has not refreshed for longer than a week plus a day is one the pass
 *  did not derive or could not read. That puts the row in the gone-repos
 *  pool; it is not a verdict. Measured 2026-11-12, the project-linked rows
 *  that day's pass left unrefreshed held all 82 404s and all 16 renames, and
 *  137 repos that still answer 200. */
export const ENRICH_STALE_DAYS = 8;

/** The public repos API query for the gone-repos pool: every row at
 *  error/gone, plus every project-linked row the enrich pass stopped
 *  refreshing. The probe's GitHub read is still the only verdict. */
export function goneRepoCandidateQuery(now: Date): string {
	const cut = new Date(
		now.getTime() - ENRICH_STALE_DAYS * 86_400_000,
	).toISOString();
	return [
		"where[or][0][codeScanState][equals]=error",
		"where[or][1][codeScanState][equals]=gone",
		"where[or][2][and][0][projectSlug][exists]=true",
		`where[or][2][and][1][lastEnrichedAt][less_than]=${cut}`,
	].join("&");
}

/** The project page's GitHub block: every indexed repo of the project, the
 *  gone ones counted in the totals and left out of the list. Null when the
 *  index holds no repo for it. */
export async function loadProjectPageGithub(
	payload: {
		find(args: {
			collection: "repos";
			where: { projectSlug: { equals: string } };
			limit: number;
			depth: number;
			select: Record<string, true>;
		}): Promise<{ docs: unknown[] }>;
	},
	slug: string,
) {
	const res = await payload.find({
		collection: "repos",
		where: { projectSlug: { equals: slug } },
		limit: 100,
		depth: 0,
		select: {
			fullName: true,
			url: true,
			stars: true,
			openIssues: true,
			lastCommitAt: true,
			codeScanState: true,
		},
	});
	const rows = res.docs as Array<Record<string, unknown>>;
	if (!rows.length) return null;
	let lastTs = 0;
	let openIssuesTotal = 0;
	let totalStars = 0;
	for (const r of rows) {
		const t = r.lastCommitAt ? new Date(String(r.lastCommitAt)).getTime() : 0;
		if (t > lastTs) lastTs = t;
		openIssuesTotal += (r.openIssues as number) || 0;
		totalStars += (r.stars as number) || 0;
	}
	const repos = rows
		.filter((r) => !isGone(r))
		.map((r) => {
			const fullName = String(r.fullName ?? "");
			const [owner, ...rest] = fullName.split("/");
			return {
				owner: owner ?? "",
				name: rest.join("/") || fullName,
				url:
					(r.url as string) ??
					(fullName ? `https://github.com/${fullName}` : ""),
				lastCommitAt: (r.lastCommitAt as string) ?? null,
				openIssues: (r.openIssues as number) ?? 0,
				stargazerCount: (r.stars as number) ?? 0,
			};
		});
	return {
		lastActivityAt: lastTs > 0 ? new Date(lastTs).toISOString() : null,
		openIssuesTotal,
		totalStars,
		/** Every indexed repo, gone ones included: the rows the totals add up. */
		repoCount: rows.length,
		repos,
	};
}
