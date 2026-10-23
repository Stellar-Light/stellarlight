// The adversarial probe table: per probe of probes.json, the words this
// tree's search reads in no submission (wordsNoBuildUses), the builds listed
// before and after in keyword and hybrid mode (two replay.mts outputs over
// the probe capture), every build removed or added by name, and whether the
// builds route's line about unused words fires after (unusedWordsWarning;
// its text is in note.mts's output for the same capture).
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-nonsense-queries/probes.mts <probes-live.json> <before.json> <after.json>
import { readFileSync } from "node:fs";
import {
	indexedFromStored,
	searchHackathonBuilds,
	unusedWordsWarning,
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
type Named = { id: string; name: string };
type Extra = { q: string; keyword: Named[]; hybrid: Named[] };

const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const [, , livePath, beforePath, afterPath] = process.argv;
const live = read(livePath);
const before = read(beforePath).extra as Extra[];
const after = read(afterPath).extra as Extra[];
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
const nm = (s: string) => s.replace(/[\u2013\u2014]/g, "-").slice(0, 50);

console.log(
	`capture: api ${live.apiVersionStart} -> ${live.apiVersionEnd}, corpus ${pool.length}`,
);
console.log(
	"id | group | q | words read | in no submission | keyword before -> after | hybrid before -> after | warning fires, keyword / hybrid",
);
const changes: string[] = [];
live.extra.forEach(
	(
		x: {
			id: string;
			group: string;
			q: string;
			hybrid: { rows: Row[] };
		},
		i: number,
	) => {
		const semantic = new Map(
			x.hybrid.rows
				.filter((r) => r.similarity !== undefined)
				.map((r) => [r.id, r.similarity as number]),
		);
		const opts = { perSubmission: true, packages: true };
		const { absent, concepts } = wordsNoBuildUses(pool, x.q);
		const q = x.q.trim().toLowerCase();
		const fires = (["keyword", "hybrid"] as const).map(
			(mode) =>
				unusedWordsWarning(
					pool,
					q,
					searchHackathonBuilds(pool, q, { ...opts, mode, semantic }),
				) !== null,
		);
		const b = before[i];
		const a = after[i];
		console.log(
			`${x.id} | ${x.group} | ${x.q} | ${concepts} | ${absent.join(", ") || "none"} | ${b.keyword.length} -> ${a.keyword.length} | ${b.hybrid.length} -> ${a.hybrid.length} | ${fires.map((f) => (f ? "yes" : "no")).join(" / ")}`,
		);
		for (const mode of ["keyword", "hybrid"] as const) {
			const was = new Set(b[mode].map((r) => r.id));
			const now = new Set(a[mode].map((r) => r.id));
			const removed = b[mode].filter((r) => !now.has(r.id));
			const added = a[mode].filter((r) => !was.has(r.id));
			if (removed.length || added.length)
				changes.push(
					`${x.id} ${mode}: removed ${removed.map((r) => nm(r.name)).join("; ") || "none"}; added ${added.map((r) => nm(r.name)).join("; ") || "none"}`,
				);
		}
	},
);
console.log();
console.log("Builds removed or added:");
console.log(changes.length ? changes.join("\n") : "none");
