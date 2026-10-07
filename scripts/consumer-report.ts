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
 *     [--consumer=raven] [--days=30] [--top=25] [--outdir=improvements/consumers]
 *
 * Runs in CI (consumer-report.yml, monthly + dispatch) because the api-usage
 * log lives in the prod DB. Read-only on the DB; the only write is the
 * artifact pair. Privacy: the log stores no IPs and no raw UAs — endpoint,
 * query, coarse country, result counts (see src/collections/ApiUsage.ts).
 */

import "./load-env";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getPayload } from "payload";

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

interface UsageRow {
	endpoint?: string;
	query?: string;
	resultCount?: number | null;
	matchMode?: string | null;
	scoutVersion?: string | null;
	createdAt?: string;
}

interface ReplayResult {
	/**
	 * ok        — rows returned at healthy confidence
	 * advisory  — zero rows BUT the response answered honestly out-of-scope:
	 *             a concrete advisory answer (e.g. the person's SDF record) or
	 *             an explicit scope note + tryInstead redirect. Counts as ok —
	 *             report #1 mis-graded these as misses (justin rice / tyler on
	 *             /api/builders) when the endpoint had fully handled them; a
	 *             grader that only counts rows manufactures findings.
	 * empty     — zero rows and no advisory handling: a real miss
	 * weak      — rows but top confidence below the "low" line
	 */
	status: "ok" | "advisory" | "empty" | "weak";
	returned: number;
	matchMode: string | null;
	topConfidence: number | null;
	advisoryNote: string | null;
}

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
		const advisoryNote: string | null =
			status === "advisory"
				? (advisory.sdfPeople?.length ?? 0) > 0
					? `answered via advisory (${advisory.sdfPeople[0].name ?? "SDF record"})`
					: `scoped out + redirected (${advisory.tryInstead[0]?.endpoint ?? "tryInstead"})`
				: null;
		return {
			status,
			returned: rows.length,
			matchMode,
			topConfidence,
			advisoryNote,
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

	// ── aggregate ───────────────────────────────────────────────────────────
	const byEndpoint = new Map<
		string,
		{ calls: number; zero: number; withCount: number; sumCount: number }
	>();
	const demand = new Map<
		string,
		{ endpoint: string; query: string; hits: number; lastSeen: string }
	>();
	const activeDays = new Set<string>();

	for (const r of rows) {
		const ep = r.endpoint ?? "?";
		const e = byEndpoint.get(ep) ?? {
			calls: 0,
			zero: 0,
			withCount: 0,
			sumCount: 0,
		};
		e.calls += 1;
		if (typeof r.resultCount === "number") {
			e.withCount += 1;
			e.sumCount += r.resultCount;
			if (r.resultCount === 0) e.zero += 1;
		}
		byEndpoint.set(ep, e);
		if (r.createdAt) activeDays.add(r.createdAt.slice(0, 10));

		const q = (r.query ?? "").trim();
		if (q && REPLAYABLE.has(ep)) {
			const key = `${ep} ${q.toLowerCase()}`;
			const d = demand.get(key) ?? {
				endpoint: ep,
				query: q,
				hits: 0,
				lastSeen: "",
			};
			d.hits += 1;
			if (r.createdAt && r.createdAt > d.lastSeen) d.lastSeen = r.createdAt;
			demand.set(key, d);
		}
	}

	// ── replay the top distinct queries against the LIVE api ───────────────
	const top = [...demand.values()]
		.sort((a, b) => b.hits - a.hits || (a.lastSeen < b.lastSeen ? 1 : -1))
		.slice(0, TOP);
	const replayed: Array<
		(typeof top)[number] & { replay: ReplayResult | null }
	> = [];
	for (const t of top) {
		replayed.push({ ...t, replay: await replayQuery(t.endpoint, t.query) });
	}
	// "advisory" counts as ok: the consumer received an honest, concrete
	// handling (answer or scoped redirect) — only empty/weak are misses.
	const replayOk = replayed.filter(
		(r) => r.replay?.status === "ok" || r.replay?.status === "advisory",
	).length;
	const replayGraded = replayed.filter((r) => r.replay !== null).length;

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
	const report = {
		consumer: CONSUMER,
		label: consumer.label,
		buckets: consumer.buckets,
		caveat: consumer.caveat,
		generatedAt: now.toISOString(),
		window: { since: since.toISOString(), days: DAYS },
		totals: {
			calls: rows.length,
			activeDays: activeDays.size,
			endpoints: byEndpoint.size,
			distinctReplayableQueries: demand.size,
		},
		byEndpoint: [...byEndpoint.entries()]
			.map(([endpoint, e]) => ({
				endpoint,
				calls: e.calls,
				zeroResultCalls: e.zero,
				avgResultCount: e.withCount
					? Math.round((e.sumCount / e.withCount) * 10) / 10
					: null,
			}))
			.sort((a, b) => b.calls - a.calls),
		topQueriesReplayed: replayed.map((r) => ({
			endpoint: r.endpoint,
			query: r.query,
			hits: r.hits,
			lastSeen: r.lastSeen,
			today: r.replay,
		})),
		replaySummary: {
			graded: replayGraded,
			ok: replayOk,
			okRate: replayGraded ? Math.round((replayOk / replayGraded) * 100) : null,
		},
		contractChangesInWindow: changelog.length,
	};

	mkdirSync(OUTDIR, { recursive: true });
	const base = join(OUTDIR, `${CONSUMER}-${runDate}`);
	writeFileSync(`${base}.json`, `${JSON.stringify(report, null, "\t")}\n`);

	const misses = replayed.filter(
		(r) =>
			r.replay && (r.replay.status === "empty" || r.replay.status === "weak"),
	);
	const md = `# ${consumer.label} — workload quality report, ${runDate}

Window: last ${DAYS} days (from ${since.toISOString().slice(0, 10)}). Consumer bucket: \`${consumer.buckets.join("`, `")}\`.
> ${consumer.caveat}

## Headline

- **${rows.length} calls** across **${byEndpoint.size} endpoints** on **${activeDays.size} active days**
- Top ${replayGraded} distinct queries replayed against the live API **today**: **${replayOk}/${replayGraded} ok**${report.replaySummary.okRate !== null ? ` (${report.replaySummary.okRate}%)` : ""}
- **${changelog.length} contract changes** shipped during the window ([changelog](${BASE}/api/changelog?since=${since.toISOString().slice(0, 10)}))

## What you asked (by endpoint)

| Endpoint | Calls | Zero-result calls | Avg rows |
|---|---|---|---|
${report.byEndpoint.map((e) => `| \`${e.endpoint}\` | ${e.calls} | ${e.zeroResultCalls} | ${e.avgResultCount ?? "—"} |`).join("\n")}

## Your top queries — do they work TODAY?

Replayed live (a miss fixed since you sent it doesn't count against us; a live miss does):

| Query | Endpoint | Hits | Today |
|---|---|---|---|
${replayed.map((r) => `| ${r.query.slice(0, 60)} | \`${r.endpoint}\` | ${r.hits} | ${r.replay ? (r.replay.status === "ok" ? `✓ ${r.replay.returned} rows` : r.replay.status === "advisory" ? `✓ ${r.replay.advisoryNote}` : r.replay.status === "empty" ? "✗ EMPTY" : `⚠ weak (top conf ${r.replay.topConfidence})`) : "(replay failed)"} |`).join("\n")}

Grading: ✓ rows = answered; ✓ advisory = zero rows but the response answered honestly out-of-scope (concrete advisory record or explicit scope + redirect — counts as ok); ✗/⚠ are the misses.

${
	misses.length > 0
		? `### Open misses (${misses.length}) — our fix queue\n\n${misses.map((m) => `- \`${m.endpoint}?q=${encodeURIComponent(m.query)}\` — ${m.replay?.status} (asked ${m.hits}×, last ${m.lastSeen.slice(0, 10)})`).join("\n")}`
		: "### No open misses in your top queries 🎯"
}

## What changed for you this window

${changelog.length === 0 ? "No contract changes in the window." : changelog.map((c) => `- ${c.date} \`${c.version ?? ""}\` **[${c.type}]** ${c.summary}`).join("\n")}

---
*Generated by \`scripts/consumer-report.ts\` from the api-usage log (no IPs, no raw UAs stored) + a live replay. JSON twin: \`${CONSUMER}-${runDate}.json\`.*
`;
	writeFileSync(`${base}.md`, md);
	console.log(
		`  wrote ${base}.md + .json — replay ok ${replayOk}/${replayGraded}, misses ${misses.length}`,
	);
	process.exit(0);
}

main().catch((err) => {
	console.error("consumer-report failed:", err);
	process.exit(1);
});
