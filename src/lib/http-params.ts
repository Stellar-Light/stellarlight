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
