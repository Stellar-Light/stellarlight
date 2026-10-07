import { describe, expect, it } from "vitest";
import {
	diffWritten,
	formatMismatches,
	verifyWrites,
} from "../utils/read-back";

/** Lessons class 20/32 + #615. These assert the cases that actually bit us:
 * a silently-dropped key, a row that vanished, and the false alarms that would
 * make a read-back too noisy to keep (date formats, Payload's own fields). */
describe("diffWritten", () => {
	const FIELDS = ["tvlUSD", "tvlAsOf", "llamaSlugs", "tvlSource"] as const;

	it("catches the #615 silent drop — update() resolved, field never persisted", () => {
		const sent = { tvlUSD: 1_234_567, tvlAsOf: "2026-07-26T12:00:00.000Z" };
		const stored = { tvlUSD: null, tvlAsOf: "2026-07-26T12:00:00.000Z" };
		const out = diffWritten("blend", sent, stored, FIELDS);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			key: "blend",
			field: "tvlUSD",
			expected: 1_234_567,
			actual: null,
		});
	});

	it("reports a row that is not there at all", () => {
		const out = diffWritten("ghost", { tvlUSD: 1 }, null, FIELDS);
		expect(out).toHaveLength(1);
		expect(out[0].field).toBe("(row)");
		expect(out[0].actual).toBe("not found");
	});

	it("passes when the write actually landed", () => {
		const sent = {
			tvlUSD: 42,
			tvlAsOf: "2026-07-26T12:00:00.000Z",
			llamaSlugs: ["blend-pools"],
			tvlSource: "defillama",
		};
		expect(diffWritten("blend", sent, { ...sent }, FIELDS)).toEqual([]);
	});

	// The false alarms that would get a read-back deleted within a week.
	it("does not flag a date that round-trips as a Date object", () => {
		const iso = "2026-07-26T12:00:00.000Z";
		const out = diffWritten(
			"x",
			{ tvlAsOf: iso },
			{ tvlAsOf: new Date(iso) },
			FIELDS,
		);
		expect(out).toEqual([]);
	});

	it("does not flag the same instant in a different ISO format", () => {
		const out = diffWritten(
			"x",
			{ tvlAsOf: "2026-07-26T12:00:00.000Z" },
			{ tvlAsOf: "2026-07-26T12:00:00Z" },
			FIELDS,
		);
		expect(out).toEqual([]);
	});

	it("does flag a genuinely different instant", () => {
		const out = diffWritten(
			"x",
			{ tvlAsOf: "2026-07-26T12:00:00.000Z" },
			{ tvlAsOf: "2026-07-25T12:00:00.000Z" },
			FIELDS,
		);
		expect(out).toHaveLength(1);
	});

	it("ignores fields the writer did not send this run", () => {
		// Conditional writes must not report phantom mismatches.
		const out = diffWritten(
			"x",
			{ tvlUSD: 5 },
			{ tvlUSD: 5, tvlSource: null },
			FIELDS,
		);
		expect(out).toEqual([]);
	});

	it("ignores keys outside the verified set", () => {
		const out = diffWritten(
			"x",
			{ tvlUSD: 5, somethingElse: "sent" },
			{ tvlUSD: 5, somethingElse: "different" },
			FIELDS,
		);
		expect(out).toEqual([]);
	});

	it("compares arrays by value and order", () => {
		expect(
			diffWritten(
				"x",
				{ llamaSlugs: ["a", "b"] },
				{ llamaSlugs: ["a", "b"] },
				FIELDS,
			),
		).toEqual([]);
		expect(
			diffWritten(
				"x",
				{ llamaSlugs: ["a", "b"] },
				{ llamaSlugs: ["b", "a"] },
				FIELDS,
			),
		).toHaveLength(1);
		expect(
			diffWritten("x", { llamaSlugs: ["a"] }, { llamaSlugs: [] }, FIELDS),
		).toHaveLength(1);
	});

	it("treats null and undefined as the same absence", () => {
		expect(
			diffWritten("x", { tvlSource: undefined }, { tvlSource: null }, FIELDS),
		).toEqual([]);
	});

	it("does not flag Payload's own added fields on a nested object", () => {
		const out = diffWritten(
			"x",
			{ tvlSource: { name: "defillama" } },
			{ tvlSource: { name: "defillama", id: "abc", updatedAt: "2026-07-26" } },
			FIELDS,
		);
		expect(out).toEqual([]);
	});

	it("still flags a nested value the writer sent that came back changed", () => {
		const out = diffWritten(
			"x",
			{ tvlSource: { name: "defillama" } },
			{ tvlSource: { name: "other" } },
			FIELDS,
		);
		expect(out).toHaveLength(1);
	});
});

describe("formatMismatches", () => {
	it("states the true count even when it truncates", () => {
		const many = Array.from({ length: 14 }, (_, i) => ({
			key: `p${i}`,
			field: "tvlUSD",
			expected: i,
			actual: null,
		}));
		const s = formatMismatches(many, 10);
		expect(s).toContain("…and 4 more");
		expect(s.split("\n").filter((l) => l.includes("tvlUSD"))).toHaveLength(10);
	});
});

describe("verifyWrites", () => {
	const FIELDS = ["repoScore", "projectSlug"] as const;
	const store = (rows: Record<string, Record<string, unknown>>) => {
		const calls: string[][] = [];
		const fn = async (keys: string[]) => {
			calls.push(keys);
			return new Map(
				keys.filter((k) => k in rows).map((k) => [k, rows[k]] as const),
			);
		};
		return { fn, calls };
	};

	it("returns nothing when every row holds what was sent", async () => {
		const sent = new Map([["a/b", { repoScore: 7, projectSlug: "blend" }]]);
		const { fn } = store({ "a/b": { repoScore: 7, projectSlug: "blend" } });
		expect(await verifyWrites(sent, fn, FIELDS)).toEqual([]);
	});

	it("catches a value the store did not keep", async () => {
		const sent = new Map([["a/b", { repoScore: 7, projectSlug: "blend" }]]);
		const { fn } = store({ "a/b": { repoScore: null, projectSlug: "blend" } });
		const out = await verifyWrites(sent, fn, FIELDS);
		expect(out).toHaveLength(1);
		expect(out[0]).toMatchObject({
			key: "a/b",
			field: "repoScore",
			actual: null,
		});
	});

	it("catches a row that is missing entirely", async () => {
		const sent = new Map([["gone/repo", { repoScore: 1 }]]);
		const { fn } = store({});
		const out = await verifyWrites(sent, fn, FIELDS);
		expect(out).toHaveLength(1);
		expect(out[0].field).toBe("(row)");
	});

	it("pages the re-read instead of one unbounded query", async () => {
		const rows: Record<string, Record<string, unknown>> = {};
		const sent = new Map<string, Record<string, unknown>>();
		for (let i = 0; i < 450; i++) {
			sent.set(`r${i}`, { repoScore: i });
			rows[`r${i}`] = { repoScore: i };
		}
		const { fn, calls } = store(rows);
		expect(await verifyWrites(sent, fn, FIELDS, 200)).toEqual([]);
		expect(calls.map((c) => c.length)).toEqual([200, 200, 50]);
	});

	it("finds mismatches in later pages, not just the first", async () => {
		const rows: Record<string, Record<string, unknown>> = {};
		const sent = new Map<string, Record<string, unknown>>();
		for (let i = 0; i < 250; i++) {
			sent.set(`r${i}`, { repoScore: i });
			rows[`r${i}`] = { repoScore: i === 240 ? null : i };
		}
		const { fn } = store(rows);
		const out = await verifyWrites(sent, fn, FIELDS, 200);
		expect(out).toHaveLength(1);
		expect(out[0].key).toBe("r240");
	});

	it("does nothing when the writer wrote nothing", async () => {
		const { fn, calls } = store({});
		expect(await verifyWrites(new Map(), fn, FIELDS)).toEqual([]);
		expect(calls).toEqual([]);
	});
});
