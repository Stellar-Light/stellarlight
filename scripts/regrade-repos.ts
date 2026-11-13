/**
 * Recompute repoScore for every repo from fields already stored — no GitHub
 * calls, no PAT budget.
 *
 *   pnpm exec tsx scripts/regrade-repos.ts [--execute] [--limit=N]
 *     [--only=owner/repo,owner/repo] [--only-file=<path>]
 *
 * --only and --only-file grade just the named rows (exact names, any letter
 * case; the file holds one name per line, # comments allowed), with the same
 * per-row code as the full pass (src/lib/repo-regrade.ts), and print every
 * move. Built for rows one writer changed under the grade, such as the 38
 * rows enrich-repos unlinked on 2026-11-13, without the full pass's 6,351
 * moves. Any other argument, the space form `--only a/b` included,
 * stops the run before it reads anything: an unread scope would be a full
 * pass. A scoped run plans every page first and writes nothing when a name
 * matches no row or more than one; every write is read back.
 *
 * Why this exists. The grade is computed at WRITE time by whichever lane
 * happens to own a row, and the lanes do not cover the same rows:
 *
 *   enrich-repos      project-linked repos and expanded orgs — re-runs weekly
 *   ingest-dora-evals hackathon submissions — grades once, at CREATE, never again
 *   ingest-ec-taxonomy the long tail
 *
 * So a change to the grading formula reaches only what those lanes happen to
 * touch next. On 2026-09-07 the formula was fixed — an ungated hackathon judge
 * score was setting a flat 85, above every SDK — and the fix could not reach
 * the very rows that motivated it: `402md/agentcard` and its siblings carry
 * scores frozen on 2026-06-19, and enrich-repos skips them because they have no
 * project. A targeted re-enrich matched "0 unique repos from 983 projects".
 *
 * A formula is not a number until something applies it to the data. This is
 * that something: it reads the stored row, recomputes, and writes only where
 * the score actually moved.
 */
import "./load-env";
import { readFileSync } from "node:fs";
import config from "@payload-config";
import { getPayload } from "payload";
import {
	type ProjectAuthority,
	parseRegradeArgs,
	projectAuthority,
	runRegrade,
} from "../src/lib/repo-regrade";

// Before any database access: a mistyped flag must stop here.
const ARGS = parseRegradeArgs(process.argv.slice(2), (p) =>
	readFileSync(p, "utf8"),
);
const ONLY = ARGS.only;

async function main() {
	const payload = await getPayload({ config });

	// Every project, scoped run or not: a row's grade reads its project.
	const projects = new Map<string, ProjectAuthority>();
	for (let page = 1; page < 40; page++) {
		const res = await payload.find({
			collection: "projects",
			limit: 200,
			page,
			depth: 0,
			overrideAccess: true,
		});
		for (const p of res.docs as unknown as Array<Record<string, unknown>>)
			projects.set(String(p.slug), projectAuthority(p));
		if (!res.hasNextPage) break;
	}
	console.log(`projects read: ${projects.size}`);
	if (ONLY) console.log(`scoped to ${ONLY.size} named rows`);

	async function* pages() {
		for (let page = 1; page < 200; page++) {
			const res = await payload.find({
				collection: "repos",
				limit: 200,
				page,
				depth: 0,
				overrideAccess: true,
				context: { internal: true },
			});
			yield res.docs as unknown as Array<Record<string, unknown>>;
			if (!res.hasNextPage) return;
		}
	}

	const run = await runRegrade(pages(), projects, ARGS, async (m) => {
		// BOTH fields, always. Writing the score alone left 1,741 rows whose
		// served label contradicted their own score, because enrich-repos
		// writes the pair and this lane wrote one of them.
		const data = { repoScore: m.to, repoScoreLabel: m.labelTo };
		await payload.update({
			collection: "repos",
			id: m.id,
			data,
			overrideAccess: true,
			context: { internal: true },
		});
		const back = (await payload.findByID({
			collection: "repos",
			id: m.id,
			depth: 0,
			overrideAccess: true,
			context: { internal: true },
		})) as unknown as Record<string, unknown>;
		return back.repoScore === data.repoScore &&
			back.repoScoreLabel === data.repoScoreLabel
			? null
			: `${m.fullName}: wrote ${data.repoScore}/${data.repoScoreLabel}, read ${back.repoScore}/${back.repoScoreLabel}`;
	});

	// A scoped run prints every move; the full pass prints the 20 largest.
	const shown = ONLY
		? [...run.moves].sort((a, b) => a.fullName.localeCompare(b.fullName))
		: [...run.moves]
				.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
				.slice(0, 20);
	console.log(ONLY ? "\nmoves:" : "\nlargest moves:");
	for (const d of shown)
		console.log(
			`  ${d.fullName.padEnd(46)} ${String(d.from).padStart(3)} → ${String(d.to).padStart(3)}  (${d.to - d.from >= 0 ? "+" : ""}${d.to - d.from})  ${d.labelFrom || "none"} → ${d.labelTo}`,
		);
	for (const p of run.problems) console.log(`\nREFUSED, nothing written: ${p}`);
	for (const m of run.mismatched) console.log(`READ-BACK MISMATCH ${m}`);
	console.log(
		`\n${ARGS.execute ? "REGRADED" : "DRY RUN"}: ${run.read} read${ONLY ? ` · ${run.matched.length} of ${ONLY.size} named matched` : ""} · ${run.moves.length} would change${ARGS.execute ? ` · ${run.wrote} written · ${run.wrote - run.mismatched.length} read back` : ""}`,
	);
	process.exit(run.problems.length || run.mismatched.length ? 1 : 0);
}

main().catch((e) => {
	console.error("regrade failed:", e?.message ?? e);
	process.exit(1);
});
