/**
 * Which projects support a token on Stellar, how, since when.
 *
 *   GET /api/tokens/integrations?token=USDE:GDJ5...      every edge of one token
 *   GET /api/tokens/integrations?token=USDC              a code: resolved when one issuer carries it, else candidates
 *   GET /api/tokens/integrations?project=blend           every token one project supports
 *   ...&tier=integrated&kind=dex_pool&scfAwarded=true&status=active&limit=50&offset=0
 *
 * Rows come from the token-integrations collection (scripts/refresh-token-
 * integrations.ts, weekly). SCF facts are joined here from the project row,
 * whose SCF lane is their one writer. Counts are per tier, never blended:
 * a project counts once at its best tier, network venues and unattributed
 * holders apart. Unknown params are rejected with 400.
 */
import { type NextRequest, NextResponse } from "next/server";
import type { Where } from "payload";
import { apiError } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit, clampOffset, triStateBoolParam } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { serverTiming } from "@/lib/server-timing";
import {
	codeCandidates,
	EVENTS_FLOOR,
	type IntegrationRow,
	parseTokenParam,
	summarize,
	TIER_RANK,
	TOKEN_INTEGRATION_KINDS,
	TOKEN_INTEGRATION_STATUSES,
	TOKEN_INTEGRATION_TIERS,
	USD_FLOOR,
} from "@/lib/token-integrations";

export const dynamic = "force-dynamic";
export const maxDuration = 20;
export const revalidate = 300;

const KNOWN_PARAMS = new Set([
	"token",
	"project",
	"tier",
	"kind",
	"scfAwarded",
	"status",
	"limit",
	"offset",
]);
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
};
const SERVED = [
	"key",
	"tokenId",
	"code",
	"issuer",
	"tokenKind",
	"homeDomain",
	"issuerLabel",
	"projectSlug",
	"venue",
	"kind",
	"tier",
	"tierBasis",
	"pools",
	"poolsByTier",
	"firstDate",
	"firstDateBasis",
	"lastSeenAt",
	"events90d",
	"events90dBasis",
	"balance",
	"balanceUsd",
	"balanceBasis",
	"depthUsd",
	"depthBasis",
	"bestPool",
	"evidenceUrl",
	"method",
	"attributionBasis",
	"holderSweep",
	"readAt",
	"status",
	"endedAt",
	"endedReason",
] as const;
type Row = Pick<IntegrationRow, (typeof SERVED)[number]>;

const bad = (error: string, extra: Record<string, unknown> = {}) =>
	NextResponse.json({ error, ...extra }, { status: 400, headers: CORS });

const COVERAGE = [
	"The registry layer is every pool, vault and reserve of the AMM, lending, vault, bridge and oracle protocols Stellar Index's protocol registry indexes (Aquarius, Soroswap, SushiSwap v3, Phoenix, Comet, Blend, BLNT, DeFindex, Spectra, Upshift, Rozo, Circle CCTP, Reflector DEX). A DEX, market or vault outside that registry is seen only through the holder sweep, so only where it holds a swept token.",
	"The holder sweep reads every contract holding a swept token (stablecoins, RWA tokens, and every token integrated or used anywhere): the token's whole event history when it is small enough, else a candidate set. A token's `holderSweep` says how complete it was against Horizon's contract total. USDC's sweep is the furthest from complete (about a third of the amount Horizon counts in contracts on 2026-11-23): most USDC contract holders are smart wallets no candidate set enumerates.",
	"Unattributed holders (summary.unattributedHolders, kind holder_unattributed) are contracts holding the token that no public evidence ties to one project; their balance is real and never counted as any project's support.",
	"Classic AMM pools are network venues: tiered, no project, counted apart. They are carried for tokens already in the layer; a token seen only in classic pools has no row here (check Horizon /liquidity_pools?reserves=).",
	"Not covered: the order book (SDEX), aggregators and routers, wallets (a wallet showing what an account holds is never support), centralised exchanges, SoroCredit, and the StellarExpert Top 50 list (its host is paywalled). Absence here is not proof a project does not support a token.",
	"firstDate is a pool's creation ledger where the registry dates it uniquely, else its first event (creation can be earlier); anchors, lists and issuers are undated.",
];

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const sp = req.nextUrl.searchParams;
	const unknown = [...sp.keys()].find((k) => !KNOWN_PARAMS.has(k));
	if (unknown)
		return bad(`Unknown query param '${unknown}'.`, {
			hint: `Supported: ${[...KNOWN_PARAMS].join(", ")}. Unknown parameters are rejected here, never ignored.`,
			validParams: [...KNOWN_PARAMS],
		});
	const tokenRaw = sp.get("token")?.trim() || null;
	const project = sp.get("project")?.trim().toLowerCase() || null;
	const tier = sp.get("tier") || null;
	const kind = sp.get("kind") || null;
	const status = sp.get("status") || "active";
	const scf = triStateBoolParam(sp.get("scfAwarded"));
	if (tier && !(TOKEN_INTEGRATION_TIERS as readonly string[]).includes(tier))
		return bad(`Invalid tier '${tier}'.`, {
			validTiers: TOKEN_INTEGRATION_TIERS,
		});
	if (kind && !(TOKEN_INTEGRATION_KINDS as readonly string[]).includes(kind))
		return bad(`Invalid kind '${kind}'.`, {
			validKinds: TOKEN_INTEGRATION_KINDS,
		});
	const statuses = [...TOKEN_INTEGRATION_STATUSES, "all"];
	if (!statuses.includes(status))
		return bad(`Invalid status '${status}'.`, { validStatuses: statuses });
	if (scf === "invalid")
		return bad(`Invalid scfAwarded '${sp.get("scfAwarded")}'.`, {
			validValues: ["true", "false", "1", "0"],
		});
	const token = tokenRaw ? parseTokenParam(tokenRaw) : null;
	if (token?.type === "invalid") return bad(token.error);
	const limit = clampLimit(sp.get("limit"), 50, 200);
	const offset = clampOffset(sp.get("offset"));
	const filters = {
		token: tokenRaw,
		project,
		tier,
		kind,
		scfAwarded: scf ?? null,
		status,
		limit,
		offset,
	};

	const payload = await getPayloadSafe();
	const unavailable = () =>
		apiError({
			status: 503,
			error: "token integrations store unavailable",
			advisory:
				"The datastore could not be read. This is an outage, not a claim that any project does or does not support a token. Retry shortly.",
			retryAfterSeconds: 2,
			startedAt,
			headers: CORS,
		});
	if (!payload) return unavailable();
	const select = Object.fromEntries(SERVED.map((f) => [f, true]));
	const find = async (where: Where) =>
		(
			await payload.find({
				collection: "token-integrations",
				where,
				limit: 0,
				pagination: false,
				depth: 0,
				select,
			})
		).docs as unknown as Row[];

	// An empty store is a lane that has not run, never "no support".
	const empty = async () =>
		(await payload.count({ collection: "token-integrations" })).totalDocs === 0;
	const notPopulated = () =>
		apiError({
			status: 503,
			error: "token integrations not yet populated",
			advisory:
				"The refresh lane has not written this layer yet. This is not a claim that any project does or does not support a token.",
			retryAfterSeconds: 3600,
			startedAt,
			headers: CORS,
		});

	try {
		const statusWhere: Where =
			status === "all" ? {} : { status: { equals: status } };
		// A bare code: resolve it, or hand back the candidates. Never pick one.
		let tokenId: string | null = token?.type === "id" ? token.tokenId : null;
		let tokenMeta: Record<string, unknown> | null = token
			? {
					query: tokenRaw,
					resolvedTokenId: tokenId,
					matchedBy: token.type === "id" ? "contract id or CODE:ISSUER" : null,
					candidates: null,
				}
			: null;
		if (token?.type === "code") {
			const rows = await find({
				and: [{ code: { like: token.code } }, statusWhere],
			});
			const candidates = codeCandidates(token.code, rows);
			if (!candidates.length && (await empty())) return notPopulated();
			if (candidates.length !== 1) {
				logApiHit({
					req,
					startedAt,
					status: 200,
					endpoint: "/api/tokens/integrations",
					filters,
					resultCount: 0,
				});
				return NextResponse.json(
					{
						meta: {
							...meta(filters, [], {
								query: tokenRaw,
								resolvedTokenId: null,
								matchedBy: "code",
								candidates,
								note: candidates.length
									? `${candidates.length} tokens in this layer carry the code ${token.code}: a code is not an identity, and the layer never picks one. Call again with token=<tokenId> or CODE:ISSUER for the one you mean (issuer, homeDomain and issuerLabel tell them apart; decoys usually carry a scam label and no integrated project).`
									: `No token in this layer carries the code ${token.code}. That is not proof no such asset exists or that nothing supports it: the layer covers the sources in meta.coverage.`,
							}),
							counts: null,
						},
						summary: null,
						edges: null,
					},
					{
						headers: {
							...serverTiming(startedAt),
							...CORS,
							"Cache-Control":
								"public, s-maxage=300, stale-while-revalidate=600",
						},
					},
				);
			}
			tokenId = candidates[0].tokenId;
			tokenMeta = {
				query: tokenRaw,
				resolvedTokenId: tokenId,
				matchedBy: "code (one token in the layer carries it)",
				candidates,
			};
		}
		const and: Where[] = [statusWhere];
		if (tokenId) and.push({ tokenId: { equals: tokenId } });
		if (project) and.push({ projectSlug: { equals: project } });
		if (tier) and.push({ tier: { equals: tier } });
		if (kind) and.push({ kind: { equals: kind } });
		let rows = await find({ and });
		if (!rows.length && (await empty())) return notPopulated();

		// SCF from the project rows, read now (their own lane writes them)
		const slugs = [
			...new Set(
				rows.map((r) => r.projectSlug).filter((s): s is string => !!s),
			),
		];
		if (project && !slugs.includes(project)) slugs.push(project);
		const projects = slugs.length
			? ((
					await payload.find({
						collection: "projects",
						where: { slug: { in: slugs } },
						limit: slugs.length,
						depth: 0,
						pagination: false,
						select: {
							slug: true,
							name: true,
							scf: { awarded: true, roundAwards: true },
						},
					})
				).docs as unknown as Array<{
					slug: string;
					name: string;
					scf?: {
						awarded?: boolean | null;
						roundAwards?: Array<Record<string, unknown>> | null;
					};
				}>)
			: [];
		const bySlug = new Map(projects.map((p) => [p.slug, p]));
		if (project && !bySlug.has(project))
			return bad(`Unknown project '${project}'.`, {
				hint: "Pass a directory project slug (see searchProjects).",
			});
		const awarded = (slug: string) => !!bySlug.get(slug)?.scf?.awarded;
		if (scf !== undefined)
			rows = rows.filter(
				(r) => !!r.projectSlug && awarded(r.projectSlug) === scf,
			);

		rows.sort(
			(a, b) =>
				TIER_RANK[a.tier] - TIER_RANK[b.tier] ||
				(b.depthUsd ?? -1) - (a.depthUsd ?? -1) ||
				a.key.localeCompare(b.key),
		);
		const summary = summarize(rows, awarded);
		if (tokenMeta && !rows.length)
			tokenMeta.note =
				"No edge for this token matches in this layer. That is not proof nothing supports it: meta.coverage names what the layer reads and cannot see.";
		const edges = rows.slice(offset, offset + limit).map((r) => {
			const p = r.projectSlug ? bySlug.get(r.projectSlug) : null;
			const { key, ...rest } = r;
			return {
				id: key,
				...rest,
				projectName: p?.name ?? null,
				scfAwarded: r.projectSlug ? awarded(r.projectSlug) : null,
				scfRounds: r.projectSlug
					? (p?.scf?.roundAwards ?? [])
							.filter((a) => typeof a.round === "number" || !!a.awardName)
							.map((a) => ({
								round: typeof a.round === "number" ? a.round : null,
								awardName: typeof a.awardName === "string" ? a.awardName : null,
								amountUSD: typeof a.amountUSD === "number" ? a.amountUSD : null,
							}))
					: null,
			};
		});
		logApiHit({
			req,
			startedAt,
			status: 200,
			endpoint: "/api/tokens/integrations",
			filters,
			resultCount: edges.length,
		});
		return NextResponse.json(
			{
				meta: {
					...meta(filters, rows, tokenMeta),
					counts: { matched: rows.length, returned: edges.length },
				},
				summary,
				edges,
			},
			{
				headers: {
					...serverTiming(startedAt),
					...CORS,
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
				},
			},
		);
	} catch {
		return unavailable();
	}
}

function meta(
	filters: Record<string, unknown>,
	rows: Row[],
	token: Record<string, unknown> | null,
) {
	const reads = rows
		.map((r) => r.readAt)
		.filter(Boolean)
		.sort();
	const sweeps = new Map<string, unknown>();
	for (const r of rows)
		if (r.holderSweep && !sweeps.has(r.tokenId))
			sweeps.set(r.tokenId, r.holderSweep);
	return {
		source: "https://stellarlight.xyz/api/tokens/integrations",
		generatedAt: new Date().toISOString(),
		asOf: reads.at(-1) ?? null,
		oldestReadAt: reads[0] ?? null,
		filters,
		token,
		tiers: {
			integrated:
				"the project chose the token: a lending reserve, vault or strategy asset, bridge or oracle configuration, an anchor's own stellar.toml currency, the issuer's own token, the publisher's own SEP-42 list, an Aquarius pool its rewards config pays, or a contract that is the project's own pool or vault by its public directory label",
			used: `a permissionless pool or holding with priced depth >= $${USD_FLOOR} and >= ${EVENTS_FLOOR} events in the 90 days before the read`,
			available:
				"a pool or holding below either floor, where that floor was read: reported, never counted as support",
			unrated:
				"activity or a priced leg could not be read, so neither floor could be judged: never counted as available",
		},
		order:
			"edges: tier (integrated, used, unrated, available), then priced depth, then id; not a ranking of projects",
		holderSweeps: Object.fromEntries(sweeps),
		coverage: COVERAGE,
		sources: [
			"Stellar Index (stellarindex.io): protocol registry, contract events, prices, ledger times, directory labels",
			"Soroban RPC: contract instances, token balances, read-only simulation",
			"Horizon: classic AMM pools and operations, asset contract totals",
			"Aquarius pools API (rewards config), SEP-42 asset lists, anchors' stellar.toml",
			"Stellar Light directory: projects, anchors, stablecoins, RWA registry, verified contracts",
		],
		attribution:
			"Pool, event and price data from Stellar Index, https://stellarindex.io",
	};
}

export function OPTIONS() {
	return new NextResponse(null, {
		headers: { ...CORS, "Access-Control-Allow-Headers": "Content-Type" },
	});
}
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
