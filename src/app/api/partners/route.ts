/**
 * Public partner directory.
 *
 *   GET /api/partners
 *   GET /api/partners?type=anchor&sector=payments&region=latam&accepting=1
 *   GET /api/partners?q=off-ramp
 *
 * Read-only, published partners only. The surface the AI matchmaker and
 * Tyler-style agents consume. Every entry carries:
 *   - partner-claimed facts (services, regions, pricing, capacity)
 *   - verified signals (GitHub activity, on-chain, SCF) — system-computed
 *   - a freshness object so consumers never recommend a stale partner
 *     (the Okashi problem, applied to partners)
 *
 * Pagination matches the rest of the API: limit + offset, counts.total.
 */

import { type NextRequest, NextResponse } from "next/server";
import { REGIONS } from "@/collections/Partners";
import { logApiHit } from "@/lib/api-usage";
import { partnerTrust } from "@/lib/confidence";
import { isExperimentOn } from "@/lib/experiments";
import { factConfidence } from "@/lib/fact-confidence";
import {
	BOOL_FALSE_VALUES,
	BOOL_TRUE_VALUES,
	clampLimit,
	parseFields,
	pickFields,
	strictBoolParam,
	triStateBoolParam,
	unknownParamWarning,
} from "@/lib/http-params";
import { laneHints } from "@/lib/lane-hints";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { scorePartners } from "@/lib/partner-match";
import { passesQualityBar } from "@/lib/partner-quality";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300;

const PARTNER_TYPES = [
	"anchor",
	"on-off-ramp",
	"infrastructure",
	"tooling",
	"protocol",
	"wallet",
	"audit-firm",
	"legal",
	"agency",
	"asset-issuer",
	"other",
];

// Mirrors Partners.rampTypes select options.
const RAMP_TYPES = ["on-ramp", "off-ramp"];
const REGION_VALUES: string[] = REGIONS.map((r) => r.value);
/** "North America" / "north america" / "NORTH-AMERICA" / "latam" → "north-america" / "latam". */
function normalizeRegion(raw: string): string | null {
	const key = raw
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-");
	if (REGION_VALUES.includes(key)) return key;
	const byLabel = REGIONS.find(
		(r) => r.label.toLowerCase() === raw.trim().toLowerCase(),
	);
	return byLabel ? byLabel.value : null;
}

/**
 * Map a Payload partner doc → the public shape. Drops auth/internal fields,
 * flattens the verified group, and derives a freshness object consumers
 * can act on without knowing our day thresholds.
 */
// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape varies; we read a known subset
function toPublic(
	p: any,
	opts: { compliance?: boolean; onchain?: boolean } = {},
) {
	const verified = p.verified ?? {};
	const freshnessStatus = p.freshnessStatus ?? "fresh";
	// EXPERIMENT partner-compliance-api (default OFF): expose curator-verified
	// compliance/corridor facts to agents. Gated so it's not in the stable
	// contract until it graduates. Only present when the experiment is on AND
	// the partner actually has compliance data.
	// biome-ignore lint/suspicious/noExplicitAny: gated experimental fields
	const gated: any = {};
	if (opts.compliance && p.compliance) {
		const c = p.compliance;
		gated.compliance = {
			licenses: (c.licenses ?? []).map(
				(l: { authority?: string; jurisdiction?: string; type?: string }) => ({
					authority: l.authority ?? null,
					jurisdiction: l.jurisdiction ?? null,
					type: l.type ?? null,
				}),
			),
			kycRequired: c.kycRequired ?? null,
			travelRule: c.travelRule ?? null,
			currencies: c.currencies ?? null,
			settlementTime: c.settlementTime ?? null,
			notableCustomers: c.notableCustomers ?? null,
		};
	}
	// EXPERIMENT partner-onchain-live (default OFF): expose the domain-matched
	// on-chain reality of each anchor's OWN issued assets (git-free trust
	// signal). Same gating discipline as compliance — not in the stable contract
	// until it graduates. Only present when opted in AND the partner has data.
	if (opts.onchain && Array.isArray(p.onchain) && p.onchain.length > 0) {
		gated.onchain = p.onchain.map(
			(a: {
				code?: string;
				issuer?: string;
				holders?: number;
				payments?: number;
				rating?: number;
				asOf?: string;
			}) => ({
				code: a.code ?? null,
				issuer: a.issuer ?? null,
				holders: a.holders ?? null,
				payments: a.payments ?? null,
				rating: a.rating ?? null,
				asOf: a.asOf ?? null,
			}),
		);
	}
	return {
		...gated,
		slug: p.slug,
		name: p.name,
		partnerType: p.partnerType,
		// Pilot cohort — the select partners featured first in the directory.
		pilot: Boolean(p.pilot),
		tagline: p.tagline ?? null,
		description: p.description ?? null,
		logoUrl: p.logoUrl ?? null,
		websiteUrl: p.websiteUrl ?? null,
		foundedYear: p.foundedYear ?? null,
		services: (p.services ?? [])
			.map((s: { tag: string }) => s.tag)
			.filter(Boolean),
		sectors: p.sectors ?? [],
		regions: p.regions ?? [],
		// Anchor capabilities from stellar.toml (SEP-1) — same source as
		// anchors.stellar.org.
		//
		// These are NULL when we never fetched the partner's toml, and only []
		// when we did fetch it and it published none. The distinction is the
		// whole value of the field: [] is now the checkable claim "we read
		// their SEP-1 file and it lists no SEPs", while null is "we have not
		// looked". Collapsing both to [] told 31 of 44 partners' callers that
		// the partner supports no SEPs and issues no assets, which for an
		// anchor directory is the most damaging thing the row could say.
		assets: p.tomlFetchedAt
			? (p.assets ?? []).map((a: { code: string }) => a.code).filter(Boolean)
			: null,
		seps: p.tomlFetchedAt ? (p.seps ?? []) : null,
		tomlSourceUrl: p.tomlSourceUrl ?? null,
		tomlFetchedAt: p.tomlFetchedAt ?? null,
		tomlConfidence: factConfidence(
			p.tomlFetchedAt ? "stellar-toml" : null,
			p.tomlFetchedAt,
		),
		// Curator-maintained, so empty means nobody has filled it in — not that
		// the partner offers no ramp directions.
		rampTypes: p.rampTypes?.length ? p.rampTypes : null,
		country: p.country ?? null,
		acceptingClients: p.acceptingClients ?? null,
		typicalEngagement: p.typicalEngagement ?? null,
		leadTime: p.leadTime ?? null,
		pricingModel: p.pricingModel ?? null,
		pricingNotes: p.pricingNotes ?? null,
		docsUrl: p.docsUrl ?? null,
		githubOrg: p.githubOrg ?? null,
		contactEmail: p.contactEmail ?? null,
		contactChannel: p.contactChannel ?? null,
		responseSla: p.responseSla ?? null,
		// Empty on all 44 partners, i.e. never curated for anyone — so []
		// asserted "this partner has no case studies" across the whole
		// directory. Null until someone actually records one.
		caseStudies: p.caseStudies?.length
			? p.caseStudies.map(
					(c: { title: string; url?: string; projectSlug?: string }) => ({
						title: c.title,
						url: c.url ?? null,
						projectSlug: c.projectSlug ?? null,
					}),
				)
			: null,
		// System-verified signals — what an agent trusts over self-claims.
		verified: {
			githubLastCommitAt: verified.githubLastCommitAt ?? null,
			githubCommits90d: verified.githubCommits90d ?? null,
			onchainActive: verified.onchainActive ?? null,
			onchainNote: verified.onchainNote ?? null,
			scfInvolvement: verified.scfInvolvement ?? null,
			lastAutoVerifyAt: verified.lastAutoVerifyAt ?? null,
		},
		// Freshness — consumers should down-rank or skip non-current partners.
		freshness: {
			status: freshnessStatus,
			lastPartnerUpdateAt: p.lastPartnerUpdateAt ?? null,
			isCurrent: freshnessStatus === "fresh",
			// archived = partner went dark >1y; usable for display, never for AI matches
			excludeFromMatching: freshnessStatus === "archived",
		},
		// Single profile-trust score (0–1 + label) blending freshness with how
		// much of the profile is system-verified (on-chain, recent commits,
		// SCF) — so a consumer gets one number instead of interpreting five
		// fields. Same trust vocabulary as /api/research confidence.
		trust: partnerTrust({
			freshnessStatus,
			verified: {
				onchainActive: verified.onchainActive ?? null,
				githubCommits90d: verified.githubCommits90d ?? null,
				scfInvolvement: verified.scfInvolvement ?? null,
			},
		}),
		url: `https://stellarlight.xyz/partners/${p.slug}`,
	};
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	// Say when a param was dropped (the projects/search treatment, 2026-07-11
	// audit): a filter we never read returns an unfiltered list the caller
	// reads as filtered. Warned, not 400'd — the contract is additive-only.
	const paramWarning = unknownParamWarning(
		sp,
		[
			"q",
			"sector",
			"ramps",
			"region",
			"type",
			"accepting",
			"all",
			"limit",
			"offset",
			"fields",
		],
		{
			advertise: [
				"q",
				"sector",
				"ramps",
				"region",
				"type",
				"accepting",
				"all",
				"limit",
				"offset",
				"fields",
			],
			hint: "Partner rows are matched from q over name/description/offerings — put a capability or corridor term in q if no dedicated filter covers it.",
		},
	);
	const type = sp.get("type");
	const sector = sp.get("sector");
	const region = sp.get("region");
	const ramps = sp.get("ramps");
	// Strict boolean parse (sls-040 residual #521, Engine E invalid-accepted):
	// `?accepting=__bogus__` / `?all=__bogus__` used to coerce silently to
	// false — an unfiltered 200 the caller read as "filter applied". Garbage
	// values now 400 with the accepted forms, matching the type/ramps pattern.
	// Tri-state: absent (and `?accepting=` with no value) means NO filter —
	// distinct from an explicit 0/false (the shared helper carries the full
	// rationale and its unit tests).
	const acceptingParsed = triStateBoolParam(sp.get("accepting"));
	const allParsed = strictBoolParam(sp.get("all"));
	for (const [name, parsed] of [
		["accepting", acceptingParsed],
		["all", allParsed],
	] as const) {
		if (parsed === "invalid") {
			return NextResponse.json(
				{
					error: `Invalid ${name} value '${sp.get(name)}' — it is a boolean flag.`,
					acceptedValues: {
						true: BOOL_TRUE_VALUES,
						false: BOOL_FALSE_VALUES,
					},
				},
				{ status: 400 },
			);
		}
	}
	const all = allParsed === true;
	const q = sp.get("q")?.toLowerCase().trim();
	const limit = clampLimit(sp.get("limit"), 50, 100);
	const fieldsWanted = parseFields(sp.get("fields"));
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	if (type && !PARTNER_TYPES.includes(type)) {
		return NextResponse.json(
			{ error: `Unknown type '${type}'`, validTypes: PARTNER_TYPES },
			{ status: 400 },
		);
	}

	// Fiat-ramp capability filter (Partners.rampTypes). Comma-separated values
	// require ALL listed ramps; unknown values 400 rather than the silently-
	// ignored-param trap this filter was born from (stellar-scout#7).
	const rampList = ramps
		? ramps
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		: [];
	const badRamp = rampList.find((r) => !RAMP_TYPES.includes(r));
	if (badRamp) {
		return NextResponse.json(
			{ error: `Unknown ramp '${badRamp}'`, validRamps: RAMP_TYPES },
			{ status: 400 },
		);
	}
	// Region is a hasMany select with a closed vocabulary (continents/blocs).
	// Payload `contains` on a hasMany is a substring test, so an unknown value
	// used to return an unfiltered-looking 0 with an advisory that read as
	// "no partners here": region=Nigeria served counts 0/0 with no warning on
	// 2026-09-05 while q=nigeria found an anchor. A country is not a region —
	// it lives in coverage.countries and is matched from q. Unknown values 400
	// with the vocabulary, the ramps pattern.
	// Labels ("North America"), case ("Africa") and the label/value hybrids a
	// consumer might carry from another surface normalise to the stored value
	// before the vocabulary check — the 400 is for values outside the
	// vocabulary, never for spelling the right one differently (Grok audit,
	// 2026-09-05).
	const regionNorm = region ? normalizeRegion(region) : null;
	if (region && (!regionNorm || !REGION_VALUES.includes(regionNorm))) {
		return NextResponse.json(
			{
				error: `Unknown region '${region}'`,
				validRegions: REGION_VALUES,
				hint: "Regions are continents/blocs. For a country or currency put it in q (e.g. ?q=nigeria or ?ramps=off-ramp&q=mexico) — coverage.countries is matched from the query text.",
			},
			{ status: 400 },
		);
	}

	let partners: ReturnType<typeof toPublic>[] = [];
	let totalMatching = 0;
	let filteredOutCount = 0;
	/** null = no query; 0 = nothing matched and rows are filler. */
	let bestPartnerScore: number | null = null;

	const payload = await getPayloadSafe();
	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
			const where: any = { status: { equals: "published" } };
			if (type) where.partnerType = { equals: type };
			if (sector) where.sectors = { contains: sector };
			if (regionNorm) where.regions = { contains: regionNorm };
			if (rampList.length)
				where.and = rampList.map((r) => ({ rampTypes: { contains: r } }));
			// engine-e ambiguous-contract (open since 07-22): with every published
			// partner currently accepting clients, accepting=1 returned pages
			// byte-identical to the bare call — live filter, single-value enum,
			// undecidable from outside. accepting=0 now selects the complement
			// (only NOT-accepting partners; today the honest empty set), so the
			// two values return different pages and the parameter proves itself.
			if (acceptingParsed === true) where.acceptingClients = { equals: true };
			else if (acceptingParsed === false)
				where.acceptingClients = { equals: false };

			const result = await payload.find({
				collection: "partner-accounts",
				where,
				limit: 200,
				depth: 0,
			});

			// Directory quality gate (default ON; ?all=1 bypasses): only complete,
			// non-archived profiles show by default — 28/47 seeds are placeholder
			// rows without a tagline. In-memory on ≤200 docs; display-only (the
			// concierge matcher keeps its own eligibility rule).
			const eligible = all ? result.docs : result.docs.filter(passesQualityBar);
			// Emir-class fix (lessons class 23, 2026-07-09): rows hidden by the
			// quality bar must be DISCLOSED — counts.total=0 with no filteredOut
			// read as "no wallet partners exist" while 5 sat behind null taglines.
			filteredOutCount = result.docs.length - eligible.length;
			const bySlug = new Map(eligible.map((d) => [String(d.slug), d]));

			// Ranking:
			//  - with q: relevance via the SHARED scorer (scorePartners) — the same
			//    engine the concierge matchmaker uses: partial/OR match weighted by
			//    the structured capability fields (assets, ramps, SEPs, country…)
			//    and region-gated. Replaces the old strict all-token-AND text filter
			//    that returned 1 partner for "USDC off-ramp" when 8 actually fit —
			//    and perversely returned FEWER results the more keywords you added.
			//  - without q: pilot cohort first, then freshness.
			const freshRank = { fresh: 0, aging: 1, stale: 2, archived: 3 } as Record<
				string,
				number
			>;
			// Honest-absence (guard B): scorePartners deliberately falls back to
			// "a few accepting/fresh partners" (score 0) when a query yields no
			// usable signal. That is a reasonable ranking choice and a terrible
			// ANSWER if we do not say so — measured through Raven, the nonsense
			// query "zzqqxx nonexistent protocol 9999" came back with 5 partners
			// and nothing marking them as filler. Capture the best score so the
			// response can tell the caller which it got.
			const scored = q ? scorePartners(q, eligible, eligible.length) : null;
			bestPartnerScore = scored?.length
				? Math.max(...scored.map((s) => s.score ?? 0))
				: null;
			const ordered = q
				? (scored
						?.map((s) => bySlug.get(s.partner.slug))
						.filter(Boolean) as typeof eligible)
				: [...eligible].sort(
						(a, b) =>
							Number(Boolean(b.pilot)) - Number(Boolean(a.pilot)) ||
							(freshRank[String(a.freshnessStatus ?? "fresh")] ?? 9) -
								(freshRank[String(b.freshnessStatus ?? "fresh")] ?? 9),
					);

			// EXPERIMENTS (default off): include the gated blocks only when opted
			// in via ?exp=<id> / X-Experiments header / env canary.
			const withCompliance = isExperimentOn("partner-compliance-api", req);
			const withOnchain = isExperimentOn("partner-onchain-live", req);
			const mapped = ordered.map((p) =>
				toPublic(p, { compliance: withCompliance, onchain: withOnchain }),
			);

			totalMatching = mapped.length;
			partners = mapped.slice(offset, offset + limit);
		} catch {
			// fall through with empty
		}
	}

	logApiHit({
		req,
		endpoint: "/api/partners",
		query: q,
		filters: {
			type,
			sector,
			region,
			ramps,
			accepting: typeof acceptingParsed === "boolean" ? acceptingParsed : null,
			all,
			limit,
			offset,
		},
		resultCount: partners.length,
	});

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/partners",
				generatedAt: new Date().toISOString(),
				...(paramWarning ? { warnings: [paramWarning] } : {}),
				filters: {
					type,
					sector,
					region,
					ramps: ramps ?? null,
					// null = not sent, matching the sibling filters — a bare `false`
					// here couldn't distinguish "omitted" from "explicit =0".
					accepting:
						typeof acceptingParsed === "boolean" ? acceptingParsed : null,
					all,
					q: q ?? null,
					limit,
					offset,
				},
				...(laneHints("partners", { empty: partners.length === 0 })
					? { hints: laneHints("partners", { empty: partners.length === 0 }) }
					: {}),
				// Honest-absence (guard B): with a query, say whether these rows
				// actually matched it. scorePartners falls back to filler when a
				// query yields no signal, and unlabelled filler is read as an
				// answer — the same defect searchProjects fixed with matchMode.
				...(q && partners.length > 0
					? bestPartnerScore === 0
						? {
								matchMode: "weak" as const,
								matchModeLabel:
									"no partner matched your query — these are fresh/accepting partners shown as a fallback, NOT matches (an empty result would have been the honest answer if none of them fit)",
							}
						: {
								matchMode: "scored" as const,
								matchModeLabel:
									"ranked by the shared partner scorer over structured capability fields",
							}
					: {}),
				counts: {
					returned: partners.length,
					total: totalMatching,
					// Rows hidden by the default directory quality bar (pass all=1
					// to include them). >0 with total=0 means "exists but thin
					// profile", NOT "none exist".
					filteredOut: filteredOutCount,
				},
				// A zero-result partners page had NOTHING on it — no advisory, no
				// route, not even a note that this directory is Stellar-scoped. The
				// demand log shows real queries landing here ("tell me about
				// solana"), and a bare empty answers a question about OUR coverage
				// as though it were a question about the ecosystem. Say which
				// directory this is, and name the index that would hold the answer.
				...(partners.length === 0 && totalMatching === 0
					? {
							advisory: {
								// Deliberately NO claim about `filteredOut`. The first version
								// of this advisory said "N rows were held back by the quality
								// bar — pass all=1 to include them", and that is false: for
								// q=custody the counter reads 3, but `&all=1` returns zero
								// matches and filteredOut=0. The counter is not "rows this
								// query would gain by dropping the bar", so the advice sent
								// the caller somewhere empty. Shipping it was the same
								// mistake this advisory exists to prevent — an unverified
								// claim stated confidently. Verify what a field MEANS before
								// telling anyone to act on it.
								summary: `No partner matches${q ? ` "${q}"` : " these filters"}. /api/partners lists STELLAR integration partners (anchors, on/off-ramps, custody, infrastructure) — it is scoped to this ecosystem, so a query about another chain or a general topic returns nothing here by design, which is a scope boundary and not a finding about the partner landscape.`,
								scope:
									"Stellar integration partners (anchors, ramps, custody, infrastructure); not a multi-chain directory and not a project directory",
								tryInstead: [
									{
										endpoint: `/api/projects/search?q=${encodeURIComponent(q ?? "")}`,
										why: "if the subject is a product or protocol rather than a commercial partner — the project directory is much broader",
									},
									{
										endpoint: `/api/research?q=${encodeURIComponent(q ?? "")}`,
										why: "if the question is conceptual or comparative (including about other chains) — the research corpus indexes SEPs, docs and posts that discuss them",
									},
								],
							},
						}
					: {}),
				validTypes: PARTNER_TYPES,
				validRamps: RAMP_TYPES,
				note: "Published partners only. Default results pass a directory quality bar (tagline + contact path, non-archived); pass all=1 for the unfiltered set. With `q`, results are relevance-ranked by fit — weighted across the structured capability fields (assets, ramps, SEPs, country, services) and region, not exact-keyword text — so a natural query like 'USDC off-ramp' surfaces anchors by capability; without `q`, pilot partners sort first, then freshness. `verified` fields are system-computed; `freshness.excludeFromMatching` flags partners too stale for AI matching.",
			},
			partners: partners.map((r) => pickFields(r, fieldsWanted)),
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
