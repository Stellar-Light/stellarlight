import { describe, expect, it } from "vitest";
import { verifyWrites } from "../read-back";

describe("verifyWrites confirm-missing", () => {
	it("re-checks a bulk row-not-found individually before accusing", async () => {
		const sent = new Map([["a/b", { x: 1 }]]);
		// bulk read misses the row (the 310-artifact class of 2026-08-13)…
		const bulk = async () => new Map<string, Record<string, unknown>>();
		// …but the individual confirm finds it, matching what was sent
		const one = async () => ({ x: 1 });
		const m = await verifyWrites(sent, bulk, ["x"], 200, one);
		expect(m).toEqual([]);
	});

	it("a row missing from bulk AND individual is a real finding", async () => {
		const sent = new Map([["a/b", { x: 1 }]]);
		const bulk = async () => new Map<string, Record<string, unknown>>();
		const one = async () => null;
		const m = await verifyWrites(sent, bulk, ["x"], 200, one);
		expect(m.length).toBe(1);
		expect(m[0].field).toBe("(row)");
	});

	it("an individually-confirmed row still diffs its fields honestly", async () => {
		const sent = new Map([["a/b", { x: 1 }]]);
		const bulk = async () => new Map<string, Record<string, unknown>>();
		const one = async () => ({ x: 2 }); // found, but the value is wrong
		const m = await verifyWrites(sent, bulk, ["x"], 200, one);
		expect(m.length).toBe(1);
		expect(m[0].field).toBe("x");
	});
});
