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
import { SDF_SKILL_NAMES } from "@/lib/integrations/sdf-skills";
import { getPayloadSafe } from "@/lib/payload-client";

const SITE_URL = "https://stellarlight.xyz";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const now = new Date();

	const staticRoutes: MetadataRoute.Sitemap = [
		{ url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
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
			url: `${SITE_URL}/partners`,
			lastModified: now,
			changeFrequency: "daily",
			priority: 0.8,
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
	];

	const sdfSkillUrls: MetadataRoute.Sitemap = SDF_SKILL_NAMES.map((slug) => ({
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

	return [
		...staticRoutes,
		...sdfSkillUrls,
		...curatedSkillUrls,
		...communitySkillUrls,
	];
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
