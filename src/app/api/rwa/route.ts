import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { mergeMeasured, type RwaMeasured } from "@/lib/rwa-measured";
import {
	RWA_REGISTRY,
	RWA_REGISTRY_AS_OF,
	type RwaAsset,
	type RwaState,
	type RwaVerificationLevel,
} from "@/data/rwa-registry";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const KNOWN_PARAMS = new Set(["state", "level", "kind", "project", "limit"]);
const STATES: RwaState[] = [
	"live",
	"issued-single-holder",
	"deployed-no-supply",
	"not-found",
];
const LEVELS: RwaVerificationLevel[] = [
	"toml-bidirectional",
	"entity-toml",
	"contract-metadata",
	"on-chain-home-domain",
	"on-chain-only",
];
const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	// Reject unknown params, as /api/stablecoins does: an agent that sends
	// sort= or network= must learn the parameter does nothing, not receive a
	// full list that looks filtered.
	const unknown = [...sp.keys()].find((k) => !KNOWN_PARAMS.has(k));
	if (unknown)
		return NextResponse.json(
			{
				error: `Unknown query param '${unknown}'.`,
				validParams: [...KNOWN_PARAMS],
			},
			{ status: 400, headers: CORS },
		);
	const state = sp.get("state");
	const level = sp.get("level");
	const kind = sp.get("kind");
	const project = sp.get("project")?.toLowerCase() ?? null;
	if (state && !STATES.includes(state as RwaState))
		return NextResponse.json(
			{ error: `Invalid state '${state}'. Valid: ${STATES.join(", ")}` },
			{ status: 400, headers: CORS },
		);
	if (level && !LEVELS.includes(level as RwaVerificationLevel))
		return NextResponse.json(
			{ error: `Invalid level '${level}'. Valid: ${LEVELS.join(", ")}` },
			{ status: 400, headers: CORS },
		);
	if (kind && kind !== "classic" && kind !== "soroban")
		return NextResponse.json(
			{ error: `Invalid kind '${kind}'. Valid: classic, soroban` },
			{ status: 400, headers: CORS },
		);
	const limit = clampLimit(sp.get("limit"), 100, 100);

	let rows: RwaAsset[] = RWA_REGISTRY;
	if (state) rows = rows.filter((r) => r.state === state);
	if (level) rows = rows.filter((r) => r.verificationLevel === level);
	if (kind) rows = rows.filter((r) => r.kind === kind);
	if (project) rows = rows.filter((r) => r.projectSlug === project);
	// rwa.xyz value is the only cross-row size we hold; rows without one sort last.
	rows = [...rows].sort(
		(a, b) => (b.rwaxyzValueUsd ?? -1) - (a.rwaxyzValueUsd ?? -1),
	);
	const total = rows.length;
	rows = rows.slice(0, limit);

	// Measured state from the six-hour lane, keyed by registry id. The registry
	// exists statically, so an unreachable DB degrades to measured: null with a
	// warning — never a 503 for rows we can serve.
	const warnings: string[] = [];
	const measuredById = new Map<string, Partial<RwaMeasured>>();
	const payload = await getPayloadSafe();
	if (payload) {
		try {
			const docs = await payload.find({
				collection: "rwa-assets",
				where: { assetId: { in: rows.map((r) => r.id) } },
				limit: rows.length || 1,
				depth: 0,
			});
			for (const d of docs.docs as unknown as Array<
				Partial<RwaMeasured> & { assetId: string }
			>)
				measuredById.set(d.assetId, d);
		} catch {
			warnings.push(
				"measured state unavailable this request (store unreachable); `measured` is null on every row — not a statement about the assets.",
			);
		}
	} else {
		warnings.push(
			"measured state unavailable this request (store unreachable); `measured` is null on every row — not a statement about the assets.",
		);
	}
	const served = rows.map((r) =>
		mergeMeasured(r, measuredById.get(r.id) ?? null),
	);
	const measuredCount = served.filter((r) => r.measured).length;

	const byLevel: Record<string, number> = {};
	const byState: Record<string, number> = {};
	for (const r of RWA_REGISTRY) {
		byLevel[r.verificationLevel] = (byLevel[r.verificationLevel] ?? 0) + 1;
		byState[r.state] = (byState[r.state] ?? 0) + 1;
	}
	// Named issuers only: 16 Brazilian receivables rows carry no issuer entity,
	// and a null is not an issuer.
	const issuers = new Set(
		RWA_REGISTRY.map((r) => r.issuerEntity).filter((x): x is string => !!x),
	).size;

	logApiHit({
		req,
		endpoint: "/api/rwa",
		filters: { state, level, kind, project, limit },
		resultCount: rows.length,
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/api/rwa",
				generatedAt: new Date().toISOString(),
				registryAsOf: RWA_REGISTRY_AS_OF,
				...(warnings.length ? { warnings } : {}),
				filters: { state, level, kind, project, limit },
				counts: {
					registry: RWA_REGISTRY.length,
					issuers,
					matched: total,
					returned: rows.length,
					byLevel,
					byState,
				},
				coverage: {
					basis: "curated-registry",
					note: "Rows are the tokenized real-world assets rwa.xyz lists on Stellar, each re-verified on-chain on registryAsOf. Absence here means untracked — NOT proof an asset is not issued on Stellar; verify against Horizon (classic) or Soroban RPC (contract tokens) before asserting non-existence. Identity is (code, issuer) for a classic asset and the contract id for a Soroban token; a ticker alone identifies nothing (BENJI has 22 issuers on mainnet, 21 of them squatters).",
				},
				methodology:
					"verificationLevel says how a row earned its place, strongest first: toml-bidirectional (the issuer's own stellar.toml names this code+issuer AND the issuer's home_domain points back), entity-toml (the entity's toml names the issuer; the issuer's home_domain is the minting tool), contract-metadata (name/symbol/decimals/total_supply read from the Soroban contract itself; Horizon /assets never sees these), on-chain-home-domain (issued, entity's domain, toml omits this asset), on-chain-only (issued; toml was a could-not-check or no home_domain). state=deployed-no-supply is a contract with zero supply and zero events — it is NOT served as a live product on the project row. rwaxyzValueUsd/rwaxyzHolders are rwa.xyz's figures, not ours: read them beside totalSupply and horizonNote, because a $500M row with one holder and eight events is a valuation, not activity. Every row is dated (verifiedAt) and cites evidenceUrl; re-verify there before asserting anything current. `measured` is the six-hour lane's reading — supply, holders, activityCount, dated by measuredAt with measureBasis live|unmeasured — and null until the lane has measured that asset: an admission, never zero. counts.measured says how many served rows carry one.",
			},
			assets: served,
		},
		{
			headers: {
				...CORS,
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
			},
		},
	);
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
