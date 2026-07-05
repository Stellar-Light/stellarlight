/**
 * Signals-only code scanner (Code-Truth Ledger, write v1).
 *
 * Fetches each indexed repo's actual source through the SHARED fetch unit
 * (fetch-repo-code.ts — same path as the probe and scan-report, so scored
 * input can never drift from what was tested) and persists the derived code
 * signals: stellarProof, codeDepth, code facts, farmScore, scan state.
 *
 * SAFETY (v1, by construction — see write-shape.ts + its tests):
 *  - writes ONLY through signalsToWrite()/errorToWrite(): no tier, no
 *    unverifiedStellar, no repoScore — zero demotion risk;
 *  - a failed/partial scan persists only scan-state (never a proof judgment);
 *  - never creates, never deletes — updates existing repo docs only;
 *  - call-budget guard: stops before exhausting the Actions GITHUB_TOKEN
 *    REST allowance (~1000/hr), so a wave can never starve other jobs.
 *
 * Scores move when enrich-repos.ts next runs (it feeds persisted codeDepth
 * into repoGrade) — this script itself never touches scores.
 *
 *   npx tsx scripts/scan/scan-repo-code.ts                       # dry run, 60 Rust repos
 *   npx tsx scripts/scan/scan-repo-code.ts --execute             # write that wave
 *   npx tsx scripts/scan/scan-repo-code.ts --lang all --limit 40 # any language
 *   flags: --limit N (60) · --lang X|all (Rust) · --rescan · --budget N (800)
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import configPromise from "../../src/payload.config";
import { computeCodeDepth } from "../../src/lib/code-depth";
import { computeFarmScore } from "../../src/lib/code-signals";
import { createGh, fetchRepoCode } from "./fetch-repo-code";
import { errorToWrite, signalsToWrite } from "./write-shape";

const EXECUTE = process.argv.includes("--execute");
const RESCAN = process.argv.includes("--rescan");
const argOf = (name: string, dflt: string) => {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const LIMIT = Math.max(1, Number(argOf("--limit", "60")) || 60);
const LANG = argOf("--lang", "Rust");
const CALL_BUDGET = Math.max(100, Number(argOf("--budget", "800")) || 800);

const GH = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
if (!GH) {
	console.error("Set GITHUB_TOKEN.");
	process.exit(1);
}
const gh = createGh(GH);

// --verify: read-only truth-check surface. Prints the PERSISTED signals for
// already-scanned repos so they can be diffed against (a) the repos' actual
// code (fact truth) and (b) a fresh re-compute (determinism). No GitHub calls,
// no writes.
async function verifyMain() {
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "repos",
		where: { codeScanState: { equals: "scanned" } },
		sort: "-codeScannedAt",
		limit: LIMIT,
		depth: 0,
	});
	// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
	const docs = res.docs as any[];
	console.log(`verify — ${res.totalDocs} scanned docs · showing ${docs.length} (read-only)\n`);
	for (const d of docs) {
		console.log(
			JSON.stringify({
				fullName: d.fullName,
				stellarProof: d.stellarProof,
				codeDepth: d.codeDepth,
				sorobanSdkVersion: d.sorobanSdkVersion,
				versionStatus: d.versionStatus,
				contractMacroCount: d.contractMacroCount,
				isDeployableContract: d.isDeployableContract,
				hasAuthPatterns: d.hasAuthPatterns,
				hasStoragePatterns: d.hasStoragePatterns,
				hasEvents: d.hasEvents,
				usesNoStd: d.usesNoStd,
				stellarJsDep: d.stellarJsDep,
				farmScore: d.farmScore,
				codeScannedAt: d.codeScannedAt,
				repoScore: d.repoScore,
				repoScoreLabel: d.repoScoreLabel,
			}),
		);
	}
	process.exit(0);
}

async function main() {
	if (process.argv.includes("--verify")) return verifyMain();
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`scan-repo-code — ${EXECUTE ? "EXECUTE (writing signals)" : "DRY RUN (no writes)"} · lang=${LANG} · limit=${LIMIT} · budget=${CALL_BUDGET} calls`,
	);

	// Wave selection: freshest first (most relevant to consumers), skip repos
	// already scanned unless --rescan (error/incomplete always retry).
	const where = {
		and: [
			...(LANG !== "all" ? [{ primaryLanguage: { equals: LANG } }] : []),
			...(RESCAN ? [] : [{ codeScanState: { not_equals: "scanned" } }]),
		],
	};
	const res = await payload.find({
		collection: "repos",
		where,
		sort: "-lastCommitAt",
		limit: LIMIT,
		depth: 0,
		select: { fullName: true, repoScore: true, isFork: true, isArchived: true, codeScanState: true },
	});
	// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
	const docs = res.docs as any[];
	console.log(`eligible: ${res.totalDocs} · this wave: ${docs.length}\n`);

	let callsUsed = 0;
	let scanned = 0;
	let errored = 0;
	let incomplete = 0;
	let budgetStopped = false;
	const lifts: { full: string; proof: string; depth: number; cur: number; predicted: number }[] = [];

	for (const doc of docs) {
		if (callsUsed >= CALL_BUDGET) {
			budgetStopped = true;
			console.log(`\n⏸ call budget reached (${callsUsed}/${CALL_BUDGET}) — stopping wave; re-run for the next batch.`);
			break;
		}
		const full = doc.fullName as string;
		const nowIso = new Date().toISOString();
		// biome-ignore lint/suspicious/noExplicitAny: update payload shape
		let data: Record<string, any>;
		let line: string;
		try {
			const r = await fetchRepoCode(gh, full);
			callsUsed += (r?.pathsFetched ?? 2) + 5; // tree+meta+tags+readme overhead
			if (!r) {
				data = errorToWrite("no-tree/unfetchable", nowIso);
				errored++;
				line = `  error  ${full.padEnd(44)} no-tree`;
			} else {
				const depth = r.outcome === "ok" ? computeCodeDepth(r.depthInput).codeDepth : 0;
				const farm =
					r.outcome === "ok"
						? computeFarmScore({
								proof: r.proof,
								facts: r.facts,
								isFork: r.meta.isFork,
								commitCount: null,
								repoContributorCount: null,
								diskUsageKb: r.meta.diskUsageKb,
								nameLooksTemplate: r.meta.nameLooksTemplate,
							})
						: { score: 0, flags: [] };
				data = signalsToWrite(
					{ outcome: r.outcome, scanNote: r.scanNote, proof: r.proof, facts: r.facts, codeDepth: depth, farmScore: farm.score, farmFlags: farm.flags },
					nowIso,
				);
				if (r.outcome === "ok") {
					scanned++;
					const cur = typeof doc.repoScore === "number" ? doc.repoScore : 0;
					// Approximate predicted repoScore after the next enrich run: the
					// codeDriven override is max(composite, 0.1+0.7*depth) before the
					// archived/fork multipliers, so only predict for plain repos.
					const predicted =
						!doc.isArchived && !doc.isFork && depth > 0 ? Math.max(cur, Math.round((0.1 + 0.7 * depth) * 100)) : cur;
					if (predicted > cur) lifts.push({ full, proof: r.proof, depth, cur, predicted });
					line = `  ok     ${full.padEnd(44)} proof=${r.proof.padEnd(15)} depth=${depth.toFixed(2)} farm=${farm.score}`;
				} else {
					if (r.outcome === "incomplete") incomplete++;
					else errored++;
					line = `  ${r.outcome.padEnd(6)} ${full.padEnd(44)} ${r.scanNote ?? ""}`;
				}
			}
		} catch (e) {
			callsUsed += 4;
			data = errorToWrite((e as Error).message, nowIso);
			errored++;
			line = `  error  ${full.padEnd(44)} ${(e as Error).message.slice(0, 60)}`;
		}
		console.log(line);
		if (EXECUTE) {
			await payload.update({ collection: "repos", id: doc.id, data, overrideAccess: true });
		}
	}

	lifts.sort((a, b) => b.predicted - b.cur - (a.predicted - a.cur)).reverse();
	console.log(`\n── wave summary ──`);
	console.log(
		`${EXECUTE ? "wrote" : "would write"}: ${scanned + errored + incomplete} docs (scanned=${scanned} error=${errored} incomplete=${incomplete}) · calls≈${callsUsed}${budgetStopped ? " · BUDGET-STOPPED" : ""}`,
	);
	console.log("tier/unverified/repoScore writes: 0 (by construction — write-shape.ts)");
	if (lifts.length) {
		console.log(`\npredicted repoScore lifts after next enrich run (top ${Math.min(12, lifts.length)}):`);
		for (const l of lifts.slice(0, 12))
			console.log(`   ${l.full.padEnd(44)} ${String(l.cur).padStart(3)} → ~${l.predicted}  (proof=${l.proof} depth=${l.depth.toFixed(2)})`);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
