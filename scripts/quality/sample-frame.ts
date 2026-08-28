/**
 * The measurement frame for every /quality number about entities.
 *
 * WHY THIS FILE EXISTS. Both quality scripts used to build their own sample by
 * firing a hand-picked list of search terms at /api/projects/search and taking
 * the union. That had two defects, and they compound:
 *
 *  1. The sample frame WAS the system under test. A row the search engine
 *     fails to return was structurally excluded from the quality measurement,
 *     including the exact recall-miss class that is our largest open bucket.
 *     A pure ranking change moved the headline score with zero data change.
 *  2. The two scripts used DIFFERENT term lists (one had anchor/nft/rwa, the
 *     other had game), so the dashboard published two irreconcilable answers
 *     to "how many human-verified rows do we have", three apart, unlabelled.
 *
 * Both are fixed the same way: enumerate the collection directly, take every
 * row, and share one module. /api/projects and /api/repos are the unranked
 * Payload listing endpoints, so nothing about retrieval quality can move these
 * denominators. This is a CENSUS, not a sample, and the callers say so.
 */

const UA = { "User-Agent": "stellarlight-quality-frame" };
const PAGE = 500;

export const FRAME_METHOD =
	"Census, not a sample. Every row is enumerated from the unranked Payload listing endpoint (/api/projects, /api/repos), so search ranking cannot move these counts and no row can be excluded by being hard to retrieve.";

type Page<T> = { docs?: T[]; totalDocs?: number; hasNextPage?: boolean };

async function census<T>(
	path: string,
	select: string[],
	origin: string,
): Promise<{ rows: T[]; total: number }> {
	const sel = select.map((f) => `select[${f}]=true`).join("&");
	const rows: T[] = [];
	let total = 0;
	for (let page = 1; ; page++) {
		const url = `${origin}${path}?limit=${PAGE}&page=${page}&${sel}`;
		const d = (await (await fetch(url, { headers: UA })).json()) as Page<T>;
		const docs = d.docs ?? [];
		total = d.totalDocs ?? total;
		rows.push(...docs);
		if (!d.hasNextPage || docs.length === 0) break;
		// Belt and braces: never loop forever if the API stops paginating.
		if (page > 200) break;
	}
	return { rows, total };
}

export type CensusProject = {
	slug?: string;
	name?: string;
	status?: string;
	statusBasis?: string;
	statusAsOf?: string;
	statusSourceUrl?: string;
	types?: string[];
	links?: { website?: string; github?: string };
	prominence?: number;
	deployment?: { network?: string | null; basis?: string | null } | null;
};

export type CensusRepo = {
	fullName?: string;
	repoScore?: number;
	tier?: string | null;
	source?: string | null;
	knowledgeNotes?: unknown[];
	codeDepth?: number | null;
	/** the RAW collection's mainnet join — the search API serializes this as
	 * codeInUse.contracts, and reading the serialized name against raw rows
	 * silently produced 2/12938 where the truth was 76 */
	mainnetContractId?: string | null;
	isDeployableContract?: boolean | null;
	lastCommitAt?: string | null;
	isArchived?: boolean;
	primaryLanguage?: string | null;
	projectSlug?: string | null;
};

export const censusProjects = (origin = "https://stellarlight.xyz") =>
	census<CensusProject>(
		"/api/projects",
		[
			"slug",
			"name",
			"status",
			"statusBasis",
			"statusAsOf",
			"statusSourceUrl",
			"types",
			"links",
			"prominence",
			"deployment",
		],
		origin,
	);

export const censusRepos = (origin = "https://stellarlight.xyz") =>
	census<CensusRepo>(
		"/api/repos",
		[
			"fullName",
			"repoScore",
			"tier",
			"source",
			"knowledgeNotes",
			"codeDepth",
			"mainnetContractId",
			"isDeployableContract",
			"lastCommitAt",
			"isArchived",
			"primaryLanguage",
			"projectSlug",
		],
		origin,
	);
