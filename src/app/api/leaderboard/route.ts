/**
 * Public read-only leaderboard endpoint.
 *
 *   GET /api/leaderboard
 *   GET /api/leaderboard?range=30d&sort=activity&category=Tooling
 *   GET /api/leaderboard?format=csv
 *
 * Returns ranked Stellar ecosystem projects + ecosystem-wide aggregates +
 * the Electric Capital developer snapshot. Designed so other dashboards,
 * Dune queries, wallets, and researchers can build on top of stellarlight
 * data without scraping.
 */

import { type NextRequest, NextResponse } from "next/server";
import ecData from "@/data/electric-capital-stellar.json";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300; // 5 min — Payload data is cheap, but no point hammering it

interface ProjectRow {
	rank: number;
	id: string;
	name: string;
	slug: string;
	category: string;
	// sls-036 / #524: per-row product-type taxonomy (the same `types[]` the
	// projects directory carries), so a consumer can see WHY a row matched a
	// ?type= filter — and build explicit groupings (DEX + Lending) instead of
	// inferring them from the broad category.
	types: string[];
	shortDescription: string | null;
	scfAwarded: boolean;
	// DefiLlama-verified TVL (2026-07-21 institutional battery: sort=tvl was
	// the natural "top DeFi by TVL" ask and 400'd). null = NOT TRACKED on
	// DefiLlama — never "zero TVL" (class 3); tvlAsOf dates the number
	// (class 8).
	tvlUSD: number | null;
	tvlAsOf: string | null;
	// On-chain issued-asset stats (2026-07-21 institutional battery: "biggest
	// stablecoin by supply" had no sort). From stellar.expert via
	// enrich-onchain-projects.ts; null = NOT TRACKED (no verified issued asset
	// in our on-chain seed set), never "zero supply". assetSupply is circulating
	// supply in whole asset units; assetCode names the asset (USDC, CETES, …).
	assetCode: string | null;
	assetSupply: number | null;
	assetHolders: number | null;
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
		"types",
		"scf_awarded",
		"stars",
		"open_issues",
		"repo_count",
		"last_activity_at",
		"tvl_usd",
		"asset_code",
		"asset_supply",
		"asset_holders",
		"short_description",
	].join(",");
	const lines = rows.map((r) =>
		[
			r.rank,
			r.name,
			r.slug,
			r.category,
			r.types.join(";"),
			r.scfAwarded,
			r.github.totalStars,
			r.github.openIssuesTotal,
			r.github.repoCount,
			r.github.lastActivityAt ?? "",
			r.tvlUSD ?? "",
			r.assetCode ?? "",
			r.assetSupply ?? "",
			r.assetHolders ?? "",
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
	const VALID_SORTS = ["activity", "stars", "issues", "tvl", "supply"] as const;
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
	// Reject an unrecognized category (was 200 with 0 rows — drift report #8).
	// Mirrors the project `category` select options in src/collections/Projects.ts.
	const VALID_CATEGORIES = [
		"Infrastructure",
		"Tooling",
		"Partner Integration",
		"User-Facing App",
		"Asset",
		"Protocol/Contract",
		"Anchor",
	] as const;
	if (
		category &&
		category !== "all" &&
		!(VALID_CATEGORIES as readonly string[]).includes(category)
	) {
		return NextResponse.json(
			{
				error: `Invalid category '${category}'.`,
				validCategories: VALID_CATEGORIES,
			},
			{ status: 400 },
		);
	}
	// Project-type filter (sls-036 / #524): ?type= was silently ignored — a
	// caller sending type=DEX got the byte-identical unfiltered ranking while
	// believing they'd scoped it. Repeatable (?type=DEX&type=Lending) and
	// comma-separable (?type=DEX,Lending) so a consumer-defined grouping like
	// "DeFi = DEX + Lending" is EXPLICIT rather than implied by a broad
	// category. Values validate against the same `types` select options the
	// projects directory uses (src/collections/Projects.ts — mirrors the
	// /api/projects/search type param); unknown values 400 with the valid list.
	const VALID_TYPES = [
		"Wallet",
		"DEX",
		"Lending",
		"Bridge",
		"Infrastructure",
		"Payments",
		"Anchor",
		"SDK",
		"Indexer",
		"Explorer",
		"Analytics",
		"AI",
		"Gaming",
		"Education",
		"Security",
		"NFT",
		"RWA",
		"Stablecoin",
		"Social Impact",
		"RPC",
		"Faucet",
	] as const;
	const typeList = sp
		.getAll("type")
		.flatMap((v) => v.split(","))
		.map((v) => v.trim())
		.filter(Boolean);
	const badType = typeList.find(
		(t) => !(VALID_TYPES as readonly string[]).includes(t),
	);
	if (badType !== undefined) {
		return NextResponse.json(
			{ error: `Invalid type '${badType}'.`, validTypes: VALID_TYPES },
			{ status: 400 },
		);
	}
	const VALID_FORMATS = ["json", "csv"] as const;
	if (!(VALID_FORMATS as readonly string[]).includes(format)) {
		return NextResponse.json(
			{ error: `Invalid format '${format}'.`, validFormats: VALID_FORMATS },
			{ status: 400 },
		);
	}

	const payload = await getPayloadSafe();
	let rows: ProjectRow[] = [];
	// sls-036 residual: the repository-index rollup timestamp — when the repo
	// rows this response aggregates were last refreshed (max updatedAt across
	// the fetched index rows). Distinct from meta.generatedAt (serialization
	// time): the served stars/issues/lastActivityAt are as-of THIS timestamp,
	// not a live GitHub read. Null when no repos matched.
	let dataAsOf: string | null = null;

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload's Where type is awkward; matches the leaderboard page's usage
			const projectWhere: any = {
				status: { in: ["Development", "Pre-Release", "Live"] },
			};
			if (category && category !== "all") {
				projectWhere.category = { equals: category };
			}
			if (typeList.length) {
				// sls-036 / #524: `types` is a hasMany select. Use `in` (EXACT element
				// match, any-membership) for BOTH the single- and multi-value case —
				// NEVER `contains`. Payload's `contains` compiles to a case-insensitive
				// SUBSTRING regex, so `contains: "DEX"` false-matched "In-DEX-er" and
				// "Co-dex" (live #524 recheck: type=DEX returned Indexer rows). `in`
				// matches whole elements, so ?type=DEX&type=Lending keeps projects
				// typed EITHER. Applied in the DB query, BEFORE ranking and limiting;
				// a JS exact-membership backstop below re-asserts it regardless.
				projectWhere.types = { in: typeList };
			}

			const projectsResult = await payload.find({
				collection: "projects",
				where: projectWhere,
				// Raven cold-agent catch (2026-07-20): limit 300 with NO sort made
				// the ranking population an ARBITRARY 300 of ~850 eligible projects
				// — blend/phoenix/soroswap never entered the leaderboard at all.
				// Fetch every eligible row; the narrow select keeps this cheap on
				// M0 (the old {embedding:false} still dragged descriptions and
				// coverage for rows we only read 6 scalars from).
				limit: 2000,
				depth: 0,
				select: {
					name: true,
					slug: true,
					category: true,
					types: true,
					shortDescription: true,
					scf: true,
					tvlUSD: true,
					tvlAsOf: true,
					onchain: true,
				},
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
				Array<{
					stars?: number;
					openIssues?: number;
					lastCommitAt?: string | null;
				}>
			>();
			if (projectSlugs.length > 0) {
				const reposResult = await payload.find({
					collection: "repos",
					where: { projectSlug: { in: projectSlugs } },
					limit: 5000,
					depth: 0,
					// Only the stats we aggregate — NOT the README excerpt, which
					// bloated this fetch enough to time the endpoint out as the repos
					// collection grew past 2,000 docs.
					select: {
						projectSlug: true,
						stars: true,
						openIssues: true,
						lastCommitAt: true,
						// sls-036: index-refresh timestamp feeds meta.dataAsOf
						updatedAt: true,
					},
				});
				for (const r of reposResult.docs as Array<{
					projectSlug?: string;
					stars?: number;
					openIssues?: number;
					lastCommitAt?: string | null;
					updatedAt?: string | null;
				}>) {
					// ISO-8601 strings compare correctly lexicographically.
					if (r.updatedAt && (!dataAsOf || r.updatedAt > dataAsOf))
						dataAsOf = r.updatedAt;
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
					types?: string[];
					shortDescription?: string | null;
					scf?: { awarded?: boolean };
					tvlUSD?: number | null;
					tvlAsOf?: string | null;
					onchain?: {
						assetCode?: string | null;
						assetSupply?: number | null;
						assetHolders?: number | null;
					} | null;
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
					types: Array.isArray(project.types) ? project.types : [],
					shortDescription: project.shortDescription ?? null,
					scfAwarded: !!project.scf?.awarded,
					tvlUSD: project.tvlUSD ?? null,
					tvlAsOf: project.tvlAsOf ?? null,
					assetCode:
						typeof project.onchain?.assetCode === "string"
							? project.onchain.assetCode
							: null,
					assetSupply:
						typeof project.onchain?.assetSupply === "number"
							? project.onchain.assetSupply
							: null,
					assetHolders:
						typeof project.onchain?.assetHolders === "number"
							? project.onchain.assetHolders
							: null,
					github: {
						totalStars,
						openIssuesTotal,
						lastActivityAt,
						repoCount: repos.length,
					},
				};
			});

			// Exact-membership backstop (mirrors projects/search's belt-and-
			// suspenders type gate): the DB `in` above is already exact for this
			// field, but re-asserting membership in JS means a future operator or
			// field-config change can never silently leak a substring false-positive
			// back into a contract endpoint Tyler audits (#524).
			if (typeList.length) {
				rows = rows.filter((r) => r.types.some((t) => typeList.includes(t)));
			}

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
			} else if (sort === "tvl") {
				// null = NOT TRACKED on DefiLlama (class 3) — untracked projects
				// sort BELOW every tracked one (including tracked ~$0), never
				// interleaved as if they had zero TVL.
				rows.sort((a, b) => {
					if (a.tvlUSD === null && b.tvlUSD === null) return 0;
					if (a.tvlUSD === null) return 1;
					if (b.tvlUSD === null) return -1;
					return b.tvlUSD - a.tvlUSD;
				});
			} else if (sort === "supply") {
				// Circulating supply of the project's issued asset (USDC, CETES,
				// …). null = NOT TRACKED (no verified issued asset in our on-chain
				// seed set) — sorts BELOW every tracked one, never as "zero
				// supply". Pair with ?type=Stablecoin for a stablecoin board.
				rows.sort((a, b) => {
					if (a.assetSupply === null && b.assetSupply === null) return 0;
					if (a.assetSupply === null) return 1;
					if (b.assetSupply === null) return -1;
					return b.assetSupply - a.assetSupply;
				});
			}

			rows = rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 }));
		} catch {
			// fall through with empty rows
		}
	}

	logApiHit({
		req,
		endpoint: "/api/leaderboard",
		filters: { sort, range, category, limit, format, type: typeList.join(",") },
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
				// sls-036 residual: the real rollup timestamp of the repo index this
				// response aggregated — the as-of for stars/issues/lastActivityAt.
				dataAsOf,
				// #524: echo the APPLIED project-type scope so a consumer can confirm
				// the filter took (null = no type filter; an array = the exact types
				// kept, EITHER-membership). Was silently absent while the filter was
				// broken, which is how #524 diagnosed the no-op.
				filters: {
					sort,
					range,
					category,
					limit,
					type: typeList.length ? typeList : null,
				},
				// /scout/api-reference is the live API docs page. A /methodology
				// page was referenced here historically but never built — caught
				// by scripts/verify-claims.ts.
				docs: "https://stellarlight.xyz/scout/api-reference",
				// sls-036: define each served metric WHERE the numbers appear, so a
				// consumer can't relabel the activity ordering as "commit count" or
				// read the issues rollup as an activity/quality ranking.
				metricDefinitions: {
					activity:
						"sort=activity orders by github.lastActivityAt — the most recent default-branch commit timestamp (falling back to last push) across the project's indexed repos. A recency signal, NOT commit volume/velocity; per-project commit counts are not served.",
					stars:
						"github.totalStars = sum of GitHub stargazer counts across the project's indexed repos, as of the last index refresh.",
					issues:
						"github.openIssuesTotal = sum of OPEN issues across the project's indexed repos — an issue-only count (GitHub GraphQL issues(states:OPEN); EXCLUDES pull requests, so it will not match GitHub's REST open_issues_count, which includes PRs). This is a BACKLOG snapshot, not an activity or quality ranking.",
					repoCount:
						"github.repoCount = how many indexed repos are attributed to the project — our index's coverage, not the project's total GitHub footprint.",
					lastActivityAt:
						"Latest default-branch commit (fallback: last push) across the project's indexed repos, as of the last index refresh — a dated repo-source timestamp, not a live GitHub read.",
					range:
						"range=7d/30d/90d/1y keeps only projects whose lastActivityAt falls inside the window. stars/issues totals remain all-time rollups — they are NOT recomputed within the window.",
					dataAsOf:
						"meta.dataAsOf = the most recent index-refresh timestamp across the repo rows this response aggregated — every github.* number is as-of this moment, NOT a live GitHub read. Distinct from meta.generatedAt (when the response was serialized). Null when no indexed repos matched the filter.",
					tvl: "sort=tvl orders by tvlUSD — DefiLlama-verified TVL in USD, dated per-row by tvlAsOf. tvlUSD null = NOT TRACKED on DefiLlama (never 'zero TVL'); untracked projects sort below every tracked one. TVL covers DeFi-style protocols only — most projects are legitimately untracked.",
					supply:
						"sort=supply orders by assetSupply — circulating supply of the project's issued asset in whole asset units (assetCode names it: USDC, CETES, …), from stellar.expert. assetSupply null = NOT TRACKED (no verified issued asset in our on-chain seed set), never 'zero supply'; untracked projects sort below every tracked one. Covers asset ISSUERS (stablecoins, tokenized RWAs) — pair with ?type=Stablecoin for a stablecoin-only board. assetHolders = trustline holder count of the same asset.",
				},
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

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
