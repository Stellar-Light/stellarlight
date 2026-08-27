/**
 * QUALITY.md L1 invariant #2 — the honesty-layer conformance ratchet.
 *
 * The class (sls-076, the listSkills silent filter, vetIdea's unlabelled
 * neighbours): an operation accepts a query, relaxes or fails to match, and
 * the response never says HOW it matched — so an agent reads filler as an
 * answer. The fix landed five separate times on five surfaces because
 * nothing made the convention load-bearing.
 *
 * Rule: every GET operation accepting `q` must declare a `matchMode` field
 * somewhere in its 200 response schema, or hold a slot in
 * specs/honesty-baseline.json — either exempt:true with the DIFFERENT
 * declared honesty mechanism named (found/matchedOn, answered), or
 * exempt:false as grandfathered debt. Debt may only shrink: a new op
 * shipping without a label fails the build; a debt op that gains its label
 * must leave the baseline in the same PR.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const spec = JSON.parse(
	readFileSync(join(process.cwd(), "specs/openapi.json"), "utf8"),
) as { paths?: Record<string, Record<string, unknown>> };
const baseline = JSON.parse(
	readFileSync(join(process.cwd(), "specs/honesty-baseline.json"), "utf8"),
) as { operations: Record<string, { exempt: boolean; reason: string }> };

const problems: string[] = [];
const seen = new Set<string>();

for (const [path, methods] of Object.entries(spec.paths ?? {})) {
	const op = methods.get as
		| { operationId?: string; parameters?: Array<{ name?: string }>; responses?: Record<string, unknown> }
		| undefined;
	if (!op || typeof op !== "object") continue;
	const params = (op.parameters ?? []).map((p) => p?.name);
	if (!params.includes("q")) continue;
	const oid = op.operationId ?? path;
	const declares = JSON.stringify(op.responses?.["200"] ?? {}).includes('"matchMode"');
	const slot = baseline.operations[oid];
	if (slot) seen.add(oid);
	if (declares && slot && !slot.exempt) {
		problems.push(
			`${oid} now declares matchMode — remove its debt entry from specs/honesty-baseline.json in this PR to lock the gain`,
		);
		continue;
	}
	if (!declares && !slot) {
		problems.push(
			`${oid} (${path}) accepts q but never says how it matched — declare matchMode in its response, or add a baseline entry with a reason`,
		);
	}
}
for (const oid of Object.keys(baseline.operations)) {
	if (!seen.has(oid))
		problems.push(
			`baseline entry '${oid}' matches no q-taking GET operation in the spec — stale, remove it`,
		);
}

const debt = Object.values(baseline.operations).filter((o) => !o.exempt).length;
if (problems.length) {
	console.error(`✗ honesty-layer conformance: ${problems.length} problem(s)`);
	for (const p of problems) console.error(`   ${p}`);
	process.exit(1);
}
console.log(
	`✓ honesty layer: every q-taking op labels its matching or is accounted for · debt ${debt} (ratcheted, may only decrease)`,
);
