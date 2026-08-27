/**
 * Bank linter (QUALITY.md §5, their R2/R12 classes adapted to our shapes).
 *
 * Offline: structural authoring defects — empty expectation sets, duplicate
 * probes, regexes that do not compile, ids that collide.
 * --live: bank ROT — every slug a bank expects must still resolve in the
 * live directory by that exact slug. A renamed or removed row turns a truth
 * probe into a permanent red that grades the bank, not the service (the
 * laina/gate-io class: the row moved and the bank did not).
 *
 * Runs in raven-eval-parity.yml before the guards, so a rotted bank fails
 * loudly as BANK-LINT, never disguised as a service regression.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ABSENT_BANKS, CATEGORY_BANKS, KNOWN_BANKS } from "./battery-banks";

const LIVE = process.argv.includes("--live");
const problems: string[] = [];

// ── structural ──
const catQs = CATEGORY_BANKS.map((c) => c.q);
for (const q of catQs)
	if (catQs.filter((x) => x === q).length > 1)
		problems.push(`duplicate category probe: "${q}"`);
for (const c of CATEGORY_BANKS) {
	if (!c.anyOf.length) problems.push(`empty anyOf: "${c.q}"`);
	if ((c.min ?? 2) > c.anyOf.length)
		problems.push(`min ${c.min} > anyOf size ${c.anyOf.length}: "${c.q}"`);
}
const knownPairs = KNOWN_BANKS.flat();
for (const [q, slug] of knownPairs)
	if (!q.trim() || !slug.trim())
		problems.push(`blank known-item pair: ${q}/${slug}`);
const absentQs = ABSENT_BANKS.flat();
for (const q of absentQs)
	if (absentQs.filter((x) => x === q).length > 1)
		problems.push(`duplicate absent probe: "${q}"`);

// golden questions: ids unique, regexes compile, expectations non-empty
type Golden = {
	id: string;
	expect?: Record<string, unknown>;
};
const gq = JSON.parse(
	readFileSync(
		join(process.cwd(), "scripts/eval/golden-questions.json"),
		"utf8",
	),
) as { questions: Golden[] };
const ids = new Set<string>();
for (const q of gq.questions) {
	if (ids.has(q.id)) problems.push(`duplicate golden id: ${q.id}`);
	ids.add(q.id);
	const rxList = Array.isArray(q.expect?.answerRegex)
		? (q.expect?.answerRegex as string[])
		: [];
	for (const rx of rxList) {
		try {
			new RegExp(rx, "i");
		} catch {
			problems.push(`golden ${q.id}: regex does not compile: ${rx}`);
		}
	}
	// graded = expect carries ANY grading key (answerRegex, top1UrlIncludes,
	// uniqueUrls, liveSource, …). `note` is prose, not a grader — an expect
	// that is only a note grades nothing anywhere. First run of this rule
	// flagged the four CAP exact-id goldens as ungraded; they grade via
	// top1UrlIncludes, which is exactly why the rule counts KEYS, not names.
	const gradingKeys = Object.keys(q.expect ?? {}).filter((k) => k !== "note");
	if (!gradingKeys.length)
		problems.push(`golden ${q.id}: expect has no grading key (only prose)`);
}

// ── live rot check ──
async function live(): Promise<void> {
	const slugs = new Set<string>();
	for (const c of CATEGORY_BANKS) for (const s of c.anyOf) slugs.add(s);
	for (const [, slug] of knownPairs) slugs.add(slug);
	let checked = 0;
	for (const slug of slugs) {
		try {
			const r = await fetch(
				`https://stellarlight.xyz/api/projects/resolve?q=${encodeURIComponent(slug)}`,
				{ headers: { "User-Agent": "stellarlight-bank-lint" } },
			);
			const d = (await r.json()) as {
				found?: boolean;
				current?: { slug?: string };
			};
			checked++;
			if (!d.found || d.current?.slug !== slug)
				problems.push(
					`bank rot: expected slug '${slug}' does not resolve to itself (found=${d.found}, current=${d.current?.slug ?? "-"})`,
				);
		} catch (e) {
			problems.push(
				`bank rot check errored for '${slug}': ${String(e).slice(0, 60)}`,
			);
		}
	}
	console.log(`  live rot check: ${checked} slugs resolved`);
}

const finish = () => {
	if (problems.length) {
		console.error(`✗ BANK-LINT: ${problems.length} problem(s)`);
		for (const p of problems) console.error(`   ${p}`);
		process.exit(1);
	}
	console.log(
		`✓ bank lint: ${CATEGORY_BANKS.length} category probes · ${knownPairs.length} known-item pairs · ${gq.questions.length} goldens — no authoring defects${LIVE ? ", no rot" : " (offline; --live adds the rot check)"}`,
	);
};
if (LIVE) live().then(finish);
else finish();
