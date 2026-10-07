import { NextResponse } from "next/server";
import { serverTiming } from "./server-timing";

/**
 * A failure response an agent can act on: a JSON body with `error`, the
 * `advisory` that says what the failure is NOT a claim about, and
 * `retryAfterSeconds` when a retry is the right move (mirrored in the
 * Retry-After header), plus our own wall time like every success path, so a
 * consumer can split our time from transfer on failures too.
 */
export function apiError(opts: {
	status: number;
	error: string;
	advisory?: string;
	retryAfterSeconds?: number;
	startedAt: number;
	headers?: Record<string, string>;
}): NextResponse {
	const { status, error, advisory, retryAfterSeconds, startedAt, headers } =
		opts;
	return NextResponse.json(
		{
			error,
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
