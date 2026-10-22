import { NextResponse } from "next/server";
import { type RateLimitResult, rateLimitHeaders } from "./rate-limit";
import { serverTiming } from "./server-timing";

/**
 * A failure response an agent can act on: a JSON body with `error`, the
 * `hint` that says what to do next, the `advisory` that says what the failure
 * is NOT a claim about, and `retryAfterSeconds` when a retry is the right
 * move (mirrored in the Retry-After header), plus our own wall time like
 * every success path, so a consumer can split our time from transfer on
 * failures too.
 */
export function apiError(opts: {
	status: number;
	error: string;
	/** The next step in words. A consumer may keep only `error` and `hint`:
	 * Raven drops advisory, retryAfterSeconds and every header. */
	hint?: string;
	advisory?: string;
	retryAfterSeconds?: number;
	startedAt: number;
	headers?: Record<string, string>;
}): NextResponse {
	const {
		status,
		error,
		hint,
		advisory,
		retryAfterSeconds,
		startedAt,
		headers,
	} = opts;
	return NextResponse.json(
		{
			error,
			...(hint ? { hint } : {}),
			...(advisory ? { advisory } : {}),
			...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
		},
		{
			status,
			headers: {
				...serverTiming(startedAt),
				...(retryAfterSeconds !== undefined
					? { "Retry-After": String(retryAfterSeconds) }
					: {}),
				...(headers ?? {}),
			},
		},
	);
}

const waitHint = (s: number) =>
	`Wait ${s} second${s === 1 ? "" : "s"}, then resend the same request.`;

/** The 429 for a spent rate window: the wait in `hint` as well as in
 * `retryAfterSeconds` and Retry-After. `error` is the route's own line where
 * a page shows it to people. `startedAt` defaults to now, which is right for
 * a route that checks its window before any work. */
export function rateLimited(
	limit: RateLimitResult,
	opts: { startedAt?: number; error?: string } = {},
): NextResponse {
	const retryAfterSeconds = Math.max(
		1,
		Math.ceil((limit.resetAt - Date.now()) / 1000),
	);
	return apiError({
		status: 429,
		error: opts.error ?? "rate limit exceeded",
		hint: waitHint(retryAfterSeconds),
		advisory:
			"This caller's rate window on this endpoint is spent (counted per IP or partner key, per serverless instance: X-RateLimit-Scope: instance). It says nothing about the data or the request.",
		retryAfterSeconds,
		startedAt: opts.startedAt ?? Date.now(),
		headers: rateLimitHeaders(limit),
	});
}

/** The 429 when the language model a route calls is at its own rate limit:
 * the model's Retry-After, or 60 seconds when it sent none (its limits are
 * counted per minute). */
export function modelRateLimited(
	retryAfter: string | null | undefined,
	opts: { startedAt?: number; headers?: Record<string, string> } = {},
): NextResponse {
	const sent = Math.ceil(Number(retryAfter));
	const retryAfterSeconds = sent > 0 ? sent : 60;
	return apiError({
		status: 429,
		error: "The language model behind this endpoint is at its rate limit.",
		hint: waitHint(retryAfterSeconds),
		advisory:
			"The wait is the model's own Retry-After, or 60 seconds when it sent none. This says nothing about the request.",
		retryAfterSeconds,
		startedAt: opts.startedAt ?? Date.now(),
		headers: opts.headers,
	});
}
