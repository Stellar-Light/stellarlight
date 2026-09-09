/**
 * Enum-literal ratchet — the hand-copied-vocabulary class cannot grow.
 *
 * The class (stellar-raven sls-082, sls-084, 2026-09-09): a vocabulary the
 * code serves, hand-typed a second time as a spec `enum: [...]`, drifting
 * when the code's list gains a member. Fixed by spreading the code's arrays
 * (`enum: [...RWA_STATES]`) and pinning them in spec-enum-parity.test.ts —
 * but a parity test only knows the constants it was told about. A NEW
 * vocabulary shipped tomorrow as a literal in both places would be invisible
 * to it. So: the number of literal enum arrays in the spec source is
 * baselined and may only DECREASE. Adding one fails the build; the author
 * either spreads a constant or raises the baseline in the same PR, where a
 * reviewer sees it.
 *
 * Counts both spellings — `enum: ["a", "b"]` and `enum: [\n "a", ...` — and
 * never a spread (`enum: [...X]`). The remaining literals are spec-only
 * vocabularies (matchMode, confidence labels, …) with no code constant to
 * spread; that is fine, they just cannot multiply unnoticed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const src = readFileSync(join(ROOT, "src/lib/openapi-spec.ts"), "utf8");
const baselinePath = join(ROOT, "specs/enum-literals-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
	literalEnumSites: number;
	note: string;
};
const literals = [...src.matchAll(/enum: \[\s*"/g)].length;
const spreads = [...src.matchAll(/enum: \[\.\.\./g)].length;
if (literals > baseline.literalEnumSites) {
	console.error(
		`✗ enum literals: ${literals} hand-typed enum arrays in src/lib/openapi-spec.ts, baseline ${baseline.literalEnumSites} (ratcheted, may only decrease).\n  A new literal enum mirrors nothing today and drifts tomorrow (sls-082/084). Spread an exported \`as const\` array instead — \`enum: [...NAME]\` — and pin it in src/lib/__tests__/spec-enum-parity.test.ts. If the vocabulary truly lives only in the spec, raise the baseline in specs/enum-literals-baseline.json in this PR so a reviewer sees it.`,
	);
	process.exit(1);
}
if (literals < baseline.literalEnumSites) {
	console.error(
		`✗ enum literals: ${literals} < baseline ${baseline.literalEnumSites} — good, now lower the baseline in specs/enum-literals-baseline.json so the ratchet holds the new floor.`,
	);
	process.exit(1);
}
console.log(
	`✓ enum literals: ${literals} hand-typed enum arrays in the spec source, ${spreads} spread from code constants (ratcheted, may only decrease)`,
);
