/**
 * sitemap.xml generator.
 *
 * Static top-level routes + every detail page we can rank: projects,
 * entities, partners, blog posts, skills and stablecoins, plus the directory
 * category pages. Next.js
 * serves this at /sitemap.xml automatically (App Router convention).
 *
 * Skills inclusion is the SEO unlock — 30+ indexable URLs the moment this
 * ships. Without sitemap entries Google takes weeks to crawl them via
 * /skills link discovery; with entries they're submitted directly.
 */

import type { MetadataRoute } from "next";
import { DIRECTORY_CATEGORIES } from "@/lib/directory-categories";
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
		{
			url: `${SITE_URL}/stablecoins`,
			lastModified: now,
			changeFrequency: "daily",
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

	// Category landing pages: /directory/wallets, /directory/anchors, and the
	// rest. Each is a real slice with its own title, h1 and ItemList — the
	// queries people type instead of "directory".
	const categoryUrls: MetadataRoute.Sitemap = DIRECTORY_CATEGORIES.map((c) => ({
		url: `${SITE_URL}/directory/${c.slug}`,
		lastModified: now,
		changeFrequency: "daily" as const,
		priority: 0.8,
	}));

	return [
		...staticRoutes,
		...categoryUrls,
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
		collection:
			| "projects"
			| "entities"
			| "partner-accounts"
			| "blog"
			| "stablecoins"
			| "hackathons",
		prefix: string,
		where: Record<string, unknown>,
		priority: number,
		/** The field the DETAIL ROUTE keys on. Stablecoin pages are
		 *  /stablecoins/[assetId], not [slug] — defaulting to slug here is how
		 *  41 finished pages stayed out of the sitemap. */
		key: "slug" | "assetId" = "slug",
	) => {
		try {
			const res = await payload.find({
				collection,
				where,
				limit: 5000,
				depth: 0,
				select: { [key]: true, updatedAt: true },
			} as any);
			for (const d of res.docs as unknown as Array<
				Record<string, string | undefined>
			>) {
				const id = d[key];
				if (!id) continue;
				out.push({
					url: `${SITE_URL}${prefix}/${id}`,
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
	// Finished detail pages that were never submitted. Each renders a unique
	// title, description and h1 today — they were simply missing from here, so
	// discovery depended on a crawler walking in from the list page.
	//   stablecoins  46 rows, keyed by assetId — live and submitted
	//
	// hackathons stays wired but contributes NOTHING today, and that is worth
	// stating rather than leaving as a silent zero: /hackathons is served from
	// the DoraHacks API at request time, the `hackathons` COLLECTION the detail
	// route queries is empty, and /hackathons/<any dorahacks slug> 404s. There
	// are no detail pages to submit. Left in place so the day that collection
	// is populated the pages are submitted without anyone remembering to come
	// back here — the pull is a no-op until then.
	await pull("stablecoins", "/stablecoins", {}, 0.6, "assetId");
	await pull("hackathons", "/hackathons", {}, 0.6);
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
