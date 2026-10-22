// Read-only GETs against production: vetIdea and searchHackathonBuilds for each idea.
// Usage: node fetch.mjs <ideas.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , ideasPath, outPath] = process.argv;
const BASE = "https://www.stellarlight.xyz";
const ideas = JSON.parse(readFileSync(ideasPath, "utf8")).ideas;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
	for (let attempt = 0; attempt < 4; attempt++) {
		const res = await fetch(BASE + path);
		if (res.status === 429 || res.status === 503) {
			await sleep(5000 * (attempt + 1));
			continue;
		}
		return { status: res.status, body: await res.json() };
	}
	return { status: 429, body: null };
}

const version = async () => (await get("/api/status")).body?.apiVersion ?? null;

const out = {
	startedAt: new Date().toISOString(),
	apiVersionStart: await version(),
	rows: [],
};
for (const it of ideas) {
	const q = encodeURIComponent(it.idea);
	const vet = await get(`/api/vet-idea?q=${q}`);
	const builds = await get(`/api/hackathons/builds?q=${q}&limit=10`);
	const pa = vet.body?.report?.priorArt ?? null;
	out.rows.push({
		...it,
		vetStatus: vet.status,
		vertical: vet.body?.report?.vertical ?? null,
		priorArt: pa && {
			builds: pa.builds,
			buildsMode: pa.buildsMode,
			note: pa.note,
			repos: pa.repos?.map((r) => r.fullName),
		},
		buildsStatus: builds.status,
		buildsMeta: builds.body?.meta && {
			counts: builds.body.meta.counts,
			mode: builds.body.meta.mode,
			warnings: builds.body.meta.warnings ?? [],
		},
		ranked: (builds.body?.builds ?? []).map((b) => ({
			id: b.id,
			name: b.name,
			description: b.description,
			track: b.track,
			hackathon: b.hackathon,
			isWinner: b.isWinner,
			matchedTerms: b.matchedTerms ?? [],
			similarity: b.similarity,
		})),
	});
	process.stdout.write(".");
	await sleep(2300);
}
out.apiVersionEnd = await version();
out.endedAt = new Date().toISOString();
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(
	`\n${out.rows.length} ideas; api ${out.apiVersionStart} -> ${out.apiVersionEnd}`,
);
