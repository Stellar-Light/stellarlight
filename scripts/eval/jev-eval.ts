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
 *
 *   --eval    (default) score against the labels and list every disagreement
 *             for a human look (a label is dated; the row may have changed).
 *   --review  page: weak-basis Live rows either reader calls not the product.
 *             types: published rows where Jev confidently disagrees with the
 *             stored types. Nothing is written in either mode.
 *
 * Read-only: the public API, the public pages and the gateway. No database.
 * Without AI_GATEWAY_API_KEY the Jev column reads could-not-check: the page
 * task still measures the regex baseline, the types task has none.
 *
 *   pnpm exec tsx scripts/eval/jev-eval.ts [--task page|types] [--review] [--limit N] [--bar 0.9] [--out file.json]
 */
import { appendFileSync, writeFileSync } from "node:fs";
import {
	type JevAnswer,
	type JevQuestion,
	jevEvaluate,
	jevKey,
} from "../../src/lib/jev";
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
import {
	STATUS_FIX,
	TYPES_ADD,
	TYPES_SET,
	WEBSITE_REMOVE,
} from "../data/curation-maps";

const args = process.argv.slice(2);
const arg = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const TASK = arg("--task") ?? "page";
if (TASK !== "page" && TASK !== "types")
	throw new Error(`--task must be page or types, got ${TASK}`);
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

async function main() {
	const key = jevKey();
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
