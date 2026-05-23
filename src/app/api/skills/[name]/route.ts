/**
 * Single SDF skill content endpoint.
 *
 *   GET /api/skills/{name}
 *
 * `name` is one of: soroban, dapp, assets, data, agentic-payments,
 * zk-proofs, standards.
 *
 * Returns the full skill markdown in `.skill.content` (with frontmatter
 * intact) plus parsed metadata. Use from an AI agent when the user moves
 * from "what should I build" (Scout's territory) to "how do I build it"
 * — fetch the relevant SDF skill's full content and feed it to the agent.
 *
 * Server-cached for 24h via the upstream fetch's revalidate hint.
 */

import { type NextRequest, NextResponse } from "next/server";
import { fetchSdfSkill, SDF_SKILL_NAMES } from "@/lib/integrations/sdf-skills";

export const dynamic = "force-static";
export const revalidate = 86_400;

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ name: string }> },
) {
	const { name } = await params;

	if (!(SDF_SKILL_NAMES as readonly string[]).includes(name)) {
		return NextResponse.json(
			{
				error: `unknown skill: ${name}`,
				known: SDF_SKILL_NAMES,
			},
			{ status: 404 },
		);
	}

	const skill = await fetchSdfSkill(name);
	if (!skill) {
		return NextResponse.json(
			{ error: `failed to fetch skill ${name} from skills.stellar.org` },
			{ status: 502 },
		);
	}

	return NextResponse.json(
		{
			meta: {
				source: skill.rawUrl,
				operator: "Stellar Development Foundation",
				generatedAt: new Date().toISOString(),
			},
			skill,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
			},
		},
	);
}
