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
	const next = quality.indexOf("\n- **P", i + 4);
	return quality.slice(i, next < 0 ? quality.indexOf("\n\n", i) : next);
};
const PHASES = ["P0", "P1", "P2", "P3"].map((id) => {
	const block = phaseBlock(id);
	// The doc states its own status; this script never infers one. If the
	// marker is missing the phase reads "unknown" rather than being guessed.
	const state = /`status:\s*done`/.test(block)
		? "done"
		: /`status:\s*in progress`/.test(block)
			? "in-progress"
			: /`status:\s*not started`/.test(block)
				? "not-started"
				: "unknown";
	const titleMatch = /\*\*P\d+\s*-\s*([^.*]+)\.?\*\*/.exec(block);
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
		// count the numbered lessons inside (L1, L2, … or bold leads)
		const count = (body.match(/\*\*L\d+\s*[\u2014-]/g) ?? []).length;
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
			markers?: Array<{ marker: string; found: boolean }>;
		};
		return {
			file: `improvements/receipts/${f}`,
			slug: r.slug,
			url: r.url,
			fetchedAt: r.fetchedAt.slice(0, 10),
			markers: (r.markers ?? []).filter((m) => m.found).map((m) => m.marker),
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
