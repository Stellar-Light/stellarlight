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
import { isFirstParty, repoGrade } from "../src/lib/repo-grade";
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
				firstParty: isFirstParty(String(r.fullName ?? "")),
				// Scanned facts. Present on the row since the code scan; they
				// reached the grade for the first time on 2026-09-07.
				testsPresent:
					typeof r.testsPresent === "boolean" ? r.testsPresent : null,
				ciPresent: typeof r.ciPresent === "boolean" ? r.ciPresent : null,
				lastReleaseAt:
					(r.activitySignals as { lastReleaseAt?: string })?.lastReleaseAt ??
					null,
				versionStatus:
					typeof r.versionStatus === "string" ? r.versionStatus : null,
				contractInterfaceCount: Array.isArray(r.contractInterface)
					? r.contractInterface.length
					: 0,
				codeScanned: r.codeScanState === "scanned",
				// Feeds the template/scaffold demotion — a repo whose PURPOSE is
				// to be incomplete is a weaker reference than a finished one.
				name: r.fullName ? String(r.fullName) : null,
				// Stored on the row by enrich, which passes it to repoGrade. This
				// script did not, so the same row scored differently depending on
				// which lane wrote it last — the one-field-one-writer flip-flop.
				builderReputation:
					typeof r.builderReputation === "number" ? r.builderReputation : 0,
			});
			const before = Number(r.repoScore ?? -1);
			const labelBefore = r.repoScoreLabel ? String(r.repoScoreLabel) : "";
			// A row whose score is right but whose LABEL is stale still needs a
			// write, so skipping on score alone would leave the 1,741 desynced
			// rows unrepaired by the very run meant to repair them.
			if (grade.score === before && grade.label === labelBefore) continue;
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
					// BOTH fields, always. Writing the score alone left 1,741 rows
					// whose served label contradicted their own score — 11 of them
					// labelled "low" while scoring in the "high" band — because
					// enrich-repos writes the pair and this lane wrote one of them.
					// Same class as the input divergence above: two writers of one
					// concept, behaving differently.
					data: { repoScore: grade.score, repoScoreLabel: grade.label },
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
