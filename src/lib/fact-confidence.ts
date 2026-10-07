/**
 * Fact confidence — deterministic, provenance-grounded (roadmap slice 5,
 * SYNTHESIS-2026-08-12; closes the long-pending #87 for FACTS).
 *
 * Distinct from retrieval confidence (src/lib/confidence.ts), which scores
 * "does this row answer your query". THIS scores "how much should you trust
 * this specific fact family on this row", as a pure function of the
 * provenance the fact carries: its basis class and its age. No model, no
 * randomness — the same row serves the same confidence until its provenance
 * changes, so consumers can cache and re-derive it.
 *
 * Basis weights encode the evidence ladder the corpus already uses:
 * a human who checked > the official record we parsed > our own machine
 * observation > a label inherited from a seed source > nothing.
 * Freshness decays stepwise — a verification is worth less as it ages, but
 * never to zero (the basis still happened).
 *
 * Null in, null out: a fact with no recorded provenance gets NO confidence
 * number — absence of evidence is served as null, never as a low score
 * (a low score claims we evaluated it; null says we can't).
 */

export interface FactConfidence {
	/** basisWeight × freshnessFactor, rounded to 2dp. */
	score: number;
	label: "high" | "medium" | "low";
	/** Days since the fact was last verified; null when asOf is unknown. */
	ageDays: number | null;
}

/** The evidence ladder. Keys beyond the stored basis enums cover the
 * machine-observation families whose basis is implied by the pipeline:
 * `code-scan` (our scanner at a pinned commit) and `stellar-toml` (the
 * operator's own published file). */
const BASIS_WEIGHT: Record<string, number> = {
	"human-verified": 1.0,
	"official-record": 0.9,
	"stellar-toml": 0.9,
	"onchain-activity": 0.85,
	"code-scan": 0.85,
	"site-liveness": 0.75,
	"operator-announcement": 0.7,
	"source-inherited": 0.5,
	unverified: 0.25,
};

function freshnessFactor(ageDays: number | null): number {
	if (ageDays === null) return 0.6; // unknown age is NOT fresh
	if (ageDays <= 30) return 1.0;
	if (ageDays <= 90) return 0.9;
	if (ageDays <= 180) return 0.8;
	if (ageDays <= 365) return 0.65;
	return 0.5;
}

export function factConfidence(
	basis: string | null | undefined,
	asOf: string | null | undefined,
	now: Date = new Date(),
): FactConfidence | null {
	const weight = basis ? BASIS_WEIGHT[basis] : undefined;
	if (weight === undefined) return null; // no/unknown provenance → no number
	let ageDays: number | null = null;
	if (asOf) {
		const t = Date.parse(asOf);
		if (!Number.isNaN(t))
			ageDays = Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
	}
	const score = Math.round(weight * freshnessFactor(ageDays) * 100) / 100;
	const label = score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low";
	return { score, label, ageDays };
}
