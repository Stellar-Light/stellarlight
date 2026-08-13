/**
 * Shared identity/matching primitives — ONE home for the rules every writer
 * kept reinventing (SYNTHESIS-2026-08-12 S2: five-plus incidents in the
 * identity family — case-variant twin repos, substring traps, the spaceless
 * matcher that wrote 18 rows of other projects' award data).
 *
 * The names say what each normalization is SAFE for. The unit tests carry
 * every past trap as a fixture, so the next trap becomes a failing test
 * instead of a production incident.
 */

/** Spaceless lowercase alnum — EQUALITY ONLY. Never use for containment:
 * word seams vanish, so "Soroban Disassembler" CONTAINS "band"
 * (soro·band·issassembler) — the 2026-08-12 18-row award poisoning. */
export function normSpaceless(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Lowercase with runs of non-alnum collapsed to single spaces — the form
 * token-boundary rules operate on. */
export function normSpaced(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/** Strip parenthetical/whitespace noise from official titles:
 * "Soroban Optimistic Oracle  (SOO) " → "Soroban Optimistic Oracle". */
export function cleanTitle(title: string): string {
	return title.replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

/** Stem a trailing listing hash: "warp-drive-7tk" → "warp-drive". */
export function stemSlugHash(slug: string): string {
	return String(slug || "").replace(/-[a-z0-9]{2,5}$/i, "");
}

/**
 * The partial-match rule that survived the 2026-08-12 full-corpus audit:
 * one side must equal the other OR start with it at a TOKEN boundary.
 * "Band Protocol" ↔ "Band" ✓ · "DIA Oracles" ↔ "DIA" ✓ ·
 * "Basilic — Stablecoin Rails…" ↔ "Rails" ✗ (word-boundary is not enough
 * for generic names) · tagline mentions ✗. Legit tail matches
 * ("…by Gateway.fm") belong in explicit overrides, never here.
 */
export function titlePrefixMatch(a: string, b: string): boolean {
	const as = normSpaced(a);
	const bs = normSpaced(b);
	if (!as || !bs) return false;
	const [short, long] = as.length <= bs.length ? [as, bs] : [bs, as];
	return long === short || long.startsWith(`${short} `);
}
