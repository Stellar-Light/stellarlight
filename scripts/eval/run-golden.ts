/**
 * Golden-question retrieval eval for Stellar Light.
 *
 *   pnpm exec tsx scripts/eval/run-golden.ts
 *   BASE_URL=http://localhost:3000 pnpm exec tsx scripts/eval/run-golden.ts
 *   pnpm exec tsx scripts/eval/run-golden.ts --json > scorecard.json
 *
 * Runs each golden question against the live retrieval endpoints and grades
 * RETRIEVAL quality — the thing Tyler asked every data provider to self-check:
 * "storing isn't good enough, you have to store it correctly so queries
 * actually match." For each question we report:
 *
 *   PASS/FAIL  — did every `surface` regex appear somewhere in the top-k?
 *   topScore   — best vector score (research mode)
 *   thin       — the matching chunk is a header/breadcrumb stub (<200 chars
 *                of real content) — surfaced but useless to a synthesizer
 *   junk       — count of nav/date/boilerplate chunks polluting the top-k
 *                (e.g. "58 posts tagged developer", a bare date, "Meeting Notes")
 *
 * Default target is production. Each research call costs one Voyage embedding.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isLowValueChunk } from "../../src/lib/research-ingest";

const BASE_URL = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const JSON_OUT = process.argv.includes("--json");
const TOP_K = 5;

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Question {
	id: string;
	category: string;
	mode: "research" | "projects" | "live-skip";
	question: string;
	expect: {
		surface?: string[];
		expectUrlIncludes?: string;
		minTopScore?: number;
		note?: string;
	};
}

interface ResearchResult {
	score?: number;
	source?: string;
	title?: string;
	content?: string;
	url?: string;
}

// Chunks that should never dominate a result set — pure nav / dates / boilerplate.
const JUNK_TITLE =
	/^\d{4}-\d{2}-\d{2}$|posts tagged|^meeting notes$|^on this page$/i;

function isThin(content: string): boolean {
	// Strip markdown headers, breadcrumb bullets, "On this page" scaffolding.
	const body = content
		.replace(/^#.*$/gm, "")
		.replace(/^\s*[-*]\s.*$/gm, "")
		.replace(/on this page/gi, "")
		.trim();
	return body.length < 200;
}

async function fetchJson(url: string): Promise<unknown> {
	const res = await fetch(url, {
		headers: { "User-Agent": "stellarlight-golden-eval" },
	});
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.json();
}

interface Graded {
	id: string;
	category: string;
	mode: string;
	status: "PASS" | "FAIL" | "N/A";
	matched: boolean;
	missingRegexes: string[];
	topScore: number | null;
	urlOk: boolean | null;
	scoreOk: boolean | null;
	thin: boolean;
	junk: number;
	badTitle: number;
	sample: string;
}

async function gradeResearch(q: Question): Promise<Graded> {
	const url = `${BASE_URL}/api/research?q=${encodeURIComponent(q.question)}&limit=${TOP_K}`;
	const data = (await fetchJson(url)) as { results?: ResearchResult[] };
	const results = data.results ?? [];
	const haystacks = results.map((r) =>
		`${r.title ?? ""} ${r.content ?? ""} ${r.url ?? ""}`.toLowerCase(),
	);
	const joined = haystacks.join(" \n ");

	const surface = q.expect.surface ?? [];
	const missing = surface.filter((rx) => !new RegExp(rx, "i").test(joined));
	const matched = missing.length === 0;

	const topScore = results.length
		? Math.max(...results.map((r) => r.score ?? 0))
		: null;
	const scoreOk =
		q.expect.minTopScore != null
			? (topScore ?? 0) >= q.expect.minTopScore
			: null;

	const urlOk =
		q.expect.expectUrlIncludes != null
			? results.some((r) => (r.url ?? "").includes(q.expect.expectUrlIncludes!))
			: null;

	// Best-matching chunk for the "thin" check: first result that hits surface.
	let thin = false;
	if (matched) {
		const idx = haystacks.findIndex((h) =>
			surface.every((rx) => new RegExp(rx, "i").test(h)),
		);
		const best = results[idx >= 0 ? idx : 0];
		thin = isThin(best?.content ?? "");
	}

	// "junk" = a result whose CONTENT carries no answer — the same rule the
	// pruner uses. (Measuring by title was a false signal: real x402/MPP
	// content lives under garbage titles like "58 posts tagged developer".)
	const junk = results.filter((r) => isLowValueChunk(r.content ?? "")).length;
	// "badTitle" = real content surfaced under a nav/date/listing title — the
	// ingester mis-titled it. Separate, narrower problem than junk content.
	const badTitle = results.filter((r) =>
		JUNK_TITLE.test((r.title ?? "").trim()),
	).length;

	const pass = matched && scoreOk !== false && urlOk !== false;
	return {
		id: q.id,
		category: q.category,
		mode: q.mode,
		status: pass ? "PASS" : "FAIL",
		matched,
		missingRegexes: missing,
		topScore,
		urlOk,
		scoreOk,
		thin,
		junk,
		badTitle,
		sample: (results[0]?.title ?? "—").slice(0, 60),
	};
}

async function gradeProjects(q: Question): Promise<Graded> {
	const url = `${BASE_URL}/api/projects/search?q=${encodeURIComponent(q.question)}&limit=${TOP_K}`;
	const data = (await fetchJson(url)) as {
		projects?: Array<{
			name?: string;
			shortDescription?: string;
			category?: string;
		}>;
	};
	const projects = data.projects ?? [];
	const joined = projects
		.map((p) =>
			`${p.name ?? ""} ${p.shortDescription ?? ""} ${p.category ?? ""}`.toLowerCase(),
		)
		.join(" \n ");
	const surface = q.expect.surface ?? [];
	const missing = surface.filter((rx) => !new RegExp(rx, "i").test(joined));
	const matched = missing.length === 0;
	return {
		id: q.id,
		category: q.category,
		mode: q.mode,
		status: matched ? "PASS" : "FAIL",
		matched,
		missingRegexes: missing,
		topScore: null,
		urlOk: null,
		scoreOk: null,
		thin: false,
		junk: 0,
		badTitle: 0,
		sample: (projects[0]?.name ?? "—").slice(0, 60),
	};
}

async function main() {
	const file = join(__dirname, "golden-questions.json");
	const { questions } = JSON.parse(readFileSync(file, "utf8")) as {
		questions: Question[];
	};

	const graded: Graded[] = [];
	for (const q of questions) {
		if (q.mode === "live-skip") {
			graded.push({
				id: q.id,
				category: q.category,
				mode: q.mode,
				status: "N/A",
				matched: false,
				missingRegexes: [],
				topScore: null,
				urlOk: null,
				scoreOk: null,
				thin: false,
				junk: 0,
				badTitle: 0,
				sample: q.expect.note ?? "live source",
			});
			continue;
		}
		try {
			graded.push(
				q.mode === "projects" ? await gradeProjects(q) : await gradeResearch(q),
			);
		} catch (e) {
			graded.push({
				id: q.id,
				category: q.category,
				mode: q.mode,
				status: "FAIL",
				matched: false,
				missingRegexes: q.expect.surface ?? [],
				topScore: null,
				urlOk: null,
				scoreOk: null,
				thin: false,
				junk: 0,
				badTitle: 0,
				sample: `ERROR: ${e instanceof Error ? e.message : String(e)}`,
			});
		}
	}

	if (JSON_OUT) {
		console.log(JSON.stringify({ baseUrl: BASE_URL, graded }, null, 2));
		return;
	}

	const scored = graded.filter((g) => g.status !== "N/A");
	const passed = scored.filter((g) => g.status === "PASS").length;
	const thinCount = scored.filter((g) => g.thin).length;
	const junkTotal = scored.reduce((s, g) => s + g.junk, 0);
	const badTitleTotal = scored.reduce((s, g) => s + g.badTitle, 0);

	console.log(`\nGolden retrieval eval — ${BASE_URL}\n${"─".repeat(72)}`);
	for (const g of graded) {
		const icon = g.status === "PASS" ? "✓" : g.status === "N/A" ? "·" : "✗";
		const flags = [
			g.thin ? "THIN" : "",
			g.junk ? `${g.junk} junk` : "",
			g.badTitle ? `${g.badTitle} bad-title` : "",
			g.scoreOk === false ? "low-score" : "",
			g.urlOk === false ? "url-miss" : "",
			g.missingRegexes.length ? `missing:${g.missingRegexes.join(",")}` : "",
		]
			.filter(Boolean)
			.join("  ");
		const score = g.topScore != null ? g.topScore.toFixed(3) : "  -  ";
		console.log(`${icon} ${g.id.padEnd(34)} ${score}  ${flags}`.trimEnd());
		if (g.status !== "N/A") console.log(`      ↳ ${g.sample}`);
	}
	console.log("─".repeat(72));
	console.log(
		`PASS ${passed}/${scored.length}   JUNK(content) ${junkTotal}   BAD-TITLE ${badTitleTotal}   THIN ${thinCount}   (live-skipped: ${graded.length - scored.length})`,
	);
	console.log(
		"\nJUNK = result whose CONTENT carries no answer (pruner removes these).\nBAD-TITLE = real content under a nav/date/listing title (ingester mis-title fix).\nTHIN = right page surfaced but chunk is a header stub.\n",
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
