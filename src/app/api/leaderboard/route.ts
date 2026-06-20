/**
 * Public read-only leaderboard endpoint.
 *
 *   GET /api/leaderboard
 *   GET /api/leaderboard?range=30d&sort=activity&category=DeFi
 *   GET /api/leaderboard?format=csv
 *
 * Returns ranked Stellar ecosystem projects + ecosystem-wide aggregates +
 * the Electric Capital developer snapshot. Designed so other dashboards,
 * Dune queries, wallets, and researchers can build on top of stellarlight
 * data without scraping.
 */

import { NextResponse, type NextRequest } from "next/server";
import { clampLimit } from "@/lib/http-params";
import { getPayloadSafe } from "@/lib/payload-client";
import ecData from "@/data/electric-capital-stellar.json";
import { logApiHit } from "@/lib/api-usage";

export const dynamic = "force-dynamic";
export const revalidate = 300; // 5 min — Payload data is cheap, but no point hammering it

interface ProjectRow {
	rank: number;
	id: string;
	name: string;
	slug: string;
	category: string;
	shortDescription: string | null;
	scfAwarded: boolean;
	github: {
		totalStars: number;
		openIssuesTotal: number;
		lastActivityAt: string | null;
		repoCount: number;
	};
}

function csvEscape(value: unknown): string {
	if (value === null || value === undefined) return "";
	const s = String(value);
	if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

function toCsv(rows: ProjectRow[]): string {
	const header = [
		"rank",
		"name",
		"slug",
		"category",
		"scf_awarded",
		"stars",
		"open_issues",
		"repo_count",
		"last_activity_at",
		"short_description",
	].join(",");
	const lines = rows.map((r) =>
		[
			r.rank,
			r.name,
			r.slug,
			r.category,
			r.scfAwarded,
			r.github.totalStars,
			r.github.openIssuesTotal,
			r.github.repoCount,
			r.github.lastActivityAt ?? "",
			r.shortDescription ?? "",
		]
			.map(csvEscape)
			.join(","),
	);
	return [header, ...lines].join("\n");
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const sort = (sp.get("sort") || "activity").toLowerCase();
	const range = (sp.get("range") || "all").toLowerCase();
	const category = sp.get("category");
	const format = (sp.get("format") || "json").toLowerCase();
	const limit = clampLimit(sp.get("limit"), 50, 300);

	// Reject unrecognized sort/range instead of silently falling back to a
	// surprising order or an empty set. Matches the 400+validX pattern used
	// elsewhere (hackathons/research/skills).
	const VALID_SORTS = ["activity", "stars", "issues"] as const;
	const VALID_RANGES = ["7d", "30d", "90d", "1y", "all"] as const;
	if (!(VALID_SORTS as readonly string[]).includes(sort)) {
		return NextResponse.json(
			{ error: `Invalid sort '${sort}'.`, validSorts: VALID_SORTS },
			{ status: 400 },
		);
	}
	if (!(VALID_RANGES as readonly string[]).includes(range)) {
		return NextResponse.json(
			{ error: `Invalid range '${range}'.`, validRanges: VALID_RANGES },
			{ status: 400 },
		);
	}

	const payload = await getPayloadSafe();
	let rows: ProjectRow[] = [];

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload's Where type is awkward; matches the leaderboard page's usage
			const projectWhere: any = {
				status: { in: ["Development", "Pre-Release", "Live"] },
			};
			if (category && category !== "all") {
				projectWhere.category = { equals: category };
			}

			const projectsResult = await payload.find({
				collection: "projects",
				where: projectWhere,
				limit: 300,
				depth: 0,
			});

			// Per-project GitHub stats come from the enriched `repos` collection
			// (keyed by projectSlug, populated by enrich-repos — real stars,
			// openIssues, lastCommitAt). The legacy `signals` cache this endpoint
			// used is no longer populated, so every project read back as zeros.
			const projectSlugs = projectsResult.docs.map(
				(p: { slug: string }) => p.slug,
			);
			const reposByProjectSlug = new Map<
				string,
				Array<{ stars?: number; openIssues?: number; lastCommitAt?: string | null }>
			>();
			if (projectSlugs.length > 0) {
				const reposResult = await payload.find({
					collection: "repos",
					where: { projectSlug: { in: projectSlugs } },
					limit: 5000,
					depth: 0,
				});
				for (const r of reposResult.docs as Array<{
					projectSlug?: string;
					stars?: number;
					openIssues?: number;
					lastCommitAt?: string | null;
				}>) {
					if (!r.projectSlug) continue;
					if (!reposByProjectSlug.has(r.projectSlug))
						reposByProjectSlug.set(r.projectSlug, []);
					reposByProjectSlug.get(r.projectSlug)?.push(r);
				}
			}

			rows = (
				projectsResult.docs as Array<{
					id: string;
					name: string;
					slug: string;
					category: string;
					shortDescription?: string | null;
					scf?: { awarded?: boolean };
				}>
			).map((project) => {
				const repos = reposByProjectSlug.get(project.slug) ?? [];
				const totalStars = repos.reduce((s, r) => s + (r.stars ?? 0), 0);
				const openIssuesTotal = repos.reduce(
					(s, r) => s + (r.openIssues ?? 0),
					0,
				);
				let lastActivityAt: string | null = null;
				for (const r of repos) {
					if (
						r.lastCommitAt &&
						(!lastActivityAt ||
							new Date(r.lastCommitAt).getTime() >
								new Date(lastActivityAt).getTime())
					) {
						lastActivityAt = r.lastCommitAt as string;
					}
				}
				return {
					rank: 0,
					id: String(project.id),
					name: project.name,
					slug: project.slug,
					category: project.category,
					shortDescription: project.shortDescription ?? null,
					scfAwarded: !!project.scf?.awarded,
					github: {
						totalStars,
						openIssuesTotal,
						lastActivityAt,
						repoCount: repos.length,
					},
				};
			});

			// Time-range filter
			if (range !== "all") {
				const cutoff = new Date();
				if (range === "7d") cutoff.setDate(cutoff.getDate() - 7);
				else if (range === "30d") cutoff.setDate(cutoff.getDate() - 30);
				else if (range === "90d") cutoff.setDate(cutoff.getDate() - 90);
				else if (range === "1y") cutoff.setDate(cutoff.getDate() - 365);
				rows = rows.filter(
					(r) =>
						r.github.lastActivityAt &&
						new Date(r.github.lastActivityAt).getTime() >= cutoff.getTime(),
				);
			}

			// Sort
			if (sort === "activity") {
				rows.sort((a, b) => {
					const ad = a.github.lastActivityAt
						? new Date(a.github.lastActivityAt).getTime()
						: 0;
					const bd = b.github.lastActivityAt
						? new Date(b.github.lastActivityAt).getTime()
						: 0;
					return bd - ad;
				});
			} else if (sort === "stars") {
				rows.sort((a, b) => b.github.totalStars - a.github.totalStars);
			} else if (sort === "issues") {
				rows.sort(
					(a, b) => b.github.openIssuesTotal - a.github.openIssuesTotal,
				);
			}

			rows = rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
		} catch {
			// fall through with empty rows
		}
	}

	logApiHit({
		req,
		endpoint: "/api/leaderboard",
		filters: { sort, range, category, limit, format },
	});

	if (format === "csv") {
		return new NextResponse(toCsv(rows), {
			headers: {
				"Content-Type": "text/csv; charset=utf-8",
				"Content-Disposition": `attachment; filename="stellar-leaderboard.csv"`,
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		});
	}

	const ec = ecData as {
		asOf: string;
		refreshedAt: string;
		mad: { total: number; exclusive: number; multichain: number };
		commits28d: { total: number };
		tenure: { fullTime: number; partTime: number; oneTime: number };
	};

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/leaderboard",
				generatedAt: new Date().toISOString(),
				filters: { sort, range, category, limit },
				// /scout/api-reference is the live API docs page. A /methodology
				// page was referenced here historically but never built — caught
				// by scripts/verify-claims.ts.
				docs: "https://stellarlight.xyz/scout/api-reference",
			},
			ecosystem: {
				asOf: ec.asOf,
				activeDevs28d: ec.mad.total,
				stellarOnlyDevs28d: ec.mad.exclusive,
				multichainDevs28d: ec.mad.multichain,
				commits28d: ec.commits28d.total,
				fullTimeDevs: ec.tenure.fullTime,
				partTimeDevs: ec.tenure.partTime,
				oneTimeDevs: ec.tenure.oneTime,
			},
			projects: rows,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
}
