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
			library: { lessons, audits, receipts },
		},
		null,
		1,
	)}\n`,
);
console.log(
	`progress.json: ${PHASES.map((p) => `${p.id}=${p.state}`).join(" ")} · ${lessons.length} lesson files · ${receipts.length} receipts`,
);
