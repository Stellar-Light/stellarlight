import type { Payload } from "payload";

interface RankedSearchOptions {
	query: string;
	typeFilter?: string;
	scfFilter?: string;
	page: number;
	limit: number;
	sort?: string;
}

interface SearchResult {
	docs: any[];
	totalDocs: number;
	totalPages: number;
	page: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
}

/** Apply type filter to a Payload where clause */
function applyTypeFilter(baseWhere: any, typeFilter?: string) {
	if (!typeFilter || typeFilter === "all") return;

	const typeValues =
		typeFilter === "Payments" ? ["Payments", "Payment Rail"] : [typeFilter];
	baseWhere.types = { in: typeValues };
}

/** Apply SCF filter to a Payload where clause (combinable with type) */
function applyScfFilter(baseWhere: any, scfFilter?: string) {
	if (!scfFilter) return;

	baseWhere["scf.awarded"] = { equals: true };
	if (scfFilter !== "all") {
		const round = parseInt(scfFilter, 10);
		if (!isNaN(round)) {
			baseWhere["scf.awardedRounds"] = { in: [round] };
		}
	}
}

/**
 * Ranked search for projects by name and GitHub org.
 *
 * Descriptions are intentionally excluded — they pull in too much noise
 * (e.g. searching "blend" would return every project that mentions "blend"
 * anywhere in its description).
 *
 * Ranking: name startsWith > name contains > org-only match
 */
/** Option values of the projects.types / projects.category selects (see src/collections/Projects.ts). */
const PROJECT_TYPES = [
	"Wallet",
	"DEX",
	"Lending",
	"Bridge",
	"Infrastructure",
	"Payments",
	"Anchor",
	"SDK",
	"Indexer",
	"Explorer",
	"Analytics",
	"AI",
	"Gaming",
	"Education",
	"Security",
	"NFT",
	"RWA",
	"Stablecoin",
	"Social Impact",
	"RPC",
	"Faucet",
];
const PROJECT_CATEGORIES = [
	"Infrastructure",
	"Tooling",
	"Partner Integration",
	"User-Facing App",
	"Asset",
	"Protocol/Contract",
	"Anchor",
];

export async function rankedProjectSearch(
	payload: Payload,
	options: RankedSearchOptions,
): Promise<SearchResult> {
	const { query, typeFilter, scfFilter, page, limit, sort = "name" } = options;

	const baseWhere: any = {
		status: {
			in: ["Development", "Pre-Release", "Live"],
		},
	};

	applyTypeFilter(baseWhere, typeFilter);
	applyScfFilter(baseWhere, scfFilter);

	// Match on what a visitor means, not only the name: "wallet" must find
	// Lobstr and Freighter (type Wallet, description "wallet") ahead of
	// "walletban" and "wallet-guru" (name substrings). Before this the box
	// searched name + GitHub org only and hid every flagship wallet.
	// `types` and `category` are select fields: Payload rejects `contains` on
	// them (the whole find threw and the box said "No projects found" for every
	// query for ~40 minutes on 2026-08-17). Match them by option value instead.
	const q = query.trim().toLowerCase();
	const typeHits = PROJECT_TYPES.filter(
		(t) => t.toLowerCase().includes(q) || q.includes(t.toLowerCase()),
	);
	const categoryHits = PROJECT_CATEGORIES.filter(
		(c) => c.toLowerCase().includes(q) || q.includes(c.toLowerCase()),
	);
	const where = {
		...baseWhere,
		or: [
			{ name: { contains: query } },
			{ "github.orgLogin": { contains: query } },
			{ description: { contains: query } },
			...(typeHits.length ? [{ types: { in: typeHits } }] : []),
			...(categoryHits.length ? [{ category: { in: categoryHits } }] : []),
		],
	};

	const results = await payload.find({
		collection: "projects",
		where,
		limit: 0,
		depth: 1,
		sort,
	});

	// Rank: exact/leading name > name contains > type or category match >
	// description mention; within a tier, curated prominence (the same boost
	// /api/projects/search uses) so canonical projects lead incidental ones.
	const lowerQuery = query.toLowerCase();
	const tier = (p: any) => {
		const name = String(p.name ?? "").toLowerCase();
		if (name === lowerQuery || name.startsWith(lowerQuery)) return 4;
		if (name.includes(lowerQuery)) return 3;
		const types = Array.isArray(p.types)
			? p.types.map((t: unknown) => String(t).toLowerCase())
			: [];
		if (
			types.some((t: string) => t.includes(lowerQuery)) ||
			String(p.category ?? "")
				.toLowerCase()
				.includes(lowerQuery)
		)
			return 2;
		return 1;
	};
	const sorted = [...results.docs].sort((a: any, b: any) => {
		const dt = tier(b) - tier(a);
		if (dt !== 0) return dt;
		return Number(b.prominence ?? 0) - Number(a.prominence ?? 0);
	});

	const totalDocs = sorted.length;
	const totalPages = Math.ceil(totalDocs / limit) || 1;
	const start = (page - 1) * limit;

	return {
		docs: sorted.slice(start, start + limit),
		totalDocs,
		totalPages,
		page,
		hasNextPage: page < totalPages,
		hasPrevPage: page > 1,
	};
}
