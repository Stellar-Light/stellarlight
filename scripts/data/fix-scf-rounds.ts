/**
 * Fix systemic SCF round-membership corruption — the 2026-07-11 membership
 * baseline (improvements/engine/scf-membership-baseline-2026-07-11.json)
 * found 74 of 272 awarded records listing rounds the OFFICIAL source
 * (communityfund.stellar.org detail pages) affirmatively marks "Not Awarded".
 * Root cause: the rounds enrichment (scripts/enrich-from-scf.ts) scraped the
 * page's badge/submission arrays — which include NOT-awarded submission
 * rounds — instead of per-submission verdicts.
 *
 *   pnpm exec tsx scripts/data/fix-scf-rounds.ts                 # dry run
 *   pnpm exec tsx scripts/data/fix-scf-rounds.ts --execute       # writes
 *   pnpm exec tsx scripts/data/fix-scf-rounds.ts --out=plan.json # plan path
 *   pnpm exec tsx scripts/data/fix-scf-rounds.ts --drop-proven-negatives
 *                                                 # surgical mode (see below)
 *
 * TRUTH RULES (precision over recall — ambiguity NEVER accuses):
 *  - officialAwardedRounds comes from per-submission VERDICTS only
 *    (parseRoundVerdicts in scripts/eval/scf-official.ts, the calibrated
 *    parser shared with scripts/eval/scf-crosscheck.ts). Badge arrays are
 *    never trusted. The parser reads the full negative-verdict vocabulary
 *    ("Not Awarded" / "Prescreen Failed" / "Panel Review Failed" /
 *    "Ineligible" / "Rejected…"); neutral in-flight statuses verdict nothing.
 *  - A rounds write is planned ONLY when (a) the page parse is unambiguous —
 *    ≥1 clearly-parsed submission AND every round we currently list carries a
 *    verdict — and (b) our set ≠ the official set. The write syncs
 *    scf.awardedRounds to the official set EXACTLY (may remove and add).
 *  - Records with any unverdicted round (the crosscheck's roundsUnverifiable
 *    class), unfetchable/unparseable pages, or MULTIPLE matching SCF pages
 *    are SKIPPED with a reason and listed in the plan for hand review.
 *  - --drop-proven-negatives (sls-026 residual, the "ambiguous 13" class):
 *    SURGICAL mode for records the exact-sync rule must skip because SOME
 *    listed round has no verdict. Instead of skipping wholesale, remove ONLY
 *    the rounds the detail page AFFIRMATIVELY marks with a negative verdict
 *    on every submission in that round, and KEEP awarded + unverdicted rounds
 *    exactly as stored (never adds rounds either). Ambiguity shrinks without
 *    accusing: an unverdicted round stays until a human or a future verdict
 *    resolves it, and the plan lists what was kept-unverdicted per write.
 *    Fully-verdicted records still take the exact-sync path.
 *  - scf.totalAwarded is NEVER touched by rounds writes (amounts are
 *    separately sourced — see the crosscheck header for why).
 *  - Boolean flips are ALLOWLIST-ONLY (BOOLEAN_FIXES below): no matter what
 *    the scrape says, scf.awarded is never auto-flipped for any other record.
 *
 * Plan JSON goes to --out (default scf-rounds-plan.json) — never stdout, so
 * Payload's pino logging can't pollute it; progress goes to stderr. Writes
 * are per-record isolated (one failure doesn't abort the wave) and
 * equality-guarded (reruns no-op cleanly).
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";
import {
	canon,
	fetchDetailHtml,
	fetchScf,
	parseRoundVerdicts,
	type ScfEntry,
} from "../eval/scf-official";

const EXECUTE = process.argv.includes("--execute");
/** Surgical mode (sls-026 residual): for records exact-sync must skip because
 * some listed round is unverdicted, drop ONLY affirmatively-negative rounds
 * and keep the rest. See TRUTH RULES in the header. */
const DROP_PROVEN_NEGATIVES = process.argv.includes("--drop-proven-negatives");
const OUT_FILE =
	process.argv.find((x) => x.startsWith("--out="))?.slice("--out=".length) ||
	"scf-rounds-plan.json";

/** Boolean flips are ALLOWLIST-ONLY. Each slug here was HAND-VERIFIED against
 * its official SCF page before listing: coopstable-v2 is scfAwarded=true in
 * our DB while the official record shows submissions in #38 and #40 that are
 * ALL marked "Not Awarded" — zero awarded submissions (verified 2026-07-11 by
 * the membership-baseline author). For allowlisted slugs only, when the page
 * (re-)confirms zero awarded submissions, we set scf.awarded=false,
 * scf.awardedRounds=[], scf.totalAwarded=null, scf.lastAwardedRound=null
 * (every awarded-derived field goes together — a positive lastAwardedRound is
 * the frontend's rounds fallback) and record provenance as a lifecycle note
 * (fill-if-empty, the STATUS_FIX pattern). If the page NO LONGER shows zero
 * awarded submissions, the flip is skipped for review — never applied on
 * changed evidence. */
const BOOLEAN_FIXES = ["coopstable-v2-yield-sharing-stablecoin"];

/** Refuse to EXECUTE a plan larger than this (dry runs always allowed). The
 * expected wave is ~60-75 rounds writes; hundreds would mean the source page
 * layout changed under the parser — a human must re-verify before raising. */
const MAX_EXECUTE_WRITES = 150;

const ASOF = new Date().toISOString().slice(0, 10);
const log = (...a: unknown[]) => console.error(...a);

const toRoundKey = (r: unknown) => String(Number(r));
const setEq = (a: string[], b: string[]) =>
	a.length === b.length && a.every((x) => b.includes(x));

interface DirDoc {
	id: string;
	slug: string;
	name: string;
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	scf: any;
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	lifecycle: any;
}

interface RoundsWrite {
	slug: string;
	name: string;
	url: string;
	from: number[];
	to: number[];
	removed: number[];
	added: number[];
	/** --drop-proven-negatives write: removed only affirmative negatives,
	 * never synced/added; `keptUnverdicted` lists the rounds retained WITHOUT
	 * a verdict (still ambiguous — hand-review candidates). */
	surgical?: true;
	keptUnverdicted?: number[];
}

interface BooleanFix {
	slug: string;
	name: string;
	url: string;
	from: {
		awarded: boolean;
		awardedRounds: number[];
		totalAwarded: number | null;
		lastAwardedRound: number | null;
	};
	evidence: string;
	lifecycleNote: string | null;
}

interface Skip {
	slug: string;
	name: string;
	url?: string;
	ourRounds: number[];
	reason: string;
}

async function main() {
	log(`SCF rounds fix — ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN"}`);
	const payload = await getPayload({ config: await configPromise });

	// ── Load the FULL directory (id/slug/name/scf/lifecycle only — the
	// embedding blob would blow the M0 read path). All rows, not just awarded:
	// the match maps must see every record so an SCF entry can't mis-attach to
	// an awarded row when its true match is a non-awarded one.
	const dir: DirDoc[] = [];
	for (let page = 1; ; page++) {
		const r = await payload.find({
			collection: "projects",
			limit: 200,
			page,
			depth: 0,
			sort: "slug",
			select: { embedding: false },
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		for (const d of r.docs as any[])
			dir.push({
				id: d.id,
				slug: d.slug,
				name: d.name,
				scf: d.scf ?? {},
				lifecycle: d.lifecycle ?? {},
			});
		if (!r.hasNextPage) break;
	}
	const awardedRows = dir.filter((d) => d.scf?.awarded === true);
	log(`  directory: ${dir.length} rows, ${awardedRows.length} scf.awarded`);

	// ── High-precision matching (the crosscheck's rule: exact slug-base OR
	// exact canon-name), tightened for WRITE safety: name matches only when
	// the canon name is UNIQUE across the directory (the crosscheck's
	// first-hit tie-break is fine for a report, not for writes).
	const bySlug = new Map<string, DirDoc>();
	const nameCount = new Map<string, number>();
	for (const d of dir) {
		bySlug.set(d.slug, d);
		const c = canon(d.name);
		nameCount.set(c, (nameCount.get(c) ?? 0) + 1);
	}
	const byUniqueName = new Map<string, DirDoc>();
	for (const d of dir) {
		const c = canon(d.name);
		if (nameCount.get(c) === 1) byUniqueName.set(c, d);
	}

	log("  fetching SCF listing…");
	const scfEntries = await fetchScf();
	const entriesByDirSlug = new Map<string, ScfEntry[]>();
	for (const e of scfEntries) {
		const d = bySlug.get(e.base) ?? byUniqueName.get(canon(e.base));
		if (!d) continue;
		const list = entriesByDirSlug.get(d.slug) ?? [];
		list.push(e);
		entriesByDirSlug.set(d.slug, list);
	}
	log(
		`  SCF: ${scfEntries.length} entries, ${entriesByDirSlug.size} matched to directory rows`,
	);

	// ── Plan ──
	const roundsWrites: RoundsWrite[] = [];
	const booleanFixes: BooleanFix[] = [];
	const skips: Skip[] = [];
	const noops: string[] = [];
	const unmatchedAwarded: string[] = [];
	const updates: Array<{
		id: string;
		slug: string;
		data: Record<string, unknown>;
	}> = [];

	let idx = 0;
	async function worker() {
		for (;;) {
			const i = idx++;
			if (i >= awardedRows.length) return;
			const d = awardedRows[i];
			const oursNums: number[] = (d.scf?.awardedRounds ?? []).map(Number);
			const ours = [...new Set(oursNums.map(toRoundKey))];
			const entries = entriesByDirSlug.get(d.slug) ?? [];

			if (entries.length === 0) {
				// No high-precision source match — not comparable, out of scope.
				unmatchedAwarded.push(d.slug);
				continue;
			}
			if (entries.length > 1) {
				skips.push({
					slug: d.slug,
					name: d.name,
					url: entries.map((e) => e.url).join(" | "),
					ourRounds: oursNums,
					reason:
						"multiple SCF source pages match this record — ambiguous source, review by hand",
				});
				continue;
			}

			const entry = entries[0];
			const html = await fetchDetailHtml(entry.url);
			if (!html) {
				skips.push({
					slug: d.slug,
					name: d.name,
					url: entry.url,
					ourRounds: oursNums,
					reason: "detail page fetch failed — never accuse",
				});
				continue;
			}
			const v = parseRoundVerdicts(html);
			if (v.submissions === 0) {
				skips.push({
					slug: d.slug,
					name: d.name,
					url: entry.url,
					ourRounds: oursNums,
					reason: "no parseable submission cards on the page — never accuse",
				});
				continue;
			}
			const official = [...v.awarded].sort((a, b) => Number(a) - Number(b));
			const officialNums = official.map(Number);

			// ── Allowlisted boolean flip (never generalized) ──
			if (BOOLEAN_FIXES.includes(d.slug)) {
				if (official.length === 0 && v.awardedAnyCount === 0) {
					const evidence = `official page shows ${v.submissions} submission(s), every one marked "Not Awarded" — zero awarded submissions`;
					const note = `SCF correction (${ASOF}): scf.awarded set to false against the official SCF record — ${entry.url} lists ${v.submissions} submission(s), all marked "Not Awarded" (zero awarded). The prior awarded=true with rounds [${oursNums.join(", ")}] came from a badge-array scrape that included not-awarded submission rounds.`;
					booleanFixes.push({
						slug: d.slug,
						name: d.name,
						url: entry.url,
						from: {
							awarded: true,
							awardedRounds: oursNums,
							totalAwarded: d.scf?.totalAwarded ?? null,
							lastAwardedRound: d.scf?.lastAwardedRound ?? null,
						},
						evidence,
						lifecycleNote: d.lifecycle?.note ? null : note,
					});
					const data: Record<string, unknown> = {
						scf: {
							...(d.scf ?? {}),
							awarded: false,
							awardedRounds: [],
							totalAwarded: null,
							lastAwardedRound: null,
						},
					};
					// Provenance rides the write, STATUS_FIX-style (fill-if-empty).
					if (!d.lifecycle?.note)
						data.lifecycle = { ...(d.lifecycle ?? {}), note };
					updates.push({ id: d.id, slug: d.slug, data });
				} else {
					skips.push({
						slug: d.slug,
						name: d.name,
						url: entry.url,
						ourRounds: oursNums,
						reason: `allowlisted boolean fix NOT applied — page now shows awarded evidence (${v.awardedAnyCount} awarded submission(s), rounds [${official.join(", ")}]); re-verify by hand`,
					});
				}
				continue;
			}

			// ── Rounds membership sync ──
			const unknown = ours.filter(
				(r) => !v.awarded.has(r) && !v.notAwarded.has(r),
			);
			if (unknown.length) {
				// The crosscheck's roundsUnverifiable class — ambiguity never
				// accuses, so we can't prove what the full official set is.
				if (DROP_PROVEN_NEGATIVES) {
					// Surgical mode (sls-026 residual): the page can't verdict the
					// FULL set, but rounds it AFFIRMATIVELY marks negative on every
					// submission are still proven wrong on our record. Drop only
					// those; keep awarded + unverdicted rounds byte-identical.
					const provenNegative = ours.filter((r) => v.notAwarded.has(r));
					if (provenNegative.length) {
						const kept = ours.filter((r) => !v.notAwarded.has(r));
						const keptNums = kept.map(Number).sort((a, b) => a - b);
						roundsWrites.push({
							slug: d.slug,
							name: d.name,
							url: entry.url,
							from: oursNums,
							to: keptNums,
							removed: provenNegative.map(Number),
							added: [],
							surgical: true,
							keptUnverdicted: unknown.map(Number),
						});
						updates.push({
							id: d.id,
							slug: d.slug,
							// awardedRounds ONLY (same rule as exact-sync below).
							data: { scf: { ...(d.scf ?? {}), awardedRounds: keptNums } },
						});
						continue;
					}
				}
				skips.push({
					slug: d.slug,
					name: d.name,
					url: entry.url,
					ourRounds: oursNums,
					reason: `no submission verdict found for round(s) ${unknown.map((r) => `#${r}`).join(" ")} — unverifiable, review by hand${DROP_PROVEN_NEGATIVES ? " (surgical mode: no listed round is affirmatively negative, nothing to drop)" : ""}`,
				});
				continue;
			}
			if (setEq(ours, official)) {
				noops.push(d.slug);
				continue;
			}
			roundsWrites.push({
				slug: d.slug,
				name: d.name,
				url: entry.url,
				from: oursNums,
				to: officialNums,
				removed: oursNums.filter((r) => !official.includes(toRoundKey(r))),
				added: officialNums.filter((r) => !ours.includes(toRoundKey(r))),
			});
			updates.push({
				id: d.id,
				slug: d.slug,
				// awardedRounds ONLY — totalAwarded is separately sourced and
				// lastAwardedRound is enrichment-owned (negative codes = special
				// award types). Spread keeps the rest of the group intact.
				data: { scf: { ...(d.scf ?? {}), awardedRounds: officialNums } },
			});
		}
	}
	await Promise.all(Array.from({ length: 8 }, worker));

	roundsWrites.sort((a, b) => a.slug.localeCompare(b.slug));
	booleanFixes.sort((a, b) => a.slug.localeCompare(b.slug));
	skips.sort((a, b) => a.slug.localeCompare(b.slug));
	noops.sort();
	unmatchedAwarded.sort();

	const plan = {
		mode: EXECUTE ? "execute" : "dry-run",
		dropProvenNegatives: DROP_PROVEN_NEGATIVES,
		generatedAt: new Date().toISOString(),
		source:
			"communityfund.stellar.org per-submission verdicts (scripts/eval/scf-official.ts parser — badge arrays never trusted)",
		frame: {
			directory: dir.length,
			awarded: awardedRows.length,
			scfEntries: scfEntries.length,
			matchedAwarded: awardedRows.length - unmatchedAwarded.length,
			unmatchedAwarded: unmatchedAwarded.length,
		},
		summary: {
			roundsWrites: roundsWrites.length,
			surgicalWrites: roundsWrites.filter((w) => w.surgical).length,
			booleanFixes: booleanFixes.length,
			skips: skips.length,
			noops: noops.length,
		},
		roundsWrites,
		booleanFixes,
		skips,
		noops,
		unmatchedAwarded,
		execution: null as null | {
			applied: number;
			failed: Array<{ slug: string; error: string }>;
		},
	};

	log(
		`\nPLAN: ${roundsWrites.length} rounds write(s), ${booleanFixes.length} boolean fix(es), ${skips.length} skip(s), ${noops.length} no-op(s), ${unmatchedAwarded.length} unmatched-awarded`,
	);
	for (const w of roundsWrites)
		log(
			`  ${w.surgical ? "SURGICAL" : "WRITE"} ${w.slug}: [${w.from.join(", ")}] → [${w.to.join(", ")}]${w.removed.length ? ` (drop ${w.removed.map((r) => `#${r}`).join(" ")})` : ""}${w.added.length ? ` (add ${w.added.map((r) => `#${r}`).join(" ")})` : ""}${w.keptUnverdicted?.length ? ` (kept-unverdicted ${w.keptUnverdicted.map((r) => `#${r}`).join(" ")})` : ""}`,
		);
	for (const b of booleanFixes)
		log(
			`  BOOLEAN ${b.slug}: awarded true→false, rounds [${b.from.awardedRounds.join(", ")}]→[], totalAwarded ${b.from.totalAwarded}→null — ${b.evidence}`,
		);
	for (const s of skips) log(`  SKIP ${s.slug}: ${s.reason}`);

	if (EXECUTE && updates.length > MAX_EXECUTE_WRITES) {
		log(
			`\nREFUSING TO EXECUTE: ${updates.length} planned writes exceed the safety cap of ${MAX_EXECUTE_WRITES}. The source layout may have changed under the parser — re-verify before raising MAX_EXECUTE_WRITES.`,
		);
		writeFileSync(OUT_FILE, JSON.stringify(plan, null, 1));
		log(`wrote ${OUT_FILE}`);
		process.exit(1);
	}

	if (EXECUTE) {
		// Per-write isolation (curate-projects pattern): a bad row fails
		// loudly; the rest still land.
		let applied = 0;
		const failed: Array<{ slug: string; error: string }> = [];
		for (const u of updates) {
			try {
				await payload.update({
					collection: "projects",
					id: u.id,
					data: u.data,
					overrideAccess: true,
				});
				applied++;
				log(`  wrote: ${u.slug}`);
			} catch (err) {
				failed.push({ slug: u.slug, error: String(err) });
				log(`  FAILED: ${u.slug} — ${String(err)}`);
			}
		}
		plan.execution = { applied, failed };
		if (failed.length) {
			log(`\n${failed.length} write(s) FAILED — fix and re-run.`);
			process.exitCode = 1;
		}
		log(`\nDONE: ${applied}/${updates.length} write(s) applied.`);
	} else {
		log("\nDRY RUN — no writes applied. Re-run with --execute to apply.");
	}

	writeFileSync(OUT_FILE, JSON.stringify(plan, null, 1));
	log(`wrote ${OUT_FILE}`);
	process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
