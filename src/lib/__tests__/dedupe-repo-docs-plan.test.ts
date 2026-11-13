/**
 * dedupe-repo-docs' dry run reported "WOULD: merged N group(s)" with N = the
 * number of groups, while an execute updates a keeper only when it has a
 * field to promote. The dry run now counts what an execute would count.
 */
import { describe, expect, it } from "vitest";
import {
	fillOmitted,
	planGroup,
	plannedCounts,
} from "../../../scripts/data/dedupe-repo-docs";

describe("plannedCounts", () => {
	it("counts a merge only where a field is promoted", () => {
		const plans = [
			// keeper lacks a description its twin has: one merge, one delete
			planGroup([
				{ id: "a", fullName: "o/R", codeScanState: "scanned" },
				{ id: "b", fullName: "o/r", description: "a repo" },
			]),
			// nothing to promote: no merge, still one delete
			planGroup([
				{ id: "c", fullName: "p/Q", codeScanState: "scanned", topics: ["x"] },
				{ id: "d", fullName: "p/q" },
			]),
		];
		expect(plans[0].keeper.id).toBe("a");
		expect(plans[0].promote).toEqual({ description: "a repo" });
		expect(plans[1].promote).toEqual({});
		expect(plannedCounts(plans)).toEqual({ merge: 1, delete: 2 });
	});
});

describe("fields the bulk listing omits", () => {
	it("readmeExcerpt is read back for a group and promoted", async () => {
		// As listed: the bulk find leaves readmeExcerpt out of every doc.
		const group: Array<Record<string, unknown>> = [
			{ id: "a", fullName: "o/R", codeScanState: "scanned" },
			{ id: "b", fullName: "o/r" },
		];
		const stored: Record<string, string> = { b: "README of o/r" };
		const payload = {
			find: async ({ where }: { where: { id: { in: string[] } } }) => ({
				docs: where.id.in.map((id) => ({
					id,
					readmeExcerpt: stored[id] ?? null,
				})),
			}),
		} as unknown as Parameters<typeof fillOmitted>[0];
		await fillOmitted(payload, group);
		expect(planGroup(group).promote).toEqual({
			readmeExcerpt: "README of o/r",
		});
	});
});
