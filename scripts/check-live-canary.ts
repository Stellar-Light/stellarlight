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

(async () => {
	console.log(`Live canary against ${BASE}`);
	await silentEmpty();
	await renderReachability();
	console.log(`\n${passes} passed, ${failures} failed`);
	writeNightlyFindings("live-canary", failRows);
	process.exit(failures > 0 ? 1 : 0);
})();
