// Blind labeling sheet: every build in the top-5 window of each idea, shuffled,
// with no matched words, scores, ranks or served flags.
// Usage: node sheet.mjs <out.md> <key.json> <live.json>[:idea|idea...] ...
import { readFileSync, writeFileSync } from "node:fs";
const [, , outMd, outKey, ...inputs] = process.argv;
const rows = [];
for (const spec of inputs) {
	const [path, only] = spec.split(":");
	const keep = only ? new Set(only.split("|")) : null;
	for (const r of JSON.parse(readFileSync(path, "utf8")).rows) {
		if (keep && !keep.has(r.idea)) continue;
		for (const s of r.ranked.slice(0, 5))
			rows.push({
				idea: r.idea,
				id: s.id,
				name: s.name,
				hackathon: s.hackathon,
				track: s.track,
				description: (s.description ?? "").replace(/\s+/g, " ").slice(0, 420),
			});
	}
}
// Deterministic shuffle (mulberry32), so the sheet order says nothing about rank.
let seed = 20261022;
const rand = () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
for (let i = rows.length - 1; i > 0; i--) {
	const j = Math.floor(rand() * (i + 1));
	[rows[i], rows[j]] = [rows[j], rows[i]];
}
const md = rows
	.map(
		(r, i) =>
			`### ${i + 1}\nIdea: ${r.idea}\nSubmission: ${r.name}\nEvent: ${r.hackathon}${r.track ? ` (track: ${r.track})` : ""}\nSummary: ${r.description || "(none)"}\n`,
	)
	.join("\n");
writeFileSync(outMd, md);
writeFileSync(outKey, JSON.stringify(rows.map((r, i) => ({ n: i + 1, idea: r.idea, id: r.id })), null, 1));
console.log(`${rows.length} rows`);
