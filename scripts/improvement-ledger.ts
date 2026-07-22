/**
 * Improvement-ledger orchestrator — the FEEDER wiring for src/lib/improvement-ledger.ts.
 *
 * Reads every quality detector's committed artifact (the weekly engine JSONs +
 * the dated raven-drift run), normalizes each finding-array into one shape
 * tagged with its SURFACE, and upserts into the status-tracked ledger. Prior
 * status (in-wave / fixed / verified / lesson) is preserved; a prior `open`
 * finding a detector stops reporting is auto-`cleared`. Emits the /quality
 * summary row.
 *
 *   pnpm exec tsx scripts/improvement-ledger.ts        # write the ledger
 *   pnpm exec tsx scripts/improvement-ledger.ts --dry  # print, don't write
 *
 * No DB / network / token — pure repo-file read, so this is CI-safe (unlike the
 * through-Raven feeder, whose token can't live in CI). Run it after any
 * detector's weekly artifact refreshes; commit ledger/findings.json +
 * engine/weekly/improvement-ledger-latest.json (git history = the dated archive).
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type Finding,
	findingId,
	type Severity,
	type Surface,
	summarizeLedger,
	upsertFindings,
} from "../src/lib/improvement-ledger";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEEKLY = join(ROOT, "improvements/engine/weekly");
const ENGINE = join(ROOT, "improvements/engine");
const LEDGER_FILE = join(ROOT, "improvements/ledger/findings.json");
const SUMMARY_FILE = join(WEEKLY, "improvement-ledger-latest.json");

// biome-ignore lint/suspicious/noExplicitAny: detector artifacts are heterogeneous JSON
type Row = any;

interface ArraySpec {
	key: string;
	surface: Surface;
	mode: string;
	severity: Severity;
	/** keep only rows that are genuine findings (some arrays mix ok+fail) */
	keep?: (r: Row) => boolean;
	/** pull a stable, human probe string from a row */
	probe: (r: Row) => string | undefined;
}

interface SourceSpec {
	source: string;
	file: string; // relative to WEEKLY unless absolute-ish handled below
	dir?: string; // override dir
	arrays: ArraySpec[];
}

const str = (v: unknown): string | undefined =>
	typeof v === "string" && v.trim() ? v.trim() : undefined;

// Contract findings need the op for uniqueness — `note` in one op ≠ `note` in
// another. Qualifies the field/param with its op when both are present.
const opField = (r: Row, key: string): string | undefined => {
	const op = str(r?.op);
	const f = str(r?.[key]);
	if (op && f) return `${op} · ${f}`;
	return f ?? op;
};

// Each detector's finding-arrays, tagged with the surface they belong to.
const SPECS: SourceSpec[] = [
	{
		source: "golden-eval",
		file: "golden-eval-latest.json",
		arrays: [
			{
				key: "graded",
				surface: "retrieval",
				mode: "golden-fail",
				severity: "high",
				keep: (r) => r?.status && r.status !== "PASS" && r.status !== "N/A",
				probe: (r) => str(r?.question) ?? str(r?.id),
			},
		],
	},
	{
		source: "engine-d-demand",
		file: "engine-d-demand-latest.json",
		arrays: [
			{
				key: "misses",
				surface: "retrieval",
				mode: "demand-miss",
				severity: "high",
				probe: (r) => str(r?.query) ?? str(r?.q) ?? str(r?.question),
			},
		],
	},
	{
		source: "engine-a-recall",
		file: "engine-a-recall-latest.json",
		arrays: [
			{
				key: "failures",
				surface: "retrieval",
				// MEDIUM not high: these are answer-key long-tail misses; the
				// bucket-level recall SLA (the green /quality "Recall N/N" row)
				// still passes above its floor. 226 highs would swamp genuine
				// fires (contract gaps, scf overclaims). The ledger's job is to
				// surface this tail; its severity is "work it down", not "on fire".
				mode: "recall-miss",
				severity: "medium",
				// expected is the human-readable intent ("idos in top-3 for …");
				// falls back to the raw probe URL.
				probe: (r) => str(r?.expected) ?? str(r?.probe) ?? str(r?.name),
			},
		],
	},
	{
		source: "scf-crosscheck",
		file: "scf-crosscheck-latest.json",
		arrays: [
			{
				key: "overstated",
				surface: "scf",
				mode: "scf-overstated",
				severity: "high",
				probe: (r) => str(r?.slug) ?? str(r),
			},
			{
				key: "understated",
				surface: "scf",
				mode: "scf-understated",
				severity: "high",
				probe: (r) => str(r?.slug) ?? str(r),
			},
			{
				key: "roundsOverstated",
				surface: "scf",
				mode: "scf-round-overclaim",
				severity: "medium",
				probe: (r) => str(r?.slug) ?? str(r),
			},
		],
	},
	{
		source: "corpus-health",
		file: "corpus-health-latest.json",
		arrays: [
			{
				key: "s5_junk_urls",
				surface: "corpus",
				mode: "junk-url",
				severity: "low",
				probe: (r) => str(r?.url) ?? str(r),
			},
			{
				key: "s6_bad_titles",
				surface: "corpus",
				mode: "bad-title",
				severity: "low",
				probe: (r) => str(r?.url) ?? str(r?.title) ?? str(r),
			},
			{
				key: "s7_stalled",
				surface: "corpus",
				mode: "stalled-source",
				severity: "medium",
				probe: (r) => str(r?.source) ?? str(r),
			},
			{
				key: "s8_mirrors",
				surface: "corpus",
				mode: "mirror-dupe",
				severity: "low",
				probe: (r) => str(r?.url) ?? str(r),
			},
		],
	},
	{
		source: "engine-b-sweeps",
		file: "engine-b-sweeps-latest.json",
		arrays: [
			{
				key: "s3_duplicates",
				surface: "directory",
				mode: "dupe",
				severity: "medium",
				probe: (r) => str(r?.slug) ?? str(r?.name) ?? str(r),
			},
			{
				key: "s3b_domain_duplicates",
				surface: "directory",
				mode: "domain-dupe",
				severity: "medium",
				probe: (r) => str(r?.domain) ?? str(r?.slug) ?? str(r),
			},
			{
				key: "s4_staleness",
				surface: "directory",
				mode: "stale-record",
				severity: "low",
				probe: (r) => str(r?.slug) ?? str(r),
			},
		],
	},
	{
		source: "engine-e-contract",
		file: "engine-e-contract-latest.json",
		arrays: [
			{
				key: "silentParams",
				surface: "contract",
				mode: "silent-param",
				severity: "medium",
				probe: (r) => opField(r, "param"),
			},
			{
				key: "invalidAccepted",
				surface: "contract",
				mode: "invalid-accepted",
				severity: "medium",
				probe: (r) => opField(r, "param"),
			},
			{
				key: "missingFields",
				surface: "contract",
				mode: "missing-field",
				severity: "high",
				probe: (r) => opField(r, "field"),
			},
			{
				key: "ambiguous",
				surface: "contract",
				mode: "ambiguous-contract",
				severity: "low",
				probe: (r) => opField(r, "param"),
			},
		],
	},
];

/** raven-drift is a dated file in improvements/engine/, not weekly/. */
function latestRavenDrift(): string | null {
	if (!existsSync(ENGINE)) return null;
	const files = readdirSync(ENGINE)
		.filter((f) => /^raven-drift-\d{4}-\d{2}-\d{2}\.json$/.test(f))
		.sort();
	return files.length ? join(ENGINE, files[files.length - 1]) : null;
}

function readJson(path: string): Row | null {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

function extractFromSpecs(): { detected: Finding[]; sources: string[] } {
	const nowIso = new Date().toISOString();
	const detected: Finding[] = [];
	const sources: string[] = [];

	for (const spec of SPECS) {
		const path = join(spec.dir ?? WEEKLY, spec.file);
		const data = readJson(path);
		if (!data) {
			console.warn(`  · skip ${spec.source} — artifact missing (${spec.file})`);
			continue;
		}
		sources.push(spec.source);
		let n = 0;
		for (const a of spec.arrays) {
			const arr = data[a.key];
			if (!Array.isArray(arr)) continue;
			for (const row of arr) {
				if (a.keep && !a.keep(row)) continue;
				const probe = a.probe(row);
				if (!probe) continue;
				detected.push({
					id: findingId(spec.source, probe),
					source: spec.source,
					surface: a.surface,
					probe,
					failureMode: a.mode,
					severity: a.severity,
					firstSeen: nowIso,
					lastSeen: nowIso,
					status: "open",
				});
				n++;
			}
		}
		console.log(`  · ${spec.source}: ${n} finding(s)`);
	}

	// raven-drift (consumer surface): only ops MISSING beyond grace are findings;
	// lagging-within-grace is expected, not a finding (catalog-lag ≠ drift).
	const rdPath = latestRavenDrift();
	if (rdPath) {
		const rd = readJson(rdPath);
		if (rd) {
			sources.push("raven-drift");
			const missing: string[] = Array.isArray(rd.missingFromCatalog)
				? rd.missingFromCatalog
				: [];
			for (const op of missing) {
				const probe = str(op);
				if (!probe) continue;
				detected.push({
					id: findingId("raven-drift", probe),
					source: "raven-drift",
					surface: "consumer",
					probe,
					failureMode: "op-missing-from-catalog",
					severity: "medium",
					firstSeen: new Date().toISOString(),
					lastSeen: new Date().toISOString(),
					status: "open",
				});
			}
			console.log(`  · raven-drift: ${missing.length} missing op(s)`);
		}
	}

	return { detected, sources };
}

function main() {
	const dry = process.argv.includes("--dry");
	console.log("improvement-ledger: ingesting detector artifacts…");

	const prior: Finding[] = (readJson(LEDGER_FILE) as Finding[] | null) ?? [];
	const { detected, sources } = extractFromSpecs();
	const nowIso = new Date().toISOString();
	const merged = upsertFindings(prior, detected, sources, nowIso);
	const summary = summarizeLedger(merged, Date.now());

	console.log(
		`\n  ledger: ${summary.total} total · ${summary.open} open · ${summary.closingRate * 100}% closed · oldest open ${summary.oldestOpenDays}d`,
	);
	console.log(
		`  by surface: ${summary.bySurface
			.map((s) => `${s.surface} ${s.open}/${s.total}`)
			.join(" · ")}`,
	);
	if (summary.topOpen.length) {
		console.log("  top backlog:");
		for (const t of summary.topOpen.slice(0, 6)) {
			console.log(
				`    [${t.severity}] ${t.surface}/${t.source}: ${t.probe.slice(0, 60)}`,
			);
		}
	}

	if (dry) {
		console.log("\n(--dry: no files written)");
		return;
	}
	writeFileSync(LEDGER_FILE, `${JSON.stringify(merged, null, "\t")}\n`);
	writeFileSync(SUMMARY_FILE, `${JSON.stringify(summary, null, "\t")}\n`);
	console.log(
		`\n  wrote ${merged.length} findings → improvements/ledger/findings.json`,
	);
	console.log(
		"  wrote summary → improvements/engine/weekly/improvement-ledger-latest.json",
	);
}

main();
