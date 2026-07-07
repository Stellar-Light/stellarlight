/**
 * Self-audit — the StellarLight data-quality Guard.
 *
 * Runs GROUNDED checks against the LIVE API (no DB/auth needed): liveness +
 * shape, sane counts, freshness thresholds, and ground-truth spot-checks
 * derived from facts we KNOW are true. It deliberately does NOT run adversarial
 * "find the worst" judging — that manufactures problems and causes over-
 * rotation (the repo's hard-won lesson). Exits non-zero on a HARD failure
 * (something an agent / Tyler would actually hit), so CI catches regressions
 * before they ship. Complements check-api-drift.ts (which asserts API ⇄ spec ⇄
 * docs consistency); this one guards the DATA behind the contract.
 *
 *   SCOUT_BASE=https://stellarlight.xyz npx tsx scripts/self-audit.ts
 *
 * Wired into CI (.github/workflows/self-audit.yml, daily + manual).
 */

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";

let fails = 0;
let warns = 0;
let passes = 0;
const ok = (n: string) => {
	passes++;
	console.log(`  ✓ ${n}`);
};
const warn = (n: string, d: string) => {
	warns++;
	console.log(`  ⚠ ${n} — ${d}`);
};
const bad = (n: string, d: string) => {
	fails++;
	console.log(`  ✗ ${n}\n      ${d}`);
};

// biome-ignore lint/suspicious/noExplicitAny: dynamic JSON
async function j(path: string): Promise<any> {
	const r = await fetch(`${BASE}${path}`, {
		headers: { "user-agent": "stellarlight-self-audit" },
	});
	if (!r.ok) throw new Error(`HTTP ${r.status}`);
	return r.json();
}

async function main() {
	console.log(`Self-audit → ${BASE}\n`);

	// 1. Liveness + shape — every public endpoint returns and carries data.
	console.log("── Liveness + shape ──");
	const endpoints: Array<{ path: string; listKey?: string; min: number }> = [
		{ path: "/api/projects/search?q=stellar&limit=5", listKey: "projects", min: 1 },
		{ path: "/api/repos/search?q=soroban&limit=5", listKey: "repos", min: 1 },
		{ path: "/api/research?q=soroban&limit=3", listKey: "results", min: 1 },
		{ path: "/api/partners?all=1&limit=100", listKey: "partners", min: 20 },
		{ path: "/api/builders?limit=20", listKey: "builders", min: 20 },
		{ path: "/api/rfps", listKey: "rfps", min: 1 },
		{ path: "/api/clusters?dimension=types", listKey: "clusters", min: 5 },
		{ path: "/api/hackathons", listKey: "hackathons", min: 1 },
		{ path: "/api/skills", listKey: "skills", min: 5 },
		{ path: "/api/leaderboard", min: 0 },
	];
	for (const e of endpoints) {
		try {
			const d = await j(e.path);
			if (e.listKey) {
				const arr = d[e.listKey];
				const n = Array.isArray(arr) ? arr.length : -1;
				if (n < 0) bad(e.path, `missing/invalid '${e.listKey}' array`);
				else if (n < e.min)
					bad(e.path, `only ${n} ${e.listKey} (expected ≥${e.min})`);
				else ok(`${e.path} → ${n} ${e.listKey}`);
			} else {
				ok(`${e.path} → ${Object.keys(d).length} keys`);
			}
		} catch (err) {
			bad(e.path, `fetch failed: ${String(err)}`);
		}
	}

	// 2. Freshness thresholds — a stalled cron shows up as a stale source.
	console.log("\n── Freshness ──");
	const status = await j("/api/status");
	const sources: Array<{ name: string; lastUpdatedAt: string | null }> =
		status.sources ?? [];
	const MAX_AGE_DAYS: Record<string, number> = {
		projects: 14,
		repos: 7,
		builders: 14,
		ecosystemStats: 45,
	};
	const now = Date.now();
	for (const s of sources) {
		const max = MAX_AGE_DAYS[s.name];
		if (!max) continue;
		if (!s.lastUpdatedAt) {
			warn(s.name, "no lastUpdatedAt");
			continue;
		}
		const ageDays = (now - new Date(s.lastUpdatedAt).getTime()) / 86_400_000;
		if (ageDays > max)
			bad(
				`${s.name} freshness`,
				`${ageDays.toFixed(1)}d old (max ${max}d) — refresh cron may be stalled`,
			);
		else ok(`${s.name} fresh (${ageDays.toFixed(1)}d)`);
	}

	// 3. Served-count sanity — encodes the lesson: hackathons `curated: 0` is BY
	//    DESIGN (served live via DoraHacks). Guard the SERVED total, not the
	//    curated sub-count, so this never false-alarms as "0 hackathons".
	console.log("\n── Served-count sanity (curated 0 ≠ broken) ──");
	try {
		const hk = await j("/api/hackathons");
		const served = (hk.hackathons ?? []).length;
		if (served < 1)
			bad("hackathons served", "0 served — the DoraHacks fallback may be down");
		else
			ok(
				`hackathons served ${served} (curated ${hk.meta?.counts?.curated ?? "?"}, live fallback OK)`,
			);
	} catch (err) {
		bad("hackathons served", `fetch failed: ${String(err)}`);
	}

	// 4. Ground truth — facts we KNOW are true (an answer key, not an opinion).
	console.log("\n── Ground truth ──");
	try {
		const audit = await j("/api/partners?type=audit-firm&limit=20");
		const names = (audit.partners ?? []).map((p: { name: string }) =>
			p.name.toLowerCase(),
		);
		for (const known of ["halborn", "certora", "ottersec"]) {
			if (names.some((n: string) => n.includes(known)))
				ok(`partners: ${known} present under type=audit-firm`);
			else
				bad(
					"partners ground truth",
					`known audit firm '${known}' missing from type=audit-firm`,
				);
		}
	} catch (err) {
		bad("partners ground truth", `fetch failed: ${String(err)}`);
	}
	try {
		const proj = await j("/api/projects/search?q=blend&limit=5");
		if ((proj.projects ?? []).some((p: { slug: string }) => p.slug === "blend"))
			ok("projects: 'blend' resolves for q=blend");
		else bad("projects ground truth", "known project 'blend' not found for q=blend");
	} catch (err) {
		bad("projects ground truth", `fetch failed: ${String(err)}`);
	}

	console.log(
		`\n${fails ? "✗ FAIL" : "✓ PASS"} — ${passes} passed, ${warns} warnings, ${fails} failures`,
	);
	process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("Self-audit crashed:", e);
	process.exit(2);
});
