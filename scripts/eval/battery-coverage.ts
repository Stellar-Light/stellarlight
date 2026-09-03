/**
 * Battery-coverage detector — the external referee's eval, mechanized
 * (SYNTHESIS-2026-08-12 meta-lesson 3: the sharpest findings come from a
 * different vantage point; stellar-raven's QA battery is that vantage).
 *
 * Reads EVERY question in stellar-raven's public eval battery
 * (eval/qa/corpus/battery/<category>/q-*.json) and probes OUR research
 * corpus with it. A question their gauntlet grades that our corpus answers
 * weakly is an ingest/curation backlog item — filed automatically, the
 * night they add the case, instead of when a routed query embarrasses us.
 *
 * Deterministic, read-only, no LLM. Their questions are probed internally
 * only, never republished. Weak coverage is BACKLOG (low severity), not a
 * fire; zero cases fetched is an OUTAGE (their repo moved once already —
 * stellar-experimental/stellar-raven, no redirects) and exits 1.
 *
 *   SCOUT_BASE=https://stellarlight.xyz pnpm exec tsx scripts/eval/battery-coverage.ts
 *
 * Writes improvements/engine/nightly/battery-coverage-latest.json when
 * FINDINGS_DIR is set (the nightly-health convention).
 */

import { type NightlyFailure, writeNightlyFindings } from "../nightly-findings";

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";
const RAVEN = "stellar-experimental/stellar-raven";
const BATTERY = "eval/qa/corpus/battery";
/** Below this top-confidence, our corpus is considered weak on the topic. */
const WEAK_FLOOR = 0.6;
const UA = { "User-Agent": "stellarlight-battery-coverage" };
/** The tree read is the only GitHub API call here. Unauthenticated it gets 60
 *  requests an hour per IP, which a busy runner exhausts — and the 403 that
 *  follows read as a coverage FAILURE rather than what it is. Send the token
 *  the workflow already has when there is one. */
const GH_AUTH: Record<string, string> = process.env.GITHUB_TOKEN
	? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
	: {};

/** Exit code for "could not look", kept distinct from a real finding (1) so a
 *  rate limit or an outage never counts as evidence about their battery. */
const EXIT_COULD_NOT_CHECK = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One paced, rate-limit-aware GET. A throttled probe is an ERROR, never a
 * 0.00 — a guard that converts its own throttling into findings cries wolf
 * (the 492-case sweep exceeded our own 60/min limiter on first run). */
async function probeJson(url: string): Promise<Record<string, unknown> | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await fetch(url, {
			headers: { Accept: "application/json", ...UA },
		});
		const body = (await res.json().catch(() => null)) as Record<
			string,
			unknown
		> | null;
		const limited =
			res.status === 429 || /rate limit/i.test(String(body?.error ?? ""));
		if (!limited) return body;
		await sleep(5000);
	}
	return null;
}

interface CaseFile {
	id?: string;
	question?: string;
	surface?: string[];
}

type Route =
	| { kind: "research"; basis: "confidence" }
	| { kind: "projects"; basis: "confidence" }
	| { kind: "repos"; basis: "lexical-anchor@top3" }
	| { kind: "hackathons"; basis: "presence" }
	| { kind: "leaderboard"; basis: "presence" }
	| { kind: "skip-lumenloop" }
	| { kind: "skip-other" };

/** Map THEIR tool registry to OUR endpoint. scout.* is ours by assignment;
 * stellarDocs / skills surfaces are docs questions our research corpus
 * competes on (dev-docs source); lumenloop-only cases are another
 * service's assignment. */
function routeOf(surfaces: string[]): Route {
	const s = surfaces.join(" ");
	if (s.includes("scout.searchResearch"))
		return { kind: "research", basis: "confidence" };
	if (s.includes("scout.searchProjects"))
		return { kind: "projects", basis: "confidence" };
	// getLeaderboard outranks searchRepos: a ranking question ("which projects
	// have the most open issues — rank them") is answered by the leaderboard
	// rows (github.openIssuesTotal), and grading it on repo-search lexical
	// anchors mis-graded q-tool-leaderboard-open-issues for 17 days (the
	// battery-coverage-weak residual since 2026-08-16).
	if (s.includes("scout.getLeaderboard"))
		return { kind: "leaderboard", basis: "presence" };
	if (s.includes("scout.searchRepos"))
		return { kind: "repos", basis: "lexical-anchor@top3" };
	if (s.includes("scout.getHackathons"))
		return { kind: "hackathons", basis: "presence" };
	if (/scout\./.test(s)) return { kind: "skip-other" }; // other scout ops: no comparable q-probe yet
	// skills.lumenloop.* is THEIR skill namespace (e.g. stellar-ecosystem-digest)
	// — grading our corpus on another service's skill conduct is a category
	// error, not a coverage gap (two digest cases mis-graded until 2026-08-13).
	if (s.includes("skills.lumenloop.")) return { kind: "skip-lumenloop" };
	if (s.includes("stellarDocs.") || s.includes("skills."))
		return { kind: "research", basis: "confidence" };
	if (s.includes("lumenloop.")) return { kind: "skip-lumenloop" };
	return { kind: "skip-other" };
}

const STOP = new Set([
	"what",
	"which",
	"does",
	"how",
	"the",
	"this",
	"that",
	"with",
	"from",
	"have",
	"stellar",
	"soroban",
	"contract",
	"network",
]);
/** Load-bearing short tech tokens the 4-char floor would drop. */
const SHORT_TECH = new Set([
	"sdk",
	"zk",
	"cli",
	"rpc",
	"sep",
	"cap",
	"amm",
	"dex",
	"nft",
	"kyc",
	"tvl",
]);
function anchorScore(
	question: string,
	rows: Array<{
		fullName?: string;
		name?: string;
		description?: string | null;
	}>,
): number {
	const toks = (question.toLowerCase().match(/[a-z0-9-]{2,}/g) ?? []).filter(
		(t) => t.length >= 4 || SHORT_TECH.has(t),
	);
	const hay = rows
		.slice(0, 3)
		.map((r) => `${r.fullName ?? ""} ${r.name ?? ""} ${r.description ?? ""}`)
		.join(" ")
		.toLowerCase();
	if (!rows.length) return 0;
	return toks.some((t) => !STOP.has(t) && hay.includes(t)) ? 0.75 : 0.3;
}

class CouldNotCheck extends Error {}

async function listCasePaths(): Promise<string[]> {
	const res = await fetch(
		`https://api.github.com/repos/${RAVEN}/git/trees/main?recursive=1`,
		{ headers: { Accept: "application/vnd.github+json", ...UA, ...GH_AUTH } },
	);
	// 403/429 is us being rate-limited or refused — an outage. 404 means the
	// repo or branch moved. Neither is a statement about their coverage, and
	// both used to exit 1 and be reported as a red finding.
	if (res.status === 403 || res.status === 429 || res.status >= 500)
		throw new CouldNotCheck(
			`GitHub returned ${res.status} for the battery tree — rate limit or outage, not a coverage result`,
		);
	if (!res.ok) throw new Error(`tree fetch ${res.status}`);
	const tree = (await res.json()) as {
		tree?: Array<{ path: string; type: string }>;
	};
	return (tree.tree ?? [])
		.filter(
			(e) =>
				e.type === "blob" &&
				e.path.startsWith(`${BATTERY}/`) &&
				/\/q-[^/]+\.json$/.test(e.path),
		)
		.map((e) => e.path);
}

async function main() {
	console.log(`Battery coverage — ${RAVEN} → ${BASE}\n`);
	const paths = await listCasePaths();
	if (paths.length === 0) {
		console.error(
			"✗ 0 battery cases found — their repo moved or the layout changed (outage, not a clean pass)",
		);
		writeNightlyFindings("battery-coverage", [
			{
				probe: "battery sweep outage",
				note: "0 cases found at the known path",
			},
		]);
		process.exit(1);
	}
	console.log(`${paths.length} case(s) across the battery\n`);

	const failures: NightlyFailure[] = [];
	let covered = 0;
	let weak = 0;
	let errored = 0;
	let skippedLumenloop = 0;
	let skippedOther = 0;
	let skippedConduct = 0;
	for (const path of paths) {
		const cat = path.split("/").slice(-2, -1)[0];
		// Adapter-CONDUCT questions (their edge-behavior category) grade how a
		// SERVICE should report soft-empties/filters — not whether a corpus
		// holds content. Probing our research corpus with them files phantom
		// ingest backlog: q-edge-doc-category-filter-empty sat open 17 days
		// asking our corpus to answer stellarDocs' category-filter contract.
		// Conduct is what the conduct lanes test (engine E, the battery
		// envelope slices); coverage skips the category — counted, never
		// silent.
		if (cat === "edge-behavior") {
			skippedConduct++;
			continue;
		}
		let q: CaseFile = {};
		try {
			q = (await (
				await fetch(`https://raw.githubusercontent.com/${RAVEN}/main/${path}`, {
					headers: UA,
				})
			).json()) as CaseFile;
		} catch {
			errored++;
			continue;
		}
		const question = (q.question ?? "").trim();
		const id = q.id ?? path.split("/").pop();
		if (!question) continue;
		const route = routeOf(q.surface ?? []);
		if (route.kind === "skip-lumenloop") {
			skippedLumenloop++;
			continue;
		}
		if (route.kind === "skip-other") {
			skippedOther++;
			continue;
		}
		await sleep(1100); // stay under the API's own per-minute limiter
		try {
			const qq = encodeURIComponent(question.slice(0, 300));
			let score = 0;
			let best = "none";
			if (route.kind === "research") {
				const body = (await probeJson(
					`${BASE}/api/research?q=${qq}&limit=3`,
				)) as {
					results?: Array<{ confidence?: { score?: number }; url?: string }>;
				} | null;
				if (!body) throw new Error("rate-limited after retry");
				score = body.results?.[0]?.confidence?.score ?? 0;
				best = body.results?.[0]?.url ?? "none";
			} else if (route.kind === "projects") {
				const body = (await probeJson(
					`${BASE}/api/projects/search?q=${qq}&limit=3`,
				)) as {
					projects?: Array<{ confidence?: { score?: number }; slug?: string }>;
				} | null;
				if (!body) throw new Error("rate-limited after retry");
				score = body.projects?.[0]?.confidence?.score ?? 0;
				best = body.projects?.[0]?.slug ?? "none";
			} else if (route.kind === "repos") {
				const body = (await probeJson(
					`${BASE}/api/repos/search?q=${qq}&limit=3`,
				)) as {
					repos?: Array<{ fullName?: string; description?: string | null }>;
				} | null;
				if (!body) throw new Error("rate-limited after retry");
				score = anchorScore(question, body.repos ?? []);
				best = body.repos?.[0]?.fullName ?? "none";
			} else if (route.kind === "leaderboard") {
				// A ranking question is answered by the leaderboard rows themselves:
				// the fact the case asks for (open-issue counts, ranked) is
				// github.openIssuesTotal on each row. Presence of that field on a
				// served roster IS coverage; lexical anchors on repo search never
				// were (q-tool-leaderboard-open-issues sat weak from 2026-08-16).
				const body = (await probeJson(`${BASE}/api/leaderboard?limit=25`)) as {
					rows?: Array<{
						slug?: string;
						github?: { openIssuesTotal?: number };
					}>;
					leaderboard?: Array<{
						slug?: string;
						github?: { openIssuesTotal?: number };
					}>;
					projects?: Array<{
						slug?: string;
						github?: { openIssuesTotal?: number };
					}>;
					items?: Array<{
						slug?: string;
						github?: { openIssuesTotal?: number };
					}>;
				} | null;
				if (!body) throw new Error("rate-limited after retry");
				const rows =
					body.rows ?? body.leaderboard ?? body.projects ?? body.items ?? [];
				const ranked = rows.filter(
					(r) => typeof r.github?.openIssuesTotal === "number",
				);
				// Presence: a served, ranked roster answers "is there a leaderboard /
				// who ranks"; a question about open issues additionally needs the
				// per-row count the ranking would be built from.
				const asksIssues = /\bissues?\b/i.test(question);
				score = rows.length >= 3 && (!asksIssues || ranked.length >= 3) ? 1 : 0;
				best = `${ranked.length}/${rows.length} leaderboard row(s)${asksIssues ? " carry openIssuesTotal" : ""}`;
			} else {
				// A natural-language question never matches an event NAME via ?q=
				// (the first sweep scored every hackathon case 0.00 while the
				// roster held the events). Fetch the roster and anchor event
				// names/organizers against the question instead.
				const body = (await probeJson(`${BASE}/api/hackathons`)) as {
					hackathons?: Array<{ name?: string; organizer?: string }>;
				} | null;
				if (!body) throw new Error("rate-limited after retry");
				const rows = body.hackathons ?? [];
				score = anchorScore(
					question,
					rows.map((h) => ({ name: `${h.name ?? ""} ${h.organizer ?? ""}` })),
				);
				// roster-wide, not top-3: presence of ANY named event in the roster
				if (score < 0.75 && rows.length) {
					const ql = question.toLowerCase();
					const named = rows.some((h) =>
						(h.name ?? "")
							.toLowerCase()
							.split(/[:\s]+/)
							.filter((w) => w.length >= 4 && !STOP.has(w))
							.some((w) => ql.includes(w)),
					);
					if (named) score = 0.75;
				}
				best = `${rows.length} roster row(s)`;
			}
			const basis = "basis" in route ? route.basis : "";
			if (score >= WEAK_FLOOR) {
				covered++;
				console.log(
					`  ✓ ${String(id).padEnd(48)} ${score.toFixed(2)} [${cat} · ${route.kind}]`,
				);
			} else {
				weak++;
				console.log(
					`  △ ${String(id).padEnd(48)} ${score.toFixed(2)} [${cat} · ${route.kind}] — weak`,
				);
				failures.push({
					probe: `battery:${id}`,
					note: `top ${score.toFixed(2)} < ${WEAK_FLOOR} via ${route.kind}/${basis} for "${question.slice(0, 80)}" (${cat}); best: ${best}`,
					surface: "corpus",
				});
			}
		} catch (e) {
			errored++;
			console.log(
				`  ✗ ${id} probe error: ${e instanceof Error ? e.message : e}`,
			);
		}
	}

	writeNightlyFindings("battery-coverage", failures);
	console.log(
		`\n${covered} covered · ${weak} weak · ${errored} errored · ${skippedLumenloop} lumenloop-routed + ${skippedOther} non-comparable + ${skippedConduct} conduct-category skipped, of ${paths.length} — weak cases are ingest backlog, filed via the ledger`,
	);
	// Weak coverage is backlog, not red; only a broken sweep is red.
	process.exit(errored === paths.length ? 1 : 0);
}

main().catch((e) => {
	if (e instanceof CouldNotCheck) {
		// Say which it is IN THE LOG, so a reader of the run does not have to
		// infer it from an exit code.
		console.error(`COULD NOT CHECK: ${e.message}`);
		process.exit(EXIT_COULD_NOT_CHECK);
	}
	console.error("Fatal:", e);
	process.exit(1);
});
