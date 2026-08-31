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
 * endpoints and is mostly wrong. `verifyClaim` carries five dates and is
 * CORRECT: its `confidence` object holds `ageDays`, so the verdict dates its
 * own evidence. Scoping is what separates them:
 *
 *   a value-bearing field must have a date IN ITS OWN OBJECT,
 *   or be explicitly documented as undatable.
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
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const SPEC = "specs/openapi.json";
const OUT = "improvements/audits/answer-dating-latest.json";
const BASELINE = "scripts/answer-dating-baseline.json";
const UPDATE = process.argv.includes("--update");
const JSON_OUT = process.argv.includes("--json");

/** Fields whose value a consumer would want dated. */
const VALUE =
	/^(answer|verdict|status|score|confidence|label|tier|grade|summary|explanation|basis|state|result)$/i;
/** A field that dates something. */
const DATE = /(At|As[Oo]f|Date|Since|Until|ageDays)$/;

type Finding = { op: string; value: string; where: string; why: string };

/** Property names directly on this schema object (not nested deeper). */
function ownProps(node: unknown): Record<string, unknown> {
	if (!node || typeof node !== "object") return {};
	const n = node as Record<string, unknown>;
	const direct = (n.properties as Record<string, unknown>) ?? {};
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
	const findings: Finding[] = [];
	let valuesChecked = 0;

	for (const [path, ops] of Object.entries(spec.paths ?? {})) {
		for (const [, op] of Object.entries(ops as Record<string, unknown>)) {
			if (!op || typeof op !== "object") continue;
			const o = op as Record<string, unknown>;
			if (!o.responses) continue;
			const opId = (o.operationId as string) ?? path;

			for (const [label, own] of opScopes(o.responses)) {
				const names = Object.keys(own);
				const datesHere = names.filter((n) => DATE.test(n));
				for (const name of names) {
					if (!VALUE.test(name)) continue;
					valuesChecked++;
					if (datesHere.length > 0) continue; // dated in its own scope — fine
					// Undated here. Acceptable ONLY if the field's own description
					// says so — the explainRepo/answerAsOf pattern.
					const desc = String(
						(own[name] as { description?: string })?.description ?? "",
					);
					const admits =
						/\bnull\b|unknown|undated|does not date|not dated|no index date|cannot be dated/i.test(
							desc,
						);
					if (admits) continue;
					// Is there a date somewhere ELSE in this response? That is the
					// dangerous case: a nearby date invites a wrong inference.
					const elsewhere = [...opScopes(o.responses)].some(
						([l, p]) =>
							l !== label && Object.keys(p).some((k) => DATE.test(k)),
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
		writeFileSync(
			BASELINE,
			`${JSON.stringify(
				{
					$comment:
						"Served values with no date in their own scope, as of the guard's first run. A ratchet: entries may be REMOVED (in the PR that dates them) and never added. Regenerate: pnpm exec tsx scripts/check-answer-dating.ts --update",
					updatedAt: new Date().toISOString(),
					count: unique.length,
					undated: unique.map(key).sort(),
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
