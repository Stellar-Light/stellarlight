/**
 * Jev page verdicts, measured before they are trusted.
 *
 * classifyPage (src/lib/page-verdict.ts) is a deliberately conservative regex
 * pass: it settles the unambiguous pages (parked, spam, scaffold, off-site
 * redirect) and calls everything else "product" or "unknown". Jev reads the
 * same page against the project record and answers the question the regex
 * leaves open: is this the product, or something else wearing its domain?
 *
 *   --eval    (default) pages a human already judged: websites removed from a
 *             row as taken over or parked, rows retired for a site-level
 *             reason, and rows a human confirmed Live. Prints recall and
 *             precision for the regex alone, Jev alone and both together,
 *             and lists every disagreement with the label for a human look
 *             (a label is dated; the site may have changed since).
 *   --review  Live rows whose status rests on a weak basis. Lists the ones
 *             either reader calls not the product. Nothing is written.
 *
 * Read-only: the public API, the public pages and the gateway. No database.
 * Without AI_GATEWAY_API_KEY the Jev column reads could-not-check and only
 * the regex baseline is measured.
 *
 *   pnpm exec tsx scripts/eval/jev-page-verdict.ts [--review] [--limit N] [--bar 0.9] [--out file.json]
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { jevEvaluate, jevKey } from "../../src/lib/jev";
import {
	classifyPage,
	JEV_NON_PRODUCT,
	jevPageReading,
	NON_PRODUCT_VERDICTS,
	PAGE_QUESTIONS,
	pageJevState,
	readPage,
} from "../../src/lib/page-verdict";
import { STATUS_FIX, WEBSITE_REMOVE } from "../data/curation-maps";

const args = process.argv.slice(2);
const arg = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
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
}

async function loadProjects(): Promise<Map<string, Row>> {
	const out = new Map<string, Row>();
	for (const status of STATUSES) {
		for (let offset = 0; ; offset += 100) {
			const u = `${BASE}/api/projects/search?status=${encodeURIComponent(status)}&limit=100&offset=${offset}&fields=slug,name,status,statusBasis,shortDescription,links`;
			const res = await fetch(u);
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

async function main() {
	const key = jevKey();
	const projects = await loadProjects();
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
