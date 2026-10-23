/**
 * Capture what the replay needs from the live API, read-only (lane V).
 *
 *   pnpm exec tsx improvements/audits/2026-10-23-winners-only-coverage/capture.mts <out-dir>
 *
 * GETs only, one at a time, 2 s apart, apiVersion read at the start and the
 * end. Writes the raw bodies to <out-dir> (kept out of the repo: they carry
 * third-party project text):
 *   status-start.json, status-end.json   apiVersion
 *   list.json                            getHackathons, every listed event
 *   analyze-event.json                   the index's events, builds and winners
 *   analyze-category.json                each category type's precision and recall
 *   detail/<slug>.json                   getHackathon, every listed event
 *   builds/<slug>.json                   searchHackathonBuilds rows, every indexed event
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BASE = "https://stellarlight.xyz";
const out = process.argv[2];
if (!out) throw new Error("usage: capture.mts <out-dir>");
mkdirSync(join(out, "detail"), { recursive: true });
mkdirSync(join(out, "builds"), { recursive: true });

let last = 0;
let gets = 0;
async function get(path: string): Promise<unknown> {
	const wait = last + 2_000 - Date.now();
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	last = Date.now();
	gets++;
	const res = await fetch(`${BASE}${path}`, {
		headers: { accept: "application/json" },
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
	return res.json();
}
const save = (name: string, body: unknown) =>
	writeFileSync(join(out, name), `${JSON.stringify(body, null, 1)}\n`);

type Status = { apiVersion: string; generatedAt: string };
const start = (await get("/api/status")) as Status;
save("status-start.json", {
	apiVersion: start.apiVersion,
	generatedAt: start.generatedAt,
});
const list = (await get("/api/hackathons?limit=300")) as {
	hackathons: Array<{ slug: string }>;
};
save("list.json", list);
const byEvent = (await get("/api/hackathons/analyze?facet=event&top=30")) as {
	total: { values: Array<{ value: string; builds: number }> };
	meta: { counts: { indexedBuilds: number } };
};
save("analyze-event.json", byEvent);
save(
	"analyze-category.json",
	await get("/api/hackathons/analyze?facet=category&top=30"),
);
for (const { slug } of list.hackathons)
	save(
		join("detail", `${slug}.json`),
		await get(`/api/hackathons/${encodeURIComponent(slug)}`),
	);
for (const { value: slug, builds: n } of byEvent.total.values) {
	const rows: unknown[] = [];
	for (let offset = 0; offset < n; offset += 100) {
		const page = (await get(
			`/api/hackathons/builds?hackathon=${encodeURIComponent(slug)}&limit=100&offset=${offset}`,
		)) as { builds: unknown[] };
		rows.push(...page.builds);
	}
	if (rows.length !== n)
		throw new Error(`${slug}: ${rows.length} rows read, analyze counts ${n}`);
	save(join("builds", `${slug}.json`), rows);
}
const end = (await get("/api/status")) as Status;
save("status-end.json", {
	apiVersion: end.apiVersion,
	generatedAt: end.generatedAt,
});
console.log(
	`${gets} GETs; apiVersion ${start.apiVersion} at ${start.generatedAt}, ${end.apiVersion} at ${end.generatedAt}; ${list.hackathons.length} listed events, ${byEvent.total.values.length} indexed, ${byEvent.meta.counts.indexedBuilds} entries`,
);
