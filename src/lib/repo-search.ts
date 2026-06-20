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

// SDF / canonical Stellar orgs — for a Stellar query their repos are the
// authoritative answer, so they win ties over community/generic repos.
const SDF_OWNERS = new Set([
	"stellar",
	"soroban",
	"stellar-deprecated",
	"stellardevelopmentfoundation",
]);

// Stellar-nativeness of a repo (0–3). Used as a tiebreak ABOVE the authority
// grade so a canonical Stellar repo can't be buried by an off-topic but
// higher-authority (e.g. SCF-funded, multi-chain) repo at the same relevance.
function stellarSignal(owner: string, hay: string, projectSlug?: string | null): number {
	if (SDF_OWNERS.has(owner)) return 3;
	if (projectSlug) return 2; // linked to a curated Stellar project
	if (/\bstellar\b/.test(hay) || /\bsoroban\b/.test(hay)) return 1;
	return 0;
}

// Recency bucket (0–2). Tiebreak ABOVE authority so a long-dead repo can't sit
// above a freshly-active one of equal relevance + Stellar-nativeness.
function freshSignal(lastCommitAt?: string | null): number {
	if (!lastCommitAt) return 0;
	const days = (Date.now() - Date.parse(lastCommitAt)) / 86_400_000;
	if (!Number.isFinite(days)) return 0;
	return days <= 180 ? 2 : days <= 365 ? 1 : 0;
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
			const name = r.fullName.toLowerCase();
			const tops = topics.join(" ").toLowerCase();
			const desc = `${r.description ?? ""} ${r.primaryLanguage ?? ""}`.toLowerCase();
			const readme = (r.readmeExcerpt ?? "").toLowerCase();
			let score = 0;
			let matched = 0;
			if (tokens.length) {
				for (const t of tokens) {
					const vs = termsForToken(t);
					const hit = (hay: string) => vs.some((v) => hay.includes(v));
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
			const owner = name.split("/")[0];
			const stellar = stellarSignal(owner, `${name} ${tops} ${desc}`, r.projectSlug);
			const fresh = freshSignal(r.lastCommitAt);
			return { r, topics, score, matched, stellar, fresh };
		});
		let filtered = tokens.length ? docs.filter((d) => d.matched >= 1) : docs;
		if (minScore > 0) filtered = filtered.filter((d) => (d.r.repoScore ?? 0) >= minScore);
		// Sort order, most → least decisive: query relevance, then Stellar-
		// nativeness, then recency, THEN the authority grade. Putting stellar +
		// freshness ABOVE repoScore stops an off-topic but high-authority repo
		// (an SCF-funded multi-chain tool, or a long-dead flagship) from
		// outranking the canonical, live Stellar match at the same relevance.
		filtered.sort(
			(a, b) =>
				b.score - a.score ||
				b.stellar - a.stellar ||
				b.fresh - a.fresh ||
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
