/**
 * Changelog⇄contract assertion (sls-054): the NEWEST changelog entry may not
 * name response fields that are absent from the published OpenAPI schema.
 *
 *   pnpm exec tsx scripts/eval/changelog-contract-check.ts
 *
 * Why: the sls-050 entry's detail described the collection's internal storage
 * names (`renameSourceUrl`, top-level `aliases[]`) while the API serves a
 * nested `identity { …, sourceUrl }` — a consumer implementing from the
 * changelog built the wrong projection (kalepail/stellar-raven sls-054,
 * upstream #525). The changelog is a routing/consumption contract (lessons
 * class 9/11): every field name it advertises must exist in the spec.
 *
 * Scope: ONLY the newest entry (CHANGELOG[0]) — the one a PR adds or edits.
 * Older entries are history and may legitimately describe superseded shapes.
 * Validation: backtick-quoted camelCase identifiers (optionally dotted, e.g.
 * `identity.currentName`) must appear in specs/openapi.json; each dotted
 * segment is checked independently. Non-field tokens (paths, params, package
 * names, kebab-case, ALLCAPS) are ignored by shape; a small allowlist covers
 * prose terms that look field-ish but aren't schema properties.
 */
import { readFileSync } from "node:fs";
import { CHANGELOG } from "../../src/lib/changelog";

const spec = readFileSync("specs/openapi.json", "utf8");

// Prose terms that match the identifier shape but are not response fields.
const ALLOWLIST = new Set([
	"main",
	"true",
	"false",
	"null",
	"stellar",
	"soroban",
]);

const entry = CHANGELOG[0];
const text = `${entry.summary} ${entry.detail ?? ""}`;
const tokens = [...text.matchAll(/`([A-Za-z][A-Za-z0-9_.]*)`/g)].map(
	(m) => m[1],
);

const violations: string[] = [];
for (const raw of tokens) {
	// Only identifier-shaped tokens: camelCase or lowercase, optionally dotted.
	if (!/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)*$/.test(raw)) continue;
	for (const seg of raw.split(".")) {
		if (seg.length <= 2 || ALLOWLIST.has(seg)) continue;
		if (!spec.includes(`"${seg}"`) && !spec.includes(seg)) {
			violations.push(
				`\`${raw}\` — segment "${seg}" not found in specs/openapi.json`,
			);
		}
	}
}

if (violations.length) {
	console.error(
		`✗ changelog-contract-check: the newest changelog entry (${entry.date}: ${entry.summary.slice(0, 60)}…) names field(s) absent from the published schema:`,
	);
	for (const v of violations) console.error(`  - ${v}`);
	console.error(
		"Field names in changelog entries must be byte-aligned with the OpenAPI schema (sls-054). Fix the entry text or the spec.",
	);
	process.exit(1);
}
console.log(
	`✓ changelog-contract-check: newest entry's ${tokens.length} quoted identifier(s) all exist in the published schema`,
);
