/**
 * Live canary — the two ways this site has silently gone dark on a visitor,
 * re-checked against production on a schedule so a quiet failure can't sit
 * unnoticed for hours again.
 *
 * 1. SILENT-EMPTY. After #912 the directory search returned "no projects
 *    found" for every query for ~40 minutes: Payload threw on a where-clause,
 *    the try/catch swallowed it, and an empty page looked exactly like a
 *    legitimate miss. Same class the same night with a misspelled filter
 *    (`?types=` returned 0 rows, no complaint). A known-good query that
 *    returns nothing is a fire, not a result. Each probe below is a query
 *    that MUST return the named row.
 *
 * 2. RENDER-REACHABILITY. Every status a project can be given must have a
 *    page (`src/lib/project-status.ts`); the unit test holds that on the
 *    code, this holds it on the live site — for each resolvable status, find
 *    a real slug and GET the page. Plus the #936 case: a project whose repos
 *    live only in the `repos` collection (no legacy embedded array) must still
 *    render its Repositories section.
 *
 *   SCOUT_BASE=https://stellarlight.xyz npx tsx scripts/check-live-canary.ts
 *
 * Exits non-zero on any red. Findings feed the ledger via FINDINGS_DIR.
 * No DB, no auth: everything is public reads. Uses a stellarlight-* UA so
 * these hits land in the `probe` bucket, not demand mining.
 */

import { RESOLVABLE_PROJECT_STATUSES } from "../src/lib/project-status";
import { type NightlyFailure, writeNightlyFindings } from "./nightly-findings";

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";
const UA = { "User-Agent": "stellarlight-live-canary" };

let failures = 0;
let passes = 0;
const failRows: NightlyFailure[] = [];
const ok = (name: string) => {
	passes++;
	console.log(`  ✓ ${name}`);
};
const bad = (name: string, note: string) => {
	failures++;
	failRows.push({ probe: name, note, surface: "site" });
	console.log(`  ✗ ${name}\n      ${note}`);
};

async function getJson(path: string): Promise<{ status: number; body: any }> {
	const res = await fetch(`${BASE}${path}`, {
		headers: UA,
		signal: AbortSignal.timeout(30_000),
	});
	let body: any = null;
	try {
		body = await res.json();
	} catch {
		/* non-JSON */
	}
	return { status: res.status, body };
}

async function getText(
	path: string,
): Promise<{ status: number; body: string }> {
	const res = await fetch(`${BASE}${path}`, {
		headers: UA,
		signal: AbortSignal.timeout(30_000),
	});
	return { status: res.status, body: await res.text() };
}

// ── 1. silent-empty ───────────────────────────────────────────────────────

// Known-item probes: (query → a slug that must be in the results). Chosen to
// be boring and stable — canonical projects that will not be renamed or
// archived without someone noticing.
const KNOWN_ITEMS: Array<{
	path: string;
	label: string;
	mustContain: string;
	key: string;
}> = [
	{
		label: "projects/search q=lobstr",
		path: "/api/projects/search?q=lobstr&limit=10",
		mustContain: "lobstr",
		key: "projects",
	},
	{
		label: "projects/search q=blend",
		path: "/api/projects/search?q=blend&limit=10",
		mustContain: "blend",
		key: "projects",
	},
	{
		label: "projects/search q=soroswap",
		path: "/api/projects/search?q=soroswap&limit=10",
		mustContain: "soroswap",
		key: "projects",
	},
	{
		label: "projects/search type=Wallet",
		path: "/api/projects/search?type=Wallet&limit=100",
		mustContain: "lobstr",
		key: "projects",
	},
	{
		label: "repos/search q=stellar-sdk",
		path: "/api/repos/search?q=stellar-sdk&limit=10",
		mustContain: "stellar/js-stellar-sdk",
		key: "repos",
	},
	{
		label: "research q=soroban",
		path: "/api/research?q=soroban&limit=5",
		mustContain: "",
		key: "results",
	},
];

async function silentEmpty() {
	console.log(
		"\n1. silent-empty — known-good queries must return their known row",
	);
	for (const k of KNOWN_ITEMS) {
		try {
			const { status, body } = await getJson(k.path);
			if (status !== 200) {
				bad(k.label, `HTTP ${status}`);
				continue;
			}
			const rows: any[] = Array.isArray(body?.[k.key]) ? body[k.key] : [];
			// The API already says when it ignored a parameter (meta.warnings,
			// since the 2026-07-11 audit). A zero-row result is only "silent" if
			// nobody reads that; surface it in the red so the cause is in the log.
			const warn = Array.isArray(body?.meta?.warnings)
				? body.meta.warnings.join(" | ")
				: "";
			if (rows.length === 0) {
				bad(
					k.label,
					`200 with ZERO rows — silent-empty (meta.matchMode=${body?.meta?.matchMode ?? "?"}${warn ? `; warnings: ${warn}` : ""})`,
				);
				continue;
			}
			if (k.mustContain) {
				const hit = rows.some((r) =>
					[r.slug, r.fullName, r.name]
						.filter(Boolean)
						.some((v: string) =>
							String(v).toLowerCase().includes(k.mustContain),
						),
				);
				if (!hit) {
					bad(
						k.label,
						`${rows.length} rows but "${k.mustContain}" absent — top: ${rows
							.slice(0, 3)
							.map((r) => r.slug ?? r.fullName)
							.join(", ")}`,
					);
					continue;
				}
			}
			ok(
				`${k.label} → ${rows.length} rows${k.mustContain ? `, has ${k.mustContain}` : ""}`,
			);
		} catch (e) {
			bad(
				k.label,
				`fetch failed: ${String((e as Error).message).slice(0, 80)}`,
			);
		}
	}

	// The directory page itself renders results server-side for ?q=; the
	// 40-minute outage was HERE, not on the API.
	try {
		const { status, body } = await getText("/directory?q=lobstr");
		if (status !== 200) bad("/directory?q=lobstr", `HTTP ${status}`);
		else if (/No projects found/i.test(body) && !/lobstr/i.test(body))
			bad(
				"/directory?q=lobstr",
				`page rendered "No projects found" for a known project`,
			);
		else if (!/lobstr/i.test(body))
			bad("/directory?q=lobstr", `page HTML does not mention lobstr`);
		else ok("/directory?q=lobstr renders Lobstr");
	} catch (e) {
		bad(
			"/directory?q=lobstr",
			`fetch failed: ${String((e as Error).message).slice(0, 80)}`,
		);
	}
}

// ── 2. render-reachability ────────────────────────────────────────────────

async function renderReachability() {
	console.log(
		"\n2. render-reachability — every resolvable status has a live page",
	);
	for (const status of RESOLVABLE_PROJECT_STATUSES) {
		try {
			const q = `/api/projects?where%5Bstatus%5D%5Bequals%5D=${encodeURIComponent(status)}&limit=1&depth=0`;
			const { body } = await getJson(q);
			const doc = body?.docs?.[0];
			if (!doc?.slug) {
				// No project in this status is not a failure of the ROUTE; note and move on.
				ok(`status=${status}: no live rows to probe (skipped)`);
				continue;
			}
			const page = await getText(`/project/${doc.slug}`);
			// Assert the page positively (its <h1> is the project name). Do NOT
			// grep for the not-found copy: Next embeds the not-found boundary
			// in every page's RSC payload, so that string is present on
			// perfectly good pages too (first run of this probe: 4 false reds).
			const h1 = page.body.match(/<h1[^>]*>([^<]*)<\/h1>/i)?.[1]?.trim() ?? "";
			const name = String(doc.name ?? "").trim();
			if (page.status !== 200)
				bad(
					`status=${status} → /project/${doc.slug}`,
					`HTTP ${page.status} — a status we write is not a status the page renders`,
				);
			else if (!h1 || (name && h1.toLowerCase() !== name.toLowerCase()))
				bad(
					`status=${status} → /project/${doc.slug}`,
					`200 but <h1> is "${h1 || "(none)"}", expected "${name}"`,
				);
			else ok(`status=${status} → /project/${doc.slug} renders "${h1}"`);
		} catch (e) {
			bad(
				`status=${status}`,
				`probe failed: ${String((e as Error).message).slice(0, 80)}`,
			);
		}
	}

	// #936: repos held in the `repos` collection must render even when the
	// legacy embedded array is empty. trustless-work is the canonical case
	// (19 repos held, 0 rendered before the fix).
	try {
		const { body } = await getJson(
			"/api/repos?where%5BprojectSlug%5D%5Bequals%5D=trustless-work&limit=0&depth=0",
		);
		const held = Number(body?.totalDocs ?? 0);
		const page = await getText("/project/trustless-work");
		if (page.status !== 200)
			bad("/project/trustless-work", `HTTP ${page.status}`);
		else if (held > 0 && !/>Repositories</.test(page.body))
			bad(
				"/project/trustless-work repos section",
				`${held} repos held in the repos collection, section not rendered`,
			);
		else ok(`/project/trustless-work renders its ${held} held repos`);
	} catch (e) {
		bad(
			"/project/trustless-work",
			`probe failed: ${String((e as Error).message).slice(0, 80)}`,
		);
	}
}

// ── 3. known-asset coverage ───────────────────────────────────────────────

// sls-066: the stablecoin inventory is one upstream snapshot's tracked set,
// and on 2026-08-18 it dropped Circle USDC for hours while the asset was
// live on-chain. An agent reading the list as a census would have concluded
// "no USDC on Stellar". Assert the canonical issuers are present; report an
// absence as an UPSTREAM COVERAGE GAP, never as proof the asset is gone.
const CANONICAL_STABLECOINS: Array<{
	ticker: string;
	issuer: string;
	who: string;
}> = [
	{
		ticker: "USDC",
		issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
		who: "Circle (official contract table)",
	},
	{
		ticker: "EURC",
		issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
		who: "Circle (official contract table)",
	},
];

async function knownAssetCoverage() {
	console.log(
		"\n3. known-asset coverage — canonical stablecoins must be in the inventory",
	);
	try {
		const { status, body } = await getJson("/api/stablecoins?limit=100");
		if (status !== 200) {
			bad("stablecoins inventory", `HTTP ${status}`);
			return;
		}
		const rows: any[] = Array.isArray(body?.stablecoins)
			? body.stablecoins
			: [];
		if (rows.length === 0 && body?.meta?.advisory) {
			// Upstream outage is already an honest advisory in the response;
			// don't double-report it as a coverage gap.
			ok(
				`stablecoins upstream unavailable (advisory present) — coverage not judged`,
			);
			return;
		}
		for (const c of CANONICAL_STABLECOINS) {
			const hit = rows.find((r) => r.issuer === c.issuer);
			if (hit)
				ok(
					`${c.ticker} by ${c.who} present (${hit.marketCapUSD == null ? "metrics null = untracked, not zero" : `cap $${Math.round(hit.marketCapUSD).toLocaleString()}`})`,
				);
			else
				bad(
					`${c.ticker} ${c.issuer.slice(0, 8)}… absent from inventory`,
					`UPSTREAM COVERAGE GAP at the snapshot service — the asset is issued on Stellar (${c.who}); this is a missing row, NOT proof of absence. Do not let a consumer read the list as a census.`,
				);
		}
		// counts contract (sls-066): total must be the FILTERED count.
		const usd = await getJson("/api/stablecoins?peg=USD&limit=100");
		const c = usd.body?.meta?.counts ?? {};
		const returned = Array.isArray(usd.body?.stablecoins)
			? usd.body.stablecoins.length
			: -1;
		if (typeof c.total === "number" && c.total === returned)
			ok(
				`peg=USD counts.total (${c.total}) equals rows returned — filtered semantics hold`,
			);
		else
			bad(
				"stablecoins counts.total under peg filter",
				`total=${c.total} but returned=${returned}; total must be the filtered count (sls-066)`,
			);
	} catch (e) {
		bad(
			"stablecoins coverage",
			`probe failed: ${String((e as Error).message).slice(0, 80)}`,
		);
	}
}

// ── 4. every public page renders ──────────────────────────────────────────

// 2026-08-19: /stablecoins shipped 500-ing on every request. tsc was clean,
// 20 unit tests passed, `next build` passed, and CI was fully green — because
// the pages are `force-dynamic`, so nothing ever rendered them until a real
// request did. The defect was a server component passing a FUNCTION prop to a
// client component, which React refuses at render time.
//
// The lesson generalizes past that one cause: for a force-dynamic page, the
// only thing that proves it renders is rendering it. So sweep them all. A 5xx
// here means a page is dead in production while every pre-merge gate is green.
const PUBLIC_PAGES = [
	"/",
	"/directory",
	"/entities",
	"/builders",
	"/partners",
	"/hackathons",
	"/leaderboard",
	"/stablecoins",
	"/analytics",
	"/blog",
	"/ideas",
	"/skills",
	"/scout",
	"/ask",
	"/submit",
];

async function everyPageRenders() {
	console.log("\n4. page-render sweep — every public page must return 200");
	for (const path of PUBLIC_PAGES) {
		try {
			const { status } = await getText(path);
			if (status === 200) ok(`${path} renders`);
			else
				bad(
					`${path} renders`,
					`HTTP ${status} — the page is broken in production; force-dynamic pages never render pre-merge, so no CI gate sees this`,
				);
		} catch (e) {
			bad(
				`${path} renders`,
				`probe failed: ${String((e as Error).message).slice(0, 80)}`,
			);
		}
	}
}

/** `total` must not depend on page size.
 *
 * route.ts states this invariant in prose twice and nothing checked it, which
 * is how a 2026-07-21 comment claiming the page-size dependence was fixed
 * outlived the fix by five weeks. `is USDC Swap live` reported 6 results at
 * limit=3 and 79 at limit=4, with the correct answer appearing only above the
 * threshold — an agent asking for three got a different corpus than one asking
 * for four.
 *
 * Measured against the KEYWORD-admitted set. The semantic top-up is a separate,
 * still-limit-dependent path (it is gated on `scored.length < limit` and sized
 * by the remainder), so asserting over the raw total would fail a correctly
 * fixed route. `meta.counts.semanticAdds` is subtracted where the API reports
 * it; a probe that cannot subtract is skipped rather than guessed at.
 */
async function totalIsLimitIndependent() {
	console.log("\ntotal is the same at every limit");
	for (const q of [
		"is USDC Swap live",
		"is Stellars Finance live",
		"is Stellar Wallets Kit live",
	]) {
		const seen = new Map<number, number>();
		let skipped = false;
		for (const limit of [3, 4, 7, 20]) {
			const { status, body } = await getJson(
				`/api/projects/search?q=${encodeURIComponent(q)}&limit=${limit}`,
			);
			if (status !== 200 || !body?.meta?.counts) {
				bad(`limit-independence: ${q}`, `HTTP ${status} at limit=${limit}`);
				skipped = true;
				break;
			}
			const total = Number(body.meta.counts.total ?? Number.NaN);
			// `counts.semantic`, which the route actually emits — the first
			// version read `counts.semanticAdds`, a field that exists only as an
			// internal variable name in route.ts, so `?? 0` meant it never
			// subtracted and never skipped: the probe was green without ever
			// exercising the exclusion it documents. Audit finding, 2026-08-31.
			const semRaw = body.meta.counts.semantic;
			if (!Number.isFinite(total)) {
				skipped = true;
				break;
			}
			// The route omits the field when no semantic rows were added; treat a
			// non-numeric presence as "cannot subtract" and skip, per the header.
			if (semRaw !== undefined && typeof semRaw !== "number" && typeof semRaw !== "boolean") {
				skipped = true;
				break;
			}
			const semantic = typeof semRaw === "number" ? semRaw : 0;
			seen.set(limit, total - semantic);
		}
		if (skipped) continue;
		const values = [...new Set(seen.values())];
		if (values.length === 1) {
			ok(`${q} — keyword total ${values[0]} at every limit`);
		} else {
			bad(
				`limit-independence: ${q}`,
				`keyword total changes with page size: ${[...seen]
					.map(([l, t]) => `limit=${l} -> ${t}`)
					.join(", ")}`,
			);
		}
	}
}

(async () => {
	console.log(`Live canary against ${BASE}`);
	await silentEmpty();
	await renderReachability();
	await knownAssetCoverage();
	await everyPageRenders();
	await totalIsLimitIndependent();
	console.log(`\n${passes} passed, ${failures} failed`);
	writeNightlyFindings("live-canary", failRows);
	process.exit(failures > 0 ? 1 : 0);
})();
