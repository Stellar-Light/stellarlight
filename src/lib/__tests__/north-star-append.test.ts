/**
 * The north-star append reads the week it was meant to read.
 *
 * generated-recall appended at about 14:14 UTC on Sunday from
 * improvements/engine/weekly/engine-a-recall-latest.json, which
 * engine-c-health commits at about 16:00 UTC the same day (commit 1c7dde19,
 * "weekly evidence 2026-11-08"). Every append read the previous week, and the
 * 2026-11-08 point was missing. The append now runs in engine-c-health after
 * that commit, and refuses a date the series already holds.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
	type Point,
	planAppend,
} from "../../../scripts/quality/append-north-star";

const pt = (date: string): Point => ({
	date,
	label: "Engine A full matrix (8 buckets)",
	okRate: 100,
	ok: 1,
	probes: 1,
	evidence: "improvements/engine/weekly/engine-a-recall-latest.json",
});
const engine = (generatedAt: string) => ({
	generatedAt,
	board: [
		{ bucket: "a", ok: 2000, total: 2000 },
		{ bucket: "b", ok: 280, total: 280 },
	],
});

describe("planAppend", () => {
	it("appends a newer run with the engine's own date and numbers", () => {
		const plan = planAppend([pt("2026-11-01")], engine("2026-11-08T16:00:37Z"));
		expect(plan).toEqual({
			point: expect.objectContaining({
				date: "2026-11-08",
				ok: 2280,
				probes: 2280,
				okRate: 100,
			}),
		});
	});
	it("refuses a date already in the series, wherever it sits", () => {
		const plan = planAppend(
			[pt("2026-11-08"), pt("2026-11-01")],
			engine("2026-11-08T16:00:37Z"),
		);
		expect("skip" in plan).toBe(true);
	});
	it("refuses a run older than the last point", () => {
		expect(
			"skip" in planAppend([pt("2026-11-08")], engine("2026-11-01T00:00:00Z")),
		).toBe(true);
	});
	it("an artifact with no board is inconclusive, never a point", () => {
		expect(
			"inconclusive" in
				planAppend([], { generatedAt: "2026-11-08T00:00:00Z", board: [] }),
		).toBe(true);
	});
});

describe("workflow order", () => {
	const steps = (file: string): string[] => {
		const doc = yaml.load(
			readFileSync(join(process.cwd(), ".github/workflows", file), "utf8"),
		) as {
			jobs?: Record<string, { steps?: Array<{ name?: string; run?: string }> }>;
		};
		return Object.values(doc.jobs ?? {}).flatMap((j) =>
			(j.steps ?? []).map((s) => `${s.name ?? ""} :: ${s.run ?? ""}`),
		);
	};
	it("engine-c-health appends after it commits the weekly evidence", () => {
		const s = steps("engine-c-health.yml");
		const commit = s.findIndex((x) => x.startsWith("Commit weekly evidence"));
		const append = s.findIndex((x) => x.includes("append-north-star.ts"));
		expect(commit).toBeGreaterThanOrEqual(0);
		expect(append).toBeGreaterThan(commit);
	});
	it("no other workflow appends to the series", () => {
		const others = readdirSync(join(process.cwd(), ".github/workflows"))
			.filter((f) => /\.ya?ml$/.test(f) && f !== "engine-c-health.yml")
			.filter((f) => steps(f).some((x) => x.includes("append-north-star.ts")));
		expect(others).toEqual([]);
	});
});
