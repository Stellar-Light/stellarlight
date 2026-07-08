/**
 * Code-symbol extraction — pure, offline, same idiom as code-signals.ts.
 *
 * The gap this closes (gist "honest gap 3", structure ≠ semantics): the index
 * knew a repo HAS a deployable contract with auth+storage, but not WHAT it
 * implements — "find a Soroban escrow implementation" matched on README luck.
 * The scanner already fetches a repo's actual Rust sources; this extracts the
 * public API surface (fn/struct/enum/trait names) so search can match code
 * CONTENT: `release_escrow`, `EscrowContract`, `claim_milestone` are stronger
 * evidence a repo implements escrow than any description sentence.
 *
 * Precision rules:
 *  - `pub` items only — the deliberate API surface, not internals;
 *  - generic Rust/Soroban plumbing names are dropped (new/default/from/...),
 *    they'd make every contract match every query;
 *  - .rs sources only (Cargo.toml/tests are skipped — test fns aren't the API);
 *  - deduped case-insensitively, capped, in file order (the fetch unit sorts
 *    sources biggest-first, so the cap keeps symbols from the real logic).
 */

export interface SymbolBlob {
	path: string;
	text: string | null;
}

/** Universal Rust/trait plumbing — present in nearly every crate, zero
 * discriminating signal for "what does this implement". */
const NOISE = new Set([
	"new",
	"default",
	"from",
	"into",
	"try_from",
	"try_into",
	"clone",
	"fmt",
	"eq",
	"ne",
	"cmp",
	"hash",
	"drop",
	"deref",
	"next",
	"len",
	"is_empty",
	"as_ref",
	"as_mut",
	"borrow",
	"to_string",
	"get",
	"set",
	"init",
	"main",
	"error",
	"contract",
	"client",
	"test",
]);

const MAX_SYMBOLS = 60;

// pub fn / pub(crate) fn / pub async fn NAME(  — and pub struct/enum/trait NAME
const FN_RE = /\bpub(?:\s*\([^)]*\))?\s+(?:async\s+)?fn\s+([a-z_][a-z0-9_]*)/g;
const TYPE_RE =
	/\bpub(?:\s*\([^)]*\))?\s+(?:struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/g;

const isTestPath = (p: string) =>
	/(^|\/)(tests?|testing|test[-_]?utils?|fixtures?|mocks?|benches)\//i.test(
		p,
	) ||
	/_tests?(\/|\.rs$)/i.test(p) ||
	/(^|\/)tests?\.rs$/i.test(p);

/** Extract the public code-symbol surface from a repo's fetched sources. */
export function extractCodeSymbols(blobs: SymbolBlob[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const add = (name: string) => {
		const key = name.toLowerCase();
		if (name.length < 4 || NOISE.has(key) || seen.has(key)) return;
		seen.add(key);
		if (out.length < MAX_SYMBOLS) out.push(name);
	};
	for (const b of blobs) {
		if (out.length >= MAX_SYMBOLS) break;
		if (!b.text || !b.path.toLowerCase().endsWith(".rs") || isTestPath(b.path))
			continue;
		for (const m of b.text.matchAll(FN_RE)) add(m[1]);
		for (const m of b.text.matchAll(TYPE_RE)) add(m[1]);
	}
	return out;
}

/** Search-normalized form of a symbol list: snake_case and camelCase split
 * into words so word-boundary matching works ("escrow" ⇢ "release_escrow" /
 * "EscrowContract"). Regex \b treats `_` as a word char, so without this a
 * symbol hit could never fire. */
export function symbolsHaystack(symbols: unknown): string {
	if (!Array.isArray(symbols)) return "";
	return symbols
		.filter((s): s is string => typeof s === "string")
		.join(" ")
		.replace(/_/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.toLowerCase();
}
