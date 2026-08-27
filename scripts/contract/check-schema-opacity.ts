/**
 * GOLDEN L1 invariant: zero opaque schemas in the contract.
 *
 * An object schema with no properties / items / enum / composition tells an
 * agent "a blob arrives" — it cannot project a single field. sls-075 (#1030)
 * found the resolver shipped that way, a sweep found 13 MORE operations, and
 * Raven kept an operation unexposed because of it. All were typed by hand
 * (#1035, #1040); this check makes the class UNSHIPPABLE rather than
 * re-findable. Runs in the contract CI job after build-contract --check.
 *
 * "additionalProperties" and "$ref"/allOf/oneOf/anyOf count as declared —
 * a deliberately-open map is a statement, silence is not.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const spec = JSON.parse(
	readFileSync(join(process.cwd(), "specs/openapi.json"), "utf8"),
) as Record<string, unknown>;

const opaque: string[] = [];
function walk(node: unknown, path: string): void {
	if (Array.isArray(node)) {
		node.forEach((v, i) => walk(v, `${path}[${i}]`));
		return;
	}
	if (!node || typeof node !== "object") return;
	const o = node as Record<string, unknown>;
	if (
		o.type === "object" &&
		!("properties" in o) &&
		!("additionalProperties" in o) &&
		!("$ref" in o) &&
		!("allOf" in o) &&
		!("oneOf" in o) &&
		!("anyOf" in o) &&
		// an enum-typed or described-as-passthrough object is a choice; bare
		// `{type: "object"}` with a description is STILL opaque to a machine —
		// only a structural declaration counts.
		true
	) {
		opaque.push(path);
	}
	for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
}

for (const [p, methods] of Object.entries(
	(spec.paths ?? {}) as Record<string, unknown>,
)) {
	walk(methods, p);
}

if (opaque.length) {
	console.error(
		`✗ ${opaque.length} opaque object schema(s) — an agent cannot project a single field from these. Declare properties (or additionalProperties for a deliberate map):`,
	);
	for (const p of opaque.slice(0, 20)) console.error(`   ${p}`);
	process.exit(1);
}
// Tier 2 — the RATCHET. additionalProperties:true is an explicit, honest
// "open map", but each one typed properly is strictly better for agents.
// The count may only DECREASE. Lowering the baseline is part of the PR that
// earns it; raising it is a build failure, not a choice.
let openMaps = 0;
function countOpen(node: unknown): void {
	if (Array.isArray(node)) {
		for (const v of node) countOpen(v);
		return;
	}
	if (!node || typeof node !== "object") return;
	const o = node as Record<string, unknown>;
	if (o.type === "object" && o.additionalProperties === true) openMaps++;
	for (const v of Object.values(o)) countOpen(v);
}
countOpen(spec.paths ?? {});
const baseline = JSON.parse(
	readFileSync(join(process.cwd(), "specs/opacity-baseline.json"), "utf8"),
) as { openMaps: number };
if (openMaps > baseline.openMaps) {
	console.error(
		`✗ open-map ratchet: ${openMaps} additionalProperties:true schemas, baseline is ${baseline.openMaps}. New surface must declare its properties — an open map is a grandfathered debt, not a pattern.`,
	);
	process.exit(1);
}
if (openMaps < baseline.openMaps) {
	console.error(
		`✗ open-map ratchet: count improved to ${openMaps} (baseline ${baseline.openMaps}) — lower specs/opacity-baseline.json in this PR to lock the gain.`,
	);
	process.exit(1);
}
console.log(
	`✓ schema opacity: zero silent · ${openMaps} explicit open maps (ratcheted, may only decrease)`,
);
