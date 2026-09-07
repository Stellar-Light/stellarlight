/**
 * Progress + library artifact for /quality.
 *
 * Two things a scoreboard of current numbers cannot show: are we moving
 * toward the stated goals, and where is the reasoning written down.
 *
 * Progress is read from QUALITY.md's own phase list, the doc is the source
 * of truth, so a phase cannot be marked done here without being done there.
 * Each phase carries the EVIDENCE (shipped invariants, ratchets) and, when
 * it is not done, what remains. Honesty rule: "in progress" and "not
 * started" are first-class states and must render as plainly as "done".
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const quality = readFileSync(join(root, "QUALITY.md"), "utf8");

/** A phase is done when QUALITY.md's §4 entry carries a *shipped* marker for
 * every item; in progress when some carry one; not started when none do. */
const phaseBlock = (id: string): string => {
	const i = quality.indexOf(`- **${id}`);
	if (i < 0) return "";
	// The block ends at the NEXT PHASE HEADER, matched strictly as
	// `- **P<digit>` at a line start. The old lookup matched any `- **P…`
	// bullet, so a line like `- **PR #1075…** ` truncated the block and could
	// silently drop the phase's own status marker.
	const next = quality.slice(i + 4).search(/\n- \*\*P\d/);
	return next < 0
		? quality.slice(i, quality.indexOf("\n\n", i))
		: quality.slice(i, i + 4 + next);
};
// The roster comes from the doc itself (every `- **P<n>.` header in order),
// so adding a phase to QUALITY.md is sufficient — a hardcoded list here
// silently dropped P4/P5 the day they were written.
const PHASE_IDS = [
	...new Set(
		[...quality.matchAll(/^- \*\*(P\d+)[.\s-]/gm)].map((m) => m[1]),
	),
];
const PHASES = PHASE_IDS.map((id) => {
	const block = phaseBlock(id);
	// The doc states its own status; this script never infers one, and it reads
	// ONLY the marker on the phase's own header line. The old test ran over the
	// whole block with `done` checked first, so the words "status: done"
	// appearing anywhere in the prose (for example inside *Remaining:* text
	// describing a future state) marked the phase green.
	const headerLine = block.split("\n", 1)[0] ?? "";
	const marker = /`status:\s*(done|in progress|not started)`/.exec(headerLine);
	const state =
		marker?.[1] === "done"
			? "done"
			: marker?.[1] === "in progress"
				? "in-progress"
				: marker?.[1] === "not started"
					? "not-started"
					: "unknown";
	// Headers write `**P0. Title.**` (dot) but historically used `**P0 - Title**`
	// (dash); accept either so a punctuation edit cannot blank every title.
	const titleMatch = /\*\*P\d+\s*[-.]\s*([^*]+?)\.?\*\*/.exec(block);
	const evidence = /\*Evidence:\*\s*([\s\S]*?)(?:\n\n|$)/.exec(block);
	const remaining = /\*Remaining:\*\s*([\s\S]*?)(?:\n\n|$)/.exec(block);
	const shippedSoFar =
		/\*Shipped so far:\*\s*([\s\S]*?)(?:\n\s*\*Remaining|\n\n|$)/.exec(block);
	const clean = (x?: string) =>
		x ? x.replace(/\s+/g, " ").replace(/`/g, "").trim() : null;
	return {
		id,
		title: clean(titleMatch?.[1]) ?? id,
		state,
		evidence: clean(evidence?.[1]),
		shippedSoFar: clean(shippedSoFar?.[1]),
		remaining: clean(remaining?.[1]),
	};
});

/**
 * How far each in-progress phase actually is, measured from live artifacts.
 *
 * A phase that says "in progress" for months is unfalsifiable: nobody can tell
 * whether it is nearly done or has not moved. Each bar below is the phase's
 * OWN stated done-condition, read out of the artifacts the guards write, with
 * the origin it started from — so the meter is a measurement and not a
 * self-assessment. A bar that cannot be computed reports null rather than a
 * guess, and says why.
 */
function phaseMeters(): Record<
	string,
	{
		bar: string;
		origin: number | null;
		current: number | null;
		target: number;
		unit: string;
		pct: number | null;
		note: string;
	}
> {
	const read = (rel: string) => {
		try {
			return JSON.parse(readFileSync(join(root, rel), "utf8"));
		} catch {
			return null;
		}
	};
	const entities = read("improvements/quality/entities.json");
	const lanes = read("improvements/audits/lane-autonomy-latest.json");

	/** Fraction of the journey covered, origin → target. Never below 0 or above 1. */
	const span = (origin: number | null, current: number | null, target: number) =>
		origin === null || current === null || origin === target
			? null
			: Math.max(
					0,
					Math.min(1, (origin - current) / (origin - target)),
				);

	// P4's bar is the phase's own: weak bases under 50% of Live rows. The origin
	// is the share when the phase opened (842/979 = 86%), quoted in its block.
	const split = entities?.projects?.strongBasisSplit ?? {};
	// Live rows only. Counting every status lets the ratchet fall for the wrong
	// reason — retiring a dead row stamps it human-verified, so a day of
	// retirements improves the share without improving anything a consumer
	// reads. On 2026-09-07 the all-status reading said 49.1% (bar met) while
	// Live-only said 54.2% (bar not met, ~35 rows short).
	const weak = split.weakLiveOnly ?? null;
	// The population the split was counted over, published beside it. Summing
	// strongByBasis instead reported P4 complete on 2026-09-07 — that sum is a
	// different population, and a share needs both halves from the same one.
	const live =
		typeof split.livePopulation === "number" ? split.livePopulation : null;
	const weakShare =
		typeof weak === "number" && typeof live === "number" && live > 0
			? (weak / live) * 100
			: null;

	// P3: Stage 2 opens per lane at the intervention-free threshold. The meter is
	// the share of production-writing lanes that have earned it.
	const laneTotal = lanes?.summary?.lanes ?? null;
	const laneEligible = lanes?.summary?.eligibleForStage2 ?? null;
	const lanePct =
		typeof laneTotal === "number" && laneTotal > 0 && typeof laneEligible === "number"
			? laneEligible / laneTotal
			: null;

	// P5: the curated-pool note floor, which may only rise.
	const notes = entities?.repos?.coverage?.knowledgeNotes ?? null;
	const notePct =
		notes && notes.pool > 0 ? (notes.withNotes + notes.triaged) / notes.pool : null;

	return {
		P3: {
			bar: "every lane that writes to production has earned the intervention-free threshold",
			origin: 0,
			current: laneEligible,
			target: laneTotal ?? 0,
			unit: "lanes",
			pct: lanePct,
			note: "Weeks measure the absence of correction, not effect — the second condition (a lane asserts its own end state) is not yet counted here because most lanes do not report one.",
		},
		P4: {
			bar: "weak bases under 50% of Live rows",
			origin: 86,
			current: weakShare === null ? null : Math.round(weakShare * 10) / 10,
			target: 50,
			unit: "% of Live rows on a weak basis",
			pct: span(86, weakShare, 50),
			note: "Origin is the share when the phase opened (842/979). The ratchet may only fall.",
		},
		P5: {
			bar: "the curated-pool note floor, examined or noted",
			origin: 0,
			current: notes ? notes.withNotes + notes.triaged : null,
			target: notes?.pool ?? 0,
			unit: "curated-pool repos",
			pct: notePct,
			note: "Counts a repo examined and recorded as yielding no durable public fact — a judged repo is not a gap.",
		},
	};
}

/** The written reasoning, listed from the repo so it cannot claim a document
 * that does not exist. */
const lessonsDir = join(root, "improvements/lessons");
const lessons = readdirSync(lessonsDir)
	.filter((f) => f.endsWith(".md") && /^\d{4}-/.test(f))
	.sort()
	.reverse()
	.map((f) => {
		const body = readFileSync(join(lessonsDir, f), "utf8");
		// Titles come from the lesson documents themselves; normalise their
		// punctuation for display rather than rewriting the source files.
		const title = (
			body
				.split("\n")
				.find((l) => l.startsWith("# "))
				?.replace(/^#\s*/, "") ?? f.replace(/\.md$/, "")
		)
			.replace(/\s+\u2014\s+/g, ": ")
			.replace(/\u2014/g, "-");
		// Count the numbered lessons inside where a countable convention
		// exists (L1/L2 markers or numbered ## sections). The files are
		// heterogeneous, and for one with no recognizable structure the count
		// is NULL, not zero: zero asserts "an empty write-up", which is a
		// claim this parser cannot make. (The old bold-only pattern matched
		// one file in fourteen and published 0 for the rest.)
		const ids = new Set([
			...[...body.matchAll(/(?:\*\*|#{2,4}\s*)L(\d+)\s*[\u2014:.-]/g)].map(
				(m) => `L${m[1]}`,
			),
			...[...body.matchAll(/^#{2,3}\s*(\d+)[.)]\s+\S/gm)].map(
				(m) => `n${m[1]}`,
			),
		]);
		const count = ids.size > 0 ? ids.size : null;
		return {
			file: `improvements/lessons/${f}`,
			date: f.slice(0, 10),
			title,
			lessonCount: count,
			bytes: statSync(join(lessonsDir, f)).size,
		};
	});

const audits = readdirSync(join(root, "improvements/audits"))
	.filter((f) => f.endsWith(".md"))
	.sort()
	.reverse()
	.map((f) => ({
		file: `improvements/audits/${f}`,
		name: f.replace(/\.md$/, ""),
	}));

const receipts = readdirSync(join(root, "improvements/receipts"))
	.filter((f) => f.endsWith(".json"))
	.sort()
	.reverse()
	.map((f) => {
		const r = JSON.parse(
			readFileSync(join(root, "improvements/receipts", f), "utf8"),
		) as {
			slug: string;
			url: string;
			fetchedAt: string;
			markers?: Array<{ marker: string; found: boolean; excerpt?: string }>;
		};
		return {
			file: `improvements/receipts/${f}`,
			slug: r.slug,
			url: r.url,
			fetchedAt: r.fetchedAt.slice(0, 10),
			// NEGATIVE markers are evidence too. A receipt proving a site is dead
			// has found:false on every marker, and the old found-only filter
			// rendered it as a receipt with no evidence at all. Publish each
			// marker WITH its polarity, and when the marker text alone is opaque
			// ("TBD"), carry a slice of the receipt's own excerpt so the line
			// says something without anyone authoring new evidence.
			markers: (r.markers ?? []).map((m) => {
				const label = `${m.found ? "" : "NOT "}${m.marker}`;
			// A malformed receipt (wrong marker key, hand-edited) must never
				// crash the artifact build — skip it visibly instead.
				if (typeof m.marker !== "string") return "(malformed marker)";
				if (m.marker.length > 4 || !m.excerpt) return label;
				return `${label} ("…${m.excerpt.slice(0, 60).trim()}…")`;
			}),
		};
	});

writeFileSync(
	join(root, "improvements/quality/progress.json"),
	`${JSON.stringify(
		{
			generatedAt: new Date().toISOString(),
			source: "QUALITY.md",
			note: "Phase state is derived from QUALITY.md's own phase list, a phase cannot be marked done here without being done there. 'In progress' and 'not started' render as plainly as 'done'.",
			phases: PHASES,
			phaseMeters: phaseMeters(),
			library: { lessons, audits, receipts },
		},
		null,
		1,
	)}\n`,
);
console.log(
	`progress.json: ${PHASES.map((p) => `${p.id}=${p.state}`).join(" ")} · ${lessons.length} lesson files · ${receipts.length} receipts`,
);
