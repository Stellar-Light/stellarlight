/**
 * Score a locator battery against a source-locator index, offline, with the
 * route's own matching (candidateTerms, isCandidate, rankRows).
 *
 *   pnpm exec tsx scripts/build-source-locators.ts --no-db --out rows.json
 *   pnpm exec tsx scripts/source-locator-battery.ts --rows rows.json \
 *     --battery improvements/audits/2026-10-23-source-locator/battery.frozen.json [--json out.json]
 *
 * --tarballs <dir> builds the rows from local owner_repo.tar.gz files at the
 * battery's refs instead (same buildRows the builder runs); --also
 * owner/name@ref (repeatable) adds a repo the battery's refs do not list, so
 * a battery written for eight repos is scored over the index of nine.
 *
 * A case is found at k when a top-k pointer has the expected repo and one of
 * the expected (full-answer) paths; the symbol column, and a partial-answer
 * path (partialPaths) when a case lists one, are reported beside it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { isContentStopword } from "../src/lib/repo-search";
import {
	CANDIDATE_CAP,
	CLI_COMMANDS,
	candidateTerms,
	cliCommandPaths,
	type IndexRow,
	isCandidate,
	parseQuery,
	rankRows,
} from "../src/lib/source-locator";
import { buildRows, tarFiles } from "../src/lib/source-locator-extract";

interface Case {
	id: string;
	q: string;
	repo: string;
	paths: string[];
	/** Files that answer part of the question: reported, never counted as found. */
	partialPaths?: string[];
	/** Decoys: reported when served, never a hit. */
	misleadingPaths?: string[];
	symbols?: string[];
	headings?: string[];
}

const args = process.argv.slice(2);
const flag = (n: string) =>
	args.includes(n) ? (args[args.indexOf(n) + 1] ?? null) : null;
const batteryPath = flag("--battery");
if (!batteryPath) throw new Error("--battery <file> is required");
const battery = JSON.parse(readFileSync(batteryPath, "utf8")) as {
	cases?: Case[];
	questions?: Case[];
	refs?: Record<string, string>;
};
const cases = battery.cases ?? battery.questions ?? [];

let rows: IndexRow[] = [];
const rowsPath = flag("--rows");
const tarDir = flag("--tarballs");
if (rowsPath) {
	const byRepo = JSON.parse(readFileSync(rowsPath, "utf8")) as Record<
		string,
		{ rows: IndexRow[] }
	>;
	rows = Object.values(byRepo).flatMap((r) => r.rows);
} else if (tarDir) {
	const also = args.flatMap((a, i) =>
		a === "--also" && args[i + 1] ? [args[i + 1].split("@")] : [],
	);
	for (const [repo, ref] of [...Object.entries(battery.refs ?? {}), ...also]) {
		const buf = gunzipSync(
			readFileSync(join(tarDir, `${repo.replace("/", "_")}.tar.gz`)),
		);
		rows.push(...buildRows(repo, ref, tarFiles(buf)).rows);
	}
} else throw new Error("--rows <file> or --tarballs <dir> is required");

// The commands tree the route reads off the index, read off these rows.
const commands = cliCommandPaths(
	rows.filter((r) => r.repo === CLI_COMMANDS.repo).map((r) => r.path),
);

const results = cases.map((c) => {
	const pq = parseQuery(c.q, isContentStopword, commands);
	const cand = candidateTerms(pq);
	const pool = rows.filter((r) => isCandidate(r, cand));
	const ranked = rankRows(pq, pool);
	const fileRank =
		ranked.findIndex(
			(s) => s.row.repo === c.repo && c.paths.includes(s.row.path),
		) + 1 || null;
	const symbolRank =
		ranked.findIndex(
			(s) =>
				s.row.repo === c.repo &&
				c.paths.includes(s.row.path) &&
				[...(c.symbols ?? []), ...(c.headings ?? [])].includes(
					s.row.locator ?? "",
				),
		) + 1 || null;
	const rankAt = (paths: string[] | undefined) =>
		ranked.findIndex(
			(s) => s.row.repo === c.repo && (paths ?? []).includes(s.row.path),
		) + 1 || null;
	const partialRank = rankAt(c.partialPaths);
	const misleadingRank = rankAt(c.misleadingPaths);
	return {
		id: c.id,
		q: c.q,
		fileRank,
		symbolRank,
		partialRank,
		misleadingRank,
		candidates: pool.length,
		overCap: pool.length > CANDIDATE_CAP,
		matched: ranked.length,
		top3: ranked.slice(0, 3).map((s) => ({
			repo: s.row.repo,
			path: s.row.path,
			locator: s.row.locator,
			score: s.score,
			matchReason: s.matchReason,
		})),
	};
});

const within = (k: number) =>
	results.filter((r) => r.fileRank !== null && r.fileRank <= k).length;
const symbolWithin = (k: number) =>
	results.filter((r) => r.symbolRank !== null && r.symbolRank <= k).length;
const summary = {
	cases: results.length,
	indexPointers: rows.length,
	top1: within(1),
	top3: within(3),
	top10: within(10),
	symbolTop1: symbolWithin(1),
	symbolTop3: symbolWithin(3),
	symbolTop10: symbolWithin(10),
	missedTop10: results
		.filter((r) => r.fileRank === null || r.fileRank > 10)
		.map((r) => r.id),
	/** Missed in the top 10 by full-answer paths, with a partial-answer path there. */
	partialOnlyTop10: results
		.filter(
			(r) =>
				(r.fileRank === null || r.fileRank > 10) &&
				r.partialRank !== null &&
				r.partialRank <= 10,
		)
		.map((r) => r.id),
	/** Cases with a decoy path served in the top 10 (never counted as found). */
	misleadingInTop10: results
		.filter((r) => r.misleadingRank !== null && r.misleadingRank <= 10)
		.map((r) => r.id),
};
for (const r of results)
	console.log(
		`${r.id.padEnd(4)} file@${String(r.fileRank ?? "-").padEnd(4)} symbol@${String(r.symbolRank ?? "-").padEnd(4)} partial@${String(r.partialRank ?? "-").padEnd(4)} decoy@${String(r.misleadingRank ?? "-").padEnd(4)} cand ${String(r.candidates).padEnd(6)} top1 ${r.top3[0] ? `${r.top3[0].repo} ${r.top3[0].path} ${r.top3[0].locator ?? "(file)"} [${r.top3[0].score}]` : "(none)"}`,
	);
console.log(JSON.stringify(summary, null, 2));
const jsonOut = flag("--json");
if (jsonOut)
	writeFileSync(
		jsonOut,
		`${JSON.stringify({ summary, results }, null, "\t")}\n`,
	);
