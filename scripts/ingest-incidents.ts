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
		id: "blend-2026-05-oracle-manipulation",
		protocol: "Blend",
		severity: "high",
		title:
			"Blend Protocol — oracle-manipulation incident (May 2026, attempted & contained)",
		url: "https://lumenloop.com/research/stellar-weekly-roundup-week-15-2026",
		publishedAt: "2026-05-22",
		tags: [
			"incident",
			"blend",
			"oracle",
			"reflector",
			"lending",
			"security",
			"ustry",
			"exploit",
		],
		body: `**Is Blend safe to build on?** Blend is one of the most-audited lending protocols on Stellar/Soroban (OtterSec, Certora, Code4rena), but in May 2026 it was the target of an attempted ~$10 million oracle-manipulation attack — so a "safe to build on?" assessment has to weigh this security incident, not only the audit history.

**What happened.** Security firm Blockaid published a detailed post-mortem on an attempted oracle-manipulation exploit against Blend. An attacker inflated the price of USTRY (Etherfuse's tokenized US-Treasury token) by roughly 100x by exploiting low-liquidity Reflector oracle price feeds, then used the fraudulently-inflated collateral to borrow about $61 million in XLM from Blend and began bridging the funds off-chain. Stellar validators coordinated in real time to quarantine approximately 48 million XLM on-chain before significant losses occurred — so the attack was largely contained rather than a completed theft.

**Root cause and lesson for builders.** Thin-liquidity oracle feeds remain a concrete exploit vector when a lending protocol lacks fallback price checks. The audited contract code did not prevent the manipulation, because the weakness was in the price-feed integration, not the core contracts. Any Soroban protocol that prices collateral from a single low-liquidity Reflector feed inherits this risk; treat oracle/feed liquidity and fallback price validation as a first-class security consideration rather than assuming audits alone cover this class of risk.

Source: Blockaid incident post-mortem, via LumenLoop Stellar Weekly Roundup (week of May 15, 2026).`,
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
