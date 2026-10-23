// Read-only GETs against production, 2 s apart, in the shape of
// ../2026-10-23-build-matching/capture.mjs so that audit's replay.mts and
// compare.mts read the output as they are. Captures:
//   every stored submission in browse mode (the pool the scorer reads), with
//   its declared `stack`;
//   per query of the fresh frozen battery (nonsense-fresh.frozen.json.txt, every
//   query, none edited or dropped) and the probe "quantum llama sandwich":
//   the whole keyword and hybrid rankings (every hybrid row with a meaning
//   score gives the replay its meaning map).
// /api/status apiVersion is read at start and end.
// Usage, from the repository root:
//   node improvements/audits/2026-10-23-nonsense-queries/capture.mjs <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , outPath] = process.argv;
const BASE = "https://www.stellarlight.xyz";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE = 2000;
const MAX_ROWS = 600;

const battery = JSON.parse(
	readFileSync(
		"improvements/audits/2026-10-23-nonsense-queries/nonsense-fresh.frozen.json.txt",
		"utf8",
	),
);
const extra = [
	...battery.queries.map((x) => ({
		kind: "nonsense",
		id: x.id,
		group: x.kind,
		q: x.q,
	})),
	{ kind: "probe", q: "quantum llama sandwich" },
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
await sleep(PAUSE);
for (let offset = 0, total = Infinity; offset < total; offset += 100) {
	const r = await get(`/api/hackathons/builds?limit=100&offset=${offset}`);
	if (r.status !== 200) throw new Error(`browse ${offset}: ${r.status}`);
	total = r.body.meta.counts.matched;
	out.corpusCounts = r.body.meta.counts;
	out.corpus.push(...r.body.builds.map(row));
	await sleep(PAUSE);
	if (!r.body.builds.length) break;
}
process.stdout.write(`corpus ${out.corpus.length}\n`);
for (const x of extra) {
	const q = `q=${encodeURIComponent(x.q)}`;
	out.extra.push({
		...x,
		keyword: await ranking(`${q}&mode=keyword`, MAX_ROWS),
		hybrid: await ranking(`${q}&mode=hybrid`, MAX_ROWS),
	});
	process.stdout.write("x");
}
out.apiVersionEnd = await version();
out.endedAt = new Date().toISOString();
writeFileSync(outPath, JSON.stringify(out, null, 1));
const statuses = out.extra.flatMap((x) => [
	...x.keyword.pages,
	...x.hybrid.pages,
]);
console.log(
	`\n${out.extra.length} queries; corpus ${out.corpus.length}; pages ${statuses.length}, non-200 ${statuses.filter((s) => s !== 200).length}; api ${out.apiVersionStart} -> ${out.apiVersionEnd}; ${out.startedAt} to ${out.endedAt}`,
);
