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
}

function topicList(topics: unknown): string[] {
	return Array.isArray(topics) ? topics.filter((t): t is string => typeof t === "string") : [];
}

// A query token matches if ANY of its expansions hits the repo's text.
const SYNONYMS: Record<string, string[]> = {
	zk: ["zk", "zero-knowledge", "zero knowledge", "zkp", "snark", "stark", "plonk", "groth16", "circuit", "proof"],
	zkp: ["zkp", "zk", "zero-knowledge", "proof"],
	oracle: ["oracle", "price feed", "data feed", "datafeed"],
	amm: ["amm", "dex", "liquidity", "swap"],
	dex: ["dex", "amm", "swap", "exchange", "orderbook"],
	wallet: ["wallet", "keypair", "signer", "passkey"],
	nft: ["nft", "non-fungible", "collectible"],
	rwa: ["rwa", "real-world asset", "real world asset", "tokenization", "tokenized"],
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
		re = new RegExp(`(?:\\b${esc}|${esc}\\b)`);
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

export async function searchRepos(
	payload: PayloadLike | null,
	q: string,
	opts: { limit?: number; offset?: number; language?: string; minScore?: number } = {},
): Promise<{ repos: RepoResult[]; total: number }> {
	const { limit = 20, offset = 0, language = "", minScore = 0 } = opts;
	if (!payload) return { repos: [], total: 0 };
	try {
		const res = await payload.find({
			collection: "repos",
			where: language ? { primaryLanguage: { like: language } } : {},
			limit: 2000,
			depth: 0,
		});
		const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
		const docs = (res.docs as unknown as RepoDoc[]).map((r) => {
			const topics = topicList(r.topics);
			// Field-weighted relevance: WHERE a term hits matters more than that it
			// hits at all. name/topics (5) > description/language (3) > README-only
			// (1), so a repo that's actually ABOUT the query outranks one that merely
			// mentions it once in a README. name and topics share a weight on purpose
			// — that way an org-name substring ("zk" in "zkbricks") can't beat a real
			// topic match, and ties fall through to the repoScore quality grade below,
			// which keeps flagship repos (noir for zk) leading. Multi-term coverage
			// is rewarded so a repo matching the whole query beats a partial match.
			const name = wordy(r.fullName);
			const tops = wordy(topics.join(" "));
			const desc = wordy(`${r.description ?? ""} ${r.primaryLanguage ?? ""}`);
			const readme = wordy(r.readmeExcerpt ?? "");
			let score = 0;
			let matched = 0;
			if (tokens.length) {
				for (const t of tokens) {
					const vs = termsForToken(t);
					const hit = (hay: string) => termHits(vs, hay);
					let best = 0;
					if (hit(name) || hit(tops)) best = 5;
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
			const hay = `${name} ${tops} ${desc}`;
			const sdf = isSdfOwned(owner) ? 1 : 0;
			const alive = isAlive(r.lastCommitAt) ? 1 : 0;
			const mention = hasStellarMention(hay) ? 1 : 0;
			return { r, topics, score, matched, sdf, alive, mention };
		});
		let filtered = tokens.length ? docs.filter((d) => d.matched >= 1) : docs;
		if (minScore > 0) filtered = filtered.filter((d) => (d.r.repoScore ?? 0) >= minScore);
		// Sort order, most → least decisive: query relevance, SDF-org ownership,
		// alive (committed within a year), explicit stellar/soroban mention, THEN
		// the authority grade and stars. Putting these signals ABOVE repoScore
		// stops an off-topic but high-authority repo (an SCF-funded multi-chain
		// tool, or a long-dead flagship) from outranking the canonical, live
		// Stellar match at the same relevance.
		filtered.sort(
			(a, b) =>
				b.score - a.score ||
				b.sdf - a.sdf ||
				b.alive - a.alive ||
				b.mention - a.mention ||
				(b.r.repoScore ?? 0) - (a.r.repoScore ?? 0) ||
				(b.r.stars ?? 0) - (a.r.stars ?? 0),
		);
		const total = filtered.length;
		const repos = filtered.slice(offset, offset + limit).map(({ r, topics, score }) => ({
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
			project: r.projectSlug ? { slug: r.projectSlug, name: r.projectName ?? null } : null,
			hackathonWinner: !!r.hackathonWinner,
			scfAwarded: !!r.scfAwarded,
			builderReputation: r.builderReputation ?? 0,
			judgeScore: r.judgeScore ?? null,
			judgedHackathon: r.judgedHackathon ?? null,
			repoScore: r.repoScore ?? 0,
			repoScoreLabel: r.repoScoreLabel ?? null,
			score,
		}));
		return { repos, total };
	} catch {
		return { repos: [], total: 0 };
	}
}
