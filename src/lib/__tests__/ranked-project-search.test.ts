/**
 * The directory's search box (rankedProjectSearch) admits rows by type when
 * the query names one. It kept its own copy of the type list, which stopped
 * at Faucet, so Card Issuing, Exchange, Oracle, Yield and Derivatives were
 * unknown to it. It reads PROJECT_TYPES now (sls-113 review, 2026-11-07).
 */
import { describe, expect, it } from "vitest";
import { PROJECT_TYPES } from "../project-types";
import { rankedProjectSearch } from "../search/ranked-project-search";

type Where = { or: Array<{ types?: { in: string[] } }> };

/** The types the box's database query admits for this query. */
async function admittedTypes(query: string): Promise<string[]> {
	let where: Where | undefined;
	const payload = {
		find: async (args: { where: Where }) => {
			where = args.where;
			return { docs: [] };
		},
	};
	await rankedProjectSearch(payload as never, { query, page: 1, limit: 10 });
	return where?.or.find((c) => c.types)?.types?.in ?? [];
}

describe("the directory search box knows every project type", () => {
	it("a query for derivatives reaches the Derivatives type", async () => {
		expect(await admittedTypes("derivatives")).toContain("Derivatives");
	});
	it("every PROJECT_TYPES member is reachable by its own name", async () => {
		for (const t of PROJECT_TYPES)
			expect(await admittedTypes(t.toLowerCase()), t).toContain(t);
	});
});
