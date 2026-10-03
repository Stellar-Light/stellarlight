/**
 * Jev (TypeSafe AI's typed-decision model) measured against human labels
 * before anything relies on it. Two tasks, one harness:
 *
 *   --task page   (default) What does a project's website actually show?
 *                 classifyPage (src/lib/page-verdict.ts) settles the
 *                 unambiguous pages and calls the rest "product" or "unknown";
 *                 Jev answers the question it leaves open. Labels: websites
 *                 removed as taken over or parked, rows retired for a
 *                 site-level reason, rows confirmed Live.
 *   --task types  Which of the 25 project types fit? One yes/no per type.
 *                 Labels: TYPES_SET (a human's exact type set for the row) and
 *                 TYPES_ADD (types a human added).
 *   --task repos  Does a repo build on Stellar, judged from its README,
 *                 description and topics? Labels: the code scan's stellarProof
 *                 (an SDK, contract macros or a stellar.toml found in the code,
 *                 against scanned repos with none). Baseline: the keyword gate
 *                 that admits repos from multi-chain orgs (STELLAR_SIGNAL).
 *
 *   --task sources  How good are the research passages we serve? The golden
 *                 research questions are asked of all 16 sources the way
 *                 Raven asks (--per passages each). Jev scores every passage
 *                 in two separate passes: relevance to the question, then
 *                 substance and currency against today's date. Baselines:
 *                 the questions' answer patterns and the golden junk rule;
 *                 calibration: the 12 questions that name their expected doc.
 *
 *   --eval    (default) score against the labels and list every disagreement
 *             for a human look (a label is dated; the row may have changed).
 *   --review  page: weak-basis Live rows either reader calls not the product.
 *             types: published rows where Jev confidently disagrees with the
 *             stored types. repos: scanned repos with no Stellar proof that
 *             Jev reads as Stellar (possible scan misses) and the share it
 *             reads as unrelated. Nothing is written in any mode.
 *
 * Read-only: the public API, the public pages and the gateway. No database.
 * Without AI_GATEWAY_API_KEY the Jev column reads could-not-check: the page
 * task still measures the regex baseline, the types task has none, the repos
 * task measures the keyword gate. The repos task reads READMEs from GitHub
 * (GITHUB_TOKEN if set).
 *
 *   pnpm exec tsx scripts/eval/jev-eval.ts [--task page|types|repos] [--review] [--limit N] [--bar 0.9] [--out file.json]
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import {
	choiceConfidence,
	type JevAnswer,
	type JevQuestion,
	jevEvaluate,
	jevKey,
} from "../../src/lib/jev";
import {
	QUALITY_QUESTIONS,
	RELEVANCE_QUESTIONS,
} from "../../src/lib/jev-research";
import {
	classifyPage,
	JEV_NON_PRODUCT,
	jevPageReading,
	NON_PRODUCT_VERDICTS,
	PAGE_QUESTIONS,
	pageJevState,
	readPage,
} from "../../src/lib/page-verdict";
import { PROJECT_TYPES, TYPE_DEFINITIONS } from "../../src/lib/project-types";
import { STELLAR_SIGNAL } from "../../src/lib/repo-org-attribution";
import { RESEARCH_SOURCES } from "../../src/lib/research-sources";
import {
	STATUS_FIX,
	TYPES_ADD,
	TYPES_SET,
	WEBSITE_REMOVE,
} from "../data/curation-maps";
import { isThin, JUNK_TITLE } from "./research-junk";

const args = process.argv.slice(2);
const arg = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const TASK = arg("--task") ?? "page";
if (!["page", "types", "repos", "sources"].includes(TASK))
	throw new Error(`--task must be page, types, repos or sources, got ${TASK}`);
const REVIEW = args.includes("--review");
const LIMIT = Number(arg("--limit") ?? 0);
const BAR = Number(arg("--bar") ?? 0.9);
if (!(BAR > 0.5 && BAR <= 1))
	throw new Error(`--bar must be in (0.5, 1], got ${arg("--bar")}`);
const OUT = arg("--out");
const BASE = process.env.SCOUT_BASE ?? "https://stellarlight.xyz";
const UA =
	"StellarLightLinkChecker/1.0 (+https://stellarlight.xyz; admin@stellarlight.xyz)";
const STATUSES = ["Live", "Inactive", "Development", "Pre-Release"];
/** The bases a Live status can rest on without anyone having looked. */
const WEAK_BASES = new Set(["site-liveness", "source-inherited", "unverified"]);
/** A retirement note that is about the SITE, so the page itself is the label. */
const SITE_REASON =
	/park|for sale|expired|lapsed|hijack|taken over|casino|gambl|spam|redirect|shut|sunset|discontinu|wound down|waitlist|coming soon|placeholder|scaffold|create next app/i;
const USD_PER_M_INPUT = 0.042;

interface Row {
	slug: string;
	name?: string;
	status?: string;
	statusBasis?: string | null;
	shortDescription?: string | null;
	links?: { website?: string | null } | null;
	types?: string[] | null;
}

async function loadProjects(): Promise<Map<string, Row>> {
	const out = new Map<string, Row>();
	for (const status of STATUSES) {
		for (let offset = 0; ; offset += 100) {
			const u = `${BASE}/api/projects/search?status=${encodeURIComponent(status)}&limit=100&offset=${offset}&fields=slug,name,status,statusBasis,shortDescription,links,types`;
			// A 5xx under load is transient (the search route has an 8s read
			// bound); retry twice before calling the whole run inconclusive.
			let res = await fetch(u);
			for (let t = 1; t <= 2 && res.status >= 500; t++) {
				await new Promise((r) => setTimeout(r, 3000 * t));
				res = await fetch(u);
			}
			if (!res.ok)
				throw new Error(`projects ${status}@${offset}: HTTP ${res.status}`);
			const rows = ((await res.json()) as { projects?: Row[] }).projects ?? [];
			for (const r of rows) out.set(r.slug, r);
			if (rows.length < 100) break;
		}
	}
	return out;
}

type Label = "product" | "not-product";
interface Item {
	slug: string;
	name: string;
	description: string | null;
	url: string;
	label?: Label;
	labelSource?: string;
}

function evalItems(projects: Map<string, Row>): Item[] {
	const items = new Map<string, Item>();
	const base = (slug: string) => {
		const r = projects.get(slug);
		return { name: r?.name ?? slug, description: r?.shortDescription ?? null };
	};
	for (const [slug, url] of Object.entries(WEBSITE_REMOVE))
		items.set(slug, {
			slug,
			...base(slug),
			url,
			label: "not-product",
			labelSource: "website removed by a human",
		});
	for (const [slug, fix] of Object.entries(STATUS_FIX)) {
		if (items.has(slug)) continue;
		const r = projects.get(slug);
		const url = r?.links?.website;
		if (!url) continue;
		if (fix.to === "Inactive" && SITE_REASON.test(fix.note ?? ""))
			items.set(slug, {
				slug,
				...base(slug),
				url,
				label: "not-product",
				labelSource: "retired by a human for a site-level reason",
			});
		else if (fix.to === "Live" && r?.status === "Live")
			items.set(slug, {
				slug,
				...base(slug),
				url,
				label: "product",
				labelSource: "confirmed Live by a human",
			});
	}
	return [...items.values()];
}

function reviewItems(projects: Map<string, Row>): Item[] {
	return [...projects.values()]
		.filter(
			(r) =>
				r.status === "Live" &&
				WEAK_BASES.has(r.statusBasis ?? "") &&
				!!r.links?.website,
		)
		.map((r) => ({
			slug: r.slug,
			name: r.name ?? r.slug,
			description: r.shortDescription ?? null,
			url: r.links?.website as string,
		}));
}

interface Result extends Item {
	read: "ok" | "could-not-read";
	error?: string;
	title?: string | null;
	finalUrl?: string | null;
	regex?: { verdict: string; reason: string | null };
	jev?:
		| { kind: string; p: number | null; sameProject: number | null }
		| { error: string }
		| null;
	inputTokens?: number | null;
}

async function judge(item: Item, key: string | null): Promise<Result> {
	let page: Awaited<ReturnType<typeof readPage>>;
	try {
		page = await readPage(item.url, AbortSignal.timeout(15_000), UA);
	} catch (e) {
		return { ...item, read: "could-not-read", error: String(e).slice(0, 120) };
	}
	if (!page.title && !page.meta && !page.body)
		return {
			...item,
			read: "could-not-read",
			error: "empty or unreadable page",
		};
	const regex = classifyPage({
		title: page.title,
		metaDescription: page.meta,
		bodyStart: page.body,
		requestedHost: new URL(item.url).hostname,
		finalHost: page.finalUrl ? new URL(page.finalUrl).hostname : null,
	});
	let jev: Result["jev"] = null;
	let inputTokens: number | null = null;
	if (key) {
		try {
			const r = await jevEvaluate(
				pageJevState(
					{ name: item.name, description: item.description, website: item.url },
					page,
				),
				PAGE_QUESTIONS,
				{ apiKey: key, signal: AbortSignal.timeout(20_000) },
			);
			jev = jevPageReading(r.answers, BAR);
			inputTokens = r.inputTokens;
		} catch (e) {
			jev = { error: String(e).slice(0, 160) };
		}
	}
	return {
		...item,
		read: "ok",
		title: page.title,
		finalUrl: page.finalUrl,
		regex,
		jev,
		inputTokens,
	};
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

const regexSays = (r: Result) =>
	!!r.regex && NON_PRODUCT_VERDICTS.has(r.regex.verdict as never);
const jevSays = (r: Result) =>
	!!r.jev && "kind" in r.jev && JEV_NON_PRODUCT.has(r.jev.kind);
/** The regex keeps the verdicts it is near-certain of (parked, spam). On the
 * soft ones (an off-site redirect is a rebrand as often as a hijack; a
 * scaffold title can sit on a working app) and on "product"/"unknown", a
 * confident Jev answer decides; without one the regex verdict stands. */
const HARD = new Set(["parked", "spam"]);
const combinedSays = (r: Result) => {
	if (r.regex && HARD.has(r.regex.verdict)) return true;
	if (r.jev && "kind" in r.jev && r.jev.kind !== "unknown")
		return JEV_NON_PRODUCT.has(r.jev.kind);
	return regexSays(r);
};

function score(rows: Result[], says: (r: Result) => boolean) {
	let tp = 0;
	let fp = 0;
	let fn = 0;
	let tn = 0;
	for (const r of rows) {
		const pos = r.label === "not-product";
		const hit = says(r);
		if (hit && pos) tp++;
		else if (hit) fp++;
		else if (pos) fn++;
		else tn++;
	}
	const pct = (a: number, b: number) =>
		b ? `${Math.round((100 * a) / b)}%` : "n/a";
	return {
		tp,
		fp,
		fn,
		tn,
		recall: pct(tp, tp + fn),
		precision: pct(tp, tp + fp),
	};
}

// ── Task: types ─────────────────────────────────────────────────────────────

const typeKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const TYPE_QUESTIONS: Record<string, JevQuestion> = Object.fromEntries(
	PROJECT_TYPES.map((t) => [
		typeKey(t),
		{
			type: "boolean",
			instructions: `Does this project fit the type "${t}"? ${TYPE_DEFINITIONS[t]}`,
		},
	]),
);

interface TypeItem {
	slug: string;
	name: string;
	description: string | null;
	url: string | null;
	stored: string[];
	/** The human's types: the whole set when `exact`, additions otherwise. */
	truth?: string[];
	exact?: boolean;
}

function typeItems(projects: Map<string, Row>): TypeItem[] {
	const item = (r: Row): TypeItem => ({
		slug: r.slug,
		name: r.name ?? r.slug,
		description: r.shortDescription ?? null,
		url: r.links?.website ?? null,
		stored: r.types ?? [],
	});
	if (REVIEW) return [...projects.values()].map(item);
	const out: TypeItem[] = [];
	for (const [slug, truth] of Object.entries(TYPES_SET)) {
		const r = projects.get(slug);
		if (r) out.push({ ...item(r), truth, exact: true });
	}
	for (const [slug, truth] of Object.entries(TYPES_ADD)) {
		const r = projects.get(slug);
		if (r && !(slug in TYPES_SET))
			out.push({ ...item(r), truth, exact: false });
	}
	return out;
}

/** Jev's confident answers: yes at or above the bar, no at or below 1 - bar. */
function typeReading(answers: Record<string, JevAnswer>) {
	const yes = new Map<string, number>();
	const no = new Map<string, number>();
	for (const t of PROJECT_TYPES) {
		const a = answers[typeKey(t)];
		if (a?.type !== "boolean") continue;
		if (a.probability >= BAR) yes.set(t, a.probability);
		else if (a.probability <= 1 - BAR) no.set(t, a.probability);
	}
	return { yes, no };
}

type TypeAnswered = TypeItem & {
	reading: ReturnType<typeof typeReading>;
	inputTokens: number | null;
};
type TypeResult = TypeAnswered | (TypeItem & { error: string });

async function judgeTypes(item: TypeItem, key: string): Promise<TypeResult> {
	let page: Awaited<ReturnType<typeof readPage>> | null = null;
	if (item.url) {
		try {
			page = await readPage(item.url, AbortSignal.timeout(15_000), UA);
		} catch {
			page = null; // the record alone still carries a description
		}
	}
	const state = {
		project: {
			name: item.name,
			description: item.description,
			website: item.url,
		},
		...(page && (page.title || page.meta || page.body)
			? {
					page: {
						title: page.title,
						metaDescription: page.meta,
						text: page.body,
					},
				}
			: {}),
	};
	try {
		const r = await jevEvaluate(state, TYPE_QUESTIONS, {
			apiKey: key,
			signal: AbortSignal.timeout(20_000),
		});
		return {
			...item,
			reading: typeReading(r.answers),
			inputTokens: r.inputTokens,
		};
	} catch (e) {
		return { ...item, error: String(e).slice(0, 160) };
	}
}

async function typesTask(projects: Map<string, Row>, key: string | null) {
	const lines: string[] = [];
	const say = (x = "") => {
		lines.push(x);
		console.log(x);
	};
	let items = typeItems(projects);
	if (LIMIT > 0) items = items.slice(0, LIMIT);
	say(`## Jev type tags (${REVIEW ? "review" : "eval"})`);
	say();
	if (!key) {
		say(
			`${items.length} rows ready. Jev: could not check (AI_GATEWAY_API_KEY is not set). This task has no non-Jev baseline, so nothing was measured.`,
		);
	} else {
		const results = await mapLimit(items, 8, (it) => judgeTypes(it, key));
		const ok = results.filter((r): r is TypeAnswered => "reading" in r);
		const tokens = ok.reduce((n, r) => n + (r.inputTokens ?? 0), 0);
		say(
			`${items.length} rows; Jev answered ${ok.length}, failed ${results.length - ok.length}; bar ${BAR}; ${tokens} input tokens, about $${((tokens / 1e6) * USD_PER_M_INPUT).toFixed(4)}.`,
		);
		const failed = results.find((r) => "error" in r && r.error);
		if (failed && "error" in failed) say(`First Jev error: ${failed.error}`);
		say();
		if (!REVIEW) {
			// Exact rows: every type is labeled (in the set or not).
			let tp = 0;
			let fp = 0;
			let fn = 0;
			let tn = 0;
			let abstain = 0;
			const misses: string[] = [];
			for (const r of ok.filter((x) => x.exact)) {
				const truth = new Set(r.truth);
				for (const t of PROJECT_TYPES) {
					const yes = r.reading.yes.has(t);
					const no = r.reading.no.has(t);
					if (!yes && !no) abstain++;
					else if (yes && truth.has(t)) tp++;
					else if (yes) {
						fp++;
						misses.push(`- ${r.slug}: Jev says ${t}, the human set does not`);
					} else if (truth.has(t)) {
						fn++;
						misses.push(`- ${r.slug}: Jev says not ${t}, the human set does`);
					} else tn++;
				}
			}
			// Added rows: only the added types are labeled, all positive.
			let addHit = 0;
			let addMiss = 0;
			let addAbstain = 0;
			for (const r of ok.filter((x) => !x.exact)) {
				for (const t of r.truth ?? []) {
					if (r.reading.yes.has(t)) addHit++;
					else if (r.reading.no.has(t)) {
						addMiss++;
						misses.push(`- ${r.slug}: Jev says not ${t}, a human added it`);
					} else addAbstain++;
				}
			}
			const pct = (a: number, b: number) =>
				b ? `${Math.round((100 * a) / b)}%` : "n/a";
			say("| Labels | Right | Wrong | Undecided | Precision | Recall |");
			say("| --- | --- | --- | --- | --- | --- |");
			say(
				`| Exact type sets | ${tp + tn} | ${fp + fn} | ${abstain} | ${pct(tp, tp + fp)} | ${pct(tp, tp + fn)} |`,
			);
			say(
				`| Added types | ${addHit} | ${addMiss} | ${addAbstain} | n/a | ${pct(addHit, addHit + addMiss)} |`,
			);
			say();
			say(
				"Disagreements with a label (check the row before calling either one wrong):",
			);
			for (const m of misses) say(m);
		} else {
			const flags: Array<{ line: string; p: number }> = [];
			for (const r of ok) {
				const stored = new Set(r.stored);
				for (const [t, p] of r.reading.yes)
					if (!stored.has(t))
						flags.push({
							p,
							line: `- ${r.slug}: likely ${t} (${p.toFixed(2)}), not tagged`,
						});
				for (const [t, p] of r.reading.no)
					if (stored.has(t))
						flags.push({
							p: 1 - p,
							line: `- ${r.slug}: tagged ${t}, Jev says not (${p.toFixed(2)})`,
						});
			}
			flags.sort((a, b) => b.p - a.p);
			say(`Confident disagreements with stored types: ${flags.length}.`);
			for (const f of flags.slice(0, 80)) say(f.line);
		}
		if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
	}
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

// ── Task: repos ─────────────────────────────────────────────────────────────

/** Code proof that a repo uses Stellar (the Repos collection's stellarProof). */
const PROVEN = [
	"cargo-sdk",
	"js-sdk",
	"lang-sdk",
	"stellar-toml",
	"contract-macros",
];
/** How many of each class the eval samples, spread across the class. */
const REPO_SAMPLE: Record<string, number> = {
	"cargo-sdk": 40,
	"js-sdk": 40,
	"lang-sdk": 15,
	"stellar-toml": 5,
	"contract-macros": 5,
	none: 100,
};

const REPO_QUESTIONS: Record<string, JevQuestion> = {
	stellar: {
		type: "boolean",
		instructions:
			"Does the code in this repository use Stellar or Soroban: a Stellar SDK, Soroban smart contracts, a stellar.toml, or an implementation of a Stellar protocol? Judge the repository itself. A passing mention, or a multi-chain project whose code here does not touch Stellar, is not enough.",
	},
};

interface RepoItem {
	fullName: string;
	proof: string;
}

async function getJson(u: string, headers: Record<string, string> = {}) {
	const res = await fetch(u, { headers, signal: AbortSignal.timeout(20_000) });
	if (!res.ok) throw new Error(`${u.split("?")[0]}: HTTP ${res.status}`);
	return res.json();
}

/** `n` repos with this proof value, from two spread-out pages. For "none"
 * only scanned repos count, so it means the scan looked and found nothing. */
async function repoClass(proof: string, n: number): Promise<RepoItem[]> {
	const scanned =
		proof === "none" ? "&where%5BcodeScanState%5D%5Bequals%5D=scanned" : "";
	const where = `where%5BstellarProof%5D%5Bequals%5D=${proof}${scanned}`;
	const per = Math.ceil(n / 2);
	const head = await getJson(`${BASE}/api/repos?${where}&limit=1&depth=0`);
	const pages = Math.max(1, Math.ceil((head.totalDocs ?? 0) / per));
	const picks = [
		...new Set([Math.ceil(pages / 4), Math.ceil((3 * pages) / 4)]),
	];
	const out: RepoItem[] = [];
	for (const page of picks) {
		const d = await getJson(
			`${BASE}/api/repos?${where}&limit=${per}&page=${page}&depth=0&sort=fullName`,
		);
		for (const doc of d.docs ?? [])
			if (doc.fullName) out.push({ fullName: doc.fullName, proof });
	}
	return out.slice(0, n);
}

/** Description, topics and the first 1.5 KB of README text, from GitHub. */
async function repoFacts(fullName: string) {
	const token = process.env.GITHUB_TOKEN?.trim();
	const auth: Record<string, string> = token
		? { authorization: `Bearer ${token}` }
		: {};
	const meta = await getJson(`https://api.github.com/repos/${fullName}`, {
		accept: "application/vnd.github+json",
		...auth,
	});
	let readme = "";
	try {
		const res = await fetch(`https://api.github.com/repos/${fullName}/readme`, {
			headers: { accept: "application/vnd.github.raw", ...auth },
			signal: AbortSignal.timeout(20_000),
		});
		if (res.ok)
			readme = (await res.text())
				.replace(/<[^>]+>|!\[[^\]]*\]\([^)]*\)/g, " ")
				.replace(/\s+/g, " ")
				.slice(0, 1500);
	} catch {
		readme = ""; // judged on description and topics alone
	}
	return {
		name: String(meta.name ?? fullName.split("/")[1] ?? ""),
		description: (meta.description as string | null) ?? null,
		topics: (meta.topics as string[] | undefined) ?? [],
		language: (meta.language as string | null) ?? null,
		readme,
	};
}

type RepoResult = RepoItem & {
	keyword?: boolean;
	jev?: { p: number } | { error: string } | null;
	error?: string;
	inputTokens?: number | null;
};

async function judgeRepo(
	item: RepoItem,
	key: string | null,
): Promise<RepoResult> {
	let facts: Awaited<ReturnType<typeof repoFacts>>;
	try {
		facts = await repoFacts(item.fullName);
	} catch (e) {
		return { ...item, error: String(e).slice(0, 120) };
	}
	const keyword = STELLAR_SIGNAL.test(
		`${facts.name} ${facts.description ?? ""} ${facts.topics.join(" ")}`,
	);
	if (!key) return { ...item, keyword, jev: null };
	try {
		const r = await jevEvaluate(
			{
				repo: {
					fullName: item.fullName,
					description: facts.description,
					topics: facts.topics,
					language: facts.language,
				},
				readme: facts.readme || null,
			},
			REPO_QUESTIONS,
			{ apiKey: key, signal: AbortSignal.timeout(20_000) },
		);
		const a = r.answers.stellar;
		return {
			...item,
			keyword,
			jev:
				a.type === "boolean"
					? { p: a.probability }
					: { error: "not a boolean answer" },
			inputTokens: r.inputTokens,
		};
	} catch (e) {
		return { ...item, keyword, jev: { error: String(e).slice(0, 160) } };
	}
}

const jevP = (r: RepoResult) => (r.jev && "p" in r.jev ? r.jev.p : null);

async function reposTask(key: string | null) {
	const lines: string[] = [];
	const say = (x = "") => {
		lines.push(x);
		console.log(x);
	};
	const classes = REVIEW ? { none: LIMIT > 0 ? LIMIT : 200 } : REPO_SAMPLE;
	let items: RepoItem[] = [];
	for (const [proof, n] of Object.entries(classes))
		items.push(...(await repoClass(proof, n)));
	if (LIMIT > 0 && !REVIEW) items = items.slice(0, LIMIT);
	const results = await mapLimit(items, 6, (it) => judgeRepo(it, key));
	const read = results.filter((r) => !r.error);
	const tokens = read.reduce((n, r) => n + (r.inputTokens ?? 0), 0);
	say(`## Jev repo relevance (${REVIEW ? "review" : "eval"})`);
	say();
	say(
		`${items.length} repos; ${read.length} read from GitHub, ${results.length - read.length} could not be read.`,
	);
	say(
		key
			? `Jev: bar ${BAR}; ${tokens} input tokens, about $${((tokens / 1e6) * USD_PER_M_INPUT).toFixed(4)}.`
			: "Jev: could not check (AI_GATEWAY_API_KEY is not set). Keyword gate only.",
	);
	const jevYes = (r: RepoResult) => (jevP(r) ?? 0) >= BAR;
	const jevNo = (r: RepoResult) => {
		const p = jevP(r);
		return p !== null && p <= 1 - BAR;
	};
	say();
	if (!REVIEW) {
		const pos = (r: RepoResult) => PROVEN.includes(r.proof);
		const pct = (a: number, b: number) =>
			b ? `${Math.round((100 * a) / b)}%` : "n/a";
		const row = (
			name: string,
			yes: (r: RepoResult) => boolean,
			no: (r: RepoResult) => boolean,
		) => {
			let tp = 0;
			let fp = 0;
			let fn = 0;
			let undecided = 0;
			for (const r of read) {
				if (yes(r)) {
					if (pos(r)) tp++;
					else fp++;
				} else if (no(r)) {
					if (pos(r)) fn++;
				} else undecided++;
			}
			say(
				`| ${name} | ${tp} | ${fn} | ${fp} | ${undecided} | ${pct(tp, tp + fn)} | ${pct(tp, tp + fp)} |`,
			);
		};
		const proven = read.filter(pos).length;
		say(
			`Read: ${proven} with code proof of Stellar use, ${read.length - proven} scanned with none.`,
		);
		say();
		say(
			"| Reader | Found | Missed | False alarms | Undecided | Recall | Precision |",
		);
		say("| --- | --- | --- | --- | --- | --- | --- |");
		row(
			"Keyword gate (name, description, topics)",
			(r) => !!r.keyword,
			(r) => !r.keyword,
		);
		if (key) row("Jev (adds the README)", jevYes, jevNo);
	} else {
		const yes = read
			.filter(jevYes)
			.sort((a, b) => (jevP(b) ?? 0) - (jevP(a) ?? 0));
		const no = read.filter(jevNo).length;
		say(
			key
				? `Scanned repos with no Stellar proof: Jev reads ${yes.length} of ${read.length} as Stellar (possible scan misses) and ${no} as unrelated.`
				: `Scanned repos with no Stellar proof: the keyword gate matches ${read.filter((r) => r.keyword).length} of ${read.length}.`,
		);
		for (const r of yes.slice(0, 60))
			say(
				`- ${r.fullName}: Jev ${(jevP(r) ?? 0).toFixed(2)}${r.keyword ? ", keyword gate agrees" : ""}`,
			);
	}
	if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

// ── Task: sources ───────────────────────────────────────────────────────────

/** Passages per source per question: the multi-source call Raven makes. */
const PER_SOURCE = Number(arg("--per") ?? 4);
const TODAY = new Date().toISOString().slice(0, 10);

interface GoldenQuestion {
	id: string;
	mode: string;
	question: string;
	expect: {
		answerRegex?: string[];
		expectUrlIncludes?: string;
		top1UrlIncludes?: string;
	};
}

interface Passage {
	qid: string;
	question: string;
	rank: number;
	source: string;
	title: string;
	url: string;
	publishedAt: string | null;
	docVersionStatus: string | null;
	text: string;
	/** Baseline: how many of the question's answer patterns the passage hits. */
	answerHits: number;
	patterns: number;
	/** Baseline: the golden eval's junk rule. */
	junk: boolean;
	expected: boolean;
	answers?: number | null;
	substance?: number | null;
	currency?: { choice: string; p: number | null } | null;
	jevError?: string;
	inputTokens?: number;
}

async function researchRows(q: GoldenQuestion): Promise<Passage[]> {
	const u = `${BASE}/api/research?q=${encodeURIComponent(q.question)}&source=${RESEARCH_SOURCES.join(",")}&perSource=${PER_SOURCE}`;
	let res = await fetch(u);
	for (let t = 1; t <= 2 && res.status >= 500; t++) {
		await new Promise((r) => setTimeout(r, 3000 * t));
		res = await fetch(u);
	}
	if (!res.ok) throw new Error(`research ${q.id}: HTTP ${res.status}`);
	const rows =
		((await res.json()) as { results?: Array<Record<string, unknown>> })
			.results ?? [];
	const patterns = (q.expect.answerRegex ?? []).map((p) => new RegExp(p, "i"));
	const want = q.expect.top1UrlIncludes ?? q.expect.expectUrlIncludes ?? null;
	return rows.map((r, rank) => {
		const title = String(r.title ?? "");
		const text = String(r.content ?? "").slice(0, 1500);
		const url = String(r.url ?? "");
		return {
			qid: q.id,
			question: q.question,
			rank,
			source: String(r.source ?? ""),
			title,
			url,
			publishedAt: (r.publishedAt as string | null) ?? null,
			docVersionStatus: (r.docVersionStatus as string | null) ?? null,
			text,
			answerHits: patterns.filter((p) => p.test(`${title} ${text}`)).length,
			patterns: patterns.length,
			junk: JUNK_TITLE.test(title.trim()) || isThin(String(r.content ?? "")),
			expected: !!want && url.includes(want),
		};
	});
}

async function judgePassage(p: Passage, key: string): Promise<Passage> {
	try {
		const passage = { source: p.source, title: p.title, text: p.text };
		const [rel, qual] = await Promise.all([
			jevEvaluate({ question: p.question, passage }, RELEVANCE_QUESTIONS, {
				apiKey: key,
				signal: AbortSignal.timeout(20_000),
			}),
			jevEvaluate(
				{
					today: TODAY,
					passage: {
						...passage,
						url: p.url,
						publishedAt: p.publishedAt,
						versionStatus: p.docVersionStatus,
					},
				},
				QUALITY_QUESTIONS,
				{ apiKey: key, signal: AbortSignal.timeout(20_000) },
			),
		]);
		const a = rel.answers.answers;
		const s = qual.answers.substance;
		const c = qual.answers.currency;
		return {
			...p,
			answers: a.type === "score" ? a.score : null,
			substance: s.type === "boolean" ? s.probability : null,
			currency:
				c.type === "choice"
					? { choice: c.choice, p: choiceConfidence(c) }
					: null,
			inputTokens: (rel.inputTokens ?? 0) + (qual.inputTokens ?? 0),
		};
	} catch (e) {
		return { ...p, jevError: String(e).slice(0, 160) };
	}
}

async function sourcesTask(key: string | null) {
	const lines: string[] = [];
	const say = (x = "") => {
		lines.push(x);
		console.log(x);
	};
	const golden = JSON.parse(
		readFileSync(new URL("./golden-questions.json", import.meta.url), "utf8"),
	) as { questions: GoldenQuestion[] };
	let questions = golden.questions.filter((q) => q.mode === "research");
	if (LIMIT > 0) questions = questions.slice(0, LIMIT);
	const passages = (await mapLimit(questions, 4, researchRows)).flat();
	const judged = key
		? await mapLimit(passages, 8, (p) => judgePassage(p, key))
		: passages;
	const answered = judged.filter((p) => !p.jevError && p.answers != null);
	const tokens = judged.reduce((n, p) => n + (p.inputTokens ?? 0), 0);
	const pct = (a: number, b: number) =>
		b ? `${Math.round((100 * a) / b)}%` : "n/a";
	const confident = (p: number | null | undefined) =>
		p != null && p >= BAR ? "yes" : p != null && p <= 1 - BAR ? "no" : "?";

	say(`## Jev source scoring (${REVIEW ? "review" : "eval"})`);
	say();
	say(
		`${questions.length} golden research questions, ${PER_SOURCE} per source across ${RESEARCH_SOURCES.length} sources: ${passages.length} served passages.`,
	);
	say(
		key
			? `Jev: ${answered.length} scored, ${judged.length - answered.length} failed; bar ${BAR}; ${tokens} input tokens, about $${((tokens / 1e6) * USD_PER_M_INPUT).toFixed(4)}.`
			: "Jev: could not check (AI_GATEWAY_API_KEY is not set). Baseline columns only: answer patterns and the golden junk rule.",
	);
	const firstError = judged.find((p) => p.jevError);
	if (firstError) say(`First Jev error: ${firstError.jevError}`);
	say();

	if (!REVIEW) {
		const bySource = new Map<string, Passage[]>();
		for (const p of judged)
			bySource.set(p.source, [...(bySource.get(p.source) ?? []), p]);
		say(
			key
				? "| Source | Passages | Hit an answer pattern | Junk rule | Jev answers (0-3) | Jev substantive | Jev outdated or maybe |"
				: "| Source | Passages | Hit an answer pattern | Junk rule |",
		);
		say(
			key
				? "| --- | --- | --- | --- | --- | --- | --- |"
				: "| --- | --- | --- | --- |",
		);
		for (const [source, ps] of [...bySource].sort((a, b) =>
			a[0].localeCompare(b[0]),
		)) {
			const base = `| ${source} | ${ps.length} | ${pct(ps.filter((p) => p.patterns && p.answerHits > 0).length, ps.filter((p) => p.patterns).length)} | ${pct(ps.filter((p) => p.junk).length, ps.length)} |`;
			if (!key) {
				say(base);
				continue;
			}
			const scored = ps.filter((p) => p.answers != null);
			const mean = scored.length
				? (
						scored.reduce((n, p) => n + (p.answers ?? 0), 0) / scored.length
					).toFixed(2)
				: "n/a";
			const sub = ps.filter((p) => confident(p.substance) !== "?");
			const cur = ps.filter((p) => p.currency && (p.currency.p ?? 0) >= BAR);
			const stale = cur.filter(
				(p) =>
					p.currency?.choice !== "current" && p.currency?.choice !== "unclear",
			);
			say(
				`${base} ${mean} | ${pct(sub.filter((p) => confident(p.substance) === "yes").length, sub.length)} | ${pct(stale.length, cur.length)} |`,
			);
		}
		if (key) {
			say();
			// Calibration: the 12 questions that name the document that should answer.
			const exp = answered.filter((p) => p.expected);
			say(
				`Calibration: ${exp.length} served passages are a question's expected document; Jev scores ${exp.filter((p) => (p.answers ?? 0) >= 2).length} of them as answering (2 or 3).`,
			);
			const junkAgree = answered.filter((p) => confident(p.substance) !== "?");
			say(
				`Junk: the golden rule and Jev agree on ${junkAgree.filter((p) => p.junk === (confident(p.substance) === "no")).length} of ${junkAgree.length} passages Jev decided.`,
			);
			say();
			say(
				"Questions where our first passage does not answer but a lower one does:",
			);
			const byQ = new Map<string, Passage[]>();
			for (const p of answered) byQ.set(p.qid, [...(byQ.get(p.qid) ?? []), p]);
			for (const [qid, ps] of byQ) {
				const top = ps.find((p) => p.rank === 0);
				const best = [...ps].sort(
					(a, b) => (b.answers ?? 0) - (a.answers ?? 0),
				)[0];
				if (top && best && (top.answers ?? 0) <= 1 && (best.answers ?? 0) === 3)
					say(
						`- ${qid}: first "${top.title.slice(0, 50)}" (${top.source}) scores ${top.answers}; "${best.title.slice(0, 50)}" (${best.source}, rank ${best.rank + 1}) scores 3`,
					);
			}
		}
	} else {
		say(
			key
				? "Passages Jev reads as not substantive or as outdated, for a human look:"
				: "Passages the golden junk rule flags:",
		);
		const flagged = key
			? answered.filter(
					(p) =>
						confident(p.substance) === "no" ||
						(p.currency &&
							(p.currency.p ?? 0) >= BAR &&
							p.currency.choice === "outdated"),
				)
			: judged.filter((p) => p.junk);
		const seen = new Set<string>();
		for (const p of flagged) {
			if (seen.has(p.url)) continue;
			seen.add(p.url);
			say(
				`- ${p.source}: "${p.title.slice(0, 60)}"${p.publishedAt ? ` (${p.publishedAt.slice(0, 10)})` : ""}${key ? ` substance=${confident(p.substance)} currency=${p.currency?.choice ?? "?"}` : ""} ${p.url}`,
			);
		}
		say();
		say(`${seen.size} distinct documents flagged.`);
	}
	if (OUT) writeFileSync(OUT, JSON.stringify(judged, null, 1));
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

async function main() {
	const key = jevKey();
	if (TASK === "sources") return sourcesTask(key);
	if (TASK === "repos") return reposTask(key);
	const projects = await loadProjects();
	if (TASK === "types") return typesTask(projects, key);
	let items = REVIEW ? reviewItems(projects) : evalItems(projects);
	if (LIMIT > 0) items = items.slice(0, LIMIT);
	const results = await mapLimit(items, 8, (it) => judge(it, key));
	const read = results.filter((r) => r.read === "ok");
	const jevErrors = read.filter((r) => r.jev && "error" in r.jev);
	const tokens = read.reduce((s, r) => s + (r.inputTokens ?? 0), 0);

	const lines: string[] = [];
	const say = (s = "") => {
		lines.push(s);
		console.log(s);
	};
	say(`## Jev page verdicts (${REVIEW ? "review" : "eval"})`);
	say();
	say(
		`${items.length} pages from ${projects.size} published rows; ${read.length} read, ${results.length - read.length} could not be read (no verdict either way).`,
	);
	say(
		key
			? `Jev: ${read.length - jevErrors.length} answered, ${jevErrors.length} failed; bar ${BAR}; ${tokens} input tokens, about $${((tokens / 1e6) * USD_PER_M_INPUT).toFixed(4)}.`
			: "Jev: could not check (AI_GATEWAY_API_KEY is not set). Regex baseline only.",
	);
	if (jevErrors.length)
		say(`First Jev error: ${(jevErrors[0].jev as { error: string }).error}`);
	say();

	if (!REVIEW) {
		const labeled = read.filter((r) => r.label);
		const pos = labeled.filter((r) => r.label === "not-product").length;
		say(
			`Labeled and read: ${labeled.length} (${pos} not-product, ${labeled.length - pos} product).`,
		);
		say();
		say("| Reader | Caught | Missed | False alarms | Recall | Precision |");
		say("| --- | --- | --- | --- | --- | --- |");
		const readers: Array<[string, (r: Result) => boolean]> = [
			["Regex (classifyPage)", regexSays],
		];
		if (key)
			readers.push(
				["Jev", jevSays],
				["Regex hard patterns, Jev decides the rest", combinedSays],
			);
		for (const [name, f] of readers) {
			const s = score(labeled, f);
			say(
				`| ${name} | ${s.tp} | ${s.fn} | ${s.fp} | ${s.recall} | ${s.precision} |`,
			);
		}
		say();
		say(
			"Disagreements with the label (check the page before calling either one wrong):",
		);
		for (const r of labeled) {
			const hit = key ? combinedSays(r) : regexSays(r);
			if (hit === (r.label === "not-product")) continue;
			const j =
				r.jev && "kind" in r.jev
					? `jev=${r.jev.kind}${r.jev.p !== null ? `@${r.jev.p.toFixed(2)}` : ""}`
					: "jev=-";
			say(
				`- ${r.slug}: label ${r.label} (${r.labelSource}); regex=${r.regex?.verdict}; ${j}; ${r.url} "${(r.title ?? "").slice(0, 60)}"`,
			);
		}
	} else {
		const flagged = read.filter((r) => (key ? combinedSays(r) : regexSays(r)));
		say(
			`Flagged for a human look: ${flagged.length} of ${read.length} weak-basis Live rows.`,
		);
		for (const r of flagged) {
			const j =
				r.jev && "kind" in r.jev
					? `jev=${r.jev.kind}${r.jev.p !== null ? `@${r.jev.p.toFixed(2)}` : ""}`
					: "jev=-";
			say(
				`- ${r.slug}: regex=${r.regex?.verdict}${r.regex?.reason ? ` (${r.regex.reason})` : ""}; ${j}; ${r.url} "${(r.title ?? "").slice(0, 60)}"`,
			);
		}
	}
	if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
	if (process.env.GITHUB_STEP_SUMMARY)
		appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

main().catch((e) => {
	console.error(`INCONCLUSIVE: ${e instanceof Error ? e.message : e}`);
	process.exit(2);
});
