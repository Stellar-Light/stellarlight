/**
 * Which contract joins which project row, and which repo a contract's use
 * rolls up to. Pure, so the rules are tested apart from the lane that reads
 * the network (scripts/data/enrich-onchain-projects.ts).
 *
 * A repo is linked to a project row by its organisation, and an organisation
 * can have more than one product: a repo's own contract is not always the
 * contract of the row it is linked to (PayLoop's under the WebSoroban IDE
 * row, AgentSmith's under 57blocks' timelock row, the CredioLabs policy
 * builder's under Untangled's). Nothing mechanical tells those apart, so a
 * curator names the contract and the join holds it back.
 */
import { isOwnContract } from "./contract-basis";

/** Every contract (C...) or account (G...) address a text names. */
export function addressesIn(text: string | null | undefined): Set<string> {
	return new Set(text?.match(/\b[CG][A-Z2-7]{55}\b/g) ?? []);
}

export interface RepoContractRow {
	fullName?: string | null;
	projectSlug?: string | null;
	mainnetContractId?: string | null;
	mainnetContractBasis?: string | null;
	codeScanState?: string | null;
}

export interface RepoContractJoin {
	slug: string;
	address: string;
	repo: string;
	/** Set only where the scan proved the repo's own source defines the
	 * contract: the repo whose code is in use. A docs or frontend repo that
	 * names its team's contract (sibling-matched, or not judged yet) joins
	 * the contract to the project and runs no code on chain itself. */
	sourceRepo?: string;
}

/**
 * The contracts the code scan proved to be a repo's own, joined to the row
 * the repo is linked to, under the rule the deployment pass uses: an id the
 * scan judged cited is a contract the repo calls, a repo GitHub answers 404
 * for is no source, and a contract a hand-verified seed gives to one row is
 * never another's.
 *
 * heldBack(slug) is the set of addresses a curator said are not that row's.
 * An id the repos of two rows both hold, after that, joins to neither: one
 * contract cannot be two projects' own.
 */
export function repoContractJoins(
	rows: readonly RepoContractRow[],
	opts: {
		seedOwner: ReadonlyMap<string, string>;
		heldBack: (slug: string) => ReadonlySet<string>;
	},
): {
	joins: RepoContractJoin[];
	retracted: RepoContractJoin[];
	shared: Array<RepoContractJoin & { slugs: string[] }>;
} {
	const candidates: RepoContractJoin[] = [];
	const retracted: RepoContractJoin[] = [];
	for (const r of rows) {
		const { mainnetContractId: address, projectSlug: slug, fullName: repo } = r;
		if (!address || !slug || !repo) continue;
		if (r.codeScanState === "gone" || !isOwnContract(r.mainnetContractBasis))
			continue;
		const owner = opts.seedOwner.get(address);
		if (owner && owner !== slug) continue;
		const join: RepoContractJoin = {
			slug,
			address,
			repo,
			...(r.mainnetContractBasis === "self-validated" ||
			r.mainnetContractBasis === "source-matched"
				? { sourceRepo: repo }
				: {}),
		};
		if (opts.heldBack(slug).has(address)) retracted.push(join);
		else candidates.push(join);
	}
	const slugsOf = new Map<string, Set<string>>();
	for (const c of candidates)
		slugsOf.set(c.address, (slugsOf.get(c.address) ?? new Set()).add(c.slug));
	const joins: RepoContractJoin[] = [];
	const shared: Array<RepoContractJoin & { slugs: string[] }> = [];
	for (const c of candidates) {
		const slugs = [...(slugsOf.get(c.address) ?? [])].sort();
		// A seeded contract has one owner by hand; the seed settles it.
		if (slugs.length > 1 && !opts.seedOwner.has(c.address))
			shared.push({ ...c, slugs });
		else joins.push(c);
	}
	return { joins, retracted, shared };
}

/** owner/name in a GitHub URL, or null. */
export function repoInUrl(url: unknown): string | null {
	return typeof url === "string"
		? (url.match(/github\.com\/([^/]+\/[^/.][^/]*?)(?:\.git)?(?:\/|$)/)?.[1] ??
				null)
		: null;
}

/**
 * What the lane knows about one contract's source repo.
 *   attested   the repo its deployed WASM is attested to; null when the code
 *              was read and names none; undefined when the code could not be
 *              read (the RPC did not list it, or a read failed).
 *   curatedRepo a hand-verified seed names it (a WASM built without build
 *              metadata has nothing for an attestation to check).
 *   sourceRepo  a seed names it, or the scan proved the repo's source
 *              defines the contract.
 *   stored      the verifiedRepo the row already holds.
 */
export interface SourceEvidence {
	attested: string | null | undefined;
	curatedRepo?: string;
	sourceRepo?: string;
	stored?: unknown;
}

const urlOf = (repo: string) => `https://github.com/${repo}`;

/** The served verifiedRepo: attested, else the seed's. Where the code could
 * not be read, the value the row already holds is kept: a read that did not
 * happen says nothing about the source. */
export function verifiedRepoOf(e: SourceEvidence): string | null {
	if (e.attested) return urlOf(e.attested);
	if (e.curatedRepo) return urlOf(e.curatedRepo);
	if (e.attested === undefined)
		return typeof e.stored === "string" && e.stored ? e.stored : null;
	return null;
}

/** The repo a contract's use rolls up to, lowercase, or null. The served
 * verifiedRepo wins (an attestation outranks what a scan inferred: a docs
 * repo can name a contract whose build names the contracts repo), then the
 * repo a seed names or the scan proved. */
export function rollupRepoOf(e: SourceEvidence): string | null {
	const repo = repoInUrl(verifiedRepoOf(e)) ?? e.sourceRepo ?? null;
	return repo ? repo.toLowerCase() : null;
}
