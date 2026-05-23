/**
 * Public read-only projects search — find existing Stellar projects.
 * Powers Stellar Scout's "has anyone built this?" / competitor-lookup
 * questions.
 *
 *   GET /api/projects/search?q=stablecoin
 *   GET /api/projects/search?category=Protocol/Contract&scfAwarded=1
 *   GET /api/projects/search?hackathon=stellar-hacks-agents
 *
 * Full-text-ish search across name + short description + category. Not a
 * proper vector search — that's Phase 2. This is keyword overlap, scored
 * by how many query tokens hit each project.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface ProjectRow {
	id: string;
	name: string;
	slug: string;
	category: string;
	shortDescription: string | null;
	status: string;
	scfAwarded: boolean;
	scfTotalAwardedUSD: number | null;
	hackathon: { id: string; name: string; slug: string } | null;
	hackathonPlacement: string | null;
	hackathonPrize: number | null;
	hackathonPrizeTrack: string | null;
	score: number;
	url: string;
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const q = sp.get("q")?.trim() ?? "";
	const category = sp.get("category");
	const hackathonSlug = sp.get("hackathon");
	const scfAwardedOnly = sp.get("scfAwarded") === "1";
	const limit = Math.min(Number(sp.get("limit") || "20") || 20, 100);

	const payload = await getPayloadSafe();
	let projects: ProjectRow[] = [];

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
			const where: any = {
				status: { in: ["Development", "Pre-Release", "Live"] },
			};
			if (category) {
				where.category = { equals: category };
			}
			if (hackathonSlug) {
				// Resolve hackathon slug → id first
				const hk = await payload.find({
					collection: "hackathons",
					where: { slug: { equals: hackathonSlug } },
					limit: 1,
					depth: 0,
				});
				const hkId = hk.docs[0]?.id;
				if (hkId) where.hackathon = { equals: hkId };
			}
			if (scfAwardedOnly) {
				where["scf.awarded"] = { equals: true };
			}

			const result = await payload.find({
				collection: "projects",
				where,
				limit: 500,
				depth: 1,
			});

			const tokens = q
				.toLowerCase()
				.split(/\s+/)
				.filter((t) => t.length > 1);

			projects = (
				result.docs as Array<{
					id: string;
					name: string;
					slug: string;
					category: string;
					shortDescription?: string;
					status: string;
					scf?: { awarded?: boolean; totalAwarded?: number };
					hackathon?:
						| { id: string; name: string; slug: string }
						| string
						| null;
					hackathonPlacement?: string;
					hackathonPrize?: number;
					hackathonPrizeTrack?: string;
				}>
			).map((p) => {
				const hay = `${p.name} ${p.shortDescription ?? ""} ${p.category}`.toLowerCase();
				const score = tokens.length
					? tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0)
					: 1;
				const hk =
					p.hackathon && typeof p.hackathon === "object"
						? {
								id: String(p.hackathon.id),
								name: p.hackathon.name,
								slug: p.hackathon.slug,
							}
						: null;
				return {
					id: String(p.id),
					name: p.name,
					slug: p.slug,
					category: p.category,
					shortDescription: p.shortDescription ?? null,
					status: p.status,
					scfAwarded: !!p.scf?.awarded,
					scfTotalAwardedUSD: p.scf?.totalAwarded ?? null,
					hackathon: hk,
					hackathonPlacement: p.hackathonPlacement ?? null,
					hackathonPrize: p.hackathonPrize ?? null,
					hackathonPrizeTrack: p.hackathonPrizeTrack ?? null,
					score,
					url: `https://stellarlight.xyz/project/${p.slug}`,
				};
			});

			if (tokens.length) {
				projects = projects.filter((p) => p.score > 0);
				projects.sort((a, b) => b.score - a.score);
			} else {
				projects.sort((a, b) => Number(b.scfAwarded) - Number(a.scfAwarded));
			}

			projects = projects.slice(0, limit);
		} catch {
			// fall through
		}
	}

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				filters: { q, category, hackathon: hackathonSlug, scfAwardedOnly, limit },
			},
			projects,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
			},
		},
	);
}
