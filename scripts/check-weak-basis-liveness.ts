/**
 * Weak-basis liveness (P4). A Live row whose status rests on `site-liveness`,
 * `source-inherited` or `unverified`, and whose every linked repository has
 * been silent for over a year, is the directory's softest claim: nothing about
 * the product has been checked recently, and the code is not moving either.
 *
 *   pnpm exec tsx scripts/check-weak-basis-liveness.ts [--json] [--limit=N]
 *
 * Repo staleness is NOT death — that rule is older than this lane and still
 * holds. So this does not judge the repository. It re-probes the PRODUCT at
 * its own URL through the same `judgeStamp` the packet guard uses, and reports
 * the trinary: holds / contradicted / could-not-check.
 *
 * Contradictions are a queue for a human, never an auto-flip. Exit 1 when any
 * row is contradicted (the workflow declares that step as its signal), exit 2
 * when the API did not answer or more than half the run was blind — a sweep
 * that could not look must never read as a sweep that found nothing.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { probe } from "./check-packet-stamps";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const OUT = join(
	process.cwd(),
	"improvements/audits/weak-basis-liveness-latest.json",
);
const JSON_OUT = process.argv.includes("--json");
const LIMIT = Number(
	process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 60,
);
/** site-liveness is weak but honest; these are the tiers a fresh look can move. */
const WEAK = new Set(["site-liveness", "source-inherited", "unverified"]);
const DORMANT_DAYS = 365;
const CONCURRENCY = 4;

type Project = {
	slug: string;
	status: string;
	statusBasis?: string | null;
	statusAsOf?: string | null;
	links?: { website?: string | null } | null;
};

async function page<T>(path: string): Promise<T[] | null> {
	const rows: T[] = [];
	for (let p = 1; p < 60; p++) {
		const res = await fetch(`${BASE}${path}&limit=200&page=${p}&depth=0`, {
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) return null;
		const body = (await res.json()) as {
			docs?: T[];
			hasNextPage?: boolean;
		};
		rows.push(...(body.docs ?? []));
		if (!body.hasNextPage) break;
	}
	return rows;
}

async function main() {
	const projects = await page<Project>(
		"/api/projects?where%5Bstatus%5D%5Bequals%5D=Live",
	);
	const repos = await page<{ projectSlug?: string | null; lastCommitAt?: string | null }>(
		"/api/repos?where%5BprojectSlug%5D%5Bexists%5D=true",
	);
	if (!projects || !repos) {
		console.error(
			"INCONCLUSIVE: the projects or repos API did not answer — no artifact written, no verdict.",
		);
		process.exit(2);
	}

	const newest = new Map<string, string>();
	for (const r of repos) {
		if (!r.projectSlug || !r.lastCommitAt) continue;
		const cur = newest.get(r.projectSlug);
		if (!cur || r.lastCommitAt > cur) newest.set(r.projectSlug, r.lastCommitAt);
	}

	const cutoff = Date.now() - DORMANT_DAYS * 86_400_000;
	const pool = projects.filter((p) => {
		if (!WEAK.has(p.statusBasis ?? "")) return false;
		const last = newest.get(p.slug);
		// No linked repo at all is a different finding (coverage), not this one.
		if (!last) return false;
		return Date.parse(last) < cutoff;
	});
	// Oldest evidence first, so a capped run always spends its budget on the
	// softest claims rather than a random slice.
	pool.sort(
		(a, b) => Date.parse(newest.get(a.slug) ?? "") - Date.parse(newest.get(b.slug) ?? ""),
	);
	const batch = pool.slice(0, LIMIT).filter((p) => p.links?.website);

	const rows: Awaited<ReturnType<typeof probe>>[] = [];
	for (let i = 0; i < batch.length; i += CONCURRENCY) {
		rows.push(
			...(await Promise.all(
				batch.slice(i, i + CONCURRENCY).map((p) =>
					probe({
						slug: p.slug,
						to: "Live",
						// biome-ignore lint/style/noNonNullAssertion: filtered above
						sourceUrl: p.links!.website!,
					}),
				),
			)),
		);
	}

	const tally = {
		poolSize: pool.length,
		checked: rows.length,
		holds: rows.filter((r) => r.verdict === "HOLDS").length,
		contradicted: rows.filter((r) => r.verdict === "CONTRADICTED").length,
		couldNotCheck: rows.filter((r) => r.verdict === "COULD-NOT-CHECK").length,
	};
	const report = {
		generatedAt: new Date().toISOString(),
		source: "scripts/check-weak-basis-liveness.ts",
		rule: "A Live row on a weak basis whose every repo is over a year silent is re-probed at the PRODUCT's own URL. Repo staleness is not death and is never judged here; a contradiction is a queue for a human, never an auto-flip.",
		tally,
		rows,
	};
	mkdirSync(join(process.cwd(), "improvements/audits"), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(report, null, "\t")}\n`);

	if (JSON_OUT) console.log(JSON.stringify(report, null, "\t"));
	else
		for (const r of rows)
			console.log(
				`  ${r.verdict === "HOLDS" ? "✓" : r.verdict === "COULD-NOT-CHECK" ? "?" : "✗"} ${r.slug.padEnd(30)}${String(r.httpStatus ?? "-").padEnd(5)}${r.verdict.padEnd(17)}${r.reason}`,
			);

	console.log(
		`\n${tally.contradicted ? "RED" : tally.couldNotCheck * 2 > tally.checked ? "BLIND" : "GREEN"}: ${tally.holds} holds · ${tally.contradicted} contradicted · ${tally.couldNotCheck} could-not-check (of ${tally.checked} probed, pool ${tally.poolSize})`,
	);
	process.exit(
		tally.checked === 0 || tally.couldNotCheck * 2 > tally.checked
			? 2
			: tally.contradicted
				? 1
				: 0,
	);
}

main().catch((e) => {
	console.error("INCONCLUSIVE (sweep did not complete):", e?.message ?? e);
	process.exit(2);
});
