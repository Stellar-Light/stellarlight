// From the raw capture to the window file: per idea, the rows of the live
// hybrid ranking a rule reads (the top 20, plus every winner covering half
// the idea's words, which the brief's winner slots read from anywhere), with
// the live meaning score and matched words and the textShare and share this
// tree's scorer computes over the stored corpus. Upstream descriptions are
// not copied. Checks parity on the way:
//   the scorer's matched words, replayed, equal live matchedTerms;
//   this tree's priorArtTop over the live top five equals live vetIdea
//   priorArt.builds id for id, and its pickBriefBuilds over the live ranking
//   equals live hackathonBrief builds; lib.mts's "current" rule equals both.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-22-words-need-meaning/derive.mts <live-fresh.json> <windows-fresh.json>
import { pickBriefBuilds } from "../../../src/lib/hackathon-brief";
import {
	type ScoredBuild,
	searchHackathonBuilds,
} from "../../../src/lib/hackathon-builds";
import { priorArtTop } from "../../../src/lib/prior-art-rank";
import {
	briefPick,
	indexed,
	type Row,
	RULES,
	readJson,
	vetPick,
	writeJson,
} from "./lib.mts";

const [, , livePath, outPath] = process.argv;
const live = readJson(livePath);
const corpus = live.corpus as Row[];
const byId = new Map(corpus.map((r) => [r.id, r]));
const pool = corpus.map(indexed);
const DEPTH = 20;
// The meaning search reads 300 vector rows (MEANING_NEIGHBOURS) and keeps a
// submission entered in several events once, so a capped read can hold fewer
// than 300 submissions. A read near that size whose lowest score sits above
// the 0.68 floor stopped at the cap, not at the floor: a build with no score
// there may still be close in meaning.
const NEAR_CAP = 270;

const ids = (xs: { id: string }[] | { b: { id: string } }[]) =>
	xs.map((x) => ("b" in x ? x.b.id : x.id));
const same = (a: string[] | null, b: string[] | null) =>
	JSON.stringify(a) === JSON.stringify(b);

let vetFail = 0;
let briefFail = 0;
let libFail = 0;
let wordFail = 0;
let wordRows = 0;
const ideas = live.rows.map(
	(row: {
		id: string;
		idea: string;
		length: string;
		ranked: Row[];
		buildsMeta: { counts: { matched: number }; mode: { served: string } };
		meaningNeighbours: number | null;
		meaningServed: string | null;
		priorArt: { builds: { id: string }[] | null; buildsMode: string } | null;
		briefBuilds: string[] | null;
		briefVetBuilds: string[] | null;
	}) => {
		const kw = new Map(
			searchHackathonBuilds(pool, row.idea.toLowerCase().trim(), {
				mode: "keyword",
			}).map((s) => [s.b.id, s]),
		);
		const scored: ScoredBuild[] = row.ranked.map((r) => {
			const k = kw.get(r.id);
			if (r.matchedTerms.length) {
				wordRows++;
				if (
					JSON.stringify([...(k?.matched ?? [])].sort()) !==
					JSON.stringify([...r.matchedTerms].sort())
				)
					wordFail++;
			}
			return {
				b: indexed({ ...(byId.get(r.id) ?? r), isWinner: r.isWinner }),
				score: k?.score ?? 0,
				matched: r.matchedTerms,
				coverage: k?.coverage ?? 0,
				share: r.matchedTerms.length ? (k?.share ?? 0) : 0,
				...(r.matchedTerms.length ? { textShare: k?.textShare ?? 0 } : {}),
				...(r.similarity !== undefined ? { similarity: r.similarity } : {}),
			};
		});
		const meaningRan = row.priorArt?.buildsMode !== "keyword";
		const liveVet = row.priorArt?.builds?.map((b) => b.id) ?? null;
		const vet = ids(priorArtTop(scored.slice(0, 5)));
		const brief = ids(pickBriefBuilds(scored));
		const w = scored.map((s, i) => ({
			rank: i + 1,
			id: s.b.id,
			name: s.b.name,
			isWinner: s.b.isWinner,
			...(s.similarity !== undefined ? { similarity: s.similarity } : {}),
			matched: s.matched,
			...(s.textShare !== undefined ? { textShare: s.textShare } : {}),
			share: s.share,
		}));
		if (!same(vet, liveVet)) {
			vetFail++;
			console.log(
				`vetIdea parity fail ${row.id}: replay ${vet} live ${liveVet}`,
			);
		}
		if (!same(brief, row.briefBuilds)) {
			briefFail++;
			console.log(
				`brief parity fail ${row.id}: replay ${brief} live ${row.briefBuilds}`,
			);
		}
		if (
			!same(ids(vetPick(w, RULES.current, meaningRan)), vet) ||
			!same(ids(briefPick(w, RULES.current, meaningRan)), brief)
		)
			libFail++;
		const scores = w.flatMap((x) =>
			x.similarity !== undefined ? [x.similarity] : [],
		);
		const withMeaning = scores.length;
		const lowest = scores.length ? Math.min(...scores) : null;
		const complete = row.ranked.length >= row.buildsMeta.counts.matched;
		return {
			id: row.id,
			idea: row.idea,
			length: row.length,
			buildsMode: row.priorArt?.buildsMode ?? null,
			rankedServed: row.buildsMeta.mode.served,
			rankedMatched: row.buildsMeta.counts.matched,
			rankedCaptured: row.ranked.length,
			rowsWithMeaningScore: withMeaning,
			rowsWithMeaningScoreComplete: complete,
			meaningNeighbours: row.meaningNeighbours,
			lowestMeaningScore: lowest,
			meaningCap:
				Math.max(withMeaning, row.meaningNeighbours ?? 0) < NEAR_CAP
					? null
					: (lowest ?? 0) > 0.685
						? "at cap"
						: "near cap",
			liveVetBuilds: liveVet,
			liveBriefBuilds: row.briefBuilds,
			liveBriefVetBuilds: row.briefVetBuilds,
			window: w.filter(
				(x) => x.rank <= DEPTH || (x.isWinner && x.share >= 0.5),
			),
		};
	},
);
writeJson(outPath, {
	about:
		"Per fresh idea, the rows of the live hybrid ranking the rules read (top 20, plus every winner whose share is at least 0.5), derived by derive.mts from a capture of https://www.stellarlight.xyz. similarity and matched are live; textShare and share are this tree's scorer over the stored corpus. No upstream descriptions.",
	apiVersionStart: live.apiVersionStart,
	apiVersionEnd: live.apiVersionEnd,
	capturedFrom: live.startedAt,
	capturedTo: live.endedAt,
	corpus: corpus.length,
	ideas,
});
console.log(
	`${ideas.length} ideas (api ${live.apiVersionStart} -> ${live.apiVersionEnd}, corpus ${corpus.length}): vetIdea parity failures ${vetFail}; brief parity failures ${briefFail}; lib current-rule mismatches ${libFail}; rows whose replayed matched words differ from live ${wordFail} of ${wordRows}`,
);
for (const i of ideas)
	console.log(
		`${i.id} mode ${i.buildsMode}/${i.rankedServed} ranked ${i.rankedCaptured}/${i.rankedMatched} rowsWithMeaning ${i.rowsWithMeaningScore}${i.rowsWithMeaningScoreComplete ? "" : "+"} meaningNeighbours ${i.meaningNeighbours} lowest ${i.lowestMeaningScore}${i.meaningCap ? ` ${i.meaningCap.toUpperCase()}` : ""} briefVet=vet ${same(i.liveBriefVetBuilds, i.liveVetBuilds)}`,
	);
