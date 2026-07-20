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
import { isKnownInfraNotDeployable } from "./known-infra";
import {
	anchorTokens,
	CORE_SYNONYMS,
	mergeVocabulary,
} from "./search-vocabulary";

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
	sdkCapabilities?: unknown;
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
	 * WHY this repo ranks as Stellar-relevant (sls-047 transparency — ranking
	 * puts Stellar evidence ABOVE raw keyword score, so this names the tier):
	 * "code-verified" (scan found real Stellar/Soroban code), "sdf-org",
	 * "curated" (canonical/flagship map), "mentioned" (stellar/soroban in its
	 * own name/topics/description/README), or "none" — a general-purpose
	 * toolchain/dependency with no direct Stellar evidence; it can still match
	 * a topic query but ranks below Stellar-evidenced repos and must not be
	 * cited as a Stellar reference implementation.
	 */
	stellarEvidence:
		| "code-verified"
		| "sdf-org"
		| "curated"
		| "mentioned"
		| "none";
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
	/** Stellar SDK capability tags from the repo's JS/TS sources (tx-building,
	 * signing, soroban-rpc, sep10-auth, wallet-kit, …) — what a dapp actually
	 * DOES with the SDK; [] until scanned post-2026-07-09 or no JS sources. */
	sdkCapabilities: string[];
}

// A scan finished AND produced actual Stellar code evidence. stellarProof
// "none" means "scanned, found NO direct Stellar code" — treating that row as
// code-verified-Stellar was the sls-047 defect (noir-lang/noir, scanned with
// proof none, ranked tier-2 above deployable Stellar repos for
// q=zero-knowledge purely on a topic hit).
export function hasStellarCodeProof(d: RepoDoc): boolean {
	return (
		d.codeScanState === "scanned" &&
		!!d.stellarProof &&
		d.stellarProof !== "none"
	);
}

function codeVerifiedOf(d: RepoDoc): CodeVerified | null {
	if (d.codeScanState !== "scanned" || !d.stellarProof) return null;
	return {
		stellarProof: d.stellarProof,
		codeDepth: typeof d.codeDepth === "number" ? d.codeDepth : null,
		// sls-046: known platform/SDK/tooling repos are pinned NOT-deployable —
		// their cdylib crates are runtime/fixtures, not a deployable product.
		isDeployableContract: isKnownInfraNotDeployable(d.fullName)
			? false
			: !!d.isDeployableContract,
		sorobanSdkVersion: d.sorobanSdkVersion ?? null,
		versionStatus: d.versionStatus ?? null,
		scannedAt: d.codeScannedAt ?? null,
		symbols: Array.isArray(d.codeSymbols)
			? d.codeSymbols
					.filter((s): s is string => typeof s === "string")
					.slice(0, 20)
			: [],
		mainnetContractId: d.mainnetContractId ?? null,
		sdkCapabilities: Array.isArray(d.sdkCapabilities)
			? d.sdkCapabilities.filter((s): s is string => typeof s === "string")
			: [],
	};
}

function topicList(topics: unknown): string[] {
	return Array.isArray(topics)
		? topics.filter((t): t is string => typeof t === "string")
		: [];
}

// A query token matches if ANY of its expansions hits the repo's text.
// Core chain/vertical/region vocabulary lives in CORE_SYNONYMS
// (src/lib/search-vocabulary.ts) and is merged in below — add a lesson
// THERE when it applies to every surface, here only when the term is safe
// under this surface's word-boundary matcher but too loose for project
// substring matching (e.g. "client", "circuit", "proof").
const REPO_SYNONYM_OVERLAY: Record<string, string[]> = {
	zk: ["zk", "circuit", "proof"],
	zkp: ["zkp", "proof"],
	wallet: ["wallet", "keypair", "signer", "passkey"],
	sdk: ["sdk", "client"],
	stablecoin: ["stablecoin", "anchor"],
};

export const SYNONYMS: Record<string, string[]> = mergeVocabulary(
	CORE_SYNONYMS,
	REPO_SYNONYM_OVERLAY,
);
function termsForToken(t: string): string[] {
	const out = new Set<string>([t]);
	if (t.length > 4 && t.endsWith("s")) out.add(t.slice(0, -1));
	for (const syn of SYNONYMS[t] ?? []) out.add(syn);
	// sls-025 alias recall: identifier tokens come in separator variants, and a
	// lookup must not care which form the repo's name happens to use. These
	// variants feed BOTH the DB candidate fetch and the in-memory scorer.
	//   hyphen/underscore-stripped: "erc-8004"→"erc8004", "smart-account-kit"→"smartaccountkit"
	if (/[-_]/.test(t)) out.add(t.replace(/[-_]/g, ""));
	//   separator inserted at letter↔digit transitions: "stellar8004"→"stellar-8004"
	const dashed = t
		.replace(/([a-z])(\d)/g, "$1-$2")
		.replace(/(\d)([a-z])/g, "$1-$2");
	if (dashed !== t) out.add(dashed);
	//   standards identifiers (ERC-8004, EIP-3643, SRC-8004…): the number IS the
	//   identifier — q=erc-8004 must reach repos named stellar-8004/stellar8004.
	//   ≥3 digits so sep-6/cap-35-class tokens don't dissolve into noisy bare numbers.
	const std = t.match(/^(?:erc|eip|src)-?(\d{3,})$/);
	if (std) out.add(std[1]);
	return [...out];
}

// sls-025: separator-insensitive identity form — normAlias("stellar-8004") ===
// normAlias("stellar8004"), normAlias("subquery/stellar-subql-starter") matches
// the repo's full path however the caller separated it. Used for exact-ish
// owner/name/full-path lookups so they can't silently zero on punctuation.
function normAlias(s: string): string {
	return s.toLowerCase().replace(/[-_/.\s]/g, "");
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

// ── Mention-vs-identity (port of the project-search fix, #590/#592) ──
// A repo whose text merely MENTIONS an anchor noun mid-prose (plus one
// secondary token and the coverage multiplier: 3+3=6 ×1.3 = 7.8) used to
// outrank the repo NAMED for the term (weight 5). Identity = the zones
// where a repo states what it IS: name, topics, code symbols (a pub fn
// named for the term is implementation identity), and the LEAD of the
// description (first 60 chars — "Institutional custody for…" is identity,
// "…held in qualified custody" past the lead is mention territory). Owner
// is EXCLUDED (org names must not make repos rank — same rule as scoring)
// and README is excluded (pure mention territory).
export const IDENTITY_LEAD_CHARS = 60;

// Negation-aware boundary hit (mirror of project search's hasPositiveHit):
// the hyphen is a word boundary, so \bcustodial\b matches inside
// "non-custodial" — a match preceded by non-/self- must not count as
// identity. Global-flag regexes cached separately from termRe.
const termReG = new Map<string, RegExp>();
function positiveIdentityHit(hay: string, term: string): boolean {
	let re = termReG.get(term);
	if (!re) {
		const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		re = new RegExp(`\\b${esc}\\b`, "g");
		termReG.set(term, re);
	}
	re.lastIndex = 0;
	let m = re.exec(hay);
	while (m !== null) {
		if (!/(non|self)[-\s]$/.test(hay.slice(0, m.index))) return true;
		m = re.exec(hay);
	}
	return false;
}

/**
 * Does any ANCHOR token (intent-bearing, non-generic) hit an identity zone?
 * All-generic queries return true — the rule switches OFF rather than
 * demoting everything (same contract as project search).
 */
export function repoAnchorIdentity(tokens: string[], zones: string[]): boolean {
	const anchors = anchorTokens(tokens);
	if (!anchors.length) return true;
	return anchors.some((t) =>
		termsForToken(t).some((v) => zones.some((z) => positiveIdentityHit(z, v))),
	);
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

// Corpus stopword membership — articles/aux plus the ecosystem-generic
// "stellar"/"protocol". Exported so the project-search tokenizer can drop an
// over-common split fragment in favour of the joined identity form: "StellarX"
// splits to [stellar, x], and "stellar" alone matches the whole ecosystem
// (the StellarX name-lookup miss).
export function isContentStopword(t: string): boolean {
	return STOPWORDS.has(t);
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
	// escrow / milestone payments. Q5 cold-agent run (2026-07-20): for
	// q="escrow" the canonical AUDITED escrow platform (Trustless Work —
	// Runtime Verification report, stellarsecurityportal.com/report/64)
	// ranked 16/20 because its repo name lacks the word, while a 0-star
	// hackathon demo led. Verified in-index 2026-07-20: both repos served
	// by searchRepos with live scores/commit dates.
	{
		test: /\bescrows?\b|\bmilestone/,
		repos: [
			"Trustless-Work/trustlesswork-smart-contract-stellar",
			"devasignhq/soroban-escrow",
		],
	},
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
	// wallets (2026-07-19 answer-key eval): 0 of 5 directory-flagship wallets
	// appeared in the top 10 — flagship wallet repos don't carry the literal
	// "wallet" token in name/topics/desc (freighter's don't), so SDK/demo repos
	// swept the page. All three verified in-index 2026-07-19: stellar/freighter
	// (the canonical extension wallet, alive), creit-tech/xbull-wallet, and
	// kalepail/passkey-kit (the actively-maintained smart-wallet kit).
	{
		test: /\bwallets?\b|\bsmart[\s-]?wallets?\b/,
		repos: [
			"stellar/freighter",
			"creit-tech/xbull-wallet",
			"kalepail/passkey-kit",
		],
	},
	// anchors / ramps (2026-07-19 eval): flagship anchor OPERATORS are closed-
	// source, so the open anchor tooling must lead — and the bare token
	// "anchor" collides with Solana's Anchor framework (spl-governance-anchor
	// surfaced in the top 10). All verified in-index: anchor-platform (the
	// canonical anchor server), stellar-anchor-tests, php-anchor-sdk.
	{
		test: /\banchors?\b|\bon[\s-]?ramps?\b|\boff[\s-]?ramps?\b/,
		repos: [
			"stellar/anchor-platform",
			"stellar/stellar-anchor-tests",
			"argo-navis-dev/php-anchor-sdk",
		],
	},
	// streaming payments / money streaming (golden repos-streaming-payments,
	// 2026-07-14). Textbook thin-description case: the curated directory has a
	// rich Live streaming vertical (Fluxity, SStream, Paystreme, Zentra) but the
	// canonical contract repos carry NO "streaming"/"payment" token — fluxity-
	// v1-core's description is literally "Soroban contract V1" and SStream's is
	// empty — so q="streaming payments" served only generic x402/MPP payment
	// repos. All three verified in-index AND live on GitHub 2026-07-14: fluxity-
	// v1-core (Rust Soroban streaming contracts of curated-Live Fluxity),
	// rahimklaber/sstream (Rust, curated-Live SStream "Composable streaming
	// payments on Soroban"), fluxity-interface ("token streaming solution" UI).
	// Paystreme has no repo in the index (its GitHub isn't linked from the
	// curated project) — an index-coverage gap tracked separately, not seedable.
	{
		test: /\b(?:stream|streaming)\s+(?:payments?|money|tokens?)\b|\b(?:payments?|money|token)[\s-]?stream(?:ing|s)?\b/,
		repos: [
			"luanlabs/fluxity-v1-core",
			"rahimklaber/sstream",
			"luanlabs/fluxity-interface",
		],
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

/** What a search actually looked for — served on zero-result responses so an
 * empty page is honest about its scope (sls-025: a silent 0 reads as "doesn't
 * exist" when the real cause is an alias/index miss). */
export interface RepoSearchSearched {
	tokens: string[];
	expandedTerms: string[];
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
): Promise<{
	repos: RepoResult[];
	total: number;
	canonical: string[];
	searched: RepoSearchSearched;
}> {
	const { limit = 20, offset = 0, language = "", minScore = 0 } = opts;
	const tokens = contentTokens(q);
	const searched: RepoSearchSearched = {
		tokens,
		expandedTerms: [...new Set(tokens.flatMap(termsForToken))].slice(0, 40),
	};
	if (!payload) return { repos: [], total: 0, canonical: [], searched };
	try {
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
		// #592 analog for the DB candidate window: the 600-candidate fetch sorts
		// by -repoScore, so a low-authority repo NAMED for the anchor term can be
		// flooded out by high-authority description-mentioners before ranking
		// ever sees it. A small identity-only supplemental fetch guarantees
		// name/topic-anchored candidates enter the pool; the anchorIdentity sort
		// key below then ranks them on merit within their stellarness tier.
		const queryAnchors = anchorTokens(tokens);
		if (queryAnchors.length) {
			const ares = await payload.find({
				collection: "repos",
				where: {
					or: queryAnchors.flatMap((t) => [
						{ fullName: { like: t } },
						{ topics: { like: t } },
					]),
				},
				limit: 100,
				sort: "-repoScore",
				depth: 0,
				select: { readmeExcerpt: false },
			});
			const seenA = new Set(rawDocs.map((d) => d.fullName.toLowerCase()));
			rawDocs = [
				...rawDocs,
				...(ares.docs as unknown as RepoDoc[]).filter(
					(d) => !seenA.has(d.fullName.toLowerCase()),
				),
			];
		}
		// sls-025: separator-insensitive identity form of the query, computed once.
		// Alias identity applies ONLY to identifier-form queries (containing a
		// digit or -,_,/,. — "stellar8004", "passkey-kit", "subquery/stellar-subql-starter").
		// A broad vocabulary query ("wallet", "nft marketplace") must never ride
		// name-identity over the F4 Stellar-evidence policy — the audit's tier-0
		// name-hit class would come straight back.
		const qIsIdentifier = /[-_/.0-9]/.test(q.trim());
		const qNorm = qIsIdentifier ? normAlias(q) : "";
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
			// sls-025: the RAW lowercased form rides alongside the wordy split.
			// wordy("stellar8004") = "stellar 8004", so the joined query token
			// "stellar8004" could never boundary-match its own repo's name.
			const name = `${repoPart.toLowerCase()} ${wordy(repoPart)}`;
			const tops = wordy(topics.join(" "));
			const desc = wordy(`${r.description ?? ""} ${r.primaryLanguage ?? ""}`);
			const readme = wordy(r.readmeExcerpt ?? "");
			// Snake/camel split so \b matching works on symbol names (regex \b
			// treats _ as a word char — "escrow" never hits "release_escrow" raw).
			const syms = symbolsHaystack(r.codeSymbols);
			// F4 (audit root #4): owner is searchable — q=allbridge must reach
			// allbridge-io/* even when the repo name doesn't repeat the org.
			// Same stopword-filtered tokens as everything else, so generic words
			// can't pollute via owner. Raw form too (sls-025: q=progax01 must hit
			// owner "progax01" — wordy alone splits it to "progax 01").
			const ownerRaw = r.fullName.split("/")[0].toLowerCase();
			const ownerHay = `${ownerRaw} ${wordy(ownerRaw)}`;
			// Mention-vs-identity: does an anchor token hit an identity zone
			// (name / topics / symbols / description lead)? Owner + README are
			// deliberately excluded — see repoAnchorIdentity.
			const descLead = wordy(
				(r.description ?? "").slice(0, IDENTITY_LEAD_CHARS),
			);
			const anchorIdentity = repoAnchorIdentity(tokens, [
				name,
				tops,
				syms,
				descLead,
			])
				? 1
				: 0;
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
					else if (hit(desc) || hit(ownerHay)) best = 3;
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
			const owner = ownerRaw;
			// sls-025: separator-insensitive identity — the normalized query IS
			// this repo's owner, name, or full path (q="subquery/stellar-subql-starter",
			// q="stellar8004", q="progax01"). An exact-identity hit is admitted
			// regardless of token score and outranks keyword/semantic neighbors.
			// ≥3 chars so degenerate short queries can't ride it.
			const alias =
				qNorm.length >= 3 &&
				(normAlias(repoPart) === qNorm ||
					normAlias(ownerRaw) === qNorm ||
					normAlias(r.fullName) === qNorm)
					? 1
					: 0;
			// mention check spans name/topics/desc AND readme (F4: a repo whose
			// only Stellar evidence is its README is still Stellar-evidenced).
			const hay = `${wordy(r.fullName)} ${tops} ${desc} ${readme}`;
			const sdf = isSdfOwned(owner) ? 1 : 0;
			const alive = isAlive(r.lastCommitAt) ? 1 : 0;
			// Hard-stale (2026-07-19 answer-key eval): a KNOWN last commit >24
			// months old. Null lastCommitAt stays 0 — unknown is not evidence of
			// death. Demotes 4-year-dead org MVPs below live flagships at equal
			// keyword score (moneygram-access-wallet-mvp above passkey-kit).
			const stale2y =
				r.lastCommitAt &&
				Date.now() - new Date(r.lastCommitAt).getTime() >
					24 * 30.44 * 86_400_000
					? 1
					: 0;
			const mention = hasStellarMention(hay) ? 1 : 0;
			const crank = canonRank.get(r.fullName.toLowerCase()) ?? 9999;
			const frank = flagRank.get(r.fullName.toLowerCase()) ?? 9999;
			// F4 (audit root #4): STELLARNESS ranks above raw keyword score.
			// 2 = proven (code-scanned with a REAL stellarProof, SDF org, or
			//     curated canonical/flagship), 1 = evidenced (stellar/soroban
			//     appears in its own name/topics/desc/readme), 0 = no Stellar
			//     evidence at all (org-swept other-chain repos, general
			//     toolchains). The audit showed tier-0 repos beating
			//     code-verified Stellar repos on 7 verticals purely on
			//     name-token hits — for a Stellar data layer a tier-0 repo is
			//     never the right answer over a tier-1/2 one.
			// sls-047: "scanned" alone is NOT proof — stellarProof "none" means
			// the scan found no Stellar code, so such repos fall through to the
			// mention check (noir-lang/noir was tier-2 via the scanned-check and
			// outranked deployable Stellar ZK repos for q=zero-knowledge).
			const stellarness =
				hasStellarCodeProof(r) || sdf === 1 || crank < 9999 || frank < 9999
					? 2
					: mention === 1
						? 1
						: 0;
			return {
				r,
				topics,
				score,
				matched,
				alias,
				sdf,
				alive,
				stale2y,
				mention,
				stellarness,
				anchorIdentity,
				crank,
				frank,
			};
		});
		// Keep canonical + curated-flagship repos even when they didn't keyword-match.
		// Alias-identity hits too (sls-025): an exact owner/name/path lookup is
		// admitted even when tokenized scoring missed (e.g. a "/" in the query).
		let filtered = tokens.length
			? docs.filter(
					(d) =>
						d.matched >= 1 || d.crank < 9999 || d.frank < 9999 || d.alias > 0,
				)
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
				// Exact alias identity (sls-025) beats everything below the curated
				// floats: when the query IS a repo's owner/name/path, that repo must
				// outrank keyword and semantic neighbors.
				b.alias - a.alias ||
				// Stellar evidence BEFORE raw keyword score (F4): coarse 3-tier so
				// relevance still dominates within a tier.
				b.stellarness - a.stellarness ||
				// Mention-vs-identity ABOVE raw token coverage, BELOW Stellar
				// evidence (#590 port): within a stellarness tier, the repo that
				// IS the anchor thing outranks repos that merely mention it
				// mid-prose plus a secondary token — but identity never lets a
				// no-evidence repo beat a code-verified one (the F4 contract).
				b.anchorIdentity - a.anchorIdentity ||
				b.score - a.score ||
				// Hard-stale demotion, then liveness, BEFORE org authority: a
				// dead SDF MVP must not outrank a live flagship at equal
				// relevance (2026-07-19 answer-key eval — `sdf` deciding before
				// `alive` let 49-month-dead repos ride org ownership).
				a.stale2y - b.stale2y ||
				b.alive - a.alive ||
				b.sdf - a.sdf ||
				b.mention - a.mention ||
				(b.r.repoScore ?? 0) - (a.r.repoScore ?? 0) ||
				(b.r.stars ?? 0) - (a.r.stars ?? 0),
		);
		const total = filtered.length;
		const repos = filtered
			.slice(offset, offset + limit)
			.map(({ r, topics, score, crank, frank, sdf, mention }) => ({
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
				// sls-047: name the evidence tier driving the rank so a consumer
				// can tell a Stellar reference implementation from a general
				// toolchain that merely topic-matched the query.
				stellarEvidence: (hasStellarCodeProof(r)
					? "code-verified"
					: sdf === 1
						? "sdf-org"
						: crank < 9999 || frank < 9999
							? "curated"
							: mention === 1
								? "mentioned"
								: "none") as RepoResult["stellarEvidence"],
				codeVerified: codeVerifiedOf(r),
			}));
		return {
			repos,
			total,
			canonical: repos.filter((r) => r.canonical).map((r) => r.fullName),
			searched,
		};
	} catch {
		return { repos: [], total: 0, canonical: [], searched };
	}
}
