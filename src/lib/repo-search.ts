/**
 * Shared code-reference search over the `repos` index. Used by /api/repos/search
 * AND injected as `codeReferences` into /api/projects/search — so a consumer that
 * only calls project search (e.g. an agent with a fixed tool list) picks up graded
 * repos automatically, with no new tool and no change on their side.
 *
 * Keyword overlap over name + description + topics + language + README, with
 * synonym expansion (zk→zero-knowledge/snark...), ranked by keyword score then
 * the repoScore quality grade.
 */

import { symbolsHaystack } from "./code-symbols";

// Minimal shape so we don't couple to the full Payload type.
interface PayloadLike {
	find(args: unknown): Promise<{ docs: unknown[] }>;
}

interface RepoDoc {
	fullName: string;
	owner?: string;
	name?: string;
	url?: string;
	description?: string | null;
	topics?: unknown;
	primaryLanguage?: string | null;
	stars?: number;
	openIssues?: number;
	lastCommitAt?: string | null;
	homepageUrl?: string | null;
	isFork?: boolean;
	isArchived?: boolean;
	projectSlug?: string | null;
	projectName?: string | null;
	hackathonWinner?: boolean;
	scfAwarded?: boolean;
	builderReputation?: number;
	judgeScore?: number | null;
	judgedHackathon?: string | null;
	repoScore?: number;
	repoScoreLabel?: string | null;
	readmeExcerpt?: string | null;
	// Code-Truth Ledger signals (scripts/scan/scan-repo-code.ts). Present only
	// once the repo has been code-scanned; null/absent otherwise.
	stellarProof?: string | null;
	codeDepth?: number | null;
	isDeployableContract?: boolean | null;
	sorobanSdkVersion?: string | null;
	versionStatus?: string | null;
	codeScanState?: string | null;
	codeScannedAt?: string | null;
	codeSymbols?: unknown;
	mainnetContractId?: string | null;
}

export interface RepoResult {
	fullName: string;
	owner: string | null;
	name: string | null;
	url: string | null;
	description: string | null;
	topics: string[];
	primaryLanguage: string | null;
	stars: number;
	openIssues: number;
	lastCommitAt: string | null;
	homepageUrl: string | null;
	isFork: boolean;
	isArchived: boolean;
	project: { slug: string; name: string | null } | null;
	hackathonWinner: boolean;
	scfAwarded: boolean;
	builderReputation: number;
	judgeScore: number | null;
	judgedHackathon: string | null;
	repoScore: number;
	repoScoreLabel: string | null;
	score: number;
	/** DeepWiki AI-generated wiki of this repo's internals — hand off here for deep "where/how" code questions. */
	deepWikiUrl: string;
	/** True when this repo was surfaced as a curated canonical answer for an infra/protocol query. */
	canonical: boolean;
	/**
	 * Code-verified truth from analyzing the repo's ACTUAL source (not stars or
	 * topics): how we know it's Stellar (stellarProof), how substantial the
	 * Soroban code is (codeDepth 0-1), whether it's a deployable contract, and
	 * its soroban-sdk version vs the current protocol. `null` until code-scanned.
	 * This is the discriminator between "popular" and "real, current, deep code".
	 */
	codeVerified: CodeVerified | null;
}

export interface CodeVerified {
	/** Strongest→weakest relevance proof from the code: cargo-sdk | contract-macros | lang-sdk | js-sdk | stellar-toml. */
	stellarProof: string;
	/** 0-1 substance of the actual contract code (auth/storage/arith/branch, not presence). Null if non-Rust proof. */
	codeDepth: number | null;
	/** Cargo cdylib — a real deployable Soroban contract (vs tooling/SDK/frontend that merely uses Stellar). */
	isDeployableContract: boolean;
	/** Raw soroban-sdk version requirement (sourced fact, never a bare protocol int). */
	sorobanSdkVersion: string | null;
	/** current | supported | deprecated | unknown — vs the latest protocol at scan time. */
	versionStatus: string | null;
	/** When the code was last scanned (ISO). */
	scannedAt: string | null;
	/** Public code-symbol surface (pub fn/type names) from the scanned sources —
	 * what the repo IMPLEMENTS. Empty until a post-2026-07-08 scan. */
	symbols: string[];
	/** README contract id VERIFIED to exist on Stellar mainnet (stellar.expert
	 * echo-check at scan time) — unfakeable deployment evidence; null when no
	 * verified address. */
	mainnetContractId: string | null;
}

function codeVerifiedOf(d: RepoDoc): CodeVerified | null {
	if (d.codeScanState !== "scanned" || !d.stellarProof) return null;
	return {
		stellarProof: d.stellarProof,
		codeDepth: typeof d.codeDepth === "number" ? d.codeDepth : null,
		isDeployableContract: !!d.isDeployableContract,
		sorobanSdkVersion: d.sorobanSdkVersion ?? null,
		versionStatus: d.versionStatus ?? null,
		scannedAt: d.codeScannedAt ?? null,
		symbols: Array.isArray(d.codeSymbols)
			? d.codeSymbols
					.filter((s): s is string => typeof s === "string")
					.slice(0, 20)
			: [],
		mainnetContractId: d.mainnetContractId ?? null,
	};
}

function topicList(topics: unknown): string[] {
	return Array.isArray(topics)
		? topics.filter((t): t is string => typeof t === "string")
		: [];
}

// A query token matches if ANY of its expansions hits the repo's text.
const SYNONYMS: Record<string, string[]> = {
	zk: [
		"zk",
		"zero-knowledge",
		"zero knowledge",
		"zkp",
		"snark",
		"stark",
		"plonk",
		"groth16",
		"circuit",
		"proof",
	],
	zkp: ["zkp", "zk", "zero-knowledge", "proof"],
	oracle: ["oracle", "price feed", "data feed", "datafeed"],
	amm: ["amm", "dex", "liquidity", "swap"],
	dex: ["dex", "amm", "swap", "exchange", "orderbook"],
	wallet: ["wallet", "keypair", "signer", "passkey"],
	nft: ["nft", "non-fungible", "collectible"],
	rwa: [
		"rwa",
		"real-world asset",
		"real world asset",
		"tokenization",
		"tokenized",
	],
	lending: ["lending", "lend", "borrow", "money market"],
	bridge: ["bridge", "cross-chain", "interoperability", "cctp"],
	indexer: ["indexer", "indexing", "subgraph", "data pipeline", "etl"],
	sdk: ["sdk", "library", "client"],
	soroban: ["soroban", "smart contract", "contract"],
	contract: ["contract", "soroban", "smart contract"],
	stablecoin: ["stablecoin", "usdc", "anchor"],
	defi: ["defi", "decentralized finance", "amm", "lending"],
};
function termsForToken(t: string): string[] {
	const out = new Set<string>([t]);
	if (t.length > 4 && t.endsWith("s")) out.add(t.slice(0, -1));
	for (const syn of SYNONYMS[t] ?? []) out.add(syn);
	return [...out];
}

// Match a term at a WORD BOUNDARY (prefix, suffix, or whole word) rather than
// as a raw infix. "swap" still matches "soro·swap" (suffix) and the topic
// "dex" still matches, but "dex" no longer matches "in·dex·er" — the substring
// false positive that ranked a ledger indexer #1 for "amm" and inflated counts.
// Regexes are cached since the same expansion terms recur for every repo.
const termRe = new Map<string, RegExp>();
function boundaryRe(term: string): RegExp {
	let re = termRe.get(term);
	if (!re) {
		const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		// Two-sided boundary: the previous one-sided form still matched
		// mid-word suffixes/prefixes ("amm" → "h·amm·er"-class noise) and
		// polluted narrow vertical queries with off-topic repos.
		re = new RegExp(`\\b${esc}\\b`);
		termRe.set(term, re);
	}
	return re;
}
function termHits(terms: string[], hay: string): boolean {
	return terms.some((v) => boundaryRe(v).test(hay));
}

// Insert separators at camelCase / letter→digit transitions BEFORE lowercasing,
// so boundary matching sees words smushed into a name: "StellarPay402" →
// "stellar pay 402" (so "pay" matches), while "indexer" stays one word.
function wordy(s: string): string {
	return s
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/([A-Za-z])([0-9])/g, "$1 $2")
		.toLowerCase();
}

// Natural-language filler that must NOT be scored as a query term. A question
// wrapper ("what does X do", "how does Y work", "explain Z") otherwise lets a
// repo whose description merely contains "what"/"do"/"work" outrank the real
// name match — and the multi-term coverage multiplier compounds it, so two
// filler matches (2×3 ×1.3 = 7.8) beat one weight-5 name hit. Real case: q="what
// does blend-contracts backstop module do" ranked xycloo/soroban-events-guide
// (desc: "What are events and how do they work?") above blend-contracts-v2.
// Closed-class function words + question words + auxiliaries + a short set of
// generic NL-question verbs. Deliberately NO domain words (contract, module,
// pool, swap, token…) so vertical queries are untouched.
const STOPWORDS = new Set<string>([
	// articles, conjunctions, prepositions
	"the",
	"and",
	"or",
	"of",
	"to",
	"in",
	"on",
	"for",
	"with",
	"by",
	"from",
	"at",
	"as",
	"into",
	"onto",
	"over",
	"under",
	"about",
	"between",
	"across",
	"through",
	"per",
	"via",
	"vs",
	// pronouns / determiners
	"it",
	"its",
	"this",
	"that",
	"these",
	"those",
	"they",
	"them",
	"their",
	"there",
	"here",
	"you",
	"we",
	"my",
	"your",
	"our",
	"his",
	"her",
	"me",
	"us",
	"an",
	"any",
	"some",
	"all",
	"each",
	"both",
	"no",
	// to-be / auxiliaries / modals
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"am",
	"do",
	"does",
	"did",
	"doing",
	"done",
	"has",
	"have",
	"had",
	"having",
	"can",
	"could",
	"should",
	"would",
	"will",
	"shall",
	"may",
	"might",
	"must",
	// question words
	"what",
	"which",
	"how",
	"why",
	"where",
	"when",
	"who",
	"whose",
	"whom",
	"whether",
	// generic NL-question verbs (no domain words)
	"work",
	"works",
	"working",
	"use",
	"uses",
	"used",
	"using",
	"build",
	"explain",
	"describe",
	"tell",
	"show",
	"mean",
	"means",
	"need",
	"want",
	"know",
	// superlatives / recommendation filler ("what is the BEST/TOP X"). A 15-vertical
	// live sweep proved these distort ranking not just as filler but by literal
	// description match — soroban-governor's desc says "popular Governor DAO" so
	// "popular" name-matched it into wallet results; hot-dao/public-good-proposals
	// won "good passkey" via "good".
	"best",
	"top",
	"good",
	"better",
	"popular",
	"recommended",
	"great",
	"ideal",
	// "stellar" — the ecosystem name. Every repo in this index is Stellar, so the
	// bare token carries ~zero discriminating signal but maximum pollution: it
	// name-matches high-authority OFF-topic repos (StellarPay402 score 85, an
	// agent-payment API) and floats them over the real vertical winner across
	// ~10/15 verticals in the sweep. Hyphenated names ("stellar-core",
	// "js-stellar-sdk") are single tokens and are NOT affected — only the bare word.
	"stellar",
	// "protocol" — same failure mode as "stellar": a generic token that name-matches
	// any "*-protocol" repo at weight 5. "swap protocol" surfaced ZKLiquid-protocol
	// + stellar/stellar-protocol (a governance-discussion repo); "oracle protocol"
	// surfaced relink's Solidity/EVM contracts (not even Soroban). Verified via live
	// isolation that "lending protocol" == "lending" (Templar wins either way — the
	// domain term carries it), so stripping "protocol" only removes the junk.
	"protocol",
]);

// Content tokens for a query: length-filtered, lowercased, stopwords removed.
// Guard: a query that is ALL stopwords ("how does it work") keeps its originals
// so it still searches (degenerate but non-empty). Exported so /api/projects/
// search and tests share the exact tokenization.
export function contentTokens(q: string): string[] {
	// Identifier-form queries split into word tokens BEFORE lowercasing —
	// review 2026-07-08 finding 2: symbolsHaystack normalizes docs
	// (release_escrow → "release escrow") but a query token kept its raw form,
	// so the most literal lookup the symbols feature advertises
	// (q=release_escrow, q=EscrowContract) could never match. snake_case and
	// camelCase become separate tokens ("release_escrow" → [release, escrow]);
	// hyphenated terms ("on-ramp") are untouched.
	const raw = q
		.replace(/_/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.toLowerCase()
		.split(/\s+/)
		.filter((t) => t.length > 1);
	const content = raw.filter((t) => !STOPWORDS.has(t));
	return content.length ? content : raw;
}

// SDF / canonical Stellar orgs — for a Stellar query their repos are the
// authoritative answer, so they win ties over community/generic repos.
const SDF_OWNERS = new Set([
	"stellar",
	"soroban",
	"stellar-deprecated",
	"stellardevelopmentfoundation",
]);

// Tiebreak signals applied ABOVE the authority grade, most → least decisive:
// SDF-org ownership, then "alive" (committed within a year), then an explicit
// stellar/soroban mention. Ordering matters and was tuned against live results:
//   - SDF org first: SDF's own repos are the canonical answer for a Stellar
//     query (lifts stellar/wallet-backend, stellar/rs-soroban-sdk, anchor-platform).
//   - alive BEFORE mention: otherwise a long-dead repo with "soroban" in its
//     name (e.g. orally-network/soroban-oracle, 700d stale) outranks the live
//     canonical oracle (reflector) that lacks the literal word.
//   - mention last: among equally-relevant, equally-alive repos it demotes
//     generic multi-chain repos (rango) below genuinely Stellar-native ones.
// NOT keyed on projectSlug: most off-topic-noisy repos (generic SCF multi-chain
// tools, payment-gateway SDKs) are ALSO project-linked, so that boost buried
// strong unlinked repos (zk hackathon winners) under mediocre linked ones.
function isSdfOwned(owner: string): boolean {
	return SDF_OWNERS.has(owner);
}
function isAlive(lastCommitAt?: string | null): boolean {
	if (!lastCommitAt) return false;
	const days = (Date.now() - Date.parse(lastCommitAt)) / 86_400_000;
	return Number.isFinite(days) && days <= 365;
}
function hasStellarMention(hay: string): boolean {
	return /\bstellar\b/.test(hay) || /\bsoroban\b/.test(hay);
}

// Curated concept → canonical Stellar repos. Plain keyword/topic search can't
// route a CONCEPT to the authoritative repo when that repo's name/description
// doesn't contain the words: "error codes" live in the XDR + stellar-core +
// Horizon + the SDKs (none of which say "error codes"), and Horizon itself is
// implemented in stellar/go, not a "horizon"-named repo. For these specific
// infra/protocol questions we inject the canonical SDF repos and float them to
// the top, in priority order. Repos here that aren't indexed are simply skipped
// (the DB `in` filter only returns existing ones). Keep entries NARROW — only
// concepts whose answer is a known core repo, never broad terms like "wallet".
const CANONICAL: Array<{ test: RegExp; repos: string[] }> = [
	// transaction / operation result & error codes
	{
		test: /\b(error|result|status|op(?:eration)?|tx|transaction)\s*codes?\b|\bresult\s*code|\btx\s*result/,
		repos: [
			"stellar/stellar-core",
			"stellar/go",
			"stellar/js-stellar-sdk",
			"stellar/rs-soroban-sdk",
		],
	},
	// Horizon (the real implementation lives in stellar/go)
	{ test: /\bhorizon\b/, repos: ["stellar/go", "stellar/stellar-horizon"] },
	// RPC
	{
		test: /\b(soroban[\s-]*)?rpc\b/,
		repos: ["stellar/stellar-rpc", "stellar/soroban-rpc"],
	},
	// XDR
	{
		test: /\bxdr\b/,
		repos: [
			"stellar/stellar-xdr",
			"stellar/js-stellar-base",
			"stellar/rs-stellar-xdr",
			"stellar/stellar-core",
		],
	},
	// core internals: consensus / ledger / catchup
	{
		test: /\bstellar[\s-]*core\b|\bconsensus\b|\bscp\b|\bvalidator\b|\bledger\s*close|\bcatchup\b|\bquorum\b/,
		repos: ["stellar/stellar-core"],
	},
	// protocol specs: CAPs / SEPs / upgrades. Beyond explicit "cap-35" refs, catch
	// natural spec questions — "which CAP introduced clawback", "which SEP does the
	// SAC implement", "what CAP added X" — which route to stellar/stellar-protocol
	// (DeepWiki answers these authoritatively from the CAP/SEP files: verified
	// CAP-0035 clawback). Collision-safe: \bcaps?\b never matches "capital"/
	// "capacity" (no word boundary after cap/caps inside those words).
	{
		test: /\bcap[\s-]?\d|\bsep[\s-]?\d|\bprotocol\s*(spec|upgrade|version)|\bcore\s*advancement|\b(which|what|when)\s+cap\b|\b(which|what)\s+sep\b|\bcap\s+(introduc|add|implement|defin|enabl|land)|\bsep\s+(introduc|add|implement|defin)/,
		repos: ["stellar/stellar-protocol"],
	},
	// classic protocol mechanics: network fees / path payments / claimable
	// balances. Verified via ?repo= pin that stellar-core's DeepWiki answers all
	// three authoritatively (fee+surge pricing, PathPaymentStrictSend, claimable-
	// balance predicates). Fee terms stay bigram-narrow ("transaction fees",
	// "base fee", "surge pricing") so protocol-level questions route here while
	// dapp-fee questions ("what fees does soroswap charge") fall through to search.
	{
		test: /\b(transaction|network|base|inclusion|resource)\s*fees?\b|\bsurge\s*pricing|\bfee[\s-]?bump|\bpath\s*payment|\bclaimable\s*balance|\bclaim(?:able)?\s*predicates?\b/,
		repos: ["stellar/stellar-core"],
	},
	// Soroban runtime/host internals: the Stellar Asset Contract, storage
	// TTL/rent/state-archival, the auth framework (require_auth), and host
	// functions are all implemented in rs-soroban-env — verified via ?repo= pin
	// that its DeepWiki answers each authoritatively. Terms stay narrow: bare
	// "authorization"/"storage" never match, only the Soroban-specific phrases.
	{
		test: /\bstellar\s*asset\s*contract\b|\bsac\b|\brequire_?\s*auth\b|\bsoroban\s*auth|\bauthorization\s*framework|\bstorage\s*ttl\b|\bttl\b|\bstate\s*archival|\barchived\s*entr|\brent\s*(fee|payment|mechanic|work)|\bhost\s*functions?\b/,
		repos: ["stellar/rs-soroban-env", "stellar/rs-soroban-sdk"],
	},
	// anchor / SEP infra
	{
		test: /\banchor\s*platform\b/,
		repos: ["stellar/anchor-platform", "stellar/java-stellar-anchor-sdk"],
	},
	// quickstart / run a node
	{
		test: /\bquickstart\b|\brun\s*(a\s*)?(node|validator|horizon)\b/,
		repos: ["stellar/quickstart"],
	},
	// SDKs by language
	{
		test: /\b(java\s*script|js|typescript|ts)\s*sdk\b/,
		repos: ["stellar/js-stellar-sdk"],
	},
	{ test: /\b(rust|soroban)\s*sdk\b/, repos: ["stellar/rs-soroban-sdk"] },
	{ test: /\bpython\s*sdk\b/, repos: ["StellarCN/py-stellar-base"] },
	{ test: /\bgo\s*sdk\b/, repos: ["stellar/go"] },
];

// Canonical repos for a query, priority order, deduped. Empty when the query
// doesn't hit a curated concept (so normal queries behave exactly as before).
export function canonicalFor(q: string): string[] {
	const hay = wordy(q);
	const out: string[] = [];
	for (const c of CANONICAL) {
		if (c.test.test(hay))
			for (const r of c.repos) if (!out.includes(r)) out.push(r);
	}
	return out;
}

// Curated ecosystem-vertical flagships — DISTINCT from CANONICAL (which is
// SDF/infra concept→repo AND drives explain routing). This map is SEARCH-ONLY:
// it floats the real Stellar-native flagships for a vertical to the top when
// keyword scoring alone can't surface them. The bridge case is the archetype:
// the actual bridges are too thinly-described to keyword-match — rozo-intents-
// contracts and crossmesh-ingress-contracts carry NO "bridge"/"cross-chain"
// token in name/topics/description — while a WALLET (rabet) ranks #1 off a bogus
// "bridge" topic tag + high authority. The clean `projects` surface knows the
// real ones; we float the curated repos so an off-type or multichain repo can't
// bury them. Every fullName is verified in-index before adding (missing ones are
// silently skipped by the `in` fetch). Add a vertical ONLY when it has this
// thin-description problem AND a human-verified flagship set — never guess.
const VERTICAL_FLAGSHIPS: Array<{ test: RegExp; repos: string[] }> = [
	// cross-chain bridges. Verified in-index 2026-07-06 (descriptions confirm each
	// is a real Stellar bridge, not a wallet/aggregator): allbridge (Soroban
	// contracts + js-sdk), rozo (USDC intents), crossmesh (EVM→Stellar forwarder),
	// axelar (Cross-chain Gateway for Soroban), spacewalk (Pendulum↔Stellar).
	{
		test: /\bbridges?\b|\bcross[\s-]?chain\b|\binteroperab/,
		repos: [
			"allbridge-io/allbridge-core-soroban-contracts",
			"rozoai/rozo-intents-contracts",
			"lightsail-network/crossmesh-ingress-contracts",
			"axelarnetwork/axelar-amplifier-stellar",
			"allbridge-io/allbridge-core-js-sdk",
			"soroswap/spacewalk-implementation",
		],
	},
	// oracles / price feeds. A 10-vertical curation sweep found a DEMO
	// (warp-driver/oracle-demo) + a Solana monitoring exporter (blockdaemon/
	// pyth-exporter) leading while Reflector — THE canonical Stellar oracle — was
	// absent. All verified in-index, Rust Soroban oracle contracts of curated Live
	// projects (reflector/lightecho/dia/band).
	{
		test: /\boracles?\b|\bprice[\s-]?feeds?\b|\bdata[\s-]?feeds?\b/,
		repos: [
			"reflector-network/reflector-contract",
			"bp-ventures/lightecho-stellar-oracle",
			"diadata-org/soroban-oracle-feeders",
			"bandprotocol/band-std-reference-contracts-soroban",
		],
	},
	// AMM / DEX. soroswap/core (the canonical Soroswap AMM Factory/Router/Pair
	// contracts) + phoenix-contracts (Phoenix DEX) are buried under frontends on
	// the bare query because the contract repos don't self-tag "amm". Both
	// verified in-index (Rust, soroban-sdk). Includes "swap"/"decentralized
	// exchange" — the canonical user words for a DEX (a cold audit found q=swap
	// surfacing multichain rango, not Soroswap). "cross-chain swap" also matches
	// the bridge vertical, which is fine — both are legitimately relevant.
	{
		test: /\bamms?\b|\bdex\b|\bdecentralized\s*exchange\b|\bswaps?\b|\bliquidity\s*pools?\b/,
		repos: ["soroswap/core", "phoenix-protocol-group/phoenix-contracts"],
	},
	// DAO / governance. A DeFi vault (dogstarapps/arka.fund) + an agent wallet
	// (OrbitSafe) led on authority over soroban-governor — the canonical Soroban
	// Governor DAO framework. All verified in-index, real Stellar governance repos.
	{
		test: /\bdaos?\b|\bgovernance\b|\bgovernors?\b/,
		repos: [
			"script3/soroban-governor",
			"Consulting-Manao/tansu",
			"reflector-network/reflector-dao-contract",
		],
	},
	// RWA / tokenization. An Aztec/Noir security-token repo (taurushq-io/
	// private-CMTAT-aztec — zero Stellar code, generic "tokenization" topic tag)
	// ranked #2 over the real Stellar-native tokenization repos. Both seeds
	// verified in-index: SimplyTokenized (Soroban contracts) + microvault
	// (SEP-0056 tokenized-vault engine). "tokeniz" prefix covers tokenize/
	// tokenized/tokenization; bare "token" never matches.
	{
		test: /\brwa\b|\breal[\s-]?world[\s-]?assets?\b|\btokeniz(?:ation|ed)\b/,
		repos: [
			"simplytokenized/soroban-smart-contracts",
			"shamba-records-limited/microvault",
		],
	},
	// lending / money-market. Boxy-ordered (2026-07-06): Blend is THE flagship
	// Stellar lending protocol and must lead; laina is still testnet-only so it
	// must NOT rank near the top (unseeded → falls below the float naturally);
	// slender deliberately NOT seeded (low-value/unmaintained per boxy). templar
	// (multichain, real soroban crate) stays wherever keyword rank puts it.
	{
		test: /\blending\b|\bmoney[\s-]?markets?\b/,
		repos: ["blend-capital/blend-contracts-v2", "xycloo/xycloans"],
	},
];

// Curated flagship repos for a query, priority order, deduped. Empty for queries
// that don't hit a curated vertical (so normal queries are untouched).
export function flagshipsFor(q: string): string[] {
	const hay = wordy(q);
	const out: string[] = [];
	for (const v of VERTICAL_FLAGSHIPS) {
		if (v.test.test(hay))
			for (const r of v.repos) if (!out.includes(r)) out.push(r);
	}
	return out;
}

export async function searchRepos(
	payload: PayloadLike | null,
	q: string,
	opts: {
		limit?: number;
		offset?: number;
		language?: string;
		minScore?: number;
	} = {},
): Promise<{ repos: RepoResult[]; total: number; canonical: string[] }> {
	const { limit = 20, offset = 0, language = "", minScore = 0 } = opts;
	if (!payload) return { repos: [], total: 0, canonical: [] };
	try {
		const tokens = contentTokens(q);
		// Push the keyword match INTO the DB query so we fetch only CANDIDATE
		// repos, not the whole collection. It grew past 2,000 docs and pulling
		// them all (each with a README excerpt) on every call timed the endpoint
		// out. Coarse substring `like` is the recall net; the field-weighted
		// boundary scoring below is the precise filter — same design as
		// /api/projects/search. A no-query browse is capped to the top-scored
		// page instead of the full collection.
		// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
		const where: any = {};
		if (language) where.primaryLanguage = { like: language };
		if (tokens.length) {
			where.or = tokens.flatMap((t) =>
				termsForToken(t).flatMap((v) => [
					{ fullName: { like: v } },
					{ description: { like: v } },
					// topics too — the in-memory scorer weights a topic hit like a
					// name hit (5), but a repo whose ONLY match is a topic never
					// became a candidate (templar-protocol/contracts topic
					// "defi-lending" was invisible to q="lending"). Mongo regex on an
					// array field matches per-element; verified against live Payload
					// REST before adding.
					{ topics: { like: v } },
					// code-content recall: a repo whose ONLY match is a pub fn/type
					// name ("escrow" ⇢ release_escrow) must still be a candidate.
					// codeSymbols is json like topics — same per-element regex match.
					{ codeSymbols: { like: v } },
				]),
			);
		}
		const res = await payload.find({
			collection: "repos",
			where,
			limit: tokens.length ? 600 : 200,
			sort: "-repoScore",
			depth: 0,
			// Drop the README excerpt — it's the largest per-doc field and the
			// candidates here already matched name/description in the DB, so the
			// (weakest, noisiest) README scoring tier was moot anyway. Big payload
			// win on the repos collection.
			select: { readmeExcerpt: false },
		});
		// Curated concept → canonical repo injection. The authoritative SDF repo for
		// an infra/protocol question often isn't a keyword candidate, so fetch the
		// curated set and float it to the top in priority order (canonRank).
		const canonList = canonicalFor(q);
		const canonRank = new Map(canonList.map((fn, i) => [fn.toLowerCase(), i]));
		// Curated vertical flagships (bridge, …) — the same inject-and-float pattern,
		// but for real ecosystem repos too thinly-described to keyword-match. floatRank
		// orders them within the vertical; they sort just below canonical, above the
		// noisy scored list, so a wallet/aggregator can't bury the real flagship.
		const flagList = flagshipsFor(q);
		const flagRank = new Map(flagList.map((fn, i) => [fn.toLowerCase(), i]));
		const injectList = [...new Set([...canonList, ...flagList])];
		let rawDocs = res.docs as unknown as RepoDoc[];
		if (injectList.length) {
			const cres = await payload.find({
				collection: "repos",
				where: { fullName: { in: injectList } },
				limit: injectList.length,
				depth: 0,
				select: { readmeExcerpt: false },
			});
			const seen = new Set(rawDocs.map((d) => d.fullName.toLowerCase()));
			rawDocs = [
				...rawDocs,
				...(cres.docs as unknown as RepoDoc[]).filter(
					(d) => !seen.has(d.fullName.toLowerCase()),
				),
			];
		}
		const docs = rawDocs.map((r) => {
			const topics = topicList(r.topics);
			// Field-weighted relevance: WHERE a term hits matters more than that it
			// hits at all. name/topics (5) > description/language (3) > README-only
			// (1), so a repo that's actually ABOUT the query outranks one that merely
			// mentions it once in a README. name and topics share a weight on purpose
			// — that way an org-name substring ("zk" in "zkbricks") can't beat a real
			// topic match, and ties fall through to the repoScore quality grade below,
			// which keeps flagship repos (noir for zk) leading. Multi-term coverage
			// is rewarded so a repo matching the whole query beats a partial match.
			// Relevance matches the repo NAME (after the owner) — NOT the owner —
			// so an org named "Blockchain-Oracle" or "hot-dao" doesn't make its
			// repos rank for "oracle"/"dao". Owner is still used for SDF + mention.
			const repoPart = r.fullName.split("/").slice(1).join("/") || r.fullName;
			const name = wordy(repoPart);
			const tops = wordy(topics.join(" "));
			const desc = wordy(`${r.description ?? ""} ${r.primaryLanguage ?? ""}`);
			const readme = wordy(r.readmeExcerpt ?? "");
			// Snake/camel split so \b matching works on symbol names (regex \b
			// treats _ as a word char — "escrow" never hits "release_escrow" raw).
			const syms = symbolsHaystack(r.codeSymbols);
			let score = 0;
			let matched = 0;
			if (tokens.length) {
				for (const t of tokens) {
					const vs = termsForToken(t);
					const hit = (hay: string) => termHits(vs, hay);
					let best = 0;
					if (hit(name) || hit(tops)) best = 5;
					// A pub fn/type named after the query term is stronger evidence the
					// repo IMPLEMENTS the concept than a description mention — but a
					// name/topic hit stays highest (it's the repo's own claimed identity).
					else if (hit(syms)) best = 4;
					else if (hit(desc)) best = 3;
					else if (hit(readme)) best = 1;
					if (best > 0) {
						score += best;
						matched += 1;
					}
				}
				if (matched > 1) score *= 1 + (matched - 1) * 0.3;
			} else {
				score = 1;
			}
			const owner = r.fullName.split("/")[0].toLowerCase();
			// mention check uses the FULL name (incl. owner) so a stellar/soroban
			// org still counts, even though owner is excluded from relevance above.
			const hay = `${wordy(r.fullName)} ${tops} ${desc}`;
			const sdf = isSdfOwned(owner) ? 1 : 0;
			const alive = isAlive(r.lastCommitAt) ? 1 : 0;
			const mention = hasStellarMention(hay) ? 1 : 0;
			const crank = canonRank.get(r.fullName.toLowerCase()) ?? 9999;
			const frank = flagRank.get(r.fullName.toLowerCase()) ?? 9999;
			return { r, topics, score, matched, sdf, alive, mention, crank, frank };
		});
		// Keep canonical + curated-flagship repos even when they didn't keyword-match.
		let filtered = tokens.length
			? docs.filter((d) => d.matched >= 1 || d.crank < 9999 || d.frank < 9999)
			: docs;
		if (minScore > 0)
			filtered = filtered.filter((d) => (d.r.repoScore ?? 0) >= minScore);
		// Sort order, most → least decisive: query relevance, SDF-org ownership,
		// alive (committed within a year), explicit stellar/soroban mention, THEN
		// the authority grade and stars. Putting these signals ABOVE repoScore
		// stops an off-topic but high-authority repo (an SCF-funded multi-chain
		// tool, or a long-dead flagship) from outranking the canonical, live
		// Stellar match at the same relevance.
		filtered.sort(
			(a, b) =>
				a.crank - b.crank ||
				a.frank - b.frank ||
				b.score - a.score ||
				b.sdf - a.sdf ||
				b.alive - a.alive ||
				b.mention - a.mention ||
				(b.r.repoScore ?? 0) - (a.r.repoScore ?? 0) ||
				(b.r.stars ?? 0) - (a.r.stars ?? 0),
		);
		const total = filtered.length;
		const repos = filtered
			.slice(offset, offset + limit)
			.map(({ r, topics, score, crank }) => ({
				fullName: r.fullName,
				owner: r.owner ?? null,
				name: r.name ?? null,
				url: r.url ?? null,
				description: r.description ?? null,
				topics,
				primaryLanguage: r.primaryLanguage ?? null,
				stars: r.stars ?? 0,
				openIssues: r.openIssues ?? 0,
				lastCommitAt: r.lastCommitAt ?? null,
				homepageUrl: r.homepageUrl ?? null,
				isFork: !!r.isFork,
				isArchived: !!r.isArchived,
				project: r.projectSlug
					? { slug: r.projectSlug, name: r.projectName ?? null }
					: null,
				hackathonWinner: !!r.hackathonWinner,
				scfAwarded: !!r.scfAwarded,
				builderReputation: r.builderReputation ?? 0,
				judgeScore: r.judgeScore ?? null,
				judgedHackathon: r.judgedHackathon ?? null,
				repoScore: r.repoScore ?? 0,
				repoScoreLabel: r.repoScoreLabel ?? null,
				score,
				deepWikiUrl: `https://deepwiki.com/${r.fullName}`,
				canonical: crank < 9999,
				codeVerified: codeVerifiedOf(r),
			}));
		return {
			repos,
			total,
			canonical: repos.filter((r) => r.canonical).map((r) => r.fullName),
		};
	} catch {
		return { repos: [], total: 0, canonical: [] };
	}
}
