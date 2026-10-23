/**
 * Criteria (b) to (g): every field of the replayed bodies that names a
 * winners-only or unstored curated event, or counts across every event
 * (replay.test.ts with REPLAY_BODIES), checked one by one.
 *
 *   pnpm exec tsx improvements/audits/2026-10-23-winners-only-coverage/sweep.mts <bodies-dir> <capture-dir>
 *
 * Prints the failures and a count per field checked; exits 1 on any failure.
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
const curated = [...listed.values()]
	.filter((h) => h.source === "curated")
	.map((h) => String(h.slug));
// Curated events whose record declares tracks, and how many.
const DECLARED: Record<string, number> = {
	"hackmeridian-2026": 4,
	"stellar-journey-to-mastery-2026": 2,
};

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
	}); its other submissions are not stored. The size and mix of its field are unknown, so totalSubmissions, each track's submissionCount and outcomes are null, never the winner count, and profile counts the winners only, with every share null.`;
const TIERS_NOTE =
	"prizeTiers is null: this event's record is a summary kept off DoraHacks, not the organizer's page, and it itemizes no prize by place, so whether the organizer did is not known here.";
const NO_ROSTER_NOTE =
	"tracks is null: no submission roster is held for this event and no record of it declares tracks, so its tracks are not known here, not none.";
const WINNERS_NO_TRACK_NOTE =
	"tracks is null: only its winners are stored and none of them names a track, and no record of it declares tracks, so its tracks are not known here, not none.";
const strings = (v: unknown) =>
	Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
const warnsFor = (warnings: unknown, slug: string) =>
	strings(warnings).some(
		(w) =>
			w.startsWith("only the winners of ") &&
			w.includes(slug) &&
			w.includes("coverage winners-only"),
	);
const leftOutLine = (warnings: unknown) =>
	strings(warnings).find((w) => w.startsWith("left out of every count"));
/** Every share in a profile, a distribution or a list of groups. */
const shares = (v: unknown): unknown[] => {
	if (Array.isArray(v)) return v.flatMap(shares);
	if (!v || typeof v !== "object") return [];
	const o = v as J;
	return [
		...("share" in o ? [o.share] : []),
		...Object.entries(o)
			.filter(([k]) => k !== "share")
			.flatMap(([, x]) => shares(x)),
	];
};
const slugsIn = (v: unknown): string[] => {
	if (Array.isArray(v)) return v.flatMap(slugsIn);
	if (!v || typeof v !== "object") return [];
	return Object.values(v as J).flatMap((x) =>
		typeof x === "string" ? [x] : slugsIn(x),
	);
};

for (const file of readdirSync(dir).sort()) {
	const body = JSON.parse(readFileSync(join(dir, file), "utf8")) as J;
	const meta = (body.meta ?? {}) as J;
	if (file.startsWith("compare_")) {
		const rows = body.hackathons as J[];
		const deltas = body.deltas as J;
		const notes = strings(deltas.notes);
		for (const r of rows) {
			const slug = String(r.slug);
			const n = WINNERS[slug];
			if (n === undefined) {
				check(
					"compare",
					"full or unstored row: no notes",
					!("notes" in r),
					`${file} ${slug}`,
				);
				continue;
			}
			const p = r.profile as J;
			const pre = `${file} ${slug}`;
			check(
				"compare",
				"submissionCount",
				r.submissionCount === null,
				`${pre} ${r.submissionCount}`,
			);
			check(
				"compare",
				"winnerCount",
				r.winnerCount === n,
				`${pre} ${r.winnerCount}`,
			);
			check(
				"compare",
				"hackersCount",
				r.hackersCount === declaredHackers(slug),
				`${pre} ${r.hackersCount}`,
			);
			check("compare", "coverage", r.coverage === "winners-only", pre);
			check(
				"compare",
				"activeRatePct",
				!("activeRatePct" in r) || r.activeRatePct === null,
				`${pre} ${r.activeRatePct}`,
			);
			check("compare", "profile.coverage", p?.coverage === "winners-only", pre);
			check(
				"compare",
				"profile.submissions",
				p?.submissions === null,
				`${pre} ${p?.submissions}`,
			);
			check(
				"compare",
				"profile.winners",
				p?.winners === n,
				`${pre} ${p?.winners}`,
			);
			check(
				"compare",
				"profile shares all null",
				shares(p).every((s) => s === null),
				pre,
			);
			if (r.prizePoolUSD && r.winnerCount) {
				check(
					"compare",
					"prizePerWinnerUSD null over incomplete winners",
					r.prizePerWinnerUSD === null,
					`${pre} ${r.prizePerWinnerUSD}`,
				);
				check(
					"compare",
					"notes say why prizePerWinnerUSD is null",
					strings(r.notes).some((x) =>
						x.startsWith("prizePerWinnerUSD is null: "),
					),
					pre,
				);
			}
			const ppw = deltas.prizePerWinnerUSD as J | undefined;
			check(
				"compare",
				"deltas.prizePerWinnerUSD",
				!ppw || (ppw.highest !== slug && ppw.lowest !== slug),
				pre,
			);
			check(
				"compare",
				"deltas.notes (no prize per winner line)",
				!notes.some(
					(x) => x.startsWith("prize per winner:") && x.includes(slug),
				),
				pre,
			);
			const sc = deltas.submissionCount as J | undefined;
			check(
				"compare",
				"deltas.submissionCount",
				!sc || (sc.highest !== slug && sc.lowest !== slug),
				pre,
			);
			check(
				"compare",
				"deltas.notes (no submission count line)",
				!notes.some(
					(x) => x.startsWith("submission count:") && x.includes(slug),
				),
				pre,
			);
			check(
				"compare",
				"deltas.notes (winners-only line)",
				notes.some(
					(x) => x.includes(slug) && x.includes("coverage winners-only"),
				),
				pre,
			);
			check(
				"compare",
				"deltas.notes (not 'none stored')",
				!notes.some(
					(x) => x.includes("none of their submissions") && x.includes(slug),
				),
				pre,
			);
			const shifts = (deltas.facetShifts as J[] | undefined) ?? [];
			check(
				"compare",
				"deltas.facetShifts",
				!shifts.some((s) => (s.shares as J[]).some((x) => x.slug === slug)),
				pre,
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
		if (!curated.includes(slug)) continue;
		const h = body.hackathon as J;
		// Every curated event: no list asserts none.
		for (const [where, t] of [
			["hackathon.tracks", h.tracks],
			["tracks", body.tracks],
		] as const)
			check(
				"getHackathon",
				`${where} never []`,
				!(Array.isArray(t) && t.length === 0),
				slug,
			);
		check(
			"getHackathon",
			"prizeTiers never []",
			!(Array.isArray(h.prizeTiers) && h.prizeTiers.length === 0),
			slug,
		);
		check(
			"getHackathon",
			"prizeTiers null with the note",
			h.prizeTiers === null && strings(h.notes).includes(TIERS_NOTE),
			slug,
		);
		const n = WINNERS[slug];
		if (n === undefined) {
			// Unstored: declared tracks with counts not known, or null.
			const t = h.tracks as J[] | null;
			const want = DECLARED[slug];
			if (want) {
				check(
					"getHackathon",
					"declared tracks served",
					Array.isArray(t) && t.length === want,
					`${slug} ${JSON.stringify(t)}`,
				);
				check(
					"getHackathon",
					"declared tracks: kind, description, counts null",
					(t ?? []).every(
						(x) =>
							(x.kind === "category" || x.kind === "track") &&
							typeof x.description === "string" &&
							x.submissionCount === null &&
							x.winnerCount === null,
					),
					slug,
				);
			} else {
				check(
					"getHackathon",
					"tracks null with the note",
					t === null &&
						body.tracks === null &&
						strings(h.notes).includes(NO_ROSTER_NOTE),
					slug,
				);
			}
			const rules = h.rules as J | undefined;
			if (slug === "hackmeridian-2026")
				check(
					"getHackathon",
					"rules: judging from the record, with source and day",
					typeof rules?.judgingCriteria === "string" &&
						rules?.source === "https://hackmeridian.com" &&
						rules?.checkedOn === "2026-10-20" &&
						Object.keys(rules ?? {}).length === 3,
					slug,
				);
			else
				check(
					"getHackathon",
					"no rules without a judging sentence",
					rules === undefined,
					slug,
				);
			continue;
		}
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
		check(
			"getHackathon",
			"profile shares all null",
			shares(p).every((x) => x === null),
			slug,
		);
		for (const [where, tracks] of [
			["hackathon.tracks", h.tracks],
			["tracks", body.tracks],
		] as const) {
			if (slug === "build-on-stellar-philippines-2026") {
				check(
					"getHackathon",
					`${where} null: winners name no track`,
					tracks === null && strings(h.notes).includes(WINNERS_NO_TRACK_NOTE),
					slug,
				);
				continue;
			}
			const t = (tracks ?? []) as J[];
			check(
				"getHackathon",
				`${where}[].submissionCount`,
				Array.isArray(tracks) && t.every((x) => x.submissionCount === null),
				`${slug} ${JSON.stringify(tracks)}`,
			);
			check(
				"getHackathon",
				`${where}[].winnerCount`,
				t.reduce((a, x) => a + Number(x.winnerCount), 0) === n,
				`${slug} ${JSON.stringify(tracks)}`,
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
			String(meta.note).startsWith(
				"Event off DoraHacks with only its winners on record",
			),
			slug,
		);
	} else if (file.startsWith("analyze_") || file.startsWith("builds_")) {
		const route = file.startsWith("analyze") ? "analyze" : "builds";
		const filter = /hackathon=([^&]+)/.exec(file)?.[1]?.replace(/\.json$/, "");
		const named = filter ? filter.split(",") : [];
		const wo = named.filter((s) => s in WINNERS);
		const full = named.filter((s) => !(s in WINNERS));
		for (const slug of wo)
			check(
				`${route} (hackathon filter)`,
				"meta.warnings (winners-only line)",
				warnsFor(meta.warnings, slug),
				file,
			);
		if (route === "builds") continue;
		const total = body.total as J;
		const groups = (body.groups as J[] | undefined) ?? [];
		const lift = body.winnersVsOthers as J | undefined;
		const onlyWinners =
			file.includes("track=open_20innovation") ||
			(wo.length > 0 && !full.length);
		if (onlyWinners) {
			check(
				"analyze (winners-only rows alone)",
				"every share null",
				shares([total, groups]).every((x) => x === null),
				file,
			);
			check(
				"analyze (winners-only rows alone)",
				"no winnersVsOthers",
				lift === undefined,
				file,
			);
			check(
				"analyze (winners-only rows alone)",
				"meta.warnings names them",
				warnsFor(meta.warnings, "hackmeridian-2025") ||
					wo.every((s) => warnsFor(meta.warnings, s)),
				file,
			);
			continue;
		}
		// Every other analyze request saved here mixes them with full listings.
		const line = leftOutLine(meta.warnings) ?? "";
		const expectLeft = file.includes("track=composability")
			? ["hackmeridian-2025"]
			: wo.length
				? wo
				: Object.keys(WINNERS);
		check(
			"analyze (mixed set)",
			"left-out line names the events",
			expectLeft.every((s) => line.includes(s)),
			`${file} ${line}`,
		);
		check(
			"analyze (mixed set)",
			"no winners-only event in any value, group or lift",
			!slugsIn([total, groups, lift]).some((s) => s in WINNERS),
			file,
		);
		if (!filter && !file.includes("track=")) {
			check(
				"analyze (every event)",
				"left-out line counts 12 rows",
				line.includes("12 rows"),
				line,
			);
			const field = file.includes("winnersOnly=1") ? 68 : 1371;
			check(
				"analyze (every event)",
				"total.field over full listings only",
				total.field === field,
				`${file} ${total.field}`,
			);
		}
		if (file === "analyze_facet=placement.json") {
			const winner = (total.values as J[]).find((v) => v.value === "winner");
			check(
				"analyze (every event)",
				"winners 68 of 1,371",
				winner?.builds === 68 && total.builds === 1371,
				JSON.stringify(winner),
			);
		}
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
