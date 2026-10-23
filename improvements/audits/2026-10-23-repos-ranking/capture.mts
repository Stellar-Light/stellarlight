// Read-only capture against production, anonymous GETs about 2 s apart,
// honoring 429 and 503. Captures:
//   the whole repos corpus from the collection's public REST read (depth 0,
//   readmeExcerpt left out, as searchRepos leaves it out; an anonymous read
//   sees what searchRepos sees: no held rows, no internal notes);
//   the live first page (limit 20, the route default) of /api/repos/search
//   for every query of the sets: dev set, battery tools questions, exact
//   names (owner/name and bare name), project names of every project whose
//   repo has codeInUse.events > 0, keyword queries.
// /api/status apiVersion is read at the start, between the two parts and at
// the end.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-repos-ranking/capture.mts \
//     <devset.json> <battery.json> <outDir>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , devPath, batteryPath, outDir] = process.argv;
if (!devPath || !batteryPath || !outDir)
	throw new Error("usage: capture.mts <devset.json> <battery.json> <outDir>");
mkdirSync(outDir, { recursive: true });
const here = new URL(".", import.meta.url).pathname;
const sets = JSON.parse(readFileSync(join(here, "sets.json"), "utf8"));
const dev = JSON.parse(readFileSync(devPath, "utf8"));
const battery = JSON.parse(readFileSync(batteryPath, "utf8"));

const BASE = "https://www.stellarlight.xyz";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
let requests = 0;

// biome-ignore lint/suspicious/noExplicitAny: raw API bodies
async function get(path: string): Promise<any> {
	for (let attempt = 0; attempt < 6; attempt++) {
		const wait = 2000 - (Date.now() - last);
		if (wait > 0) await sleep(wait);
		last = Date.now();
		requests++;
		const res = await fetch(BASE + path, {
			headers: { "user-agent": "stellarlight-lane-r4 (read-only)" },
		});
		if (res.status === 429 || res.status === 503) {
			const after = Number(res.headers.get("retry-after"));
			await sleep(
				Number.isFinite(after) && after > 0
					? Math.min(after, 120) * 1000
					: 5000 * (attempt + 1),
			);
			continue;
		}
		if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
		return res.json();
	}
	throw new Error(`${path}: still rate limited`);
}

const version = async () => {
	const s = await get("/api/status");
	return {
		at: new Date().toISOString(),
		apiVersion: s?.apiVersion ?? null,
	};
};

const versions = [await version()];

// Part 1: the corpus, in creation order so a row added mid-capture lands on
// a later page instead of shifting earlier ones.
const corpus = new Map<string, unknown>();
for (let page = 1; ; page++) {
	const d = await get(
		`/api/repos?limit=100&page=${page}&depth=0&sort=createdAt&select%5BreadmeExcerpt%5D=false`,
	);
	for (const doc of d.docs) corpus.set(String(doc.id), doc);
	console.log(`corpus page ${page}/${d.totalPages}: ${corpus.size} rows`);
	if (!d.hasNextPage) break;
}
versions.push(await version());

// Project names of every project whose repo has verified mainnet usage.
// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
const docs = [...corpus.values()] as any[];
const projectNames = [
	...new Set(
		docs
			.filter((d) => (d.codeInUse?.events ?? 0) > 0 && d.projectName)
			.map((d) => String(d.projectName)),
	),
].sort();

// Part 2: the live first page for every query.
const queries: Array<{ set: string; id: string; q: string }> = [
	// biome-ignore lint/suspicious/noExplicitAny: frozen file shape
	...dev.questions.map((x: any) => ({ set: "dev", id: x.id, q: x.q })),
	...sets.battery.ids.map((id: string) => ({
		set: "battery",
		id,
		// biome-ignore lint/suspicious/noExplicitAny: frozen file shape
		q: battery.questions.find((x: any) => x.id === id).q,
	})),
	...sets.exactNames.flatMap((fn: string) => [
		{ set: "exact-full", id: fn, q: fn },
		{ set: "exact-name", id: fn, q: fn.split("/")[1] },
	]),
	...projectNames.map((n) => ({ set: "project-name", id: n, q: n })),
	...sets.keyword.map((q: string) => ({ set: "keyword", id: q, q })),
];
const live: unknown[] = [];
for (const [i, x] of queries.entries()) {
	// The cache buster forces a fresh read close to the corpus capture; the
	// route names it in meta.warnings and serves the same rows.
	const d = await get(
		`/api/repos/search?q=${encodeURIComponent(x.q)}&limit=20&r4=${Date.now()}`,
	);
	live.push({
		...x,
		at: new Date().toISOString(),
		matchMode: d.meta?.matchMode ?? null,
		total: d.meta?.counts?.total ?? null,
		warnings: d.meta?.warnings ?? [],
		// biome-ignore lint/suspicious/noExplicitAny: raw API body
		repos: (d.repos ?? []).map((r: any) => ({
			fullName: r.fullName,
			score: r.score,
		})),
	});
	if (i % 20 === 0) console.log(`live ${i + 1}/${queries.length}`);
}
versions.push(await version());

writeFileSync(join(outDir, "corpus.json"), JSON.stringify(docs));
writeFileSync(
	join(outDir, "live.json"),
	JSON.stringify({ versions, requests, projectNames, live }, null, 1),
);
console.log(
	`done: ${docs.length} corpus rows, ${live.length} live pages, ${requests} requests`,
	JSON.stringify(versions),
);
