import { describe, expect, it } from "vitest";
import { findWholeSet } from "@/lib/whole-set";

// A double that pages the way Payload 3's mongo adapter does: limit 0
// returns every row and skips the count; a positive limit returns that many
// and, with pagination on, counts every match in totalDocs. With pagination
// off it caps without counting, which is why the helper always turns it on.
// With an empty filter the adapter counts with estimatedDocumentCount, the
// collection's metadata, which can trail the rows: here it is 2 high.
const rows = Array.from({ length: 7 }, (_, i) => ({ id: i }));
const calls: Array<Record<string, unknown>> = [];
const payload = {
	find: async (args: {
		limit?: number;
		pagination?: boolean;
		where?: Record<string, unknown>;
	}) => {
		calls.push(args);
		const limit = args.limit ?? 10;
		const docs = limit === 0 ? rows : rows.slice(0, limit);
		const estimated = !args.where || Object.keys(args.where).length === 0;
		return {
			docs,
			totalDocs:
				limit === 0 || args.pagination === false
					? docs.length
					: estimated
						? rows.length + 2
						: rows.length,
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

	it("counts exactly with no filter, never from the estimate", async () => {
		const r = await findWholeSet(payload, {
			collection: "hackathons",
			limit: 300,
		});
		expect(r).toMatchObject({ totalDocs: 7, complete: true });
		const where = calls[calls.length - 1]?.where as Record<string, unknown>;
		expect(Object.keys(where ?? {}).length).toBeGreaterThan(0);
	});

	it("keeps the caller's filter when it adds the exact-count clause", async () => {
		await findWholeSet(payload, {
			collection: "repos",
			where: { owner: { equals: "dev" } },
			limit: 10,
		});
		expect(JSON.stringify(calls[calls.length - 1]?.where)).toContain(
			'{"owner":{"equals":"dev"}}',
		);
	});

	it("reads every row with limit 0", async () => {
		const r = await findWholeSet(payload, { collection: "repos", limit: 0 });
		expect(r).toMatchObject({ totalDocs: 7, complete: true });
	});
});
