/**
 * robots.txt — Next.js App Router convention, served at /robots.txt.
 *
 * Was 404 until now (found by the claims audit). Allow everything except
 * the Payload admin; point crawlers at the sitemap, which carries every
 * skill detail page.
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: "/",
			disallow: "/admin",
		},
		sitemap: "https://stellarlight.xyz/sitemap.xml",
	};
}
