/**
 * Verification packets — evidence bundles for bulk human verification of
 * app-only weak-basis Live rows. READ-ONLY: the public API plus each
 * project's own website. No DB credentials, no writes, ever.
 *
 *   pnpm exec tsx scripts/data/verification-packets.ts [--limit 60] [--offset 0]
 *
 * WHY. The quality board's strongBasis row: ~800 Live rows rest on a weak
 * basis (site-liveness / source-inherited / unverified) and most have no
 * on-chain footprint (no issued asset, no joined contract, no known
 * deployment), so the ONLY path to a strong basis is a human reading the
 * evidence. Humans verify fast when handed a packet and asked yes/no; they
 * never verify a bare list of 780 slugs. This script writes the packet:
 * one row per project with the site, code, SCF and corpus evidence, plus a
 * purely mechanical PROPOSAL the owner accepts or rejects.
 *
 * Output: improvements/quality/verification-packets-<date>[-o<offset>].{json,md}
 * (the .md header says how an approval is applied — see APPLY below).
 */

import { mkdirSync, writeFileSync } from "node:fs";

const ORIGIN = "https://stellarlight.xyz";
/** Same browser UA scripts/verify-claims.ts uses for external sites. */
const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
const API_UA = { "User-Agent": "stellarlight-verification-packets" };
const TIMEOUT_MS = 15_000;
const CONCURRENCY = 4;
const DAY_MS = 86_400_000;

const argNum = (flag: string, dflt: number) => {
	const i = process.argv.indexOf(flag);
	return i > 0 ? Number(process.argv[i + 1]) : dflt;
};
const LIMIT = argNum("--limit", 60);
const OFFSET = argNum("--offset", 0);

type Row = {
	slug: string;
	name: string;
	status?: string;
	statusBasis?: string;
	statusAsOf?: string;
	statusSourceUrl?: string;
	prominence?: number;
	links?: { website?: string } | null;
	deployment?: { network?: string | null } | null;
	onchain?: { assetCode?: string | null; contracts?: unknown[] | null } | null;
	scf?: {
		awarded?: boolean;
		awardedRounds?: number[];
		sourceUrl?: string;
	} | null;
};
type Repo = {
	lastCommitAt?: string | null;
	isArchived?: boolean;
	activitySignals?: { lastReleaseAt?: string | null } | null;
};
type ResearchHit = {
	title?: string;
	url?: string;
	content?: string;
	publishedAt?: string | null;
};

type Site = {
	url: string | null;
	finalUrl: string | null;
	status: number;
	title: string | null;
	description: string | null;
	/** the name or distinctive token found on the page, or null */
	namesProduct: string | null;
	/** the pre-launch phrase found on the page, or null (reported, not judged) */
	prelaunch: string | null;
};
type Code = {
	repos: number;
	newestCommit: string | null;
	newestRelease: string | null;
	archived: number;
};
type Corpus = { date: string | null; url: string | null; title: string | null };
type Proposal =
	| "confirm-live"
	| "pre-launch?"
	| "stale?"
	| "site-down?"
	| "review";
type Packet = {
	slug: string;
	name: string;
	prominence: number;
	statusNow: {
		status: string | null;
		basis: string | null;
		asOf: string | null;
		sourceUrl: string | null;
	};
	site: Site;
	code: Code;
	scf: { awarded: boolean; rounds: number[]; sourceUrl: string | null };
	corpus: Corpus;
	proposal: Proposal;
	reason: string;
};

const PROPOSALS: Proposal[] = [
	"confirm-live",
	"pre-launch?",
	"stale?",
	"site-down?",
	"review",
];
const PRELAUNCH = /\b(coming soon|waitlist|pre-?launch|testnet)\b/i;
/** Name tokens too common to prove a page is about THIS product. */
const GENERIC = new Set([
	"stellar",
	"soroban",
	"wallet",
	"protocol",
	"network",
	"finance",
	"crypto",
	"digital",
	"global",
	"exchange",
	"capital",
	"payments",
	"platform",
	"project",
	"token",
	"official",
	"solutions",
	"technologies",
]);

/** Full name first, then each distinctive token (≥5 chars, not generic). */
function nameTokens(name: string): string[] {
	const lower = name.toLowerCase().trim();
	const toks = lower
		.split(/[^a-z0-9]+/)
		.filter((t) => t.length >= 5 && !GENERIC.has(t));
	return [lower, ...toks];
}

/** Our own API: census pages are ~2.4 MB, so double the site budget, and
 * one retry so a slow moment does not sink a 60-row run. */
const api = async <T>(path: string, attempt = 1): Promise<T> => {
	try {
		return (
			await fetch(`${ORIGIN}${path}`, {
				headers: API_UA,
				signal: AbortSignal.timeout(2 * TIMEOUT_MS),
			})
		).json() as Promise<T>;
	} catch (e) {
		if (attempt < 2) {
			await new Promise((r) => setTimeout(r, 1_500));
			return api<T>(path, attempt + 1);
		}
		throw e;
	}
};

const isAppOnly = (r: Row) =>
	!r.onchain?.assetCode &&
	!r.onchain?.contracts?.length &&
	!["mainnet", "testnet"].includes(r.deployment?.network ?? "");

/** Every weak-basis Live row with no on-chain footprint, prominence desc
 * (slug asc on ties so --offset pages are stable across runs). */
async function weakAppOnlyRows(): Promise<Row[]> {
	const rows: Row[] = [];
	for (let page = 1; page <= 50; page++) {
		const qs = new URLSearchParams({
			"where[status][equals]": "Live",
			"where[statusBasis][in]": "site-liveness,source-inherited,unverified",
			limit: "200",
			depth: "0",
			page: String(page),
		});
		const d = await api<{ docs?: Row[]; hasNextPage?: boolean }>(
			`/api/projects?${qs}`,
		);
		rows.push(...(d.docs ?? []));
		if (!d.hasNextPage || !d.docs?.length) break;
	}
	return rows
		.filter(isAppOnly)
		.sort(
			(a, b) =>
				(b.prominence ?? 0) - (a.prominence ?? 0) ||
				a.slug.localeCompare(b.slug),
		);
}

/** One GET with the browser UA (the body is always needed, so HEAD would be
 * a wasted round trip); one retry on transport failure like verify-claims. */
async function get(url: string, attempt = 1): Promise<Response | null> {
	try {
		return await fetch(url, {
			redirect: "follow",
			headers: { "user-agent": BROWSER_UA, accept: "text/html,*/*" },
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		if (attempt < 2) {
			await new Promise((r) => setTimeout(r, 1_500));
			return get(url, attempt + 1);
		}
		return null;
	}
}

const stripHtml = (html: string) =>
	html
		.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

/** The handful of entities that show up in titles; enough for a table cell. */
const decode = (s: string) =>
	s
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ");

async function probeSite(row: Row): Promise<Site> {
	const url = row.links?.website ?? null;
	const empty: Site = {
		url,
		finalUrl: null,
		status: 0,
		title: null,
		description: null,
		namesProduct: null,
		prelaunch: null,
	};
	if (!url) return empty;
	const res = await get(url);
	if (!res) return empty;
	const html = (await res.text().catch(() => "")).slice(0, 65_536);
	const rawTitle = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
	const title = rawTitle ? decode(rawTitle.replace(/\s+/g, " ").trim()) : null;
	const rawDesc =
		(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i.exec(
			html,
		) ??
			/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i.exec(
				html,
			))?.[1];
	const description = rawDesc ? decode(rawDesc.trim()) : null;
	const text = decode(stripHtml(html));
	const haystack = `${text} ${description ?? ""}`.toLowerCase();
	return {
		url,
		finalUrl: res.url,
		status: res.status,
		title,
		description,
		namesProduct:
			nameTokens(row.name).find((t) => haystack.includes(t)) ?? null,
		prelaunch: PRELAUNCH.exec(text)?.[0] ?? null,
	};
}

/** ISO strings sort lexicographically = chronologically. */
const newest = (xs: (string | null | undefined)[]) =>
	xs
		.filter((x): x is string => !!x)
		.sort()
		.at(-1) ?? null;

async function probeCode(slug: string): Promise<Code> {
	const qs = new URLSearchParams({
		"where[projectSlug][equals]": slug,
		limit: "10",
		depth: "0",
	});
	const d = await api<{ totalDocs?: number; docs?: Repo[] }>(
		`/api/repos?${qs}`,
	).catch(() => ({ totalDocs: 0, docs: [] as Repo[] }));
	const docs = d.docs ?? [];
	return {
		repos: d.totalDocs ?? docs.length,
		newestCommit: newest(docs.map((r) => r.lastCommitAt)),
		newestRelease: newest(docs.map((r) => r.activitySignals?.lastReleaseAt)),
		archived: docs.filter((r) => r.isArchived).length,
	};
}

/** Newest DATED research item that actually names the product. Whole name,
 * case-sensitive: a vector neighbour that never mentions the name is not a
 * mention, and neither is "reclaim" the verb in a claimable-balances guide. */
async function probeCorpus(name: string): Promise<Corpus> {
	const d = await api<{ results?: ResearchHit[] }>(
		`/api/research?q=${encodeURIComponent(name)}&limit=3`,
	).catch(() => ({ results: [] as ResearchHit[] }));
	const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	// ponytail: short single-word names (Reclaim, Hubble) match case-sensitively
	// so English homographs don't count; longer or multi-word names match
	// case-insensitively (Moneygram vs the docs' "MoneyGram"). A stoplist
	// beats this if the homograph class grows.
	const named = new RegExp(
		`(^|\\W)${escaped}(\\W|$)`,
		name.length >= 8 || /\s/.test(name.trim()) ? "i" : "",
	);
	const top = (d.results ?? [])
		.filter(
			(r): r is ResearchHit & { publishedAt: string } =>
				!!r.publishedAt && named.test(`${r.title} ${r.content}`),
		)
		.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1))[0];
	return top
		? { date: top.publishedAt, url: top.url ?? null, title: top.title ?? null }
		: { date: null, url: null, title: null };
}

const ageDays = (iso: string | null) =>
	iso ? Math.round((Date.now() - Date.parse(iso)) / DAY_MS) : Infinity;

/** Purely mechanical; stated as a proposal, never applied here. */
function propose(
	site: Site,
	code: Code,
	corpus: Corpus,
): { proposal: Proposal; reason: string } {
	const commit = ageDays(code.newestCommit);
	const release = ageDays(code.newestRelease);
	const mention = ageDays(corpus.date);
	const signals = [
		commit <= 180 && `commit ${commit}d ago`,
		release <= 365 && `release ${release}d ago`,
		mention <= 180 && `corpus mention ${mention}d ago`,
	].filter((s): s is string => !!s);
	const http = site.url
		? `HTTP ${site.status || "0 (transport failure)"}`
		: "no website on the row";
	if (
		site.status === 200 &&
		site.namesProduct &&
		signals.length &&
		!site.prelaunch
	)
		return {
			proposal: "confirm-live",
			reason: `site 200 names "${site.namesProduct}"; ${signals.join(", ")}`,
		};
	if (site.prelaunch)
		return {
			proposal: "pre-launch?",
			reason: `${http}; page carries "${site.prelaunch}"`,
		};
	if (site.status === 200 && Math.min(commit, release, mention) > 365)
		return {
			proposal: "stale?",
			reason: `site 200 but no code/corpus signal within 365d${site.namesProduct ? "" : "; page does not name the product"}`,
		};
	if (site.status !== 200) return { proposal: "site-down?", reason: http };
	return {
		proposal: "review",
		reason: site.namesProduct
			? `site 200 names "${site.namesProduct}" but freshest signal is ${Math.min(commit, release, mention)}d old`
			: `site 200 but page does not name the product${signals.length ? ` (${signals.join(", ")})` : ""}`,
	};
}

async function packet(row: Row): Promise<Packet> {
	// Probes run in sequence so the pool's 4 workers = 4 in-flight fetches.
	const site = await probeSite(row);
	const code = await probeCode(row.slug);
	const corpus = await probeCorpus(row.name);
	return {
		slug: row.slug,
		name: row.name,
		prominence: row.prominence ?? 0,
		statusNow: {
			status: row.status ?? null,
			basis: row.statusBasis ?? null,
			asOf: row.statusAsOf ?? null,
			sourceUrl: row.statusSourceUrl ?? null,
		},
		site,
		code,
		scf: {
			awarded: !!row.scf?.awarded,
			rounds: row.scf?.awardedRounds ?? [],
			sourceUrl: row.scf?.sourceUrl ?? null,
		},
		corpus,
		...propose(site, code, corpus),
	};
}

async function pool<T, R>(
	items: T[],
	n: number,
	fn: (t: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: n }, async () => {
			for (let i = next++; i < items.length; i = next++)
				out[i] = await fn(items[i]);
		}),
	);
	return out;
}

// ── Markdown ────────────────────────────────────────────────────────────────

const APPLY = `## How an approval is applied

Nothing in this file touched the database. The owner marks slugs approved; a
curator adds each to \`STATUS_FIX\` in \`scripts/data/curation-maps.ts\`:

\`\`\`ts
"<slug>": {
	from: "Live",
	to: "Live",
	basis: "human-verified",
	asOf: "<date the owner read the packet>",
	sourceUrl: "<site URL from the packet>",
	note: "<packet reason, short and dated>",
},
\`\`\`

This works today — verified against the curate loop ("Status fixes
(from-guarded)" in \`scripts/data/curate-projects.ts\`): the only skip is
\`d.status !== fix.from\`, so a \`Live → Live\` entry passes and writes
\`statusBasis\`, \`statusAsOf\` and \`statusSourceUrl\` alongside a no-op status.
It is the existing pattern — the 2026-08-28 sourced-queue pass stamped benji,
friendbot, warmancer, wisdomtree, stellar-laboratory, hana and liquify exactly
this way ("from==to entries move nothing; they fix the evidence").

Things to know before adding rows:

- \`note\` lands in \`lifecycle.note\` only when the row has none, and agents
  quote it verbatim — keep it one factual, dated sentence.
- A human-verified Live entry with a \`sourceUrl\` is re-scanned for pre-launch
  markers at apply time and WARNS on a hit (never refuses) — the human owns
  the contradiction, so read a \`pre-launch?\` packet before approving it.
- Being in \`STATUS_FIX\` makes the slug own \`status\` (\`curatedFieldsFor\`), so
  the nightly lumenloop sync can no longer write the seed label back.
- \`from === to\` rows never retire; they re-apply idempotently on every run.
- Apply via \`.github/workflows/curate-projects.yml\` (dry-run first, then
  \`execute\`), then read the row back off \`/api/projects\`.
- Optional receipt: \`pnpm exec tsx scripts/data/capture-receipt.ts <slug> <url> [marker...]\`
  writes \`improvements/receipts/<slug>-<date>.json\` so "verified on <date>"
  is re-checkable later.

Proposals are mechanical: \`confirm-live\` = site 200 + page names the product
+ (commit ≤ 180d or release ≤ 365d or corpus mention ≤ 180d) + no pre-launch
phrase; \`pre-launch?\` = page carries coming soon / waitlist / pre-launch /
testnet; \`stale?\` = site 200 but no code/corpus signal within 365d;
\`site-down?\` = not HTTP 200 (or no website); \`review\` = everything else.
`;

const cell = (s: string | null | undefined) =>
	(s ?? "—").replace(/\|/g, "\\|").replace(/\s+/g, " ");
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const clip = (s: string | null, n: number) =>
	s && s.length > n ? `${s.slice(0, n - 1)}…` : s;

function mdRow(p: Packet): string {
	const site = p.site.url
		? `${p.site.status || "ERR"}${p.site.title ? ` · ${clip(p.site.title, 50)}` : ""}`
		: "no website";
	const corpus = p.corpus.date
		? `[${day(p.corpus.date)}](${p.corpus.url ?? ""})`
		: "—";
	return `| ${[
		`[${p.slug}](${ORIGIN}/project/${p.slug})`,
		cell(p.name),
		cell(site),
		p.site.namesProduct ? `yes (${cell(p.site.namesProduct)})` : "no",
		day(p.code.newestCommit) + (p.code.repos ? ` (${p.code.repos}r)` : ""),
		day(p.code.newestRelease),
		p.scf.rounds.length ? p.scf.rounds.join(",") : "—",
		corpus,
		p.proposal,
		cell(p.reason),
	].join(" | ")} |`;
}

function markdown(packets: Packet[], date: string, total: number): string {
	const counts = PROPOSALS.map(
		(k) => `${k} ${packets.filter((p) => p.proposal === k).length}`,
	);
	const histogram = `${packets.length} rows · ${counts.join(" · ")}`;
	const head =
		"| slug | name | site | names-product? | newest commit | release | SCF rounds | corpus | proposal | reason |\n|---|---|---|---|---|---|---|---|---|---|";
	const groups = PROPOSALS.flatMap((k) => {
		const rows = packets.filter((p) => p.proposal === k);
		const out: string[] = [];
		for (let i = 0; i < rows.length; i += 20) {
			const chunk = rows.slice(i, i + 20);
			out.push(
				`### ${k} (${i + 1}–${i + chunk.length} of ${rows.length})\n\n${head}\n${chunk.map(mdRow).join("\n")}\n`,
			);
		}
		return out;
	});
	return [
		`# Verification packets — ${date}`,
		"",
		`${packets.length} of ${total} app-only Live rows on a weak basis (site-liveness / source-inherited / unverified), prominence desc, batch offset ${OFFSET} limit ${LIMIT}. Generated by \`scripts/data/verification-packets.ts\` from the public API and each project's own website — read-only. Evidence is reported, not judged; the proposal column is a mechanical suggestion for a bulk yes/no.`,
		"",
		APPLY,
		"## Packets",
		"",
		...groups,
		histogram,
		"",
	].join("\n");
}

// ── main ────────────────────────────────────────────────────────────────────

const all = await weakAppOnlyRows();
const batch = all.slice(OFFSET, OFFSET + LIMIT);
console.log(
	`${all.length} app-only weak-basis Live rows; packeting ${batch.length} (offset ${OFFSET}, limit ${LIMIT})`,
);
const packets = await pool(batch, CONCURRENCY, async (row) => {
	const p = await packet(row);
	console.log(`  ${p.slug}: ${p.proposal} — ${p.reason}`);
	return p;
});

const date = new Date().toISOString().slice(0, 10);
const stem = `improvements/quality/verification-packets-${date}${OFFSET ? `-o${OFFSET}` : ""}`;
mkdirSync("improvements/quality", { recursive: true });
writeFileSync(
	`${stem}.json`,
	`${JSON.stringify({ generatedAt: new Date().toISOString(), population: all.length, offset: OFFSET, limit: LIMIT, packets }, null, 1)}\n`,
);
const md = markdown(packets, date, all.length);
writeFileSync(`${stem}.md`, md);
console.log(`\n${md.trimEnd().split("\n").at(-1)}\n→ ${stem}.md / .json`);
