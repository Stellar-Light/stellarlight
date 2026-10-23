/**
 * The priority battery's six code_lookup questions, ranked offline with this
 * tree's locateSource code over tarballs at the pinned refs, and graded by
 * that battery's own rule for code items (its METHOD.md 3.5): an item is met
 * when one of the top 10 pointers has the item's repo and path and its
 * locator names the symbol (equal, the last segment after ::, . or a space,
 * or the symbol as a whole word; for `impl Trait for Type`, the trait name);
 * partial when only the repo and path match. A question passes strictly when
 * every must item, and its must_any block, is met.
 *
 *   pnpm exec tsx improvements/audits/2026-10-23-locate-ranking/priority-check.ts \
 *     <priority battery.json> <dir of owner_repo.tar.gz> [--json out.json]
 *
 * The battery is not in this repo; its sha256 is in the README.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { isContentStopword } from "../../../src/lib/repo-search";
import {
	candidateTerms,
	type IndexRow,
	isCandidate,
	parseQuery,
	rankRows,
	SOURCE_REPO_NAMES,
} from "../../../src/lib/source-locator";
import { buildRows, tarFiles } from "../../../src/lib/source-locator-extract";

const REFS: Record<string, string> = {
	"stellar/stellar-core": "05c6328c13b595c52b6ad1ecd1e69cd9b2a582d4",
	"stellar/rs-soroban-sdk": "8e5b425dce5fa1dcd5a3fe1d3f3fcd18431586dd",
	"stellar/rs-soroban-env": "0c99950e96128beba3319aa96b116646ce974e69",
	"stellar/js-stellar-sdk": "0f2fd40ba6db761390e3e5e4eb5c432234696a61",
	"stellar/stellar-rpc": "ec4171d970ac812d9f4317b3cce2c315baa31320",
	"stellar/quickstart": "0ff76e336a438370ba900db7f437dcbe5b90dda7",
	"stellar/stellar-cli": "4ff88b7ea11dd3c847bb711b80258517148e1529",
	"stellar/soroban-examples": "03d42aa6b973dcf3a453a99d0c6a6e8d25a196e2",
	"OpenZeppelin/stellar-contracts": "ddc327eb92d63709436da3a8455f641c2d5476c5",
};
const IDS = [
	"hm26-sc-05",
	"hm26-sc-06",
	"hm26-sa-05",
	"hm26-sa-06",
	"hm26-cc-05",
	"hm26-cc-06",
];

interface Item {
	repo: string;
	path: string;
	symbol: string;
}
interface Question {
	id: string;
	q: string;
	expect: {
		must?: Item[];
		must_any?: { n: number; of: Item[] };
		should?: Array<Item | string>;
	};
}

const norm = (s: string) =>
	s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bounded = (t: string, text: string) =>
	new RegExp(`(?<![a-z0-9])${esc(t)}(?![a-z0-9])`).test(text);
function symOk(sym: string, loc: string | null): boolean {
	const l = loc ?? "";
	if (sym.startsWith("impl "))
		return bounded(norm(sym.split(/\s+/)[1]), norm(l));
	const last = l.trim()
		? (l
				.trim()
				.split(/::|\.|\s/)
				.pop() ?? "")
		: "";
	return l === sym || last === sym || bounded(norm(sym), norm(l));
}

const [batteryPath, tarDir] = process.argv.slice(2);
const jsonAt = process.argv.indexOf("--json");
const rows: IndexRow[] = [];
for (const [repo, ref] of Object.entries(REFS)) {
	if (!SOURCE_REPO_NAMES.includes(repo)) continue;
	const buf = gunzipSync(
		readFileSync(join(tarDir, `${repo.replace("/", "_")}.tar.gz`)),
	);
	rows.push(...buildRows(repo, ref, tarFiles(buf)).rows);
}
const questions = (
	JSON.parse(readFileSync(batteryPath, "utf8")) as { questions: Question[] }
).questions.filter((x) => IDS.includes(x.id));

const results = questions.map((q) => {
	const pq = parseQuery(q.q, isContentStopword);
	const cand = candidateTerms(pq);
	const ranked = rankRows(
		pq,
		rows.filter((r) => isCandidate(r, cand)),
	);
	const grade = (it: Item) => {
		const same = (r: { repo: string; path: string }) =>
			r.repo.toLowerCase() === it.repo.toLowerCase() && r.path === it.path;
		const top = ranked.slice(0, 10).map((s) => s.row);
		const at = top.findIndex((r) => same(r) && symOk(it.symbol, r.locator));
		const anywhere =
			ranked.findIndex((s) => same(s.row) && symOk(it.symbol, s.row.locator)) +
				1 || null;
		return {
			item: `${it.repo} ${it.path} ${it.symbol}`,
			result: at >= 0 ? "met" : top.some(same) ? "partial" : "not_met",
			rank: anywhere,
		};
	};
	const must = (q.expect.must ?? []).map(grade);
	const anyItems = q.expect.must_any?.of.map(grade) ?? [];
	const anyMet = anyItems.filter((i) => i.result === "met").length;
	const anyOk = !q.expect.must_any || anyMet >= q.expect.must_any.n;
	return {
		id: q.id,
		strict: must.every((m) => m.result === "met") && anyOk,
		requiredMet:
			must.filter((m) => m.result === "met").length +
			(q.expect.must_any && anyOk ? 1 : 0),
		requiredTotal: must.length + (q.expect.must_any ? 1 : 0),
		must,
		mustAny: q.expect.must_any
			? { n: q.expect.must_any.n, met: anyMet, items: anyItems }
			: null,
		should: (q.expect.should ?? [])
			.filter((s): s is Item => typeof s === "object")
			.map(grade),
		top10: ranked.slice(0, 10).map((s) => ({
			repo: s.row.repo,
			path: s.row.path,
			locator: s.row.locator,
			score: s.score,
			matchReason: s.matchReason,
		})),
	};
});
const summary = {
	strict: results.filter((r) => r.strict).length,
	requiredMet: results.reduce((a, r) => a + r.requiredMet, 0),
	requiredTotal: results.reduce((a, r) => a + r.requiredTotal, 0),
};
for (const r of results) {
	console.log(
		`${r.id} strict=${r.strict} required ${r.requiredMet}/${r.requiredTotal}`,
	);
	for (const m of [...r.must, ...(r.mustAny?.items ?? [])])
		console.log(
			`   must ${m.result.padEnd(8)} rank ${String(m.rank ?? "-").padEnd(5)} ${m.item}`,
		);
}
console.log(JSON.stringify(summary));
if (jsonAt > 0)
	writeFileSync(
		process.argv[jsonAt + 1],
		`${JSON.stringify({ summary, results }, null, "\t")}\n`,
	);
