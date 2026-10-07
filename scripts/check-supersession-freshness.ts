/**
 * Supersession freshness (P5). REPO_SUPERSESSIONS is curated by hand, so a
 * curated-pool repo archived AFTER its entry (or never given one) served
 * activityState "archived" with no successor and no date until somebody
 * re-read it. This check lists every archived repo in the curated pool
 * (project-linked or repoScore >= 60) that has no map entry, from the PUBLIC
 * repos API — no store credentials, no GitHub calls.
 *
 *   pnpm exec tsx scripts/check-supersession-freshness.ts [--json]
 *
 * Trinary: covered / missing / could-not-check (the API did not answer — the
 * run is blind, exit 2). Missing rows are a refresh queue, not defects: the
 * ledger files them as supersession-unrecorded (a MAINTENANCE mode). Exit 1
 * when anything is missing (the workflow declares that step as its signal).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_SUPERSESSIONS } from "../src/lib/repo-relations";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const OUT = join(
	process.cwd(),
	"improvements/audits/supersession-freshness-latest.json",
);

type Row = {
	fullName: string;
	projectSlug: string | null;
	repoScore: number | null;
	url: string | null;
};

async function archivedRepos(): Promise<Row[] | null> {
	const rows: Row[] = [];
	for (let page = 1; page < 50; page++) {
		const res = await fetch(
			`${BASE}/api/repos?where%5BisArchived%5D%5Bequals%5D=true&limit=100&page=${page}&depth=0`,
			{ headers: { "user-agent": "stellarlight-supersession-freshness" } },
		);
		if (!res.ok) return null;
		const body = (await res.json()) as {
			docs?: Array<Record<string, unknown>>;
			hasNextPage?: boolean;
		};
		for (const d of body.docs ?? [])
			rows.push({
				fullName: String(d.fullName ?? ""),
				projectSlug: d.projectSlug ? String(d.projectSlug) : null,
				repoScore: typeof d.repoScore === "number" ? d.repoScore : null,
				url: d.url ? String(d.url) : null,
			});
		if (!body.hasNextPage) break;
	}
	return rows;
}

async function main(): Promise<number> {
	const all = await archivedRepos();
	if (!all) {
		console.error(
			"supersession-freshness: could not read the repos API — blind, nothing asserted",
		);
		return 2;
	}
	const pool = all.filter((r) => r.projectSlug || (r.repoScore ?? 0) >= 60);
	const keys = new Set(
		Object.keys(REPO_SUPERSESSIONS).map((k) => k.toLowerCase()),
	);
	const missing = pool
		.filter((r) => !keys.has(r.fullName.toLowerCase()))
		.sort((a, b) => (b.repoScore ?? 0) - (a.repoScore ?? 0));
	const covered = pool.length - missing.length;
	const artifact = {
		generatedAt: new Date().toISOString(),
		basis:
			"archived repos from the public repos API (isArchived=true), restricted to the curated pool (project-linked or repoScore >= 60), compared against REPO_SUPERSESSIONS keys",
		archivedTotal: all.length,
		archivedInPool: pool.length,
		covered,
		missing,
	};
	mkdirSync(join(process.cwd(), "improvements/audits"), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
	for (const r of missing)
		console.log(
			`  missing  ${r.fullName.padEnd(48)} project ${r.projectSlug ?? "-"} score ${r.repoScore ?? "-"}`,
		);
	console.log(
		`${missing.length ? "RED" : "GREEN"}: ${pool.length} archived in the curated pool · ${covered} covered · ${missing.length} without a supersession entry (of ${all.length} archived repos)`,
	);
	return missing.length ? 1 : 0;
}

main().then(
	(code) => process.exit(code),
	(e) => {
		console.error(
			"supersession-freshness failed:",
			e instanceof Error ? e.message : e,
		);
		process.exit(2);
	},
);
