// Read-only GETs against production, for one-word ideas: every matched
// submission in searchHackathonBuilds' order (paged), plus the live
// hackathonBrief builds and vetIdea priorArt.builds, for replay parity.
// Usage: node tmp/fetch-full.mjs <out.json> "idea one" "idea two" ...
import { writeFileSync } from "node:fs";

const [, , outPath, ...ideas] = process.argv;
const BASE = "https://www.stellarlight.xyz";
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
for (const idea of ideas) {
	const q = encodeURIComponent(idea);
	const ranked = [];
	let matched = Infinity;
	let mode = null;
	for (let offset = 0; offset < matched; offset += 100) {
		const r = await get(`/api/hackathons/builds?q=${q}&limit=100&offset=${offset}`);
		matched = r.body?.meta?.counts?.matched ?? 0;
		mode = r.body?.meta?.mode ?? null;
		for (const b of r.body?.builds ?? [])
			ranked.push({
				id: b.id,
				name: b.name,
				description: b.description,
				track: b.track,
				award: b.award,
				hackathon: b.hackathon,
				placement: b.placement,
				isWinner: b.isWinner,
				matchedTerms: b.matchedTerms ?? [],
				similarity: b.similarity,
			});
		if (!r.body?.builds?.length) break;
	}
	const brief = await get(`/api/hackathon-brief?q=${q}`);
	await sleep(2300);
	const vet = await get(`/api/vet-idea?q=${q}`);
	out.rows.push({
		idea,
		matched,
		mode,
		ranked,
		briefStatus: brief.status,
		briefBuilds: brief.body?.report?.builds?.map((b) => b.id) ?? null,
		vetBuilds: vet.body?.report?.priorArt?.builds?.map((b) => b.id) ?? null,
	});
	process.stdout.write(".");
	await sleep(2300);
}
out.apiVersionEnd = await version();
out.endedAt = new Date().toISOString();
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(`\n${out.rows.length} ideas; api ${out.apiVersionStart} -> ${out.apiVersionEnd}`);
