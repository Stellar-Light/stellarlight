/**
 * Aggregator for skills.stellar.org — the SDF skill catalog.
 *
 *   GET /api/skills
 *
 * Returns summaries (name, description, user-invocable flag, argument
 * hint, URLs) for every Stellar Foundation skill — the "how to build"
 * layer that complements Stellar Scout's "what / who / where to build".
 *
 * Server cached for 24h via the upstream Next.js revalidate hint in
 * the integration layer, so we don't hammer skills.stellar.org.
 *
 * Use this from an AI agent to discover what SDF skills exist before
 * pulling a specific one's full content via /api/skills/{name}.
 */

import { NextResponse } from "next/server";
import { fetchSdfSkillCatalog } from "@/lib/integrations/sdf-skills";

export const dynamic = "force-static";
export const revalidate = 86_400; // 24h

export async function GET() {
	const skills = await fetchSdfSkillCatalog();
	return NextResponse.json(
		{
			meta: {
				source: "https://skills.stellar.org/",
				operator: "Stellar Development Foundation",
				generatedAt: new Date().toISOString(),
				count: skills.length,
			},
			skills,
		},
		{
			headers: {
				"Cache-Control":
					"public, s-maxage=86400, stale-while-revalidate=43200",
			},
		},
	);
}
