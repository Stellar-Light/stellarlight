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
import ecData from "@/data/electric-capital-stellar.json";
import { getUsageStats } from "@/lib/api-usage";
import { SDF_SKILL_NAMES } from "@/lib/integrations/sdf-skills";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { API_VERSION, SCOUT_SERVICE_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";
export const revalidate = 60;

const SCOUT_SKILL_VERSION = SCOUT_SERVICE_VERSION;

interface SourceStatus {
	name: string;
	count: number | null;
	lastUpdatedAt: string | null;
	/** sls-048: scope digest of what `count` counts — same id format as the
	 * `population.id` on /api/analyze and /api/clusters. `status:all` = the
	 * FULL collection (incl. Inactive), which is why this number is larger
	 * than analyze/clusters' active-only populations; different ids are
	 * different populations — never merge/sum them without labeling scope. */
	populationId?: string;
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
			populationId: `${collection}|status:all`,
			notes,
		};
	} catch {
		return { name, count: null, lastUpdatedAt: null, notes };
	}
}

export async function GET() {
	const payload = await getPayloadSafe();
	const generatedAt = new Date().toISOString();

	const [projects, hackathons, builders, repos] = payload
		? await Promise.all([
				collectionStatus(payload, "projects", "projects"),
				collectionStatus(
					payload,
					"hackathons",
					"hackathons",
					"Curated DB collection only (may be 0). /api/hackathons additionally merges live DoraHacks-sourced events — see its meta.counts for the served total.",
				),
				collectionStatus(
					payload,
					"builders",
					"builders",
					"Synced from Stellar Passport — small and growing dataset",
				),
				collectionStatus(
					payload,
					"repos",
					"repos",
					"Indexed-and-scored Stellar GitHub repos (powers /api/repos/search)",
				),
			])
		: [
				{ name: "projects", count: null, lastUpdatedAt: null },
				{ name: "hackathons", count: null, lastUpdatedAt: null },
				{ name: "builders", count: null, lastUpdatedAt: null },
				{ name: "repos", count: null, lastUpdatedAt: null },
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

	const usage = await getUsageStats();

	return NextResponse.json(
		{
			ok: true,
			service: "Stellar Scout",
			version: SCOUT_SKILL_VERSION,
			// API contract (OpenAPI) version — tracks /api/openapi.json info.version
			// from the shared constant so agents can reason about the live contract.
			apiVersion: API_VERSION,
			generatedAt,
			sources: [
				projects,
				hackathons,
				builders,
				repos,
				ecosystemStats,
				sdfSkills,
			],
			usage: usage ?? {
				total: null,
				last24h: null,
				last7d: null,
				byEndpoint: [],
				note: "Usage stats unavailable (Payload not reachable).",
			},
			endpoints: [
				"/api/status",
				"/api/changelog",
				"/api/leaderboard",
				"/api/hackathons",
				"/api/hackathons/{slug}",
				"/api/hackathons/compare",
				"/api/analyze",
				"/api/clusters",
				"/api/builders",
				"/api/projects/search",
				"/api/repos/search",
				"/api/repos/explain",
				"/api/rfps",
				"/api/research",
				"/api/feedback",
				"/api/skills",
				"/api/skills/{name}",
				"/api/partners",
				"/api/partners/{slug}",
				"/api/partners/match",
				"/api/partners/assistant",
				"/api/partners/onboard",
				"/api/partners/submit-listing",
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

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
