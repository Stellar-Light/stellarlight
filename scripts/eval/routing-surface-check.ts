/**
 * Routing-surface check (sls-051) — asserts operation descriptions stay a
 * TERSE routing surface and never lexically capture docs-shaped questions.
 *
 * The bug class: enumeration-heavy operation descriptions (searchProjects was
 * 2,330 chars of category/product/exemplar prose) tokenize into a surface so
 * broad that lexical routers rank the operation top-1 for question families
 * OTHER operations answer — 22/122 extended-lane docs questions routed to
 * searchProjects at the 1.7.15 absorb. Prose repairs are whack-a-mole (the
 * 1.7.15 enrichment fixed editorial capture and CREATED docs capture), so the
 * structural fix moves routing vocabulary to each operation's `x-routing`
 * extension and this check pins the description surface down:
 *
 *   1. Every operation description is ≤ MAX_DESC_CHARS (600).
 *   2. For the docs-shaped probe questions below (the consumer's own
 *      reproduction), searchProjects' description token-coverage is (a) not
 *      the max across operations and (b) below 0.35 absolute.
 *
 * Run:  pnpm exec tsx scripts/eval/routing-surface-check.ts
 * CI:   contract-gate.yml (after contract:check).
 */
import { spec } from "../../src/lib/openapi-spec";

const MAX_DESC_CHARS = 600;
const CAPTURE_CEILING = 0.35;
const TARGET_OP = "searchProjects";

/** Docs-shaped probes from sls-051 — questions the research/docs surface answers. */
const PROBES = [
	"which Wasm target does the current Stellar CLI build to?",
	"how do I generate TypeScript bindings for a contract?",
	"what does it take to become an anchor?",
];

const STOPWORDS = new Set([
	"the",
	"and",
	"for",
	"that",
	"this",
	"with",
	"from",
	"into",
	"onto",
	"over",
	"under",
	"about",
	"what",
	"when",
	"where",
	"which",
	"who",
	"whom",
	"whose",
	"why",
	"how",
	"does",
	"did",
	"doing",
	"are",
	"was",
	"were",
	"will",
	"would",
	"can",
	"could",
	"should",
	"shall",
	"may",
	"might",
	"must",
	"has",
	"have",
	"had",
	"its",
	"his",
	"her",
	"our",
	"your",
	"their",
	"you",
	"they",
	"them",
	"there",
	"here",
	"not",
	"but",
	"nor",
	"any",
	"all",
	"some",
	"such",
]);

/** Lowercase, split on non-alphanumerics, drop stopwords and tokens < 3 chars. */
function contentTokens(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Fraction of the question's content tokens present in the description. */
function coverage(questionTokens: string[], descTokenSet: Set<string>): number {
	if (questionTokens.length === 0) return 0;
	const hit = questionTokens.filter((t) => descTokenSet.has(t)).length;
	return hit / questionTokens.length;
}

interface Op {
	operationId: string;
	description: string;
	hasRouting: boolean;
}

const ops: Op[] = [];
for (const methods of Object.values(spec.paths as Record<string, unknown>)) {
	for (const op of Object.values(methods as Record<string, unknown>)) {
		if (!op || typeof op !== "object") continue;
		const o = op as Record<string, unknown>;
		if (typeof o.operationId !== "string") continue;
		ops.push({
			operationId: o.operationId,
			description: typeof o.description === "string" ? o.description : "",
			hasRouting: "x-routing" in o,
		});
	}
}

let failures = 0;
const fail = (msg: string) => {
	failures++;
	console.error(`FAIL  ${msg}`);
};

// ── 1. Every description stays terse ────────────────────────────────────────
for (const op of ops) {
	if (op.description.length > MAX_DESC_CHARS) {
		fail(
			`${op.operationId} description is ${op.description.length} chars (max ${MAX_DESC_CHARS}) — move routing vocabulary to x-routing`,
		);
	}
}
console.log(
	`descriptions: ${ops.length} operations, longest ${Math.max(...ops.map((o) => o.description.length))} chars (limit ${MAX_DESC_CHARS})`,
);

// ── 2. Docs-shaped probes must not be captured by searchProjects ────────────
const target = ops.find((o) => o.operationId === TARGET_OP);
if (!target) {
	fail(`operation ${TARGET_OP} not found in spec`);
} else {
	for (const probe of PROBES) {
		const qTokens = contentTokens(probe);
		const scores = ops
			.map((op) => ({
				operationId: op.operationId,
				cov: coverage(qTokens, new Set(contentTokens(op.description))),
			}))
			.sort((a, b) => b.cov - a.cov);
		const targetCov = scores.find((s) => s.operationId === TARGET_OP)?.cov ?? 0;
		const maxOther = Math.max(
			...scores.filter((s) => s.operationId !== TARGET_OP).map((s) => s.cov),
		);
		const top = scores[0];
		console.log(
			`probe "${probe}"\n  tokens [${qTokens.join(", ")}]\n  top: ${top.operationId} ${top.cov.toFixed(3)} · ${TARGET_OP}: ${targetCov.toFixed(3)} (max other ${maxOther.toFixed(3)})`,
		);
		// "Not the max": a nonzero tie for first is still a capture.
		if (targetCov > 0 && targetCov >= maxOther) {
			fail(
				`${TARGET_OP} description is the top coverage (${targetCov.toFixed(3)}) for docs probe "${probe}"`,
			);
		}
		if (targetCov >= CAPTURE_CEILING) {
			fail(
				`${TARGET_OP} description coverage ${targetCov.toFixed(3)} >= ${CAPTURE_CEILING} for docs probe "${probe}"`,
			);
		}
	}
}

if (failures > 0) {
	console.error(`\nrouting-surface-check: ${failures} failure(s)`);
	process.exit(1);
}
console.log("\nrouting-surface-check: OK");
