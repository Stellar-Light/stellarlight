import { describe, expect, it } from "vitest";
import { findWholeSet } from "@/lib/whole-set";

// A double that pages the way Payload 3 does: limit 0 returns every row and
// skips the count; a positive limit returns that many and, with pagination
// on, counts every match in totalDocs. With pagination off it caps without
// counting, which is why the helper always turns it on.
const rows = Array.from({ length: 7 }, (_, i) => ({ id: i }));
const calls: Array<Record<string, unknown>> = [];
const payload = {
	find: async (args: { limit?: number; pagination?: boolean }) => {
		calls.push(args);
		const limit = args.limit ?? 10;
		const docs = limit === 0 ? rows : rows.slice(0, limit);
		return {
			docs,
			totalDocs:
				limit === 0 || args.pagination === false ? docs.length : rows.length,
		};
	},
} as unknown as Parameters<typeof findWholeSet>[0];

describe("findWholeSet", () => {
	it("is complete when the ceiling holds every match", async () => {
		const r = await findWholeSet(payload, { collection: "repos", limit: 10 });
		expect(r).toMatchObject({ totalDocs: 7, complete: true });
		expect(r.docs).toHaveLength(7);
	});

	it("says a set that outgrew its ceiling was cut, with the true count", async () => {
		const r = await findWholeSet(payload, {
			collection: "repos",
			limit: 5,
			pagination: false,
		});
		expect(r).toMatchObject({ totalDocs: 7, complete: false });
		expect(r.docs).toHaveLength(5);
		// pagination forced on, so the database counts every match
		expect(calls[calls.length - 1]?.pagination).toBe(true);
	});

	it("reads every row with limit 0", async () => {
		const r = await findWholeSet(payload, { collection: "repos", limit: 0 });
		expect(r).toMatchObject({ totalDocs: 7, complete: true });
	});
});
