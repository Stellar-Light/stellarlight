/**
 * The eval meter may only move visibly. Every eval input (banks, guard
 * scripts, goldens, the bank linter itself) is sha256-pinned in
 * scripts/eval/eval-baselines.json; an edit without a same-PR re-baseline
 * fails here. This is the L10 lesson made mechanical: an expectation change
 * is a measurement change, and measurement changes are explicit acts —
 * never side effects of "fixing a red".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	fingerprint,
	PINNED_EVAL_INPUTS,
} from "../../../scripts/eval/update-eval-baselines";

describe("eval inputs are fingerprint-pinned", () => {
	const baseline = JSON.parse(
		readFileSync(
			join(process.cwd(), "scripts/eval/eval-baselines.json"),
			"utf8",
		),
	) as { files: Record<string, string> };

	it("every pinned input matches its baseline hash", () => {
		const now = fingerprint();
		for (const f of PINNED_EVAL_INPUTS) {
			expect(
				now[f],
				`${f} changed without a re-baseline. If the eval change is intended, run \`pnpm exec tsx scripts/eval/update-eval-baselines.ts\` and commit the result IN THIS PR — the meter moving must be visible in the diff.`,
			).toBe(baseline.files[f]);
		}
	});

	it("the baseline lists exactly the pinned set (no stale entries)", () => {
		expect(Object.keys(baseline.files).sort()).toEqual(
			[...PINNED_EVAL_INPUTS].sort(),
		);
	});
});
