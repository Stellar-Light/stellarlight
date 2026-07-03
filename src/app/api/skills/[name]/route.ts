/**
 * Single-skill detail endpoint.
 *
 *   GET /api/skills/{slug}
 *
 * Resolves the slug across the same three sources as the parent
 * /api/skills list endpoint:
 *
 *   1. SDF skills (soroban, dapp, assets, data, agentic-payments,
 *      zk-proofs, standards) — full markdown content fetched live from
 *      skills.stellar.org and surfaced under `.skill.content`.
 *   2. Curated entries from src/lib/integrations/curated-skills.ts —
 *      metadata always returned. Two of our own (stellar-scout,
 *      stellar-developer-activity) ship the full SKILL.md inlined via a
 *      TS constant so `.skill.content` is populated even when the page
 *      renders on the edge with no filesystem.
 *   3. Approved community submissions from the CommunitySkills Payload
 *      collection.
 *
 * Returns 404 if the slug isn't found in ANY source. Used by:
 *   - /skills/{slug} detail pages (server-rendered)
 *   - Agents looking up a single skill by name (cheaper than filtering the list)
 *
 * Cache-Control mirrors /api/skills (1h s-maxage, 24h for SDF skills
 * which are slower-changing).
 */

import { type NextRequest, NextResponse } from "next/server";
import {
	CURATED_SKILLS,
	type CuratedSkill,
} from "@/lib/integrations/curated-skills";
import {
	fetchSdfSkill,
	SDF_SKILL_NAMES,
} from "@/lib/integrations/sdf-skills";
import { getPayloadSafe } from "@/lib/payload-client";
import { generateSlug } from "@/lib/utils/normalize";
import { STELLAR_DEVELOPER_ACTIVITY_SKILL } from "@/lib/stellar-developer-activity-skill";
import { STELLAR_SCOUT_SKILL } from "@/lib/stellar-scout-skill";

export const dynamic = "force-static";
export const revalidate = 3600;

/**
 * Map of slug → inlined SKILL.md text for our own skill files. Lets the
 * detail page render full markdown for stellar-scout and
 * stellar-developer-activity without a filesystem read at request time.
 */
const INLINED_SKILL_CONTENT: Record<string, string> = {
	"stellar-scout": STELLAR_SCOUT_SKILL.trim(),
	"stellar-developer-activity": STELLAR_DEVELOPER_ACTIVITY_SKILL.trim(),
};

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ name: string }> },
) {
	const { name: rawName } = await params;
	// Accept either the slug ('stellar-scout') or the display name ('Stellar
	// Scout') — agents naturally pass whatever the user said. generateSlug is
	// idempotent on real slugs, so this is a no-op for correct slugs and a fix
	// for display names that previously 404'd.
	const slug = generateSlug(rawName);

	// 1. SDF skill? Fetch full content live from skills.stellar.org.
	if ((SDF_SKILL_NAMES as readonly string[]).includes(slug)) {
		const skill = await fetchSdfSkill(slug);
		if (!skill) {
			return NextResponse.json(
				{ error: `failed to fetch skill ${slug} from skills.stellar.org` },
				{ status: 502 },
			);
		}
		return jsonResponse(
			{
				meta: {
					source: skill.rawUrl,
					operator: "Stellar Development Foundation",
					generatedAt: new Date().toISOString(),
				},
				skill: {
					slug,
					source: "sdf" as const,
					kind: "skill-md" as const,
					name: humanize(skill.name),
					description: skill.description,
					install: `npx skills add stellar/${skill.name}`,
					homepage: skill.url,
					rawUrl: skill.rawUrl,
					compatibility: ["Claude Code", "Codex", "Cursor", "OpenClaw"],
					targetUser: ["dev"],
					tags: [skill.name, "SDF"],
					content: skill.content, // raw SKILL.md, frontmatter included
				},
			},
			{ sMaxAge: 86_400 },
		);
	}

	// 2. Curated entry?
	const curated = CURATED_SKILLS.find((s) => s.slug === slug);
	if (curated) {
		return jsonResponse(
			{
				meta: {
					source: curated.docs ?? curated.homepage ?? curated.repository,
					operator: "stellarlight.xyz",
					generatedAt: new Date().toISOString(),
				},
				skill: toUnifiedShape(curated),
			},
			{ sMaxAge: 3600 },
		);
	}

	// 3. Community submission?
	const community = await loadApprovedCommunitySkill(slug);
	if (community) {
		return jsonResponse(
			{
				meta: {
					source: community.repository ?? community.homepage,
					operator: "community",
					generatedAt: new Date().toISOString(),
				},
				skill: community,
			},
			{ sMaxAge: 3600 },
		);
	}

	// Not found anywhere.
	return NextResponse.json(
		{
			error: `unknown skill: ${slug}`,
			hint: "Try /api/skills to list all available slugs.",
		},
		{ status: 404 },
	);
}

/** JSON response with consistent cache headers. */
function jsonResponse(body: unknown, { sMaxAge }: { sMaxAge: number }) {
	return NextResponse.json(body, {
		headers: {
			"Cache-Control": `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge}`,
		},
	});
}

function toUnifiedShape(c: CuratedSkill) {
	return {
		slug: c.slug,
		name: c.name,
		tagline: c.tagline,
		description: c.description,
		source: c.source,
		kind: c.kind,
		install: c.install,
		installAlt: c.installAlt,
		repository: c.repository,
		homepage: c.homepage,
		docs: c.docs,
		compatibility: c.compatibility,
		targetUser: c.targetUser,
		tags: c.tags,
		featured: c.featured,
		// Inlined SKILL.md for our own kind=skill-md entries; null otherwise.
		content: INLINED_SKILL_CONTENT[c.slug] ?? null,
	};
}

async function loadApprovedCommunitySkill(slug: string) {
	const payload = await getPayloadSafe();
	if (!payload) return null;
	try {
		const result = await payload.find({
			collection: "community-skills",
			where: {
				and: [{ slug: { equals: slug } }, { status: { equals: "approved" } }],
			},
			limit: 1,
			depth: 0,
		});
		const d = result.docs[0] as
			| {
					slug: string;
					name: string;
					tagline?: string;
					description: string;
					kind: string;
					install: string;
					repository?: string;
					homepage?: string;
					docs?: string;
					compatibility?: Array<{ agent?: string }>;
					targetUser?: string[];
					tags?: Array<{ tag?: string }>;
			  }
			| undefined;
		if (!d) return null;
		return {
			slug: d.slug,
			name: d.name,
			tagline: d.tagline,
			description: d.description,
			source: "community" as const,
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
			content: null,
		};
	} catch {
		return null;
	}
}

function humanize(slug: string): string {
	return slug
		.split("-")
		.map((w) =>
			w === "zk" ? "ZK" : w === "dapp" ? "dApp" : w[0]?.toUpperCase() + w.slice(1),
		)
		.join(" ");
}

// NOTE (sls-004 regression fix): this route is `dynamic = "force-static"` with a
// dynamic [name] segment. Next.js cannot reconcile non-GET method handlers with a
// force-static DYNAMIC route — adding POST/PUT/DELETE/PATCH here made EVERY request
// (including 404s) render the error boundary → stable HTTP 500. So the JSON-405
// method-guards (added across the other 22 routes) are intentionally OMITTED here;
// non-GET falls back to Next's default 405. Do not re-add them without dropping
// force-static.
