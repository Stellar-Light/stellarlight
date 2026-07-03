/**
 * Unified Stellar AI skills marketplace.
 *
 *   GET /api/skills
 *   GET /api/skills?source=sdf|stellarlight|lumenloop|community
 *   GET /api/skills?kind=skill-md|mcp-server|agent-kit|tool
 *
 * Merges three sources:
 *
 *   1. SDF skills from skills.stellar.org (proxied via the integration layer)
 *   2. Curated entries (Stellarlight + Lumenloop + trusted third-parties)
 *      hardcoded in src/lib/integrations/curated-skills.ts
 *   3. Community submissions from the `community-skills` Payload collection,
 *      filtered to status='approved'
 *
 * Result is a unified, filterable list with consistent shape. Agents (and
 * the /skills frontend) can rely on one envelope regardless of source.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { fetchSdfSkillCatalog } from "@/lib/integrations/sdf-skills";
import {
	CURATED_SKILLS,
	type CuratedSkillKind,
	type CuratedSkillSource,
} from "@/lib/integrations/curated-skills";
import { getPayloadSafe } from "@/lib/payload-client";
import { methodNotAllowed } from "@/lib/method-not-allowed";

export const dynamic = "force-dynamic";
export const revalidate = 3600; // 1h on edge

type Source = "sdf" | "stellarlight" | "lumenloop" | "external" | "community";
type Kind = CuratedSkillKind;

const VALID_SOURCES: Source[] = ["sdf", "stellarlight", "lumenloop", "external", "community"];
const VALID_KINDS: Kind[] = ["skill-md", "mcp-server", "sdk", "cli", "agent-kit", "tool"];

/**
 * Unified skill shape returned to agents + the frontend. All three sources
 * map onto this shape so the consumer doesn't need to branch on source.
 */
interface UnifiedSkill {
	slug: string;
	name: string;
	tagline?: string;
	description: string;
	source: Source;
	kind: Kind;
	install?: string;
	installAlt?: { label: string; command: string }[];
	repository?: string;
	homepage?: string;
	docs?: string;
	rawUrl?: string;
	compatibility?: string[];
	targetUser?: string[];
	tags?: string[];
	featured?: boolean;
	/** SDF skills only — whether the skill is user-invocable in skills.stellar.org's sense. */
	userInvocable?: boolean;
	/** SDF skills only — argument hint string. */
	argumentHint?: string;
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const sourceFilter = sp.get("source");
	const kindFilter = sp.get("kind");

	if (sourceFilter && !VALID_SOURCES.includes(sourceFilter as Source)) {
		return NextResponse.json(
			{ error: `Unknown source '${sourceFilter}'`, validSources: VALID_SOURCES },
			{ status: 400 },
		);
	}
	if (kindFilter && !VALID_KINDS.includes(kindFilter as Kind)) {
		return NextResponse.json(
			{ error: `Unknown kind '${kindFilter}'`, validKinds: VALID_KINDS },
			{ status: 400 },
		);
	}

	// 1. SDF skills (proxy of skills.stellar.org)
	const sdfSkills: UnifiedSkill[] = (await fetchSdfSkillCatalog()).map((s) => ({
		slug: s.name,
		name: humanize(s.name),
		tagline: shorten(s.description, 160),
		description: s.description,
		source: "sdf",
		kind: "skill-md",
		install: `npx skills add stellar/${s.name}`,
		homepage: s.url,
		rawUrl: s.rawUrl,
		userInvocable: s.userInvocable,
		argumentHint: s.argumentHint,
		compatibility: ["Claude Code", "Codex", "Cursor", "OpenClaw"],
		targetUser: ["dev"],
		tags: [s.name, "SDF"],
	}));

	// 2. Curated entries (Stellarlight + Lumenloop + others we maintain)
	const curatedSkills: UnifiedSkill[] = CURATED_SKILLS.map((s) => ({
		slug: s.slug,
		name: s.name,
		tagline: s.tagline,
		description: s.description,
		source: s.source as CuratedSkillSource as Source,
		kind: s.kind,
		install: s.install,
		installAlt: s.installAlt,
		repository: s.repository,
		homepage: s.homepage,
		docs: s.docs,
		compatibility: s.compatibility,
		targetUser: s.targetUser,
		tags: s.tags,
		featured: s.featured,
	}));

	// 3. Community submissions (approved only)
	const communitySkills: UnifiedSkill[] = await loadApprovedCommunitySkills();

	// Merge with dedup by slug — curated wins over SDF wins over community
	// (so we can't accidentally let a community submission shadow Scout).
	const all: UnifiedSkill[] = [];
	const seen = new Set<string>();
	for (const list of [curatedSkills, sdfSkills, communitySkills]) {
		for (const s of list) {
			if (seen.has(s.slug)) continue;
			seen.add(s.slug);
			all.push(s);
		}
	}

	// Apply filters
	let filtered = all;
	if (sourceFilter) filtered = filtered.filter((s) => s.source === sourceFilter);
	if (kindFilter) filtered = filtered.filter((s) => s.kind === kindFilter);

	// Sort: featured first, then by source priority, then alphabetical.
	// Source priority puts Stellarlight's own products first, then SDF's
	// official skills, then the broader Stellar ecosystem (SDKs, libraries),
	// then competing aggregators (lumenloop) and community submissions last.
	// This is editorial — we curate this surface and the order reflects what
	// we believe builders should see first.
	const sourcePriority: Record<string, number> = {
		stellarlight: 0,
		sdf: 1,
		external: 2,
		lumenloop: 3,
		community: 4,
	};
	filtered.sort((a, b) => {
		if (a.featured && !b.featured) return -1;
		if (!a.featured && b.featured) return 1;
		const pa = sourcePriority[a.source] ?? 99;
		const pb = sourcePriority[b.source] ?? 99;
		if (pa !== pb) return pa - pb;
		return a.name.localeCompare(b.name);
	});

	logApiHit({
		req,
		endpoint: "/api/skills",
		filters: { source: sourceFilter, kind: kindFilter },
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/skills",
				generatedAt: new Date().toISOString(),
				filters: { source: sourceFilter, kind: kindFilter },
				counts: {
					returned: filtered.length,
					bySource: {
						sdf: all.filter((s) => s.source === "sdf").length,
						stellarlight: all.filter((s) => s.source === "stellarlight").length,
						lumenloop: all.filter((s) => s.source === "lumenloop").length,
						external: all.filter((s) => s.source === "external").length,
						community: all.filter((s) => s.source === "community").length,
					},
				},
				validSources: VALID_SOURCES,
				validKinds: VALID_KINDS,
			},
			skills: filtered,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
			},
		},
	);
}

/** Load approved community submissions from Payload, mapped to the unified shape. */
async function loadApprovedCommunitySkills(): Promise<UnifiedSkill[]> {
	const payload = await getPayloadSafe();
	if (!payload) return [];
	try {
		const result = await payload.find({
			collection: "community-skills",
			where: { status: { equals: "approved" } },
			limit: 200,
			depth: 0,
		});
		return (
			result.docs as unknown as Array<{
				slug: string;
				name: string;
				tagline?: string;
				description: string;
				kind: Kind;
				install: string;
				repository?: string;
				homepage?: string;
				docs?: string;
				compatibility?: Array<{ agent?: string }>;
				targetUser?: string[];
				tags?: Array<{ tag?: string }>;
			}>
		).map((d) => ({
			slug: d.slug,
			name: d.name,
			tagline: d.tagline,
			description: d.description,
			source: "community" as Source,
			kind: d.kind,
			install: d.install,
			repository: d.repository,
			homepage: d.homepage,
			docs: d.docs,
			compatibility: (d.compatibility ?? [])
				.map((c) => c.agent)
				.filter((x): x is string => !!x),
			targetUser: d.targetUser,
			tags: (d.tags ?? []).map((t) => t.tag).filter((x): x is string => !!x),
		}));
	} catch {
		return [];
	}
}

function humanize(slug: string): string {
	return slug
		.split("-")
		.map((w) => (w === "zk" ? "ZK" : w === "dapp" ? "dApp" : w[0]?.toUpperCase() + w.slice(1)))
		.join(" ");
}

function shorten(s: string, max: number): string {
	const first = s.split(/[.!?]\s/)[0] ?? s;
	if (first.length <= max) return first.endsWith(".") ? first : `${first}.`;
	return `${first.slice(0, max - 1)}…`;
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
