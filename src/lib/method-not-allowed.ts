/**
 * JSON 405 handler for method misuse on public API routes.
 *
 * Next.js's automatic 405 (when a route file doesn't export the requested
 * method) responds with an EMPTY body and no content-type — the one place the
 * public API answered non-JSON (Raven improvement item sls-004: "return JSON
 * error bodies with a consistent content-type for 404s and other error
 * statuses"). Exporting these stubs makes method misuse answer in the same
 * JSON envelope as every other error.
 */
import { NextResponse } from "next/server";

export function methodNotAllowed(allowed: string[]) {
	return async () =>
		NextResponse.json(
			{
				error: "method not allowed",
				allowed,
				hint: `This endpoint only supports: ${allowed.join(", ")}.`,
			},
			{ status: 405, headers: { Allow: allowed.join(", ") } },
		);
}
