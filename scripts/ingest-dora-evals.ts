/**
 * Ingest hackathon AI/judge evaluation scores into the `repos` code-reference
 * index. Source: scripts/data/dora-evals.json — consolidated, normalized output
 * of dora-cli / human hackathon judging (one record per repo: judgeScore 0-1,
 * the hackathon, winner flag). A code review is the strongest quality signal we
 * have, so a 5/5-reviewed repo becomes a strong reference even at 0 stars.
 *
 * For a repo already in the index: keep its enrich-computed grade but lift it to
 * the judge-driven score if the review is higher (never regress a flagship).
 * For a new repo (most hackathon submissions): fetch GitHub info for
 * searchability + grade it with the review as the dominant signal.
 *
 *   GITHUB_TOKEN=... pnpm exec tsx scripts/ingest-dora-evals.ts            # dry run
 *   GITHUB_TOKEN=... pnpm exec tsx scripts/ingest-dora-evals.ts --execute  # write
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPayload } from "payload";
import { fetchRepoInfo } from "../src/lib/github";
import { repoGrade } from "../src/lib/repo-grade";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const LIMIT = Number(process.env.INGEST_LIMIT || "0") || 0; // 0 = all

interface DoraRec {
	hackathon: string;
	name: string;
	fullName: string; // owner/repo
	url: string;
	rawScore: number;
	judgeScore: number; // 0-1
	prevWinner: boolean;
}

// Mirror the label cutoffs in src/lib/repo-grade.ts.
const labelOf = (s: number): "high" | "medium" | "low" =>
	s >= 70 ? "high" : s >= 40 ? "medium" : "low";
// Same judge-driven curve as repoGrade: 0 → 5, 1 → 85.
const judgeDrivenScore = (j: number) =>
	Math.round((0.05 + 0.8 * Math.max(0, Math.min(1, j))) * 100);

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
	if (
		!process.env.GITHUB_TOKEN?.trim() &&
		!process.env.NEXT_PUBLIC_GITHUB_TOKEN?.trim()
	) {
		console.log(
			"⚠ No GITHUB_TOKEN — new-repo GitHub fetches will be rate-limited.",
		);
	}

	const file = join(
		dirname(fileURLToPath(import.meta.url)),
		"data",
		"dora-evals.json",
	);
	let recs = JSON.parse(readFileSync(file, "utf8")) as DoraRec[];
	if (LIMIT > 0) recs = recs.slice(0, LIMIT);
	console.log(`${recs.length} judged repos to ingest.\n`);

	let lifted = 0,
		created = 0,
		unchanged = 0,
		failed = 0;
	for (const rec of recs) {
		const full = rec.fullName;
		const [owner, name] = full.split("/");
		if (!owner || !name) continue;
		const jdScore = judgeDrivenScore(rec.judgeScore);

		const existing = (
			await payload.find({
				collection: "repos",
				where: { fullName: { equals: full } },
				limit: 1,
				depth: 0,
			})
		).docs[0] as Record<string, any> | undefined;

		if (existing) {
			// Keep the richer enrich grade; only lift it if the review is higher.
			const newScore = Math.max(existing.repoScore ?? 0, jdScore);
			const changed =
				newScore !== (existing.repoScore ?? 0) ||
				existing.judgeScore !== rec.judgeScore ||
				(rec.prevWinner && !existing.hackathonWinner);
			if (!changed) {
				unchanged++;
				continue;
			}
			console.log(
				`  lift   ${full.padEnd(44)} ${existing.repoScore ?? 0}→${newScore}  judge=${rec.judgeScore}`,
			);
			if (EXECUTE) {
				await payload.update({
					collection: "repos",
					id: existing.id,
					data: {
						judgeScore: rec.judgeScore,
						judgedHackathon: rec.hackathon,
						hackathonWinner: !!existing.hackathonWinner || rec.prevWinner,
						repoScore: newScore,
						repoScoreLabel: labelOf(newScore),
					},
				});
			}
			lifted++;
			continue;
		}

		// New hackathon repo — fetch for searchability, grade by the review.
		let info: Awaited<ReturnType<typeof fetchRepoInfo>> | null = null;
		try {
			info = await fetchRepoInfo(owner, name.replace(/\.git$/, ""));
		} catch (e) {
			console.log(
				`  skip   ${full.padEnd(44)} ⚠ ${(e as Error).message.slice(0, 44)}`,
			);
			failed++;
			continue;
		}
		const grade = repoGrade({
			lastCommitAt: info.lastCommitAt,
			stargazerCount: info.stargazerCount,
			isFork: info.isFork,
			isArchived: info.isArchived,
			hackathonWinner: rec.prevWinner,
			hasDescription: !!(info.description && info.description.trim()),
			topicCount: Array.isArray(info.topics) ? info.topics.length : 0,
			openIssues: info.openIssues ?? 0,
			judgeScore: rec.judgeScore,
		});
		console.log(
			`  create ${full.padEnd(44)} score=${grade.score}  judge=${rec.judgeScore} ★${info.stargazerCount}`,
		);
		if (EXECUTE) {
			await payload.create({
				collection: "repos",
				data: {
					fullName: full,
					owner,
					name: name.replace(/\.git$/, ""),
					url: info.url ?? rec.url,
					description: info.description ?? null,
					topics: info.topics ?? [],
					primaryLanguage: info.primaryLanguage ?? null,
					stars: info.stargazerCount ?? 0,
					openIssues: info.openIssues ?? 0,
					lastCommitAt: info.lastCommitAt ?? null,
					homepageUrl: info.homepageUrl ?? null,
					isFork: !!info.isFork,
					isArchived: !!info.isArchived,
					readmeExcerpt: info.readme ?? null,
					hackathonWinner: rec.prevWinner,
					judgeScore: rec.judgeScore,
					judgedHackathon: rec.hackathon,
					repoScore: grade.score,
					repoScoreLabel: grade.label,
					lastEnrichedAt: new Date().toISOString(),
				},
			});
		}
		created++;
	}

	console.log(
		`\n${EXECUTE ? "DONE" : "DRY RUN"}: ${created} created, ${lifted} lifted, ${unchanged} unchanged, ${failed} fetch-failed.`,
	);
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
