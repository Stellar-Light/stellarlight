/**
 * Prune low-value chunks already embedded in the research corpus.
 *
 *   node --env-file=.env.local --import tsx scripts/prune-low-value-chunks.ts          # DRY RUN (default)
 *   node --env-file=.env.local --import tsx scripts/prune-low-value-chunks.ts --apply  # actually delete
 *
 * The ingest pipeline now drops nav/breadcrumb/date-only chunks at write
 * time (research-ingest.ts → isLowValueChunk), but chunks embedded BEFORE
 * that filter existed are still in Atlas and still polluting vector results
 * (the "58 posts tagged developer" / bare-date / breadcrumb-stub chunks the
 * golden eval flagged). This walks the whole collection, applies the exact
 * same isLowValueChunk rule, and deletes the matches.
 *
 * Dry run prints every candidate (source · title · content preview) so a
 * human can confirm only junk is targeted before `--apply`. Deletion uses
 * overrideAccess (the collection forbids REST writes); embeddings are dropped
 * with the row, no re-embed cost.
 */

import config from "@payload-config";
import { config as loadEnv } from "dotenv";
import { getPayload } from "payload";
import { isLowValueChunk } from "../src/lib/research-ingest";

loadEnv({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const PAGE = 500;

// Sanity self-check: never run the pruner if the rule misclassifies known
// good/junk samples. Guards against a regex edit silently nuking real content.
function selfCheck() {
	const good = [
		"## Agentic Payments\n\nx402 is an HTTP-native protocol that lets an API charge an AI agent per request using a 402 Payment Required response and a Stellar payment.",
		"## Increment a counter\n\n```rust\n#[contractimpl]\npub fn increment(env: Env) -> u32 { let mut c = ... }\n```\nThe contract reads the current value, adds one, stores it, and returns it.",
		"## Trustlines\n\nA trustline is an explicit opt-in to hold a given asset from a given issuer. Without one, an account cannot receive that asset.",
		// Real bulleted/numbered content the first cut wrongly flagged — must KEEP.
		"## Upcoming Events - May 15 - Stellar Chile Community Call (Discord) - May 22 - Soroban Workshop - May 29 - SDF Office Hours on anchors and SEP-24",
		"## 2.3 Methodology 1. Discovery and set-up phase; 2. Manual code review of the Soroban contracts; 3. Functional testing against the spec",
		"## 3.2 Medium Risk +pub fn total_supply(e:&Env)->i128 { Base::total_supply(e) } the finding adds a missing supply accessor to the token contract",
	];
	const junk = [
		'# 58 posts tagged with "developer"\n\n- A\n- B\n- C',
		"# x402 on Stellar\n\n- Agentic Payments\n- x402 on Stellar\n\nOn this page\n\n# x402 on Stellar",
		"## 2026-04-16",
		"2026-04-16",
		"## Meeting Notes",
		// Docusaurus card-link teasers (📄️) — nav stubs that crowd real guides.
		"## 📄️ Integrate Freighter with a React dapp\n\nIntegrate the Freighter wallet into a React dapp and submit a transaction.",
		"## 📄️ Sign authorization entries\n\nUse Freighter's API to sign.\n## 📄️ Send Soroban token payments\n\nSend a payment.",
	];
	const badGood = good.filter((g) => isLowValueChunk(g));
	const badJunk = junk.filter((j) => !isLowValueChunk(j));
	if (badGood.length || badJunk.length) {
		console.error("SELF-CHECK FAILED — refusing to run.");
		if (badGood.length) console.error("  good wrongly flagged junk:", badGood);
		if (badJunk.length) console.error("  junk wrongly kept:", badJunk);
		process.exit(1);
	}
	console.log("self-check ok (3 good kept, 5 junk flagged)\n");
}

async function main() {
	selfCheck();

	const payload = await getPayload({ config });
	const bySource: Record<string, number> = {};
	const samples: Array<{ source: string; title: string; preview: string }> = [];
	const victims: string[] = [];
	let scanned = 0;
	let page = 1;

	for (;;) {
		const res = await payload.find({
			collection: "research-docs",
			limit: PAGE,
			page,
			depth: 0,
			// only the fields we need to classify
			select: { content: true, source: true, title: true },
		});
		for (const doc of res.docs) {
			scanned++;
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			const d = doc as any;
			if (isLowValueChunk(String(d.content ?? ""))) {
				victims.push(d.id);
				bySource[d.source] = (bySource[d.source] ?? 0) + 1;
				if (samples.length < 200) {
					samples.push({
						source: d.source,
						title: String(d.title ?? "").slice(0, 40),
						preview: String(d.content ?? "")
							.replace(/\s+/g, " ")
							.slice(0, 70),
					});
				}
			}
		}
		if (!res.hasNextPage) break;
		page++;
	}

	console.log(`Scanned ${scanned} chunks · ${victims.length} low-value\n`);
	console.log("By source:");
	for (const [s, n] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
		console.log(`  ${s.padEnd(22)} ${n}`);
	}
	console.log("\nSample of what would be removed:");
	for (const s of samples) {
		console.log(`  [${s.source}] ${s.title}  ·  "${s.preview}"`);
	}

	if (!APPLY) {
		console.log(
			`\nDRY RUN — nothing deleted. Re-run with --apply to remove ${victims.length} chunks.`,
		);
		process.exit(0);
	}

	console.log(`\nDeleting ${victims.length} chunks…`);
	let deleted = 0;
	for (const id of victims) {
		try {
			await payload.delete({
				collection: "research-docs",
				id,
				overrideAccess: true,
			});
			deleted++;
		} catch (e) {
			console.error(`  failed ${id}:`, e instanceof Error ? e.message : e);
		}
	}
	console.log(`Done. Deleted ${deleted}/${victims.length}.`);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
