/**
 * Every served value must be datable, or say it is not.
 *
 * Raven filed #1134: `explainRepo` returned a DeepWiki answer stating
 * `MaxSupportedProtocolVersion = 25` while the source at our own
 * `codeVerified.scannedRef` defined 28. The stale number was DeepWiki's. OURS
 * was that the response carried three timestamps — `meta.generatedAt`,
 * `codeVerified.scannedAt`, `repoMeta.lastCommitAt` — every one describing the
 * code scan and not one dating the ANSWER. A consumer reading `scannedAt`
 * beside `answerSource: "deepwiki"` reasonably concludes the answer is as fresh
 * as the scan. It is not, and it can contradict the very ref it sits beside.
 *
 * The class: A VALUE WEARING PROVENANCE THAT DOES NOT COVER IT. Nearby dates
 * are worse than no dates, because they invite a specific wrong inference.
 *
 * The naive detector — "response has ≥2 dates and a value" — flags 12
 * endpoints and is mostly wrong. Scoping is what separates them:
 *
 *   a value-bearing field must have a date IN ITS OWN OBJECT,
 *   or its own description must admit it cannot be dated.
 *
 * Scoping cuts BOTH ways. `verifyClaim.confidence.ageDays` dates the numbers
 * inside `confidence` — it does NOT date the root-level `verdict` sitting
 * beside it, so `verifyClaim :: (root).verdict` is carried as named debt in
 * the baseline, not excused. (An earlier version of this header called
 * verifyClaim "correct"; its own admission regex was loose enough to accept
 * "unresolved = unknown subject" as an undatability admission, which is a
 * statement about the VALUE, not about its age.)
 *
 * `explainRepo.answer` failed that — it sat at the top level while every date
 * lived in a sibling object. `answerAsOf` is the fix, and it is deliberately
 * NULL for DeepWiki answers, since DeepWiki exposes no index date and
 * inventing one would make an unknown look measured.
 *
 * KNOWN LIMITS, both found by testing this guard rather than reading it:
 *
 *   1. Scope granularity. "Some date in the object" is treated as covering
 *      every value in that object, which is a heuristic and not a proof —
 *      `answerAsOf` dates `answer`, not a hypothetical sibling `grade`.
 *      Planting `grade` beside `answerAsOf` does NOT fire. Tightening this to
 *      a per-field date would flag far more than anyone would fix, so the
 *      guard deliberately catches the SHARPER shape: a value in a scope with
 *      no date at all, while other scopes in the same response carry dates a
 *      consumer could mistake for it. That is exactly #1134.
 *   2. It reads the CONTRACT, not live responses. It proves what a consumer is
 *      TOLD — the surface #1134 was actually about — but a field the spec
 *      dates and the route omits would pass here.
 *
 * Read-only. Exits 1 on an undated, undocumented value.
 *
 * Flags:
 *   --update          rewrite the baseline. REFUSES to add entries — the
 *                     ratchet only removes. Fix new findings instead.
 *   --update --widen  permit baseline growth, ONLY in the PR that changes the
 *                     guard's own rules (a wider walk or a stricter admission
 *                     legitimately grows the examined population). Prints
 *                     exactly what grew so the PR diff can be judged.
 *   --json            write the artifact to improvements/audits/.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const SPEC = "specs/openapi.json";
const OUT = "improvements/audits/answer-dating-latest.json";
const BASELINE = "scripts/answer-dating-baseline.json";
const UPDATE = process.argv.includes("--update");
const WIDEN = process.argv.includes("--widen");
const JSON_OUT = process.argv.includes("--json");

/** Fields whose value a consumer would want dated. */
const VALUE =
	// `basis` is deliberately NOT here. The cross-vendor audit ruled on it:
	// every basis field in the contract is a constant methodology string
	// compiled into the code ("Supply-side coverage of ACTIVE directory
	// projects…") — it changes only when the code changes, so it cannot go
	// stale the way a measured value can, and stamping a date on it would
	// MANUFACTURE the wrong inference this guard exists to prevent (a reader
	// dating the METHOD and believing they dated the numbers). The dateable
	// things are the quantities beside it, which is what the rest of this
	// regex names.
	/^(answer|verdict|status|score|confidence|label|tier|grade|summary|explanation|state|result)$/i;
/** A field that dates something. Two rules with DELIBERATELY different case
 * handling — one case-insensitive regex over both would be wrong twice:
 *
 *   - camelCase SUFFIXES stay case-sensitive. /at$/i would match `format` or
 *     `chat`, and /date$/i would match a field literally named `update` (or
 *     `candidate`) — names that merely END in a date word date nothing.
 *   - BARE names match whole and case-insensitively, so `date` (getChangelog
 *     entries), `asOf` (Project.deployment) and `since` count. Whole-name
 *     matching is what excludes the `update` collision by construction:
 *     "update" !== "date". */
const DATE_SUFFIX = /(At|As[Oo]f|Date|Since|Until|ageDays)$/;
const DATE_BARE = /^(date|asOf|since|until|timestamp)$/i;
const isDateField = (n: string) => DATE_SUFFIX.test(n) || DATE_BARE.test(n);

type Finding = { op: string; value: string; where: string; why: string };

/** Replace every {"$ref": "#/components/schemas/X"} with a copy of the schema
 * it names, depth-first, BEFORE any scope-walking happens.
 *
 * Without this, a response body that IS a $ref — ProjectSearchResponse,
 * RepoSearchResponse, PartnersResponse — yields zero scopes and the guard
 * examines nothing behind it: every Project.status, Repo.tier, Partner
 * summary served through a named schema was invisible, and valuesChecked
 * counted only the inline-schema subset of the contract.
 *
 * Cycle guard: `expanding` holds the schema names on the CURRENT expansion
 * path. A $ref to a schema already being expanded is a cycle and yields no
 * further scopes ({}). Path-scoped (add before descending, delete after), so
 * DAG re-use still expands everywhere — Meta under five different responses
 * is five different paths, each fully walked. */
function resolveRefs(
	node: unknown,
	schemas: Record<string, unknown>,
	expanding: Set<string> = new Set(),
): unknown {
	if (!node || typeof node !== "object") return node;
	if (Array.isArray(node))
		return node.map((e) => resolveRefs(e, schemas, expanding));
	const n = node as Record<string, unknown>;
	if (typeof n.$ref === "string") {
		const name = n.$ref.replace("#/components/schemas/", "");
		if (n.$ref === name || !(name in schemas) || expanding.has(name)) return {};
		expanding.add(name);
		const out = resolveRefs(schemas[name], schemas, expanding);
		expanding.delete(name);
		return out;
	}
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(n))
		out[k] = resolveRefs(v, schemas, expanding);
	return out;
}

/** Property names directly on this schema object (not nested deeper).
 * Assumes $refs are already resolved (resolveRefs runs first). */
function ownProps(node: unknown): Record<string, unknown> {
	if (!node || typeof node !== "object") return {};
	const n = node as Record<string, unknown>;
	// copy, never alias: assigning into the node's own `properties` object
	// would leak hoisted items/allOf props into the walked tree
	const direct = { ...((n.properties as Record<string, unknown>) ?? {}) };
	// unwrap the single-schema containers that do not change scope
	for (const k of ["items", "allOf", "anyOf", "oneOf"]) {
		const v = n[k];
		if (Array.isArray(v)) for (const e of v) Object.assign(direct, ownProps(e));
		else if (v) Object.assign(direct, ownProps(v));
	}
	return direct;
}

/** Find the response SCHEMAS under an operation's `responses` block.
 *
 * responses -> "200" -> content -> "application/json" -> schema
 *
 * Those four levels are WRAPPERS, not object scopes — walking them as scopes
 * (the first version's bug) finds no properties at all and reports 0/0, a
 * checker that passes because it looked at nothing. */
function* responseSchemas(responses: unknown): Generator<unknown> {
	if (!responses || typeof responses !== "object") return;
	for (const status of Object.values(responses as Record<string, unknown>)) {
		if (!status || typeof status !== "object") continue;
		const content = (status as Record<string, unknown>).content;
		if (!content || typeof content !== "object") continue;
		for (const media of Object.values(content as Record<string, unknown>)) {
			const schema = (media as Record<string, unknown>)?.schema;
			if (schema) yield schema;
		}
	}
}

/** Walk every OBJECT scope in a schema, yielding [pathLabel, ownProperties]. */
function* scopes(
	node: unknown,
	label: string,
): Generator<[string, Record<string, unknown>]> {
	if (!node || typeof node !== "object") return;
	const own = ownProps(node);
	if (Object.keys(own).length) yield [label, own];
	for (const [k, v] of Object.entries(own))
		yield* scopes(v, label ? `${label}.${k}` : k);
}

/** Every scope across every response schema of one operation. */
function* opScopes(
	responses: unknown,
): Generator<[string, Record<string, unknown>]> {
	for (const schema of responseSchemas(responses)) yield* scopes(schema, "");
}

function main() {
	const spec = JSON.parse(readFileSync(SPEC, "utf8"));
	// Resolve $refs ONCE, over the whole paths tree, so every walk below —
	// including the `elsewhere` re-walk — sees the same fully expanded contract.
	const paths = resolveRefs(
		spec.paths ?? {},
		spec.components?.schemas ?? {},
	) as Record<string, unknown>;
	const findings: Finding[] = [];
	let valuesChecked = 0;

	for (const [path, ops] of Object.entries(paths)) {
		for (const [, op] of Object.entries(ops as Record<string, unknown>)) {
			if (!op || typeof op !== "object") continue;
			const o = op as Record<string, unknown>;
			if (!o.responses) continue;
			const opId = (o.operationId as string) ?? path;

			for (const [label, own] of opScopes(o.responses)) {
				const names = Object.keys(own);
				const datesHere = names.filter(isDateField);
				for (const name of names) {
					if (!VALUE.test(name)) continue;
					valuesChecked++;
					if (datesHere.length > 0) continue; // dated in its own scope — fine
					// Undated here. Acceptable ONLY if the field's own description
					// admits, SPECIFICALLY, that it cannot be dated — the
					// explainRepo/answerAsOf pattern ("DeepWiki exposes no index
					// date"). The first version accepted any description containing
					// bare "null" or "unknown", which admitted "null if DeepWiki had
					// no answer" and "unresolved = unknown subject" — statements
					// about VALUE STATES, not about the value's age. An admission
					// must speak to datability itself.
					const desc = String(
						(own[name] as { description?: string })?.description ?? "",
					);
					const admits =
						/undatable|does not date|not dated|cannot be dated|no index date|age (is |remains )?unknown|unknown age/i.test(
							desc,
						);
					if (admits) continue;
					// Is there a date somewhere ELSE in this response? That is the
					// dangerous case: a nearby date invites a wrong inference.
					const elsewhere = [...opScopes(o.responses)].some(
						([l, p]) => l !== label && Object.keys(p).some(isDateField),
					);
					findings.push({
						op: opId,
						value: name,
						where: label || "(root)",
						why: elsewhere
							? "undated in its own scope, while OTHER objects in this response carry dates a consumer could mistake for it"
							: "undated, and nothing in the response dates it",
					});
				}
			}
		}
	}

	// Dedupe: one row per (op, value, scope).
	const seen = new Set<string>();
	const unique = findings.filter((f) => {
		const k = `${f.op}|${f.value}|${f.where}`;
		if (seen.has(k)) return false;
		seen.add(k);
		return true;
	});

	const artifact = {
		asOf: new Date().toISOString(),
		source: "scripts/check-answer-dating.ts",
		valuesChecked,
		undated: unique.length,
		findings: unique,
	};

	if (JSON_OUT) {
		writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
		console.log(`wrote ${OUT}`);
	} else {
		for (const f of unique)
			console.log(`  ${f.op}  ${f.where}.${f.value}\n      ${f.why}`);
		console.log(
			`\n${valuesChecked - unique.length}/${valuesChecked} served values are dated in their own scope, or documented as undatable.`,
		);
	}
	// A SWEEP THAT EXAMINED NOTHING IS NOT A PASS. The first version walked
	// `responses` as if it were a schema, found zero properties, and printed
	// "0/0 ... dated" — green, having read nothing. Same shape as the defect it
	// hunts.
	if (valuesChecked === 0) {
		console.error(
			"INCONCLUSIVE: found 0 value-bearing fields in the whole contract. That is a traversal bug, not a clean bill of health.",
		);
		process.exit(2);
	}
	// A RATCHET, for the same reason as scripts-types: 40 of 55 fail on day one
	// and a gate that is red from birth gets deleted. The baseline freezes what
	// exists so NEW undated values are blocked, and the list only shrinks.
	//
	// Honest about its own limits: this reads the CONTRACT, not live responses.
	// It proves what a consumer is TOLD, which is exactly the surface #1134 was
	// about — but a field the spec dates and the route omits would pass here.
	const key = (f: Finding) => `${f.op} :: ${f.where}.${f.value}`;
	if (UPDATE) {
		// A RATCHET ONLY TURNS ONE WAY (same pattern as check-scripts-types):
		// without this, a PR could add an undated field, run --update, commit the
		// bigger baseline, and go green — contradicting the baseline's own
		// "$comment". Growth is refused. The ONE legitimate growth case is the PR
		// that changes the guard's own rules (a wider walk, a stricter admission
		// regex), which changes the examined population; that PR passes --widen
		// and the printout below puts the growth in its diff for review.
		const entries = unique.map(key).sort();
		if (existsSync(BASELINE)) {
			const prev: { undated?: string[] } = JSON.parse(
				readFileSync(BASELINE, "utf8"),
			);
			const before = new Set(prev.undated ?? []);
			const grown = entries.filter((e) => !before.has(e));
			const removed = [...before].filter((e) => !entries.includes(e));
			if (grown.length > 0 && !WIDEN) {
				console.error(
					`REFUSED: --update would ADD ${grown.length} entr${grown.length === 1 ? "y" : "ies"} to the baseline. The ratchet only removes — date these fields (or admit undatability in their descriptions) instead:\n${grown.map((g) => `  ${g}`).join("\n")}\nIf the guard's OWN RULES changed in this PR and the population legitimately grew, rerun with --update --widen.`,
				);
				process.exit(1);
			}
			if (grown.length > 0)
				console.log(
					`--widen: baseline GROWS by ${grown.length} (guard rules changed — review this list in the PR):\n${grown.map((g) => `  + ${g}`).join("\n")}`,
				);
			if (removed.length > 0)
				console.log(
					`baseline shrinks by ${removed.length}:\n${removed.map((r) => `  - ${r}`).join("\n")}`,
				);
		}
		writeFileSync(
			BASELINE,
			`${JSON.stringify(
				{
					$comment:
						"Served values with no date in their own scope, as of the guard's first run. A ratchet: entries may be REMOVED (in the PR that dates them) and never added — --update refuses growth unless the guard's own rules changed (--widen). Regenerate: pnpm exec tsx scripts/check-answer-dating.ts --update",
					updatedAt: new Date().toISOString(),
					count: unique.length,
					undated: entries,
				},
				null,
				"\t",
			)}\n`,
		);
		console.log(`baseline written: ${unique.length} undated values`);
		return;
	}
	const known: string[] = existsSync(BASELINE)
		? (JSON.parse(readFileSync(BASELINE, "utf8")).undated ?? [])
		: [];
	const knownSet = new Set(known);
	const added = unique.filter((f) => !knownSet.has(key(f)));
	const fixed = known.filter((k) => !unique.some((f) => key(f) === k));

	if (fixed.length)
		console.log(
			`\n${fixed.length} value(s) now dated — remove from the baseline in this PR:\n${fixed.map((f) => `  - ${f}`).join("\n")}`,
		);
	if (added.length) {
		console.error(
			`\nRED: ${added.length} NEW undated value(s):\n${added.map((f) => `  ${key(f)}`).join("\n")}\nAdd a date in the same object, or say in the field's description why there is none (see explainRepo.answerAsOf).`,
		);
		process.exit(1);
	}
	console.log(
		`GREEN: no new undated values. ${unique.length} carried as named debt.`,
	);
	if (fixed.length) process.exit(1);
}

main();
