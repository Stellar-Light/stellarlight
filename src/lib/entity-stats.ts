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

	return {
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
