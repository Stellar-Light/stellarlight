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

import "../load-env";
import { getPayload } from "payload";
import { computeCodeDepth } from "../../src/lib/code-depth";
import { deriveCodeDomains } from "../../src/lib/code-domains";
import { computeFarmScore } from "../../src/lib/code-signals";
import {
	detectSdkCapabilities,
	extractCodeSymbols,
	extractContractInterface,
	extractJsSymbols,
} from "../../src/lib/code-symbols";
import { computeJsDepth } from "../../src/lib/js-depth";
import { isKnownInfraNotDeployable } from "../../src/lib/known-infra";
import { computeLangDepth } from "../../src/lib/lang-depth";
import { isAllowlisted } from "../../src/lib/repo-allowlist";
import { extractStellarDeps } from "../../src/lib/stellar-deps";
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
// Targeted rescan: --only owner/repo pins the wave to ONE repo regardless of
// scan state or staleness. Needed when a repo's DEFAULT BRANCH switches after
// its scan (trustlesswork 2026-07-20): the new branch's commits predate
// codeScannedAt, so stale-first (lastCommitAt > codeScannedAt) never re-picks
// it while the indexed snapshot describes a branch that no longer fronts the
// repo.
const ONLY = argOf("--only", "");
const LIMIT = Math.max(1, Number(argOf("--limit", "60")) || 60);
const LANG = argOf("--lang", "Rust");
// Explicit --budget wins; with no flag the budget is POOL-AWARE, resolved in
// main() from the live rate limit. The old constant default (650) was sized
// for the 1,000/hr Actions token and silently starved every cron wave after
// the 5,000/hr PAT landed — 12h of 2h-cadence waves yielded +47 scans
// (found 2026-08-15). rate_limit is quota-exempt.
const BUDGET_FLAG = argOf("--budget", "");
let CALL_BUDGET = Math.max(100, Number(BUDGET_FLAG) || 650);

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
	if (!BUDGET_FLAG) {
		try {
			const rl = (await (
				await fetch("https://api.github.com/rate_limit", {
					headers: { Authorization: `Bearer ${GH}` },
				})
			).json()) as { resources?: { core?: { remaining?: number } } };
			const remaining = rl?.resources?.core?.remaining;
			if (typeof remaining === "number")
				CALL_BUDGET = Math.max(100, remaining - 400);
			console.log(
				`pool-aware budget: core remaining=${remaining ?? "?"} → budget=${CALL_BUDGET} (reserve 400)`,
			);
		} catch {
			console.log(
				`rate_limit probe failed — keeping fallback budget=${CALL_BUDGET}`,
			);
		}
	}
	console.log(
		`scan-repo-code — ${EXECUTE ? "EXECUTE (writing signals)" : "DRY RUN (no writes)"} · lang=${LANG} · limit=${LIMIT} · budget=${CALL_BUDGET} calls`,
	);

	// Wave selection: never-scanned AND pushed-since-scan repos compete on the
	// same -repoScore,-lastCommitAt key (re-scan policy 2026-08-08); --rescan
	// widens to everything (error/incomplete always retry).
	const where = {
		and: [
			...(LANG !== "all" ? [{ primaryLanguage: { equals: LANG } }] : []),
			// error rows excluded from routine waves (2026-08-15): the same ~65
			// blob-unreadable dead repos re-erred EVERY wave, burning budget at
			// the front of each run. --rescan still retries them deliberately.
			...(RESCAN ? [] : [{ codeScanState: { not_in: ["scanned", "error"] } }]),
		],
	};
	// Triaged repos (dead-long-tail, inert-fork, …) are human-vocabulary
	// verdicts that scanning cannot change — skip them so wave budget goes to
	// repos whose code truth matters. Allowlisted canon never carries tags
	// (repo-triage.ts guard), so no canonical repo can ever be skipped.
	// NOTE: reads need context.internal or the afterRead privacy hook strips
	// triageTags and this filter silently never fires (the #896 class).
	// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
	const notTriaged = (d: any) =>
		!(Array.isArray(d.triageTags) && d.triageTags.length > 0);
	let skippedTriaged = 0;
	// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
	let docs: any[];
	let eligible: number;
	if (ONLY) {
		const res = await payload.find({
			collection: "repos",
			where: { fullName: { equals: ONLY } },
			limit: 1,
			depth: 0,
			// The #896 class recurring in a second call site (audit 2026-08-31):
			// without context.internal the afterRead privacy hook strips triageTags,
			// so the notTriaged() filter above could never see them on --only runs.
			context: { internal: true },
		});
		docs = res.docs;
		eligible = res.docs.length;
		if (!docs.length) {
			console.log(`--only ${ONLY}: no such repo in the index`);
		}
	} else if (STALE_FIRST) {
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
			context: { internal: true },
			select: {
				fullName: true,
				repoScore: true,
				isFork: true,
				isArchived: true,
				codeScanState: true,
				lastCommitAt: true,
				codeScannedAt: true,
				triageTags: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
		const staleAll = (scanned.docs as any[]).filter(
			(d) =>
				d.lastCommitAt &&
				d.codeScannedAt &&
				new Date(d.lastCommitAt).getTime() >
					new Date(d.codeScannedAt).getTime() &&
				// Same 24h re-scan cooldown as the default branch (2026-08-15).
				Date.now() - new Date(d.codeScannedAt).getTime() > 24 * 36e5,
		);
		const stale = staleAll.filter(notTriaged);
		skippedTriaged += staleAll.length - stale.length;
		stale.sort((a, b) =>
			String(b.lastCommitAt).localeCompare(String(a.lastCommitAt)),
		);
		eligible = stale.length;
		docs = stale.slice(0, LIMIT);
	} else {
		// Re-scan policy (2026-08-08): a stale scan is as missing as no scan.
		// Eligible = never-scanned OR pushed-since-scan, ALL ranked by the same
		// key, so a changed js-stellar-sdk (74) re-scans before a never-scanned
		// hackathon repo — code truth stays fresh on the repos consumers actually
		// query. (The old weekly --stale-first wave ranked by recency, which put
		// hot small repos ahead of changed canonical SDKs — the 34/48 stale gap.)
		// Payload `where` can't compare two fields → fetch the scanned pool small
		// and filter in memory, same as the --stale-first branch.
		const scannedPoolP = RESCAN
			? // --rescan makes `where` include scanned repos already — skip the
				// second pool so nothing double-counts.
				Promise.resolve({ docs: [] })
			: payload.find({
					collection: "repos",
					where: {
						and: [
							...(LANG !== "all"
								? [{ primaryLanguage: { equals: LANG } }]
								: []),
							{ codeScanState: { equals: "scanned" } },
						],
					},
					limit: 3000,
					depth: 0,
					context: { internal: true },
					select: {
						fullName: true,
						repoScore: true,
						isFork: true,
						isArchived: true,
						codeScanState: true,
						lastCommitAt: true,
						codeScannedAt: true,
						triageTags: true,
					},
				});
		// Page through the unscanned pool until the wave is FULL of scannable
		// repos. A single over-fetch (LIMIT*2, sorted -repoScore) stopped
		// advancing once the head of that order was mostly triaged: on
		// 2026-09-01 three waves scanned 166, 9 and 4 repos with ~4,600 calls
		// unspent each while 6,008 were eligible — the window never moved past
		// the 834–996 triaged rows sitting at the top. Bounded at 12 pages
		// (12×LIMIT*2 rows of a tiny select) so a fully-triaged pool still ends.
		// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
		const unscannedDocs: any[] = [];
		let unscannedTotal = 0;
		for (let page = 1; page <= 12; page++) {
			const res = await payload.find({
				collection: "repos",
				where,
				// Authority first, then freshness (2026-07-11 audit): -lastCommitAt
				// alone let stellar/js-stellar-sdk (repoScore 74, THE symbol-lookup
				// target) sit behind hundreds of recently-pushed small repos.
				// (Comma-separated STRING — the array form is silently ignored by
				// the Payload find; verified live 2026-07-11.)
				sort: "-repoScore,-lastCommitAt",
				limit: LIMIT * 2,
				page,
				depth: 0,
				context: { internal: true },
				select: {
					fullName: true,
					repoScore: true,
					isFork: true,
					isArchived: true,
					codeScanState: true,
					lastCommitAt: true,
					triageTags: true,
				},
			});
			unscannedTotal = res.totalDocs;
			// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
			unscannedDocs.push(...(res.docs as any[]));
			if (unscannedDocs.filter(notTriaged).length >= LIMIT || !res.hasNextPage)
				break;
		}
		const scannedPool = await scannedPoolP;
		// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
		const staleAll = (scannedPool.docs as any[]).filter(
			(d) =>
				d.lastCommitAt &&
				d.codeScannedAt &&
				new Date(d.lastCommitAt).getTime() >
					new Date(d.codeScannedAt).getTime() &&
				// 24h re-scan cooldown (2026-08-15): at the 2h cron cadence the
				// unified policy re-scanned every fresh-commit canonical repo
				// EVERY wave (12x/day) — the tail starved (+47 scans in 11h).
				// Freshness intent is DAILY; clamp re-scan frequency to it.
				Date.now() - new Date(d.codeScannedAt).getTime() > 24 * 36e5,
		);
		const stale = staleAll.filter(notTriaged);
		const unscannedKept = unscannedDocs.filter(notTriaged);
		skippedTriaged +=
			staleAll.length -
			stale.length +
			(unscannedDocs.length - unscannedKept.length);
		docs = [...unscannedKept, ...stale]
			.sort(
				(a, b) =>
					(b.repoScore ?? 0) - (a.repoScore ?? 0) ||
					String(b.lastCommitAt ?? "").localeCompare(
						String(a.lastCommitAt ?? ""),
					),
			)
			.slice(0, LIMIT);
		eligible = unscannedTotal + stale.length;
		// totalDocs counts triaged rows the filter drops — the log line below
		// reports the skip so a shrinking pool is visible, not silent.
		if (stale.length)
			console.log(
				`re-scan pool: ${stale.length} scanned repos pushed since their scan`,
			);
	}
	console.log(
		`eligible: ${eligible} · this wave: ${docs.length}${skippedTriaged ? ` · skipped ${skippedTriaged} triaged` : ""}${STALE_FIRST ? " · mode=stale-first (pushed since last scan)" : ""}\n`,
	);

	let callsUsed = 0;
	let scanned = 0;
	// Interface-coverage accounting (no silent caps): a contract repo that
	// extracts ZERO signatures is an extraction gap (the FxDAO trait-impl
	// class), not a benign absence — count them so waves surface the gap.
	let contractRepos = 0;
	let contractReposWithIface = 0;
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
			// Canonical platform repos never need to PROVE they're Stellar —
			// they ARE Stellar. The dep-based proof detector is self-
			// referentially blind to them (js-stellar-sdk depends on
			// stellar-base, not on an SDK → proof=none, depth=0; found
			// 2026-08-15), and the unreadable-blob guard held rs-soroban-sdk
			// in error since 2026-07-11. Pin proof by language and let depth
			// compute from whatever WAS readable.
			if (
				r &&
				isAllowlisted(full) &&
				(r.proof === "none" || r.outcome !== "ok")
			) {
				const lang = String(doc.primaryLanguage ?? "").toLowerCase();
				r.proof =
					lang === "rust"
						? "cargo-sdk"
						: lang === "typescript" || lang === "javascript"
							? "js-sdk"
							: "lang-sdk";
				r.outcome = "ok";
				r.depthInput.proof = r.proof;
				console.log(
					`  pin    ${full.padEnd(44)} allowlisted-canonical proof=${r.proof}`,
				);
			}
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
				// code-truth 4B: same replacement for the other-language frontier —
				// py/go/kotlin/java repos rose out of the flat lang-sdk 0.3 once
				// slice A gave their capabilities eyes. Deep-side anchored on the
				// four verified flagships (depth-labels LANG_DEEP); the eval gate
				// enforces the floor.
				if (
					r.outcome === "ok" &&
					(r.proof === "lang-sdk" ||
						r.proof === "cargo-sdk" ||
						r.proof === "contract-macros")
				) {
					const ld = computeLangDepth({
						fullName: full,
						blobs: r.depthInput.blobs,
						scalars: {
							isFork: r.meta.isFork,
							tagCount: r.meta.tagCount,
							readmeText: r.depthInput.scalars.readmeText,
							topics: r.depthInput.scalars.topics ?? [],
							nameLooksTemplate: r.meta.nameLooksTemplate,
						},
					});
					if (!ld.reasons.includes("no-lang-sources")) {
						if (r.proof === "lang-sdk") {
							depth = ld.langDepth;
						} else {
							// Hybrid-repo routing (anchor-platform class): a vendored
							// soroban crate makes the proof cargo-flavored while the
							// repo's real mass is Kotlin/Java/Go/Python — the Rust model
							// then scores the vendored sliver, not the product. When the
							// language sources outweigh the Rust sources, the repo's
							// depth is its DEEPEST calibrated integration, never the
							// smaller sliver. Pure-Rust repos with incidental deploy
							// scripts are untouched (rust sloc dominates).
							const rsSloc = r.depthInput.blobs
								.filter((b) => b.path.toLowerCase().endsWith(".rs"))
								.reduce(
									(n, b) =>
										n +
										(b.text ?? "")
											.split("\n")
											.filter((l) => l.trim().length > 0).length,
									0,
								);
							if (ld.langSloc > rsSloc) depth = Math.max(depth, ld.langDepth);
						}
					}
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
				const contractInterface =
					r.outcome === "ok"
						? extractContractInterface(r.depthInput.blobs)
						: [];
				const stellarDeps =
					r.outcome === "ok" ? extractStellarDeps(r.scan.blobs) : [];
				// Evidence-only domain classification (deps + caps + iface traits) —
				// what the CODE proves the repo does, never what it claims.
				const codeDomains =
					r.outcome === "ok"
						? deriveCodeDomains({
								stellarDeps,
								sdkCapabilities,
								contractInterface,
							})
						: [];
				if (r.outcome === "ok" && (r.facts?.contractMacroCount ?? 0) > 0) {
					contractRepos++;
					if (contractInterface.length > 0) contractReposWithIface++;
				}
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
						contractInterface,
						stellarDeps,
						sdkCapabilities,
						codeDomains,
						scannedRef: r.scannedRef,
						mainnetContractId: r.depthInput.scalars.mainnetContractId ?? null,
					},
					nowIso,
				);
				// sls-046: platform/SDK/tooling repos (stellar-core, rs-soroban-env,
				// the SDKs/CLI…) vendor cdylib crates that are runtime/fixtures, not
				// a deployable contract product — pin the stored flag false so the
				// data converges to the same truth the serving-time override reads.
				if (
					isKnownInfraNotDeployable(full) &&
					data.isDeployableContract === true
				) {
					data.isDeployableContract = false;
				}
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
					line = `  ok     ${full.padEnd(44)} proof=${r.proof.padEnd(15)} depth=${depth.toFixed(2)} farm=${farm.score} syms=${symbols.length} iface=${contractInterface.length}`;
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
	if (contractRepos)
		console.log(
			`interface coverage: ${contractReposWithIface}/${contractRepos} contract repos in this wave extracted ≥1 signature${contractReposWithIface < contractRepos ? " — the gap rows are extraction misses worth a look" : ""}`,
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
	// Zero-work waves are FAILURES, not successes (2026-08-08: a rate-limit
	// stop 0.8s in exited green — the run looked healthy on every dashboard
	// while writing nothing; the quiet-detector class). A wave that selected
	// repos but scanned none must go red so it's visible.
	if (docs.length > 0 && scanned === 0 && errored === 0 && incomplete === 0) {
		console.log(
			"\n✗ zero-work wave: repos were selected but none were scanned (rate limit or early stop) — exiting 1 so the run shows red.",
		);
		process.exit(1);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
