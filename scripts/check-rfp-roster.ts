/**
 * Do the briefs /api/rfps serves as open match the ones SCF's RFP Track page
 * lists? sls-096: the page dropped the Q3 briefs on 2026-10-16 and the API
 * kept them open for 17 days. Reads the page's markdown source (the SCF
 * Handbook repo GitBook publishes from) and compares, by title, with the open
 * briefs in src/data/ideas.ts (an open brief's publishedBrief title).
 *
 *   pnpm exec tsx scripts/check-rfp-roster.ts
 *
 * Exit 0: they match. Exit 1: they differ; recheck the page, then
 * ACTIVE_QUARTER, each brief and BRIEF_ROSTER. Exit 2: could not check.
 * Read-only: one GET, no writes.
 */

import { BRIEF_ROSTER, IDEAS, rfpStatus } from "../src/data/ideas";
import { officialOpenBriefs, rosterDrift } from "../src/lib/rfp-roster";

const SOURCE =
	"https://raw.githubusercontent.com/stellar/scf-handbook/main/scf-awards/build-award/rfp-track.md";

async function main() {
	const res = await fetch(SOURCE, {
		signal: AbortSignal.timeout(20_000),
	}).catch(() => null);
	const text = res?.ok ? await res.text().catch(() => null) : null;
	const official = text ? officialOpenBriefs(text) : null;
	if (!official) {
		console.log(
			`could not check: ${SOURCE} ${res ? `answered ${res.status}, or has no Current Open RFPs heading` : "did not answer"}.`,
		);
		process.exit(2);
	}
	const ours = IDEAS.filter((i) => rfpStatus(i.quarter) === "open").map(
		(i) => i.publishedBrief?.title ?? `${i.id} (no published brief linked)`,
	);
	const { notServed, notListed } = rosterDrift(official, ours);
	console.log(
		`SCF lists ${official.length} open brief(s); /api/rfps serves ${ours.length} (roster checked ${BRIEF_ROSTER.checkedOn}).`,
	);
	if (!notServed.length && !notListed.length) return;
	for (const t of notServed)
		console.log(`  listed by SCF, not open here: ${t}`);
	for (const t of notListed)
		console.log(`  open here, not listed by SCF: ${t}`);
	console.log(`Recheck ${BRIEF_ROSTER.source} and src/data/ideas.ts.`);
	process.exit(1);
}

// A crash is no check: exit 2, never the 1 that means the lists differ.
main().catch((err) => {
	console.log(`could not check: ${err instanceof Error ? err.message : err}`);
	process.exit(2);
});
