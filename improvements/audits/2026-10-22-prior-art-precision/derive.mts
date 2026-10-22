// From the raw captures to window files: for each idea, its top 20 by the
// live hybrid ranking with every field an evidence rule reads, computed by
// this tree's code over the full stored corpus (1,344 submissions read in
// browse mode), plus the live vetIdea builds and the label of each row.
// Upstream descriptions are not copied: the window files carry what the
// rules read, not the text. Checks parity on the way:
//   the scorer's matched words, replayed over the corpus, equal the live
//   matchedTerms for every window row; and the evidence rule each capture
//   ran, replayed, equals live vetIdea priorArt.builds id for id.
// Usage: pnpm exec tsx tmp/derive.mts <live-40.json> <labels.json> <earlier dir> <out dir>
import { searchHackathonBuilds } from "../src/lib/hackathon-builds";
import { isPriorArtEvidence, PRIOR_ART_TOP } from "../src/lib/prior-art-rank";
import {
	indexed,
	type Row,
	readJson,
	termDetail,
	type WordHit,
	writeJson,
} from "./lib.mts";

const [, , livePath, labelsPath, earlierDir, outDir] = process.argv;
const live = readJson(livePath);
const corpus = live.corpus as Row[];
const byId = new Map(corpus.map((r) => [r.id, r]));
const pool = corpus.map(indexed);
const DEPTH = 20;

export type WindowRow = {
	rank: number;
	id: string;
	name: string;
	isWinner: boolean;
	similarity?: number;
	matched: string[];
	textShare?: number;
	words: WordHit[];
	grade: number | null;
};

function windowOf(
	idea: string,
	ranked: Row[],
	grade: (id: string) => number | null,
) {
	const det = termDetail(idea, pool);
	// The window rows as the corpus holds them (award text included), with
	// the live matched words and meaning score.
	const rows = ranked.slice(0, DEPTH).map((r) => ({
		...(byId.get(r.id) ?? r),
		matchedTerms: r.matchedTerms,
		similarity: r.similarity,
	}));
	const kw = new Map(
		searchHackathonBuilds(pool, idea, { mode: "keyword" }).map((s) => [
			s.b.id,
			s,
		]),
	);
	let matchMismatch = 0;
	let notInCorpus = 0;
	const window: WindowRow[] = rows.map((r, i) => {
		if (!byId.has(r.id)) notInCorpus++;
		const k = kw.get(r.id);
		const words = r.matchedTerms.length > 0;
		if (
			words &&
			JSON.stringify([...(k?.matched ?? [])].sort()) !==
				JSON.stringify([...r.matchedTerms].sort())
		)
			matchMismatch++;
		return {
			rank: i + 1,
			id: r.id,
			name: r.name,
			isWinner: r.isWinner,
			...(r.similarity !== undefined ? { similarity: r.similarity } : {}),
			matched: r.matchedTerms,
			// The scorer sets textShare on word matches only; a build found by
			// meaning alone has none.
			...(words ? { textShare: k?.textShare ?? 0 } : {}),
			words: words ? det.per(indexed(r)) : [],
			grade: grade(r.id),
		};
	});
	return {
		words: det.tokens.map((t) => ({
			t,
			df: det.df.get(t),
			w: det.weight.get(t),
		})),
		totalWeight: det.total,
		corpus: det.n,
		window,
		matchMismatch,
		notInCorpus,
	};
}

const ids = (w: WindowRow[]) => w.map((x) => x.id);
const top = (w: WindowRow[]) => w.slice(0, PRIOR_ART_TOP);

// The 40 labeled ideas, captured on 1.9.91: parity with the rule it runs.
const labels = readJson(labelsPath).labels as {
	ideaId: string;
	buildId: string;
	grade: number;
}[];
const grade40 = new Map(
	labels.map((l) => [`${l.ideaId}::${l.buildId}`, l.grade]),
);
let parity40 = 0;
let mismatch40 = 0;
const out40 = live.rows.map(
	(row: {
		id: string;
		idea: string;
		slice: string;
		ranked: Row[];
		priorArt: { builds: { id: string }[]; buildsMode: string } | null;
		briefBuilds: string[] | null;
	}) => {
		const w = windowOf(
			row.idea,
			row.ranked,
			(id) => grade40.get(`${row.id}::${id}`) ?? null,
		);
		mismatch40 += w.matchMismatch;
		const liveVet = row.priorArt?.builds?.map((b) => b.id) ?? null;
		const replay = ids(top(w.window).filter(isPriorArtEvidence));
		if (JSON.stringify(replay) !== JSON.stringify(liveVet)) {
			parity40++;
			console.log(`parity fail ${row.id}: replay ${replay} live ${liveVet}`);
		}
		const { matchMismatch, notInCorpus, ...rest } = w;
		void matchMismatch;
		void notInCorpus;
		return {
			id: row.id,
			idea: row.idea,
			slice: row.slice,
			buildsMode: row.priorArt?.buildsMode ?? null,
			liveVetBuilds: liveVet,
			liveBriefBuilds: row.briefBuilds,
			...rest,
		};
	},
);
writeJson(`${outDir}/windows-40.json`, {
	about:
		"Top 20 of the live hybrid ranking per idea, with the fields the evidence rules read; derived by derive.mts from a capture of https://www.stellarlight.xyz. grade: draft labels (2 same idea, 1 related, 0 words only, null unlabeled).",
	apiVersionStart: live.apiVersionStart,
	apiVersionEnd: live.apiVersionEnd,
	capturedFrom: live.startedAt,
	capturedTo: live.endedAt,
	corpus: corpus.length,
	ideas: out40,
});
console.log(
	`40 ideas (api ${live.apiVersionStart} -> ${live.apiVersionEnd}): vetIdea parity failures ${parity40}; window rows whose replayed matched words differ from live ${mismatch40}`,
);

// The earlier sets, captured on 1.9.87, graded with their blind labels.
const key = readJson(`${earlierDir}/label-key.json`) as {
	n: number;
	idea: string;
	id: string;
}[];
const gradeOf = new Map<number, number>(
	readJson(`${earlierDir}/labels.json`).map(
		(l: { n: number; label: number }) => [l.n, l.label],
	),
);
const gradeEarlier = new Map(
	key.map((k) => [`${k.idea}::${k.id}`, gradeOf.get(k.n) ?? null]),
);
for (const [file, out] of [
	["live-short.json", "windows-short.json"],
	["live-tests.json", "windows-tests.json"],
]) {
	const cap = readJson(`${earlierDir}/${file}`);
	let parity = 0;
	let mismatch = 0;
	let missing = 0;
	const ideas = cap.rows.map(
		(row: {
			idea: string;
			slice?: string;
			ranked: Row[];
			priorArt: { builds: { id: string }[] } | null;
		}) => {
			const w = windowOf(
				row.idea,
				row.ranked,
				(id) => gradeEarlier.get(`${row.idea}::${id}`) ?? null,
			);
			mismatch += w.matchMismatch;
			missing += w.notInCorpus;
			const liveVet = row.priorArt?.builds?.map((b) => b.id) ?? null;
			// 1.9.87 ran the rule without its own-text path.
			const replay = ids(
				top(w.window).filter(
					(x) => (x.similarity ?? 0) >= 0.7 || x.matched.length >= 2,
				),
			);
			if (JSON.stringify(replay) !== JSON.stringify(liveVet)) parity++;
			const { matchMismatch, notInCorpus, ...rest } = w;
			void matchMismatch;
			void notInCorpus;
			return {
				id: row.idea,
				idea: row.idea,
				slice: row.slice ?? "tests",
				liveVetBuilds: liveVet,
				...rest,
			};
		},
	);
	writeJson(`${outDir}/${out}`, {
		about: `Derived by derive.mts from improvements/audits/2026-10-22-short-idea-prior-art/${file} (top ${cap.rows[0]?.ranked.length ?? 10} captured on ${cap.apiVersionStart}); word weights over the corpus captured with the 40-idea run. grade: the blind labels in that directory.`,
		apiVersionStart: cap.apiVersionStart,
		apiVersionEnd: cap.apiVersionEnd,
		corpus: corpus.length,
		ideas,
	});
	console.log(
		`${file} (api ${cap.apiVersionStart} -> ${cap.apiVersionEnd}): ${ideas.length} ideas; 1.9.87 vetIdea parity failures ${parity}; window rows whose replayed matched words differ from the capture ${mismatch}; window rows not in today's corpus ${missing}`,
	);
}
