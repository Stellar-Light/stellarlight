/**
 * Recompute repoScore for every repo from fields already stored — no GitHub
 * calls, no PAT budget.
 *
 *   pnpm exec tsx scripts/regrade-repos.ts [--execute] [--limit=N]
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
import { getPayload } from "payload";
import config from "@payload-config";
import { repoGrade } from "../src/lib/repo-grade";
import { CURATED_CANONICAL_REPOS } from "../src/lib/repo-search";

const EXECUTE = process.argv.includes("--execute");
const LIMIT = Number(
	process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0,
);
const CURATED = new Set(CURATED_CANONICAL_REPOS.map((n) => n.toLowerCase()));

async function main() {
	const payload = await getPayload({ config });

	// Authority inputs live on the project, not the repo.
	const projects = new Map<
		string,
		{ prominence: number; scfAwarded: boolean; hackathonWinner: boolean }
	>();
	for (let page = 1; page < 40; page++) {
		const res = await payload.find({
			collection: "projects",
			limit: 200,
			page,
			depth: 0,
			overrideAccess: true,
		});
		for (const p of res.docs as unknown as Array<Record<string, unknown>>) {
			projects.set(String(p.slug), {
				prominence: Number(p.prominence ?? 0),
				scfAwarded: Boolean((p.scf as { awarded?: boolean })?.awarded),
				hackathonWinner: Boolean(p.hackathonPlacement),
			});
		}
		if (!res.hasNextPage) break;
	}
	console.log(`projects read: ${projects.size}`);

	let read = 0;
	let moved = 0;
	let wrote = 0;
	const deltas: Array<{ full: string; from: number; to: number }> = [];

	for (let page = 1; page < 200; page++) {
		const res = await payload.find({
			collection: "repos",
			limit: 200,
			page,
			depth: 0,
			overrideAccess: true,
			context: { internal: true },
		});
		for (const r of res.docs as unknown as Array<Record<string, unknown>>) {
			read++;
			const slug = r.projectSlug ? String(r.projectSlug) : null;
			const proj = slug ? projects.get(slug) : undefined;
			const notes = Array.isArray(r.knowledgeNotes) ? r.knowledgeNotes : [];
			const grade = repoGrade({
				lastCommitAt: (r.lastCommitAt as string) ?? null,
				stargazerCount: Number(r.stars ?? 0),
				isFork: Boolean(r.isFork),
				isArchived: Boolean(r.isArchived),
				hackathonWinner: Boolean(r.hackathonWinner) || !!proj?.hackathonWinner,
				scfAwarded: !!proj?.scfAwarded,
				projectProminence: proj?.prominence ?? 0,
				hasDescription: !!String(r.description ?? "").trim(),
				topicCount: Array.isArray(r.topics) ? r.topics.length : 0,
				openIssues: Number(r.openIssues ?? 0),
				commits90d:
					typeof (r.activitySignals as { commits90d?: number })?.commits90d ===
					"number"
						? (r.activitySignals as { commits90d: number }).commits90d
						: null,
				codeDepth: typeof r.codeDepth === "number" ? r.codeDepth : null,
				judgeScore: typeof r.judgeScore === "number" ? r.judgeScore : null,
				stellarProof: typeof r.stellarProof === "string" ? r.stellarProof : null,
				knowledgeNoteCount: notes.length,
				curatedCanonical: CURATED.has(String(r.fullName ?? "").toLowerCase()),
			});
			const before = Number(r.repoScore ?? -1);
			if (grade.score === before) continue;
			moved++;
			deltas.push({
				full: String(r.fullName),
				from: before,
				to: grade.score,
			});
			if (EXECUTE) {
				await payload.update({
					collection: "repos",
					id: String(r.id),
					data: { repoScore: grade.score },
					overrideAccess: true,
					context: { internal: true },
				});
				wrote++;
			}
			if (LIMIT && moved >= LIMIT) break;
		}
		if (!res.hasNextPage || (LIMIT && moved >= LIMIT)) break;
	}

	deltas.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
	console.log(`\nlargest moves:`);
	for (const d of deltas.slice(0, 20))
		console.log(
			`  ${d.full.padEnd(46)} ${String(d.from).padStart(3)} → ${String(d.to).padStart(3)}  (${d.to - d.from >= 0 ? "+" : ""}${d.to - d.from})`,
		);
	console.log(
		`\n${EXECUTE ? "REGRADED" : "DRY RUN"}: ${read} read · ${moved} would change${EXECUTE ? ` · ${wrote} written` : ""}`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error("regrade failed:", e?.message ?? e);
	process.exit(1);
});
