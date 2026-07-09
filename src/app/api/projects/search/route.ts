/**
 * Public read-only projects search — find existing Stellar projects.
 * Powers Stellar Scout's "has anyone built this?" / competitor-lookup
 * questions.
 *
 *   GET /api/projects/search?q=stablecoin
 *   GET /api/projects/search?category=Protocol/Contract&scfAwarded=1
 *
 * Full-text-ish search across name + short description + category. Not a
 * proper vector search — that's Phase 2. This is keyword overlap, scored
 * by how many query tokens hit each project.
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { projectConfidence } from "@/lib/confidence";
import { embed } from "@/lib/embed";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	buildHaystack,
	corridorMatch,
	intentTypesFor,
	isRampIntent,
	scoreTokens,
	structuredHit,
	structuredSelectClauses,
	termsForToken,
	tokenize,
} from "@/lib/project-search-match";
import { type RepoResult, searchRepos } from "@/lib/repo-search";

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
		// Inactive stays searchable (so a name lookup like "keybase" still finds
		// it) but is heavily penalized in scoring — it can't ride prominence or
		// stars to the top of a topic query.
		{
			$match: {
				status: { $in: ["Development", "Pre-Release", "Live", "Inactive"] },
			},
		},
		{
			$project: {
				_id: 1,
				name: 1,
				slug: 1,
				category: 1,
				shortDescription: 1,
				status: 1,
				canonicalSlug: 1,
				lifecycle: 1,
				logo: 1,
				scf: 1,
				links: 1,
				coverage: 1,
				supportedNetworks: 1,
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
			canonicalSlug: p.canonicalSlug ?? null,
			lifecycle: pickLifecycle(p.lifecycle),
			logoUrl,
			scfAwarded: !!p.scf?.awarded,
			scfTotalAwardedUSD: p.scf?.totalAwarded ?? null,
			scfAmountStatus: scfAmountStatus(!!p.scf?.awarded, p.scf?.totalAwarded),
			scfAwardedRounds: p.scf?.awardedRounds ?? [],
			links: pickLinks(p.links),
			coverage: pickCoverage(p.coverage),
			supportedNetworks: Array.isArray(p.supportedNetworks)
				? p.supportedNetworks
				: [],
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

// sls-002: disambiguate a null award amount. "undisclosed" = the award is
// confirmed but no amount is published in the source data (not a data gap);
// "disclosed" = scfTotalAwardedUSD carries the number; null = not awarded.
function scfAmountStatus(
	awarded: boolean,
	totalAwarded: number | null | undefined,
): "disclosed" | "undisclosed" | null {
	if (!awarded) return null;
	return typeof totalAwarded === "number" ? "disclosed" : "undisclosed";
}

interface ProjectRow {
	id: string;
	name: string;
	slug: string;
	category: string;
	shortDescription: string | null;
	status: string;
	canonicalSlug: string | null;
	lifecycle: { wasLive: boolean; note: string | null } | null;
	logoUrl: string | null;
	scfAwarded: boolean;
	scfTotalAwardedUSD: number | null;
	scfAmountStatus: "disclosed" | "undisclosed" | null;
	// sls-011: round membership (e.g. [2, 17, 22]) so consumers can reconcile
	// cross-source totals mechanically instead of guessing at counting bases.
	scfAwardedRounds: number[];
	hackathon: { id: string; name: string; slug: string } | null;
	hackathonPlacement: string | null;
	hackathonPrize: number | null;
	hackathonPrizeTrack: string | null;
	prominence: number;
	verificationLevel: string | null;
	types: string[];
	// sls-012: structured anchor corridor coverage (null for non-anchors).
	coverage: {
		countries: string[];
		currencies: string[];
		seps: string[];
		asOf: string | null;
	} | null;
	// sls-017 (durable): chains this project supports (e.g. ["stellar","xrpl"]).
	supportedNetworks: string[];
	links?: Record<string, string>;
	score: number;
	url: string;
}

// Name-lookup rank (sls-009): the standard directory-search contract — a
// query that IS a project's name must return that project first, regardless
// of how much authority (prominence/SCF/stars) other keyword matches carry.
function nameMatchScore(name: string, slug: string, q: string): number {
	const qq = q.trim().toLowerCase();
	if (!qq) return 0;
	const n = name.trim().toLowerCase();
	if (n === qq || slug.toLowerCase() === qq) return 3;
	if (n.startsWith(qq)) return 2;
	const esc = qq.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`\\b${esc}\\b`).test(n) ? 1 : 0;
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
	lastCommitAt: string | null;
}

// Synonyms, stemming, intent-type mapping, structured-signal matching, and the
// searchable haystack all live in project-search-match.ts (imported above) so the
// admission/scoring rules are unit-tested. The route orchestrates; that module
// decides what matches.

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
		(p.status === "Live" ? 4 : 0) +
		// Defunct projects sink hard — bigger than any single positive signal, so
		// they never outrank a live project on a topic query, but a direct name
		// match (whose text score dwarfs 60) still surfaces them.
		(p.status === "Inactive" ? -60 : 0)
	);
}

// Liveness tier. A defunct project must never LEAD a topic/keyword query over a
// live alternative — someone asking "what CDPs are on Stellar?" wants things to
// use first, with a shut-down project (e.g. OrbitCDP) available below as history,
// not at #1. This sorts ABOVE the keyword text score (a strong text match alone
// can't float a dead project to the top), but BELOW an exact name/slug match, so
// a direct lookup like q="OrbitCDP" still returns it. Inactive→0, active→1.
function isActive(p: ProjectRow): number {
	return p.status === "Inactive" ? 0 : 1;
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

// Historical-archive block. Only surfaced when it carries real history, so live
// projects stay clean (null) and a consumer that sees `lifecycle` knows the
// record is a defunct/changed one worth narrating ("used to be live").
function pickLifecycle(
	// biome-ignore lint/suspicious/noExplicitAny: payload lifecycle group shape
	lc: any,
): { wasLive: boolean; note: string | null } | null {
	if (!lc || typeof lc !== "object") return null;
	const wasLive = lc.wasLive === true;
	const note =
		typeof lc.note === "string" && lc.note.trim().length > 0 ? lc.note : null;
	if (!wasLive && !note) return null;
	return { wasLive, note };
}

// sls-012: structured anchor corridor coverage. Only surfaced when it carries
// real data, so non-anchors stay clean (null) and a consumer that sees
// `coverage` can filter/date it instead of prose-mining the description.
function pickCoverage(
	// biome-ignore lint/suspicious/noExplicitAny: payload coverage group shape
	c: any,
): {
	countries: string[];
	currencies: string[];
	seps: string[];
	asOf: string | null;
} | null {
	if (!c || typeof c !== "object") return null;
	const arr = (v: unknown): string[] =>
		Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : [];
	const countries = arr(c.countries);
	const currencies = arr(c.currencies);
	const seps = arr(c.seps);
	const asOf = typeof c.asOf === "string" && c.asOf ? c.asOf : null;
	if (!countries.length && !currencies.length && !seps.length) return null;
	return { countries, currencies, seps, asOf };
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
	// Accept 1/true/yes (and the `scfAwardedOnly` alias) — agents naturally send
	// `scfAwarded=true`, which previously fell through to UNFILTERED results
	// while the caller believed they'd filtered to SCF-funded projects.
	const scfRaw = (sp.get("scfAwarded") ?? sp.get("scfAwardedOnly"))
		?.toLowerCase()
		.trim();
	const scfAwardedOnly =
		scfRaw === "1" || scfRaw === "true" || scfRaw === "yes";
	const limit = clampLimit(sp.get("limit"), 20, 100);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	// Reject an unrecognized category (declared as an enum in the OpenAPI; was a
	// silent 200/0). Matches the project category select options + leaderboard.
	const VALID_CATEGORIES = [
		"Infrastructure",
		"Tooling",
		"User-Facing App",
		"Asset",
		"Protocol/Contract",
		"Anchor",
		"Partner Integration",
	] as const;
	if (category && !(VALID_CATEGORIES as readonly string[]).includes(category)) {
		return NextResponse.json(
			{
				error: `Invalid category '${category}'.`,
				validCategories: VALID_CATEGORIES,
			},
			{ status: 400 },
		);
	}

	// Guard content-less calls: no query AND no filters. This is almost always a
	// malformed agent call (the term was sent under a field name we dropped, or
	// nested wrong). Returning the default project list here is actively harmful —
	// the caller reports it as the answer ("no escrow/vault projects exist") when
	// the real projects were never searched. Return an honest empty + how to fix.
	if (!q && !category && !scfAwardedOnly) {
		logApiHit({
			req,
			endpoint: "/api/projects/search",
			query: "",
			filters: { category, scfAwarded: scfAwardedOnly, limit },
		});
		return NextResponse.json(
			{
				meta: {
					source: "https://stellarlight.xyz/directory",
					generatedAt: new Date().toISOString(),
					filters: { q: "", category, scfAwardedOnly, limit, offset },
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
			{
				headers: {
					"Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
				},
			},
		);
	}

	const payload = await getPayloadSafe();
	let totalMatching = 0;
	let projects: ProjectRow[] = [];
	let matchMode: "strict" | "loose-1" | "majority" | "all" = "all";

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
			const where: any = {
				// Inactive included so a name lookup still finds it; the score()
				// penalty keeps it out of the way on topic queries.
				status: { in: ["Development", "Pre-Release", "Live", "Inactive"] },
			};
			if (category) {
				where.category = { equals: category };
			}
			if (scfAwardedOnly) {
				where["scf.awarded"] = { equals: true };
			}

			const tokens = tokenize(q);
			const intentTypes = intentTypesFor(tokens);
			const rampIntent = isRampIntent(tokens);

			// Push the keyword match INTO the DB query (OR over tokens) so EVERY
			// matching project is a candidate — not just whichever 500 load first
			// by default sort. Without this, search fetched the first 500 docs and
			// scored them in memory, leaving the tail (older seed records like
			// Soroswap/Aquarius) permanently unsearchable once the directory grew
			// past 500. The in-memory tiering below still ranks the candidates.
			//
			// Structured coverage (text) is matched alongside prose so a record
			// surfaces on its STRUCTURED truth even when its description never says
			// the query words — the Etherfuse miss (sls-018): coverage names
			// Mexico/MXN, prose is about Stablebonds, so a generic Mexico on-ramp
			// query never fetched it as a candidate. `types`/`coverage.seps` are
			// select fields (`like`-unsafe) so they join via `contains` clauses
			// built from the INTENT_TYPE map instead (F1, 2026-07-09 audit:
			// type-only records — Social Impact 3/15 retrievable — never became
			// candidates even though the haystack scores types).
			const baseOr = tokens.flatMap((t) =>
				termsForToken(t).flatMap((v) => [
					{ name: { like: v } },
					{ shortDescription: { like: v } },
					{ category: { like: v } },
				]),
			);
			const structuredOr = tokens.flatMap((t) =>
				termsForToken(t).flatMap((v) => [
					{ supportedNetworks: { like: v } },
					{ "coverage.countries": { like: v } },
					{ "coverage.currencies": { like: v } },
				]),
			);
			if (tokens.length) {
				where.or = [
					...baseOr,
					...structuredOr,
					...structuredSelectClauses(tokens),
				];
			}

			const findCandidates = (
				// biome-ignore lint/suspicious/noExplicitAny: Payload Where type
				w: any,
			) =>
				payload.find({
					collection: "projects",
					where: w,
					limit: 500,
					depth: 0,
					// THE fix: exclude `embedding` from the candidate fetch. It's a json
					// voyage-3 vector (~KBs/doc); pulling it for up to 500 matched
					// projects dragged megabytes out of the M0 free tier on every search
					// and was the real cause of the 16-20s hangs — the route never reads
					// it ($vectorSearch uses the index server-side). Same class of bug as
					// readmeExcerpt in repos/search, same fix. depth:0 keeps the scan
					// cheap; logo/hackathon are populated post-slice for the page only.
					select: { embedding: false },
				});
			// Structured coverage paths are standard Payload operators, but never let
			// a query-shape surprise silently empty ALL search: on any find error,
			// retry with the proven name/description/category candidate set. Worst
			// case the endpoint degrades to its prior behavior, never to nothing.
			let result: Awaited<ReturnType<typeof findCandidates>>;
			try {
				result = await findCandidates(where);
			} catch {
				result = await findCandidates(
					tokens.length ? { ...where, or: baseOr } : where,
				);
			}

			projects = (
				result.docs as Array<{
					id: string;
					name: string;
					slug: string;
					category: string;
					shortDescription?: string;
					status: string;
					canonicalSlug?: string | null;
					lifecycle?: { wasLive?: boolean; note?: string } | null;
					logo?: { url?: string; filename?: string } | string | null;
					scf?: {
						awarded?: boolean;
						totalAwarded?: number;
						awardedRounds?: number[];
					};
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
					coverage?: {
						countries?: string[];
						currencies?: string[];
						seps?: string[];
						asOf?: string;
					} | null;
					supportedNetworks?: string[];
					links?: {
						website?: string;
						github?: string;
						docs?: string;
						twitter?: string;
						discord?: string;
					};
				}>
			).map((p) => {
				// Haystack folds structured truth (types / supportedNetworks / coverage
				// values, + injected ramp vocabulary for any covered record) into the
				// searchable text, so a corridor/category query scores a record on what
				// it demonstrably IS, not only on how its prose happens to be phrased.
				const hay = buildHaystack(p);
				const score = scoreTokens(hay, tokens);
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
					canonicalSlug: p.canonicalSlug ?? null,
					lifecycle: pickLifecycle(p.lifecycle),
					logoUrl,
					scfAwarded: !!p.scf?.awarded,
					scfTotalAwardedUSD: p.scf?.totalAwarded ?? null,
					scfAmountStatus: scfAmountStatus(
						!!p.scf?.awarded,
						p.scf?.totalAwarded,
					),
					scfAwardedRounds: p.scf?.awardedRounds ?? [],
					hackathon: hk,
					hackathonPlacement: p.hackathonPlacement ?? null,
					hackathonPrize: p.hackathonPrize ?? null,
					hackathonPrizeTrack: p.hackathonPrizeTrack ?? null,
					prominence: typeof p.prominence === "number" ? p.prominence : 0,
					verificationLevel: p.verificationLevel ?? null,
					types: Array.isArray(p.types) ? p.types : [],
					coverage: pickCoverage(p.coverage),
					supportedNetworks: Array.isArray(p.supportedNetworks)
						? p.supportedNetworks
						: [],
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
				// Structured-signal admission (sls-018/019): a project that IS the
				// queried category (its `types` match intent) or whose curated
				// coverage serves a queried corridor is admitted ONE tier looser
				// than prose token-count alone. Structured truth is stronger
				// evidence than one extra description word — it is why Sushi (type
				// DEX; desc says "liquidity provision", query wanted "pool") and
				// Etherfuse (coverage MXN/Mexico; prose about bonds) were dropped.
				const admit = (bar: number) => (p: ProjectRow) =>
					p.score >= bar ||
					(p.score >= bar - 1 &&
						structuredHit(p, intentTypes, tokens, rampIntent));
				matchMode = "strict";
				let filtered = projects.filter(admit(tokens.length));
				if (filtered.length === 0 && tokens.length >= 3) {
					matchMode = "loose-1";
					filtered = projects.filter(admit(tokens.length - 1));
				}
				if (filtered.length === 0 && tokens.length >= 2) {
					matchMode = "majority";
					filtered = projects.filter(admit(Math.ceil(tokens.length / 2)));
				}
				// Corridor bypass: a curated coverage match on a queried country/
				// currency/SEP is unambiguous intent satisfaction — admit it at ANY
				// tier so a multi-product issuer surfaces for a generic ramp/corridor
				// query even when its prose (about its primary product) never names
				// the corridor. Gated on ramp intent + a structured coverage hit, so
				// it cannot over-recall on ordinary topic queries.
				if (rampIntent) {
					const have = new Set(filtered.map((p) => p.id));
					for (const p of projects) {
						if (!have.has(p.id) && corridorMatch(p, tokens)) {
							filtered.push(p);
							have.add(p.id);
						}
					}
				}
				// Name-lookup contract (sls-009): an exact/prefix/whole-word name
				// match must dominate every authority signal — q="Blend" ranked
				// Reflector (authority-heavy) above the project literally named
				// Blend. Exact=3, prefix=2, whole-word-in-name=1, else 0.
				const nameRank = new Map(
					filtered.map((p) => [p.id, nameMatchScore(p.name, p.slug, q)]),
				);
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
				// Only an EXACT name/slug match (nameRank===3) dominates authority —
				// that's the sls-009 contract (q="Blend" → the project named Blend).
				// Prefix(2)/whole-word(1) matches must NOT override prominence, or a
				// generic query like "swap" ranks a 0-prominence "SwapX" (prefix) above
				// flagship Soroswap ("swap" isn't a word-boundary in "soroswap" → 0).
				// So prefix/word name-affinity becomes a LATE tiebreaker, after
				// relevance + authority, not the primary key (sls-009 recheck regression).
				const exactName = (id: string) => (nameRank.get(id) === 3 ? 1 : 0);
				filtered.sort(
					(a, b) =>
						exactName(b.id) - exactName(a.id) ||
						isActive(b) - isActive(a) ||
						b.score - a.score ||
						// Structured relevance (type-match OR corridor coverage-match)
						// leads over pure prose matches at the same keyword score.
						Number(structuredHit(b, intentTypes, tokens, rampIntent)) -
							Number(structuredHit(a, intentTypes, tokens, rampIntent)) ||
						rankBoost(b) - rankBoost(a) ||
						(nameRank.get(b.id) ?? 0) - (nameRank.get(a.id) ?? 0) ||
						(confByName.get(b.id) ?? 0) - (confByName.get(a.id) ?? 0),
				);
				projects = filtered;
			} else {
				matchMode = "all";
				projects.sort((a, b) => rankBoost(b) - rankBoost(a));
			}

			totalMatching = projects.length;
			projects = projects.slice(offset, offset + limit);

			// Re-populate logo + hackathon for ONLY the returned page. The
			// candidate find above runs at depth:0; paying Payload's relation
			// populate over all ≤500 candidates was the fan-out that made this
			// the heaviest query on M0. Populate ≤limit docs here instead.
			if (projects.length) {
				try {
					const pageIds = projects.map((p) => p.id);
					const pop = await payload.find({
						collection: "projects",
						where: { id: { in: pageIds } },
						depth: 1,
						limit: pageIds.length,
					});
					const byId = new Map(
						(
							pop.docs as Array<{
								id: string | number;
								// biome-ignore lint/suspicious/noExplicitAny: populated relation doc
								logo?: any;
								// biome-ignore lint/suspicious/noExplicitAny: populated relation doc
								hackathon?: any;
							}>
						).map((d) => [String(d.id), d]),
					);
					for (const p of projects) {
						const d = byId.get(p.id);
						if (!d) continue;
						if (d.logo && typeof d.logo === "object") {
							p.logoUrl =
								d.logo.url ??
								(d.logo.filename ? `/api/media/file/${d.logo.filename}` : null);
						}
						if (d.hackathon && typeof d.hackathon === "object") {
							p.hackathon = {
								id: String(d.hackathon.id),
								name: d.hackathon.name,
								slug: d.hackathon.slug,
							};
						}
					}
				} catch {
					// best-effort — ship the page without logo/hackathon populate
				}
			}
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
	// Final liveness float across the FULL assembled list (keyword + semantic
	// augmentation). A dead project that was the sole strict keyword match must
	// not sit above the live semantic neighbours appended after it — e.g.
	// q="cdp stablecoin lending" put defunct OrbitCDP above live lantern/k2-lend.
	// Stable, so it only lifts active rows above Inactive ones and preserves the
	// careful within-group order. An EXACT name/slug match still wins first, so
	// q="OrbitCDP" keeps returning it even though it's Inactive.
	if (q) {
		const exact = (p: { name: string; slug: string }) =>
			nameMatchScore(p.name ?? "", p.slug ?? "", q) === 3 ? 1 : 0;
		const act = (p: { status: string }) => (p.status === "Inactive" ? 0 : 1);
		baseProjects.sort((a, b) => exact(b) - exact(a) || act(b) - act(a));
	}
	let projectsOut: Array<
		(typeof baseProjects)[number] & {
			repos: ProjectRepoRef[];
			lastActivityAt: string | null;
		}
	> = baseProjects.map((p) => ({ ...p, repos: [], lastActivityAt: null }));
	if (payload && baseProjects.length) {
		const slugs = baseProjects.map((p) => p.slug).filter(Boolean);
		try {
			const repoRes = await payload.find({
				collection: "repos",
				where: { projectSlug: { in: slugs } },
				sort: "-repoScore",
				limit: Math.min(slugs.length * 8, 500),
				depth: 0,
				// Only the fields ProjectRepoRef surfaces — NOT the README excerpt,
				// which bloated this per-project fetch and timed the endpoint out.
				select: {
					fullName: true,
					url: true,
					primaryLanguage: true,
					stars: true,
					repoScore: true,
					repoScoreLabel: true,
					judgeScore: true,
					hackathonWinner: true,
					projectSlug: true,
					lastCommitAt: true,
				},
			});
			const bySlug = new Map<string, ProjectRepoRef[]>();
			for (const r of repoRes.docs as unknown as Array<
				Record<string, unknown>
			>) {
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
					lastCommitAt: (r.lastCommitAt as string) ?? null,
				});
				bySlug.set(s, arr);
			}
			// Project-level dated signal: most recent commit across the project's
			// own repos, so "is this project active?" answers carry an as-of date
			// without a second lookup. Null when no repo has a known commit date.
			projectsOut = baseProjects.map((p) => {
				const repos = bySlug.get(p.slug) ?? [];
				const lastActivityAt = repos.reduce<string | null>(
					(max, r) =>
						r.lastCommitAt && (!max || r.lastCommitAt > max)
							? r.lastCommitAt
							: max,
					null,
				);
				return { ...p, repos, lastActivityAt };
			});
		} catch {
			// best-effort — ship projects without per-project repos on any error
		}
	}

	// Org attribution: which entity/organization builds each project — answers
	// "who built LOBSTR?" (Ultra Stellar) / "who is behind Soroswap?" (Paltalabs)
	// directly from a search result instead of requiring the entities endpoint.
	// One cheap query over the small entities collection (depth 0 → projects as
	// ID arrays), mapped in memory. Best-effort: null when no org is linked.
	let builtByMap = new Map<string, { name: string; slug: string }>();
	if (payload && projectsOut.length) {
		try {
			const entRes = await payload.find({
				collection: "entities",
				limit: 300,
				depth: 0,
				select: { name: true, slug: true, projects: true },
			});
			const m = new Map<string, { name: string; slug: string }>();
			for (const e of entRes.docs as unknown as Array<
				Record<string, unknown>
			>) {
				const ids = Array.isArray(e.projects) ? e.projects : [];
				for (const pid of ids) {
					const key =
						typeof pid === "string"
							? pid
							: String((pid as { id?: unknown })?.id ?? pid);
					// First entity wins on the rare multi-org project — entities are
					// curated one-org-per-project today.
					if (!m.has(key))
						m.set(key, { name: String(e.name), slug: String(e.slug) });
				}
			}
			builtByMap = m;
		} catch {
			// best-effort — results ship without attribution on any error
		}
	}
	// Anchor corridor data (sls-012): Anchor-typed project records described
	// their coverage only in prose ("20 African countries incl. Nigeria") —
	// unfilterable, undateable. The partner directory already carries the
	// STRUCTURED fields (stellar.toml-enriched countries/assets/SEPs/ramps),
	// so join them on by normalized name instead of duplicating the data.
	// Best-effort, one small query only when the page contains Anchor rows.
	interface AnchorProfile {
		slug: string;
		country: string | null;
		regions: string[];
		assets: string[];
		seps: string[];
		rampTypes: string[];
		asOf: string | null;
		url: string;
	}
	let anchorProfiles = new Map<string, AnchorProfile>();
	const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
	// projectsOut is a union of keyword rows (carry `types`) and semantic-search
	// rows (don't) — read types defensively so the union access typechecks.
	const typesOf = (p: unknown): string[] => {
		const t = (p as { types?: unknown }).types;
		return Array.isArray(t) ? (t as string[]) : [];
	};
	const isAnchorRow = (p: unknown) =>
		typesOf(p).some((t) => t.toLowerCase() === "anchor");
	const hasAnchorRows = projectsOut.some(isAnchorRow);
	if (payload && hasAnchorRows) {
		try {
			const pRes = await payload.find({
				collection: "partner-accounts",
				where: { partnerType: { equals: "anchor" } },
				limit: 100,
				depth: 0,
				select: {
					name: true,
					slug: true,
					country: true,
					regions: true,
					assets: true,
					seps: true,
					rampTypes: true,
					lastPartnerUpdateAt: true,
				},
			});
			const m = new Map<string, AnchorProfile>();
			for (const d of pRes.docs as unknown as Array<Record<string, unknown>>) {
				const tags = (arr: unknown): string[] =>
					Array.isArray(arr)
						? arr
								.map((x) =>
									typeof x === "string"
										? x
										: String(
												(x as { tag?: unknown; code?: unknown })?.tag ??
													(x as { code?: unknown })?.code ??
													"",
											),
								)
								.filter(Boolean)
						: [];
				m.set(norm(String(d.name)), {
					slug: String(d.slug),
					country: (d.country as string) ?? null,
					regions: tags(d.regions),
					assets: tags(d.assets),
					seps: tags(d.seps),
					rampTypes: tags(d.rampTypes),
					asOf: (d.lastPartnerUpdateAt as string) ?? null,
					url: `https://stellarlight.xyz/partners/${d.slug}`,
				});
			}
			anchorProfiles = m;
		} catch {
			// best-effort — rows ship without anchorProfile on any error
		}
	}

	const projectsWithOrg = projectsOut.map((p) => ({
		...p,
		builtBy: builtByMap.get(p.id) ?? null,
		anchorProfile: isAnchorRow(p)
			? (anchorProfiles.get(norm(p.name)) ?? null)
			: null,
	}));

	logApiHit({
		req,
		endpoint: "/api/projects/search",
		query: q,
		filters: {
			category,
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
					scfAwarded: scfAwardedOnly,
					scfAwardedOnly,
					limit,
					offset,
				},
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
				// sls-011: the SCF fields on rows (scfTotalAwardedUSD, scfAwardedRounds,
				// scfAmountStatus) carry their counting basis HERE, where the numbers
				// appear — not only on /api/analyze. Totals are in-house reconstructions
				// (SCF doesn't publish all per-award amounts; some are XLM/undisclosed —
				// see scfAmountStatus), so they can legitimately disagree with SDF's own
				// submission-based counters. scfAwardedRounds lists the rounds a project
				// won; per-round amounts are unpublished. Full breakdown at /api/analyze?dimension=funding.
				scfCountBasis:
					"scfTotalAwardedUSD is an in-house reconstruction (SCF doesn't publish all per-award amounts — some XLM-denominated/undisclosed, see scfAmountStatus); it can legitimately differ from SDF's submission-based counters. scfAwardedRounds = rounds this project won (per-round amounts unpublished). Full per-round breakdown: /api/analyze?dimension=funding.",
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
			projects: projectsWithOrg,
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

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
