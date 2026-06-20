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

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { projectConfidence } from "@/lib/confidence";
import { embed } from "@/lib/embed";
import { getPayloadSafe } from "@/lib/payload-client";
import { searchRepos, type RepoResult } from "@/lib/repo-search";

/**
 * Semantic project search via Atlas $vectorSearch over project embeddings
 * (voyage-3, populated by scripts/embed-projects.ts). Used as the
 * keyword→semantic rung: when a keyword search comes back thin, this finds
 * conceptually-related projects the literal `like` match misses (the
 * x402-class question: "charge AI agents per API call" → agentic-payments
 * projects, even with no literal term overlap). Returns [] and never throws
 * past the caller's try/catch if the index isn't READY yet or VOYAGE_API_KEY
 * is unset — so the route degrades gracefully to keyword-only.
 */
async function semanticProjectRows(
	// biome-ignore lint/suspicious/noExplicitAny: payload.db internals
	payload: any,
	q: string,
	limit: number,
) {
	const queryEmbedding = await embed(q);
	const db = payload.db?.connection?.db;
	const collection = db?.collection("projects");
	if (!collection) return [];
	const pipeline = [
		{
			$vectorSearch: {
				index: "project_vector_index",
				path: "embedding",
				queryVector: queryEmbedding,
				numCandidates: Math.max(200, limit * 15),
				limit: limit * 3,
			},
		},
		{ $match: { status: { $in: ["Development", "Pre-Release", "Live"] } } },
		{
			$project: {
				_id: 1,
				name: 1,
				slug: 1,
				category: 1,
				shortDescription: 1,
				status: 1,
				logo: 1,
				scf: 1,
				links: 1,
				hackathonPlacement: 1,
				score: { $meta: "vectorSearchScore" },
			},
		},
	];
	// biome-ignore lint/suspicious/noExplicitAny: aggregate result shape
	const raw: any[] = await collection.aggregate(pipeline).toArray();
	// Relevance floor (calibrated 2026-06-13 against real voyage-3 cosines):
	// off-distribution concept queries top out ~0.63-0.68 ("reentrancy" → 0.676,
	// "frontrunning" → 0.629) while genuine project matches sit 0.687-0.80
	// ("send money abroad" → 0.736, "explore soroban contract" → 0.80). 0.68 sits
	// in that gap: cuts the concept-noise, keeps real matches. Below it we return
	// [] and defer to the /api/research advisory.
	const SCORE_FLOOR = 0.68;
	const docs = raw.filter((p) => (p.score ?? 0) >= SCORE_FLOOR);
	if (docs.length === 0) return []; // no genuinely-close match (or index unbuilt)
	const max = docs.reduce((m, p) => Math.max(m, p.score ?? 0), 0) || 1;
	return docs.map((p) => {
		let logoUrl: string | null = null;
		if (p.logo && typeof p.logo === "object") {
			if (p.logo.url) logoUrl = p.logo.url;
			else if (p.logo.filename) logoUrl = `/api/media/file/${p.logo.filename}`;
		}
		return {
			id: String(p._id),
			name: p.name,
			slug: p.slug,
			category: p.category,
			shortDescription: p.shortDescription ?? null,
			status: p.status,
			logoUrl,
			scfAwarded: !!p.scf?.awarded,
			scfTotalAwardedUSD: p.scf?.totalAwarded ?? null,
			links: pickLinks(p.links),
			hackathon: null,
			hackathonPlacement: p.hackathonPlacement ?? null,
			hackathonPrize: null,
			hackathonPrizeTrack: null,
			score: p.score ?? 0,
			via: "semantic" as const,
			url: `https://stellarlight.xyz/project/${p.slug}`,
			confidence: projectConfidence({
				score: p.score ?? 0,
				maxScore: max,
				status: p.status,
				scfAwarded: !!p.scf?.awarded,
				hackathonPlacement: p.hackathonPlacement,
			}),
		};
	});
}

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface ProjectRow {
	id: string;
	name: string;
	slug: string;
	category: string;
	shortDescription: string | null;
	status: string;
	logoUrl: string | null;
	scfAwarded: boolean;
	scfTotalAwardedUSD: number | null;
	hackathon: { id: string; name: string; slug: string } | null;
	hackathonPlacement: string | null;
	hackathonPrize: number | null;
	hackathonPrizeTrack: string | null;
	prominence: number;
	verificationLevel: string | null;
	types: string[];
	links?: Record<string, string>;
	score: number;
	url: string;
}

// A project's own indexed code repo (compact form, attached per project row).
interface ProjectRepoRef {
	fullName: string;
	url: string;
	primaryLanguage: string | null;
	stars: number;
	repoScore: number;
	repoScoreLabel: string | null;
	judgeScore: number | null;
	hackathonWinner: boolean;
}

// Synonym + light-stem expansion so natural queries reach records described in
// adjacent vocabulary the literal `like` would miss: "game" → "gaming"/"GameFi",
// "dex" → "amm"/"swap", "lending" → "borrow", "oracle" → "price feed". Each query
// token expands to a term set; a record matches the token if ANY term hits its
// text. Keeps recall high on single-word category queries without a full vector pass.
const SYNONYMS: Record<string, string[]> = {
	wallet: ["wallet", "custody", "signer", "keystore"],
	dex: ["dex", "amm", "swap", "exchange", "orderbook"],
	amm: ["amm", "liquidity", "pool", "swap", "dex"],
	swap: ["swap", "dex", "amm", "exchange"],
	lending: ["lending", "lend", "borrow", "loan", "money market"],
	lend: ["lend", "lending", "borrow", "loan"],
	borrow: ["borrow", "borrowing", "lend", "lending", "loan"],
	oracle: ["oracle", "price feed", "data feed", "feed"],
	bridge: ["bridge", "cross-chain", "interoperability", "cctp", "wrapped"],
	stablecoin: ["stablecoin", "stable", "usdc", "eurc"],
	staking: ["staking", "stake", "yield", "apy", "earn"],
	yield: ["yield", "apy", "earn", "staking", "vault"],
	nft: ["nft", "collectible", "collectibles", "mint"],
	gaming: ["gaming", "game", "gamefi", "play-to-earn", "play2earn"],
	game: ["game", "gaming", "gamefi", "play-to-earn"],
	anchor: ["anchor", "on-ramp", "off-ramp", "sep-24", "sep24", "ramp"],
	remittance: ["remittance", "cross-border", "money transfer", "send money", "payout"],
	payments: ["payments", "payment", "checkout", "merchant", "settlement"],
	indexer: ["indexer", "indexing", "data pipeline", "subgraph", "etl"],
	rpc: ["rpc", "node", "endpoint", "horizon"],
	sdk: ["sdk", "library", "client library", "kit"],
	explorer: ["explorer", "block explorer"],
	faucet: ["faucet", "friendbot"],
	identity: ["identity", "kyc", "did", "credential", "compliance"],
	governance: ["governance", "dao", "voting"],
	custody: ["custody", "custodial", "mpc", "multisig", "key management"],
	domains: ["domains", "domain", "name service", "naming"],
	rwa: ["rwa", "real world asset", "real-world asset", "tokenized", "tokenization"],
	// Machine/agent payments (x402). Expand to the phrases real records actually
	// use — ApiCharge says "pay-per-call"/"API monetization", Benkiko says
	// "micropayment" — never the literal "x402". Keep to specific phrases, not
	// bare "api"/"payment", to avoid pulling in generic infra/payments projects.
	x402: ["x402", "pay-per-call", "pay per call", "api monetization", "micropayment", "metered", "machine payment", "agentic payment", "agent payment"],
	micropayment: ["micropayment", "micro-payment", "pay-per-call", "x402", "metered"],
	mpp: ["mpp", "machine payment", "machine-to-machine", "x402", "agentic payment"],
	agentic: ["agentic", "agent payment", "agentic payment", "x402", "machine payment"],
	// ROSCA / rotating-savings. Lul's description says "ROSCA", Vaquita is a
	// rotating-savings product; the regional names (susu/chama/stokvel/…) appear
	// in queries but not descriptions, so map them onto the terms records use.
	rosca: ["rosca", "rotating savings", "savings group", "savings circle", "susu", "esusu", "chama", "stokvel", "tanda", "ajo"],
	chama: ["chama", "rosca", "rotating savings", "savings group"],
	susu: ["susu", "esusu", "rosca", "rotating savings"],
	esusu: ["esusu", "susu", "rosca", "rotating savings"],
	stokvel: ["stokvel", "rosca", "rotating savings", "savings group"],
	tanda: ["tanda", "rosca", "rotating savings", "savings circle"],
};
function termsForToken(t: string): string[] {
	const out = new Set<string>([t]);
	if (t.length > 4 && t.endsWith("s")) out.add(t.slice(0, -1)); // plural
	if (t.length > 5 && t.endsWith("ing")) out.add(t.slice(0, -3)); // gerund
	for (const syn of SYNONYMS[t] ?? []) out.add(syn);
	return [...out];
}

// Map a query token to the `types` value it implies, so ranking can boost
// records that ARE the queried category over records that merely mention it.
// Prominence is global; this scopes it to intent — e.g. DFNS is a top *custody*
// play but shouldn't lead q=wallet, and Soroswap should lead q=dex over a wallet
// that happens to do swaps. Tokens not mapped here (oracle, custody, yield…)
// fall back to plain prominence, which already orders them well.
const INTENT_TYPE: Record<string, string> = {
	wallet: "Wallet",
	dex: "DEX",
	amm: "DEX",
	swap: "DEX",
	lending: "Lending",
	lend: "Lending",
	borrow: "Lending",
	bridge: "Bridge",
	payments: "Payments",
	payment: "Payments",
	remittance: "Payments",
	x402: "Payments",
	mpp: "Payments",
	micropayment: "Payments",
	anchor: "Anchor",
	sdk: "SDK",
	indexer: "Indexer",
	explorer: "Explorer",
	rpc: "RPC",
	node: "RPC",
	faucet: "Faucet",
	nft: "NFT",
	rwa: "RWA",
	gaming: "Gaming",
	game: "Gaming",
	stablecoin: "Stablecoin",
};
function intentTypesFor(tokens: string[]): Set<string> {
	const s = new Set<string>();
	for (const t of tokens) {
		if (INTENT_TYPE[t]) s.add(INTENT_TYPE[t]);
		for (const syn of SYNONYMS[t] ?? []) if (INTENT_TYPE[syn]) s.add(INTENT_TYPE[syn]);
	}
	return s;
}

// Does the record's own `types` match the query's implied category? Used as a
// PRIMARY sort tier (above prominence) so a true-category record always leads its
// query, even at prominence 0 — e.g. an obscure NFT project beats a high-prominence
// lender that merely contains "nft". intentTypes empty (no category query) → false.
function typeMatch(p: ProjectRow, intentTypes: Set<string>): boolean {
	return intentTypes.size > 0 && (p.types ?? []).some((t) => intentTypes.has(t));
}

// Authority/quality WITHIN a tier: curated prominence, then SDF/community
// verification, SCF funding, and live status.
function rankBoost(p: ProjectRow): number {
	return (
		(p.prominence || 0) +
		(p.verificationLevel === "Verified (SDF)"
			? 18
			: p.verificationLevel === "Verified (Community)"
				? 8
				: 0) +
		(p.scfAwarded ? 12 : 0) +
		(p.status === "Live" ? 4 : 0)
	);
}

// Surface the project's OWN canonical homes (website / GitHub / docs / socials)
// so a consumer can cite the primary source — the project — not us or any
// directory. These are facts about the project, not anyone's proprietary data;
// freshness/validity is the Curator link-checker's job, not a sync mirror.
// Only present, non-empty string fields are included; undefined when none exist.
function pickLinks(
	// biome-ignore lint/suspicious/noExplicitAny: payload links group shape
	links: any,
): Record<string, string> | undefined {
	if (!links || typeof links !== "object") return undefined;
	const out: Record<string, string> = {};
	for (const k of ["website", "github", "docs", "twitter", "discord"]) {
		const v = links[k];
		if (typeof v === "string" && v.length > 0) out[k] = v;
	}
	return Object.keys(out).length ? out : undefined;
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	// Accept `query`/`keyword`/`search` as aliases for `q`. Agents (and adapters)
	// frequently send the search term under `query` — the field name many other
	// tools use. An unrecognized param silently drops the term and the endpoint
	// returns a misleading default list, so honor the common aliases.
	const q =
		(
			sp.get("q") ??
			sp.get("query") ??
			sp.get("keyword") ??
			sp.get("search")
		)?.trim() ?? "";
	const category = sp.get("category");
	const hackathonSlug = sp.get("hackathon");
	// Accept 1/true/yes (and the `scfAwardedOnly` alias) — agents naturally send
	// `scfAwarded=true`, which previously fell through to UNFILTERED results
	// while the caller believed they'd filtered to SCF-funded projects.
	const scfRaw = (sp.get("scfAwarded") ?? sp.get("scfAwardedOnly"))
		?.toLowerCase()
		.trim();
	const scfAwardedOnly =
		scfRaw === "1" || scfRaw === "true" || scfRaw === "yes";
	const limit = Math.min(Number(sp.get("limit") || "20") || 20, 100);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	// Guard content-less calls: no query AND no filters. This is almost always a
	// malformed agent call (the term was sent under a field name we dropped, or
	// nested wrong). Returning the default project list here is actively harmful —
	// the caller reports it as the answer ("no escrow/vault projects exist") when
	// the real projects were never searched. Return an honest empty + how to fix.
	if (!q && !category && !hackathonSlug && !scfAwardedOnly) {
		logApiHit({
			req,
			endpoint: "/api/projects/search",
			query: "",
			filters: { category, hackathon: hackathonSlug, scfAwarded: scfAwardedOnly, limit },
		});
		return NextResponse.json(
			{
				meta: {
					source: "https://stellarlight.xyz/directory",
					generatedAt: new Date().toISOString(),
					filters: { q: "", category, hackathon: hackathonSlug, scfAwardedOnly, limit, offset },
					matchMode: "all" as const,
					matchModeLabel: "no query supplied",
					counts: { returned: 0, total: 0 },
					semantic: false,
					error: "no_query",
					advisory: {
						summary:
							"No search query or filter was supplied, so nothing was searched — this is NOT a signal that the directory lacks matching projects. Re-call with ?q=<terms> (e.g. ?q=escrow+vault). If the term was sent under a different field name, note this endpoint keys off `q` (aliases: query/keyword/search).",
						suggestions: [
							{
								action: "retry-with-q",
								why: "Re-call with ?q=<your search terms>; results key off the `q` parameter.",
							},
						],
					},
				},
				projects: [],
				codeReferences: [],
			},
			{ headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
		);
	}

	const payload = await getPayloadSafe();
	let totalMatching = 0;
	let projects: ProjectRow[] = [];
	let matchMode: "strict" | "loose-1" | "majority" | "all" = "all";
	// Track whether a supplied hackathon slug actually resolved. The hackathons
	// collection can be empty, in which case the filter would silently no-op —
	// we surface `unresolvedFilters` so consumers know the filter wasn't applied.
	let hackathonResolved = true;

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
				else hackathonResolved = false;
			}
			if (scfAwardedOnly) {
				where["scf.awarded"] = { equals: true };
			}

			const tokens = q
				.toLowerCase()
				.split(/\s+/)
				.filter((t) => t.length > 1);
			const intentTypes = intentTypesFor(tokens);

			// Push the keyword match INTO the DB query (OR over tokens) so EVERY
			// matching project is a candidate — not just whichever 500 load first
			// by default sort. Without this, search fetched the first 500 docs and
			// scored them in memory, leaving the tail (older seed records like
			// Soroswap/Aquarius) permanently unsearchable once the directory grew
			// past 500. The in-memory tiering below still ranks the candidates.
			if (tokens.length) {
				where.or = tokens.flatMap((t) =>
					termsForToken(t).flatMap((v) => [
						{ name: { like: v } },
						{ shortDescription: { like: v } },
						{ category: { like: v } },
					]),
				);
			}

			const result = await payload.find({
				collection: "projects",
				where,
				limit: 500,
				depth: 1,
			});

			projects = (
				result.docs as Array<{
					id: string;
					name: string;
					slug: string;
					category: string;
					shortDescription?: string;
					status: string;
					logo?: { url?: string; filename?: string } | string | null;
					scf?: { awarded?: boolean; totalAwarded?: number };
					hackathon?:
						| { id: string; name: string; slug: string }
						| string
						| null;
					hackathonPlacement?: string;
					hackathonPrize?: number;
					hackathonPrizeTrack?: string;
					prominence?: number;
					verificationLevel?: string;
					types?: string[];
					links?: {
						website?: string;
						github?: string;
						docs?: string;
						twitter?: string;
						discord?: string;
					};
				}>
			).map((p) => {
				const hay =
					`${p.name} ${p.shortDescription ?? ""} ${p.category}`.toLowerCase();
				const score = tokens.length
					? tokens.reduce(
							(s, t) =>
								s + (termsForToken(t).some((v) => hay.includes(v)) ? 1 : 0),
							0,
						)
					: 1;
				const hk =
					p.hackathon && typeof p.hackathon === "object"
						? {
								id: String(p.hackathon.id),
								name: p.hackathon.name,
								slug: p.hackathon.slug,
							}
						: null;
				// Resolve logo URL: prefer Payload's .url (S3/R2 storage adapter
				// resolves it automatically), fall back to /media/{filename}
				// for legacy or local-filesystem uploads.
				let logoUrl: string | null = null;
				if (p.logo && typeof p.logo === "object") {
					if (p.logo.url) logoUrl = p.logo.url;
					else if (p.logo.filename)
						logoUrl = `/api/media/file/${p.logo.filename}`;
				}
				return {
					id: String(p.id),
					name: p.name,
					slug: p.slug,
					category: p.category,
					shortDescription: p.shortDescription ?? null,
					status: p.status,
					logoUrl,
					scfAwarded: !!p.scf?.awarded,
					scfTotalAwardedUSD: p.scf?.totalAwarded ?? null,
					hackathon: hk,
					hackathonPlacement: p.hackathonPlacement ?? null,
					hackathonPrize: p.hackathonPrize ?? null,
					hackathonPrizeTrack: p.hackathonPrizeTrack ?? null,
					prominence: typeof p.prominence === "number" ? p.prominence : 0,
					verificationLevel: p.verificationLevel ?? null,
					types: Array.isArray(p.types) ? p.types : [],
					links: pickLinks(p.links),
					score,
					url: `https://stellarlight.xyz/project/${p.slug}`,
				};
			});

			// Tiered match modes. Strict AND first (avoids false positives
			// from common words like "stablecoin" matching every payments
			// project). If a strict AND query yields 0 hits we relax in two
			// stages so multi-word natural queries don't dead-end:
			//
			//   strict   = all N tokens must match (default for ≤2 tokens)
			//   loose-1  = N-1 of N tokens match (only kicks in for 3+ tokens)
			//   majority = ⌈N/2⌉ tokens match (last resort)
			//
			// The .meta.matchMode field tells the caller which tier returned
			// the results so they can convey relevance honestly to the user.
			if (tokens.length) {
				matchMode = "strict";
				let filtered = projects.filter((p) => p.score >= tokens.length);
				if (filtered.length === 0 && tokens.length >= 3) {
					matchMode = "loose-1";
					filtered = projects.filter((p) => p.score >= tokens.length - 1);
				}
				if (filtered.length === 0 && tokens.length >= 2) {
					matchMode = "majority";
					const need = Math.ceil(tokens.length / 2);
					filtered = projects.filter((p) => p.score >= need);
				}
				// Primary rank = keyword-match count. Tiebreak by composite
				// confidence (status-freshness + SCF/hackathon authority) so on a
				// broad query like "swap" the flagship audited/funded DEXes lead
				// instead of falling back to arbitrary DB order behind same-score
				// newcomers. Precompute once (O(n)) to avoid re-scoring in compare.
				const fMax = filtered.reduce((m, p) => Math.max(m, p.score ?? 0), 0);
				const confByName = new Map(
					filtered.map((p) => [
						p.id,
						projectConfidence({
							score: p.score,
							maxScore: fMax,
							status: p.status,
							scfAwarded: p.scfAwarded,
							hackathonPlacement: p.hackathonPlacement,
						}).score,
					]),
				);
				filtered.sort(
					(a, b) =>
						b.score - a.score ||
						Number(typeMatch(b, intentTypes)) -
							Number(typeMatch(a, intentTypes)) ||
						rankBoost(b) - rankBoost(a) ||
						(confByName.get(b.id) ?? 0) - (confByName.get(a.id) ?? 0),
				);
				projects = filtered;
			} else {
				matchMode = "all";
				projects.sort((a, b) => rankBoost(b) - rankBoost(a));
			}

			totalMatching = projects.length;
			projects = projects.slice(offset, offset + limit);
		} catch {
			// fall through
		}
	}

	// Attach a confidence signal to each result — same trust scale as
	// /api/research, with project-appropriate signals (keyword relevance,
	// lifecycle status as freshness, SCF/hackathon vetting as authority).
	const projMax = projects.reduce((m, p) => Math.max(m, p.score ?? 0), 0);
	const scored = projects.map((p) => ({
		...p,
		via: "keyword" as const,
		confidence: projectConfidence({
			score: p.score,
			maxScore: projMax,
			status: p.status,
			scfAwarded: p.scfAwarded,
			hackathonPlacement: p.hackathonPlacement,
		}),
	}));

	// Keyword→semantic rung: when the keyword pass came back thin (didn't fill
	// the page), augment with semantic $vectorSearch matches the literal `like`
	// missed — conceptually-related projects (the x402-class question).
	// First page + query only. Fault-tolerant: if the index isn't READY yet or
	// VOYAGE_API_KEY is unset, semanticProjectRows yields nothing / throws and
	// we silently keep keyword-only.
	let semanticAdds: Awaited<ReturnType<typeof semanticProjectRows>> = [];
	if (q && offset === 0 && scored.length < limit && payload) {
		try {
			const sem = await semanticProjectRows(payload, q, limit);
			const have = new Set(scored.map((r) => r.id));
			semanticAdds = sem
				.filter((r) => !have.has(r.id))
				.slice(0, limit - scored.length);
		} catch {
			// index not ready / no embedding key — degrade to keyword-only
		}
	}
	const usedSemantic = semanticAdds.length > 0;

	// Code references: top graded repos matching the same query, surfaced INLINE
	// so a consumer that only calls project search (e.g. an agent with a fixed
	// tool list) picks them up automatically — no separate repo tool needed.
	// First page + query only; degrades to [] if the repos index is empty.
	//
	// Bounded by a timeout: this is best-effort enrichment that rides on an
	// endpoint agents call on the hot path, so it must never slow the core
	// project-search response. If the repo lookup doesn't finish in time, we
	// ship the projects without code references rather than make the caller wait.
	let codeReferences: RepoResult[] = [];
	if (q && offset === 0 && payload) {
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<RepoResult[]>((resolve) => {
			timer = setTimeout(() => resolve([]), 700);
		});
		try {
			codeReferences = await Promise.race([
				searchRepos(payload, q, { limit: 5 }).then((r) => r.repos),
				timeout,
			]);
		} finally {
			clearTimeout(timer);
		}
	}

	// Per-project repos: attach each surfaced project's OWN indexed code repos
	// (top-scored), so a consumer can go project → its code directly — not just
	// the query-scoped codeReferences above. Batched (one query over all returned
	// slugs) + bounded, best-effort.
	const baseProjects = [...scored, ...semanticAdds];
	let projectsOut: Array<(typeof baseProjects)[number] & { repos: ProjectRepoRef[] }> =
		baseProjects.map((p) => ({ ...p, repos: [] }));
	if (payload && baseProjects.length) {
		const slugs = baseProjects.map((p) => p.slug).filter(Boolean);
		try {
			const repoRes = await payload.find({
				collection: "repos",
				where: { projectSlug: { in: slugs } },
				sort: "-repoScore",
				limit: Math.min(slugs.length * 8, 500),
				depth: 0,
			});
			const bySlug = new Map<string, ProjectRepoRef[]>();
			for (const r of repoRes.docs as unknown as Array<Record<string, unknown>>) {
				const s = r.projectSlug as string | undefined;
				if (!s) continue;
				const arr = bySlug.get(s) ?? [];
				if (arr.length >= 5) continue; // top 5 per project (already score-sorted)
				arr.push({
					fullName: String(r.fullName),
					url: (r.url as string) ?? `https://github.com/${r.fullName}`,
					primaryLanguage: (r.primaryLanguage as string) ?? null,
					stars: (r.stars as number) ?? 0,
					repoScore: (r.repoScore as number) ?? 0,
					repoScoreLabel: (r.repoScoreLabel as string) ?? null,
					judgeScore: (r.judgeScore as number) ?? null,
					hackathonWinner: !!r.hackathonWinner,
				});
				bySlug.set(s, arr);
			}
			projectsOut = baseProjects.map((p) => ({ ...p, repos: bySlug.get(p.slug) ?? [] }));
		} catch {
			// best-effort — ship projects without per-project repos on any error
		}
	}

	logApiHit({
		req,
		endpoint: "/api/projects/search",
		query: q,
		filters: {
			category,
			hackathon: hackathonSlug,
			scfAwarded: scfAwardedOnly,
			limit,
		},
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				filters: {
					q,
					category,
					hackathon: hackathonSlug,
					scfAwarded: scfAwardedOnly,
					scfAwardedOnly,
					limit,
					offset,
				},
				// Surface filters that were accepted but could NOT be applied, so a
				// consumer never silently believes a filter narrowed the results when
				// it didn't (e.g. a hackathon slug that doesn't resolve because the
				// hackathons collection is empty).
				...(hackathonSlug && !hackathonResolved
					? {
							unresolvedFilters: ["hackathon"],
							note: `hackathon='${hackathonSlug}' did not match any known hackathon, so that filter was NOT applied (results are unfiltered by hackathon).`,
						}
					: {}),
				matchMode,
				// Hint to the caller (agent) so they can frame results honestly:
				//   strict   → "every keyword matched"
				//   loose-1  → "all but one keyword matched"
				//   majority → "most of your keywords matched — broader interpretation"
				//   all      → no keyword query was supplied
				matchModeLabel: {
					strict: "all keywords matched",
					"loose-1": "all but one keyword matched",
					majority: "majority of keywords matched (broader scope)",
					all: "no keyword filter",
				}[matchMode],
				// total = matches before offset/limit slicing — lets paging
				// consumers know when they've seen everything.
				counts: {
					returned: projects.length + semanticAdds.length,
					total: totalMatching + semanticAdds.length,
				},
				// `semantic: true` means the keyword pass was thin and we filled
				// the page with vector-search matches the literal filter missed
				// (each such row is tagged `via: "semantic"`).
				semantic: usedSemantic,
				// When BOTH keyword and semantic came back empty, point the agent
				// at thesis-level retrieval. Project search can't answer "is x402
				// possible on Stellar?" — /api/research can.
				...(projects.length === 0 && semanticAdds.length === 0 && q
					? {
							advisory: {
								summary: `No projects match '${q}' even after broadening the search. This could be a real gap, a naming/tag mismatch, or a thesis-level question that's better answered against the research corpus.`,
								suggestions: [
									{
										action: "research-corpus",
										url: `/api/research?q=${encodeURIComponent(q)}&limit=5`,
										why: "If the question is design / feasibility / 'has this concept been discussed', /api/research surfaces SEPs, papers, audit findings, SCF Handbook chunks — content the project directory doesn't index.",
									},
									{
										action: "synonym-retry",
										why: `Try a single-word category or technology synonym (e.g. 'oracle' instead of 'price feed', 'soroban' instead of 'smart contract') — projects tend to be tagged by category, not by application descriptions.`,
									},
								],
							},
						}
					: {}),
			},
			projects: projectsOut,
			// Inline graded code references (GitHub repos) for the same query, so
			// consumers get existing-repo prior-art without a separate tool call.
			// Each carries the repo url + homepage to cite. See /api/repos/search.
			codeReferences,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
			},
		},
	);
}
