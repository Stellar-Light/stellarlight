import type { Payload } from "payload";

interface RankedSearchOptions {
	query: string;
	typeFilter?: string;
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

/**
 * Ranked search for projects by name and GitHub org.
 *
 * Descriptions are intentionally excluded — they pull in too much noise
 * (e.g. searching "blend" would return every project that mentions "blend"
 * anywhere in its description).
 *
 * Ranking: name startsWith > name contains > org-only match
 */
export async function rankedProjectSearch(
	payload: Payload,
	options: RankedSearchOptions,
): Promise<SearchResult> {
	const { query, typeFilter, page, limit, sort = "name" } = options;

	const baseWhere: any = {
		status: {
			in: ["Development", "Pre-Release", "Live"],
		},
	};

	if (typeFilter && typeFilter !== "all") {
		// Handle legacy "Payment Rail" → "Payments" rename in DB
		const typeValues = typeFilter === "Payments"
			? ["Payments", "Payment Rail"]
			: [typeFilter];
		baseWhere.types = { in: typeValues };
	}

	const where = {
		...baseWhere,
		or: [
			{ name: { contains: query } },
			{ "github.orgLogin": { contains: query } },
		],
	};

	const results = await payload.find({
		collection: "projects",
		where,
		limit: 0,
		depth: 1,
		sort,
	});

	// Rank: name startsWith > name contains > org-only
	const lowerQuery = query.toLowerCase();
	const sorted = [...results.docs].sort((a, b) => {
		const aName = a.name?.toLowerCase() || "";
		const bName = b.name?.toLowerCase() || "";

		const aScore = aName.startsWith(lowerQuery) ? 2
			: aName.includes(lowerQuery) ? 1
			: 0;
		const bScore = bName.startsWith(lowerQuery) ? 2
			: bName.includes(lowerQuery) ? 1
			: 0;

		return bScore - aScore;
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
