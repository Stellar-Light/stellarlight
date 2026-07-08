/**
 * GET /api/openapi.json — serves the OpenAPI 3.1 contract.
 * The spec itself lives in src/lib/openapi-spec.ts (a pure data module the
 * contract gate snapshots + codegens from); this route only serves it.
 */
import { type NextRequest, NextResponse } from "next/server";
import { spec } from "@/lib/openapi-spec";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET(_req: NextRequest) {
	return NextResponse.json(spec, {
		headers: {
			// Long edge cache + permissive CORS so any codegen tool can fetch
			// the spec from the browser or a CI runner without auth concerns.
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
		},
	});
}

export function OPTIONS() {
	return new NextResponse(null, {
		headers: {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		},
	});
}
