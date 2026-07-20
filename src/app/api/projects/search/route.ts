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
import { projectConfidence, semanticProjectConfidence } from "@/lib/confidence";
import { embed } from "@/lib/embed";
import { clampLimit, parseFields, pickFields } from "@/lib/http-params";
import { laneHints, superlativeNote } from "@/lib/lane-hints";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	anchorIdentityHit,
	anchorTokens,
	buildHaystack,
	corridorMatch,
	hitsAnyToken,
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
	// F3: augmentation keeps the calibrated 0.68 floor (no noise on top of
	// results); RESCUE (keyword total=0 — misspellings, slug forms) lowers it
	// to 0.6: a below-distribution-but-close match beats an empty page, and
	// meta.semantic + the label tell the caller how the results were found.
	floor = 0.68,
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
				statusAsOf: 1,
				statusSourceUrl: 1,
				statusBasis: 1,
				canonicalSlug: 1,
				lifecycle: 1,
				logo: 1,
				scf: 1,
				links: 1,
				coverage: 1,
				supportedNetworks: 1,
				types: 1,
				prominence: 1,
				hackathonPlacement: 1,
				// F8/sls-031: TVL facts + provenance must be PROJECTED to be served —
				// the mapper already read tvlUSD/tvlAsOf but this $project omitted
				// them (F3 class), so semantic rows serialized TVL as null.
				tvlUSD: 1,
				tvlAsOf: 1,
				tvlSource: 1,
				tvlMethod: 1,
				// sls-039: mapped provider identifiers ride semantic rows too
				llamaSlugs: 1,
				// on-chain metrics (2026-07-20): absent = not tracked, never zero
				onchain: 1,
				// PG Award truth rides semantic rows too (F3 class)
				publicGoods: 1,
				// sls-032/035: route evidence + venue role must be PROJECTED to be
				// served (the F3 class — the mapper can't read omitted fields).
				routes: 1,
				venueRole: 1,
				// sls-033: wallet product kind + per-platform availability
				productKind: 1,
				availability: 1,
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
	const docs = raw.filter((p) => (p.score ?? 0) >= floor);
	if (docs.length === 0) return []; // no genuinely-close match (or index unbuilt)
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
			// sls-024: status provenance (when/what evidence dated the label)
			statusAsOf: p.statusAsOf ?? null,
			statusSourceUrl: p.statusSourceUrl ?? null,
			statusBasis: p.statusBasis ?? null,
			canonicalSlug: p.canonicalSlug ?? null,
			identity: pickIdentity(p),
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
			// F3 (audit): semantic rows serialized types=[] / prominence=null for
			// records that HAVE both — the $project simply omitted the fields.
			types: Array.isArray(p.types) ? p.types : [],
			prominence: typeof p.prominence === "number" ? p.prominence : null,
			// F8: TVL facts (DefiLlama; null = not tracked there, never zero)
			onchain: pickOnchain(p.onchain),
			publicGoods: pickPublicGoods(p.publicGoods),
			tvlUSD: typeof p.tvlUSD === "number" ? p.tvlUSD : null,
			tvlAsOf: p.tvlAsOf ?? null,
			// sls-031: TVL methodology provenance (which source, computed how)
			tvlSource: p.tvlSource ?? null,
			tvlMethod: p.tvlMethod ?? null,
			// sls-039: mapped DefiLlama identifiers + citation URL
			llamaSlugs: pickLlamaSlugs(p.llamaSlugs),
			tvlMethodUrl: tvlMethodUrlFor(pickLlamaSlugs(p.llamaSlugs)),
			// sls-032/035: route-level bridge evidence + DEX-landscape role
			routes: pickRoutes(p.routes),
			venueRole: typeof p.venueRole === "string" ? p.venueRole : null,
			// sls-033: wallet product kind + per-platform availability
			productKind: typeof p.productKind === "string" ? p.productKind : null,
			availability: pickAvailability(p.availability),
			hackathon: null,
			hackathonPlacement: p.hackathonPlacement ?? null,
			hackathonPrize: null,
			hackathonPrizeTrack: null,
			score: p.score ?? 0,
			via: "semantic" as const,
			url: `https://stellarlight.xyz/project/${p.slug}`,
			// Semantic honesty (audit R1): absolute-cosine relevance + a hard cap
			// below "high" — a fallback guess can't outrank literal-match trust.
			confidence: semanticProjectConfidence({
				score: p.score ?? 0,
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
	/** Searchable haystack (F2: relaxed-tier anchor guard re-tests it). Semantic rows may omit it. */
	hay?: string;
	/** Mention-vs-identity: anchor token hits the record's identity zone (name/
	 * category/types/coverage/description lead). Absent on semantic/browse rows
	 * — the discriminator then treats the row as identity (rule off). */
	anchorIdentity?: boolean;
	id: string;
	name: string;
	slug: string;
	category: string;
	shortDescription: string | null;
	status: string;
	// sls-024: status provenance — when the label was asserted, the primary
	// evidence URL, and what kind of evidence it is. Null on legacy rows.
	statusAsOf?: string | null;
	statusSourceUrl?: string | null;
	statusBasis?: string | null;
	tvlUSD?: number | null;
	// biome-ignore lint/suspicious/noExplicitAny: passthrough group
	onchain?: any;
	tvlAsOf?: string | null;
	// sls-031: TVL provenance — which source produced tvlUSD and how.
	tvlSource?: string | null;
	tvlMethod?: string | null;
	// sls-039: mapped DefiLlama protocol identifiers + a citation URL, so a
	// consumer can follow tvlUSD to the provider's own page/series. Null when
	// the project isn't llama-mapped.
	llamaSlugs?: string[] | null;
	tvlMethodUrl?: string | null;
	// sls-032: curated route-level bridge evidence (null = not curated, NOT
	// route-free). See pickRoutes.
	routes?: BridgeRoute[] | null;
	// sls-035: DEX-landscape role (null = unclassified, not "not a venue").
	venueRole?: string | null;
	// sls-033: wallet-landscape product kind (null = unclassified, not "not a
	// wallet") + per-platform app availability (null = not curated, NOT
	// "unavailable") — availability is deliberately separate from `status`.
	productKind?: string | null;
	availability?: PlatformAvailability[] | null;
	canonicalSlug: string | null;
	// sls-050: rename continuity as data — aliases resolve here in search and
	// the block carries provenance. Null when the project never renamed.
	identity: {
		currentName: string;
		aliases: string[];
		renamedAt: string | null;
		sourceUrl: string | null;
	} | null;
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

// sls-050: identity block served when a record carries aliases.
// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
function pickIdentity(p: any): ProjectRow["identity"] {
	const aliases = Array.isArray(p.aliases) ? p.aliases.filter(Boolean) : [];
	if (!aliases.length) return null;
	return {
		currentName: p.name,
		aliases,
		renamedAt: p.renamedAt ?? null,
		sourceUrl: p.renameSourceUrl ?? null,
	};
}

// Name-lookup rank (sls-009): the standard directory-search contract — a
// query that IS a project's name must return that project first, regardless
// of how much authority (prominence/SCF/stars) other keyword matches carry.
function nameMatchScore(
	name: string,
	slug: string,
	q: string,
	aliases?: string[] | null,
): number {
	const qq = q.trim().toLowerCase();
	if (!qq) return 0;
	const n = name.trim().toLowerCase();
	if (n === qq || slug.toLowerCase() === qq) return 3;
	// sls-050: an exact former-name hit IS an exact name hit — rename
	// continuity served as data, not synonym patches.
	if ((aliases ?? []).some((a) => a.trim().toLowerCase() === qq)) return 3;
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

// sls-032 (#516): a served route-level bridge fact. A Bridge-typed project
// hit is DISCOVERY-level; these curated rows are the route-level evidence
// (chain pair, direction, assets, destination representation, mechanism),
// each grounded in the provider's own docs (sourceUrl + asOf).
interface BridgeRoute {
	fromChain: string;
	toChain: string;
	direction: string | null;
	assets: string[];
	assetRepresentation: string | null;
	mechanism: string | null;
	sourceUrl: string | null;
	asOf: string | null;
}

// Only surfaced when curated route rows exist — null means "no curated route
// evidence" (unknown), never "no routes". Strips Payload's internal row ids.
function pickRoutes(
	// biome-ignore lint/suspicious/noExplicitAny: payload array field shape
	rows: any,
): BridgeRoute[] | null {
	if (!Array.isArray(rows) || rows.length === 0) return null;
	const out: BridgeRoute[] = [];
	for (const r of rows) {
		if (!r || typeof r !== "object") continue;
		if (typeof r.fromChain !== "string" || typeof r.toChain !== "string")
			continue;
		out.push({
			fromChain: r.fromChain,
			toChain: r.toChain,
			direction: typeof r.direction === "string" ? r.direction : null,
			assets: Array.isArray(r.assets)
				? r.assets.filter((a: unknown) => typeof a === "string" && a)
				: [],
			assetRepresentation:
				typeof r.assetRepresentation === "string"
					? r.assetRepresentation
					: null,
			mechanism: typeof r.mechanism === "string" ? r.mechanism : null,
			sourceUrl: typeof r.sourceUrl === "string" ? r.sourceUrl : null,
			asOf: typeof r.asOf === "string" ? r.asOf : null,
		});
	}
	return out.length ? out : null;
}

// sls-033 (#519): a served per-platform availability fact — deliberately
// separate from the lifecycle `status` (a Live project can have a dead store
// listing). Each row is store-checked and dated by curation.
interface PlatformAvailability {
	platform: string;
	state: string;
	storeUrl: string | null;
	checkedAt: string | null;
	note: string | null;
}

// Only surfaced when curated availability rows exist — null means "not yet
// curated" (unknown), never "not available". Strips Payload's internal row ids.
function pickAvailability(
	// biome-ignore lint/suspicious/noExplicitAny: payload array field shape
	rows: any,
): PlatformAvailability[] | null {
	if (!Array.isArray(rows) || rows.length === 0) return null;
	const out: PlatformAvailability[] = [];
	for (const r of rows) {
		if (!r || typeof r !== "object") continue;
		if (typeof r.platform !== "string" || typeof r.state !== "string") continue;
		out.push({
			platform: r.platform,
			state: r.state,
			storeUrl: typeof r.storeUrl === "string" ? r.storeUrl : null,
			checkedAt: typeof r.checkedAt === "string" ? r.checkedAt : null,
			note: typeof r.note === "string" ? r.note : null,
		});
	}
	return out.length ? out : null;
}

/**
 * On-chain metrics passthrough (2026-07-20). null = not tracked in our
 * registry — NEVER "no on-chain activity". Rows serve only when the enrich
 * pipeline populated the group (asOf present).
 */
/** PG Award passthrough: null = not a confirmed recipient at our source —
 * NEVER "not a public good". */
// biome-ignore lint/suspicious/noExplicitAny: Payload group shape
function pickPublicGoods(g: any) {
	if (!g || !Array.isArray(g.awardRounds) || g.awardRounds.length === 0)
		return null;
	return {
		awardRounds: g.awardRounds,
		evidenceUrl: g.evidenceUrl ?? null,
	};
}

// biome-ignore lint/suspicious/noExplicitAny: Payload group shape
function pickOnchain(o: any) {
	if (!o || !o.asOf) return null;
	return {
		assetCode: o.assetCode ?? null,
		issuer: o.issuer ?? null,
		assetHolders: typeof o.assetHolders === "number" ? o.assetHolders : null,
		assetHoldersDelta:
			typeof o.assetHoldersDelta === "number" ? o.assetHoldersDelta : null,
		assetSupply: typeof o.assetSupply === "number" ? o.assetSupply : null,
		contracts: Array.isArray(o.contracts)
			? o.contracts.map(
					// biome-ignore lint/suspicious/noExplicitAny: Payload array row
					(c: any) => ({
						address: c.address ?? null,
						label: c.label ?? null,
						events: typeof c.events === "number" ? c.events : null,
						eventsDelta:
							typeof c.eventsDelta === "number" ? c.eventsDelta : null,
						subinvocationsDelta:
							typeof c.subinvocationsDelta === "number"
								? c.subinvocationsDelta
								: null,
						subinvocations:
							typeof c.subinvocations === "number" ? c.subinvocations : null,
						storageEntries:
							typeof c.storageEntries === "number" ? c.storageEntries : null,
						createdAt: c.createdAt ?? null,
						verifiedRepo: c.verifiedRepo ?? null,
					}),
				)
			: [],
		source: o.source ?? null,
		asOf: o.asOf ?? null,
		prevAsOf: o.prevAsOf ?? null,
		deltaDays: typeof o.deltaDays === "number" ? o.deltaDays : null,
	};
}

// sls-039: served llamaSlugs (null when unmapped — mirrors tvlUSD's "null =
// not tracked" semantics) + a citation URL to the provider's own protocol
// page, where the full TVL time series lives.
function pickLlamaSlugs(slugs: unknown): string[] | null {
	const arr = Array.isArray(slugs)
		? slugs.filter((s): s is string => typeof s === "string" && s.length > 0)
		: [];
	return arr.length ? arr : null;
}
function tvlMethodUrlFor(slugs: string[] | null): string | null {
	return slugs?.length ? `https://defillama.com/protocol/${slugs[0]}` : null;
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
	// Accept 1/true/yes/on (and the `scfAwardedOnly` alias) — agents naturally
	// send `scfAwarded=true`, which previously fell through to UNFILTERED
	// results while the caller believed they'd filtered to SCF-funded projects.
	// sls-040 residual (#521, Engine E invalid-accepted): any OTHER value used
	// to be silently coerced (bogus → falsy → unfiltered) — a documented
	// boolean param with an unrecognized value now 400s like type/status/
	// category do, instead of pretending the filter applied (or didn't).
	const scfRaw = (sp.get("scfAwarded") ?? sp.get("scfAwardedOnly"))
		?.toLowerCase()
		.trim();
	const SCF_TRUE = ["1", "true", "yes", "on"];
	const SCF_FALSE = ["0", "false", "no", "off"];
	if (scfRaw && !SCF_TRUE.includes(scfRaw) && !SCF_FALSE.includes(scfRaw)) {
		return NextResponse.json(
			{
				error: `Invalid scfAwarded value '${scfRaw}' — it is a boolean filter.`,
				acceptedValues: { true: SCF_TRUE, false: SCF_FALSE },
			},
			{ status: 400 },
		);
	}
	const scfAwardedOnly = !!scfRaw && SCF_TRUE.includes(scfRaw);
	const limit = clampLimit(sp.get("limit"), 20, 100);
	const fieldsWanted = parseFields(sp.get("fields"));
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);
	// status filter (2026-07-11 audit): 81 Inactive projects were UNREACHABLE —
	// nothing filtered on status, and unknown params were silently ignored, so
	// ?status=Inactive returned all-Live results "as if filtered".
	const statusParam = sp.get("status")?.trim() || null;
	const VALID_STATUSES = [
		"Live",
		"Inactive",
		"Development",
		"Pre-Release",
		"Pre-Development",
	] as const;
	if (
		statusParam &&
		!(VALID_STATUSES as readonly string[]).includes(statusParam)
	) {
		return NextResponse.json(
			{
				error: `Invalid status '${statusParam}'.`,
				validStatuses: VALID_STATUSES,
			},
			{ status: 400 },
		);
	}
	// type filter (sls-033): ?type=Wallet was silently ignored — q=wallet&type=Wallet
	// returned rows identical to q=wallet, so a caller believed they had an exact
	// Wallet-typed enumeration while getting keyword soup. Validate against the
	// `types` select options (src/collections/Projects.ts) and filter server-side,
	// mirroring statusParam: DB where clause + semantic-source filter + post-fold
	// enforcement + echo in meta.filters.
	const typeParam = sp.get("type")?.trim() || null;
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
	if (typeParam && !(VALID_TYPES as readonly string[]).includes(typeParam)) {
		return NextResponse.json(
			{
				error: `Invalid type '${typeParam}'.`,
				validTypes: VALID_TYPES,
			},
			{ status: 400 },
		);
	}
	// Honest contract (2026-07-11 audit, EMPTY-DISHONEST med): an unknown param
	// (?country=NG, ?sep=24) was silently dropped — the caller got unfiltered
	// results while believing they'd filtered. We can't 400 (additive-only
	// contract), but we can SAY it: responses carry meta.warnings.
	const KNOWN_PARAMS = new Set([
		"q",
		"query",
		"keyword",
		"search",
		"category",
		"type",
		"scfAwarded",
		"scfAwardedOnly",
		"status",
		"limit",
		"offset",
		"exp",
		"fields",
	]);
	const unknownParams = [...new Set([...sp.keys()])].filter(
		(k) => !KNOWN_PARAMS.has(k),
	);
	const warnings = unknownParams.length
		? [
				`Unknown parameter(s) ignored: ${unknownParams.join(", ")}. Results are NOT filtered by them. Supported: q, category, type, status, scfAwarded, limit, offset. For country/currency/SEP/network intents, put the term in q (e.g. ?q=anchor+nigeria) — structured coverage is matched from query text.`,
			]
		: [];

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
	if (!q && !category && !scfAwardedOnly && !statusParam && !typeParam) {
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
					...(warnings.length ? { warnings } : {}),
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
	let matchMode: "strict" | "loose-1" | "majority" | "semantic" | "all" = "all";

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
			if (statusParam) {
				// Explicit filter overrides the default status pool — this is what
				// makes the Inactive corpus reachable (?status=Inactive).
				where.status = { equals: statusParam };
			}
			if (typeParam) {
				// sls-033: `types` is a hasMany select — `contains` is exact array
				// membership, so ?type=Wallet enumerates only Wallet-typed records.
				where.types = { contains: typeParam };
			}
			if (!q) {
				// Browse mode (no query): lineage shadows are merged-away dupes, not
				// real records — exclude them in the DB so counts.total and page
				// sizes are exact (re-measure 2026-07-11: ?status=Inactive said
				// total=82 but only 42 real rows survived the fold). Query mode
				// keeps shadows as candidates: their NAMES must stay searchable so
				// the fold can serve the canonical for alias lookups.
				where.canonicalSlug = { equals: null };
			}

			const tokens = tokenize(q);
			const intentTypes = intentTypesFor(tokens);
			const rampIntent = isRampIntent(tokens);
			// TVL-superlative intent (2026-07-11 audit, F1 class): "highest tvl"
			// returned five tvl=null records while Blend ($139M) sat unfetched —
			// the structured field the query literally asks about played no part.
			const tvlIntent = /\btvl\b|total value locked/i.test(q);
			// "X vs Y" comparison (audit: blend vs yieldblox dropped Blend): both
			// SUBJECTS must be present — tiered token matching can drop one.
			const vsMatch = q.match(/^(.+?)\s+(?:vs\.?|versus)\s+(.+)$/i);

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
					{ aliases: { like: v } },
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
					// TVL intent: every TVL-tracked record joins the candidate pool —
					// "highest tvl" must consider the actual TVL leaders, whose prose
					// never contains the word "tvl".
					...(tvlIntent ? [{ tvlUSD: { greater_than: 0 } }] : []),
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
					statusAsOf?: string | null;
					statusSourceUrl?: string | null;
					statusBasis?: string | null;
					tvlUSD?: number | null;
					// biome-ignore lint/suspicious/noExplicitAny: passthrough group
					onchain?: any;
					// biome-ignore lint/suspicious/noExplicitAny: passthrough group
					publicGoods?: any;
					tvlAsOf?: string | null;
					tvlSource?: string | null;
					tvlMethod?: string | null;
					llamaSlugs?: string[] | null;
					routes?: unknown;
					venueRole?: string | null;
					productKind?: string | null;
					availability?: unknown;
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
				// Mention-vs-identity: does an anchor token hit where the record
				// says what it IS (name/category/types/coverage/description lead)?
				const anchorIdentity = anchorIdentityHit(p, tokens);
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
					hay, // F2: relaxed-tier anchor guard re-tests tokens on the row
					anchorIdentity,

					id: String(p.id),
					name: p.name,
					slug: p.slug,
					category: p.category,
					shortDescription: p.shortDescription ?? null,
					status: p.status,
					// sls-024: status provenance rides every row (null on legacy rows)
					statusAsOf: p.statusAsOf ?? null,
					statusSourceUrl: p.statusSourceUrl ?? null,
					statusBasis: p.statusBasis ?? null,
					// F8: TVL facts ride the keyword rows too (the semantic mapper
					// already carries them) — null = not tracked on DefiLlama.
					onchain: pickOnchain(p.onchain),
					publicGoods: pickPublicGoods(p.publicGoods),
					tvlUSD: typeof p.tvlUSD === "number" ? p.tvlUSD : null,
					tvlAsOf: p.tvlAsOf ?? null,
					// sls-031: TVL methodology provenance
					tvlSource: p.tvlSource ?? null,
					tvlMethod: p.tvlMethod ?? null,
					// sls-039: mapped DefiLlama identifiers + citation URL
					llamaSlugs: pickLlamaSlugs(p.llamaSlugs),
					tvlMethodUrl: tvlMethodUrlFor(pickLlamaSlugs(p.llamaSlugs)),
					// sls-032/035: route-level bridge evidence + DEX-landscape role
					routes: pickRoutes(p.routes),
					venueRole: typeof p.venueRole === "string" ? p.venueRole : null,
					// sls-033: wallet product kind + per-platform availability
					productKind: typeof p.productKind === "string" ? p.productKind : null,
					availability: pickAvailability(p.availability),
					canonicalSlug: p.canonicalSlug ?? null,
					identity: pickIdentity(p),
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
				// F2 (audit root #2): relaxed tiers must keep the intent-bearing
				// rare token. Without this, dropping a token drops the NOUN and
				// keeps the verb — "buy gold" matched everything containing
				// "buy". A record admitted at loose-1/majority must hit at least
				// one anchor (non-generic) token; queries that are ALL generic
				// keep today's behavior.
				const anchors = anchorTokens(tokens);
				const keepsAnchor = (p: ProjectRow) =>
					anchors.length === 0 || !p.hay || hitsAnyToken(p.hay, anchors);
				if (filtered.length === 0 && tokens.length >= 3) {
					matchMode = "loose-1";
					filtered = projects
						.filter(admit(tokens.length - 1))
						.filter(keepsAnchor);
				}
				if (filtered.length === 0 && tokens.length >= 2) {
					matchMode = "majority";
					filtered = projects
						.filter(admit(Math.ceil(tokens.length / 2)))
						.filter(keepsAnchor);
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
				// TVL bypass (mirrors the corridor bypass): under TVL intent, every
				// TVL-tracked candidate is admitted regardless of prose token count —
				// Blend's description doesn't say "tvl", its tvlUSD field does.
				if (tvlIntent) {
					const have = new Set(filtered.map((p) => p.id));
					for (const p of projects) {
						if (!have.has(p.id) && p.tvlUSD != null) {
							filtered.push(p);
							have.add(p.id);
						}
					}
				}
				// Identity under-fill bypass (2026-07-19, custody re-measure): the
				// tier ladder only relaxes on EMPTY, so a strict page part-filled by
				// prose-mentioners locks out the record that IS the anchor thing but
				// misses a secondary token — on "custody with staking" the custody
				// provider could only arrive via the semantic rung, appended last.
				// On an under-filled page, admit majority-tier rows whose anchor
				// hits their IDENTITY zone (name/category/types/coverage/description
				// lead); the mention-vs-identity sort key then ranks them on merit.
				// matchMode reports "majority" — the page now carries majority-
				// admitted rows, and saying "strict" would be a lie.
				if (
					filtered.length > 0 &&
					filtered.length < limit &&
					tokens.length >= 2
				) {
					const majorityAdmit = admit(Math.ceil(tokens.length / 2));
					const have = new Set(filtered.map((p) => p.id));
					let added = 0;
					for (const p of projects) {
						if (have.has(p.id) || p.anchorIdentity !== true) continue;
						if (!majorityAdmit(p)) continue;
						filtered.push(p);
						have.add(p.id);
						added += 1;
					}
					if (added > 0 && matchMode === "strict") matchMode = "majority";
				}

				// "X vs Y": guarantee BOTH named subjects are present — pick each
				// subject's best name-match from the full candidate pool (exact or
				// prefix, ≥2) and admit it if the tiers dropped it.
				if (vsMatch) {
					const have = new Set(filtered.map((p) => p.id));
					for (const subject of [vsMatch[1].trim(), vsMatch[2].trim()]) {
						let best: (typeof projects)[number] | null = null;
						let bestRank = 1; // require ≥2 (prefix or exact)
						for (const p of projects) {
							const r = nameMatchScore(
								p.name,
								p.slug,
								subject,
								p.identity?.aliases,
							);
							if (r > bestRank) {
								bestRank = r;
								best = p;
							}
						}
						if (best && !have.has(best.id)) {
							filtered.push(best);
							have.add(best.id);
						}
					}
				}
				// Name-lookup contract (sls-009): an exact/prefix/whole-word name
				// match must dominate every authority signal — q="Blend" ranked
				// Reflector (authority-heavy) above the project literally named
				// Blend. Exact=3, prefix=2, whole-word-in-name=1, else 0.
				const nameRank = new Map(
					filtered.map((p) => [
						p.id,
						nameMatchScore(p.name, p.slug, q, p.identity?.aliases),
					]),
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
						// Mention-vs-identity leads over raw token coverage: a record
						// that IS the anchor thing (custody provider) outranks records
						// that merely MENTION it mid-prose plus a secondary token
						// ("...held in qualified custody... staking" ≠ custody+staking
						// product). 2026-07-19 re-measure of audit item 1.
						Number(b.anchorIdentity ?? true) -
							Number(a.anchorIdentity ?? true) ||
						b.score - a.score ||
						// Structured relevance (type-match OR corridor coverage-match)
						// leads over pure prose matches at the same keyword score.
						Number(structuredHit(b, intentTypes, tokens, rampIntent)) -
							Number(structuredHit(a, intentTypes, tokens, rampIntent)) ||
						rankBoost(b) - rankBoost(a) ||
						(nameRank.get(b.id) ?? 0) - (nameRank.get(a.id) ?? 0) ||
						(confByName.get(b.id) ?? 0) - (confByName.get(a.id) ?? 0),
				);
				// "X vs Y" re-pin AFTER the sort (re-measure 2026-07-11: subjects
				// admitted pre-sort got re-buried — aquarius at #7, outside the
				// default window). Both named subjects move to the front, best
				// name-match order preserved between them.
				if (vsMatch) {
					const subjectIds: string[] = [];
					for (const subject of [vsMatch[1].trim(), vsMatch[2].trim()]) {
						let best: (typeof filtered)[number] | null = null;
						let bestRank = 1;
						for (const p of filtered) {
							const r = nameMatchScore(
								p.name,
								p.slug,
								subject,
								p.identity?.aliases,
							);
							if (r > bestRank) {
								bestRank = r;
								best = p;
							}
						}
						if (best) subjectIds.push(best.id);
					}
					if (subjectIds.length) {
						const front = filtered.filter((p) => subjectIds.includes(p.id));
						const rest = filtered.filter((p) => !subjectIds.includes(p.id));
						filtered = [...front, ...rest];
					}
				}
				projects = filtered;
				// TVL-superlative float: rows that HAVE the asked-about number rank
				// above rows that don't, ordered by it. Stable, so within each group
				// the careful sort above is preserved.
				if (tvlIntent) {
					projects.sort(
						(a, b) =>
							(b.tvlUSD != null ? 1 : 0) - (a.tvlUSD != null ? 1 : 0) ||
							(b.tvlUSD ?? 0) - (a.tvlUSD ?? 0),
					);
				}
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
	// F3 (audit: keyword confidence uniform 0.97): normalize relevance against
	// the QUERY size, not just the page max — a row matching 2 of 3 tokens now
	// reads lower than a full match instead of both saturating at 1.0.
	const qTokenCount = tokenize(q).length;
	const projMax = Math.max(
		projects.reduce((m, p) => Math.max(m, p.score ?? 0), 0),
		qTokenCount || 1,
	);
	const scored = projects.map((p) => ({
		...p,
		via: "keyword" as const,
		confidence: projectConfidence({
			score: p.score,
			maxScore: projMax,
			status: p.status,
			scfAwarded: p.scfAwarded,
			hackathonPlacement: p.hackathonPlacement,
			anchorPlacement:
				qTokenCount === 0 || p.anchorIdentity == null
					? null
					: p.anchorIdentity
						? "identity"
						: "mention",
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
			// F3: zero keyword hits = rescue mode (lower floor) — the audit's
			// misspelling/slug-form probes died at total:0 with no fallback.
			const sem = await semanticProjectRows(
				payload,
				q,
				limit,
				scored.length === 0 ? 0.6 : 0.68,
			);
			const have = new Set(scored.map((r) => r.id));
			semanticAdds = sem
				.filter((r) => !have.has(r.id))
				// ?status= is a hard contract — the vector index has no status
				// filter, so enforce it here AT THE SOURCE. Filtering later (post
				// count/slice) produced phantom counts and under-filled pages
				// (re-measure 2026-07-11: total=1 with projects=[]).
				.filter((r) => !statusParam || r.status === statusParam)
				// ?type= is the same hard contract (sls-033): semantic rows carry
				// types[], so enforce exact membership at the source too.
				.filter(
					(r) =>
						!typeParam ||
						(Array.isArray(r.types) && r.types.includes(typeParam)),
				)
				.slice(0, limit - scored.length);
		} catch {
			// index not ready / no embedding key — degrade to keyword-only
		}
	}
	const usedSemantic = semanticAdds.length > 0;
	// Semantic honesty (audit R1): when EVERY row on the page came from the
	// vector fallback, the ladder's residual matchMode ("strict"/"majority")
	// is a lie — no keyword tier matched anything. Say so, so an agent frames
	// these as similarity guesses, not keyword-confirmed answers.
	if (usedSemantic && scored.length === 0) matchMode = "semantic";

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
	// F2: `hay` is internal scoring state — strip it here so it can never
	// serialize into the API response (rows past this point feed projectsOut).
	let baseProjects = [...scored, ...semanticAdds].map((p) => {
		const {
			hay: _hay,
			anchorIdentity: _ai,
			...rest
		} = p as typeof p & { hay?: string; anchorIdentity?: boolean };
		return rest;
	});
	// Shadow-fold (2026-07-11 audit, WRONG-RESULT high): a merged duplicate
	// ("lineage shadow": canonicalSlug → another record, status Inactive) must
	// never be SERVED — q=stellarexpert ranked the Inactive tombstone #1 while
	// the Live canonical was absent, telling a cold consumer the flagship
	// explorer is dead. Shadows stay in the index so alias names keep MATCHING;
	// here each surfaced shadow is swapped for its canonical record at the
	// shadow's rank (or dropped if the canonical already surfaced). Runs before
	// the liveness float so the canonical's real status drives ordering.
	const shadowRows = baseProjects.filter(
		(p) => p.canonicalSlug && p.canonicalSlug !== p.slug,
	);
	if (shadowRows.length && payload) {
		try {
			const want = [
				...new Set(shadowRows.map((s) => s.canonicalSlug as string)),
			];
			const canRes = await payload.find({
				collection: "projects",
				where: { slug: { in: want } },
				limit: want.length,
				depth: 1,
			});
			// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
			const canBySlug = new Map<string, any>(
				// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
				(canRes.docs as any[]).map((d) => [d.slug, d]),
			);
			// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
			const swapped = (row: (typeof baseProjects)[number], c: any) => {
				let logoUrl: string | null = null;
				if (c.logo && typeof c.logo === "object") {
					if (c.logo.url) logoUrl = c.logo.url;
					else if (c.logo.filename)
						logoUrl = `/api/media/file/${c.logo.filename}`;
				}
				return {
					...row,
					id: String(c.id),
					name: c.name,
					slug: c.slug,
					category: c.category,
					shortDescription: c.shortDescription ?? null,
					status: c.status,
					// The swap overrides `status` from the canonical, so its provenance
					// MUST come from the canonical too — otherwise the served canonical
					// status label carries the merged-away shadow tombstone's basis/
					// as-of/source (a statusBasis leak; Tyler F3 recheck 2026-07-15).
					statusAsOf: c.statusAsOf ?? null,
					statusSourceUrl: c.statusSourceUrl ?? null,
					statusBasis: c.statusBasis ?? null,
					tvlUSD: typeof c.tvlUSD === "number" ? c.tvlUSD : null,
					tvlAsOf: c.tvlAsOf ?? null,
					// provenance + sls-039/032/035 fields must be the CANONICAL's, not
					// inherited from the shadow via the spread.
					tvlSource: c.tvlSource ?? null,
					tvlMethod: c.tvlMethod ?? null,
					llamaSlugs: pickLlamaSlugs(c.llamaSlugs),
					tvlMethodUrl: tvlMethodUrlFor(pickLlamaSlugs(c.llamaSlugs)),
					routes: pickRoutes(c.routes),
					venueRole: typeof c.venueRole === "string" ? c.venueRole : null,
					// sls-033: product kind + availability must be the CANONICAL's too
					productKind: typeof c.productKind === "string" ? c.productKind : null,
					availability: pickAvailability(c.availability),
					canonicalSlug: null,
					identity: pickIdentity(c),
					lifecycle: pickLifecycle(c.lifecycle),
					logoUrl,
					scfAwarded: !!c.scf?.awarded,
					scfTotalAwardedUSD: c.scf?.totalAwarded ?? null,
					scfAmountStatus: scfAmountStatus(
						!!c.scf?.awarded,
						c.scf?.totalAwarded,
					),
					scfAwardedRounds: c.scf?.awardedRounds ?? [],
					prominence: typeof c.prominence === "number" ? c.prominence : 0,
					verificationLevel: c.verificationLevel ?? null,
					types: Array.isArray(c.types) ? c.types : [],
					coverage: pickCoverage(c.coverage),
					supportedNetworks: Array.isArray(c.supportedNetworks)
						? c.supportedNetworks
						: [],
					links: pickLinks(c.links),
					url: `https://stellarlight.xyz/project/${c.slug}`,
				};
			};
			// Single pass, first-occurrence-wins: a shadow becomes its canonical AT
			// THE SHADOW'S RANK (the shadow earned that position — usually via
			// exact-name — and the canonical is the record that deserves it); any
			// later duplicate of an already-emitted slug is skipped. This also
			// covers canonical-before-shadow (shadow simply dropped).
			const seen = new Set<string>();
			const folded: typeof baseProjects = [];
			for (const row of baseProjects) {
				const target =
					row.canonicalSlug && row.canonicalSlug !== row.slug
						? row.canonicalSlug
						: null;
				const c = target ? canBySlug.get(target) : null;
				// dangling pointer → keep the shadow rather than lose the hit
				let effective = target && c ? swapped(row, c) : row;
				// ?status= is a hard contract: if the swap would smuggle in a
				// canonical of a DIFFERENT status (Inactive shadow → Live
				// canonical under ?status=Inactive), drop the row entirely — a
				// merged-away shadow is not a real record for a status browse.
				// Dropping here (not post-count) keeps counts and page size
				// honest (re-measure 2026-07-11: returned=5 with 4 rows).
				if (statusParam && effective.status !== statusParam) {
					if (effective !== row) continue; // swapped to other status → drop
					effective = row; // shadow itself off-status can't happen (DB-filtered)
				}
				// ?type= mirrors the status contract (sls-033): a swap must not
				// smuggle in a canonical that lacks the filtered type.
				if (typeParam && effective !== row) {
					const tps = Array.isArray(effective.types) ? effective.types : [];
					if (!tps.includes(typeParam)) continue;
				}
				if (seen.has(effective.slug)) continue;
				seen.add(effective.slug);
				folded.push(effective);
			}
			baseProjects = folded;
		} catch {
			// fold is best-effort — serving the shadow beats erroring the search
		}
	}
	// Belt-and-suspenders on the ?status= contract: keyword candidates are
	// DB-filtered and semanticAdds are filtered at source, so this should be a
	// no-op — but any row that still slips through must not be served. (Counts
	// are recomputed from the final rows at serialization, so this can no
	// longer produce phantom totals.)
	if (statusParam) {
		baseProjects = baseProjects.filter((p) => p.status === statusParam);
	}
	// Same belt-and-suspenders for ?type= (sls-033): keyword candidates are
	// DB-filtered and semanticAdds are filtered at source, so this should be a
	// no-op — but a row without the filtered type must never be served.
	if (typeParam) {
		baseProjects = baseProjects.filter(
			(p) => Array.isArray(p.types) && p.types.includes(typeParam),
		);
	}
	// Final liveness float across the FULL assembled list (keyword + semantic
	// augmentation). A dead project that was the sole strict keyword match must
	// not sit above the live semantic neighbours appended after it — e.g.
	// q="cdp stablecoin lending" put defunct OrbitCDP above live lantern/k2-lend.
	// Stable, so it only lifts active rows above Inactive ones and preserves the
	// careful within-group order. An EXACT name/slug match still wins first, so
	// q="OrbitCDP" keeps returning it even though it's Inactive.
	if (q) {
		const exact = (p: {
			name: string;
			slug: string;
			identity?: ProjectRow["identity"];
		}) =>
			nameMatchScore(p.name ?? "", p.slug ?? "", q, p.identity?.aliases) === 3
				? 1
				: 0;
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
		/** sls-049: empty capability arrays are NOT negative claims. "profiled"
		 * = at least one capability field is verified-filled; "not-profiled" =
		 * we haven't verified this anchor's capabilities yet (unknown, not
		 * absent). Capability fields fill only from verifiable sources
		 * (stellar.toml / the provider's own docs). */
		profileState: "profiled" | "not-profiled";
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
				const assets = tags(d.assets);
				const seps = tags(d.seps);
				const rampTypes = tags(d.rampTypes);
				m.set(norm(String(d.name)), {
					slug: String(d.slug),
					country: (d.country as string) ?? null,
					regions: tags(d.regions),
					assets,
					seps,
					rampTypes,
					asOf: (d.lastPartnerUpdateAt as string) ?? null,
					url: `https://stellarlight.xyz/partners/${d.slug}`,
					// sls-049: make empty-vs-unknown answer-visible — an anchor whose
					// narrative asserts live corridors but whose capability arrays
					// are all empty is UNPROFILED, not capability-free.
					profileState:
						assets.length || seps.length || rampTypes.length
							? "profiled"
							: "not-profiled",
				});
			}
			anchorProfiles = m;
		} catch {
			// best-effort — rows ship without anchorProfile on any error
		}
	}

	// Audit rollup (Raven cold-agent finding, 2026-07-20): "is X audited" was
	// answerable only as a semantic sample over the research corpus — the row
	// itself carried no audit signal despite the audits registry holding the
	// join (audits.projectSlug). One batched find per page; null = no audit
	// on record at our source, NOT a claim the project is unaudited (same
	// semantics as /api/audits).
	const auditsBySlug = new Map<
		string,
		{ count: number; auditors: string[]; latestAt: string | null }
	>();
	if (payload && projectsOut.length > 0) {
		try {
			const slugs = [
				...new Set(
					projectsOut
						.map((p) => p.slug)
						.filter((s): s is string => typeof s === "string" && s.length > 0),
				),
			];
			const auditRows = await payload.find({
				collection: "audits",
				where: { projectSlug: { in: slugs } },
				limit: 500,
				depth: 0,
				overrideAccess: true,
				select: { projectSlug: true, auditor: true, publishedAt: true },
			});
			// biome-ignore lint/suspicious/noExplicitAny: narrow select shape
			for (const a of auditRows.docs as any[]) {
				if (!a.projectSlug) continue;
				const cur = auditsBySlug.get(a.projectSlug) ?? {
					count: 0,
					auditors: [],
					latestAt: null,
				};
				cur.count += 1;
				if (a.auditor && !cur.auditors.includes(a.auditor))
					cur.auditors.push(a.auditor);
				const at =
					typeof a.publishedAt === "string" ? a.publishedAt.slice(0, 10) : null;
				if (at && (!cur.latestAt || at > cur.latestAt)) cur.latestAt = at;
				auditsBySlug.set(a.projectSlug, cur);
			}
		} catch {
			// rollup is additive best-effort — a failed join serves null, never 500s
		}
	}

	const projectsWithOrg = projectsOut.map((p) => ({
		...p,
		builtBy: builtByMap.get(p.id) ?? null,
		anchorProfile: isAnchorRow(p)
			? (anchorProfiles.get(norm(p.name)) ?? null)
			: null,
		audits: auditsBySlug.get(p.slug as string) ?? null,
	}));

	// sls-056: report counts from the FINAL served array. The page
	// (`projects` + `semanticAdds`) is assembled BEFORE the shadow-fold and the
	// status/type belt-filters, which drop duplicate lineage shadows (a shadow
	// whose canonical is already present) and any stray off-filter row. Counting
	// before them over-reported the payload — q=OrbitCDP served 1 row while
	// returned/total both said 2. Subtract exactly the rows the fold removed on
	// this page so the invariants hold: returned === projects.length (served) and
	// total >= returned (totalMatching >= projects.length is guaranteed — it is
	// the pre-slice count set just before the offset/limit slice).
	const returnedCount = projectsWithOrg.length;
	const foldRemoved = projects.length + semanticAdds.length - returnedCount;
	const totalCount = totalMatching + semanticAdds.length - foldRemoved;

	logApiHit({
		req,
		endpoint: "/api/projects/search",
		query: q,
		filters: {
			category,
			scfAwarded: scfAwardedOnly,
			limit,
		},
		resultCount: returnedCount,
		matchMode,
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				...(warnings.length ? { warnings } : {}),
				filters: {
					q,
					category,
					type: typeParam,
					status: statusParam,
					scfAwarded: scfAwardedOnly,
					scfAwardedOnly,
					limit,
					offset,
				},
				matchMode,
				...(superlativeNote(q) ? { superlativeNote: superlativeNote(q) } : {}),
				...(laneHints("projects", {
					empty: projects.length === 0,
					weakMatch:
						matchMode === "majority" ||
						matchMode === "loose-1" ||
						matchMode === "semantic",
				})
					? {
							hints: laneHints("projects", {
								empty: projects.length === 0,
								weakMatch:
									matchMode === "majority" ||
									matchMode === "loose-1" ||
									matchMode === "semantic",
							}),
						}
					: {}),
				// Hint to the caller (agent) so they can frame results honestly:
				//   strict   → "every keyword matched"
				//   loose-1  → "all but one keyword matched"
				//   majority → "most of your keywords matched — broader interpretation"
				//   semantic → NO keyword matched; vector-similarity guesses only
				//   all      → no keyword query was supplied
				matchModeLabel: {
					strict: "all keywords matched",
					"loose-1": "all but one keyword matched",
					majority: "majority of keywords matched (broader scope)",
					semantic:
						"no keyword match — semantically similar results (verify relevance before relying on them)",
					all: "no keyword filter",
				}[matchMode],
				// total = matches before offset/limit slicing — lets paging
				// consumers know when they've seen everything. `semantic` counts
				// the rows on THIS page served by the vector fallback (also part
				// of `total`) so a consumer can separate keyword truth from
				// similarity guesses.
				counts: {
					returned: returnedCount,
					total: totalCount,
					semantic: semanticAdds.length,
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
				// sls-049: empty-field semantics for the anchorProfile join — only
				// emitted when the page actually carries anchor rows.
				...(projectsWithOrg.some((p) => p.anchorProfile)
					? {
							anchorProfileBasis:
								"anchorProfile capability arrays (assets/seps/rampTypes) fill only from VERIFIABLE sources (the anchor's stellar.toml / its own docs). Empty arrays mean not-yet-profiled (see profileState) — NOT that the anchor lacks the capability; never turn an empty array into a negative claim when the description asserts live corridors.",
						}
					: {}),
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
			// ?fields= projection runs LAST so every enrichment (builtBy,
			// anchorProfile, repos, onchain) is present before filtering.
			projects: projectsWithOrg.map((p) => pickFields(p, fieldsWanted)),
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
