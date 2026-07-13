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
 * actually match." The question file uses the SAME schema as Tyler/SDF's Raven
 * golden set + LumenLoop's #8 audit (expect{ liveSource, answerRegex,
 * forbiddenRegex }), adapted so the regexes match the TOP-K SURFACED CONTENT
 * (we're the data layer, not the answering agent). For each question we report:
 *
 *   PASS/FAIL  — did every `answerRegex` surface AND no `forbiddenRegex` surface?
 *   topScore   — best vector score (research mode)
 *   thin       — the matching chunk is a header/breadcrumb stub (<200 chars
 *                of real content) — surfaced but useless to a synthesizer
 *   junk       — count of nav/date/boilerplate chunks polluting the top-k
 *                (e.g. "58 posts tagged developer", a bare date, "Meeting Notes")
 *
 * `forbiddenRegex` is the correctness lever (Raph's #8 "relevance vs
 * correctness" fix): a wrong/stale fact appearing in the top-k FAILS the case,
 * even if every answerRegex matched.
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
	mode: "research" | "projects" | "repos";
	question: string;
	/** Optional ?source= filter (research mode) — mirrors real agent calls. */
	source?: string;
	/** Optional per-question result count (default TOP_K). Use to lock a
	 *  rank window: limit 3 + answerRegex = "must surface in the top 3". */
	limit?: number;
	expect: {
		liveSource?: boolean;
		answerRegex?: string[];
		forbiddenRegex?: string[];
		expectUrlIncludes?: string;
		/** The FIRST result's URL must contain this substring — a rank-1 lock
		 *  (sls-019: exact-ID retrieval must put the named doc first). */
		top1UrlIncludes?: string;
		/** No URL may appear twice in the returned page — the per-document
		 *  dedup contract (sls-019: cap-0035 served 9× on one page). */
		uniqueUrls?: boolean;
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
	forbiddenHits: string[];
	topScore: number | null;
	urlOk: boolean | null;
	scoreOk: boolean | null;
	top1Ok: boolean | null;
	uniqueOk: boolean | null;
	thin: boolean;
	junk: number;
	badTitle: number;
	sample: string;
}

async function gradeResearch(q: Question): Promise<Graded> {
	const limit = q.limit ?? TOP_K;
	const src = q.source ? `&source=${encodeURIComponent(q.source)}` : "";
	const url = `${BASE_URL}/api/research?q=${encodeURIComponent(q.question)}&limit=${limit}${src}`;
	const data = (await fetchJson(url)) as { results?: ResearchResult[] };
	const results = data.results ?? [];
	const haystacks = results.map((r) =>
		`${r.title ?? ""} ${r.content ?? ""} ${r.url ?? ""}`.toLowerCase(),
	);
	const joined = haystacks.join(" \n ");

	const answerRegex = q.expect.answerRegex ?? [];
	const missing = answerRegex.filter((rx) => !new RegExp(rx, "i").test(joined));
	const forbiddenHits = (q.expect.forbiddenRegex ?? []).filter((rx) =>
		new RegExp(rx, "i").test(joined),
	);
	const matched = missing.length === 0 && forbiddenHits.length === 0;

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

	// Rank-1 lock: the first result must be the named document (sls-019).
	const top1Ok =
		q.expect.top1UrlIncludes != null
			? (results[0]?.url ?? "").includes(q.expect.top1UrlIncludes)
			: null;

	// Per-document dedup lock: no URL twice in the returned page (sls-019).
	const urls = results.map((r) => r.url ?? "");
	const uniqueOk = q.expect.uniqueUrls
		? new Set(urls).size === urls.length
		: null;

	// Best-matching chunk for the "thin" check: first result that hits answerRegex.
	let thin = false;
	if (missing.length === 0) {
		const idx = haystacks.findIndex((h) =>
			answerRegex.every((rx) => new RegExp(rx, "i").test(h)),
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

	const pass =
		matched &&
		scoreOk !== false &&
		urlOk !== false &&
		top1Ok !== false &&
		uniqueOk !== false;
	return {
		id: q.id,
		category: q.category,
		mode: q.mode,
		status: pass ? "PASS" : "FAIL",
		matched,
		missingRegexes: missing,
		forbiddenHits,
		topScore,
		urlOk,
		scoreOk,
		top1Ok,
		uniqueOk,
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
	const answerRegex = q.expect.answerRegex ?? [];
	const missing = answerRegex.filter((rx) => !new RegExp(rx, "i").test(joined));
	const forbiddenHits = (q.expect.forbiddenRegex ?? []).filter((rx) =>
		new RegExp(rx, "i").test(joined),
	);
	const matched = missing.length === 0 && forbiddenHits.length === 0;
	return {
		id: q.id,
		category: q.category,
		mode: q.mode,
		status: matched ? "PASS" : "FAIL",
		matched,
		missingRegexes: missing,
		forbiddenHits,
		topScore: null,
		urlOk: null,
		scoreOk: null,
		top1Ok: null,
		uniqueOk: null,
		thin: false,
		junk: 0,
		badTitle: 0,
		sample: (projects[0]?.name ?? "—").slice(0, 60),
	};
}

async function gradeRepos(q: Question): Promise<Graded> {
	const url = `${BASE_URL}/api/repos/search?q=${encodeURIComponent(q.question)}&limit=${TOP_K}`;
	const data = (await fetchJson(url)) as {
		repos?: Array<{
			fullName?: string;
			description?: string;
			topics?: string[];
			primaryLanguage?: string;
			repoScore?: number;
		}>;
	};
	const repos = data.repos ?? [];
	const joined = repos
		.map((r) =>
			`${r.fullName ?? ""} ${r.description ?? ""} ${(r.topics ?? []).join(" ")} ${r.primaryLanguage ?? ""}`.toLowerCase(),
		)
		.join(" \n ");
	const answerRegex = q.expect.answerRegex ?? [];
	const missing = answerRegex.filter((rx) => !new RegExp(rx, "i").test(joined));
	const forbiddenHits = (q.expect.forbiddenRegex ?? []).filter((rx) =>
		new RegExp(rx, "i").test(joined),
	);
	// For repos, minTopScore is a QUALITY floor on the LEADING repo's repoScore
	// (0-100) — so junk can't be the #1 reference for a tech query.
	const topScore = repos.length
		? Math.max(...repos.map((r) => r.repoScore ?? 0))
		: null;
	const scoreOk =
		q.expect.minTopScore != null
			? (topScore ?? 0) >= q.expect.minTopScore
			: null;
	const matched = missing.length === 0 && forbiddenHits.length === 0;
	const pass = matched && scoreOk !== false;
	return {
		id: q.id,
		category: q.category,
		mode: q.mode,
		status: pass ? "PASS" : "FAIL",
		matched,
		missingRegexes: missing,
		forbiddenHits,
		topScore,
		urlOk: null,
		scoreOk,
		top1Ok: null,
		uniqueOk: null,
		thin: false,
		junk: 0,
		badTitle: 0,
		sample: (repos[0]?.fullName ?? "—").slice(0, 60),
	};
}

async function main() {
	const file = join(__dirname, "golden-questions.json");
	const { questions } = JSON.parse(readFileSync(file, "utf8")) as {
		questions: Question[];
	};

	const graded: Graded[] = [];
	for (const q of questions) {
		// liveSource questions need a live network/registry fact the static corpus
		// is not meant to answer — reported N/A, not a failure (mirrors Raven).
		if (q.expect.liveSource === true) {
			graded.push({
				id: q.id,
				category: q.category,
				mode: q.mode,
				status: "N/A",
				matched: false,
				missingRegexes: [],
				forbiddenHits: [],
				topScore: null,
				urlOk: null,
				scoreOk: null,
				top1Ok: null,
				uniqueOk: null,
				thin: false,
				junk: 0,
				badTitle: 0,
				sample: q.expect.note ?? "live source",
			});
			continue;
		}
		try {
			graded.push(
				q.mode === "repos"
					? await gradeRepos(q)
					: q.mode === "projects"
						? await gradeProjects(q)
						: await gradeResearch(q),
			);
		} catch (e) {
			graded.push({
				id: q.id,
				category: q.category,
				mode: q.mode,
				status: "FAIL",
				matched: false,
				missingRegexes: q.expect.answerRegex ?? [],
				forbiddenHits: [],
				topScore: null,
				urlOk: null,
				scoreOk: null,
				top1Ok: null,
				uniqueOk: null,
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
	const forbiddenTotal = scored.filter((g) => g.forbiddenHits.length).length;

	console.log(`\nGolden retrieval eval — ${BASE_URL}\n${"─".repeat(72)}`);
	for (const g of graded) {
		const icon = g.status === "PASS" ? "✓" : g.status === "N/A" ? "·" : "✗";
		const flags = [
			g.forbiddenHits.length ? `FORBIDDEN:${g.forbiddenHits.join(",")}` : "",
			g.thin ? "THIN" : "",
			g.junk ? `${g.junk} junk` : "",
			g.badTitle ? `${g.badTitle} bad-title` : "",
			g.scoreOk === false ? "low-score" : "",
			g.urlOk === false ? "url-miss" : "",
			g.top1Ok === false ? "top1-miss" : "",
			g.uniqueOk === false ? "dup-url" : "",
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
		`PASS ${passed}/${scored.length}   FORBIDDEN-HIT ${forbiddenTotal}   JUNK(content) ${junkTotal}   BAD-TITLE ${badTitleTotal}   THIN ${thinCount}   (live-skipped: ${graded.length - scored.length})`,
	);
	console.log(
		"\nFORBIDDEN-HIT = a wrong/stale fact surfaced in the top-k (correctness fail, not relevance).\nJUNK = result whose CONTENT carries no answer (pruner removes these).\nBAD-TITLE = real content under a nav/date/listing title (ingester mis-title fix).\nTHIN = right page surfaced but chunk is a header stub.\n",
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
