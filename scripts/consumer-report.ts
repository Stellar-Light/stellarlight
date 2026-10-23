/**
 * Per-consumer quality report — scale-model deliverable 2 ("here's the eval
 * on YOUR workload", improvements/ideas/idea-scale-model.md).
 *
 * Generates a dated report for ONE consumer from the api-usage log: what they
 * asked, what we served, which of their top queries miss TODAY (replayed live,
 * Engine D-style — a fixed miss shouldn't page anyone), and what changed in
 * the contract during the window. Writes a JSON artifact + a human Markdown
 * report under improvements/consumers/ — the same committed-evidence
 * convention every other engine uses (and what /quality may later render).
 *
 *   DATABASE_URI=… pnpm exec tsx scripts/consumer-report.ts \
 *     [--consumer=raven] [--days=30] [--top=25] [--min-term=5] [--outdir=improvements/consumers]
 *
 * Runs in CI (consumer-report.yml, monthly + dispatch) because the api-usage
 * log lives in the prod DB. Read-only on the DB; the only write is the
 * artifact pair. Privacy: the log stores no IPs and no raw UAs (endpoint,
 * query, coarse country, result counts; see src/collections/ApiUsage.ts), and
 * the report is public, so it publishes no query text: single terms with
 * counts and replay grades as counts (src/lib/consumer-report.ts).
 */

import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getPayload } from "payload";
import {
	buildConsumerReport,
	type ReplayResult,
	topDemand,
	type UsageRow,
} from "../src/lib/consumer-report";

// Dynamic import AFTER dotenv — a static import hoists above loadEnv() and
// payload.config reads PAYLOAD_SECRET at eval time (the seed scripts' pattern).
const { default: configPromise } = await import("../src/payload.config");

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);

const argOf = (name: string, dflt: string): string => {
	const a = process.argv.find((x) => x.startsWith(`--${name}=`));
	return a ? a.split("=").slice(1).join("=") : dflt;
};
const CONSUMER = argOf("consumer", "raven");
const DAYS = Number.parseInt(argOf("days", "30"), 10) || 30;
const TOP = Number.parseInt(argOf("top", "25"), 10) || 25;
const OUTDIR = argOf("outdir", "improvements/consumers");
/** A term is published only when at least this many calls asked it. */
const MIN_TERM_COUNT = Number.parseInt(argOf("min-term", "5"), 10) || 5;

/**
 * Consumer → uaBucket mapping. `raven` is the residual `other` bucket:
 * Raven's adapter sends NO User-Agent (verified in their scout adapter), so
 * the gateway's traffic lands there; our own UA-less probes were split into
 * `probe` on 2026-07-10, so `other` is trusted demand only AFTER that
 * (Engine D's OTHER_TRUSTED_SINCE). Honest caveat carried into the report:
 * other UA-less clients also land in this bucket.
 */
const CONSUMERS: Record<
	string,
	{ label: string; buckets: string[]; trustedSince: string; caveat: string }
> = {
	raven: {
		label: "Raven (agents.stellar.buzz)",
		buckets: ["other"],
		trustedSince: "2026-07-11",
		caveat:
			"Raven's adapter sends no User-Agent, so its traffic is the residual `other` bucket — other UA-less clients land here too. Figures are an upper bound on Raven's own traffic.",
	},
	claude: {
		label: "Claude agents",
		buckets: ["claude"],
		trustedSince: "2026-07-11",
		caveat: "UA-bucketed `claude` traffic (Claude Code / claude.ai agents).",
	},
};

/** Endpoints with keyword-query semantics we can replay 1:1 (Engine D's set). */
const REPLAYABLE = new Set([
	"/api/projects/search",
	"/api/research",
	"/api/repos/search",
	"/api/partners",
	"/api/builders",
]);
const WEAK_CONFIDENCE = 0.45;

async function replayQuery(
	endpoint: string,
	q: string,
): Promise<ReplayResult | null> {
	const url = `${BASE}${endpoint}?q=${encodeURIComponent(q)}&limit=10`;
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": "stellarlight-consumer-report" },
		});
		if (!res.ok) return null;
		// biome-ignore lint/suspicious/noExplicitAny: five distinct response shapes
		const d: any = await res.json();
		const rows =
			d.projects ?? d.results ?? d.repos ?? d.partners ?? d.builders ?? [];
		const topConfidence = rows[0]?.confidence?.score ?? null;
		const matchMode = d.meta?.matchMode ?? null;
		const advisory = d.meta?.advisory ?? null;
		const advisoryAnswered = Boolean(
			advisory &&
				((advisory.sdfPeople?.length ?? 0) > 0 ||
					(advisory.tryInstead?.length ?? 0) > 0),
		);
		const status: ReplayResult["status"] =
			rows.length === 0
				? advisoryAnswered
					? "advisory"
					: "empty"
				: topConfidence !== null && topConfidence < WEAK_CONFIDENCE
					? "weak"
					: "ok";
		return {
			status,
			returned: rows.length,
			matchMode,
			topConfidence,
		};
	} catch {
		return null;
	}
}

async function main() {
	const consumer = CONSUMERS[CONSUMER];
	if (!consumer) {
		console.error(
			`unknown consumer '${CONSUMER}' — known: ${Object.keys(CONSUMERS).join(", ")}`,
		);
		process.exit(2);
	}

	const now = new Date();
	const windowStart = new Date(now.getTime() - DAYS * 86_400_000);
	const trusted = new Date(consumer.trustedSince);
	const since = windowStart > trusted ? windowStart : trusted;
	const runDate = now.toISOString().slice(0, 10);

	console.log(
		`consumer-report: ${CONSUMER} (${consumer.buckets.join(",")}) since ${since.toISOString().slice(0, 10)} → ${runDate}`,
	);

	const payload = await getPayload({ config: await configPromise });

	// ── pull the window's rows (paged) ──────────────────────────────────────
	const rows: UsageRow[] = [];
	let page = 1;
	for (;;) {
		const res = await payload.find({
			collection: "api-usage",
			where: {
				and: [
					{ uaBucket: { in: consumer.buckets } },
					{ createdAt: { greater_than_equal: since.toISOString() } },
				],
			},
			limit: 2000,
			page,
			depth: 0,
			overrideAccess: true,
			select: {
				endpoint: true,
				query: true,
				resultCount: true,
				matchMode: true,
				scoutVersion: true,
				createdAt: true,
			},
		});
		rows.push(...(res.docs as UsageRow[]));
		if (!res.hasNextPage) break;
		page += 1;
	}
	console.log(`  ${rows.length} calls in window`);

	// ── replay the top distinct queries against the LIVE api ───────────────
	// The query texts stay in memory; the report gets only the grades.
	const replayed: Array<{ endpoint: string; replay: ReplayResult | null }> = [];
	for (const t of topDemand(rows, REPLAYABLE, TOP)) {
		replayed.push({
			endpoint: t.endpoint,
			replay: await replayQuery(t.endpoint, t.query),
		});
	}

	// ── contract changes in the window ─────────────────────────────────────
	let changelog: Array<{
		date?: string;
		version?: string;
		type?: string;
		summary?: string;
	}> = [];
	try {
		const res = await fetch(
			`${BASE}/api/changelog?since=${since.toISOString().slice(0, 10)}&limit=100`,
			{ headers: { "User-Agent": "stellarlight-consumer-report" } },
		);
		if (res.ok) changelog = (await res.json()).entries ?? [];
	} catch {
		// report proceeds without the changelog section
	}

	// ── artifacts ───────────────────────────────────────────────────────────
	const { report, md } = buildConsumerReport({
		consumer: CONSUMER,
		meta: consumer,
		rows,
		replayed,
		changelog,
		now,
		since,
		days: DAYS,
		base: BASE,
		minTermCount: MIN_TERM_COUNT,
		topTerms: 20,
	});

	mkdirSync(OUTDIR, { recursive: true });
	const base = join(OUTDIR, `${CONSUMER}-${runDate}`);
	writeFileSync(`${base}.json`, `${JSON.stringify(report, null, "\t")}\n`);
	writeFileSync(`${base}.md`, md);
	console.log(
		`  wrote ${base}.md + .json: replay ok ${report.replaySummary.ok}/${report.replaySummary.graded}, misses ${report.replaySummary.misses}`,
	);
	process.exit(0);
}

main().catch((err) => {
	console.error("consumer-report failed:", err);
	process.exit(1);
});
