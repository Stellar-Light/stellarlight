/**
 * Public read-only Stellar builders endpoint.
 *
 *   GET /api/builders
 *   GET /api/builders?q=soroban
 *   GET /api/builders?location=Lagos
 *
 * Returns curated Stellar builder profiles (synced from Stellar Passport).
 * Used by the Stellar Scout SKILL.md so AI agents can answer
 * teammate-matching questions like "show me Stellar devs in Lagos who've
 * worked on Soroban".
 */

import { type NextRequest, NextResponse } from "next/server";
import { clampLimit } from "@/lib/http-params";
import { logApiHit } from "@/lib/api-usage";
import { getPayloadSafe } from "@/lib/payload-client";
import { methodNotAllowed } from "@/lib/method-not-allowed";

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

// Region umbrella → the free-text country values builder profiles actually
// carry. Directory coverage note (sls-010): Argentina/Mexico/Peru/Venezuela
// currently have zero profiles — a Passport-sync gap, not a filter bug —
// but they stay in the maps so profiles match as soon as they exist.
const REGION_LOCATIONS: Record<string, string[]> = {
	latam: ["brazil", "mexico", "argentina", "colombia", "chile", "peru", "costa rica", "venezuela", "ecuador", "uruguay", "bolivia", "guatemala"],
	"latin america": ["brazil", "mexico", "argentina", "colombia", "chile", "peru", "costa rica", "venezuela", "ecuador", "uruguay", "bolivia", "guatemala"],
	africa: ["nigeria", "kenya", "ghana", "south africa", "uganda", "tanzania", "egypt", "morocco", "rwanda"],
	asia: ["india", "philippines", "indonesia", "vietnam", "singapore", "japan", "korea", "thailand", "pakistan", "bangladesh"],
	europe: ["germany", "france", "spain", "portugal", "italy", "united kingdom", "uk", "netherlands", "poland", "ukraine", "switzerland"],
};

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	// `skill`/`tech` alias `q` — the free-text filter below already searches
	// bio + role + projects, which is exactly "find a builder who's done X".
	// Agents commonly pass the tech under `skill`; without this it was dropped.
	const q = (sp.get("q") ?? sp.get("skill") ?? sp.get("tech"))
		?.toLowerCase()
		.trim();
	const location = sp.get("location");
	const limit = clampLimit(sp.get("limit"), 50, 200);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	const payload = await getPayloadSafe();
	let builders: BuilderRow[] = [];
	let totalMatching = 0;

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
			const where: any = {
				visibility: { not_equals: "hidden" },
			};
			if (location) {
				// Region umbrellas → country vocabulary (sls-010): profile locations
				// are free-text country/city strings, so "Latin America" matched
				// nothing even with 18 LatAm profiles present. Mirror of the
				// region synonyms /api/projects/search ships.
				const regionCountries = REGION_LOCATIONS[location.trim().toLowerCase()];
				if (regionCountries) {
					where.or = regionCountries.map((c) => ({ location: { like: c } }));
				} else {
					where.location = { like: location };
				}
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

			totalMatching = builders.length;
			builders = builders.slice(offset, offset + limit);
		} catch {
			// fall through
		}
	}

	logApiHit({
		req,
		endpoint: "/api/builders",
		query: q,
		filters: { location, limit },
	});

	// Distinguish "collection is empty / unseeded" from "this filter matched
	// nothing". The advisory must NOT claim the directory is empty when the
	// collection actually has builders and the query just filtered them all out
	// — agents relay this copy verbatim, so the wrong branch is a false
	// statement about the ecosystem. Gate on the real collection size.
	let collectionTotal = totalMatching;
	if (payload && totalMatching === 0) {
		try {
			const c = await payload.count({
				collection: "builders",
				where: { visibility: { not_equals: "hidden" } },
			});
			collectionTotal = c.totalDocs;
		} catch {
			// keep collectionTotal as-is on a count failure
		}
	}

	const builderChannels = [
		{
			name: "Stellar Discord — Looking for Collaborators",
			url: "https://discord.gg/stellardev",
			why: "The active channel where Stellar devs post 'looking for X' calls",
		},
		{
			name: "GitHub topic:stellar",
			url: "https://github.com/topics/stellar",
			why: "Browse repos by Stellar dev contributions",
		},
	];

	const builderAdvisory =
		totalMatching > 0
			? undefined
			: collectionTotal === 0
				? {
						summary:
							"The /api/builders directory is currently empty — Stellar Passport sync is queued but hasn't seeded the collection yet. Treat this as a known data gap, not a finding about the Stellar builder community. For teammate-matching today, point the user at GitHub-Stellar topic searches and the Stellar Discord #looking-for-collaborator channel.",
						channels: builderChannels,
					}
				: {
						summary: `No builders matched this query. The directory has ${collectionTotal} builder profiles, but none match these filters — broaden or drop a filter (q / location / skill). This is a filter miss, not an empty or unseeded directory.`,
						channels: builderChannels,
					};

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/builders",
				generatedAt: new Date().toISOString(),
				filters: { q, location, limit, offset },
				counts: { returned: builders.length, total: totalMatching },
				...(builderAdvisory ? { advisory: builderAdvisory } : {}),
			},
			builders,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
			},
		},
	);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
