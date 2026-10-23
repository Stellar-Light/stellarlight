// Read-only GETs against production, as ../2026-10-22-words-need-meaning/
// capture.mjs does. Captures:
//   every stored submission in browse mode (the pool the scorer reads), with
//   its declared `stack`;
//   per labeled idea (the 40 ideas, 36 short and 34 test ideas of
//   ../2026-10-22-prior-art-precision and the 30 fresh ideas of
//   ../2026-10-22-words-need-meaning): the whole hybrid ranking (paged, up
//   to 600 rows; every row with a meaning score gives the replay its meaning
//   map) and the first keyword page with its matched count (parity);
//   per extra query (the frozen nonsense battery, the battery probe and the
//   passkey checks): the whole keyword and hybrid rankings.
// /api/status apiVersion is read at start and end.
// Usage, from the repository root:
//   node improvements/audits/2026-10-23-build-matching/capture.mjs <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , outPath] = process.argv;
const BASE = "https://www.stellarlight.xyz";
const DIR = "improvements/audits";
const read = (p) => JSON.parse(readFileSync(`${DIR}/${p}`, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE = 1200;
const MAX_ROWS = 600;

const ideas = [
	...read("2026-10-22-prior-art-precision/ideas.json").ideas.map((i) => ({
		set: "40",
		id: i.id,
		idea: i.idea,
	})),
	...read("2026-10-22-prior-art-precision/windows-short.json").ideas.map(
		(i) => ({ set: "short", id: i.id, idea: i.idea }),
	),
	...read("2026-10-22-prior-art-precision/windows-tests.json").ideas.map(
		(i) => ({ set: "tests", id: i.id, idea: i.idea }),
	),
	...read("2026-10-22-words-need-meaning/fresh-ideas.frozen.json").ideas.map(
		(i) => ({ set: "fresh", id: i.id, idea: i.idea }),
	),
];
const nonsense = read(
	"2026-10-23-build-matching/nonsense.frozen.json",
).queries.map((q) => ({ kind: "nonsense", q }));
const extra = [
	...nonsense,
	{ kind: "probe", q: "quantum llama sandwich" },
	{ kind: "passkey", q: "passkey", winnersOnly: true },
	{ kind: "passkey", q: "passkey" },
];

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
	votes: b.votes ?? null,
	...(b.stack ? { stack: b.stack } : {}),
	matchedTerms: b.matchedTerms ?? [],
	...(b.similarity !== undefined ? { similarity: b.similarity } : {}),
});

/** Every page of one ranking, up to `max` rows. */
async function ranking(params, max) {
	const rows = [];
	const pages = [];
	let meta = null;
	for (let offset = 0, total = 1; offset < Math.min(total, max); ) {
		const r = await get(
			`/api/hackathons/builds?${params}&limit=100&offset=${offset}`,
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
		rows.push(...r.body.builds.map(row));
		if (!r.body.builds.length) break;
		offset += 100;
	}
	return { pages, meta, rows };
}

const out = {
	startedAt: new Date().toISOString(),
	apiVersionStart: await version(),
	corpus: [],
	ideas: [],
	extra: [],
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
for (const x of extra) {
	const q = `q=${encodeURIComponent(x.q)}${x.winnersOnly ? "&winnersOnly=1" : ""}`;
	out.extra.push({
		...x,
		keyword: await ranking(`${q}&mode=keyword`, MAX_ROWS),
		hybrid: await ranking(`${q}&mode=hybrid`, MAX_ROWS),
	});
	process.stdout.write("x");
}
for (const it of ideas) {
	const q = `q=${encodeURIComponent(it.idea)}`;
	out.ideas.push({
		...it,
		hybrid: await ranking(`${q}&mode=hybrid`, MAX_ROWS),
		keyword: await ranking(`${q}&mode=keyword`, 100),
	});
	process.stdout.write(".");
}
out.apiVersionEnd = await version();
out.endedAt = new Date().toISOString();
writeFileSync(outPath, JSON.stringify(out, null, 1));
console.log(
	`\n${out.ideas.length} ideas, ${out.extra.length} extra queries; corpus ${out.corpus.length}; api ${out.apiVersionStart} -> ${out.apiVersionEnd}`,
);
