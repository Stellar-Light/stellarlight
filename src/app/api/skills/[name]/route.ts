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
import { apiError } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import {
	CURATED_SKILLS,
	type CuratedSkill,
} from "@/lib/integrations/curated-skills";
import {
	fetchRegistryLive,
	fetchSdfSkill,
	registrySkillView,
	SDF_SKILL_NAMES,
	SKILLS_REGISTRY,
} from "@/lib/integrations/sdf-skills";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { serverTiming } from "@/lib/server-timing";
import { STELLAR_DEVELOPER_ACTIVITY_SKILL } from "@/lib/stellar-developer-activity-skill";
import { STELLAR_SCOUT_SKILL } from "@/lib/stellar-scout-skill";
import { generateSlug } from "@/lib/utils/normalize";

// sls-004: this route is force-DYNAMIC, not force-static. GET stays CDN-cached
// via the explicit Cache-Control headers on jsonResponse (s-maxage +
// stale-while-revalidate), so there's no perf cost — but dropping force-static
// is what lets us attach real JSON-405 method guards below (the force-static +
// method-handler COMBINATION is what caused the #276/#280 stable-500; the normal
// dynamic-route + guards pattern used by the other 22 routes is safe).
export const dynamic = "force-dynamic";
// The caller gives up at 10 s; a request still working past 20 s is a
// stall, and finishing it helps nobody.
export const maxDuration = 20;

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
	req: NextRequest,
	{ params }: { params: Promise<{ name: string }> },
) {
	const startedAt = Date.now();
	const { name: rawName } = await params;
	// Accept either the slug ('stellar-scout') or the display name ('Stellar
	// Scout') — agents naturally pass whatever the user said. generateSlug is
	// idempotent on real slugs, so this is a no-op for correct slugs and a fix
	// for display names that previously 404'd.
	const slug = generateSlug(rawName);
	const logHit = () =>
		logApiHit({
			req,
			startedAt,
			status: 200,
			endpoint: "/api/skills/[name]",
			query: slug,
		});

	// 1. SDF skill? Fetch full content live from skills.stellar.org.
	// sls-053: gate against the LIVE llms.txt-derived list (24h cache), not a
	// static snapshot — so renamed/added SDF skills resolve without a deploy.
	// An upstream miss falls through to the curated and community copies
	// below; only when every source fails does the caller see a 503.
	// Curated first, as the list merges: a curated entry stands for the registry
	// copy it names (Stellar Scout, Lumen Loop's skills, the Soroswap SDK), so
	// its slug must answer with the curated row here too.
	const registry = await fetchRegistryLive();
	const registryDown = registry === null;
	const curated = CURATED_SKILLS.find((s) => s.slug === slug);
	if (curated) {
		logHit();
		return jsonResponse(
			{
				meta: {
					source: curated.docs ?? curated.homepage ?? curated.repository,
					operator: "stellarlight.xyz",
					generatedAt: new Date().toISOString(),
				},
				skill: {
					...toUnifiedShape(curated),
					// The list marks a curated row the registry lists under its
					// registryName; the detail answers the same shape.
					...(curated.registryName && registry?.has(curated.registryName)
						? { registry: SKILLS_REGISTRY }
						: {}),
					content: await resolveCuratedContent(curated),
				},
			},
			{ sMaxAge: 3600, startedAt },
		);
	}

	// 3. Community submission?
	// A display name slugified ("MPP Discover" -> mpp-discover) may not be the
	// catalog name (discover): resolve it through the registry's titles too.
	const registryName = registry
		? registry.has(slug)
			? slug
			: [...registry.values()].find((e) => generateSlug(e.title) === slug)?.name
		: (SDF_SKILL_NAMES as readonly string[]).includes(slug)
			? slug
			: undefined;
	const isSdf = registryName !== undefined;
	const skill = registryName ? await fetchSdfSkill(registryName) : null;
	if (skill) {
		logHit();
		return jsonResponse(
			{
				meta: {
					source: skill.rawUrl,
					operator: skill.community
						? `community-built, listed on ${SKILLS_REGISTRY} and maintained by its author (not reviewed by SDF)`
						: "Stellar Development Foundation",
					generatedAt: new Date().toISOString(),
				},
				skill: {
					...registrySkillView(skill),
					content: skill.content, // raw SKILL.md, frontmatter included
				},
			},
			{ sMaxAge: 86_400, startedAt },
		);
	}

	const community = await loadApprovedCommunitySkill(slug);
	if (community === undefined && !isSdf) {
		return apiError({
			status: 503,
			error: `skill ${slug} could not be looked up: the community registry read failed`,
			advisory:
				"The community registry read failed; the skill may exist. This is an outage, not a 404. Retry after Retry-After.",
			retryAfterSeconds: 2,
			startedAt,
		});
	}
	if (community) {
		logHit();
		return jsonResponse(
			{
				meta: {
					source: community.repository ?? community.homepage,
					operator: "community",
					generatedAt: new Date().toISOString(),
				},
				skill: community,
			},
			{ sMaxAge: 3600, startedAt },
		);
	}

	// The registry lists it but every copy failed to fetch: temporary, retry.
	if (isSdf) {
		return apiError({
			status: 503,
			error: `skill ${slug} is listed by skills.stellar.org but could not be fetched from any source`,
			advisory:
				"skills.stellar.org lists this skill but its SKILL.md could not be fetched from where the registry links it. Report it; a retry inside 300 s returns the same answer.",
			retryAfterSeconds: 300,
			startedAt,
		});
	}

	// With the registry unreadable, an unknown slug may well be a listed skill
	// the static fallback does not know: that is "could not check", not 404.
	if (registryDown) {
		return apiError({
			status: 503,
			error: `skill ${slug} could not be looked up: the skills.stellar.org registry did not answer`,
			advisory:
				"skills.stellar.org did not answer, so its entries cannot be resolved. Report it; a retry inside 60 s returns the same answer.",
			retryAfterSeconds: 60,
			startedAt,
		});
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
function jsonResponse(
	body: unknown,
	{ sMaxAge, startedAt }: { sMaxAge: number; startedAt: number },
) {
	return NextResponse.json(body, {
		headers: {
			...serverTiming(startedAt),
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
		// resolveCuratedContent() fills this in for repo-hosted skills.
		content: INLINED_SKILL_CONTENT[c.slug] ?? null,
	};
}

/**
 * Resolve a curated skill's SKILL.md body.
 *
 * Why this exists: an agent that can LIST our skills but never READ one can
 * only learn that a workflow exists, not follow it. Content was previously
 * limited to a two-entry hardcoded map, so every skill in the SCF plugin
 * answered `content: null` — the reviewer workflow was invisible to any
 * consumer reaching us over HTTP, Raven included.
 *
 * Inlined content still wins (it ships with the deploy and can't fail). For
 * anything else hosted in a public GitHub repo, fetch the SKILL.md from raw
 * and cache it for an hour, mirroring how SDF skills already stream in live
 * from skills.stellar.org. Best-effort by design: a fetch failure returns null,
 * exactly the behaviour callers already handle, and never fails the request.
 */
async function resolveCuratedContent(c: CuratedSkill): Promise<string | null> {
	const inlined = INLINED_SKILL_CONTENT[c.slug];
	if (inlined) return inlined;

	// repository points at the skill's directory, e.g.
	// https://github.com/<owner>/<repo>/tree/main/skills/<name>
	const m = c.repository?.match(
		/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)$/,
	);
	if (!m) return null;
	const [, owner, repo, ref, dir] = m;
	const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${dir.replace(/\/$/, "")}/SKILL.md`;
	try {
		const res = await fetch(raw, {
			// 5 minutes, not an hour. These are INSTRUCTIONS an agent executes
			// literally, so a stale copy is an agent confidently doing the wrong
			// thing — and today a field-name fix stayed live-wrong for the full
			// hour after it was corrected at source, long enough that the CI gate
			// guarding this very failure reported the fixed skill as broken.
			// Correcting a skill should reach consumers in minutes; the upstream
			// fetch is one small file from a CDN, so the cost of the shorter
			// window is negligible.
			next: { revalidate: 300 },
			signal: AbortSignal.timeout(6000),
		});
		if (!res.ok) return null;
		const text = await res.text();
		return text.trim() || null;
	} catch {
		return null;
	}
}

/** null = not found; undefined = the read failed (an outage, not an absence). */
async function loadApprovedCommunitySkill(slug: string) {
	const payload = await getPayloadSafe();
	if (!payload) return undefined;
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
		return undefined;
	}
}

// JSON-405 method guards (sls-004): now that the route is force-dynamic (not
// force-static), the standard guards used by the other routes are safe — a
// wrong-method request returns machine-parseable JSON, not Vercel's plaintext
// FUNCTION_INVOCATION_FAILED 405.
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
