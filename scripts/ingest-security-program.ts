/**
 * Ingest SDF's SECURITY-PROGRAM policy surface (bug bounty / vulnerability
 * disclosure) into the ResearchDocs corpus as `security-program` records.
 *
 * Why this exists (sls-020): the corpus had NO source covering which bounty
 * program is CURRENT, while searchResearch's x-routing advertised "bug
 * bounty". Effective 2026-05-07 SDF consolidated its programs into a single
 * HackerOne program; the general Stellar Immunefi program is deprecated (its
 * page now 404s) while the separate OpenZeppelin-on-Stellar Immunefi bounty
 * remains active — and the SDF landing page still advertises the OLD state.
 * A consumer without a dated controlling record double-counts programs or
 * directs reports to a retired intake.
 *
 * Sources (verified live 2026-07-13):
 *   1. The controlling HackerOne program policy. hackerone.com/stellar is a
 *      JS-only shell over HTML, but HackerOne's public GraphQL endpoint
 *      serves the full policy markdown unauthenticated — fetched live so
 *      upstream policy edits flow in on the daily refresh. `publishedAt` is
 *      parsed from the policy's own "Effective 7 MAY 2026" transition line.
 *   2. A CURATED supersession record for the stale SDF landing page
 *      (stellar.org/grants-and-funding/bug-bounty): labels that page's
 *      program list as superseded for program-status claims, and carries the
 *      deprecated-Immunefi + active-OpenZeppelin-carve-out facts with an
 *      as-of date (same curated pattern as ingest-incidents.ts).
 *
 * Usage:
 *   pnpm exec tsx scripts/ingest-security-program.ts             # dry run
 *   pnpm exec tsx scripts/ingest-security-program.ts --execute   # embed + write
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import {
	chunkMarkdown,
	loadExistingChunks,
	type ResearchChunk,
	upsertChunks,
} from "../src/lib/research-ingest";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

const HACKERONE_GRAPHQL = "https://hackerone.com/graphql";
const HACKERONE_PROGRAM_URL = "https://hackerone.com/stellar";
const SDF_LANDING_URL = "https://stellar.org/grants-and-funding/bug-bounty";

const TAGS = [
	"security-program",
	"bug-bounty",
	"hackerone",
	"immunefi",
	"vulnerability-disclosure",
	"openzeppelin",
	"sdf",
	"security",
];

/** Fetch the live HackerOne program policy markdown via public GraphQL. */
async function fetchHackerOnePolicy(): Promise<string | null> {
	try {
		const res = await fetch(HACKERONE_GRAPHQL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"User-Agent": "stellarlight-scout-ingest",
			},
			body: JSON.stringify({
				query: 'query { team(handle: "stellar") { policy } }',
			}),
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const json = (await res.json()) as {
			data?: { team?: { policy?: string } };
		};
		const policy = json.data?.team?.policy;
		return policy && policy.length > 500 ? policy : null;
	} catch (err) {
		console.error(`  ✗ HackerOne policy fetch: ${(err as Error).message}`);
		return null;
	}
}

const MONTHS: Record<string, string> = {
	jan: "01",
	feb: "02",
	mar: "03",
	apr: "04",
	may: "05",
	jun: "06",
	jul: "07",
	aug: "08",
	sep: "09",
	oct: "10",
	nov: "11",
	dec: "12",
};

/**
 * Parse the policy's own effective date ("Effective 7 MAY 2026, SDF has
 * consolidated…") → "2026-05-07". Returns undefined when the wording changes
 * — an unproven date must not be served (freshness falls back to neutral).
 */
export function parseEffectiveDate(policy: string): string | undefined {
	const m = policy.match(
		/Effective\s+(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/i,
	);
	if (!m) return undefined;
	const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
	if (!month) return undefined;
	return `${m[3]}-${month}-${m[1].padStart(2, "0")}`;
}

/**
 * Curated supersession/status record. Facts verified 2026-07-13 against the
 * live HackerOne policy (transition paragraph), immunefi.com (stellar program
 * page 404s; openzeppelin-stellar page live), and the SDF landing page (still
 * lists both programs — the staleness this record labels).
 */
const SDF_LANDING_SUPERSESSION = {
	id: "sdf-bug-bounty-consolidation-2026-05-07",
	title:
		"SDF bug-bounty consolidation (effective 2026-05-07): single HackerOne program; stellar.org landing page superseded",
	url: SDF_LANDING_URL,
	publishedAt: "2026-05-07",
	body: `**Program status (as of 2026-07-13).** Effective 7 May 2026 (2026-05-07), the Stellar Development Foundation consolidated its bug bounty programs into a single HackerOne program: hackerone.com/stellar. All new vulnerability reports should be submitted through HackerOne.

**Deprecated: the general Stellar Immunefi program.** The former Stellar bug bounty on Immunefi (immunefi.com/bug-bounty/stellar) is deprecated — the page no longer resolves (404 as of 2026-07-13). Per the controlling HackerOne policy, reports previously submitted through Immunefi continue to be honored and processed under the terms in effect at the time of submission.

**Still active and separate: OpenZeppelin on Stellar.** The OpenZeppelin-on-Stellar bounty on Immunefi (immunefi.com/bug-bounty/openzeppelin-stellar) is a distinct program covering the OpenZeppelin Stellar Contracts and remains active. It is expressly OUTSIDE the SDF consolidation: the HackerOne policy states it does not modify, supersede, or administer any separate OpenZeppelin Stellar Contracts bounty unless SDF expressly states otherwise in writing.

**This page is superseded for program-status claims.** The SDF landing page at stellar.org/grants-and-funding/bug-bounty still describes both the HackerOne and Immunefi intakes without the consolidation. For which program is current and where to report, the dated HackerOne program policy (hackerone.com/stellar) is the controlling source — do not read the landing page's program list as current truth, and do not double-count the deprecated general Immunefi program alongside HackerOne.`,
};

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");

	const allChunks: ResearchChunk[] = [];
	let errors = 0;

	// 1. Live HackerOne policy (the controlling document).
	console.log("Fetching HackerOne program policy (public GraphQL)…");
	const policy = await fetchHackerOnePolicy();
	if (policy) {
		const publishedAt = parseEffectiveDate(policy);
		console.log(
			`  ${policy.length} chars; effective date ${publishedAt ?? "NOT FOUND (serving undated)"}`,
		);
		const chunks = chunkMarkdown({
			// No prepended H1: the policy opens with its own "## Overview", and a
			// title-only lead chunk is exactly the thin header stub the corpus
			// hygiene rules exist to keep out (the title field carries the title).
			md: policy,
			parentDocId: "security-program-hackerone-stellar",
			title:
				"Stellar Bug Bounty Program — SDF consolidated HackerOne program policy",
			url: HACKERONE_PROGRAM_URL,
			tags: TAGS,
			publishedAt,
		});
		allChunks.push(...chunks);
		console.log(`  → ${chunks.length} chunk(s)`);
	} else {
		// The curated record below still covers the consolidation facts.
		console.error("  ✗ policy unavailable — curated record still ingested");
		errors += 1;
	}

	// 2. Curated supersession record for the stale SDF landing page.
	{
		const rec = SDF_LANDING_SUPERSESSION;
		const chunks = chunkMarkdown({
			md: `# ${rec.title}\n\n${rec.body}`,
			parentDocId: `security-program-${rec.id}`,
			title: rec.title,
			url: rec.url,
			tags: TAGS,
			publishedAt: rec.publishedAt,
		});
		allChunks.push(...chunks);
		console.log(`  [${rec.id}] → ${chunks.length} chunk(s)`);
	}

	console.log(`\nChunks: ${allChunks.length} total`);

	if (!execute) {
		console.log("\nDry run — preview (no embed, no write):");
		for (const c of allChunks) {
			console.log(
				`   ${c.parentDocId}#${c.chunkIndex} [${c.publishedAt ?? "undated"}] ${c.content.length} chars — "${c.content.slice(0, 70).replace(/\n/g, " ")}…"`,
			);
		}
		console.log("\n--execute to embed + write.");
		return;
	}

	const payload = await getPayload({ config: configPromise });
	const existing = await loadExistingChunks(payload, "security-program");
	const existingCount = [...existing.values()].reduce((s, m) => s + m.size, 0);
	console.log(`  ${existingCount} existing security-program chunks`);

	const r = await upsertChunks({
		payload,
		source: "security-program",
		chunks: allChunks,
		existing,
	});
	console.log(
		`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — new: ${r.new}, updated: ${r.updated}, unchanged: ${r.unchanged}, errors: ${r.errors + errors}`,
	);
	if (r.errors + errors > 0) process.exitCode = 1;
}

run()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
