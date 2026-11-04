import { partnerTrust } from "@/lib/confidence";
import { factConfidence } from "@/lib/fact-confidence";

/**
 * Map a Payload partner doc → the public shape. Drops auth/internal fields,
 * flattens the verified group, and derives a freshness object consumers
 * can act on without knowing our day thresholds.
 *
 * The ONE row for GET /api/partners and GET /api/partners/{slug}, declared
 * once as the Partner schema. The detail route kept its own copy, and the
 * copy drifted twice: rampTypes [] in 2026-09, then seps, assets and
 * caseStudies [] for partners whose stellar.toml was never fetched (#1909).
 */
export function partnerToPublic(
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape varies; we read a known subset
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
	// signal). Same gating discipline as compliance: not in the stable contract
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
		// Pilot cohort: the select partners featured first in the directory.
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
		// Anchor capabilities from stellar.toml (SEP-1), the same source as
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
		// Curator-maintained, so empty means nobody has filled it in, not that
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
		// Empty on all 44 partners, i.e. never curated for anyone, so []
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
		// System-verified signals: what an agent trusts over self-claims.
		verified: {
			githubLastCommitAt: verified.githubLastCommitAt ?? null,
			githubCommits90d: verified.githubCommits90d ?? null,
			onchainActive: verified.onchainActive ?? null,
			onchainNote: verified.onchainNote ?? null,
			scfInvolvement: verified.scfInvolvement ?? null,
			lastAutoVerifyAt: verified.lastAutoVerifyAt ?? null,
		},
		// Freshness: consumers should down-rank or skip non-current partners.
		freshness: {
			status: freshnessStatus,
			lastPartnerUpdateAt: p.lastPartnerUpdateAt ?? null,
			isCurrent: freshnessStatus === "fresh",
			// archived = partner went dark >1y; usable for display, never for AI matches
			excludeFromMatching: freshnessStatus === "archived",
		},
		// Single profile-trust score (0 to 1, plus a label) blending freshness with how
		// much of the profile is system-verified (on-chain, recent commits,
		// SCF), so a consumer gets one number instead of interpreting five
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
