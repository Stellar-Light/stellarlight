// hackathonBrief's builds for one-word ideas, replayed over each idea's full
// live ranking (tmp/live-one-word.json):
//   before    = the 1.9.87 rule, checked id for id against the live brief;
//   guardOnly = winner slots on isPriorArtEvidence with the item 1 guard (no item 4 fix);
//   now       = this tree's pickBriefBuilds (winner slots on twoWordsOrMeaning).
// Usage, from the worktree root: pnpm exec tsx tmp/brief-replay.mts tmp/live-one-word.json
import { readFileSync } from "node:fs";
import { pickBriefBuilds } from "../src/lib/hackathon-brief";
import type { ScoredBuild } from "../src/lib/hackathon-builds";
import { isPriorArtEvidence, priorArtTop } from "../src/lib/prior-art-rank";
import { oldRule, type Row, scoredRows } from "./replay.mts";

const live = JSON.parse(readFileSync(process.argv[2], "utf8"));
type S = ReturnType<typeof scoredRows>[number];
function pick(scored: S[], winnerRule: (s: S) => boolean, topRule: (s: S) => boolean) {
	const winners = scored
		.filter((s) => s.isWinner && s.share >= 0.5 && winnerRule(s))
		.slice(0, 2);
	const seen = new Set(winners.map((s) => s.id));
	return [
		...winners,
		...scored
			.slice(0, 5)
			.filter(topRule)
			.filter((s) => !seen.has(s.id)),
	].slice(0, 5);
}
let parityFail = 0;
const totals: Record<string, number> = {};
const bump = (k: string, n: number) => {
	totals[k] = (totals[k] ?? 0) + n;
};
for (const row of live.rows) {
	const scored = scoredRows(row.idea, row.ranked as Row[]);
	const top5 = new Set(scored.slice(0, 5).map((s) => s.id));
	const before = pick(scored, oldRule, oldRule);
	const guardOnly = pick(scored, isPriorArtEvidence, isPriorArtEvidence);
	const now = pickBriefBuilds(scored as unknown as ScoredBuild[]) as unknown as S[];
	if (JSON.stringify(before.map((s) => s.id)) !== JSON.stringify(row.briefBuilds))
		parityFail++;
	// Sanity: the now list keeps vetIdea's top-five evidence.
	const vet = priorArtTop(scored.slice(0, 5));
	const missingVet = vet.filter((s) => !now.some((x) => x.id === s.id)).length;
	const qualifies = (rule: (s: S) => boolean) =>
		scored.filter((s) => s.isWinner && s.share >= 0.5 && rule(s));
	const beyond = (list: S[]) => list.filter((s) => s.isWinner && !top5.has(s.id));
	bump("listedBefore", before.length);
	bump("listedGuardOnly", guardOnly.length);
	bump("listedNow", now.length);
	bump("winnersQualifyingBefore", qualifies(oldRule).length);
	bump("winnersQualifyingGuardOnly", qualifies(isPriorArtEvidence).length);
	bump("winnersQualifyingNow", qualifies((s) => oldRule(s)).length);
	bump("winnersPulledFromBeyondTop5Before", beyond(before).length);
	bump("winnersPulledFromBeyondTop5GuardOnly", beyond(guardOnly).length);
	bump("winnersPulledFromBeyondTop5Now", beyond(now).length);
	bump("vetBuildsMissingFromBriefNow", missingVet);
	const sameOrder =
		JSON.stringify(guardOnly.map((s) => s.id)) ===
		JSON.stringify(now.map((s) => s.id));
	console.log(
		`${row.idea.padEnd(22)} listed before=${before.length} guardOnly=${guardOnly.length} now=${now.length}; winners qualifying before=${qualifies(oldRule).length} guardOnly=${qualifies(isPriorArtEvidence).length} now=${qualifies(oldRule).length}; guardOnly and now list ${sameOrder ? "the same builds in the same order" : "DIFFERENT builds"}`,
	);
	for (const s of qualifies(isPriorArtEvidence).filter((x) => !oldRule(x)))
		console.log(
			`    qualifies only by mention: ${top5.has(s.id) ? "in top five" : "BEYOND top five"} ${s.name.slice(0, 50)}`,
		);
}
console.log(
	`api ${live.apiVersionStart} -> ${live.apiVersionEnd}; parity failures (before != live brief): ${parityFail}`,
);
console.log(JSON.stringify(totals));
