/**
 * Criteria (b), (c) and (d): every field of the replayed bodies that names a
 * winners-only event (replay.test.ts with REPLAY_BODIES), checked one by one.
 *
 *   pnpm exec tsx improvements/audits/2026-10-23-winners-only-coverage/sweep.mts <bodies-dir> <capture-dir>
 *
 * Prints one line per field checked and exits 1 on any failure.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type J = Record<string, unknown>;
const [dir, cap] = process.argv.slice(2);
const WINNERS: Record<string, number> = {
	"hackmeridian-2025": 6,
	"build-on-stellar-philippines-2026": 5,
	"apac-stellar-hackathon-2026": 1,
};
const listed = new Map(
	(
		JSON.parse(readFileSync(join(cap, "list.json"), "utf8")).hackathons as J[]
	).map((h) => [String(h.slug), h]),
);
const declaredHackers = (slug: string) =>
	(listed.get(slug)?.hackersCount as number | undefined) ?? null;

const lines: string[] = [];
let fails = 0;
const fieldsChecked = new Map<string, number>();
function check(route: string, field: string, ok: boolean, detail: string) {
	const key = `${route} ${field}`;
	fieldsChecked.set(key, (fieldsChecked.get(key) ?? 0) + 1);
	if (!ok) {
		fails++;
		lines.push(`FAIL ${key}: ${detail}`);
	}
}
const note = (n: number) =>
	`Only this event's winners are on record here (${
		n === 1
			? "1 row, with the page that names the win as url"
			: `${n} rows, with the page that names each win as url`
	}); its other submissions are not stored. The size and mix of its field are unknown, so totalSubmissions, each track's submissionCount and outcomes are null, never the winner count, and profile describes the winners only.`;
const warnsFor = (warnings: unknown, slug: string) =>
	Array.isArray(warnings) &&
	warnings.some(
		(w) =>
			typeof w === "string" &&
			w.startsWith("only the winners of ") &&
			w.includes(slug) &&
			w.includes("coverage winners-only"),
	);

for (const file of readdirSync(dir).sort()) {
	const body = JSON.parse(readFileSync(join(dir, file), "utf8")) as J;
	if (file.startsWith("compare_")) {
		const rows = body.hackathons as J[];
		const deltas = body.deltas as J;
		for (const r of rows) {
			const slug = String(r.slug);
			const n = WINNERS[slug];
			if (n === undefined) continue;
			const p = r.profile as J;
			check(
				"compare",
				"submissionCount",
				r.submissionCount === null,
				`${file} ${slug} ${r.submissionCount}`,
			);
			check(
				"compare",
				"winnerCount",
				r.winnerCount === n,
				`${file} ${slug} ${r.winnerCount}`,
			);
			check(
				"compare",
				"hackersCount",
				r.hackersCount === declaredHackers(slug),
				`${file} ${slug} ${r.hackersCount}`,
			);
			check(
				"compare",
				"coverage",
				r.coverage === "winners-only",
				`${file} ${slug}`,
			);
			check(
				"compare",
				"activeRatePct",
				!("activeRatePct" in r) || r.activeRatePct === null,
				`${file} ${slug} ${r.activeRatePct}`,
			);
			check(
				"compare",
				"profile.coverage",
				p?.coverage === "winners-only",
				`${file} ${slug}`,
			);
			check(
				"compare",
				"profile.submissions",
				p?.submissions === null,
				`${file} ${slug} ${p?.submissions}`,
			);
			check(
				"compare",
				"profile.winners",
				p?.winners === n,
				`${file} ${slug} ${p?.winners}`,
			);
			const sc = deltas.submissionCount as J | undefined;
			check(
				"compare",
				"deltas.submissionCount",
				!sc || (sc.highest !== slug && sc.lowest !== slug),
				`${file} ${slug}`,
			);
			const notes = deltas.notes as string[];
			check(
				"compare",
				"deltas.notes (submission count line)",
				!notes.some(
					(x) => x.startsWith("submission count:") && x.includes(slug),
				),
				`${file} ${slug}`,
			);
			check(
				"compare",
				"deltas.notes (winners-only line)",
				notes.some(
					(x) => x.includes(slug) && x.includes("coverage winners-only"),
				),
				`${file} ${slug}`,
			);
			check(
				"compare",
				"deltas.notes (not 'none stored')",
				!notes.some(
					(x) => x.includes("none of their submissions") && x.includes(slug),
				),
				`${file} ${slug}`,
			);
			const shifts = (deltas.facetShifts as J[] | undefined) ?? [];
			check(
				"compare",
				"deltas.facetShifts",
				!shifts.some((s) => (s.shares as J[]).some((x) => x.slug === slug)),
				`${file} ${slug}`,
			);
		}
		if (file === "compare_slugs=hackmeridian-2026,hackmeridian-2025.json") {
			const y2025 = rows.find((r) => r.slug === "hackmeridian-2025") as J;
			const v = y2025.submissionCount;
			check(
				"benchmark (c)",
				"2025 submissionCount null or >= 100",
				v === null || (typeof v === "number" && v >= 100),
				`${v}`,
			);
			lines.push(
				`benchmark (c): hackmeridian-2025 submissionCount = ${JSON.stringify(v)}`,
			);
		}
	} else if (file.startsWith("event_")) {
		const slug = file.slice(6, -5);
		const n = WINNERS[slug];
		if (n === undefined) continue;
		const h = body.hackathon as J;
		const s = h.stats as J;
		const p = h.profile as J;
		check(
			"getHackathon",
			"hackathon.coverage",
			h.coverage === "winners-only",
			slug,
		);
		check(
			"getHackathon",
			"hackathon.hackersCount",
			h.hackersCount === declaredHackers(slug),
			`${slug} ${h.hackersCount}`,
		);
		check(
			"getHackathon",
			"stats.totalSubmissions",
			s.totalSubmissions === null,
			`${slug} ${s.totalSubmissions}`,
		);
		check(
			"getHackathon",
			"stats.upstreamSubmissions",
			s.upstreamSubmissions === null,
			`${slug} ${s.upstreamSubmissions}`,
		);
		check(
			"getHackathon",
			"stats.outcomes",
			s.outcomes === null,
			`${slug} ${JSON.stringify(s.outcomes)}`,
		);
		check(
			"getHackathon",
			"stats.winners",
			s.winners === n,
			`${slug} ${s.winners}`,
		);
		check(
			"getHackathon",
			"stats.coverageNote",
			s.coverageNote === note(n),
			`${slug} ${s.coverageNote}`,
		);
		check(
			"getHackathon",
			"profile.coverage",
			p.coverage === "winners-only",
			slug,
		);
		check(
			"getHackathon",
			"profile.submissions",
			p.submissions === null,
			`${slug} ${p.submissions}`,
		);
		check(
			"getHackathon",
			"profile.winners",
			p.winners === n,
			`${slug} ${p.winners}`,
		);
		for (const [where, tracks] of [
			["hackathon.tracks", h.tracks],
			["tracks", body.tracks],
		] as const) {
			const t = tracks as J[];
			check(
				"getHackathon",
				`${where}[].submissionCount`,
				t.every((x) => x.submissionCount === null),
				`${slug} ${JSON.stringify(t)}`,
			);
			check(
				"getHackathon",
				`${where}[].winnerCount`,
				t.reduce((a, x) => a + Number(x.winnerCount), 0) ===
					(slug === "build-on-stellar-philippines-2026" ? 0 : n),
				`${slug} ${JSON.stringify(t)}`,
			);
		}
		check(
			"getHackathon",
			"winners[] (listed)",
			(body.winners as J[]).length === n,
			slug,
		);
		check(
			"getHackathon",
			"meta.note",
			String((body.meta as J).note).startsWith(
				"Event off DoraHacks with only its winners on record",
			),
			slug,
		);
	} else if (
		file.startsWith("analyze_hackathon=") ||
		file.startsWith("builds_hackathon=")
	) {
		const slug = file
			.replace(/^(analyze|builds)_hackathon=/, "")
			.replace(/&.*|\.json$/g, "");
		const route = file.startsWith("analyze")
			? "analyze (hackathon filter)"
			: "builds (hackathon filter)";
		check(
			route,
			"meta.warnings (winners-only line)",
			warnsFor((body.meta as J).warnings, slug),
			file,
		);
	} else if (file === "analyze_facet=category&by=event.json") {
		for (const g of body.groups as J[]) {
			const n = WINNERS[String(g.value)];
			check(
				"analyze by=event",
				"groups[].coverage",
				n === undefined ? !("coverage" in g) : g.coverage === "winners-only",
				`${g.value}`,
			);
		}
		for (const slug of Object.keys(WINNERS))
			check(
				"analyze by=event",
				"meta.warnings (winners-only line)",
				warnsFor((body.meta as J).warnings, slug),
				slug,
			);
	} else if (file === "analyze_facet=event&top=30.json") {
		for (const slug of Object.keys(WINNERS))
			check(
				"analyze facet=event",
				"meta.warnings (winners-only line)",
				warnsFor((body.meta as J).warnings, slug),
				slug,
			);
	}
}
for (const [k, n] of fieldsChecked) lines.push(`checked ${k}: ${n}`);
console.log(lines.join("\n"));
console.log(
	fails
		? `FAIL: ${fails}`
		: `PASS: ${[...fieldsChecked.values()].reduce((a, b) => a + b, 0)} checks`,
);
process.exitCode = fails ? 1 : 0;
