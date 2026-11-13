/**
 * A /quality guard row's artifact has a scheduled writer that runs inside the
 * row's own freshness window.
 *
 * Found 2026-11-12: consumption, scripts-types and answer-dating had no
 * workflow that wrote their artifacts (last written by hand 2026-09-14,
 * #1581), and coverage-watch ran monthly against the SCF coverage row's
 * 10-day window. All four read stale on /quality.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { getGuardRows } from "../quality-artifacts";

/** artifact -> the workflow that commits it */
const WRITERS: Record<string, string> = {
	"improvements/audits/consumption-latest.json": "quality-ratchets.yml",
	"improvements/audits/scripts-types-latest.json": "quality-ratchets.yml",
	"improvements/audits/answer-dating-latest.json": "quality-ratchets.yml",
	"improvements/audits/coverage-gaps-latest.json": "coverage-watch.yml",
};

/** Longest gap in days between runs of one cron line. Handles the shapes
 *  these lanes use: daily, day-of-week lists, and day-of-month (monthly).
 *  Several cron lines: the shortest gap bounds the union from above.
 *  ponytail: no ranges or step syntax; add them when a lane needs one. */
function maxGapDays(cron: string): number {
	const [, , dom, , dow] = cron.trim().split(/\s+/);
	if (dom !== "*") return 31;
	if (dow === "*") return 1;
	const days = dow
		.split(",")
		.map(Number)
		.sort((a, b) => a - b);
	return Math.max(
		...days.map(
			(d, i) => (i + 1 < days.length ? days[i + 1] : days[0] + 7) - d,
		),
	);
}

const workflow = (file: string) => {
	const src = readFileSync(
		join(process.cwd(), ".github/workflows", file),
		"utf8",
	);
	const doc = yaml.load(src) as {
		on?: { schedule?: Array<{ cron: string }> };
		true?: { schedule?: Array<{ cron: string }> };
	};
	const on = doc.on ?? doc.true ?? {};
	return { src, crons: (on.schedule ?? []).map((s) => s.cron) };
};

describe("maxGapDays", () => {
	it("reads the shapes the lanes use", () => {
		expect(maxGapDays("0 8 1 * *")).toBe(31);
		expect(maxGapDays("0 8 * * 1")).toBe(7);
		expect(maxGapDays("17 5 * * 1,4")).toBe(4);
		expect(maxGapDays("0 6 * * *")).toBe(1);
	});
});

describe("guard artifacts are written on a schedule inside their window", () => {
	const rows = getGuardRows();
	for (const [artifact, file] of Object.entries(WRITERS))
		it(`${artifact} (${file})`, () => {
			const row = rows.find((r) => r.artifact === artifact);
			expect(row, "no /quality row reads this artifact").toBeDefined();
			let wf: ReturnType<typeof workflow>;
			try {
				wf = workflow(file);
			} catch {
				throw new Error(`${file} does not exist`);
			}
			expect(wf.src, `${file} does not commit anything`).toContain("git add");
			expect(wf.src, `${file} does not name ${artifact}`).toContain(artifact);
			expect(wf.crons.length, `${file} has no schedule`).toBeGreaterThan(0);
			const gap = Math.min(...wf.crons.map(maxGapDays));
			expect(
				gap,
				`${file} runs every ${gap} days; the row goes stale after ${row?.freshnessDays}`,
			).toBeLessThan(row?.freshnessDays ?? 0);
		});
});
