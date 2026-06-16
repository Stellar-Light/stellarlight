/**
 * Quality grade (0-100) for a code reference — the "grade certain repos as
 * better references" artifact Raph asked for. Fuses three things only
 * StellarLight can combine:
 *   - freshness  (last commit recency)
 *   - traction   (stars, log-scaled)
 *   - authority  (hackathon-winner + SCF-funded + owning-project prominence)
 * Archived/fork repos are down-weighted. Computed at enrich time and stored as
 * `repoScore`; /api/repos/search ranks by it so an agent searching "zk" gets
 * the strongest existing references first, not a flat keyword dump.
 */

export interface RepoGradeInput {
	lastCommitAt?: string | Date | null;
	stargazerCount?: number | null;
	isFork?: boolean;
	isArchived?: boolean;
	hackathonWinner?: boolean; // owning project placed in a hackathon
	scfAwarded?: boolean; // owning project is SCF-funded
	projectProminence?: number; // 0-100 curated prominence of the owning project
	builderReputation?: number; // 0-1, from the owning builder's Stellar Passport (SCF tier / featured / activity)
}

export interface RepoGrade {
	score: number; // 0-100
	label: "high" | "medium" | "low";
	freshness: number; // 0-1
	traction: number; // 0-1
	authority: number; // 0-1
}

const DAY_MS = 86_400_000;

// 1.0 within ~90 days, linearly decaying to 0 by ~2 years stale.
function freshnessOf(lastCommitAt?: string | Date | null): number {
	if (!lastCommitAt) return 0;
	const t = new Date(lastCommitAt).getTime();
	if (!Number.isFinite(t)) return 0;
	const ageDays = (Date.now() - t) / DAY_MS;
	if (ageDays <= 90) return 1;
	if (ageDays >= 730) return 0;
	return 1 - (ageDays - 90) / (730 - 90);
}

// Log-scaled stars, saturating around 1,000 stars → 1.0.
function tractionOf(stars?: number | null): number {
	const s = Math.max(0, stars ?? 0);
	return Math.min(1, Math.log10(s + 1) / 3);
}

export function repoGrade(input: RepoGradeInput): RepoGrade {
	const freshness = freshnessOf(input.lastCommitAt);
	const traction = tractionOf(input.stargazerCount);
	let authority = 0;
	if (input.hackathonWinner) authority += 0.35;
	if (input.scfAwarded) authority += 0.25;
	authority += Math.min(0.4, Math.max(0, input.projectProminence ?? 0) / 250); // prominence 100 → +0.4
	authority += Math.min(0.4, Math.max(0, input.builderReputation ?? 0) * 0.4); // builder rep (Stellar Passport) → up to +0.4
	authority = Math.min(1, authority);

	let composite = 0.4 * freshness + 0.25 * traction + 0.35 * authority;
	if (input.isArchived) composite *= 0.5; // archived = weaker reference
	if (input.isFork) composite *= 0.7; // forks deprioritized
	composite = Math.max(0, Math.min(1, composite));

	const score = Math.round(composite * 100);
	const label = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
	return {
		score,
		label,
		freshness: Math.round(freshness * 100) / 100,
		traction: Math.round(traction * 100) / 100,
		authority: Math.round(authority * 100) / 100,
	};
}
