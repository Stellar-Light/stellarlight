/**
 * Engine B (corpus) — research-corpus consistency sweeps.
 *
 *   pnpm exec tsx scripts/eval/engine-b-corpus.ts [--json] [--out=path]
 *
 * The R2 wave found its defect classes (junk crawl artifacts, garbage
 * titles, null publishedAt, mirrored chunks) by MANUAL audit — these sweeps
 * make them permanent guards. DB-backed (research-docs has no public listing
 * endpoint), read-only, report-only. Runs weekly beside Engines A/B/D.
 *
 * Sweeps:
 *   S5 JUNK-URL regression — rows matching the same JUNK_URL_RE the ranker
 *      drops and the ingester excludes. Post-prune this must be 0; anything
 *      here means a crawl regression (class 26).
 *   S6 TITLE quality — titles that are bare dates, body fragments (start
 *      lowercase), overlong sentences, or empty (class: cap-0066's
 *      'First, append as many archived keys…').
 *   S7 PUBLISHEDAT coverage + freshness stall — % dated per source, and
 *      per-source newest-chunk age so a silently-stalled ingest shows up
 *      (time-sensitive sources only; evergreen specs don't stall).
 *   S8 MIRRORED content — identical contentHash under >1 distinct URL
 *      (the recap-served-3× class; rank-time collapse hides it, this
 *      finds it at the source).
 */
import { writeFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import { JUNK_URL_RE } from "../../src/lib/research-rank";
import configPromise from "../../src/payload.config";

const JSON_OUT = process.argv.includes("--json");
const OUT_FILE = process.argv
	.find((x) => x.startsWith("--out="))
	?.slice("--out=".length);

/**
 * Sources whose content is time-sensitive — a stalled ingest is a defect.
 * Calibrated against real cadence. ec-developer-report is NOT here: its
 * GitHub source is an archival repo (newest PDF = the 2023 geography
 * analysis); EC moved publication to developerreport.com — tracked as a
 * new-source work item, not a stall.
 */
const FRESHNESS_EXPECTATIONS_DAYS: Record<string, number> = {
	"sdf-blog": 30,
	"lumenloop-research": 30,
};

const BARE_DATE_RE = /^(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\w+ \d{1,2}, \d{4})$/;

/**
 * Evidence-calibrated (first live run): 'starts-lowercase' false-positived
 * on CLI/RPC reference pages whose titles ARE lowercase identifiers
 * ('tx sign and tx send', 'request_trust'); meeting recaps are inherently
 * date-titled. A real body-fragment title reads like a SENTENCE.
 */
function titleIssue(title: string, url: string): string | null {
	const t = (title ?? "").trim();
	if (!t) return "empty";
	if (BARE_DATE_RE.test(t) && !/\/meetings\//.test(url)) return "bare-date";
	if (t.length > 110) return "overlong (sentence, not a title)";
	if (/[.!?]$/.test(t) || t.split(/\s+/).length > 9)
		return "sentence-like (body fragment?)";
	return null;
}

async function main() {
	console.error("Engine B (corpus) — research-docs sweeps");
	const payload = await getPayload({ config: await configPromise });
	const rows: Array<{
		url: string;
		title?: string;
		source: string;
		publishedAt?: string | null;
		contentHash?: string;
		chunkIndex?: number;
		createdAt: string;
	}> = [];
	for (let page = 1; ; page++) {
		const r = await payload.find({
			collection: "research-docs",
			limit: 2000,
			page,
			depth: 0,
			select: {
				url: true,
				title: true,
				source: true,
				publishedAt: true,
				contentHash: true,
				chunkIndex: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: narrow select shape
		rows.push(...(r.docs as any[]));
		if (!r.hasNextPage) break;
	}
	console.error(`  frame: ${rows.length} chunks`);

	// ── S5 junk-URL regression ──
	const junk = rows.filter((r) => JUNK_URL_RE.test(r.url));
	const junkUrls = [...new Set(junk.map((r) => r.url))];

	// ── S6 title quality (per parent doc, not per chunk — one bad title
	// repeats across every chunk of the doc) ──
	const byDoc = new Map<string, (typeof rows)[number]>();
	for (const r of rows) if (!byDoc.has(r.url)) byDoc.set(r.url, r);
	const badTitles: Array<{
		url: string;
		source: string;
		title: string;
		issue: string;
	}> = [];
	for (const d of byDoc.values()) {
		const issue = titleIssue(d.title ?? "", d.url);
		if (issue)
			badTitles.push({
				url: d.url,
				source: d.source,
				title: (d.title ?? "").slice(0, 80),
				issue,
			});
	}

	// ── S7 publishedAt coverage + freshness stall ──
	const bySource = new Map<string, (typeof rows)[number][]>();
	for (const r of rows) {
		const arr = bySource.get(r.source) ?? [];
		arr.push(r);
		bySource.set(r.source, arr);
	}
	const now = Date.now();
	const coverage: Record<
		string,
		{
			chunks: number;
			datedPct: number;
			newestAgeDays: number | null;
			stalled: boolean;
			undated: boolean;
		}
	> = {};
	for (const [source, list] of bySource) {
		const dated = list.filter((r) => r.publishedAt);
		const newest = dated
			.map((r) => new Date(r.publishedAt as string).getTime())
			.filter(Number.isFinite)
			.sort((a, b) => b - a)[0];
		const newestAgeDays = newest
			? Math.round((now - newest) / 86_400_000)
			: null;
		const expect = FRESHNESS_EXPECTATIONS_DAYS[source];
		// undated ≠ stalled: lumenloop's chunks carry NO publishedAt at all
		// (an extraction gap of the R2 class) — freshness is UNMEASURABLE
		// there, which is its own finding, not a stall verdict.
		const undated = dated.length === 0;
		coverage[source] = {
			chunks: list.length,
			datedPct: Math.round((dated.length / list.length) * 100),
			newestAgeDays,
			undated,
			stalled:
				expect !== undefined &&
				!undated &&
				newestAgeDays !== null &&
				newestAgeDays > expect,
		};
	}

	// ── S8 mirrored content (same hash, >1 distinct URL) ──
	const byHash = new Map<string, Set<string>>();
	for (const r of rows) {
		if (!r.contentHash) continue;
		const set = byHash.get(r.contentHash) ?? new Set<string>();
		set.add(r.url);
		byHash.set(r.contentHash, set);
	}
	const mirrors = [...byHash.entries()]
		.filter(([, urls]) => urls.size > 1)
		.map(([hash, urls]) => ({ hash: hash.slice(0, 12), urls: [...urls] }));

	const report = {
		frame: { chunks: rows.length, docs: byDoc.size },
		s5_junk_urls: { count: junkUrls.length, sample: junkUrls.slice(0, 10) },
		s6_bad_titles: {
			count: badTitles.length,
			byIssue: badTitles.reduce<Record<string, number>>((m, b) => {
				m[b.issue] = (m[b.issue] ?? 0) + 1;
				return m;
			}, {}),
			sample: badTitles.slice(0, 15),
		},
		s7_coverage: coverage,
		s7_stalled: Object.entries(coverage)
			.filter(([, c]) => c.stalled)
			.map(([s]) => s),
		s8_mirrors: { count: mirrors.length, sample: mirrors.slice(0, 10) },
	};

	if (OUT_FILE) {
		writeFileSync(OUT_FILE, JSON.stringify(report, null, 1));
		console.error(`  wrote ${OUT_FILE}`);
		return;
	}
	if (JSON_OUT) {
		console.log(JSON.stringify(report, null, 1));
		return;
	}
	console.log(`# Corpus sweeps — ${rows.length} chunks / ${byDoc.size} docs`);
	console.log(`S5 junk URLs: ${junkUrls.length} (must be 0 post-prune)`);
	for (const u of junkUrls.slice(0, 10)) console.log(`   ${u}`);
	console.log(`S6 bad titles: ${badTitles.length} docs`);
	for (const b of badTitles.slice(0, 12))
		console.log(
			`   [${b.issue}] ${b.source}: '${b.title}' ${b.url.slice(0, 60)}`,
		);
	console.log("S7 publishedAt coverage / freshness:");
	for (const [s, c] of Object.entries(coverage))
		console.log(
			`   ${s.padEnd(22)} ${String(c.chunks).padStart(5)} chunks | dated ${c.datedPct}% | newest ${c.newestAgeDays ?? "—"}d${c.stalled ? "  ⚠ STALLED" : ""}`,
		);
	console.log(`S8 mirrored content: ${mirrors.length} hash groups across URLs`);
	for (const m of mirrors.slice(0, 8)) console.log(`   ${m.urls.join(" ↔ ")}`);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL", e);
		process.exit(1);
	});
