/**
 * Code-depth scan REPORT — read-only, no DB, no writes.
 *
 * Pulls a real sample of indexed repos (with their protection context) from the
 * live API, runs each through the SHARED fetch + the shipped scoring/tiering
 * modules, and prints what the scanner WOULD assign — plus the drift/safety
 * checks so we can see, before anything writes, whether a legit repo would ever
 * be wrongly sunk. This is the inspect-before-mutate gate.
 *
 *   GITHUB_TOKEN=… npx tsx scripts/scan/scan-report.ts
 *   GITHUB_TOKEN=… npx tsx scripts/scan/scan-report.ts owner/name owner/name  # ad-hoc
 *
 * Safety-gate summary at the end mirrors the circuit breakers the WRITE path
 * will enforce (CB3 new-none-rate ≤10%, archive-rate cap, protected-never-sunk).
 */
import { computeCodeDepth } from "../../src/lib/code-depth";
import { codeProofTier, computeFarmScore } from "../../src/lib/code-signals";
import { createGh, fetchRepoCode } from "./fetch-repo-code";

const GH = process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim();
if (!GH) {
	console.error("Set GITHUB_TOKEN.");
	process.exit(1);
}
const gh = createGh(GH);
const API = process.env.SCAN_API_BASE?.trim() || "https://stellarlight.xyz";

// Diverse query terms to assemble a real cross-section of the index (Rust
// contracts, non-Rust wallets/frontends, oracles, defunct projects, long tail).
const SAMPLE_TERMS = ["defi lending", "wallet sdk", "oracle", "nft", "amm dex", "stablecoin", "escrow", "dao governance"];

interface SampleRepo {
	fullName: string;
	projectSlug: string | null;
	scfAwarded: boolean;
	prominence: number;
	starsIdx: number | null;
	lastCommitIdx: string | null;
	repoScoreLabel: string | null;
}

async function assembleSample(): Promise<SampleRepo[]> {
	const byFull = new Map<string, SampleRepo>();
	for (const term of SAMPLE_TERMS) {
		try {
			const url = `${API}/api/projects/search?q=${encodeURIComponent(term)}&limit=8`;
			const d = await (await fetch(url)).json();
			for (const p of d.projects ?? []) {
				for (const r of p.repos ?? []) {
					const full = r.fullName;
					if (!full || byFull.has(full)) continue;
					byFull.set(full, {
						fullName: full,
						projectSlug: p.slug ?? null,
						scfAwarded: !!p.scfAwarded,
						prominence: typeof p.prominence === "number" ? p.prominence : 0,
						starsIdx: r.stars ?? null,
						lastCommitIdx: r.lastCommitAt ?? null,
						repoScoreLabel: r.repoScoreLabel ?? null,
					});
				}
			}
		} catch (e) {
			console.error(`  ! sample term "${term}": ${(e as Error).message}`);
		}
	}
	return [...byFull.values()];
}

interface Row {
	full: string;
	proof: string;
	outcome: string;
	codeDepth: number;
	farmScore: number;
	tier: string; // proposed, or "—" (no change)
	unverified: boolean;
	protected: boolean;
	reason: string;
	projectSlug: string | null;
	scf: boolean;
}

async function scoreRepo(s: SampleRepo): Promise<Row | null> {
	const r = await fetchRepoCode(gh, s.fullName);
	if (!r) return null;
	const codeDepth = computeCodeDepth(r.depthInput).codeDepth;
	const farm = computeFarmScore({
		proof: r.proof,
		facts: r.facts,
		isFork: r.meta.isFork,
		commitCount: null,
		repoContributorCount: null,
		diskUsageKb: r.meta.diskUsageKb,
		nameLooksTemplate: r.meta.nameLooksTemplate,
	});
	const protection = {
		fullName: s.fullName,
		scfAwarded: s.scfAwarded,
		projectSlug: s.projectSlug,
		projectProminence: s.prominence,
		curatedMultichain: null,
	};
	const isProt = s.scfAwarded || !!s.projectSlug || s.prominence > 0;
	const tierRes = codeProofTier({
		proof: r.proof,
		outcome: r.scan.treeComplete ? "ok" : "incomplete",
		farmScore: farm.score,
		codeDepth,
		isArchived: r.meta.isArchived,
		lastCommitAt: r.meta.lastCommitAt,
		stars: r.meta.stars,
		repoScoreLabel: s.repoScoreLabel,
		protection,
	});
	return {
		full: s.fullName,
		proof: r.proof,
		outcome: r.scan.treeComplete ? "ok" : "incomplete",
		codeDepth,
		farmScore: farm.score,
		tier: tierRes?.tier ?? "—",
		unverified: tierRes?.unverifiedStellar ?? false,
		protected: isProt,
		reason: (tierRes?.reason ?? []).join("+") || (farm.flags.join(",") || ""),
		projectSlug: s.projectSlug,
		scf: s.scfAwarded,
	};
}

async function main() {
	const argv = process.argv.slice(2);
	let sample: SampleRepo[];
	if (argv.length) {
		sample = argv.map((f) => ({ fullName: f, projectSlug: null, scfAwarded: false, prominence: 0, starsIdx: null, lastCommitIdx: null, repoScoreLabel: null }));
	} else {
		console.log(`Assembling sample from ${API} …`);
		sample = await assembleSample();
	}
	console.log(`Scanning ${sample.length} repos (read-only)…\n`);

	const rows: Row[] = [];
	for (const s of sample) {
		try {
			const row = await scoreRepo(s);
			if (row) rows.push(row);
			else console.error(`  ! ${s.fullName}: no tree / not fetchable`);
		} catch (e) {
			console.error(`  ! ${s.fullName}: ${(e as Error).message}`);
		}
	}

	rows.sort((a, b) => b.codeDepth - a.codeDepth);
	console.log("proof            depth  farm  tier       prot  reason                  repo");
	for (const r of rows) {
		console.log(
			`${r.proof.padEnd(15)} ${r.codeDepth.toFixed(2).padStart(5)} ${String(r.farmScore).padStart(4)}  ${r.tier.padEnd(9)} ${(r.protected ? "P" : " ").padStart(3)}  ${(r.reason || "").slice(0, 22).padEnd(22)} ${r.full}`,
		);
	}

	// ── Safety / drift summary ──
	// The REAL over-filter risk is a DEMOTION — tier=archive or
	// unverifiedStellar=true on a legit repo. proof=none is NOT a demotion: it's
	// a relevance signal that leaves the repo at community tier. Keying the alarm
	// on `none` cried wolf; key it on demotion.
	const n = rows.length || 1;
	const pct = (x: number) => `${((x / n) * 100).toFixed(0)}%`;
	const noneRepos = rows.filter((r) => r.proof === "none");
	const archived = rows.filter((r) => r.tier === "archive");
	const unverified = rows.filter((r) => r.unverified);
	const demoted = rows.filter((r) => r.tier === "archive" || r.unverified);
	const protectedDemoted = demoted.filter((r) => r.protected);
	const noneProtected = noneRepos.filter((r) => r.protected);
	const noneUnprotected = noneRepos.filter((r) => !r.protected);

	console.log("\n── safety / drift ──");
	console.log(`scanned: ${rows.length}  |  archived: ${archived.length}  |  unverified: ${unverified.length}  |  proof=none: ${noneRepos.length} (${pct(noneRepos.length)})`);

	// THE safety gate: no legit/protected repo may be demoted.
	if (protectedDemoted.length) {
		console.log(`\n⛔ OVER-FILTER — ${protectedDemoted.length} PROTECTED repo(s) DEMOTED (this must be 0):`);
		for (const r of protectedDemoted) console.log(`   ${r.full}  tier=${r.tier} unverified=${r.unverified}  (${r.reason})`);
	} else {
		console.log("✓ SAFE: 0 protected repos demoted. proof=none stays at community tier (never sunk).");
	}

	// Relevance completeness (NOT a demotion): none among PROTECTED = a detection
	// gap (repo is kept @ community, just not code-proven — worth improving);
	// none among UNPROTECTED = the archive-risk population the breakers guard.
	console.log(
		`\nrelevance completeness — proof=none: protected=${noneProtected.length} (kept @ community, detection gap) · unprotected=${noneUnprotected.length} (archive-risk pop.)`,
	);
	if (noneProtected.length) {
		console.log("\nprotected proof=none (detection gaps to review — genuinely off-topic vs parser miss):");
		for (const r of noneProtected) console.log(`   ${r.full}  (project ${r.projectSlug ?? "—"}, scf=${r.scf})`);
	}
	if (noneUnprotected.length) {
		console.log("\nUNPROTECTED proof=none (the population where archive CAN fire):");
		for (const r of noneUnprotected) console.log(`   ${r.full}  farm=${r.farmScore} tier=${r.tier}`);
	}
}

main().then(() => process.exit(0)).catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
