/**
 * sitemap.xml generator.
 *
 * Static top-level routes + every skill detail page. Next.js serves this at
 * /sitemap.xml automatically (App Router convention).
 *
 * Skills inclusion is the SEO unlock — 30+ indexable URLs the moment this
 * ships. Without sitemap entries Google takes weeks to crawl them via
 * /skills link discovery; with entries they're submitted directly.
 */

import type { MetadataRoute } from "next";
import { CURATED_SKILLS } from "@/lib/integrations/curated-skills";
import { fetchSdfSkillNames } from "@/lib/integrations/sdf-skills";
import { getPayloadSafe } from "@/lib/payload-client";

const SITE_URL = "https://stellarlight.xyz";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const now = new Date();

	const staticRoutes: MetadataRoute.Sitemap = [
		{
			url: SITE_URL,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 1,
		},
		{
			url: `${SITE_URL}/scout`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: `${SITE_URL}/skills`,
			lastModified: now,
			changeFrequency: "daily",
			priority: 0.9,
		},
		{
			url: `${SITE_URL}/leaderboard`,
			lastModified: now,
			changeFrequency: "daily",
			priority: 0.7,
		},
		{
			url: `${SITE_URL}/ideas`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.7,
		},
		{
			url: `${SITE_URL}/hackathons`,
			lastModified: now,
			changeFrequency: "weekly",
			priority: 0.7,
		},
		// The rest of the public site. Until 2026-08 the sitemap carried 65 URLs,
		// 60 of them /skills/*, and none of the directory, partners, builders,
		// entities, blog, ask, analytics, submit, awards or any detail page.
		...(
			[
				["/directory", "daily", 0.9],
				["/partners", "daily", 0.8],
				["/builders", "daily", 0.7],
				["/entities", "weekly", 0.7],
				["/blog", "daily", 0.7],
				["/ask", "weekly", 0.6],
				["/analytics", "daily", 0.4],
				["/submit", "monthly", 0.4],
				["/experiments", "monthly", 0.3],
				["/quality", "weekly", 0.3],
			] as const
		).map(([path, changeFrequency, priority]) => ({
			url: `${SITE_URL}${path}`,
			lastModified: now,
			changeFrequency,
			priority,
		})),
	];

	// sls-062 class: live-derive (24h cache) so removed upstream skills drop
	// out of the sitemap instead of 404-lingering from the static fallback.
	const sdfSkillNames = await fetchSdfSkillNames();
	const sdfSkillUrls: MetadataRoute.Sitemap = sdfSkillNames.map((slug) => ({
		url: `${SITE_URL}/skills/${slug}`,
		lastModified: now,
		changeFrequency: "monthly",
		priority: 0.6,
	}));

	const curatedSkillUrls: MetadataRoute.Sitemap = CURATED_SKILLS.map((s) => ({
		url: `${SITE_URL}/skills/${s.slug}`,
		lastModified: now,
		changeFrequency: "monthly",
		// Featured skills (Scout, Scout MCP) signal as higher priority pages
		priority: s.featured ? 0.8 : 0.6,
	}));

	const communitySkillUrls = await loadCommunitySkillUrls(now);
	const detailUrls = await loadDetailUrls(now);

	return [
		...staticRoutes,
		...sdfSkillUrls,
		...curatedSkillUrls,
		...communitySkillUrls,
		...detailUrls,
	];
}

/** Every project, entity, published partner and blog post; one query each. */
async function loadDetailUrls(now: Date): Promise<MetadataRoute.Sitemap> {
	const payload = await getPayloadSafe();
	if (!payload) return [];
	const out: MetadataRoute.Sitemap = [];
	const pull = async (
		collection: "projects" | "entities" | "partner-accounts" | "blog",
		prefix: string,
		where: Record<string, unknown>,
		priority: number,
	) => {
		try {
			const res = await payload.find({
				collection,
				where,
				limit: 5000,
				depth: 0,
				select: { slug: true, updatedAt: true },
			} as any);
			for (const d of res.docs as Array<{
				slug?: string;
				updatedAt?: string;
			}>) {
				if (!d.slug) continue;
				out.push({
					url: `${SITE_URL}${prefix}/${d.slug}`,
					lastModified: d.updatedAt ? new Date(d.updatedAt) : now,
					changeFrequency: "weekly",
					priority,
				});
			}
		} catch {
			// a failed collection read drops that group, never the whole sitemap
		}
	};
	await pull(
		"projects",
		"/project",
		{ status: { in: ["Development", "Pre-Release", "Live"] } },
		0.6,
	);
	await pull("entities", "/entities", {}, 0.5);
	await pull(
		"partner-accounts",
		"/partners",
		{ status: { equals: "published" } },
		0.6,
	);
	await pull(
		"blog",
		"/blog",
		{
			and: [
				{ status: { equals: "published" } },
				{ isRSSExternal: { not_equals: true } },
			],
		},
		0.6,
	);
	return out;
}

async function loadCommunitySkillUrls(
	now: Date,
): Promise<MetadataRoute.Sitemap> {
	const payload = await getPayloadSafe();
	if (!payload) return [];
	try {
		const result = await payload.find({
			collection: "community-skills",
			where: { status: { equals: "approved" } },
			limit: 500,
			depth: 0,
		});
		return (result.docs as Array<{ slug: string }>).map((d) => ({
			url: `${SITE_URL}/skills/${d.slug}`,
			lastModified: now,
			changeFrequency: "monthly" as const,
			priority: 0.5,
		}));
	} catch {
		return [];
	}
}
