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

/** Lowercase with accents folded, never deleted: José is jose, not jos
 * (sls-111). Canonical decomposition, the rule hackathon-build-links'
 * folded() uses. */
const fold = (name: string) =>
	name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Spaceless lowercase alnum — EQUALITY ONLY. Never use for containment:
 * word seams vanish, so "Soroban Disassembler" CONTAINS "band"
 * (soro·band·issassembler) — the 2026-08-12 18-row award poisoning. */
export function normSpaceless(name: string): string {
	return fold(name).replace(/[^a-z0-9]/g, "");
}

/** Lowercase with runs of non-alnum collapsed to single spaces — the form
 * token-boundary rules operate on. */
export function normSpaced(name: string): string {
	return fold(name)
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

/** A directory name under three letters is a word inside too many titles to
 * identify one ("Op"); three still join (the BWB, CTX and DIA rows). */
const MIN_PREFIX_NAME = 3;

/**
 * The partial matcher: the single best row for an official title, or
 * undefined. Candidates are rows whose name passes titlePrefixMatch;
 * spaceless containment only picks them, so a rejected candidate never ends
 * the search ("velo" inside "de·velo·pment" hid Rumble Fish's awards,
 * sls-111). The best candidate shares the longest prefix with the title, and
 * a tie for it is no match: the first hit in row order is not an identity.
 * `identityOf` says which rows are one project (a lineage shadow and its
 * canonical row), so those never tie with each other.
 */
export function findTitlePrefixMatch<T extends { name?: unknown }>(
	title: string,
	rows: Iterable<T>,
	onSkip?: (row: T, why: string) => void,
	identityOf: (row: T) => unknown = (row) => row,
): T | undefined {
	const norm = normSpaceless(title);
	const titleLen = normSpaced(title).length;
	let best: T | undefined;
	let bestLen = 0;
	let tied = false;
	for (const row of rows) {
		const name = String(row.name ?? "");
		const key = normSpaceless(name);
		if (!key || (!key.includes(norm) && !norm.includes(key))) continue;
		if (key.length < MIN_PREFIX_NAME) {
			onSkip?.(row, "name under three letters");
			continue;
		}
		if (!titlePrefixMatch(title, name)) {
			onSkip?.(row, "not title-prefix");
			continue;
		}
		// the shared prefix: the shorter of the two names
		const len = Math.min(titleLen, normSpaced(name).length);
		if (len > bestLen) {
			best = row;
			bestLen = len;
			tied = false;
		} else if (
			len === bestLen &&
			best !== undefined &&
			identityOf(row) !== identityOf(best)
		)
			tied = true;
	}
	if (tied && best !== undefined) {
		onSkip?.(best, "tied with another row");
		return undefined;
	}
	return best;
}
