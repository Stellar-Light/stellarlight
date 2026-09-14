/**
 * A backend read that fails under load must SAY so.
 *
 * Measured 2026-09-14 (weekly eval, concurrent load): /api/repos/search
 * answered 200 with 0 rows for 10 of 30 symbol lookups, /api/builders?q=
 * "0 rows" for 13 of 100 logins, and /api/projects/search served a thinner
 * page for two queries — every probe fine minutes later at 0.1–0.7 s. The
 * routes' best-effort `catch {}` blocks turned a failed read into an empty
 * (or thinner) page that an agent reads as "no results" and the evals read
 * as a retrieval miss.
 *
 * `degradedRead` wraps ONE read: on a throw or a timeout it hands back the
 * caller's fallback plus a single line for `meta.warnings` — the honesty
 * channel every search response already carries. It records nothing else:
 * no logging, no metrics; the response is the record. The line names the
 * failure CLASS only (an error's name, or "timeout after Nms"), never its
 * message — a Mongo message can carry cluster hostnames.
 */

/** Every warning this module emits starts with this; the eval keys on it. */
export const DEGRADED_READ_PREFIX = "backend read failed";

/**
 * One bound for every wrapped read on the three search routes. Origin
 * baselines measured 2026-09-14 (cold edge, whole route): repos 1.0–1.3 s,
 * builders 0.3–0.6 s (3.1 s for a 40-repo builder page), projects
 * 0.6–1.2 s — so 8 s never fires on a healthy read, while a stalled Mongo
 * server selection (driver default 30 s) is cut short of the platform's
 * function cap and answered as a warned page instead of a 504.
 *
 * ponytail: per-read bound, not a per-request deadline — a route whose
 * every read stalls still adds them up. Add a shared deadline if that is
 * ever observed.
 */
export const DEFAULT_READ_TIMEOUT_MS = 8_000;

export interface DegradedRead<T> {
	value: T;
	/** null when the read completed; otherwise the `meta.warnings` line. */
	warning: string | null;
}

class ReadTimeout extends Error {
	constructor(ms: number) {
		super(`timeout after ${ms}ms`);
		this.name = "ReadTimeout";
	}
}

/** The `meta.warnings` line for a read that failed with `cause`. */
export function degradedWarning(op: string, cause: unknown): string {
	const cls =
		cause instanceof ReadTimeout
			? cause.message
			: cause instanceof Error
				? cause.name || "Error"
				: typeof cause === "string"
					? cause
					: "unknown error";
	return `${DEGRADED_READ_PREFIX}: ${op} — results may be incomplete (${cls})`;
}

/** True when any line in `warnings` came from a failed read. */
export function isDegraded(warnings: readonly string[]): boolean {
	return warnings.some((w) => w.startsWith(DEGRADED_READ_PREFIX));
}

/**
 * `read`, or a rejection after `ms` (class "timeout after Nms"). For a read
 * that already sits in a try/catch whose catch pushes `degradedWarning`. The
 * read keeps running after the cut; the race stays subscribed to it, so a
 * late rejection is never unhandled.
 */
export function withReadTimeout<T>(read: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new ReadTimeout(ms)), ms);
	});
	return Promise.race([read, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run `read`; on a throw or after `timeoutMs`, hand back `fallback` and the
 * warning for `op`. `F` is inferred on its own so a `null` or empty-page
 * fallback types cleanly against whatever the read returns.
 */
export async function degradedRead<T, F = T>(
	op: string,
	read: () => Promise<T>,
	fallback: F,
	timeoutMs: number,
): Promise<DegradedRead<T | F>> {
	try {
		return { value: await withReadTimeout(read(), timeoutMs), warning: null };
	} catch (e) {
		return { value: fallback, warning: degradedWarning(op, e) };
	}
}
