/**
 * Partner coverage eval: how well Scout surfaces announced Stellar partners,
 * scored mechanically against the live public API.
 *
 * Fixture: scripts/eval/partner-coverage.json (88 partners: 59 sourced from
 * SDF pages, 28 from the partner's own announcement, 1 listed from its
 * operator's site; 17 questions; reviewed overrides). Rules:
 * src/lib/partner-coverage.ts. Per partner: /api/projects/search ranks the
 * expected row within k for its name, the row carries an expected type, a
 * status and network the source allows, a website on its domain; resolve
 * finds the slug (depth); with no row, research decides research-only or
 * missing. Per question: recall@10 with and without the type filter.
 *
 * Read-only GETs, about one per second, a stellarlight-* user agent, retries
 * on 429 and 5xx. No /api/ask. A read that fails after retries is
 * could-not-check, never a miss.
 *
 * Exit 0: no regression. 1: a regression against the committed baseline
 * (scripts/eval/partner-coverage-baseline.json), or a baseline out of sync
 * with the fixture; the report files are written first. 2: no verdict: more
 * than --max-unreadable of the units (partner classes, resolves, question
 * variants) could not be read, a unit of a partner the baseline holds with
 * a row (well or wrong) could not be read, the API version moved mid-run on
 * a rerun too (a move during the first run scores again once), or the API
 * refused a request (a 4xx other than 429: the eval is broken). 3: the script
 * failed. A crash before main() runs exits 1 with no report, which the
 * workflow reads as could-not-score, not as a regression.
 *
 *   pnpm exec tsx scripts/eval/partner-coverage.ts [--json out.json] [--md out.md]
 *     [--max-unreadable 0.1] [--update-baseline]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
	applyOverrides,
	type Baseline,
	CLASSES,
	type Cls,
	type Comparison,
	compareToBaseline,
	EvalBroken,
	type Fixture,
	noVerdict,
	type PartnerResult,
	pacedReader,
	type QuestionResult,
	scorePartner,
	scoreQuestion,
	stableRun,
	summarize,
	toBaseline,
} from "../../src/lib/partner-coverage";

const FIXTURE = "scripts/eval/partner-coverage.json";
const BASELINE = "scripts/eval/partner-coverage-baseline.json";
const BASE = process.env.SCOUT_BASE ?? "https://www.stellarlight.xyz";
const UA =
	"stellarlight-partner-coverage-eval/1.0 (+https://github.com/Stellar-Light/stellarlight)";
const args = process.argv.slice(2);
const opt = (n: string) =>
	args.includes(n) ? args[args.indexOf(n) + 1] : undefined;
const UPDATE = args.includes("--update-baseline");

const reader = pacedReader({
	base: BASE,
	userAgent: UA,
	gapMs: 1100,
	attempts: 4,
	log: (line) => console.warn(`  ${line}`),
});
const get = reader.get;

async function apiVersion(): Promise<string | null> {
	const d = (await get("/api/openapi.json", {})) as {
		info?: { version?: string };
	} | null;
	return d?.info?.version ?? null;
}

const LABEL: Record<Cls, string> = {
	well: "covered well",
	wrong: "covered but wrong type, status, network or website",
	"research-only": "covered only in research",
	missing: "missing",
	"could-not-check": "could not check",
};

function markdown(
	fx: Fixture,
	run: {
		generatedAt: string;
		apiVersion: { start: string | null; end: string | null };
		requests: number;
		failedReads: number;
		owners: Record<string, number>;
	},
	partners: PartnerResult[],
	questions: QuestionResult[],
	s: ReturnType<typeof summarize>,
	cmp: Comparison | null,
	verdictless: string | null,
): string {
	const n = partners.length;
	const L: string[] = [
		"# Partner coverage eval",
		"",
		`**Scout covers ${s.totals.well} of ${n} announced partners well** (${run.owners.sdf ?? 0} SDF-sourced, ${run.owners.partner ?? 0} partner-sourced, ${run.owners.operator ?? 0} listed from an operator's own site and not SDF). Run ${run.generatedAt}, API ${run.apiVersion.start}${run.apiVersion.end !== run.apiVersion.start ? ` -> ${run.apiVersion.end} (moved mid-run: not comparable)` : ""}, ${run.requests} reads (${run.failedReads} failed after retries), ${s.unreadable.units} of ${s.unreadable.total} units unreadable. Fixture: ${FIXTURE}.`,
		"",
		"| Class | Partners |",
		"|---|---|",
		...CLASSES.filter((c) => c !== "could-not-check" || s.totals[c]).map(
			(c) => `| ${LABEL[c]} | ${s.totals[c]} |`,
		),
		"",
		"## By category",
		"",
		"| Category | Partners | Well | Wrong | Research only | Missing | Could not check |",
		"|---|---|---|---|---|---|---|",
		...Object.entries(fx.categories).map(([key, label]) => {
			const t = s.byCategory[key];
			if (!t) return `| ${label} | 0 | | | | | |`;
			const sum = CLASSES.reduce((a, c) => a + t[c], 0);
			return `| ${label} | ${sum} | ${t.well} | ${t.wrong} | ${t["research-only"]} | ${t.missing} | ${t["could-not-check"]} |`;
		}),
		"",
		`## Questions (recall@${fx.k.question})`,
		"",
		"| # | Question | Type | q only | q + type | Matches (q + type) |",
		"|---|---|---|---|---|---|",
		...questions.map((q) => {
			const v = (name: string) => q.variants.find((x) => x.variant === name);
			const cell = (name: string) => {
				const x = v(name);
				if (!x) return "n/a";
				if (x.state === "could-not-check") return "could not check";
				return `${Object.keys(x.found).length}/${q.expected.length}`;
			};
			return `| ${q.id} | ${q.question} | ${q.type ?? "none"} | ${cell("q")} | ${cell("q+type")} | ${v("q+type")?.total ?? "n/a"} |`;
		}),
		"",
		"## Depth checks",
		"",
		"Per partner check, counted over all partners (n/a: no row, or no sourced fact).",
		"",
		"| Check | pass | fail | unknown | could not check | n/a |",
		"|---|---|---|---|---|---|",
		...Object.entries(s.depth).map(
			([c, t]) =>
				`| ${c} | ${t.pass ?? 0} | ${t.fail ?? 0} | ${t.unknown ?? 0} | ${t["could-not-check"] ?? 0} | ${t["n/a"] ?? 0} |`,
		),
	];
	if (cmp) {
		const list = (title: string, xs: string[]) =>
			xs.length
				? ["", `### ${title} (${xs.length})`, "", ...xs.map((x) => `- ${x}`)]
				: [];
		L.push(
			"",
			"## Ratchet",
			"",
			verdictless
				? `No verdict: ${verdictless}.`
				: cmp.regressions.length || cmp.stale.length || cmp.unbaselined.length
					? "Red: see below."
					: "No regression against the baseline.",
			...list("Regressions", cmp.regressions),
			...list("Stale baseline entries", cmp.stale),
			...list("Not in the baseline", cmp.unbaselined),
			...list("Unreadable units of partners with a row", cmp.unreadableWithRow),
			...list("Improvements", cmp.improvements),
			...list("Changes (not failed)", cmp.changes),
			...list("Not compared (could not check)", cmp.notCompared),
		);
	}
	L.push(
		"",
		"## Partners not covered well",
		"",
		"| Partner | Category | Class | Problems |",
		"|---|---|---|---|",
		...partners
			.filter((p) => p.cls !== "well")
			.map(
				(p) =>
					`| ${p.name} | ${fx.categories[p.category] ?? p.category} | ${LABEL[p.cls]} | ${p.problems.join("; ") || (p.research?.announcement ? "announcement in research" : p.research?.mentions.length ? `research names it: ${p.research.mentions.slice(0, 2).join("; ")}` : "")} |`,
			),
		"",
	);
	return L.join("\n");
}

async function main() {
	const max = Number(opt("--max-unreadable") ?? 0.1);
	if (!Number.isFinite(max) || max < 0 || max > 1)
		throw new EvalBroken(
			`--max-unreadable must be a share from 0 to 1, got '${opt("--max-unreadable")}'`,
		);
	const fx = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;
	const partners = applyOverrides(fx);
	const byName = new Map(partners.map((p) => [p.name, p]));
	const generatedAt = new Date().toISOString();
	console.log(`partner coverage eval: ${BASE}`);

	const score = async () => {
		const pr: PartnerResult[] = [];
		for (const [i, p] of partners.entries()) {
			const r = await scorePartner(p, get, fx.k.partner);
			pr.push(r);
			console.log(
				`[${i + 1}/${partners.length}] ${p.name}: ${r.cls}${r.row ? ` (${r.row.slug} #${r.row.rank})` : ""}`,
			);
		}
		const qr: QuestionResult[] = [];
		for (const q of fx.questions) {
			const r = await scoreQuestion(q, byName, get, fx.k.question);
			qr.push(r);
			console.log(
				`${q.id}: ${r.variants.map((v) => `${v.variant} ${v.state === "read" ? `${Object.keys(v.found).length}/${q.expected.length}` : v.state}`).join(", ")}`,
			);
		}
		return { pr, qr };
	};
	// A deploy mid-run makes the reads incomparable; score once more first.
	const version = async () => {
		const v = await apiVersion();
		console.log(`API version ${v}`);
		return v;
	};
	const runOnce = await stableRun(version, score);
	const { start, end } = runOnce;
	const { pr, qr } = runOnce.result;
	if (runOnce.attempts > 1)
		console.log(
			`scored ${runOnce.attempts} times: the API version moved during the first run`,
		);
	const s = summarize(pr, qr);
	const baseline = existsSync(BASELINE)
		? (JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline)
		: null;
	const cmp = baseline ? compareToBaseline(pr, qr, baseline) : null;
	const verdictless = noVerdict({
		start,
		end,
		share: s.unreadable.share,
		max,
		cmp,
	});
	const owners: Record<string, number> = {};
	for (const p of partners)
		owners[p.source.owner] = (owners[p.source.owner] ?? 0) + 1;
	const run = {
		generatedAt,
		apiVersion: { start, end },
		requests: reader.stats.requests,
		failedReads: reader.stats.failed,
		owners,
		attempts: runOnce.attempts,
	};

	const md = markdown(fx, run, pr, qr, s, cmp, verdictless);
	console.log(`\n${md}`);
	const json = opt("--json");
	if (json)
		writeFileSync(
			json,
			`${JSON.stringify({ ...run, base: BASE, k: fx.k, summary: s, comparison: cmp, partners: pr, questions: qr }, null, 1)}\n`,
		);
	const mdOut = opt("--md");
	if (mdOut) writeFileSync(mdOut, md);

	if (verdictless) {
		console.log(`No verdict: ${verdictless}.`);
		process.exitCode = 2;
		return;
	}
	if (UPDATE) {
		if (s.unreadable.units) {
			console.log(
				`${s.unreadable.units} units could not be read; a baseline needs a fully readable run.`,
			);
			process.exitCode = 2;
			return;
		}
		writeFileSync(
			BASELINE,
			`${JSON.stringify(toBaseline(pr, qr, { generatedAt, apiVersion: start }), null, "\t")}\n`,
		);
		// The pre-push hook gates formatting on changed JSON; write it formatted.
		execFileSync("pnpm", ["exec", "biome", "format", "--write", BASELINE]);
		console.log(`baseline rewritten: ${BASELINE}`);
		return;
	}
	if (!cmp) {
		console.log(`no baseline at ${BASELINE}; run with --update-baseline.`);
		process.exitCode = 1;
		return;
	}
	if (cmp.regressions.length || cmp.stale.length || cmp.unbaselined.length)
		process.exitCode = 1;
}

main().catch((e) => {
	console.error(e);
	process.exit(e instanceof EvalBroken ? 2 : 3);
});
