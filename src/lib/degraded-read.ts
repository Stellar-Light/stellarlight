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

import { AsyncLocalStorage } from "node:async_hooks";

/** Every warning this module emits starts with this; the eval keys on it. */
export const DEGRADED_READ_PREFIX = "backend read failed";

/**
 * One bound for every wrapped read on the search routes. Origin baselines
 * measured 2026-09-14 (cold edge, whole route): repos 1.0–1.3 s, builders
 * 0.3–0.6 s (3.1 s for a 40-repo builder page), projects 0.6–1.2 s. A single
 * healthy read is well under a second, so 4 s never fires on one.
 *
 * Lowered from 8 s on 2026-10-03. Under a partner's six-questions-a-minute
 * load a stalled read was answered as a 503 at 8.0 s inside their 10 s
 * deadline, which leaves no room to retry. A read that is going to fail must
 * fail early enough for the retry to land.
 */
export const DEFAULT_READ_TIMEOUT_MS = 4_000;

/**
 * Whole-request budget for the bounded reads (2026-10-03). A per-read bound
 * alone lets sequential reads add up: /api/builders answered in 9.6 s under
 * the same load. Inside withReadDeadline every bounded read gets the smaller
 * of its own bound and what is left of the budget, so a route answers
 * (complete, partial or 503) by about 6 s.
 */
export const REQUEST_READ_BUDGET_MS = 6_000;

/** Floor once the budget is spent: a healthy warm read (tens of ms) still
 * lands, a stalled one is cut almost at once. */
const MIN_READ_MS = 200;

const readDeadline = new AsyncLocalStorage<number>();

/** Run a request handler with every bounded read inside it sharing one
 * budget. Outside it (scripts, tests) a read keeps its own bound. */
export function withReadDeadline<T>(
	budgetMs: number,
	fn: () => Promise<T>,
): Promise<T> {
	return readDeadline.run(Date.now() + budgetMs, fn);
}

/** `ms`, shortened to what the request's budget has left. */
function boundFor(ms: number): number {
	const until = readDeadline.getStore();
	if (until === undefined) return ms;
	return Math.max(MIN_READ_MS, Math.min(ms, until - Date.now()));
}

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

/** A failed read, named for a consumer counting real loss. */
export interface FailedRead {
	/** What was being read, as its warning line names it. */
	read: string;
	/** The failure class: an error name, "timeout after Nms", or the stated reason. */
	cause: string;
}

const LINE = new RegExp(
	`^${DEGRADED_READ_PREFIX}: (.+?) \u2014 results may be incomplete \\((.*)\\)$`,
	"s",
);

/** The failed reads named by the degraded lines in `warnings`, in order. */
export function failedReadsOf(warnings: readonly unknown[]): FailedRead[] {
	return warnings.flatMap((w) => {
		const m = typeof w === "string" ? LINE.exec(w) : null;
		return m ? [{ read: m[1], cause: m[2] }] : [];
	});
}

/**
 * `meta` plus `partial` and `failedReads` (2026-10-03), the structured twin
 * of the degraded lines. A partner counting real loss could not tell a failed
 * read from an applied limit by reading a sentence. Derived from the lines
 * this module wrote, so every path that warns is also named here, and a
 * complete page says so outright: `partial: false`, `failedReads: []`.
 */
export function withPartial<M extends { warnings?: readonly unknown[] }>(
	meta: M,
): M & { partial: boolean; failedReads: FailedRead[] } {
	const failedReads = failedReadsOf(meta.warnings ?? []);
	return { ...meta, partial: failedReads.length > 0, failedReads };
}

/**
 * `read`, or a rejection after `ms` (class "timeout after Nms"). For a read
 * that already sits in a try/catch whose catch pushes `degradedWarning`. The
 * read keeps running after the cut; the race stays subscribed to it, so a
 * late rejection is never unhandled.
 */
export function withReadTimeout<T>(read: Promise<T>, ms: number): Promise<T> {
	const bound = boundFor(ms);
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new ReadTimeout(bound)), bound);
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
