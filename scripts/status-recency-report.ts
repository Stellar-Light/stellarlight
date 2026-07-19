/**
 * Status-recency detector (ideas/status-recency-detector.md, 2026-07-19).
 *
 * The directory's core claim — what's Live — ages silently: statusAsOf is
 * median ~130 days old on the prominent sample, almost all source-inherited,
 * and no watcher looks at it (liveness-watch checks SITE liveness, a
 * different signal). This report ranks Live projects by how overdue their
 * status re-verification is and emits a small weekly batch for the
 * adversarial-verify pipeline.
 *
 * READ-ONLY, live-API based (like self-audit). It never demotes anything:
 * a stale repo is NOT a dead project (moneygram/yieldblox precedent) — the
 * output is a human-verification queue, precision over recall.
 *
 * Score = ageDays(statusAsOf) × prominence weight, boosted when the status
 * has no source URL and no recent code/site activity backs it up.
 *
 * Usage: pnpm exec tsx scripts/status-recency-report.ts [--limit=10]
 */

const BASE = process.env.SCOUT_BASE ?? "https://stellarlight.xyz";
const BATCH = Number(
	process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 10,
);

interface Row {
	name: string;
	slug: string;
	status: string;
	prominence?: number | null;
	statusAsOf?: string | null;
	statusSourceUrl?: string | null;
	statusBasis?: string | null;
	lastActivityAt?: string | null;
}

async function fetchLivePage(
	offset: number,
): Promise<{ rows: Row[]; total: number }> {
	const r = await fetch(
		`${BASE}/api/projects/search?status=Live&limit=100&offset=${offset}`,
		{ headers: { "user-agent": "stellarlight-status-recency" } },
	);
	if (!r.ok) throw new Error(`HTTP ${r.status} at offset ${offset}`);
	const d = (await r.json()) as {
		projects: Row[];
		meta: { counts?: { totalMatching?: number }; totalMatching?: number };
	};
	const total =
		d.meta?.counts?.totalMatching ?? d.meta?.totalMatching ?? d.projects.length;
	return { rows: d.projects, total };
}

const DAY = 86_400_000;

function ageDays(iso: string | null | undefined): number | null {
	if (!iso) return null;
	const t = new Date(iso).getTime();
	if (Number.isNaN(t)) return null;
	return (Date.now() - t) / DAY;
}

async function main() {
	const all: Row[] = [];
	let offset = 0;
	for (;;) {
		const { rows } = await fetchLivePage(offset);
		if (!rows.length) break;
		all.push(...rows);
		offset += 100;
		if (offset > 1000) break; // safety: Live is ~500 today
	}

	const scored = all.map((p) => {
		const age = ageDays(p.statusAsOf);
		// No statusAsOf at all = the oldest possible claim (pre-provenance row).
		const effectiveAge = age ?? 999;
		const prominence = p.prominence ?? 0;
		const hasSource = Boolean(p.statusSourceUrl);
		const activityAge = ageDays(p.lastActivityAt);
		const activityRecent = activityAge != null && activityAge < 180;
		// Prominent + old claim + nothing backing it = most overdue. A status
		// with its own source URL, or recent observable activity, buys slack.
		const score =
			effectiveAge *
			(0.5 + prominence / 100) *
			(hasSource ? 0.6 : 1.0) *
			(activityRecent ? 0.7 : 1.0);
		return { p, age, activityAge, hasSource, activityRecent, score };
	});

	scored.sort((a, b) => b.score - a.score);
	const batch = scored.slice(0, BATCH);

	console.log(
		`# Status re-verification queue — ${new Date().toISOString().slice(0, 10)}`,
	);
	console.log(
		`\nScanned ${all.length} Live projects. Top ${batch.length} most-overdue status claims (verify, NEVER bulk-demote — stale repo ≠ dead project):\n`,
	);
	console.log(
		"| project | statusAsOf age | prominence | status source | last activity |",
	);
	console.log("|---|---|---|---|---|");
	for (const s of batch) {
		console.log(
			`| ${s.p.name} (\`${s.p.slug}\`) | ${
				s.age == null ? "NONE" : `${Math.round(s.age)}d`
			} | ${s.p.prominence ?? 0} | ${s.hasSource ? "yes" : "none"} | ${
				s.activityAge == null ? "unknown" : `${Math.round(s.activityAge)}d ago`
			} |`,
		);
	}
	const median = (arr: number[]) =>
		arr.length ? arr.sort((x, y) => x - y)[Math.floor(arr.length / 2)] : 0;
	const ages = scored.map((s) => s.age).filter((a): a is number => a != null);
	console.log(
		`\nPopulation: ${ages.length}/${all.length} carry statusAsOf; median age ${Math.round(
			median(ages),
		)}d; ${scored.filter((s) => !s.hasSource).length} have no statusSourceUrl.`,
	);
	console.log(
		"\nMethod: score = age × prominence weight, discounted for a sourced status or <180d observable activity. Verify each against the project's own site/repo/socials before ANY status change (curate-projects overrides).",
	);
}

main().catch((e) => {
	console.error("status-recency-report failed:", e);
	process.exit(1);
});
