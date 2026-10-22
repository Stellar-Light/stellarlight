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
	GAP_PROJECT_SELECT,
	GAP_VERTICALS,
	type TypeCoverage,
} from "./ecosystem-gaps";
import { queryBuilds } from "./hackathon-build-query";
import {
	type BuildSearchMode,
	getHackathonBuildsIndex,
} from "./hackathon-builds";
import { ACTIVE_PROJECT_STATUSES } from "./population";
import { PRIOR_ART_TOP, priorArtTop, rankPriorArt } from "./prior-art-rank";
import {
	anchorTokens,
	buildHaystack,
	scoreTokens,
	tokenHits,
	tokenize,
} from "./project-search-match";
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
	loans: "Lending",
	microloan: "Lending",
	microloans: "Lending",
	microfinance: "Lending",
	bridge: "Bridge",
	payments: "Payments",
	payment: "Payments",
	remittance: "Payments",
	checkout: "Payments",
	payroll: "Payments",
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
	donation: "Social Impact",
	donations: "Social Impact",
	charity: "Social Impact",
	charities: "Social Impact",
	rpc: "RPC",
	faucet: "Faucet",
} as const;

/** Words that make an idea a stablecoin product rather than one paid in
 * stablecoins. Stems on purpose: matching too much keeps Stablecoin, which is
 * what the first-token rule already did; matching too little moves a
 * stablecoin product to another vertical, which is worse. */
const STABLECOIN_PRODUCT =
	/\b(?:issu\w*|mint\w*|back(?:ed|ing|ers?)|reserves?|redeem\w*|redemptions?|algorithmic)\b|collateral|peg/i;

/** The idea's vertical: its first mapped token, except that a stablecoin
 * used as the rail yields to the idea's other vertical. "stablecoin payroll"
 * is a payroll product; read as Stablecoin, it was weighed against stablecoin
 * issuers (payroll and subscription billing on 40 labeled ideas). An issuer,
 * mint, peg, backing, reserves or redemption keeps Stablecoin. */
export function verticalOf(q: string): string | null {
	const mapped = contentTokens(q).flatMap((t) =>
		VERTICAL_TOKENS[t] ? [VERTICAL_TOKENS[t]] : [],
	);
	if (mapped[0] === "Stablecoin" && !STABLECOIN_PRODUCT.test(q))
		return mapped.find((v) => v !== "Stablecoin") ?? "Stablecoin";
	return mapped[0] ?? null;
}

export interface VetIdeaReport {
	idea: string;
	/** Detected GAP_VERTICALS value, or null when the idea doesn't map onto
	 * the measurable vertical axis (absence of a mapping, not of a market). */
	vertical: string | null;
	competitors: {
		/** How relevance was established: vertical (typed membership) |
		 * scored (anchor token matched) | weak (generic words only — the rows
		 * are neighbours, not evidence a competitor exists). */
		matchMode?: "vertical" | "vertical+scored" | "scored" | "weak";
		matchModeLabel?: string;
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
			/** How this row qualified: typed membership, or its own terms. */
			via?: "vertical" | "scored";
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
		/** Stored hackathon submissions matching the idea, best first; null =
		 * the index could not be read (not checked), [] = checked, none. */
		builds: Array<{
			id: string;
			name: string;
			hackathon: string;
			placement: string | null;
			isWinner: boolean;
			githubUrl: string | null;
			matchedTerms: string[];
			/** Meaning similarity to the idea, when search by meaning ran. */
			similarity?: number;
		}> | null;
		/** The search that served builds: hybrid, or keyword when meaning could not run; null with builds. */
		buildsMode: BuildSearchMode | null;
		/** How many of the five nearest builds are not listed because they fell
		 * short of the evidence rule. builds [] with a count above 0 means
		 * submissions came close, not that none exist; null with builds. */
		buildsBelowEvidenceRule: number | null;
		note: string;
	};
	gap: (TypeCoverage & { basis: string }) | null;
	funding: { scfAwardedProjects: number; basis: string } | null;
}

/** Share of an idea's word weight a directory project must match to be
 * served as a competitor. Tuned on 20 blind-labeled ideas (2026-10-20):
 * unrelated rows served 78 to 32 of 160, direct competitors 38 to 38 (3
 * lost, 3 gained). On 20 held-out ideas: 70 to 44, and 32 to 32.
 * ponytail: one fixed share; re-tune it when the labels change. */
export const MIN_IDEA_COVERAGE = 0.375;

/**
 * Whether a row matches enough of the idea to be called a competitor. Each
 * idea word weighs by its rarity across the active directory (inverse
 * document frequency), so "fund", in hundreds of descriptions, weighs
 * little and "artists" a lot; a row must match MIN_IDEA_COVERAGE of the
 * weight of the idea's words that any row uses. Before this, one shared
 * word earned a slot and editorial prominence filled the rest. An idea
 * with fewer than two such words is not gated.
 * `hitsPerDoc`: the idea words each active project matched.
 */
export function coversEnoughOfIdea(
	tokens: string[],
	hitsPerDoc: string[][],
): (hits: string[]) => boolean {
	const df = new Map<string, number>();
	for (const hits of hitsPerDoc)
		for (const t of new Set(hits)) df.set(t, (df.get(t) ?? 0) + 1);
	const present = [...new Set(tokens)].filter((t) => (df.get(t) ?? 0) > 0);
	if (present.length < 2) return () => true;
	const weight = (t: string) =>
		Math.log((hitsPerDoc.length + 1) / ((df.get(t) ?? 0) + 0.5));
	const total = present.reduce((s, t) => s + weight(t), 0);
	return (hits) =>
		present
			.filter((t) => hits.includes(t))
			.reduce((s, t) => s + weight(t), 0) >=
		total * MIN_IDEA_COVERAGE;
}

export async function buildVetIdea(
	payload: Payload,
	q: string,
): Promise<VetIdeaReport> {
	const tokens = contentTokens(q);
	const vertical = verticalOf(q);

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

	// How competitor relevance was established — served on the block so a
	// caller can weigh it. "vertical" = typed membership; "scored" = an anchor
	// token matched; "weak" = only generic words matched (neighbours, NOT
	// evidence a competitor exists).
	let competitorMatch: "vertical" | "vertical+scored" | "scored" | "weak" =
		"weak";
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
		// The vertical is NOT applied as a filter here. It used to be, and that
		// made a whole class of idea unanswerable: "a dashboard that tracks
		// every stablecoin" detects vertical=Stablecoin, and the filter then
		// allowed ONLY projects typed Stablecoin — so it returned stablecoin
		// ISSUERS (Sava, PYUSD, Stablecorp) as competitors to a dashboard, and
		// could never surface the analytics products that actually compete,
		// including this directory's own stablecoin dashboard. Membership is
		// one route to relevance, not the boundary of it; the union is built
		// below and each row says which route it took.
		where: { and: [{ status: { in: [...ACTIVE_PROJECT_STATUSES] } }] },
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
			// Editorial rank (0-100, curated): 90 = the canonical pick for its
			// category. Needed as a TIE-BREAK — see the sort below.
			prominence: true,
			supportedNetworks: true,
			coverage: true,
			publicGoods: true,
			scfAwarded: true,
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	let projDocs = pres.docs as any[];
	// Score EVERY active row once, with the directory's own matcher, so the
	// two routes below are comparable and a row can qualify by either.
	const allTokens = tokenize(q);
	const allAnchors = anchorTokens(allTokens);
	if (allTokens.length)
		for (const p of projDocs) {
			const hay = buildHaystack(p);
			// Which idea words this row matched, read together as scoreTokens
			// reads them: coversEnoughOfIdea weighs them.
			p.__hits = tokenHits(hay, allTokens);
			p.__rel = p.__hits.length;
			p.__anchor = allAnchors.length ? scoreTokens(hay, allAnchors) : 0;
		}
	const enoughOfIdea = coversEnoughOfIdea(
		allTokens,
		projDocs.map((p) => p.__hits ?? []),
	);

	if (vertical) {
		const inVertical = (p: { types?: unknown }) =>
			Array.isArray(p.types) && p.types.includes(vertical);
		// Route A: typed membership of the detected vertical.
		// Route B: any active row that scores on a NON-GENERIC anchor token —
		// this is what lets a dashboard, an explorer or an analytics tool
		// compete with an idea whose noun happens to name a product type.
		projDocs = projDocs.filter((p) => inVertical(p) || (p.__anchor ?? 0) > 0);
		for (const p of projDocs) p.__via = inVertical(p) ? "vertical" : "scored";
		// Score the vertical path TOO. Membership decides who is eligible; it
		// does not decide who leads. Without this, __rel is undefined for every
		// row and the display sort falls through to ALPHABETICAL — which is why
		// "a non-custodial wallet for Stellar" answered airgap, akuna, albedo
		// instead of the wallets anyone means. Found by the cross-surface guard
		// after the same defect was fixed on the fallback path.
		competitorMatch = projDocs.some((p) => p.__via === "scored")
			? "vertical+scored"
			: "vertical";
	} else {
		// No vertical mapped: rank with the directory's own matcher (synonym
		// expansion, negation guards, structured fields) instead of a naive
		// substring pass, and keep only rows that actually score.
		const qTokens = tokenize(q);
		if (qTokens.length) {
			// Honesty marker (truth battery round 3, 2026-08-27): "quantum
			// teleportation of physical goods on Stellar" returned SDKs as
			// "competitors" — the fallback scores RAW tokens, so the word
			// "stellar" alone matches most of the directory, and nothing told
			// the caller these rows are neighbours rather than evidence a
			// competitor exists. Rows count as SCORED only when a non-generic
			// anchor token contributed; otherwise the block says "weak".
			const anchors = anchorTokens(qTokens);
			let anchorHits = 0;
			projDocs = projDocs
				.map((p) => {
					// Stash relevance on the doc so the display sort below can put
					// it FIRST — see the sort comment.
					const hay = buildHaystack(p);
					p.__rel = scoreTokens(hay, qTokens);
					if (anchors.length && scoreTokens(hay, anchors) > 0) anchorHits++;
					return p;
				})
				.filter((p) => (p.__rel ?? 0) > 0)
				.sort((a, b) => (b.__rel ?? 0) - (a.__rel ?? 0));
			competitorMatch = anchors.length && anchorHits > 0 ? "scored" : "weak";
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
		// Relevance, then EDITORIAL PROMINENCE, then audit, then name.
		//
		// Most rows in a mapped vertical score identically ("wallet" matches
		// every wallet), so before this the alphabet decided the answer and the
		// wallet question returned albedo, beans, bitget-wallet, coca, cypher.
		// prominence is exactly the curated signal for "the canonical pick for
		// its category" (Freighter 90), and it is what the directory leans on
		// to lead with the wallets people actually mean. The alphabet is a last
		// resort, not a ranking.
		const ap = Number(a.prominence ?? 0);
		const bp = Number(b.prominence ?? 0);
		return (
			br - ar ||
			bp - ap ||
			aa - bb ||
			String(a.name ?? a.slug).localeCompare(String(b.name ?? b.slug))
		);
	});
	// Only rows that match enough of the idea are served; fewer than 8 is an
	// honest answer. Always filled to 8, "fans fund artists" served Tipper
	// plus seven rows that share only "fund" (Friendbot funds testnet
	// accounts). The audit count above still covers every matched row.
	const competitorDocs = projDocs
		.filter((p) => enoughOfIdea(p.__hits ?? []))
		.slice(0, 8);
	// The label describes the rows served, so it is set after the cut, which
	// can drop every typed member, every scored row, or every row; an emptied
	// list read under a "vertical" label looked like a landscape.
	if (!competitorDocs.length) competitorMatch = "weak";
	else if (
		competitorMatch === "vertical" ||
		competitorMatch === "vertical+scored"
	) {
		const members = competitorDocs.some((p) => p.__via === "vertical");
		const scored = competitorDocs.some((p) => p.__via === "scored");
		competitorMatch =
			members && scored ? "vertical+scored" : members ? "vertical" : "scored";
	}
	const competitorProjects = competitorDocs.map((p) => ({
		slug: String(p.slug),
		name: p.name ? String(p.name) : null,
		status: p.status ? String(p.status) : null,
		types: Array.isArray(p.types) ? p.types.map(String) : [],
		// Which route put this row here — membership of the vertical, or its
		// own terms. A reader weighing "is this really a competitor" needs to
		// know which, and it is cheap to say.
		via: (p.__via as "vertical" | "scored" | undefined) ?? undefined,
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
	// Dead prior art is a signal, not noise: surface state honestly.
	const hres = await payload.find({
		collection: "repos",
		where: {
			// judgedHackathon is TEXT (the hackathon the judge score came from),
			// about 365 populated rows; `equals: true` matched zero (found live
			// 2026-08-15, the wrong-predicate false-negative class).
			judgedHackathon: { exists: true },
		},
		// The whole judged set, not a word-filtered slice: rankPriorArt weighs
		// each word by its rarity across it, and sorting a one-word match by
		// recency let the latest pushed repos answer every idea.
		limit: 1000,
		depth: 0,
		sort: "-lastCommitAt",
		select: {
			fullName: true,
			description: true,
			hackathonWinner: true,
			lastCommitAt: true,
			isArchived: true,
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const priorArtRepos = rankPriorArt(tokens, hres.docs as any[]).map((h) => ({
		fullName: String(h.fullName),
		hackathonWinner: !!h.hackathonWinner,
		activityState: activityStateOf(h.lastCommitAt ?? null, !!h.isArchived),
		lastCommitAt: h.lastCommitAt ? String(h.lastCommitAt) : null,
	}));

	// Prior art from every stored hackathon submission, on DoraHacks and off
	// it, by hybrid search (words plus meaning). Most submissions' repos are
	// not in the repo index, so the judged repos above are a small slice.
	// Hybrid, not keyword: on the 40-idea labeled set (2026-10-20, top 5 per
	// idea) keyword filled 40% of slots with builds that are not the idea and
	// found 36 of 118 same-idea builds; hybrid 22% and 56. When meaning cannot
	// run, queryBuilds serves keyword and says so.
	// An unreadable or empty index (it holds over a thousand) is "not
	// checked": builds is then null, never [], which would say nobody built
	// it (outside review, 2026-10-20).
	const index = await getHackathonBuildsIndex().catch(() => null);
	const buildSearch = index?.length
		? await queryBuilds(
				index,
				{
					q: q.toLowerCase().trim(),
					mode: "hybrid",
					winnersOnly: false,
					hackathons: [],
				},
				{ perSubmission: true },
			).catch(() => null)
		: null;
	// The window priorArtTop reads. Its builds that fall short of the evidence
	// rule are counted, so an empty list cannot pass for "nobody built this"
	// when submissions came close (live probe, 2026-10-22).
	const nearest = buildSearch?.scored.slice(0, PRIOR_ART_TOP) ?? null;
	const evidence = nearest ? priorArtTop(nearest) : null;
	const buildsBelowEvidenceRule =
		nearest && evidence ? nearest.length - evidence.length : null;
	const n = buildsBelowEvidenceRule ?? 0;
	const nearMisses =
		evidence?.length === 0 && n > 0
			? `builds is empty because ${n === 1 ? "the nearest submission" : `the ${n} nearest submissions`} did not meet the evidence rule: too few of the idea's words matched, and no meaning score reached 0.7. That is not a finding that nobody built this; searchHackathonBuilds with the same q lists them with the words each matched.`
			: null;
	const priorArtBuilds = evidence
		? evidence.map(({ b, matched, similarity }) => ({
				id: b.id,
				name: b.name,
				hackathon: b.hackathon.title,
				placement: b.hackathonPlacement ?? null,
				isWinner: !!b.isWinner,
				githubUrl: b.githubUrl ?? null,
				matchedTerms: matched,
				...(similarity !== undefined
					? { similarity: Math.round(similarity * 1000) / 1000 }
					: {}),
			}))
		: null;

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
				scfAwarded: true,
				...GAP_PROJECT_SELECT,
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
		competitors: {
			repos: competitorRepos,
			projects: competitorProjects,
			matchMode: competitorMatch,
			matchModeLabel: !competitorProjects.length
				? "no directory project matched enough of the idea's own words: we found nothing close, which is not evidence that none exists"
				: competitorMatch === "vertical"
					? "typed members of the idea's vertical"
					: competitorMatch === "vertical+scored"
						? "typed members of the idea's vertical, plus rows that matched the idea's own terms — a product ABOUT a vertical competes with tools, not only with members of that vertical"
						: competitorMatch === "scored"
							? "matched the idea's own terms"
							: "only generic words matched — nearest rows, not evidence a competitor exists",
		},
		maturity: {
			auditedProjects,
			liveOnMainnetRepos,
			basis:
				"auditedProjects = ALL matched projects (vertical-wide, not just the displayed slice) with ≥1 report in the audits registry (absence ≠ unaudited); liveOnMainnetRepos = displayed competitor repos with verified on-chain usage.",
		},
		priorArt: {
			repos: priorArtRepos,
			builds: priorArtBuilds,
			buildsMode: buildSearch?.served ?? null,
			buildsBelowEvidenceRule,
			note: [
				"builds: stored hackathon submissions matching the idea, best first, by hybrid search (words plus meaning) unless buildsMode says keyword. matchedTerms are the words each matched; similarity is the meaning score; of the top five, only builds with a score of at least 0.7, two matched words, or every word of the idea the search reads (it skips generic words such as app) are listed, and buildsBelowEvidenceRule counts the rest. One with similarity and no matchedTerms was found by meaning alone, so check it. repos: judged-hackathon repos from our index that match at least two of the idea's words the set uses, cover half their weight, and include one word found in no more than a tenth of the set, so often none. Dead prior art is itself a signal.",
				...(nearMisses ? [nearMisses] : []),
				...(buildSearch
					? buildSearch.warnings
					: [
							"builds is null: the submissions index could not be read, so builds were not checked. It does not mean nobody built this.",
						]),
			].join(" "),
		},
		gap,
		funding,
	};
}
