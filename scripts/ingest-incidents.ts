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

import "./load-env";
import {
	type AuditSeverity,
	chunkMarkdown,
	loadExistingChunks,
	type ResearchChunk,
	upsertChunks,
} from "../src/lib/research-ingest";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
// --replan: dry + the DB diff, writes nothing — the refresh lane's
// Idempotence step (must plan 0 right after the execute pass).
const replan = args.includes("--replan");

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

export const INCIDENTS: IncidentSeed[] = [
	{
		// NOTE the slug says "2026-05" but the EVENT is 2026-02-22 — the id is
		// a stable upsert key, NOT a fact. Keep it: renaming would create a new
		// row and leave the old wrong-facts row (sls-022, upstream #513) live
		// in the corpus forever (the ingest never deletes).
		id: "blend-2026-05-oracle-manipulation",
		protocol: "YieldBlox",
		severity: "critical",
		title:
			"YieldBlox (Blend V2 pool) incident: USTRY oracle manipulation drain on 2026-02-22, attacker accounts frozen",
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
			"quarantine",
			"quorum-freeze",
			"cap-0077",
			"slp-0006",
		],
		// Re-read from primary records on 2026-11-23: the ledger (Horizon),
		// SLP-0006, and the live frozen ledger keys entry (Soroban RPC). sls-022
		// discipline holds: event date is not publication date, a token
		// quantity is not a dollar amount, and drain, quarantine and recovery
		// are separate states. Third-party USD totals are left out: no primary
		// source states one, and Blockaid's 10.2M does not match the DEX price
		// that hour (about 10.8M). USTRY price levels and the bridging of the
		// remainder (Blockaid, BlockSec) were not confirmed from a primary
		// record and are left out too.
		body: `**Key facts, checked against primary records on 2026-11-23.** Event date: 2026-02-22 (UTC). The pool contract CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS paid the attacker account GBO7VUL2TOKPWFAWKATIW7K3QYA7WQ63VDY5CAE6AFUUX6BHZBOC2WXC 1,000,196.7040837 USDC at 00:22:09 UTC (transaction ae721cacee382bdecac8d2c47286ecd42cb4711f658bb2aec7cba60dc64a31ff) and 61,249,278.3064502 XLM at 00:24:27 UTC (transaction 3e81a3f7b6e17cc22d0a1f33e9dcf90e5664b125b9e61f108b8d2f082f2d4657, ledger 61340408), borrowed against inflated USTRY collateral and never repaid. This was a completed drain. The 61,249,278 figure is an XLM quantity, not dollars: at the Stellar DEX XLM/USDC average for that hour (0.1606 USDC per XLM) the XLM was worth about 9.8 million USDC, about 10.8 million USD with the USDC.

**What happened.** SLP-0006, the validators' network configuration proposal, states that on February 22, 2026 an attacker manipulated the USTRY price feed used by the Stellar DEX Reflector oracle, and that the manipulated price was used against the YieldBlox V2 Blend pool. On the ledger the attacker account sent the pool 13,003.2374199 USTRY at 00:21:51 UTC and 140,000 USTRY at 00:24:10 UTC, each shortly before one of the two borrows above, then paid XLM out to other accounts between 00:29 and 02:46 UTC.

**Quarantine, then freeze.** Per SLP-0006, Tier 1 validators first quarantined the attacker accounts at the overlay layer, and the Script3 incident report it cites puts the XLM locked by that quarantine at about 48M. SLP-0006 (Final, created 2026-05-07) then froze three account entries through network configuration with the CAP-0077 frozen ledger key mechanism (Quorum Freeze): GBO7VUL2TOKPWFAWKATIW7K3QYA7WQ63VDY5CAE6AFUUX6BHZBOC2WXC (the exploit account), GATDQL767ZM2JQTBEG4BQ5WKOQNGAGWZDUN4GYT2UINPEU3RT2UAMVZH (received 3M and 5M XLM from it) and GCJOPSQNJDUYMWVJ3U7LYWWHM4N7NPWNF3RTOHB76PA67NH6DLWODES4 (received 500k XLM from GATD). On 2026-11-23 the network's frozen ledger keys configuration entry, read from three public Soroban RPC providers, lists all three, and Horizon shows them holding 48,069,119.80 XLM between them (45,068,299.88, 2,500,813.43 and 500,006.50). Quarantined or frozen funds are restricted, not returned: these sources record no recovery to the pool.

**Scope.** These primary records describe a manipulated price feed used against one community pool. None of them reports a flaw in the Blend V2 core contracts, in Reflector's contracts or in the Stellar protocol.

**Lesson for builders.** Any Soroban lending pool that prices collateral from a single thin market inherits this risk regardless of audit history. Treat oracle feed liquidity, manipulation resistance and fallback price checks as security requirements when configuring a pool.

**Write-ups.** Blockaid, which says it traced the attacker accounts for the validators, published its post-mortem on 2026-05-20 (this record's link). Its XLM and USDC quantities match the ledger. Third-party USD totals differ from each other and are not repeated here.

Sources, read 2026-11-23: SLP-0006 (github.com/stellar/stellar-protocol/blob/master/limits/slp-0006.md); Horizon horizon.stellar.org/transactions/ for both transactions above and horizon.stellar.org/accounts/GBO7VUL2TOKPWFAWKATIW7K3QYA7WQ63VDY5CAE6AFUUX6BHZBOC2WXC/operations; Horizon trade aggregations for XLM/USDC, hour of 2026-02-22 00:00 UTC; Soroban RPC getLedgerEntries for the frozen ledger keys configuration setting; Blockaid's post-mortem.`,
	},
	{
		id: "mercado-bitcoin-2026-11-wallet-drain",
		protocol: "Mercado Bitcoin",
		severity: "high",
		title:
			"Mercado Bitcoin incident: exchange wallets drained on 2026-11-02, attacker's Stellar account frozen",
		// The drain payment itself. SLP-0008's own URL is the slp row's; a
		// second row with the same URL drops to the leftovers in rank.
		url: "https://horizon.stellar.org/transactions/869b6976c19eb51e41d266aa4b5945ad1a63719c8a4dc70e19e41181be898238",
		publishedAt: "2026-11-02",
		tags: [
			"incident",
			"mercado-bitcoin",
			"exchange",
			"custody",
			"signing-keys",
			"security",
			"freeze",
			"quorum-freeze",
			"cap-0077",
			"slp-0008",
		],
		// Primary records only, read 2026-11-23: SLP-0008, Horizon, the live
		// frozen ledger keys entry. Left out: the cross-chain loss total (a
		// Hypernative estimate SLP-0008 quotes) and Mercado Bitcoin's own
		// statement (not reachable from here).
		body: `**Key facts, checked against primary records on 2026-11-23.** Event date: 2026-11-02 (UTC). SLP-0008, the validators' network configuration proposal (Final, created 2026-11-02), states that wallets attributed to Mercado Bitcoin, a Brazilian exchange, were drained across at least ten chains including Stellar. On Stellar, the Mercado Bitcoin wallet GDQE7YHNL7L7M664GJXU5VVEIBTYG44O3PHWVZCZJZQ2FDFO4S2XGAFE created the account GDXYRI6IONQA5YTGRLQ6O3FGJ2BWXPJTTQPUXFPSEXSRKBZLFKMZSOLP with 10 XLM at 06:27:24 UTC (transaction c1d6d3c0e327613a6c777d440f5e9670e60a362efe672ec7f81fafc01d67c810) and paid it 6,717,490 XLM at 06:28:19 UTC (transaction 869b6976c19eb51e41d266aa4b5945ad1a63719c8a4dc70e19e41181be898238). The ledger shows the same wallet also paid it 959,699.0552503 USDC at 06:37:29 UTC, 10,468.1435366 EURC at 06:37:44 UTC and 18,990.87 USDC at 06:47:34 UTC; SLP-0008 names only the XLM. Per SLP-0008, Hypernative attributes the receiving account to the attacker.

**What happened.** Per SLP-0008 the outflows were plain transfers signed with Mercado Bitcoin's keys. They were not an exploit of the Stellar protocol or of any smart contract, and how the attacker obtained signing access was not known when the proposal was written.

**Freeze.** At Mercado Bitcoin's request, SLP-0008 froze the receiving account's entry through network configuration with the CAP-0077 frozen ledger key mechanism (Quorum Freeze), the mechanism SLP-0006 used for the YieldBlox exploit accounts. The network's frozen ledger keys configuration entry was last changed in ledger 65273932 (closed 2026-11-02 21:41:38 UTC). Read from three public Soroban RPC providers on 2026-11-23, it lists this account and the three SLP-0006 accounts, and no others. SLP-0008 records the account's first outbound activity as a 5,000 XLM sale on the Stellar DEX (13:10:04 UTC, transaction 48c3935225e0fb7e5fbf2b4a32c31e69365c00fe4f25fc216e50ef565f421853, for 837.1110839 USDC). On 2026-11-23 Horizon shows it holding 6,712,500.00 XLM, 979,527.04 USDC and 10,468.14 EURC: everything it received, less that sale and fees. A frozen balance is restricted, not returned: these sources record no return to Mercado Bitcoin.

**For builders.** This was a custody failure at an exchange, not a Stellar or Soroban code flaw. Quorum Freeze kept the funds from leaving one Stellar account; it does not return them, and it reaches only Stellar, not the other chains drained the same day. Cross-chain loss totals are third-party estimates and are not repeated here.

Sources, read 2026-11-23: SLP-0008 (github.com/stellar/stellar-protocol/blob/master/limits/slp-0008.md); Horizon horizon.stellar.org/transactions/ for each transaction above, horizon.stellar.org/accounts/GDXYRI6IONQA5YTGRLQ6O3FGJ2BWXPJTTQPUXFPSEXSRKBZLFKMZSOLP/payments and horizon.stellar.org/ledgers/65273932; Soroban RPC getLedgerEntries for the frozen ledger keys configuration setting.`,
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

	if (!execute && !replan) {
		console.log("\nDry run — preview (no embed, no write):");
		for (const c of allChunks) {
			console.log(
				`   #${c.chunkIndex} [${c.protocol}/${c.severity}] ${c.content.length} chars — "${c.content.slice(0, 70).replace(/\n/g, " ")}…"`,
			);
		}
		console.log("\n--execute to embed + write.");
		return;
	}

	const { getPayload } = await import("payload");
	const configPromise = (await import("../src/payload.config")).default;
	const payload = await getPayload({ config: configPromise });
	const existing = await loadExistingChunks(payload, "incident");
	const existingCount = [...existing.values()].reduce((s, m) => s + m.size, 0);
	console.log(`  ${existingCount} existing incident chunks in collection`);

	const r = await upsertChunks({
		payload,
		source: "incident",
		chunks: allChunks,
		existing,
		dryRun: replan,
	});
	console.log(
		`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — new: ${r.new}, updated: ${r.updated}, unchanged: ${r.unchanged}, errors: ${r.errors}`,
	);
}

// Imported by the registry test: run only as the script.
if (process.argv[1]?.includes("ingest-incidents"))
	run()
		.then(() => process.exit(0))
		.catch((e) => {
			console.error("FATAL:", e);
			process.exit(1);
		});
