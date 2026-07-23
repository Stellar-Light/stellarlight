/**
 * Shared query-param sanitizers. A cold-consumer audit found every endpoint's
 * `limit` was parsed as `Math.min(Number(raw) || def, max)` — which lets a
 * NEGATIVE limit through (Number("-5") === -5 is truthy), so `limit=-5` fed a
 * slice and returned `total - 5` rows instead of erroring or clamping. And an
 * over-max value was only clamped on some routes.
 *
 * clampLimit: absent / non-numeric / < 1 -> default; otherwise floor + clamp
 * into [1, max]. Deterministic and safe to slice with.
 */
export function clampLimit(
	raw: string | null,
	def: number,
	max: number,
): number {
	const n = Math.floor(Number(raw));
	if (!Number.isFinite(n) || n < 1) return def;
	return Math.min(n, max);
}

/** Pagination offset: absent / negative / non-numeric -> 0. */
export function clampOffset(raw: string | null): number {
	const n = Math.floor(Number(raw));
	if (!Number.isFinite(n) || n < 0) return 0;
	return n;
}

/** Parse a boolean-ish query param: 1/true/yes/on (case-insensitive) -> true. */
export function boolParam(raw: string | null): boolean {
	if (!raw) return false;
	const v = raw.toLowerCase().trim();
	return v === "1" || v === "true" || v === "yes" || v === "on";
}

/** The value vocabularies strictBoolParam accepts — exported so 400 responses
 * can echo the accepted forms machine-readably. */
export const BOOL_TRUE_VALUES = ["1", "true", "yes", "on"] as const;
export const BOOL_FALSE_VALUES = ["0", "false", "no", "off"] as const;

/**
 * STRICT boolean query-param parse (sls-040 residual / Engine E
 * invalid-accepted class): `boolParam` silently coerces any unrecognized
 * value to `false`, so `?accepting=__bogus__` returned an unfiltered 200 and
 * the caller believed the filter applied. This variant distinguishes the
 * three honest cases so routes can 400 on garbage:
 *
 *   absent / empty  -> false      (param not supplied)
 *   1/true/yes/on   -> true       (case-insensitive)
 *   0/false/no/off  -> false      (explicit off)
 *   anything else   -> "invalid"  (route should 400 with the accepted forms)
 */
export function strictBoolParam(raw: string | null): boolean | "invalid" {
	if (!raw) return false;
	const v = raw.toLowerCase().trim();
	if (!v) return false;
	if ((BOOL_TRUE_VALUES as readonly string[]).includes(v)) return true;
	if ((BOOL_FALSE_VALUES as readonly string[]).includes(v)) return false;
	return "invalid";
}

/**
 * Field selection (?fields=name,slug,score) — response-row projection so
 * agents fetch only what they need (projects/search rows carry TVL/onchain/
 * routes/repos blocks a routing query never reads).
 *
 * Rules: comma-split, trimmed, case-insensitive; each row's identity keys
 * are always kept (so a projected row still joins back to its record);
 * unknown names are ignored, never 400 — field names churn as the schema
 * grows, and a caller naming a renamed field must degrade, not break
 * (additive-contract ethos; enum VALUES still 400 elsewhere). Nested
 * objects are whole-key selections — no dot-paths in v1. meta is a sibling
 * of the rows array and is never projected.
 */
const FIELDS_ALWAYS_KEEP = new Set([
	"id",
	"slug",
	"fullName",
	"githubUsername",
	"url",
	"source",
]);

/** Parse ?fields= → lowercased name Set, or null when absent/empty (= full row). */
export function parseFields(raw: string | null): Set<string> | null {
	if (!raw) return null;
	const names = raw
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean);
	return names.length ? new Set(names) : null;
}

/** Project one response row to the requested top-level keys. */
export function pickFields<T extends object>(
	row: T,
	wanted: Set<string> | null,
): Partial<T> {
	if (!wanted) return row;
	const out: Record<string, unknown> = {};
	for (const k of Object.keys(row)) {
		if (FIELDS_ALWAYS_KEEP.has(k) || wanted.has(k.toLowerCase())) {
			out[k] = (row as Record<string, unknown>)[k];
		}
	}
	return out as Partial<T>;
}

/**
 * Unknown query params, disclosed rather than silently dropped.
 *
 * A param a route never reads is dropped without a trace: the caller filtered,
 * the server didn't, and the plausible unfiltered list reads as filtered
 * (`?country=NG`, `?sep=24`, `?slug=boss-pay`). /api/projects/search hit this
 * in the 2026-07-11 audit and answered it with `meta.warnings` rather than a
 * 400, because the contract is ADDITIVE-ONLY — turning a request that has
 * always returned 200 into a 400 breaks live consumers. (Endpoints that ship
 * strict from day one, like /api/builders, /api/people and /api/audits, DO
 * 400: there was no 200 behaviour to break.)
 *
 * This is that projects/search treatment extracted, so the endpoints that
 * still say nothing at all can adopt it identically instead of each author
 * re-deciding (lesson class 30: the step that isn't mechanized gets skipped
 * by everyone). Adding a meta field is additive; no request changes status.
 *
 * `known` is what the route READS — including undocumented aliases, which are
 * real behaviour. `advertise` is what the message lists, when the full read
 * set would be noisy (aliases, internal flags). Returns null when clean.
 */
export function unknownParamWarning(
	sp: URLSearchParams,
	known: readonly string[],
	opts: { advertise?: readonly string[]; hint?: string } = {},
): string | null {
	const unknown = [...new Set(sp.keys())].filter((k) => !known.includes(k));
	if (!unknown.length) return null;
	const supported = (opts.advertise ?? known).join(", ");
	return `Unknown parameter(s) ignored: ${unknown.join(", ")}. Results are NOT filtered by them. Supported: ${supported}.${opts.hint ? ` ${opts.hint}` : ""}`;
}
