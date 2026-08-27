/** Regenerate the eval-input fingerprints. Run this IN THE SAME PR as any
 * bank/guard/golden edit — that is the point: re-baselining is an explicit,
 * reviewed act (QUALITY.md §5, stellar-raven's gates.json discipline), never
 * a side effect. The vitest gate fails until this file matches reality. */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const PINNED_EVAL_INPUTS = [
	"scripts/eval/battery-banks.ts",
	"scripts/eval/raven-truth-battery.ts",
	"scripts/eval/raven-golden-parity.ts",
	"scripts/eval/raven-surface-consistency.ts",
	"scripts/eval/raven-honest-absence.ts",
	"scripts/eval/golden-questions.json",
	"scripts/eval/lint-eval-banks.ts",
];

export function fingerprint(): Record<string, string> {
	const out: Record<string, string> = {};
	for (const f of PINNED_EVAL_INPUTS)
		out[f] = createHash("sha256")
			.update(readFileSync(join(process.cwd(), f)))
			.digest("hex");
	return out;
}

if (process.argv[1]?.endsWith("update-eval-baselines.ts")) {
	writeFileSync(
		join(process.cwd(), "scripts/eval/eval-baselines.json"),
		`${JSON.stringify(
			{
				$comment:
					"sha256 fingerprints of every eval input (banks, guards, goldens, linter). The vitest gate (eval-fingerprints.test.ts) fails when reality drifts from this file, so ANY eval change carries its re-baseline in the same diff — reviewers see 'the meter moved' explicitly. Regenerate: pnpm exec tsx scripts/eval/update-eval-baselines.ts",
				baselinedAt: new Date().toISOString(),
				files: fingerprint(),
			},
			null,
			1,
		)}\n`,
	);
	console.log("eval-baselines.json regenerated");
}
