/**
 * Status / health endpoint for Stellar Scout.
 *
 *   GET /api/status
 *
 * Returns the Scout skill version, current timestamp, and freshness +
 * size of every data source the skill calls. Lets AI agents do a
 * self-check before answering, and lets them surface data freshness
 * in answers ("Stellar dev stats as of 2026-05-22").
 *
 * Intentionally cheap — no Payload writes, only a handful of small
 * count queries with depth: 0.
 */

import { NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";
import ecData from "@/data/electric-capital-stellar.json";
import { SDF_SKILL_NAMES } from "@/lib/integrations/sdf-skills";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const SCOUT_SKILL_VERSION = "scout-1.0.0";

interface SourceStatus {
	name: string;
	count: number | null;
	lastUpdatedAt: string | null;
	notes?: string;
}

async function collectionStatus(
	// biome-ignore lint/suspicious/noExplicitAny: Payload's type is awkward
	payload: any,
	collection: string,
	name: string,
	notes?: string,
): Promise<SourceStatus> {
	try {
		const result = await payload.find({
			collection,
			limit: 1,
			depth: 0,
			sort: "-updatedAt",
		});
		return {
			name,
			count: result.totalDocs,
			lastUpdatedAt: result.docs[0]?.updatedAt ?? null,
			notes,
		};
	} catch {
		return { name, count: null, lastUpdatedAt: null, notes };
	}
}

export async function GET() {
	const payload = await getPayloadSafe();
	const generatedAt = new Date().toISOString();

	const [projects, hackathons, builders] = payload
		? await Promise.all([
				collectionStatus(payload, "projects", "projects"),
				collectionStatus(payload, "hackathons", "hackathons"),
				collectionStatus(
					payload,
					"builders",
					"builders",
					"Synced from Stellar Passport — small and growing dataset",
				),
			])
		: [
				{ name: "projects", count: null, lastUpdatedAt: null },
				{ name: "hackathons", count: null, lastUpdatedAt: null },
				{ name: "builders", count: null, lastUpdatedAt: null },
			];

	const ecosystemStats: SourceStatus = {
		name: "ecosystemStats",
		count: 1,
		lastUpdatedAt: ecData.refreshedAt ?? null,
		notes: `Electric Capital snapshot, as of ${ecData.asOf}`,
	};

	const sdfSkills: SourceStatus = {
		name: "sdfSkills",
		count: SDF_SKILL_NAMES.length,
		lastUpdatedAt: null,
		notes:
			"Proxied from skills.stellar.org (server-cached 24h). Live freshness shown on the upstream site.",
	};

	return NextResponse.json(
		{
			ok: true,
			service: "Stellar Scout",
			version: SCOUT_SKILL_VERSION,
			generatedAt,
			sources: [projects, hackathons, builders, ecosystemStats, sdfSkills],
			endpoints: [
				"/api/leaderboard",
				"/api/hackathons",
				"/api/hackathons/{slug}",
				"/api/builders",
				"/api/projects/search",
				"/api/skills",
				"/api/skills/{name}",
				"/api/status",
			],
			docs: "https://stellarlight.xyz/scout",
			skill: "https://stellarlight.xyz/skills/stellar-scout.md",
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
			},
		},
	);
}
