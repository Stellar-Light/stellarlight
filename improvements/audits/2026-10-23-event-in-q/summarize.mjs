// Reads a capture (capture.mjs) and the base and branch replays
// (replay.test.ts) and prints: what the capture holds, how many frozen
// queries hold an event name or slug, each probe before and after against
// its expected outcome (probes.json), the base replay's parity with live on
// q=HackMeridian 2025, the v1 checks, and the frozen responses that differ.
// Usage, from the repository root:
//   node improvements/audits/2026-10-23-event-in-q/summarize.mjs <live.json> <base-dir> <branch-dir>
import { readFileSync } from "node:fs";

const [, , livePath, baseDir, headDir] = process.argv;
const live = JSON.parse(readFileSync(livePath, "utf8"));
const probes = JSON.parse(
	readFileSync("improvements/audits/2026-10-23-event-in-q/probes.json", "utf8"),
).probes;
const lines = (p) =>
	readFileSync(p, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((l) => JSON.parse(l));
const words = (s) =>
	s
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.match(/[\p{L}\p{N}]+/gu) ?? [];
const holdsRun = (hay, run) =>
	run.length > 0 && hay.some((_, i) => run.every((w, j) => hay[i + j] === w));
const out = (s = "") => console.log(s);

// What the capture holds.
const hm = live.corpus.filter((r) => r.hackathonSlug === "hackmeridian-2025");
const ranks = Object.values(live.rankings);
out("## Capture");
out(
	`apiVersion ${live.apiVersionStart} at ${live.startedAt}, ${live.apiVersionEnd} at ${live.endedAt}`,
);
out(
	`events listed ${live.events.length} (${JSON.stringify(live.eventCounts)}); stored submissions ${live.corpus.length} (counts ${JSON.stringify(live.corpusCounts)})`,
);
out(
	`hackmeridian-2025 rows: ${hm.length}: ${hm.map((r) => `${r.name} (${r.track}, ${r.placement}, winner ${r.isWinner}, githubUrl ${r.githubUrl}, project ${r.project === undefined ? "absent" : JSON.stringify(r.project)})`).join("; ")}`,
);
out(
	`rankings ${ranks.length}; any page not 200: ${ranks.filter((r) => r.pages.some((s) => s !== 200)).length}; served keyword (meaning could not run): ${ranks.filter((r) => r.meta?.mode?.served === "keyword").length}; cut at 600 rows: ${ranks.filter((r) => r.rows.length >= 600).length}; fewer rows than the first page's matched count (the count moved between pages; only the first page's is kept): ${
		ranks
			.filter(
				(r) =>
					r.meta &&
					r.rows.length < 600 &&
					r.rows.length < r.meta.counts.matched,
			)
			.map((r) => `${r.q} (${r.rows.length} of ${r.meta.counts.matched})`)
			.join("; ") || "none"
	}`,
);

// The events the branch reads: the index's and the curated ones.
const events = new Map();
for (const r of live.corpus) events.set(r.hackathonSlug, r.hackathon);
for (const e of live.events)
	if (e.source === "curated" && !events.has(e.slug)) events.set(e.slug, e.name);
const notRead = live.events
	.filter((e) => !events.has(e.slug))
	.map((e) => e.slug);
out(
	`events the branch reads: ${events.size} (index ${new Set(live.corpus.map((r) => r.hackathonSlug)).size}, plus curated); listed but not read: ${notRead.length ? notRead.join(", ") : "none"}; read but not listed: ${[...events.keys()].filter((s) => !live.events.some((e) => e.slug === s)).join(", ") || "none"}`,
);

// (b) first: frozen queries that hold an event name or slug, read broadly
// (a slug with or without its hyphens).
const uniqueQ = [...new Set(live.frozen.map((f) => f.q))];
const named = uniqueQ.flatMap((q) => {
	const qw = words(q);
	const hits = [...events].filter(
		([slug, title]) =>
			holdsRun(qw, words(title)) ||
			holdsRun(qw, words(slug)) ||
			q.toLowerCase().includes(slug),
	);
	return hits.length ? [`${q} -> ${hits.map(([s]) => s).join(", ")}`] : [];
});
out();
out("## Frozen queries holding an event name or slug");
out(
	`${live.frozen.length} entries, ${uniqueQ.length} unique q; holding a title or slug (hyphens kept or dropped): ${named.length}`,
);
for (const n of named) out(`- ${n}`);

// Probes, before and after.
const base = new Map(lines(`${baseDir}/probes.jsonl`).map((l) => [l.id, l]));
const head = new Map(lines(`${headDir}/probes.jsonl`).map((l) => [l.id, l]));
const kindOf = (w) =>
	w.startsWith("q holds the event name '")
		? "inferred"
		: /^q holds '.*', the start of the names of \d+ events/.test(w)
			? "partial"
			: /^q names \d+ events \(/.test(w)
				? "multiple"
				: w.startsWith("q names the event '")
					? "explicit"
					: null;
const listed = (w, kind) =>
	kind === "explicit"
		? [/\(([^)]+)\), which/.exec(w)?.[1]]
		: kind === "partial" || kind === "multiple"
			? (/events \(([^)]+)\)/.exec(w)?.[1] ?? "").split(", ")
			: [];
const read = (l) => {
	const b = JSON.parse(l.body);
	const ev = (b.meta?.warnings ?? [])
		.map((w) => ({ w, kind: kindOf(w) }))
		.filter((x) => x.kind);
	return {
		status: l.status,
		inferred: b.meta?.inferredFilter ?? null,
		kinds: ev.map((x) => x.kind),
		candidates: ev.flatMap((x) => listed(x.w, x.kind)).sort(),
		q: b.meta?.filters?.q ?? null,
		hackathon: b.meta?.filters?.hackathon ?? null,
		matched: b.meta?.counts?.matched,
		builds: b.builds ?? [],
		warnings: b.meta?.warnings ?? [],
	};
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const startsTitle = (prefix) =>
	[...events]
		.filter(([, t]) => {
			const tw = words(t);
			const pw = words(prefix);
			return pw.every((w, i) => tw[i] === w) && tw.length > pw.length;
		})
		.map(([s]) => s)
		.sort();
out();
out("## Probes (replay, limit 20)");
out(
	"| probe | q | params | before: filter, warning, matched | after: inferred, warning, filters.q, matched | expected | result |",
);
out("| --- | --- | --- | --- | --- | --- | --- |");
let pass = 0;
for (const p of probes) {
	const e = p.expect;
	const b = read(base.get(p.id));
	const a = read(head.get(p.id));
	const cands = e.candidatesTitlePrefix
		? startsTitle(e.candidatesTitlePrefix)
		: e.candidates;
	const checks = [
		["status 200", a.status === 200],
		["inferred", (a.inferred?.hackathon ?? null) === e.inferred],
		...(e.matched ? [["matched", a.inferred?.matched === e.matched]] : []),
		[
			"warning",
			e.warning === "none"
				? a.kinds.length === 0
				: same(a.kinds, [e.warning === "multiple" ? "multiple" : e.warning]),
		],
		...(cands ? [["candidates", same(a.candidates, [...cands].sort())]] : []),
		...("filtersQ" in e ? [["filters.q", a.q === e.filtersQ]] : []),
		...("filtersHackathon" in e
			? [["filters.hackathon", same(a.hackathon, e.filtersHackathon)]]
			: []),
		...(e.sixWinners
			? [
					[
						"six winners",
						a.builds.filter(
							(x) =>
								x.hackathonSlug === "hackmeridian-2025" &&
								x.isWinner &&
								x.track,
						).length === 6 && a.builds.length === 6,
					],
				]
			: []),
	];
	const failed = checks.filter(([, ok]) => !ok).map(([n]) => n);
	if (!failed.length) pass++;
	const evs = (r) =>
		[...new Set(r.builds.map((x) => x.hackathonSlug))].slice(0, 4).join(" ");
	out(
		`| ${p.id} | ${p.q || "(empty)"} | ${p.params ? JSON.stringify(p.params) : ""} | ${b.hackathon ? b.hackathon.join(",") : "none"}; ${b.kinds.join(",") || "none"}; ${b.matched} (${evs(b) || "-"}) | ${a.inferred ? `${a.inferred.hackathon} '${a.inferred.matched}'` : "none"}; ${a.kinds.map((k, i) => (a.candidates.length && i === 0 ? `${k} [${a.candidates.join(" ")}]` : k)).join(",") || "none"}; q ${JSON.stringify(a.q)}; ${a.matched} (${evs(a) || "-"}) | ${e.inferred ?? "none"}; ${e.warning}${cands ? ` [${cands.join(" ")}]` : ""} | ${failed.length ? `FAIL (${failed.join(", ")})` : "pass"} |`,
	);
}
out();
out(`${pass} of ${probes.length} probes pass.`);

// The base replay against live on the v1 request.
const p01 = read(base.get("p01"));
const liveRows = live.rankings["hackmeridian 2025"].rows.slice(0, 20);
out();
out("## Parity of the base replay with live, q=HackMeridian 2025, limit 20");
out(
	`live ${liveRows.length} rows [${liveRows.map((r) => `${r.id}@${r.hackathonSlug}`).join(", ")}]`,
);
out(
	`base replay ${p01.builds.length} rows [${p01.builds.map((r) => `${r.id}@${r.hackathonSlug}`).join(", ")}]; same ids in the same order: ${same(
		liveRows.map((r) => r.id),
		p01.builds.map((r) => r.id),
	)}`,
);

// (c) the v1 questions on the branch.
const v1 = read(head.get("p01")).builds.filter(
	(x) => x.hackathonSlug === "hackmeridian-2025",
);
const names = v1.map((x) => x.name).join(" | ");
const need = [
	"The Simple Fund",
	"4Bridge",
	"Stellar Forge",
	"Lance",
	"Star Lends",
	"Panorama Block",
];
out();
out("## v1 questions (branch replay, q=HackMeridian 2025, limit 20)");
out(`hackmeridian-2025 builds served: ${v1.length}: ${names}`);
out(
	`tracks: ${v1.map((x) => `${x.name}=${x.track}`).join(", ")}; every one a winner: ${v1.every((x) => x.isWinner)}`,
);
out(
	`q08 names present: ${need.every((n) => names.includes(n))}; q08/q11 no repo link: ${v1.every((x) => !x.githubUrl)}; q11 six with tracks: ${v1.length >= 6 && v1.every((x) => x.track)}; q12 no project link: ${v1.every((x) => !x.project)}`,
);

// Frozen responses that differ (cmp is the proof; this names them).
const fb = lines(`${baseDir}/frozen.jsonl`);
const fh = lines(`${headDir}/frozen.jsonl`);
const diff = fb.filter((l, i) => !same(l, fh[i]));
out();
out("## Frozen responses");
out(
	`base ${fb.length} lines, branch ${fh.length}; differing ${diff.length}${diff.length ? `: ${diff.map((l) => l.qs).join("; ")}` : ""}`,
);
const statuses = {};
for (const l of fb) statuses[l.status] = (statuses[l.status] ?? 0) + 1;
out(`statuses: ${JSON.stringify(statuses)}`);
