// For each one-word idea's full live ranking: how many matched builds carry the
// word (or a synonym) only in their track or award text (textShare 0), and
// which variant put each build in.
// Usage, from the worktree root: pnpm exec tsx tmp/text-only-check.mts tmp/live-one-word.json
import { readFileSync } from "node:fs";
import { expandBuildTerm } from "../src/lib/hackathon-builds";
import { concepts, type Row, textShareOf } from "./replay.mts";

const live = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const row of live.rows) {
	const [word] = concepts(row.idea);
	const variants = expandBuildTerm(word);
	const viaText = new Map<string, number>();
	const outside: string[] = [];
	for (const r of row.ranked as Row[]) {
		if (!r.matchedTerms.length) continue;
		if (textShareOf(row.idea, r) >= 1) {
			const text = `${r.name} ${r.description ?? ""}`.toLowerCase();
			const v = variants.find((x) => text.includes(x)) ?? "?";
			viaText.set(v, (viaText.get(v) ?? 0) + 1);
		} else
			outside.push(
				`${r.isWinner ? "W " : ""}${r.name.slice(0, 40)} {track: ${r.track ?? "-"}; award: ${r.award ?? "-"}}`,
			);
	}
	console.log(
		`${row.idea.padEnd(22)} matched=${row.matched} inText by variant=${JSON.stringify(Object.fromEntries(viaText))} onlyTrackOrAward=${outside.length}`,
	);
	for (const o of outside.slice(0, 6)) console.log(`    ${o}`);
}
