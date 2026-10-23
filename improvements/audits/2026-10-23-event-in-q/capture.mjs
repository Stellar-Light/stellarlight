// Read-only GETs against production, 2 s apart, for the event-in-q replay.
// Captures:
//   /api/status apiVersion at start and end;
//   the event listing (/api/hackathons?limit=200);
//   every stored submission in browse mode (the pool the route searches);
//   per query, the whole hybrid ranking (paged, up to 600 rows), whose
//   meaning scores are the meaning map the replay hands the route: every
//   frozen builds-search query of improvements/audits/*/ (listed in
//   `frozen` below, none edited or dropped), every probe q in probes.json
//   and the rest a probe leaves after its event name is removed.
// The output holds upstream submission text: write it to a scratch
// directory, never commit it.
// Usage, from the repository root:
//   node improvements/audits/2026-10-23-event-in-q/capture.mjs <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , outPath] = process.argv;
const BASE = "https://www.stellarlight.xyz";
const DIR = "improvements/audits";
const read = (p) => JSON.parse(readFileSync(`${DIR}/${p}`, "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PAUSE = 2000;
const MAX_ROWS = 600;

const ideas = (p, group, key = "ideas") =>
	read(p)[key].map((i, n) => ({
		group,
		id: i.id ?? `${group}-${n + 1}`,
		q: i.idea,
	}));
const frozen = [
	...ideas("2026-10-22-prior-art-precision/ideas.json", "ideas40"),
	...ideas("2026-10-22-prior-art-precision/windows-short.json", "short36"),
	...ideas("2026-10-22-prior-art-precision/windows-tests.json", "tests34"),
	...ideas("2026-10-22-words-need-meaning/fresh-ideas.frozen.json", "fresh30"),
	...read("2026-10-23-build-matching/nonsense.frozen.json").queries.map(
		(q, n) => ({ group: "nonsense15", id: `k${n + 1}`, q }),
	),
	{ group: "probe", id: "quantum", q: "quantum llama sandwich" },
	{ group: "passkey", id: "passkey-winners", q: "passkey", winnersOnly: true },
	{ group: "passkey", id: "passkey", q: "passkey" },
	...read(
		"2026-10-23-nonsense-queries/nonsense-fresh.frozen.json.txt",
	).queries.map((x) => ({ group: "nonsense24", id: x.id, q: x.q })),
	...ideas(
		"2026-10-22-short-idea-prior-art/live-one-word.json",
		"oneword15",
		"rows",
	),
	...ideas("2026-10-22-short-idea-prior-art/short-ideas.json", "shortideas36"),
	...ideas("2026-10-22-short-idea-prior-art/test-ideas.json", "testideas34"),
	// The size probes of ../2026-10-23-compact-views/sizes.md.
	{ group: "compact", id: "payments", q: "payments" },
	{ group: "compact", id: "wallet", q: "wallet" },
	{ group: "compact", id: "nft", q: "nft marketplace" },
];
const probes = JSON.parse(
	readFileSync(`${DIR}/2026-10-23-event-in-q/probes.json`, "utf8"),
);
const extra = [
	...probes.probes.filter((p) => p.q.trim()).map((p) => ({ q: p.q })),
	...probes.restQueries.map((q) => ({ q })),
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
const corpusRow = (b) => ({
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
	url: b.url ?? null,
	githubUrl: b.githubUrl ?? null,
	demoUrl: b.demoUrl ?? null,
	...(b.project !== undefined ? { project: b.project } : {}),
	...(b.stack ? { stack: b.stack } : {}),
});
const rankRow = (b) => ({
	id: b.id,
	hackathonSlug: b.hackathonSlug,
	...(b.matchedTerms ? { matchedTerms: b.matchedTerms } : {}),
	...(b.similarity !== undefined ? { similarity: b.similarity } : {}),
});
/** The replay's lookup key: the q the route searches, as parseBuildFilters reads it. */
const key = (q, winnersOnly) =>
	`${winnersOnly ? "w|" : ""}${q.trim().toLowerCase()}`;

const out = {
	startedAt: new Date().toISOString(),
	apiVersionStart: await version(),
	frozen,
	events: [],
	corpus: [],
	rankings: {},
};
await sleep(PAUSE);
const listing = await get("/api/hackathons?limit=200");
if (listing.status !== 200) throw new Error(`listing: ${listing.status}`);
out.events = listing.body.hackathons.map((h) => ({
	slug: h.slug,
	name: h.name,
	source: h.source,
	status: h.status,
}));
out.eventCounts = listing.body.meta.counts;
await sleep(PAUSE);
for (let offset = 0, total = Infinity; offset < total; offset += 100) {
	const r = await get(`/api/hackathons/builds?limit=100&offset=${offset}`);
	if (r.status !== 200) throw new Error(`browse ${offset}: ${r.status}`);
	total = r.body.meta.counts.matched;
	out.corpusCounts = r.body.meta.counts;
	out.corpus.push(...r.body.builds.map(corpusRow));
	await sleep(PAUSE);
	if (!r.body.builds.length) break;
}
process.stdout.write(`corpus ${out.corpus.length}\n`);
for (const x of [...frozen, ...extra]) {
	const k = key(x.q, x.winnersOnly);
	if (out.rankings[k]) continue;
	const params = `q=${encodeURIComponent(x.q)}${x.winnersOnly ? "&winnersOnly=1" : ""}&mode=hybrid`;
	const rows = [];
	const pages = [];
	let meta = null;
	for (let offset = 0, total = 1; offset < Math.min(total, MAX_ROWS); ) {
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
		rows.push(...r.body.builds.map(rankRow));
		if (!r.body.builds.length) break;
		offset += 100;
	}
	out.rankings[k] = { q: x.q, winnersOnly: !!x.winnersOnly, pages, meta, rows };
	process.stdout.write(".");
}
out.apiVersionEnd = await version();
out.endedAt = new Date().toISOString();
writeFileSync(outPath, JSON.stringify(out));
console.log(
	`\nevents ${out.events.length}; corpus ${out.corpus.length}; frozen ${frozen.length} queries; rankings ${Object.keys(out.rankings).length}; api ${out.apiVersionStart} -> ${out.apiVersionEnd}`,
);
