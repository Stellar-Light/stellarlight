/**
 * Aggregate the rich signals from an entity's linked projects UP to the org.
 *
 * Entities themselves are thin (name, logo, links, a `projects` join), but each
 * linked project carries SCF funding, category, status, and repos. Rolling that
 * up gives every org real substance — total SCF raised, funded-project count,
 * categories built in, code footprint — with zero new ingestion, straight from
 * our own authoritative data. Computed on the fly (only ~46 entities).
 */

export interface EntityStats {
	projectCount: number;
	fundedCount: number;
	totalScfUSD: number;
	/** Distinct SCF rounds this org's projects have won. */
	scfRoundCount: number;
	/** Distinct project categories, most-common first. */
	categories: string[];
	repoCount: number;
	/** Projects currently marked Live. */
	liveCount: number;
	topCategory: string | null;
	/** Names of the linked projects, most prominent first (for summaries). */
	projectNames: string[];
	/** Slugs of the linked projects (to join the repos index). */
	projectSlugs: string[];
	/** Most recent commit across the org's indexed repos, ISO; filled by the caller. */
	lastCommitAt: string | null;
	/** Commits in the last 90 days across the org's indexed repos; filled by the caller. */
	commits90d: number;
}

/**
 * A one-line summary rolled up from what the org has shipped, for the 45 of
 * 46 entities that never wrote a description. Says where it came from, so a
 * reader never mistakes it for the org's own words.
 */
export function entitySummary(name: string, s: EntityStats): string | null {
	if (s.projectCount === 0) return null;
	const list =
		s.projectNames.slice(0, 3).join(", ") +
		(s.projectNames.length > 3 ? ` and ${s.projectNames.length - 3} more` : "");
	const focus = s.categories.slice(0, 2).join(" and ");
	const scf =
		s.totalScfUSD > 0
			? `, ${s.fundedCount} funded by SCF (${formatScf(s.totalScfUSD)}${s.scfRoundCount ? ` across ${s.scfRoundCount} round${s.scfRoundCount === 1 ? "" : "s"}` : ""})`
			: "";
	return `${name} builds ${s.projectCount} project${s.projectCount === 1 ? "" : "s"} on Stellar${focus ? ` in ${focus}` : ""}: ${list}${scf}. Summary from its projects; the team has not written its own yet.`;
}

function formatScf(n: number) {
	if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
	return `$${Math.round(n)}`;
}

// biome-ignore lint/suspicious/noExplicitAny: populated Payload project docs
export function aggregateEntity(entity: any): EntityStats {
	const projects: any[] = (entity?.projects ?? []).filter(
		(p: unknown) => p && typeof p === "object",
	);

	let totalScfUSD = 0;
	let fundedCount = 0;
	let repoCount = 0;
	let liveCount = 0;
	const rounds = new Set<number>();
	const catFreq = new Map<string, number>();

	for (const p of projects) {
		const scf = p.scf ?? {};
		if (scf.awarded) {
			fundedCount++;
			const amt = Number(scf.totalAwarded ?? 0);
			if (Number.isFinite(amt)) totalScfUSD += amt;
			for (const r of scf.awardedRounds ?? []) {
				const n = Number(r);
				if (Number.isFinite(n)) rounds.add(n);
			}
		}
		repoCount += (p.github?.repos ?? []).length;
		if (p.status === "Live") liveCount++;
		if (p.category) catFreq.set(p.category, (catFreq.get(p.category) ?? 0) + 1);
	}

	const categories = [...catFreq.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([c]) => c);

	const byProminence = [...projects].sort(
		(a, b) =>
			Number(b.prominence ?? 0) - Number(a.prominence ?? 0) ||
			String(a.name).localeCompare(String(b.name)),
	);
	return {
		projectNames: byProminence.map((p) => String(p.name)).filter(Boolean),
		projectSlugs: projects.map((p) => String(p.slug)).filter(Boolean),
		lastCommitAt: null,
		commits90d: 0,
		projectCount: projects.length,
		fundedCount,
		totalScfUSD,
		scfRoundCount: rounds.size,
		categories,
		repoCount,
		liveCount,
		topCategory: categories[0] ?? null,
	};
}

/** Compact USD — $145k, $2.4M. */
export function formatUSD(n: number): string {
	if (!n) return "$0";
	if (n >= 1_000_000)
		return `$${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
	if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
	return `$${Math.round(n)}`;
}
