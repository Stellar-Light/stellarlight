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
			const hay = `${r.fullName} ${r.description ?? ""} ${topics.join(" ")} ${r.primaryLanguage ?? ""} ${r.readmeExcerpt ?? ""}`.toLowerCase();
			const score = tokens.length
				? tokens.reduce((s, t) => s + (termsForToken(t).some((v) => hay.includes(v)) ? 1 : 0), 0)
				: 1;
			return { r, topics, score };
		});
		let filtered = tokens.length ? docs.filter((d) => d.score >= 1) : docs;
		if (minScore > 0) filtered = filtered.filter((d) => (d.r.repoScore ?? 0) >= minScore);
		filtered.sort(
			(a, b) =>
				b.score - a.score ||
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
			repoScore: r.repoScore ?? 0,
			repoScoreLabel: r.repoScoreLabel ?? null,
			score,
		}));
		return { repos, total };
	} catch {
		return { repos: [], total: 0 };
	}
}
