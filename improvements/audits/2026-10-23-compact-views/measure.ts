/**
 * Response sizes for the Scout operations an agent script calls, full and
 * compact (lane R, spec 1.9.96).
 *
 *   pnpm exec tsx improvements/audits/2026-10-23-compact-views/measure.ts > out.md
 *
 * Read-only GETs against the live API, 2 s apart, with the API version read
 * at the start and the end. Full = the live response body's length in
 * characters (JSON.stringify length, the unit an execute sandbox cuts at
 * 24,000). Compact = the same body passed through the exact function the
 * routes apply for view=compact (src/lib/compact-view.ts), so the number is
 * what view=compact serves for that body once deployed. Writes results.json
 * next to this file and prints markdown tables.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	CODE_REFERENCE_COMPACT,
	type CompactPlan,
	PROJECT_COMPACT,
	REPO_COMPACT,
	withView,
} from "../../../src/lib/compact-view";

const BASE = process.env.SCOUT_BASE ?? "https://www.stellarlight.xyz";
const CAP = 24_000;
const PLANS: Record<string, Record<string, CompactPlan>> = {
	"/api/projects/search": {
		projects: PROJECT_COMPACT,
		codeReferences: CODE_REFERENCE_COMPACT,
	},
	"/api/repos/search": { repos: REPO_COMPACT },
};

const CASES: Array<[op: string, path: string]> = [
	["searchProjects", "/api/projects/search?q=lending"],
	["searchProjects", "/api/projects/search?q=wallet"],
	["searchProjects", "/api/projects/search?q=oracle"],
	["searchProjects", "/api/projects/search?q=anchor"],
	["searchProjects", "/api/projects/search?q=payments"],
	["searchProjects", "/api/projects/search?q=dex"],
	["searchProjects", "/api/projects/search?q=lending&limit=5"],
	["searchProjects", "/api/projects/search?type=Wallet"],
	["searchRepos", "/api/repos/search?q=soroban"],
	["searchRepos", "/api/repos/search?q=oracle"],
	["searchRepos", "/api/repos/search?q=wallet"],
	["searchRepos", "/api/repos/search?q=passkey"],
	["searchRepos", "/api/repos/search?q=soroban&limit=5"],
	["searchResearch", "/api/research?q=soroban%20lending"],
	["searchResearch", "/api/research?q=passkeys"],
	["searchResearch", "/api/research?q=defi%20lending"],
	["searchResearch", "/api/research?q=passkeys&limit=25"],
	["searchHackathonBuilds", "/api/hackathons/builds?q=payments"],
	["searchHackathonBuilds", "/api/hackathons/builds?q=wallet"],
	["searchHackathonBuilds", "/api/hackathons/builds?q=nft%20marketplace"],
	["searchHackathonBuilds", "/api/hackathons/builds?q=payments&limit=50"],
	["getBuilders", "/api/builders"],
	["getPartners", "/api/partners"],
	["getLeaderboard", "/api/leaderboard"],
	["listAudits", "/api/audits"],
	["getStablecoins", "/api/stablecoins"],
	["getRfps", "/api/rfps"],
	["analyzeEcosystem", "/api/analyze"],
	["listContracts", "/api/contracts"],
	["getHackathons", "/api/hackathons"],
	["getClusters", "/api/clusters"],
	["getPeople", "/api/people"],
	["listSkills", "/api/skills"],
	["resolveProject", "/api/projects/resolve?q=blend"],
	["getRepoTrust", "/api/repos/trust?repo=blend-capital/blend-contracts-v2"],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const UA = { "user-agent": "stellarlight-lane-r-measure" };

async function apiVersion(): Promise<string> {
	const r = await fetch(`${BASE}/api/openapi.json`, { headers: UA });
	return ((await r.json()) as { info: { version: string } }).info.version;
}

type Row = {
	op: string;
	path: string;
	status: number;
	fullChars: number;
	compactChars: number | null;
	compactMetaFirst: boolean | null;
	rows: number | null;
};

async function main() {
	const startedAt = new Date().toISOString();
	const versionStart = await apiVersion();
	const rows: Row[] = [];
	for (const [op, path] of CASES) {
		await sleep(2000);
		const res = await fetch(`${BASE}${path}`, { headers: UA });
		const text = await res.text();
		const route = path.split("?")[0];
		const plans = PLANS[route];
		let compactChars: number | null = null;
		let compactMetaFirst: boolean | null = null;
		let count: number | null = null;
		try {
			const body = JSON.parse(text);
			const arr = Object.values(body).find(Array.isArray) as
				| unknown[]
				| undefined;
			count = arr ? arr.length : null;
			if (plans && res.ok) {
				const compact = withView("compact", plans)(body);
				const out = JSON.stringify(compact);
				compactChars = out.length;
				compactMetaFirst = out.startsWith('{"meta":{"view":');
			}
		} catch {}
		rows.push({
			op,
			path,
			status: res.status,
			fullChars: text.length,
			compactChars,
			compactMetaFirst,
			rows: count,
		});
		process.stderr.write(`${res.status} ${text.length} ${path}\n`);
	}
	const versionEnd = await apiVersion();
	const result = {
		base: BASE,
		startedAt,
		finishedAt: new Date().toISOString(),
		apiVersionStart: versionStart,
		apiVersionEnd: versionEnd,
		capChars: CAP,
		rows,
	};
	writeFileSync(
		join(import.meta.dirname, "results.json"),
		`${JSON.stringify(result, null, 2)}\n`,
	);
	const fmt = (n: number | null) =>
		n === null ? "" : n.toLocaleString("en-US");
	console.log(
		`apiVersion ${versionStart} at start, ${versionEnd} at end; ${startedAt} to ${result.finishedAt}\n`,
	);
	console.log(
		"| Operation | Request | Status | Rows | Full chars | Fits 24,000 | Compact chars | Fits 24,000 | Cut |",
	);
	console.log("|---|---|---|---|---|---|---|---|---|");
	for (const r of rows) {
		const cut =
			r.compactChars === null
				? ""
				: `${Math.round((1 - r.compactChars / r.fullChars) * 100)}%`;
		console.log(
			`| ${r.op} | \`${r.path.replace("/api", "")}\` | ${r.status} | ${r.rows ?? ""} | ${fmt(r.fullChars)} | ${r.fullChars <= CAP ? "yes" : "no"} | ${fmt(r.compactChars)} | ${r.compactChars === null ? "" : r.compactChars <= CAP ? "yes" : "no"} | ${cut} |`,
		);
	}
}

main();
