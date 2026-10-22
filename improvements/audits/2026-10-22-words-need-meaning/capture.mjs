// Read-only GETs against production, as the earlier capture
// (../2026-10-22-prior-art-precision/capture.mjs) does, plus what this rule
// needs. For each idea: the whole hybrid searchHackathonBuilds ranking (paged,
// up to 500 rows, the mode vetIdea and hackathonBrief run), the count of
// builds with a meaning score (mode=meaning, whose matched count is every
// neighbour above the floor), live vetIdea priorArt and live hackathonBrief
// builds. Also every stored build in browse mode, the pool the scorer reads.
// /api/status apiVersion is read at start and end.
// Usage: node capture.mjs <fresh-ideas.frozen.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , ideasPath, outPath] = process.argv;
const BASE = "https://www.stellarlight.xyz";
const ideas = JSON.parse(readFileSync(ideasPath, "utf8")).ideas;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE = 2000;
const MAX_ROWS = 500;

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
	const ranked = [];
	const pages = [];
	let meta = null;
	for (let offset = 0, total = 1; offset < Math.min(total, MAX_ROWS); ) {
		const r = await get(
			`/api/hackathons/builds?q=${q}&limit=100&offset=${offset}`,
		);
		await sleep(PAUSE);
		pages.push(r.status);
		if (r.status !== 200) break;
		meta ??= {
			counts: r.body.meta.counts,
			mode: r.body.meta.mode,
			warnings: r.body.meta.warnings ?? [],
		};
		total = r.body.meta.counts.matched;
		ranked.push(...r.body.builds.map(row));
		if (!r.body.builds.length) break;
		offset += 100;
	}
	const meaning = await get(
		`/api/hackathons/builds?q=${q}&mode=meaning&limit=1`,
	);
	await sleep(PAUSE);
	const vet = await get(`/api/vet-idea?q=${q}`);
	await sleep(PAUSE);
	const brief = await get(`/api/hackathon-brief?q=${q}`);
	const pa = vet.body?.report?.priorArt ?? null;
	out.rows.push({
		...it,
		buildsPages: pages,
		buildsMeta: meta,
		ranked,
		meaningStatus: meaning.status,
		meaningServed: meaning.body?.meta?.mode?.served ?? null,
		meaningNeighbours: meaning.body?.meta?.counts?.matched ?? null,
		vetStatus: vet.status,
		priorArt: pa && {
			builds: pa.builds,
			buildsMode: pa.buildsMode,
			buildsBelowEvidenceRule: pa.buildsBelowEvidenceRule,
			note: pa.note,
		},
		briefStatus: brief.status,
		briefBuilds: brief.body?.report?.builds?.map((b) => b.id) ?? null,
		briefVetBuilds:
			brief.body?.report?.vet?.priorArt?.builds?.map((b) => b.id) ?? null,
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
