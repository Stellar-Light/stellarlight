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
import { degradedWarning, withPartial } from "@/lib/degraded-read";
import { unknownParamWarning } from "@/lib/http-params";
import {
	CURATED_SKILLS,
	type CuratedSkillKind,
	type CuratedSkillSource,
} from "@/lib/integrations/curated-skills";
import {
	fetchSdfSkillCatalog,
	mergeSkillLists,
	registrySkillView,
	SKILLS_REGISTRY,
} from "@/lib/integrations/sdf-skills";
import { matchModeMeta } from "@/lib/match-mode";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { serverTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";
// The caller gives up at 10 s; a request still working past 20 s is a
// stall, and finishing it helps nobody.
export const maxDuration = 20;
export const revalidate = 3600; // 1h on edge

type Source = "sdf" | "stellarlight" | "lumenloop" | "external" | "community";
type Kind = CuratedSkillKind;

const VALID_SOURCES: Source[] = [
	"sdf",
	"stellarlight",
	"lumenloop",
	"external",
	"community",
];
const VALID_KINDS: Kind[] = [
	"skill-md",
	"mcp-server",
	"sdk",
	"cli",
	"agent-kit",
	"tool",
];

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
	/** "skills.stellar.org" when the entry is listed on SDF's registry (SDF
	 * authored or community-built); absent for entries we curate or host. */
	registry?: string;
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
	/** Registry entries only: whether the skill is user-invocable in skills.stellar.org's sense. */
	userInvocable?: boolean;
	/** Registry entries only: argument hint string. */
	argumentHint?: string;
}

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const sp = req.nextUrl.searchParams;
	// Say when a param was dropped (the projects/search treatment, 2026-07-11
	// audit): a filter we never read returns an unfiltered list the caller
	// reads as filtered. Warned, not 400'd — the contract is additive-only.
	const paramWarning = unknownParamWarning(sp, ["kind", "source", "q"], {
		advertise: ["kind", "source", "q"],
		hint: "Skill detail lives on /api/skills/{name}.",
	});
	const sourceFilter = sp.get("source");
	const kindFilter = sp.get("kind");
	// q was accepted by Raven's tool signature but NEVER applied: `?q=oracle`
	// returned all 43 skills, so an agent read an unfiltered list as filtered.
	// Match it over name/tagline/description/tags, the fields a skill is found by.
	const qFilter = (sp.get("q") ?? "").trim().toLowerCase();

	if (sourceFilter && !VALID_SOURCES.includes(sourceFilter as Source)) {
		return NextResponse.json(
			{
				error: `Unknown source '${sourceFilter}'`,
				validSources: VALID_SOURCES,
			},
			{ status: 400 },
		);
	}
	if (kindFilter && !VALID_KINDS.includes(kindFilter as Kind)) {
		return NextResponse.json(
			{ error: `Unknown kind '${kindFilter}'`, validKinds: VALID_KINDS },
			{ status: 400 },
		);
	}

	// 1. The skills.stellar.org registry: SDF's own set and the community-built
	// section, labelled by section. An entry's section is what the registry
	// says about it: community-built entries are listed, not reviewed, by SDF.
	const catalog = await fetchSdfSkillCatalog();
	const registrySkills: UnifiedSkill[] = catalog.skills.map(registrySkillView);
	const registryNames = new Set(catalog.skills.map((s) => s.name));

	// 2. Curated entries (Stellarlight + Lumenloop + others we maintain)
	const curatedSkills: UnifiedSkill[] = CURATED_SKILLS.map((s) => ({
		slug: s.slug,
		name: s.name,
		tagline: s.tagline,
		description: s.description,
		source: s.source as CuratedSkillSource as Source,
		kind: s.kind,
		...(s.registryName && registryNames.has(s.registryName)
			? { registry: SKILLS_REGISTRY }
			: {}),
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
	const communityRaw = await loadApprovedCommunitySkills();
	const communityFailed = communityRaw === null;
	const communitySkills: UnifiedSkill[] = communityRaw ?? [];

	const { all, merged } = mergeSkillLists(
		curatedSkills,
		registrySkills,
		communitySkills,
		CURATED_SKILLS.flatMap((s) => (s.registryName ? [s.registryName] : [])),
	);

	// Apply filters
	let filtered = all;
	if (sourceFilter)
		filtered = filtered.filter((s) => s.source === sourceFilter);
	if (kindFilter) filtered = filtered.filter((s) => s.kind === kindFilter);
	if (qFilter) {
		const toks = qFilter.split(/\s+/).filter(Boolean);
		filtered = filtered.filter((s) => {
			const hay =
				`${s.name} ${s.tagline ?? ""} ${s.description ?? ""} ${(s.tags ?? []).join(" ")}`.toLowerCase();
			return toks.every((t) => hay.includes(t));
		});
	}

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
		startedAt,
		status: 200,
		endpoint: "/api/skills",
		filters: { source: sourceFilter, kind: kindFilter, q: qFilter || null },
	});

	return NextResponse.json(
		{
			meta: withPartial({
				...matchModeMeta(qFilter ? "filtered" : "all"),
				source: "https://stellarlight.xyz/skills",
				generatedAt: new Date().toISOString(),
				...(paramWarning || communityFailed || !catalog.live
					? {
							warnings: [
								...(paramWarning ? [paramWarning] : []),
								...(catalog.live
									? []
									: [
											degradedWarning(
												"skills.stellar.org registry",
												"the registry did not answer; the SDF set is served from a fallback list and community-built entries are missing from this page",
											),
										]),
								...(communityFailed
									? [
											degradedWarning(
												"community skills",
												"the registry read failed; community entries are missing from this page",
											),
										]
									: []),
							],
						}
					: {}),
				filters: { source: sourceFilter, kind: kindFilter, q: qFilter || null },
				counts: {
					returned: filtered.length,
					// No `limit` param: filtering is the only narrowing, so every
					// matching skill is on this page and total == returned. `bySource`
					// below counts the WHOLE catalog, pre-filter — a different
					// denominator, which is exactly why total is stated explicitly.
					total: filtered.length,
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
				registry: {
					url: `https://${SKILLS_REGISTRY}/llms.txt`,
					live: catalog.live,
					listed: catalog.listed,
					served: catalog.skills.length,
					merged,
					unreachable: catalog.unreachable,
				},
			}),
			skills: filtered,
		},
		{
			headers: {
				...serverTiming(startedAt),
				"Cache-Control":
					communityFailed || !catalog.live
						? "no-store"
						: "public, s-maxage=3600, stale-while-revalidate=7200",
			},
		},
	);
}

/** Load approved community submissions from Payload, mapped to the unified shape. */
/** null = the read failed (an outage), never an empty list. */
async function loadApprovedCommunitySkills(): Promise<UnifiedSkill[] | null> {
	const payload = await getPayloadSafe();
	if (!payload) return null;
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
		return null;
	}
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
