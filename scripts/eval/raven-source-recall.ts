/**
 * Raven source recall: do we serve the documents Raven's own golden cards
 * say a correct answer comes from?
 *
 * stellar-experimental/stellar-raven (Apache-2.0) keeps 538 human-written
 * research question cards. Each names the source documents a correct answer
 * rests on (`sources`) and the tool Raven should call (`routing`). That is a
 * labeled retrieval benchmark aimed at exactly the questions Raven sends us:
 * for every card we ask /api/research the way Raven does (all research
 * sources, a few passages each) and record where, if anywhere, a gold
 * document comes back.
 *
 * A miss gets one scoped probe (the gold URL's own source, its path words as
 * the query) to tell "in the corpus, ranked out" from "not found by the
 * probe". The probe is a search, not a corpus listing: "not found" is a
 * candidate ingestion gap, not proof the document is absent.
 *
 * The cards are a mid-2026 snapshot; their authors warn against reading
 * them as current truth. Only their source URLs are used here, as "where a
 * good answer comes from". Their answers are not.
 *
 * Read-only: GitHub (the cards) and our public API.
 *
 *   pnpm exec tsx scripts/eval/raven-source-recall.ts [--limit N] [--per 4] [--ref main] [--out file.jsonl]
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { researchOrder } from "../../src/lib/research-rank";
import { RESEARCH_SOURCES } from "../../src/lib/research-sources";

const args = process.argv.slice(2);
const arg = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const LIMIT = Number(arg("--limit") ?? 0);
const PER = Number(arg("--per") ?? 4);
const REF = arg("--ref") ?? "main";
const OUT = arg("--out");
const BASE = process.env.SCOUT_BASE ?? "https://stellarlight.xyz";
const CARDS = `https://raw.githubusercontent.com/stellar-experimental/stellar-raven/${REF}/eval/corpus/raven-next/research/golden/compiled/golden.json`;

interface Card {
	id: string;
	question: string;
	category: string;
	routing?: { expectedCards?: string[]; acceptableCards?: string[] };
	sources?: string[];
}

/** Which of our research sources could hold a gold URL, by where it lives.
 * Anything else (wikipedia, explorers, our own directory pages) is out of
 * the research corpus's scope and is not counted against it. */
function sourceFor(url: string): string | null {
	const u = url.toLowerCase();
	if (u.includes("developers.stellar.org")) return "dev-docs";
	if (/stellar\.org\/blog/.test(u)) return "sdf-blog";
	if (/github\.com\/stellar\/stellar-protocol\/.*\/sep-/.test(u)) return "sep";
	if (/github\.com\/stellar\/stellar-protocol\/.*\/cap-/.test(u)) return "cap";
	if (
		u.includes("stellar.gitbook.io") ||
		u.includes("communityfund.stellar.org")
	)
		return "scf-handbook";
	if (/stellar\.org\/(foundation|about|press|learn|use-cases)/.test(u))
		return "sdf-org";
	return null;
}

/** host + path, lowercased, without scheme, www, query, fragment, slash. */
function norm(url: string): string {
	return url
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/[?#].*$/, "")
		.replace(/\/+$/, "");
}

/** A served passage matches a gold document when one URL is the other or
 * sits under it (a section of the page, or the page of a section). */
function matches(served: string, gold: string): boolean {
	const s = norm(served);
	const g = norm(gold);
	return s === g || s.startsWith(`${g}/`) || g.startsWith(`${s}/`);
}

async function getJson(u: string): Promise<unknown> {
	let res = await fetch(u);
	// A 5xx under load is transient; a 429 says when to come back. The
	// research route allows 60 requests a minute per caller, and a run asks
	// several hundred, so it waits as told instead of counting a rate limit
	// as a retrieval miss (the first run lost 252 of 386 cards that way).
	for (let t = 1; t <= 8 && (res.status >= 500 || res.status === 429); t++) {
		const wait =
			res.status === 429
				? Number(res.headers.get("retry-after") ?? 5) * 1000 + 250 * t
				: 3000 * t;
		await new Promise((r) => setTimeout(r, wait));
		res = await fetch(u);
	}
	if (!res.ok) throw new Error(`${u.split("?")[0]}: HTTP ${res.status}`);
	return res.json();
}

type Row = {
	url: string;
	source: string;
	title: string;
	score: number;
	publishedAt: string | null;
	content: string;
	confidence: { score: number };
};
async function research(q: string, sources: string, per: number) {
	const d = (await getJson(
		`${BASE}/api/research?q=${encodeURIComponent(q)}&source=${sources}&perSource=${per}`,
	)) as { results?: Array<Record<string, unknown>> };
	return (d.results ?? []).map((r) => ({
		url: String(r.url ?? ""),
		source: String(r.source ?? ""),
		title: String(r.title ?? ""),
		score: Number(r.score ?? 0),
		publishedAt: (r.publishedAt as string | null) ?? null,
		content: "",
		confidence: {
			score: Number((r.confidence as { score?: number } | null)?.score ?? 0),
		},
	})) as Row[];
}

async function mapLimit<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>) {
	const out: R[] = new Array(xs.length);
	let i = 0;
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (i < xs.length) {
				const k = i++;
				out[k] = await f(xs[k]);
			}
		}),
	);
	return out;
}

interface Result {
	id: string;
	/** The card's question: with gold and the served non-gold rows, a
	 * training pair with hard negatives. */
	question: string;
	category: string;
	lane: "research" | "docs" | "other";
	gold: string[];
	served: Row[];
	/** 1-based rank of the first served gold document, or null. */
	rank: number | null;
	/** The same, had the served rows been sorted by score across sources
	 * (a multi-source call returns them grouped in source order). */
	scoreRank: number | null;
	/** The same, merged by researchOrder: what the API serves once multi-
	 * source rows are ranked across sources by the per-source rule. */
	mergedRank: number | null;
	/** For a miss: did a scoped probe find a gold document at all? */
	probe?: "found" | "not-found" | "could-not-check";
	error?: string;
}

async function main() {
	const cards = (await getJson(CARDS)) as Card[];
	let todo = cards
		.map((c) => ({
			c,
			gold: (c.sources ?? []).filter((u) => sourceFor(u) !== null),
		}))
		.filter((x) => x.gold.length > 0);
	if (LIMIT > 0) todo = todo.slice(0, LIMIT);
	const all = RESEARCH_SOURCES.join(",");

	const results = await mapLimit(
		todo,
		2,
		async ({ c, gold }): Promise<Result> => {
			const cardsFor = [
				...(c.routing?.expectedCards ?? []),
				...(c.routing?.acceptableCards ?? []),
			];
			const lane = cardsFor.includes("scout_research")
				? "research"
				: cardsFor.includes("stellar_docs_mcp")
					? "docs"
					: "other";
			try {
				const served = await research(c.question, all, PER);
				const idx = served.findIndex((r) =>
					gold.some((g) => matches(r.url, g)),
				);
				const byScore = [...served].sort((a, b) => b.score - a.score);
				const merged = [...served].sort(researchOrder(c.question));
				const midx = merged.findIndex((r) =>
					gold.some((g) => matches(r.url, g)),
				);
				const sidx = byScore.findIndex((r) =>
					gold.some((g) => matches(r.url, g)),
				);
				const base = {
					id: c.id,
					question: c.question,
					category: c.category,
					lane,
					gold,
					served,
					rank: idx >= 0 ? idx + 1 : null,
					scoreRank: sidx >= 0 ? sidx + 1 : null,
					mergedRank: midx >= 0 ? midx + 1 : null,
				} as Result;
				if (idx >= 0) return base;
				// Scoped probe: the gold URL's own source, its path words as query.
				let probe: Result["probe"] = "not-found";
				try {
					for (const g of gold) {
						const src = sourceFor(g) as string;
						const words = norm(g)
							.split("/")
							.slice(1)
							.join(" ")
							.replace(/[-_.]+/g, " ")
							.trim();
						const rows = await research(words || c.question, src, 25);
						if (rows.some((r) => matches(r.url, g))) {
							probe = "found";
							break;
						}
					}
				} catch {
					probe = "could-not-check";
				}
				return { ...base, probe };
			} catch (e) {
				return {
					id: c.id,
					question: c.question,
					category: c.category,
					lane,
					gold,
					served: [],
					rank: null,
					scoreRank: null,
					mergedRank: null,
					error: String(e).slice(0, 120),
				};
			}
		},
	);

	const lines: string[] = [];
	const say = (x = "") => {
		lines.push(x);
		console.log(x);
	};
	const read = results.filter((r) => !r.error);
	const pct = (a: number, b: number) =>
		b ? `${Math.round((100 * a) / b)}%` : "n/a";
	const row = (name: string, rs: Result[]) => {
		const at = (k: number) =>
			rs.filter((r) => r.rank !== null && r.rank <= k).length;
		const mrr =
			rs.reduce((s, r) => s + (r.rank ? 1 / r.rank : 0), 0) / (rs.length || 1);
		const inCorpus = rs.filter(
			(r) => r.rank === null && r.probe === "found",
		).length;
		const notFound = rs.filter(
			(r) => r.rank === null && r.probe === "not-found",
		).length;
		say(
			`| ${name} | ${rs.length} | ${pct(at(1), rs.length)} | ${pct(at(5), rs.length)} | ${pct(at(9999), rs.length)} | ${mrr.toFixed(2)} | ${inCorpus} | ${notFound} |`,
		);
	};

	say("## Raven source recall");
	say();
	say(
		`${cards.length} cards; ${todo.length} name a gold document our research corpus could hold. ${read.length} asked (${PER} passages per source across ${RESEARCH_SOURCES.length} sources), ${results.length - read.length} failed.`,
	);
	say();
	say(
		"| Cards | Asked | Gold first | Gold in top 5 | Gold served at all | MRR | Missed, but probe finds it | Missed, probe does not find it |",
	);
	say("| --- | --- | --- | --- | --- | --- | --- | --- |");
	row("All", read);
	row(
		"Raven routes to our research",
		read.filter((r) => r.lane === "research"),
	);
	row(
		"Raven routes to the docs tool",
		read.filter((r) => r.lane === "docs"),
	);
	say();
	say(
		"| Category | Asked | Gold first | Gold in top 5 | Gold served at all | MRR | Missed, probe finds | Missed, not found |",
	);
	say("| --- | --- | --- | --- | --- | --- | --- | --- |");
	for (const cat of [...new Set(read.map((r) => r.category))].sort())
		row(
			cat,
			read.filter((r) => r.category === cat),
		);
	say();
	// Order matters to a reader that truncates: a multi-source call returns
	// rows grouped in the order the sources were asked, not by relevance.
	const atR = (
		rs: Result[],
		k: number,
		key: "rank" | "scoreRank" | "mergedRank",
	) => rs.filter((r) => r[key] !== null && (r[key] as number) <= k).length;
	say("| Order | Gold first | Gold in top 5 | Gold in top 10 |");
	say("| --- | --- | --- | --- |");
	for (const [name, key] of [
		["As served (grouped by source)", "rank"],
		["Sorted by raw score across sources", "scoreRank"],
		["Ranked across sources by the per-source rule", "mergedRank"],
	] as const)
		say(
			`| ${name} | ${pct(atR(read, 1, key), read.length)} | ${pct(atR(read, 5, key), read.length)} | ${pct(atR(read, 10, key), read.length)} |`,
		);
	say();
	const gaps = read.filter((r) => r.rank === null && r.probe === "not-found");
	const byPrefix = new Map<string, number>();
	for (const r of gaps)
		for (const g of r.gold) {
			const p = norm(g).split("/").slice(0, 4).join("/");
			byPrefix.set(p, (byPrefix.get(p) ?? 0) + 1);
		}
	say(
		`Candidate ingestion gaps (gold documents a scoped probe did not find), by path prefix:`,
	);
	for (const [p, n] of [...byPrefix].sort((a, b) => b[1] - a[1]).slice(0, 15))
		say(`- ${p}: ${n}`);

	if (OUT)
		writeFileSync(OUT, `${results.map((r) => JSON.stringify(r)).join("\n")}\n`);
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

main().catch((e) => {
	console.error(`INCONCLUSIVE: ${e instanceof Error ? e.message : e}`);
	process.exit(2);
});
