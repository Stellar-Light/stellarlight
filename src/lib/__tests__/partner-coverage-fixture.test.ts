import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
	applyOverrides,
	type Baseline,
	type Fixture,
} from "../partner-coverage";

// The partner coverage monitor runs weekly against production, so a broken
// fixture or a baseline out of step with it would only show up there, as a
// red that looks like a regression. These checks read the committed files at
// PR time instead.
const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
const fx = JSON.parse(read("scripts/eval/partner-coverage.json")) as Fixture;
const base = JSON.parse(
	read("scripts/eval/partner-coverage-baseline.json"),
) as Baseline;

describe("committed partner coverage fixture and baseline", () => {
	it("the fixture scores: overrides apply, at least 88 partners and 17 questions", () => {
		expect(() => applyOverrides(fx)).not.toThrow();
		expect(fx.partners.length).toBeGreaterThanOrEqual(88);
		expect(fx.questions.length).toBeGreaterThanOrEqual(17);
	});

	it("every source has a url, what it says, and a date or a reason it has none", () => {
		for (const p of fx.partners) {
			expect(p.source.url, p.name).toMatch(/^https:\/\//);
			expect(p.source.says.trim(), p.name).not.toBe("");
			expect(
				!!p.source.date || !!p.source.dateNote?.trim(),
				`${p.name}: no date and no dateNote`,
			).toBe(true);
			expect(["sdf", "partner", "operator"], p.name).toContain(p.source.owner);
		}
	});

	it("every question expects at least one partner", () => {
		for (const q of fx.questions)
			expect(q.expected.length, q.id).toBeGreaterThan(0);
	});

	it("the baseline covers exactly the fixture's partners, questions and variants", () => {
		expect(Object.keys(base.partners).sort()).toEqual(
			fx.partners.map((p) => p.name).sort(),
		);
		expect(Object.keys(base.questions).sort()).toEqual(
			fx.questions.map((q) => q.id).sort(),
		);
		for (const q of fx.questions)
			expect(Object.keys(base.questions[q.id]).sort(), q.id).toEqual(
				q.type ? ["q", "q+type"] : ["q"],
			);
	});

	it("every baseline partner records its own-name rank, a number exactly when its rank check passed", () => {
		for (const [name, b] of Object.entries(base.partners)) {
			expect(
				"rank" in b,
				`${name}: no rank key, so the rank ratchet is off`,
			).toBe(true);
			if (b.checks.rank === "pass")
				expect(typeof b.rank, `${name}: rank check passed`).toBe("number");
			else expect(b.rank, `${name}: rank check ${b.checks.rank}`).toBeNull();
		}
	});

	it("the workflow reds by design only on a finished regression report", () => {
		const wf = yaml.load(read(".github/workflows/partner-eval.yml")) as {
			permissions: Record<string, string>;
			on: Record<string, unknown>;
			jobs: { eval: { steps: Array<{ name?: string; if?: string }> } };
		};
		expect(wf.permissions).toEqual({ contents: "read" });
		expect(Object.keys(wf.on).sort()).toEqual([
			"schedule",
			"workflow_dispatch",
		]);
		const step = (n: string) =>
			wf.jobs.eval.steps.find((s) => s.name === n)?.if ?? "";
		expect(step("Propagate the red")).toMatch(/code == '1'/);
		expect(step("Propagate the red")).toMatch(/report == 'yes'/);
		expect(step("Could not score")).toMatch(/report != 'yes'/);
	});
});
