/**
 * Re-derive citation-grade titles for research-docs rows the corpus-health S6
 * sweep flags (bare-date / overlong / sentence-like / html-entities / empty),
 * and remove S5 junk-URL leftovers (rows matching JUNK_URL_RE that the
 * ingesters now exclude but an earlier crawl wrote — e.g. /meetings/archive).
 *
 *   pnpm exec tsx scripts/fix-corpus-titles.ts             # DRY RUN (default)
 *   pnpm exec tsx scripts/fix-corpus-titles.ts --execute   # write + read back
 *
 * Generalizes scripts/fix-research-entity-titles.ts (entity class only) to the
 * FULL S6 classifier. Classifier and deriver both live in
 * src/lib/title-quality.ts — the exact functions the sweep
 * (scripts/eval/engine-b-corpus.ts) and the ingest choke point (chunkMarkdown)
 * use, so a title this script writes is one the sweep passes by construction.
 *
 * SAFE by construction:
 *   - a row is planned ONLY when its title fails titleIssue() AND the derived
 *     replacement is different, non-empty, and passes titleIssue();
 *   - content is never touched (embeddings hash content only — no re-embed);
 *   - dry-run prints EVERY proposed change as old → new;
 *   - --execute reads each write back (payload.update silently drops unknown
 *     keys — a read-back is the only proof) and exits 1 on any mismatch.
 */

import "./load-env";
import config from "@payload-config";
import { getPayload } from "payload";
import { JUNK_URL_RE } from "../src/lib/research-rank";
import { deriveCleanTitle, titleIssue } from "../src/lib/title-quality";

const EXECUTE = process.argv.includes("--execute");
const PAGE = 1000;

function selfCheck() {
	const cases: Array<{ title: string; url: string }> = [
		// One live specimen per S6 class (corpus-health-latest.json sample):
		{
			title: "America&#x27;s fifth-largest bank US Bancorp tests stablecoin",
			url: "https://lumenloop.com/news/america-fifth-largest-bank-us-bancorp-tests-stablecoin",
		},
		{
			title: "USDC deposits and withdrawals now available on Stellar!",
			url: "https://lumenloop.com/news/usdc-deposits-withdrawals-now-available-stellar",
		},
		{
			title:
				"Faraday vs Point‑Solutions: A comparison for handling stablecoin routing, compliance and settlement across many corridors",
			url: "https://lumenloop.com/news/faraday-vs-point-solutions-comparison-handling-stablecoin",
		},
		{
			title: "2026-04-16",
			url: "https://developers.stellar.org/meetings/2026-04-16",
		},
	];
	for (const c of cases) {
		if (!titleIssue(c.title, c.url))
			throw new Error(`selfCheck: classifier missed "${c.title}"`);
		const fixed = deriveCleanTitle(c.title, c.url);
		const residual = titleIssue(fixed, c.url);
		if (residual)
			throw new Error(`selfCheck: derived title still ${residual}: "${fixed}"`);
	}
	console.log("self-check ok\n");
}

async function main() {
	selfCheck();
	console.log(
		`Corpus title repair (S6) — ${EXECUTE ? "EXECUTE (writes + read-backs)" : "DRY RUN"}`,
	);
	const payload = await getPayload({ config });

	const plan: Array<{
		id: string | number;
		url: string;
		source: string;
		issue: string;
		from: string;
		to: string;
	}> = [];
	const unfixable: Array<{ url: string; title: string; issue: string }> = [];
	// S5 leftovers: rows whose URL the ingesters now refuse (JUNK_URL_RE) but
	// an earlier crawl wrote. Deleting them is what the sweep's "must be 0
	// post-prune" contract expects.
	const junk: Array<{ id: string | number; url: string; title: string }> = [];
	let scanned = 0;

	for (let page = 1; ; page++) {
		const res = await payload.find({
			collection: "research-docs",
			limit: PAGE,
			page,
			depth: 0,
			select: { title: true, url: true, source: true },
			overrideAccess: true,
		});
		for (const d of res.docs as Array<{
			id: string | number;
			title?: string;
			url?: string;
			source?: string;
		}>) {
			scanned++;
			const from = String(d.title ?? "");
			const url = String(d.url ?? "");
			if (JUNK_URL_RE.test(url)) {
				junk.push({ id: d.id, url, title: from.slice(0, 60) });
				continue; // junk rows get deleted, not retitled
			}
			const issue = titleIssue(from, url);
			if (!issue) continue;
			const to = deriveCleanTitle(from, url);
			if (to === from || !to.trim() || titleIssue(to, url)) {
				unfixable.push({ url, title: from.slice(0, 80), issue });
				continue;
			}
			plan.push({
				id: d.id,
				url,
				source: String(d.source ?? ""),
				issue,
				from,
				to,
			});
		}
		if (!res.hasNextPage) break;
	}

	// Titles repeat across every chunk of a doc — group by (from → to) for
	// review; the plan still carries every row id.
	const byChange = new Map<
		string,
		{
			from: string;
			to: string;
			issue: string;
			source: string;
			url: string;
			rows: number;
		}
	>();
	for (const p of plan) {
		const key = `${p.from} → ${p.to}`;
		const g = byChange.get(key) ?? {
			from: p.from,
			to: p.to,
			issue: p.issue,
			source: p.source,
			url: p.url,
			rows: 0,
		};
		g.rows++;
		byChange.set(key, g);
	}

	console.log(
		`Scanned ${scanned} chunks — ${plan.length} row(s) across ${byChange.size} distinct title(s) to fix; ${unfixable.length} unfixable; ${junk.length} junk-URL row(s) to DELETE (S5).\n`,
	);
	if (junk.length) {
		console.log(
			"S5 JUNK-URL rows (ingest now excludes these; delete leftovers):",
		);
		for (const j of junk) console.log(`  DELETE [${j.title}] ${j.url}`);
		console.log("");
	}
	for (const g of byChange.values()) {
		console.log(
			`  [${g.issue}] ${g.source} (${g.rows} row${g.rows === 1 ? "" : "s"}) ${g.url}`,
		);
		console.log(`    "${g.from}"`);
		console.log(`    → "${g.to}"`);
	}
	if (unfixable.length) {
		console.log("\nUNFIXABLE (left untouched — need a manual look):");
		for (const u of unfixable)
			console.log(`  [${u.issue}] "${u.title}" ${u.url}`);
	}

	if (!EXECUTE) {
		console.log(
			`\nDRY RUN — no writes. Re-run with --execute to retitle ${plan.length} row(s) and delete ${junk.length} junk row(s).`,
		);
		return;
	}

	let written = 0;
	const failed: Array<{ id: string | number; error: string }> = [];
	for (const p of plan) {
		try {
			await payload.update({
				collection: "research-docs",
				id: p.id,
				data: { title: p.to },
				overrideAccess: true,
				depth: 0,
			});
			// Read-back proof: payload.update silently drops unknown keys and can
			// report success without persisting — only a fresh read is evidence.
			const back = await payload.findByID({
				collection: "research-docs",
				id: p.id,
				depth: 0,
				select: { title: true },
				overrideAccess: true,
			});
			// biome-ignore lint/suspicious/noExplicitAny: narrow select shape
			const got = String((back as any)?.title ?? "");
			if (got !== p.to) throw new Error(`read-back mismatch: got "${got}"`);
			written++;
		} catch (err) {
			failed.push({ id: p.id, error: String(err) });
		}
	}
	// S5 junk-row deletion, read-back-verified: after delete, findByID must
	// come back empty — a row that still reads back means the delete lied.
	let deleted = 0;
	for (const j of junk) {
		try {
			await payload.delete({
				collection: "research-docs",
				id: j.id,
				overrideAccess: true,
			});
			let still: unknown = null;
			try {
				still = await payload.findByID({
					collection: "research-docs",
					id: j.id,
					depth: 0,
					overrideAccess: true,
					disableErrors: true,
				});
			} catch {
				still = null; // NotFound = the delete really happened
			}
			if (still) throw new Error("read-back: row still present after delete");
			deleted++;
		} catch (err) {
			failed.push({ id: j.id, error: String(err) });
		}
	}
	console.log(
		`\nDONE: ${written}/${plan.length} retitled + read back verified; ${deleted}/${junk.length} junk rows deleted + verified gone; ${failed.length} failed.`,
	);
	for (const f of failed) console.log(`  FAILED ${f.id}: ${f.error}`);
	if (failed.length) process.exitCode = 1;
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
