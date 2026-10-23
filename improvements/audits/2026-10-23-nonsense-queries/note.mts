// Where the builds route's new meta.warnings line fires, replayed over a
// capture (capture.mjs here, or ../2026-10-23-build-matching/capture.mjs):
// per query, the concepts this tree's search reads, those no stored
// submission uses as a whole word (wordsNoBuildUses), the rows the route
// lists in keyword and hybrid mode, and whether the line fires, as the route
// decides: a row listed by its words alone (matchedTerms, no similarity) and
// more than half the concepts in no submission. The pool is built as
// ../2026-10-23-build-matching/replay.mts builds it.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-nonsense-queries/note.mts <capture.json>
import { readFileSync } from "node:fs";
import {
	indexedFromStored,
	searchHackathonBuilds,
	wordsNoBuildUses,
} from "../../../src/lib/hackathon-builds";
import type { HackathonBuild } from "../../../src/payload-types";

type Row = {
	id: string;
	name: string;
	description: string | null;
	track: string | null;
	award: string | null;
	hackathon: string;
	hackathonSlug: string;
	endedAt: string | null;
	placement: string | null;
	isWinner: boolean;
	votes: number | null;
	stack?: string[];
	similarity?: number;
};
type Query = {
	q: string;
	group: string;
	hybrid: { rows: Row[] };
};

const live = JSON.parse(readFileSync(process.argv[2], "utf8"));
const AT = "2026-10-23T00:00:00.000Z";
const pool = (live.corpus as Row[]).map((r) => ({
	...indexedFromStored({
		id: r.id,
		buildId: r.id,
		name: r.name,
		vision: r.description,
		track: r.track,
		award: r.award,
		placement: r.placement,
		isWinner: r.isWinner,
		hackathonSlug: r.hackathonSlug,
		hackathonTitle: r.hackathon,
		endedAt: r.endedAt,
		url: "",
		firstSeenAt: AT,
		lastSeenAt: AT,
		updatedAt: AT,
		createdAt: AT,
		...(r.stack ? { stack: r.stack, stackReadAt: AT } : {}),
	} as unknown as HackathonBuild),
	voteCount: r.votes,
}));

const queries: Query[] = [
	...live.ideas.map(
		(i: { set: string; idea: string; hybrid: Query["hybrid"] }) => ({
			q: i.idea,
			group: `idea ${i.set}`,
			hybrid: i.hybrid,
		}),
	),
	...live.extra.map(
		(x: {
			kind: string;
			group?: string;
			q: string;
			hybrid: Query["hybrid"];
		}) => ({
			q: x.q,
			group: x.group ? `${x.kind} ${x.group}` : x.kind,
			hybrid: x.hybrid,
		}),
	),
];
console.log(
	`capture: api ${live.apiVersionStart} -> ${live.apiVersionEnd}, corpus ${pool.length}`,
);
console.log(
	"group | q | concepts | in no submission | keyword rows | hybrid rows | fires keyword | fires hybrid",
);
const tally = new Map<
	string,
	{ n: number; withRows: [number, number]; fires: [number, number] }
>();
for (const x of queries) {
	const semantic = new Map(
		x.hybrid.rows
			.filter((r) => r.similarity !== undefined)
			.map((r) => [r.id, r.similarity as number]),
	);
	const opts = { perSubmission: true, packages: true };
	const kwRows = searchHackathonBuilds(pool, x.q, { ...opts, mode: "keyword" });
	const hyRows = searchHackathonBuilds(pool, x.q, {
		...opts,
		mode: "hybrid",
		semantic,
	});
	const kw = kwRows.length;
	const hy = hyRows.length;
	const { absent, concepts } = wordsNoBuildUses(pool, x.q);
	const most = absent.length * 2 > concepts;
	const wordsAlone = (rows: typeof kwRows) =>
		rows.some((s) => s.matched.length && s.similarity === undefined);
	const fires = [
		most && wordsAlone(kwRows),
		most && wordsAlone(hyRows),
	] as const;
	const g = x.group.startsWith("idea") ? "idea (all 140)" : x.group;
	const t = tally.get(g) ?? { n: 0, withRows: [0, 0], fires: [0, 0] };
	t.n++;
	t.withRows[0] += kw > 0 ? 1 : 0;
	t.withRows[1] += hy > 0 ? 1 : 0;
	t.fires[0] += fires[0] ? 1 : 0;
	t.fires[1] += fires[1] ? 1 : 0;
	tally.set(g, t);
	// Every battery query; an idea only where the line fires.
	if (!x.group.startsWith("idea") || fires[0] || fires[1])
		console.log(
			`${x.group} | ${x.q} | ${concepts} | ${absent.join(", ") || "none"} | ${kw} | ${hy} | ${fires[0] ? "yes" : "no"} | ${fires[1] ? "yes" : "no"}`,
		);
}
console.log();
console.log(
	"group | queries | with rows, keyword / hybrid | line fires, keyword / hybrid",
);
for (const [g, t] of tally)
	console.log(
		`${g} | ${t.n} | ${t.withRows[0]} / ${t.withRows[1]} | ${t.fires[0]} / ${t.fires[1]}`,
	);
