/**
 * Ingest curated Stellar/Soroban security INCIDENTS (live exploits + their
 * post-mortems) into the ResearchDocs corpus as first-class `incident` chunks.
 *
 * Why this exists: audits tell you what *might* go wrong; an incident tells you
 * what *did*. For a "is X safe to build on?" question, the single most decision-
 * relevant fact is whether the protocol was actually attacked — but a real
 * incident buried inside a generic "weekly roundup" chunk loses the vector race
 * to the protocol's audit reports, so an agent reassures on audits and misses
 * the exploit. A sharply-titled, incident-typed record ("<Protocol> —
 * oracle-manipulation incident") embeds close to safety queries and surfaces.
 *
 * These are CURATED (rare, high-value, manually verified) — not scraped — and
 * each record cites its real upstream source. We summarize from indexed
 * primary research; we never invent figures.
 *
 * Usage:
 *   pnpm exec tsx scripts/ingest-incidents.ts             # dry run (no DB, no embed)
 *   pnpm exec tsx scripts/ingest-incidents.ts --execute   # embed + write
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import {
	type AuditSeverity,
	chunkMarkdown,
	loadExistingChunks,
	type ResearchChunk,
	upsertChunks,
} from "../src/lib/research-ingest";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

interface IncidentSeed {
	/** Stable slug → parentDocId `incident-<id>`; changing it creates a new record. */
	id: string;
	protocol: string;
	severity: AuditSeverity;
	title: string;
	/** Real upstream source to cite. */
	url: string;
	/** ISO date the incident / its post-mortem was reported. */
	publishedAt: string;
	tags: string[];
	/** Markdown body. Keep as ONE section (no `##`) so the safety vocabulary
	 *  co-locates in a single embedding. */
	body: string;
}

const INCIDENTS: IncidentSeed[] = [
	{
		// NOTE the slug says "2026-05" but the EVENT is 2026-02-22 — the id is
		// a stable upsert key, NOT a fact. Keep it: renaming would create a new
		// row and leave the old wrong-facts row (sls-022, upstream #513) live
		// in the corpus forever (the ingest never deletes).
		id: "blend-2026-05-oracle-manipulation",
		protocol: "YieldBlox",
		severity: "critical",
		title:
			"YieldBlox (Blend V2 pool) — USTRY/Reflector oracle-misconfiguration drain (event 2026-02-22, ~$10.2M)",
		url: "https://www.blockaid.io/blog/73-quarantined-how-blockaid-and-stellar-validators-contained-a-10m-price-manipulation-attack",
		publishedAt: "2026-05-20",
		tags: [
			"incident",
			"yieldblox",
			"blend",
			"oracle",
			"reflector",
			"lending",
			"security",
			"ustry",
			"exploit",
		],
		// sls-022 fact discipline: event date ≠ publication date; token
		// quantities ≠ dated USD valuations; drain / quarantine / remediation /
		// recovery are SEPARATE states (quarantine is not recovery); the
		// misconfigured pool ≠ Blend core ≠ Reflector core ≠ Stellar protocol.
		body: `**Key facts.** Event date: 2026-02-22 (UTC). Retrospectives published later: BlockSec analysis 2026-02-26; Blockaid post-mortem 2026-05-20 — May is when the write-ups appeared, not when the exploit happened. Completed drain: 61,249,278 XLM plus approximately 1,000,197 USDC borrowed against fraudulently inflated collateral, roughly $10.2 million USD at the time (the 61M figure is an XLM quantity — rendering it as a dollar amount overstates the loss ~6x). Quarantine: Stellar Tier-1 validators later deployed transaction-filtering configuration that effectively quarantined about 48 million XLM (~$7.3 million) of the drained funds on-chain — quarantined funds are restricted, NOT returned; part of the remainder had already been bridged to Base, BSC, and Ethereum. Quarantine is not recovery, and no attacker-fund recovery is established by these sources.

**What happened.** An attacker manipulated the price of USTRY (Etherfuse's tokenized US-Treasury asset) on its very shallow USTRY/USDC market on the Stellar DEX, inflating it from roughly $1.06 to about $107 (~100x). The community-managed YieldBlox DAO lending pool — a Blend V2 pool deployment — priced USTRY collateral from that manipulable market via Reflector's volume-weighted feed, so the attacker deposited inflated USTRY and completed a drain of the pool's XLM and USDC before validator-level filtering restricted the attacker's accounts.

**Root cause.** A pool-operator (YieldBlox DAO) oracle configuration choice: pricing collateral from a thin, manipulable USTRY/USDC market through the Reflector feed. Per BlockSec, this was a pool configuration issue, not a flaw in the Blend V2 core contracts, in Reflector's own contracts, or in the Stellar protocol — none of those was exploited. Blockaid additionally notes Blend's oracle wrapper compared each new price only to the immediately preceding window, which a sustained multi-window manipulation defeats.

**Lesson for builders.** Any Soroban lending pool that prices collateral from a single thin-liquidity market inherits this risk regardless of audit history. Treat oracle feed liquidity, manipulation resistance, and fallback price validation as first-class security requirements when configuring a pool.

Sources: Blockaid post-mortem (2026-05-20, primary): blockaid.io/blog/73-quarantined-how-blockaid-and-stellar-validators-contained-a-10m-price-manipulation-attack; BlockSec analysis (2026-02-26): blocksec.com/blog/yieldblox-dao-incident-on-stellar-oracle-misconfiguration-enabled-a-10m-drain.`,
	},
];

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log(`curated incidents: ${INCIDENTS.length}\n`);

	const allChunks: ResearchChunk[] = [];
	for (const inc of INCIDENTS) {
		const parentDocId = `incident-${inc.id}`;
		const md = `# ${inc.title}\n\n${inc.body}`;
		const chunks = chunkMarkdown({
			md,
			parentDocId,
			title: inc.title,
			url: inc.url,
			tags: inc.tags,
			publishedAt: inc.publishedAt,
		});
		for (const c of chunks) {
			c.protocol = inc.protocol;
			c.severity = inc.severity;
		}
		allChunks.push(...chunks);
		console.log(
			`  [${inc.id}] ${inc.protocol} / ${inc.severity} → ${chunks.length} chunk(s)`,
		);
	}

	console.log(`\nChunks: ${allChunks.length} total`);

	if (!execute) {
		console.log("\nDry run — preview (no embed, no write):");
		for (const c of allChunks) {
			console.log(
				`   #${c.chunkIndex} [${c.protocol}/${c.severity}] ${c.content.length} chars — "${c.content.slice(0, 70).replace(/\n/g, " ")}…"`,
			);
		}
		console.log("\n--execute to embed + write.");
		return;
	}

	const payload = await getPayload({ config: configPromise });
	const existing = await loadExistingChunks(payload, "incident");
	const existingCount = [...existing.values()].reduce((s, m) => s + m.size, 0);
	console.log(`  ${existingCount} existing incident chunks in collection`);

	const r = await upsertChunks({
		payload,
		source: "incident",
		chunks: allChunks,
		existing,
	});
	console.log(
		`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — new: ${r.new}, updated: ${r.updated}, unchanged: ${r.unchanged}, errors: ${r.errors}`,
	);
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
