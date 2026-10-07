/**
 * Backfill publishedAt for sep/cap/paper research-docs chunks (corpus-health
 * S7: five sources served datedPct 0 while the date sat unread in the stored
 * content — SEP/CAP preambles state Created:/Updated:, the SCP whitepaper
 * states "Draft of February 25, 2016" on its own pages).
 *
 *   pnpm exec tsx scripts/backfill-corpus-dates.ts             # DRY RUN (default)
 *   pnpm exec tsx scripts/backfill-corpus-dates.ts --execute   # write + read back
 *
 * One date per parent doc, applied to EVERY chunk of the doc. Derivation uses
 * the SAME parsers the ingesters now use (src/lib/doc-dates.ts) — a date this
 * script writes is one the fixed ingest would write, by construction. Prefers
 * STORED content (the preamble section is its own chunk); re-fetches the
 * upstream stellar-protocol file only when no stored chunk yields a date.
 *
 * SAFE by construction:
 *   - dry-run prints every doc as `url → derived date` plus totals;
 *   - a write happens only when a date WAS derived and differs from the
 *     stored day — never nulls, never guesses;
 *   - content/embeddings untouched (no re-embed, no LLM);
 *   - --execute reads each write back (payload.update silently drops unknown
 *     keys — a read-back is the only proof) and exits 1 on any mismatch.
 */

import "./load-env";
import { getPayload } from "payload";
import { paperDate, preambleDate, toPublishedAt } from "../src/lib/doc-dates";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const SOURCES = ["sep", "cap", "paper"] as const;

interface Row {
	id: string;
	url: string;
	source: string;
	parentDocId: string;
	chunkIndex: number;
	content: string;
	publishedAt?: string | null;
}

/** github blob URL → raw URL, for the fetch fallback. Null when not that shape. */
function rawUrlOf(url: string): string | null {
	const m = url.match(
		/^https:\/\/github\.com\/stellar\/stellar-protocol\/blob\/master\/(.+)$/,
	);
	return m
		? `https://raw.githubusercontent.com/stellar/stellar-protocol/master/${m[1]}`
		: null;
}

async function deriveDate(
	source: string,
	chunks: Row[],
): Promise<string | null> {
	const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
	if (source === "paper")
		return paperDate(
			sorted
				.slice(0, 3)
				.map((c) => c.content)
				.join("\n"),
		);
	// sep/cap: the `## Preamble` section is its own chunk; the SEP:/CAP:
	// signature guard in preambleDate keeps prose mentions from matching.
	for (const c of sorted) {
		const d = preambleDate(c.content);
		if (d) return d;
	}
	// Stored content misses (legacy rows) → fetch the upstream file once.
	const raw = rawUrlOf(sorted[0].url);
	if (!raw) return null;
	try {
		const res = await fetch(raw, { headers: { "User-Agent": "stellarlight" } });
		if (!res.ok) return null;
		return preambleDate(await res.text());
	} catch {
		return null;
	}
}

/** Retry transient Mongo/Atlas network failures (pool-cleared, TLS alerts,
 * resets) with backoff. Two consecutive Action runs died FATAL on
 * "tlsv1 alert internal error" from the shared Atlas shard mid-run — the
 * flake is environmental and self-heals in seconds, so a bounded retry is
 * the difference between a rerun-the-whole-workflow night and a log line. */
const TRANSIENT =
	/PoolClearedError|MongoNetworkError|ECONNRESET|tlsv1|topology.*closed|ETIMEDOUT/i;
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
	const delays = [2000, 8000, 20000];
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			const msg = String((err as Error)?.message ?? err);
			if (attempt >= delays.length || !TRANSIENT.test(msg)) throw err;
			console.error(
				`  ~ transient (${label}, attempt ${attempt + 1}): ${msg.slice(0, 90)} — retrying in ${delays[attempt] / 1000}s`,
			);
			await new Promise((r) => setTimeout(r, delays[attempt]));
		}
	}
}

async function run() {
	console.log(
		`Corpus date backfill (S7) — ${EXECUTE ? "EXECUTE (writes + read-backs)" : "DRY RUN"}`,
	);
	const payload = await getPayload({ config: await configPromise });

	const rows: Row[] = [];
	for (const source of SOURCES) {
		for (let page = 1; ; page++) {
			const r = await withRetry(`read ${source} p${page}`, () =>
				payload.find({
					collection: "research-docs",
					where: { source: { equals: source } },
					limit: 1000,
					page,
					depth: 0,
					select: {
						url: true,
						source: true,
						parentDocId: true,
						chunkIndex: true,
						content: true,
						publishedAt: true,
					},
				}),
			);
			// biome-ignore lint/suspicious/noExplicitAny: narrow select shape
			rows.push(...(r.docs as any[]));
			if (!r.hasNextPage) break;
		}
	}
	console.log(`frame: ${rows.length} chunks across ${SOURCES.join("/")}`);

	const byDoc = new Map<string, Row[]>();
	for (const r of rows) {
		const k = `${r.source}:${r.parentDocId}`;
		byDoc.set(k, [...(byDoc.get(k) ?? []), r]);
	}

	const plan: Array<{ id: string; doc: string; to: string }> = [];
	let docsDated = 0;
	let docsUnderivable = 0;
	let chunksCorrect = 0;
	for (const [key, chunks] of byDoc) {
		const derived = await deriveDate(chunks[0].source, chunks);
		if (!derived) {
			docsUnderivable++;
			console.log(
				`  ${chunks[0].url} → NO DATE DERIVED (${chunks.length} chunks)`,
			);
			continue;
		}
		docsDated++;
		const stale = chunks.filter(
			(c) => (c.publishedAt ?? "").slice(0, 10) !== derived,
		);
		chunksCorrect += chunks.length - stale.length;
		for (const c of stale) plan.push({ id: c.id, doc: key, to: derived });
		console.log(
			`  ${chunks[0].url} → ${derived} (${stale.length}/${chunks.length} chunks to stamp)`,
		);
	}

	console.log(
		`\nTOTALS: ${docsDated} docs dated, ${docsUnderivable} underivable; ${plan.length} chunk(s) to stamp, ${chunksCorrect} already correct.`,
	);

	if (!EXECUTE) {
		console.log("Dry run. Pass --execute to write (with read-backs).");
		return;
	}

	let written = 0;
	const failed: string[] = [];
	for (const p of plan) {
		try {
			await withRetry(`write ${p.id}`, () =>
				payload.update({
					collection: "research-docs",
					id: p.id,
					data: { publishedAt: toPublishedAt(p.to) },
				}),
			);
			const back = await withRetry(`read-back ${p.id}`, () =>
				payload.findByID({
					collection: "research-docs",
					id: p.id,
					depth: 0,
					select: { publishedAt: true },
				}),
			);
			// biome-ignore lint/suspicious/noExplicitAny: narrow select shape
			const got = String((back as any)?.publishedAt ?? "").slice(0, 10);
			if (got !== p.to) throw new Error(`read-back mismatch: got "${got}"`);
			written++;
		} catch (err) {
			failed.push(`${p.doc}#${p.id}: ${(err as Error).message}`);
			console.error(`  ✗ ${p.doc} ${p.id}: ${(err as Error).message}`);
		}
	}
	console.log(
		`\nDONE: ${written}/${plan.length} chunk(s) stamped + read back verified; ${failed.length} failed.`,
	);
	if (failed.length) process.exitCode = 1;
}

run()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((err) => {
		console.error("FATAL:", err);
		process.exit(1);
	});
