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
