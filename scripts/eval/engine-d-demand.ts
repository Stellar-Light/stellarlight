/**
 * Engine D — demand-side miss mining (the engine that tests what REAL
 * consumers actually ask, not what our records imply they might ask).
 *
 *   pnpm exec tsx scripts/eval/engine-d-demand.ts [--days=14] [--top=250] [--json]
 *
 * Engines A/B/C all probe from the SUPPLY side: queries derived from our own
 * records and sweeps over our own fields. This mines the api-usage log for
 * queries real consumers sent (Raven, scout-mcp users, /ask visitors),
 * REPLAYS the distinct ones against the live API, and reports the ones that
 * fail TODAY — zero results, pure semantic fallback, or all-low-confidence —
 * ranked by how often they were actually asked. A miss on a real query
 * outranks any synthetic finding by construction.
 *
 * Self-traffic exclusion: our probes/engines send curl or custom UAs that
 * bucket as `curl`/`other`; real consumers arrive as `claude`/`codex`/
 * `cursor`/`agent`/`browser` or carry the x-scout-version header. Mining is
 * restricted to those, so the engine can't grade its own homework. (Caveat:
 * generic node scripts also bucket `agent` — acceptable noise, they're still
 * external demand.)
 *
 * Replay, not log-time counts: what matters is which real queries fail NOW —
 * a query that failed last week and was fixed shouldn't page anyone.
 * Report-only, no writes, no floors (first runs establish the baseline).
 */
import "../load-env";
import { writeFileSync } from "node:fs";

import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const JSON_OUT = process.argv.includes("--json");
// Payload's logger writes startup lines to STDOUT (its first run in CI began
// with "[15:09…" and broke JSON.parse downstream) — piping is not safe here.
// --out writes the JSON to a file directly, immune to stdout pollution.
const OUT_FILE = process.argv
	.find((x) => x.startsWith("--out="))
	?.slice("--out=".length);
const argOf = (name: string, dflt: number) => {
	const a = process.argv.find((x) => x.startsWith(`--${name}=`));
	const n = a ? Number.parseInt(a.split("=")[1], 10) : Number.NaN;
	return Number.isFinite(n) ? n : dflt;
};
const DAYS = argOf("days", 14);
const TOP = argOf("top", 250);
const WEAK_CONFIDENCE = 0.45; // below "medium" — the served page reads "low"

/** Real-consumer UA buckets. curl/bot/probe = our own probes + noise. */
const REAL_BUCKETS = new Set(["claude", "codex", "cursor", "agent", "browser"]);

/**
 * `other` is ALSO real demand — Raven's adapter sends NO User-Agent
 * (verified in kalepail/stellar-raven src/adapters/scout.ts: headers set
 * Content-Type only), so THE most important consumer buckets as `other`.
 * But before 2026-07-11 our own audits/guards without UAs polluted that
 * bucket too (the 597-probe audit, drift guard). The `probe` bucket + UA
 * sweep shipped 2026-07-10; `other` rows are trusted demand only after.
 */
const OTHER_TRUSTED_SINCE = "2026-07-11";

/** Endpoints with keyword-query semantics we can replay 1:1. */
const REPLAYABLE = new Set([
	"/api/projects/search",
	"/api/research",
	"/api/repos/search",
	"/api/partners",
	"/api/builders",
]);

interface Demand {
	endpoint: string;
	query: string;
	hits: number;
	days: Set<string>;
	buckets: Set<string>;
	lastSeen: string;
}

interface Replay {
	returned: number;
	matchMode?: string;
	semanticRows?: number;
	topConfidence?: number | null;
	/**
	 * Did the endpoint ROUTE the asker somewhere real instead of returning rows?
	 * Several of ours answer an out-of-scope question with a `meta.advisory`
	 * carrying the actual record and where to get it — "Justin Rice is SDF
	 * Leadership, not a Passport builder; full record at /api/people". A grader
	 * that only counts rows scores that a total miss.
	 */
	routed?: boolean;
}

async function replay(endpoint: string, q: string): Promise<Replay | null> {
	const url = `${BASE}${endpoint}?q=${encodeURIComponent(q)}&limit=10`;
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": "stellarlight-engine-d" },
		});
		if (!res.ok) return null;
		// biome-ignore lint/suspicious/noExplicitAny: five distinct response shapes
		const d: any = await res.json();
		// An advisory only counts as an ANSWER if it hands the asker somewhere to
		// go — a named record (sdfPeople) or a concrete next endpoint
		// (tryInstead). An advisory that merely narrates "nothing matched" is
		// honest but still leaves them empty-handed, and stays a miss.
		const adv = d.meta?.advisory ?? d.advisory;
		const routed = Boolean(
			adv?.sdfPeople?.length ||
				adv?.tryInstead?.length ||
				adv?.suggestions?.length,
		);
		if (endpoint === "/api/projects/search") {
			const rows = d.projects ?? [];
			return {
				returned: rows.length,
				matchMode: d.meta?.matchMode,
				semanticRows: d.meta?.counts?.semantic ?? 0,
				topConfidence: rows[0]?.confidence?.score ?? null,
				routed,
			};
		}
		if (endpoint === "/api/research") {
			const rows = d.results ?? [];
			return {
				returned: rows.length,
				topConfidence: rows[0]?.confidence?.score ?? null,
				routed,
			};
		}
		if (endpoint === "/api/repos/search") {
			const rows = d.repos ?? [];
			return { returned: rows.length, topConfidence: null, routed };
		}
		if (endpoint === "/api/partners") {
			const rows = d.partners ?? [];
			return { returned: rows.length, topConfidence: null, routed };
		}
		if (endpoint === "/api/builders") {
			const rows = d.builders ?? [];
			return { returned: rows.length, topConfidence: null, routed };
		}
		return null;
	} catch {
		return null;
	}
}

type MissClass = "EMPTY" | "FALLBACK" | "GAP" | "WEAK" | "OK";

/**
 * Grade the ANSWER, not the row count.
 *
 * This grader used to return EMPTY on `returned === 0` and stop there, which
 * scored a full miss for every question our endpoints answer by ROUTING: ask
 * /api/builders for "justin rice" and you get zero rows plus an advisory naming
 * him, his SDF role, the source URL and the endpoint that holds the record.
 * That is an answer. Counting it as a miss put ~8 phantom fires at the top of
 * the ledger and pointed the next wave at data that was never broken.
 *
 * Exactly the lesson already learned once on the consumer-report replay grader
 * (2026-07-21) — it just never reached this engine. Same rule here: zero rows
 * with somewhere to go is OK; zero rows with nowhere to go is still EMPTY.
 */
function classify(endpoint: string, r: Replay): MissClass {
	if (r.returned === 0) return r.routed ? "OK" : "EMPTY";
	if (endpoint === "/api/projects/search" && r.matchMode === "semantic") {
		// Same principle as the routed-empty case above, one rung along.
		//
		// Since openapi@1.8.27 a semantic-only page carries an advisory that
		// says outright: no project matches this name, these rows are
		// NEIGHBOURS, and here is where the answer might actually live. When
		// that advisory is present the endpoint did not fail to retrieve — it
		// correctly reported that we hold no such record. The gap is real and
		// still worth tracking, but it is a COVERAGE gap (curation: add the
		// project) rather than a RETRIEVAL gap (code: fix the ranking), and
		// filing it as the latter creates a finding no retrieval work can ever
		// close. The only way to "fix" a missing project by ranking is to
		// invent one.
		//
		// A semantic page with NO advisory is still FALLBACK: those rows are
		// being presented as answers with nothing marking them as guesses,
		// which is the failure the advisory was introduced to end.
		return r.routed ? "GAP" : "FALLBACK";
	}
	if (typeof r.topConfidence === "number" && r.topConfidence < WEAK_CONFIDENCE)
		return "WEAK";
	return "OK";
}

/** Does a SIBLING surface already answer this?
 *
 * `GAP` means "the endpoint the consumer hit holds no such record" — not "the
 * corpus holds none". A consumer asking the PROJECTS endpoint about `crdt` got
 * a GAP, which the ledger maps to surface `directory`, failureMode
 * `coverage-gap`, and it reads as "the directory should contain a project
 * called CRDT". It should not: /api/repos/search?q=crdt returns
 * calimero-network/core, /api/research?q=crdt returns three rows, and the
 * projects response was already carrying the repo in its own codeReferences.
 *
 * A query the corpus answers on another surface is not a finding on any
 * surface. Both endpoints checked here are already probed elsewhere in this
 * script, so this adds a lookup, not a dependency.
 */
async function answeredElsewhere(query: string): Promise<string | null> {
	for (const [surface, path] of [
		["repos", "/api/repos/search"],
		["research", "/api/research"],
	] as const) {
		try {
			const res = await fetch(
				`${BASE}${path}?q=${encodeURIComponent(query)}&limit=3`,
				{
					headers: { "User-Agent": "stellarlight-engine-d" },
					signal: AbortSignal.timeout(20_000),
				},
			);
			if (!res.ok) continue;
			const d: any = await res.json();
			const rows: unknown[] =
				d?.repos ?? d?.results ?? d?.research ?? d?.items ?? [];
			// Semantic neighbours are not answers — the same rule this engine
			// already applies to the projects endpoint.
			if (Array.isArray(rows) && rows.length > 0 && d?.meta?.matchMode !== "semantic")
				return surface;
		} catch {}
	}
	return null;
}

async function main() {
	console.error(`Engine D — demand-side mining (last ${DAYS}d) → ${BASE}`);
	const payload = await getPayload({ config: await configPromise });
	const cutoff = new Date(Date.now() - DAYS * 86_400_000).toISOString();
	const rows = await payload.find({
		collection: "api-usage",
		where: {
			and: [
				{ createdAt: { greater_than: cutoff } },
				{ query: { exists: true } },
			],
		},
		limit: 100_000,
		pagination: false,
		depth: 0,
		select: {
			endpoint: true,
			query: true,
			uaBucket: true,
			scoutVersion: true,
			createdAt: true,
		},
	});
	const all = rows.docs as Array<{
		endpoint: string;
		query?: string;
		uaBucket?: string;
		scoutVersion?: string;
		createdAt: string;
	}>;
	const real = all.filter(
		(r) =>
			(REAL_BUCKETS.has(r.uaBucket ?? "") ||
				r.scoutVersion ||
				(r.uaBucket === "other" && r.createdAt >= OTHER_TRUSTED_SINCE)) &&
			REPLAYABLE.has(r.endpoint) &&
			(r.query ?? "").trim().length >= 3,
	);
	console.error(
		`  frame: ${all.length} logged hits w/ query, ${real.length} from real consumers`,
	);

	const byKey = new Map<string, Demand>();
	for (const r of real) {
		const query = (r.query ?? "").trim().replace(/\s+/g, " ");
		const key = `${r.endpoint}\u0000${query}`;
		const d = byKey.get(key) ?? {
			endpoint: r.endpoint,
			query,
			hits: 0,
			days: new Set<string>(),
			buckets: new Set<string>(),
			lastSeen: r.createdAt,
		};
		d.hits += 1;
		d.days.add(r.createdAt.slice(0, 10));
		d.buckets.add(r.scoutVersion ? "scout-mcp" : (r.uaBucket ?? "other"));
		if (r.createdAt > d.lastSeen) d.lastSeen = r.createdAt;
		byKey.set(key, d);
	}
	const demands = [...byKey.values()].sort((a, b) => b.hits - a.hits);
	const toReplay = demands.slice(0, TOP);
	console.error(
		`  distinct real queries: ${demands.length}; replaying top ${toReplay.length}`,
	);

	const results: Array<
		Omit<Demand, "days" | "buckets"> & {
			days: number;
			buckets: string[];
			class: MissClass;
			evidence: string;
		}
	> = [];
	let idx = 0;
	async function worker() {
		for (;;) {
			const i = idx++;
			if (i >= toReplay.length) return;
			const d = toReplay[i];
			const r = await replay(d.endpoint, d.query);
			if (!r) continue; // endpoint error — skip, don't misreport
			let cls = classify(d.endpoint, r);
			// A GAP on one surface is only a finding if the corpus is silent on
			// ALL of them.
			let elsewhere: string | null = null;
			if (cls === "GAP") {
				elsewhere = await answeredElsewhere(d.query);
				if (elsewhere) cls = "OK";
			}
			const evidence = elsewhere
				? `no project row, but /api/${elsewhere} answers it — the corpus holds this, so it is not a directory coverage gap`
				:
				cls === "EMPTY"
					? "0 results"
					: cls === "FALLBACK"
						? `matchMode=semantic (${r.semanticRows} fallback rows, NO advisory — neighbours served as answers)`
						: cls === "GAP"
							? "no record held; endpoint said so via advisory (curation gap, not a ranking bug)"
							: cls === "WEAK"
								? `top confidence ${r.topConfidence}`
								: `${r.returned} rows, top confidence ${r.topConfidence ?? "n/a"}`;
			results.push({
				endpoint: d.endpoint,
				query: d.query,
				hits: d.hits,
				lastSeen: d.lastSeen,
				days: d.days.size,
				buckets: [...d.buckets],
				class: cls,
				evidence,
			});
			if (results.length % 50 === 0)
				console.error(`  …${results.length}/${toReplay.length} replayed`);
		}
	}
	await Promise.all(Array.from({ length: 4 }, worker));

	const misses = results
		.filter((r) => r.class !== "OK")
		.sort((a, b) => b.hits - a.hits);
	const okRate = results.length
		? Math.round(
				(results.filter((r) => r.class === "OK").length / results.length) * 100,
			)
		: null;

	if (JSON_OUT || OUT_FILE) {
		const json = JSON.stringify(
			{
				windowDays: DAYS,
				frame: {
					loggedHits: all.length,
					realHits: real.length,
					distinctQueries: demands.length,
					replayed: results.length,
				},
				okRate,
				misses,
			},
			null,
			1,
		);
		if (OUT_FILE) {
			writeFileSync(OUT_FILE, json);
			console.error(`  wrote ${OUT_FILE}`);
		} else {
			console.log(json);
		}
		return;
	}

	console.log(`# Engine D — demand-side misses (last ${DAYS}d)`);
	console.log(
		`\nReplayed the top ${results.length} distinct REAL queries (claude/codex/cursor/agent/browser/scout-mcp traffic only) against live. OK rate on real demand: ${okRate}%. ${misses.length} misses:\n`,
	);
	console.log("| class | endpoint | query | hits | days | via | evidence |");
	console.log("|---|---|---|---|---|---|---|");
	for (const m of misses)
		console.log(
			`| ${m.class} | ${m.endpoint.replace("/api/", "")} | ${m.query} | ${m.hits} | ${m.days} | ${m.buckets.join(",")} | ${m.evidence} |`,
		);
	process.exit(process.exitCode ?? 0);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL", e);
		process.exit(1);
	});
