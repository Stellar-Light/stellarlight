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
import { getPayloadSafe } from "@/lib/payload-client";
import ecData from "@/data/electric-capital-stellar.json";

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
	const limit = Math.min(Number(sp.get("limit") || "50") || 50, 300);

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

			const projectIds = projectsResult.docs.map((p: { id: string }) =>
				String(p.id),
			);
			const signalsByProjectId = new Map<string, Record<string, unknown>>();
			if (projectIds.length > 0) {
				const signalsResult = await payload.find({
					collection: "signals",
					where: { project: { in: projectIds } },
					limit: projectIds.length,
					depth: 0,
				});
				for (const s of signalsResult.docs as Array<{
					project: string | { id: string };
				}>) {
					const pid =
						typeof s.project === "string" ? s.project : s.project?.id;
					if (pid)
						signalsByProjectId.set(String(pid), s as Record<string, unknown>);
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
				const sig = signalsByProjectId.get(String(project.id)) as
					| { github?: Record<string, unknown> }
					| undefined;
				const gh = sig?.github ?? {};
				const repos = (gh.repos as Array<{ stargazerCount?: number }>) ?? [];
				const repoStars = repos.reduce(
					(sum, r) => sum + (r.stargazerCount ?? 0),
					0,
				);
				return {
					rank: 0,
					id: String(project.id),
					name: project.name,
					slug: project.slug,
					category: project.category,
					shortDescription: project.shortDescription ?? null,
					scfAwarded: !!project.scf?.awarded,
					github: {
						totalStars: (gh.totalStars as number) ?? repoStars,
						openIssuesTotal: (gh.openIssuesTotal as number) ?? 0,
						lastActivityAt: (gh.lastActivityAt as string) ?? null,
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
				docs: "https://stellarlight.xyz/methodology",
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
