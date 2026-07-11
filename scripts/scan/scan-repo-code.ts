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
 *   flags: --limit N (60) · --lang X|all (Rust) · --rescan · --stale-first · --budget N (800)
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import { computeCodeDepth } from "../../src/lib/code-depth";
import { computeFarmScore } from "../../src/lib/code-signals";
import {
	detectSdkCapabilities,
	extractCodeSymbols,
	extractJsSymbols,
} from "../../src/lib/code-symbols";
import { computeJsDepth } from "../../src/lib/js-depth";
import configPromise from "../../src/payload.config";
import { createGh, fetchRepoCode, RateLimitError } from "./fetch-repo-code";
import { errorToWrite, signalsToWrite } from "./write-shape";

const EXECUTE = process.argv.includes("--execute");
const RESCAN = process.argv.includes("--rescan");
// Stale-first (gist gap 4): re-scan repos whose code CHANGED after their last
// scan (lastCommitAt > codeScannedAt) — an SDK 0.7→26 upgrade otherwise keeps
// its stale versionStatus until a wave happens to reach it. Weekly scheduled
// mode in scan-repo-code.yml.
const STALE_FIRST = process.argv.includes("--stale-first");
const argOf = (name: string, dflt: string) => {
	const i = process.argv.indexOf(name);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const LIMIT = Math.max(1, Number(argOf("--limit", "60")) || 60);
const LANG = argOf("--lang", "Rust");
const CALL_BUDGET = Math.max(100, Number(argOf("--budget", "650")) || 650);

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
	console.log(
		`verify — ${res.totalDocs} scanned docs · showing ${docs.length} (read-only)\n`,
	);
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
	// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
	let docs: any[];
	let eligible: number;
	if (STALE_FIRST) {
		// Stale = scanned, but pushed since the scan. Payload where can't compare
		// two fields, so fetch the scanned set (small select) + filter in memory.
		const scanned = await payload.find({
			collection: "repos",
			where: {
				and: [
					...(LANG !== "all" ? [{ primaryLanguage: { equals: LANG } }] : []),
					{ codeScanState: { equals: "scanned" } },
				],
			},
			limit: 3000,
			depth: 0,
			select: {
				fullName: true,
				repoScore: true,
				isFork: true,
				isArchived: true,
				codeScanState: true,
				lastCommitAt: true,
				codeScannedAt: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
		const stale = (scanned.docs as any[]).filter(
			(d) =>
				d.lastCommitAt &&
				d.codeScannedAt &&
				new Date(d.lastCommitAt).getTime() >
					new Date(d.codeScannedAt).getTime(),
		);
		stale.sort((a, b) =>
			String(b.lastCommitAt).localeCompare(String(a.lastCommitAt)),
		);
		eligible = stale.length;
		docs = stale.slice(0, LIMIT);
	} else {
		const res = await payload.find({
			collection: "repos",
			where,
			// Authority first, then freshness (2026-07-11 audit): -lastCommitAt
			// alone let stellar/js-stellar-sdk (repoScore 74, THE symbol-lookup
			// target) sit behind hundreds of recently-pushed small repos — real
			// symbol queries failed while R-SYM read 100% on the 5 repos that
			// happened to be scanned. Canonical/high-score repos are what
			// consumers actually look up; scan them first. (Comma-separated STRING —
			// the array form is silently ignored by the Payload find; verified live
			// 2026-07-11 when a rescan wave picked hackathon repos over score-74
			// js-stellar-sdk.)
			sort: "-repoScore,-lastCommitAt",
			limit: LIMIT,
			depth: 0,
			select: {
				fullName: true,
				repoScore: true,
				isFork: true,
				isArchived: true,
				codeScanState: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
		docs = res.docs as any[];
		eligible = res.totalDocs;
	}
	console.log(
		`eligible: ${eligible} · this wave: ${docs.length}${STALE_FIRST ? " · mode=stale-first (pushed since last scan)" : ""}\n`,
	);

	let callsUsed = 0;
	let scanned = 0;
	let errored = 0;
	let incomplete = 0;
	let budgetStopped = false;
	const lifts: {
		full: string;
		proof: string;
		depth: number;
		cur: number;
		predicted: number;
	}[] = [];

	for (const doc of docs) {
		if (callsUsed >= CALL_BUDGET) {
			budgetStopped = true;
			console.log(
				`\n⏸ call budget reached (${callsUsed}/${CALL_BUDGET}) — stopping wave; re-run for the next batch.`,
			);
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
				let depth =
					r.outcome === "ok" ? computeCodeDepth(r.depthInput).codeDepth : 0;
				// gist gap 1 phase 2: for JS/TS dapps, computeCodeDepth returns a
				// FLAT 0.3 (it only scores Rust contracts). Replace it with the
				// calibrated jsDepth when this is a JS repo with actual JS sources —
				// real dapps rise above 0.3, boilerplate stays at/below it.
				if (r.outcome === "ok" && r.proof === "js-sdk") {
					const jd = computeJsDepth({
						fullName: full,
						blobs: r.depthInput.blobs,
						stellarJsDep: r.facts.stellarJsDep,
						scalars: {
							isFork: r.meta.isFork,
							tagCount: r.meta.tagCount,
							readmeText: r.depthInput.scalars.readmeText,
							topics: r.depthInput.scalars.topics ?? [],
							nameLooksTemplate: r.meta.nameLooksTemplate,
						},
					});
					if (!jd.reasons.includes("no-js-sources")) depth = jd.jsDepth;
				}
				// Rust pub-surface first; JS/TS exported surface when there is none
				// (gist gap 1 phase 1 — facts for the ~1,900 non-Rust repos).
				const rustSymbols =
					r.outcome === "ok" ? extractCodeSymbols(r.depthInput.blobs) : [];
				const symbols =
					rustSymbols.length > 0 || r.outcome !== "ok"
						? rustSymbols
						: extractJsSymbols(r.depthInput.blobs);
				const sdkCapabilities =
					r.outcome === "ok" ? detectSdkCapabilities(r.depthInput.blobs) : [];
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
					{
						outcome: r.outcome,
						scanNote: r.scanNote,
						proof: r.proof,
						facts: r.facts,
						codeDepth: depth,
						farmScore: farm.score,
						farmFlags: farm.flags,
						codeSymbols: symbols,
						sdkCapabilities,
						mainnetContractId: r.depthInput.scalars.mainnetContractId ?? null,
					},
					nowIso,
				);
				if (r.outcome === "ok") {
					scanned++;
					const cur = typeof doc.repoScore === "number" ? doc.repoScore : 0;
					// Approximate predicted repoScore after the next enrich run: the
					// codeDriven override is max(composite, 0.1+0.7*depth) before the
					// archived/fork multipliers, so only predict for plain repos.
					const predicted =
						!doc.isArchived && !doc.isFork && depth > 0
							? Math.max(cur, Math.round((0.1 + 0.7 * depth) * 100))
							: cur;
					if (predicted > cur)
						lifts.push({ full, proof: r.proof, depth, cur, predicted });
					line = `  ok     ${full.padEnd(44)} proof=${r.proof.padEnd(15)} depth=${depth.toFixed(2)} farm=${farm.score} syms=${symbols.length}`;
				} else {
					if (r.outcome === "incomplete") incomplete++;
					else errored++;
					line = `  ${r.outcome.padEnd(6)} ${full.padEnd(44)} ${r.scanNote ?? ""}`;
				}
			}
		} catch (e) {
			// Hard rate limit → STOP the wave; leave this repo (and the rest)
			// pending, not error. Prevents burning scan slots on a token-exhaustion
			// artifact (e.g. stellar/rs-soroban-sdk → blob-unreadable at the tail).
			if (
				e instanceof RateLimitError ||
				(e as Error).message?.includes("RATE_LIMIT")
			) {
				budgetStopped = true;
				console.log(
					`\n⏸ GitHub rate limit hit — stopping wave (repos stay pending, retry next wave).`,
				);
				break;
			}
			callsUsed += 4;
			data = errorToWrite((e as Error).message, nowIso);
			errored++;
			line = `  error  ${full.padEnd(44)} ${(e as Error).message.slice(0, 60)}`;
		}
		console.log(line);
		if (EXECUTE) {
			await payload.update({
				collection: "repos",
				id: doc.id,
				data,
				overrideAccess: true,
			});
		}
	}

	lifts.sort((a, b) => b.predicted - b.cur - (a.predicted - a.cur)).reverse();
	console.log(`\n── wave summary ──`);
	console.log(
		`${EXECUTE ? "wrote" : "would write"}: ${scanned + errored + incomplete} docs (scanned=${scanned} error=${errored} incomplete=${incomplete}) · calls≈${callsUsed}${budgetStopped ? " · BUDGET-STOPPED" : ""}`,
	);
	console.log(
		"tier/unverified/repoScore writes: 0 (by construction — write-shape.ts)",
	);
	if (lifts.length) {
		console.log(
			`\npredicted repoScore lifts after next enrich run (top ${Math.min(12, lifts.length)}):`,
		);
		for (const l of lifts.slice(0, 12))
			console.log(
				`   ${l.full.padEnd(44)} ${String(l.cur).padStart(3)} → ~${l.predicted}  (proof=${l.proof} depth=${l.depth.toFixed(2)})`,
			);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
