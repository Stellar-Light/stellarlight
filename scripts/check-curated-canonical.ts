/**
 * Guard: the curated canonical list must describe repos that actually exist,
 * are indexed, and carry code signals.
 *
 * `canonicalFor`/`flagshipsFor` (src/lib/repo-search.ts) float hand-picked
 * repos to the TOP of a result set — they are how "which repo is authoritative"
 * gets answered. That list is authored truth: nothing derives it and, until
 * this guard, nothing re-verified it. Measured 2026-08-30, 50 curated names:
 *
 *     32  fully code-scanned
 *      6  indexed but codeScanState pending/error (proof+codeDepth null)
 *      9  ABSENT from the corpus entirely
 *      2  stale names (stellar/soroban-cli, soroban-rpc — renamed upstream to
 *         stellar-cli / stellar-rpc, both of which ARE indexed and scanned)
 *
 * Each class breaks curation differently and all three are silent today:
 *   - ABSENT  → canonicalFor injects a name that matches no row, so the query
 *               curation exists to fix falls back to keyword noise.
 *   - STALE   → same, plus we advertise a repo that no longer exists.
 *   - UNSCANNED → the row is there but has no proof/codeDepth, so every
 *               code-evidence ranking rule and the tier gate skip it. A
 *               canonical repo with null signals is invisible to the machinery.
 *
 * DELIBERATELY SCOPED to the curated set (~50 repos). This is not a licence to
 * scan the long tail: the corpus is 77% Electric Capital bulk and most of it
 * should get a cheap triage verdict, never a deep index (PLAN.md §3). Precision
 * over recall — we only insist on signals for repos we ourselves call canonical.
 *
 *   pnpm exec tsx scripts/check-curated-canonical.ts          # human output
 *   pnpm exec tsx scripts/check-curated-canonical.ts --json   # artifact
 *
 * Exits 1 on any finding, so a lane can gate on it and it fails LOUD rather
 * than rotting quietly (PLAN.md §0: "a quiet detector looks like a live one").
 * Read-only: no writes, no GitHub calls — one indexed lookup per curated name.
 */
import { CURATED_CANONICAL_REPOS } from "../src/lib/repo-search";

const API = process.env.STELLARLIGHT_API ?? "https://stellarlight.xyz";
const JSON_OUT = process.argv.includes("--json");

type Row = {
	fullName?: string | null;
	codeScanState?: string | null;
	stellarProof?: string | null;
	codeDepth?: number | null;
	stars?: number | null;
	tier?: string | null;
};

async function lookup(fullName: string): Promise<Row | null> {
	const url = `${API}/api/repos?where%5BfullName%5D%5Bequals%5D=${encodeURIComponent(fullName)}&limit=1&depth=0`;
	const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
	if (!r.ok) throw new Error(`${fullName}: HTTP ${r.status}`);
	const d = (await r.json()) as { docs?: Row[] };
	return d.docs?.[0] ?? null;
}

async function main() {
	const absent: string[] = [];
	const unscanned: Array<{ name: string; state: string; stars: number }> = [];
	const ok: string[] = [];

	for (const name of CURATED_CANONICAL_REPOS) {
		const row = await lookup(name);
		if (!row) {
			absent.push(name);
			continue;
		}
		const scanned =
			row.codeScanState === "scanned" &&
			row.stellarProof != null &&
			row.codeDepth != null;
		if (!scanned)
			unscanned.push({
				name,
				state: row.codeScanState ?? "(none)",
				stars: row.stars ?? 0,
			});
		else ok.push(name);
	}

	const total = CURATED_CANONICAL_REPOS.length;
	const findings = absent.length + unscanned.length;

	if (JSON_OUT) {
		console.log(
			JSON.stringify(
				{
					asOf: new Date().toISOString(),
					source: "scripts/check-curated-canonical.ts",
					curatedTotal: total,
					scanned: ok.length,
					absent,
					unscanned,
					findings,
				},
				null,
				2,
			),
		);
	} else {
		console.log(`curated canonical repos: ${total}`);
		console.log(`  code-scanned:  ${ok.length}`);
		console.log(`  UNSCANNED:     ${unscanned.length}`);
		console.log(`  ABSENT:        ${absent.length}`);
		if (unscanned.length) {
			console.log(
				"\nindexed but no code signals (invisible to ranking + tier):",
			);
			for (const u of [...unscanned].sort((a, b) => b.stars - a.stars))
				console.log(
					`  ${u.name.padEnd(50)} state=${u.state.padEnd(9)} stars=${u.stars}`,
				);
		}
		if (absent.length) {
			console.log(
				"\nabsent from the corpus (curated name matches NO row — stale rename, or never ingested):",
			);
			for (const a of absent) console.log(`  ${a}`);
		}
	}

	if (findings > 0) {
		if (!JSON_OUT)
			console.error(
				`\nRED: ${findings}/${total} curated canonical repos cannot answer as canonical.`,
			);
		process.exit(1);
	}
	if (!JSON_OUT)
		console.log(
			"\nGREEN: every curated canonical repo is indexed and code-scanned.",
		);
}

main().catch((e) => {
	console.error("FATAL:", e?.message ?? e);
	process.exit(1);
});
