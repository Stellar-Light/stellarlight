// Read-only GETs against production, 2 s apart, honoring 429 and 503.
// Captures:
//   every stored submission from /api/hackathons/builds (id, name, GitHub
//   link, demo link, and the project link it serves today);
//   every directory project with the fields the sync lane's linker reads
//   (scripts/sync-hackathon-builds.ts step 3: slug, name, status,
//   canonicalSlug, links, github; all statuses, drafts included, as the lane
//   reads them), from the collection's public REST read.
// /api/status apiVersion is read at the start and the end.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-repo-moves/capture.mts <out.json>
import { writeFileSync } from "node:fs";

const [, , outPath] = process.argv;
if (!outPath) throw new Error("usage: capture.mts <out.json>");
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
			headers: { "user-agent": "stellarlight-lane-n-dry-run (read-only)" },
		});
		if (res.status === 429 || res.status === 503) {
			const after = Number(res.headers.get("retry-after"));
			await sleep(
				Number.isFinite(after) && after > 0
					? after * 1000
					: 5000 * (attempt + 1),
			);
			continue;
		}
		if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
		return res.json();
	}
	throw new Error(`${path}: still rate limited`);
}

const version = async () => ({
	at: new Date().toISOString(),
	apiVersion: (await get("/api/status"))?.apiVersion ?? null,
});

const start = await version();
const builds: unknown[] = [];
for (let offset = 0; ; ) {
	const d = await get(`/api/hackathons/builds?limit=100&offset=${offset}`);
	for (const b of d.builds)
		builds.push({
			id: b.id,
			name: b.name,
			githubUrl: b.githubUrl ?? null,
			demoUrl: b.demoUrl ?? null,
			security: b.security ?? null,
			project: b.project ?? null,
		});
	offset += d.meta.counts.returned;
	if (!d.meta.counts.returned || offset >= d.meta.counts.matched) break;
}
const select = ["slug", "name", "status", "canonicalSlug", "links", "github"]
	.map((f) => `select%5B${f}%5D=true`)
	.join("&");
const projects: unknown[] = [];
let totalDocs = 0;
for (let page = 1; ; page++) {
	const d = await get(`/api/projects?limit=100&page=${page}&depth=0&${select}`);
	totalDocs = d.totalDocs;
	projects.push(...d.docs);
	if (!d.hasNextPage) break;
}
const end = await version();
writeFileSync(
	outPath,
	JSON.stringify({ start, end, requests, totalDocs, builds, projects }),
);
console.log(
	`builds ${builds.length}, projects ${projects.length} of ${totalDocs}, ${requests} requests; apiVersion ${start.apiVersion} at ${start.at}, ${end.apiVersion} at ${end.at}`,
);
