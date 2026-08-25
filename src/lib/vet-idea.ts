/**
 * Vet-idea — the "I want to build X on Stellar" composite.
 *
 * One call joining what a builder previously assembled by hand: competitors
 * (repos + directory projects), their maturity from verified evidence
 * (audits, live on-chain usage), hackathon prior art FROM OUR OWN CORPUS
 * (judged-hackathon repos matching the idea — their dead/alive state is
 * itself the signal), the vertical's supply-side gap verdict, and SCF
 * funding presence. Everything evidence-grounded; no verdict synthesis —
 * the consumer weighs crowded-vs-absent against their own thesis.
 *
 * Vertical detection is a closed deterministic token map onto
 * GAP_VERTICALS (real `types` enum values only). A query outside the map
 * (e.g. "oracle" — typed by convention as Infrastructure, measured on other
 * axes) gets vertical=null and an honest note; competitors still work.
 */

import type { Payload } from "payload";
import {
	computeEcosystemGaps,
	GAP_VERTICALS,
	type TypeCoverage,
} from "./ecosystem-gaps";
import { ACTIVE_PROJECT_STATUSES } from "./population";
import { buildHaystack, scoreTokens, tokenize } from "./project-search-match";
import { activityStateOf } from "./repo-grade";
import { contentTokens, searchRepos } from "./repo-search";

/** Query token → GAP_VERTICALS value. Closed map; every value MUST be a
 * member of GAP_VERTICALS (pinned by test). */
export const VERTICAL_TOKENS: Record<string, string> = {
	wallet: "Wallet",
	wallets: "Wallet",
	dex: "DEX",
	amm: "DEX",
	swap: "DEX",
	exchange: "DEX",
	lending: "Lending",
	lend: "Lending",
	borrow: "Lending",
	loan: "Lending",
	bridge: "Bridge",
	payments: "Payments",
	payment: "Payments",
	remittance: "Payments",
	checkout: "Payments",
	anchor: "Anchor",
	ramp: "Anchor",
	onramp: "Anchor",
	offramp: "Anchor",
	"on-ramp": "Anchor",
	"off-ramp": "Anchor",
	indexer: "Indexer",
	indexing: "Indexer",
	explorer: "Explorer",
	ai: "AI",
	agent: "AI",
	agents: "AI",
	gaming: "Gaming",
	game: "Gaming",
	games: "Gaming",
	education: "Education",
	security: "Security",
	nft: "NFT",
	nfts: "NFT",
	collectible: "NFT",
	rwa: "RWA",
	tokenization: "RWA",
	tokenized: "RWA",
	erc3643: "RWA",
	"erc-3643": "RWA",
	stablecoin: "Stablecoin",
	stablecoins: "Stablecoin",
	rpc: "RPC",
	faucet: "Faucet",
} as const;

export interface VetIdeaReport {
	idea: string;
	/** Detected GAP_VERTICALS value, or null when the idea doesn't map onto
	 * the measurable vertical axis (absence of a mapping, not of a market). */
	vertical: string | null;
	competitors: {
		repos: Array<{
			fullName: string;
			tier: string | null;
			activityState: string;
			stars: number | null;
			codeDomains: string[];
		}>;
		projects: Array<{
			slug: string;
			name: string | null;
			status: string | null;
			types: string[];
		}>;
	};
	maturity: {
		auditedProjects: number;
		liveOnMainnetRepos: number;
		basis: string;
	};
	priorArt: {
		repos: Array<{
			fullName: string;
			hackathonWinner: boolean;
			activityState: string;
			lastCommitAt: string | null;
		}>;
		note: string;
	};
	gap: (TypeCoverage & { basis: string }) | null;
	funding: { scfAwardedProjects: number; basis: string } | null;
}

export async function buildVetIdea(
	payload: Payload,
	q: string,
): Promise<VetIdeaReport> {
	const tokens = contentTokens(q);
	const vertical =
		tokens.map((t) => VERTICAL_TOKENS[t]).find((v) => v !== undefined) ?? null;

	// Competitor repos via the full search stack (identity, vocabulary,
	// canonical injection all apply).
	const repoRes = await searchRepos(payload, q, { limit: 6 });
	const competitorRepos = repoRes.repos.map((r) => ({
		fullName: r.fullName,
		// biome-ignore lint/suspicious/noExplicitAny: serve-row extras
		tier: ((r as any).tier ?? null) as string | null,
		activityState: activityStateOf(r.lastCommitAt ?? null, !!r.isArchived),
		stars: r.stars ?? null,
		// biome-ignore lint/suspicious/noExplicitAny: serve-row extras
		codeDomains: ((r as any).codeDomains ?? []) as string[],
	}));

	// Directory projects: active, in the detected vertical (types membership —
	// `in` + JS post-filter, never `contains` on hasMany). Falls back to a
	// name/description token pass when no vertical mapped.
	// sls-073: the no-vertical fallback used to page an ARBITRARY 400 active
	// rows and filter them with a raw `includes` on `description`. The
	// directory, for the same query, ranks every active row with the shared
	// matcher over `shortDescription` + structured fields. So vet-idea returned
	// [] for ideas the directory answered (live: "perpetuals / derivatives
	// trading protocol on Stellar" → 0 here, 25 there). Fetch the whole active
	// set and use the SAME matcher, so the two surfaces cannot disagree.
	const pres = await payload.find({
		collection: "projects",
		where: {
			and: [
				{ status: { in: [...ACTIVE_PROJECT_STATUSES] } },
				...(vertical ? [{ types: { in: [vertical] } }] : []),
			],
		},
		limit: 0, // 0 = no cap: a truncated window silently loses real matches
		depth: 0,
		select: {
			slug: true,
			name: true,
			status: true,
			types: true,
			description: true,
			// buildHaystack reads these — omitting them made the shared matcher
			// score against a haystack that was mostly empty.
			shortDescription: true,
			category: true,
			supportedNetworks: true,
			coverage: true,
			publicGoods: true,
			scfAwarded: true,
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	let projDocs = pres.docs as any[];
	if (vertical) {
		projDocs = projDocs.filter(
			(p) => Array.isArray(p.types) && p.types.includes(vertical),
		);
	} else {
		// No vertical mapped: rank with the directory's own matcher (synonym
		// expansion, negation guards, structured fields) instead of a naive
		// substring pass, and keep only rows that actually score.
		const qTokens = tokenize(q);
		if (qTokens.length) {
			projDocs = projDocs
				.map((p) => {
					// Stash relevance on the doc so the display sort below can put
					// it FIRST — see the sort comment.
					p.__rel = scoreTokens(buildHaystack(p), qTokens);
					return p;
				})
				.filter((p) => (p.__rel ?? 0) > 0)
				.sort((a, b) => (b.__rel ?? 0) - (a.__rel ?? 0));
		}
	}
	// Maturity from verified evidence: audits joined over the FULL matched
	// project set (an arbitrary 8-slice hid blend and reported audited: 0 —
	// found live 2026-08-15), live usage over the competitor repos.
	const auditedSlugs = new Set<string>();
	const allSlugs = projDocs.map((p) => String(p.slug)).filter(Boolean);
	if (allSlugs.length) {
		const ares = await payload.find({
			collection: "audits",
			where: { projectSlug: { in: allSlugs } },
			limit: 500,
			depth: 0,
			select: { projectSlug: true },
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		for (const a of ares.docs as any[]) auditedSlugs.add(String(a.projectSlug));
	}
	const auditedProjects = auditedSlugs.size;
	// RELEVANCE leads, then audited, then alphabetical.
	//
	// Audited-first alone produced a confidently wrong answer: asked for
	// competitors to a perpetuals protocol it returned audited projects that
	// are not perps (soroswap, equitx…) while the two real perps venues —
	// which score higher on the shared matcher but carry no audit — fell
	// outside the 8-row slice. "Who already does this?" is a relevance
	// question; an audit is a quality signal about a competitor, not a reason
	// to call something a competitor. Audit still breaks ties, so among
	// equally-relevant rows the audited one leads.
	projDocs.sort((a, b) => {
		const ar = (a.__rel ?? 0) as number;
		const br = (b.__rel ?? 0) as number;
		const aa = auditedSlugs.has(String(a.slug)) ? 0 : 1;
		const bb = auditedSlugs.has(String(b.slug)) ? 0 : 1;
		return (
			br - ar ||
			aa - bb ||
			String(a.name ?? a.slug).localeCompare(String(b.name ?? b.slug))
		);
	});
	const competitorProjects = projDocs.slice(0, 8).map((p) => ({
		slug: String(p.slug),
		name: p.name ? String(p.name) : null,
		status: p.status ? String(p.status) : null,
		types: Array.isArray(p.types) ? p.types.map(String) : [],
	}));
	let liveOnMainnetRepos = 0;
	if (competitorRepos.length) {
		const rres = await payload.find({
			collection: "repos",
			where: {
				and: [
					{ fullName: { in: competitorRepos.map((r) => r.fullName) } },
					{ "codeInUse.contracts": { greater_than: 0 } },
				],
			},
			limit: 20,
			depth: 0,
			select: { fullName: true },
		});
		liveOnMainnetRepos = rres.totalDocs;
	}

	// Prior art from OUR corpus: judged-hackathon repos matching the idea.
	// Dead prior art is a signal, not noise — surface state honestly.
	const hres = await payload.find({
		collection: "repos",
		where: {
			and: [
				// judgedHackathon is TEXT (the hackathon the judge score came
				// from) — 365 populated rows; `equals: true` matched zero (found
				// live 2026-08-15, the wrong-predicate false-negative class).
				{ judgedHackathon: { exists: true } },
				...(tokens.length
					? [
							{
								// biome-ignore lint/suspicious/noExplicitAny: Payload Where union is awkward
								or: tokens.flatMap((t) => [
									{ fullName: { like: t } },
									{ description: { like: t } },
								]) as any[],
							},
						]
					: []),
			],
		},
		limit: 5,
		depth: 0,
		sort: "-lastCommitAt",
		select: {
			fullName: true,
			hackathonWinner: true,
			lastCommitAt: true,
			isArchived: true,
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const priorArtRepos = (hres.docs as any[]).map((h) => ({
		fullName: String(h.fullName),
		hackathonWinner: !!h.hackathonWinner,
		activityState: activityStateOf(h.lastCommitAt ?? null, !!h.isArchived),
		lastCommitAt: h.lastCommitAt ? String(h.lastCommitAt) : null,
	}));

	// Gap verdict for the vertical (supply-side only — same computation and
	// caveats as analyze?dimension=gaps).
	let gap: VetIdeaReport["gap"] = null;
	let funding: VetIdeaReport["funding"] = null;
	if (vertical) {
		const allActive = await payload.find({
			collection: "projects",
			where: { status: { in: [...ACTIVE_PROJECT_STATUSES] } },
			limit: 5000,
			depth: 0,
			select: {
				slug: true,
				name: true,
				types: true,
				status: true,
				scfAwarded: true,
				scf: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		const activeDocs = allActive.docs as any[];
		const gaps = computeEcosystemGaps(activeDocs, GAP_VERTICALS);
		const row = gaps.byType.find((c) => c.type === vertical) ?? null;
		if (row)
			gap = {
				...row,
				basis:
					"Supply-side coverage of ACTIVE directory projects — a gap is not demand, and crowded is not saturation.",
			};
		const scfAwardedProjects = activeDocs.filter(
			(p) =>
				Array.isArray(p.types) &&
				p.types.includes(vertical) &&
				// scf.awarded is the structured truth; legacy scfAwarded checkbox
				// is null on awarded projects like blend (found live 2026-08-16).
				(p.scf?.awarded ?? p.scfAwarded),
		).length;
		funding = {
			scfAwardedProjects,
			basis:
				"Count of ACTIVE directory projects in this vertical with SCF awards on record.",
		};
	}

	return {
		idea: q,
		vertical,
		competitors: { repos: competitorRepos, projects: competitorProjects },
		maturity: {
			auditedProjects,
			liveOnMainnetRepos,
			basis:
				"auditedProjects = ALL matched projects (vertical-wide, not just the displayed slice) with ≥1 report in the audits registry (absence ≠ unaudited); liveOnMainnetRepos = displayed competitor repos with verified on-chain usage.",
		},
		priorArt: {
			repos: priorArtRepos,
			note: "Judged-hackathon repos from our index matching the idea; dead prior art is itself a signal. Not exhaustive — DoraHacks builds without a surviving repo are on /api/hackathons/builds.",
		},
		gap,
		funding,
	};
}
