// Read-only GETs against production. For each idea: the hybrid
// searchHackathonBuilds ranking (top 100, the route's default mode, the one
// vetIdea runs), the live vetIdea priorArt block and the live hackathonBrief
// builds. Also every stored build in browse mode (paged), the pool the
// scorer weighs words over. /api/status apiVersion is read at start and end.
// Usage: node capture.mjs <ideas.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , ideasPath, outPath] = process.argv;
const BASE = "https://www.stellarlight.xyz";
const ideas = JSON.parse(readFileSync(ideasPath, "utf8")).ideas;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE = 2000;

async function get(path) {
	for (let attempt = 0; attempt < 6; attempt++) {
		const res = await fetch(BASE + path);
		if (res.status === 429 || res.status === 503) {
			const after = Number(res.headers.get("retry-after"));
			await sleep(
				Number.isFinite(after) && after > 0
					? after * 1000
					: 5000 * (attempt + 1),
			);
			continue;
		}
		const body = await res.json().catch(() => null);
		return { status: res.status, body };
	}
	return { status: 429, body: null };
}
const version = async () => (await get("/api/status")).body?.apiVersion ?? null;
const row = (b) => ({
	id: b.id,
	name: b.name,
	description: b.description ?? null,
	track: b.track ?? null,
	award: b.award ?? null,
	hackathon: b.hackathon,
	hackathonSlug: b.hackathonSlug,
	endedAt: b.endedAt ?? null,
	placement: b.placement ?? null,
	isWinner: !!b.isWinner,
	matchedTerms: b.matchedTerms ?? [],
	...(b.similarity !== undefined ? { similarity: b.similarity } : {}),
});

const out = {
	startedAt: new Date().toISOString(),
	apiVersionStart: await version(),
	corpus: [],
	rows: [],
};
// Browse mode: every stored submission, one per submission, in index order.
for (let offset = 0, total = Infinity; offset < total; offset += 100) {
	const r = await get(`/api/hackathons/builds?limit=100&offset=${offset}`);
	if (r.status !== 200) throw new Error(`browse ${offset}: ${r.status}`);
	total = r.body.meta.counts.matched;
	out.corpusCounts = r.body.meta.counts;
	out.corpus.push(...r.body.builds.map(row));
	if (!r.body.builds.length) break;
	await sleep(PAUSE);
}
process.stdout.write(`corpus ${out.corpus.length}\n`);
for (const it of ideas) {
	const q = encodeURIComponent(it.idea);
	const builds = await get(`/api/hackathons/builds?q=${q}&limit=100`);
	await sleep(PAUSE);
	const vet = await get(`/api/vet-idea?q=${q}`);
	await sleep(PAUSE);
	const brief = await get(`/api/hackathon-brief?q=${q}`);
	const pa = vet.body?.report?.priorArt ?? null;
	out.rows.push({
		...it,
		buildsStatus: builds.status,
		buildsMeta: builds.body?.meta && {
			counts: builds.body.meta.counts,
			mode: builds.body.meta.mode,
			warnings: builds.body.meta.warnings ?? [],
		},
		ranked: (builds.body?.builds ?? []).map(row),
		vetStatus: vet.status,
		priorArt: pa && {
			builds: pa.builds,
			buildsMode: pa.buildsMode,
			buildsBelowEvidenceRule: pa.buildsBelowEvidenceRule,
			note: pa.note,
		},
		briefStatus: brief.status,
		briefBuilds: brief.body?.report?.builds?.map((b) => b.id) ?? null,
	});
	process.stdout.write(".");
	await sleep(PAUSE);
}
out.apiVersionEnd = await version();
out.endedAt = new Date().toISOString();
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(
	`\n${out.rows.length} ideas; corpus ${out.corpus.length}; api ${out.apiVersionStart} -> ${out.apiVersionEnd}`,
);
