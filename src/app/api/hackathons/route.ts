/**
 * Public read-only Stellar hackathons endpoint.
 *
 *   GET /api/hackathons
 *   GET /api/hackathons?status=upcoming|active|completed
 *   GET /api/hackathons?organizer=stellar-development-foundation
 *
 * Returns curated Stellar hackathons + their project counts + winners.
 * Powers the Stellar Scout SKILL.md so AI agents can answer
 * questions like "what Stellar hackathons happened in 2025" or "who won
 * the soroban track at Stellar Hacks Agents".
 */

import { NextResponse, type NextRequest } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface HackathonRow {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	startDate: string | null;
	endDate: string | null;
	status: string;
	externalUrl: string | null;
	organizer: { id: string; name: string; slug: string } | null;
	url: string;
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const statusFilter = sp.get("status");
	const organizerFilter = sp.get("organizer");
	const limit = Math.min(Number(sp.get("limit") || "100") || 100, 300);

	const payload = await getPayloadSafe();
	let hackathons: HackathonRow[] = [];

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
			const where: any = {};
			if (statusFilter && ["upcoming", "active", "completed"].includes(statusFilter)) {
				where.status = { equals: statusFilter };
			}

			const result = await payload.find({
				collection: "hackathons",
				where,
				limit,
				depth: 1,
				sort: "-startDate",
			});

			hackathons = (
				result.docs as Array<{
					id: string;
					name: string;
					slug: string;
					description?: string;
					startDate?: string;
					endDate?: string;
					status: string;
					externalUrl?: string;
					organizer?: { id: string; name: string; slug: string } | string;
				}>
			).map((h) => {
				const org =
					h.organizer && typeof h.organizer === "object"
						? {
								id: String(h.organizer.id),
								name: h.organizer.name,
								slug: h.organizer.slug,
							}
						: null;
				return {
					id: String(h.id),
					name: h.name,
					slug: h.slug,
					description: h.description ?? null,
					startDate: h.startDate ?? null,
					endDate: h.endDate ?? null,
					status: h.status,
					externalUrl: h.externalUrl ?? null,
					organizer: org,
					url: `https://stellarlight.xyz/hackathons/${h.slug}`,
				};
			});

			if (organizerFilter) {
				hackathons = hackathons.filter(
					(h) => h.organizer?.slug === organizerFilter,
				);
			}
		} catch {
			// fall through with empty list
		}
	}

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/hackathons",
				generatedAt: new Date().toISOString(),
				filters: { status: statusFilter, organizer: organizerFilter, limit },
			},
			hackathons,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
}
