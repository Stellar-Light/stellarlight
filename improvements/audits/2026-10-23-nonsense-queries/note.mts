// Where the builds route's meta.warnings line about unused words fires, and
// its exact text, replayed over a capture (capture.mjs here, or
// ../2026-10-23-build-matching/capture.mjs): per query and mode, the rows
// the route lists and the line unusedWordsWarning gives for them, as the
// route calls it. The pool is built as
// ../2026-10-23-build-matching/replay.mts builds it.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-nonsense-queries/note.mts <capture.json>
import { readFileSync } from "node:fs";
import {
	indexedFromStored,
	searchHackathonBuilds,
	unusedWordsWarning,
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
console.log("group | q | mode | rows | line (none = no line)");
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
	const q = x.q.trim().toLowerCase();
	const opts = { perSubmission: true, packages: true };
	const rows = [
		searchHackathonBuilds(pool, q, { ...opts, mode: "keyword" }),
		searchHackathonBuilds(pool, q, { ...opts, mode: "hybrid", semantic }),
	];
	const lines = rows.map((r) => unusedWordsWarning(pool, q, r));
	const g = x.group.startsWith("idea") ? "idea (all 140)" : x.group;
	const t = tally.get(g) ?? { n: 0, withRows: [0, 0], fires: [0, 0] };
	t.n++;
	rows.forEach((r, i) => {
		t.withRows[i] += r.length > 0 ? 1 : 0;
		t.fires[i] += lines[i] ? 1 : 0;
	});
	tally.set(g, t);
	// Every battery query; an idea only where the line fires.
	(["keyword", "hybrid"] as const).forEach((mode, i) => {
		if (!x.group.startsWith("idea") || lines[i])
			console.log(
				`${x.group} | ${x.q} | ${mode} | ${rows[i].length} | ${lines[i] ?? "none"}`,
			);
	});
}
console.log();
console.log(
	"group | queries | with rows, keyword / hybrid | line fires, keyword / hybrid",
);
for (const [g, t] of tally)
	console.log(
		`${g} | ${t.n} | ${t.withRows[0]} / ${t.withRows[1]} | ${t.fires[0]} / ${t.fires[1]}`,
	);
