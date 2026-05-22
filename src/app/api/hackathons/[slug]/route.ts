/**
 * Single hackathon detail with full project submissions, winners, and
 * post-hackathon outcome funnel.
 *
 *   GET /api/hackathons/{slug}
 *
 * Returns the hackathon's metadata + every Project that's tagged with
 * `hackathon = {id}`, including placements, prize amounts, prize tracks,
 * and post-hack status (Built / In Progress / Abandoned).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface SubmissionRow {
	id: string;
	name: string;
	slug: string;
	category: string;
	shortDescription: string | null;
	hackathonStatus: string | null;
	hackathonPlacement: string | null;
	hackathonPrize: number | null;
	hackathonPrizeTrack: string | null;
	scfAwarded: boolean;
	url: string;
}

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ slug: string }> },
) {
	const { slug } = await params;
	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json({ error: "payload unavailable" }, { status: 503 });
	}

	try {
		const hackathonResult = await payload.find({
			collection: "hackathons",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 1,
		});
		const hackathon = hackathonResult.docs[0] as
			| {
					id: string;
					name: string;
					slug: string;
					description?: string;
					startDate?: string;
					endDate?: string;
					status: string;
					externalUrl?: string;
					organizer?: { id: string; name: string; slug: string } | string;
			}
			| undefined;

		if (!hackathon) {
			return NextResponse.json(
				{ error: `hackathon not found: ${slug}` },
				{ status: 404 },
			);
		}

		const projectsResult = await payload.find({
			collection: "projects",
			where: { hackathon: { equals: hackathon.id } },
			limit: 300,
			depth: 0,
			sort: "-hackathonPrize",
		});

		const submissions: SubmissionRow[] = (
			projectsResult.docs as Array<{
				id: string;
				name: string;
				slug: string;
				category: string;
				shortDescription?: string;
				hackathonStatus?: string;
				hackathonPlacement?: string;
				hackathonPrize?: number;
				hackathonPrizeTrack?: string;
				scf?: { awarded?: boolean };
			}>
		).map((p) => ({
			id: String(p.id),
			name: p.name,
			slug: p.slug,
			category: p.category,
			shortDescription: p.shortDescription ?? null,
			hackathonStatus: p.hackathonStatus ?? null,
			hackathonPlacement: p.hackathonPlacement ?? null,
			hackathonPrize: p.hackathonPrize ?? null,
			hackathonPrizeTrack: p.hackathonPrizeTrack ?? null,
			scfAwarded: !!p.scf?.awarded,
			url: `https://stellarlight.xyz/project/${p.slug}`,
		}));

		// Outcome funnel: how many submissions are Built / In Progress / Abandoned.
		const outcomes = {
			built: submissions.filter((s) => s.hackathonStatus === "Built").length,
			inProgress: submissions.filter((s) => s.hackathonStatus === "In Progress")
				.length,
			abandoned: submissions.filter((s) => s.hackathonStatus === "Abandoned")
				.length,
			unknown: submissions.filter((s) => !s.hackathonStatus).length,
		};

		const winners = submissions.filter((s) => !!s.hackathonPlacement);

		const totalPrizeUSD = submissions.reduce(
			(sum, s) => sum + (s.hackathonPrize ?? 0),
			0,
		);

		const org =
			hackathon.organizer && typeof hackathon.organizer === "object"
				? {
						id: String(hackathon.organizer.id),
						name: hackathon.organizer.name,
						slug: hackathon.organizer.slug,
					}
				: null;

		return NextResponse.json(
			{
				meta: {
					source: `https://stellarlight.xyz/hackathons/${slug}`,
					generatedAt: new Date().toISOString(),
				},
				hackathon: {
					id: String(hackathon.id),
					name: hackathon.name,
					slug: hackathon.slug,
					description: hackathon.description ?? null,
					startDate: hackathon.startDate ?? null,
					endDate: hackathon.endDate ?? null,
					status: hackathon.status,
					externalUrl: hackathon.externalUrl ?? null,
					organizer: org,
					stats: {
						totalSubmissions: submissions.length,
						totalPrizeUSD,
						winners: winners.length,
						outcomes,
					},
				},
				winners,
				submissions,
			},
			{
				headers: {
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
				},
			},
		);
	} catch (err) {
		console.error("hackathon detail failed", err);
		return NextResponse.json({ error: "internal error" }, { status: 500 });
	}
}
