/**
 * Do all the paths to one entity tell an agent the same thing? (P2)
 *
 *   pnpm exec tsx scripts/check-endpoint-agreement.ts [--json]
 *
 * A fact we hold is only useful on the path the agent actually takes. On
 * 2026-09-07 `paltalabs/defindex` reported its successor through
 * /api/repos/search and withheld it through /api/repos — same repo, same
 * second, two answers — and `activityState` behaved the same way.
 *
 * The two views are legitimately different: the collection is the stored row,
 * search is the curated agent view. So this does NOT demand they match. It
 * watches a named list of RESOLUTION facts — the ones an agent needs to
 * reconcile something it found in the wild — and fails when one of those is
 * served on one path and absent on another.
 *
 * Trinary: agree / missing / could-not-check (an entity only one path returns
 * is never a pass). Exit 1 on a missing fact, 2 when the sample is mostly
 * unreadable.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(/\/$/, "");
const OUT = join(process.cwd(), "improvements/audits/endpoint-agreement-latest.json");
const JSON_OUT = process.argv.includes("--json");

/**
 * Facts an agent needs to RESOLVE something, and where each must appear.
 * Deliberately short: this is not a schema diff. Every entry is a fact that
 * answers "is this thing still real, and what replaced it".
 */
const RESOLUTION_FACTS = [
	{ field: "activityState", why: "is this repo alive, archived or dormant" },
	{ field: "supersededBy", why: "what replaced it", onlyWhenSuperseded: true },
	{ field: "deprecatedAt", why: "when it was replaced", onlyWhenSuperseded: true },
] as const;

const REPOS = [
	"paltalabs/defindex",
	"kalepail/stellar-raven",
	"stellar/js-stellar-sdk",
	"blend-capital/blend-contracts",
	"soroswap/core",
	"YaleOpenLab/opensolar",
];

async function json(path: string): Promise<any | null> {
	try {
		const res = await fetch(BASE + path, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) return null;
		return await res.json();
	} catch {
		return null;
	}
}

async function main() {
	const rows: Array<Record<string, unknown>> = [];
	for (const full of REPOS) {
		const coll = await json(
			`/api/repos?where%5BfullName%5D%5Bequals%5D=${encodeURIComponent(full)}&limit=1&depth=0`,
		);
		const search = await json(
			`/api/repos/search?q=${encodeURIComponent(full.split("/")[1] ?? full)}&limit=20`,
		);
		const c = coll?.docs?.[0] ?? null;
		const s =
			(search?.repos ?? search?.results ?? []).find(
				(x: { fullName?: string }) =>
					String(x.fullName ?? "").toLowerCase() === full.toLowerCase(),
			) ?? null;
		if (!c || !s) {
			rows.push({ repo: full, verdict: "could-not-check", why: !c ? "not in the collection" : "not in search results" });
			continue;
		}
		const missing: Array<{ field: string; servedBy: string; why: string }> = [];
		for (const f of RESOLUTION_FACTS) {
			const cv = (c as Record<string, unknown>)[f.field];
			const sv = (s as Record<string, unknown>)[f.field];
			const has = (v: unknown) => v !== undefined && v !== null;
			if (f.onlyWhenSuperseded && !has(cv) && !has(sv)) continue;
			if (has(sv) && !has(cv)) missing.push({ field: f.field, servedBy: "search", why: f.why });
			if (has(cv) && !has(sv)) missing.push({ field: f.field, servedBy: "collection", why: f.why });
		}
		rows.push({ repo: full, verdict: missing.length ? "missing" : "agree", missing });
	}
	const agree = rows.filter((r) => r.verdict === "agree").length;
	const missing = rows.filter((r) => r.verdict === "missing");
	const blind = rows.filter((r) => r.verdict === "could-not-check").length;
	const report = {
		generatedAt: new Date().toISOString(),
		source: "scripts/check-endpoint-agreement.ts",
		rule: "Resolution facts — is this alive, what replaced it — must be served on every agent-reachable path to an entity, not only the curated one.",
		tally: { checked: rows.length, agree, missing: missing.length, couldNotCheck: blind },
		rows,
	};
	writeFileSync(OUT, `${JSON.stringify(report, null, "\t")}\n`);
	if (JSON_OUT) console.log(JSON.stringify(report, null, "\t"));
	else
		for (const r of rows)
			console.log(
				`  ${r.verdict === "agree" ? "✓" : r.verdict === "could-not-check" ? "?" : "✗"} ${String(r.repo).padEnd(34)}${r.verdict}${(r.missing as unknown[])?.length ? `: ${(r.missing as Array<{ field: string; servedBy: string }>).map((m) => `${m.field} (only on ${m.servedBy})`).join(", ")}` : ""}`,
			);
	console.log(
		`\n${missing.length ? "RED" : blind * 2 > rows.length ? "BLIND" : "GREEN"}: ${agree} agree · ${missing.length} missing a resolution fact · ${blind} could-not-check (of ${rows.length})`,
	);
	process.exit(blind * 2 > rows.length ? 2 : missing.length ? 1 : 0);
}

main().catch((e) => {
	console.error("INCONCLUSIVE (agreement sweep did not complete):", e?.message ?? e);
	process.exit(2);
});
