/**
 * Experiment eval harness — scores each running experiment's VARIANT against
 * BASELINE on a GROUND-TRUTH metric (not a vibe). Run after the variant is
 * deployed; it reads the live API and opts into the variant per-request:
 *
 *   SCOUT_BASE=https://stellarlight.xyz pnpm exec tsx scripts/experiment-eval.ts
 *
 * WIN = the variant satisfies the known-true check AND baseline can't. This is
 * informational (grades experiments) — it does NOT fail CI (that's the Guard's
 * job, scripts/self-audit.ts). See src/lib/experiments.ts + /experiments.
 */

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";

// biome-ignore lint/suspicious/noExplicitAny: dynamic JSON
async function j(path: string): Promise<any> {
	const r = await fetch(`${BASE}${path}`, {
		headers: { "user-agent": "stellarlight-experiment-eval" },
	});
	if (!r.ok) throw new Error(`HTTP ${r.status}`);
	return r.json();
}

/** partner-compliance-api: variant answers compliance Qs; baseline stays clean. */
async function evalPartnerComplianceApi(): Promise<boolean> {
	console.log("── partner-compliance-api ──");
	const variant = await j(
		"/api/partners?type=anchor&all=1&limit=100&exp=partner-compliance-api",
	);
	const baseline = await j("/api/partners?type=anchor&all=1&limit=100");
	// biome-ignore lint/suspicious/noExplicitAny: partner shape
	const findV = (s: string) =>
		(variant.partners ?? []).find((p: any) => p.slug === s);

	// Ground truth: Yellow Card + Bitso are Travel-Rule compliant (verified this
	// session from their own disclosures).
	let wins = 0;
	const truth = ["anchor-yellow-card", "anchor-bitso"];
	for (const slug of truth) {
		const v = findV(slug);
		const ok = v?.compliance?.travelRule === true;
		console.log(`  variant ${slug}: travelRule=true ${ok ? "✓" : "✗"}`);
		if (ok) wins++;
	}
	// Baseline MUST NOT expose compliance (confirms "not exposed yet").
	// biome-ignore lint/suspicious/noExplicitAny: partner shape
	const baseLeaks = (baseline.partners ?? []).some((p: any) => p.compliance);
	console.log(
		`  baseline hides compliance (not exposed): ${baseLeaks ? "✗ LEAKING" : "✓"}`,
	);

	const won = wins === truth.length && !baseLeaks;
	console.log(
		`  → ${won ? "WIN" : "LOSS"} (${wins}/${truth.length} answerable · baseline clean=${!baseLeaks})\n`,
	);
	return won;
}

async function main() {
	console.log(`Experiment eval → ${BASE}\n`);
	const results: Record<string, boolean> = {
		"partner-compliance-api": await evalPartnerComplianceApi(),
	};
	console.log("Summary:", JSON.stringify(results));
	process.exit(0);
}

main().catch((e) => {
	console.error("Eval crashed:", e);
	process.exit(2);
});
