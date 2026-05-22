/**
 * Public read-only Stellar builders endpoint.
 *
 *   GET /api/builders
 *   GET /api/builders?q=soroban
 *   GET /api/builders?location=Lagos
 *   GET /api/builders?scfTier=gold
 *   GET /api/builders?featured=1
 *
 * Returns curated Stellar builder profiles (synced from Stellar Passport).
 * Used by the Hackathon Copilot SKILL.md so AI agents can answer
 * teammate-matching questions like "show me Stellar devs in Lagos who've
 * worked on Soroban".
 */

import { NextResponse, type NextRequest } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface BuilderProject {
	name: string;
	slug?: string;
	short_description?: string;
	status?: string;
}

interface BuilderRow {
	githubUsername: string;
	displayName: string;
	bio: string | null;
	roleTitle: string | null;
	location: string | null;
	websiteUrl: string | null;
	twitterHandle: string | null;
	avatarUrl: string | null;
	scfTier: string | null;
	isFeatured: boolean;
	projectCount: number;
	projects: BuilderProject[];
	url: string;
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const q = sp.get("q")?.toLowerCase().trim();
	const location = sp.get("location");
	const scfTier = sp.get("scfTier");
	const featured = sp.get("featured") === "1";
	const limit = Math.min(Number(sp.get("limit") || "50") || 50, 200);

	const payload = await getPayloadSafe();
	let builders: BuilderRow[] = [];

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
			const where: any = {
				visibility: { not_equals: "hidden" },
			};
			if (location) {
				where.location = { like: location };
			}
			if (scfTier) {
				where.scf_tier = { equals: scfTier };
			}
			if (featured) {
				where.is_featured = { equals: true };
			}

			const result = await payload.find({
				collection: "builders",
				where,
				limit: 300,
				depth: 0,
				sort: "-is_featured",
			});

			builders = (
				result.docs as Array<{
					github_username: string;
					display_name?: string;
					bio?: string;
					role_title?: string;
					location?: string;
					website_url?: string;
					twitter_handle?: string;
					avatar_url?: string;
					scf_tier?: string;
					is_featured?: boolean;
					projects?: BuilderProject[];
				}>
			).map((b) => ({
				githubUsername: b.github_username,
				displayName: b.display_name ?? b.github_username,
				bio: b.bio ?? null,
				roleTitle: b.role_title ?? null,
				location: b.location ?? null,
				websiteUrl: b.website_url ?? null,
				twitterHandle: b.twitter_handle ?? null,
				avatarUrl: b.avatar_url ?? null,
				scfTier: b.scf_tier ?? null,
				isFeatured: !!b.is_featured,
				projectCount: (b.projects ?? []).length,
				projects: b.projects ?? [],
				url: `https://stellarlight.xyz/builders/${b.github_username}`,
			}));

			// Free-text filter across bio + role + projects — done in-memory so
			// we don't need full-text indexes in the DB.
			if (q) {
				const tokens = q.split(/\s+/).filter(Boolean);
				builders = builders.filter((b) => {
					const haystack = [
						b.displayName,
						b.bio,
						b.roleTitle,
						b.location,
						...(b.projects ?? []).flatMap((p) => [
							p.name,
							p.short_description ?? "",
						]),
					]
						.join(" ")
						.toLowerCase();
					return tokens.every((t) => haystack.includes(t));
				});
			}

			builders = builders.slice(0, limit);
		} catch {
			// fall through
		}
	}

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/builders",
				generatedAt: new Date().toISOString(),
				filters: { q, location, scfTier, featured, limit },
			},
			builders,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
}
