// Which one-word-path builds (top five, matched the word, no 0.7 meaning score)
// carry the idea's word itself, or its plural or singular, in their own name or
// description, versus only a synonym. Labels from tmp/labels.json.
// Usage, from the worktree root: pnpm exec tsx tmp/literal-check.mts tmp/live-short.json tmp/live-tests.json
import { readFileSync } from "node:fs";
import { concepts, type Row } from "./replay.mts";

const key = JSON.parse(readFileSync("tmp/label-key.json", "utf8")) as {
	n: number;
	idea: string;
	id: string;
}[];
const labelOf = new Map<number, number>(
	JSON.parse(readFileSync("tmp/labels.json", "utf8")).map(
		(l: { n: number; label: number }) => [l.n, l.label],
	),
);
const label = new Map(key.map((k) => [`${k.idea}::${k.id}`, labelOf.get(k.n)]));
const forms = (t: string) =>
	t.length > 3 && t.endsWith("s") ? [t, t.slice(0, -1)] : t.length > 2 ? [t, `${t}s`] : [t];
const hit = (v: string, s: string) =>
	v.length > 3 ? s.includes(v) : new RegExp(`\\b${v}\\b`).test(s);
const tally = { literal: [0, 0, 0, 0], synonymOnly: [0, 0, 0, 0] };
for (const path of process.argv.slice(2))
	for (const row of JSON.parse(readFileSync(path, "utf8")).rows) {
		const c = concepts(row.idea);
		if (c.length !== 1) continue;
		for (const r of (row.ranked as Row[]).slice(0, 5)) {
			if (!r.matchedTerms.length || (r.similarity ?? 0) >= 0.7) continue;
			const text = `${r.name} ${r.description ?? ""}`.toLowerCase();
			const lit = forms(c[0]).some((v) => hit(v, text));
			const l = label.get(`${row.idea}::${r.id}`) ?? 3;
			tally[lit ? "literal" : "synonymOnly"][l]++;
			if (!lit) console.log(`synonym only: ${row.idea} -> ${r.name.slice(0, 50)} (label ${l})`);
		}
	}
console.log("[0 words only, 1 related, 2 same idea, unlabelled]", JSON.stringify(tally));
