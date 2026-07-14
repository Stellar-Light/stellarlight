/**
 * Ingest canonical non-blog stellar.org ORGANIZATIONAL pages into the
 * ResearchDocs corpus as `sdf-org` records (sls-055 / #533).
 *
 * Why this exists: sls-020 patched the security-program pages and stopped;
 * sls-055 proved the class — the whole canonical organizational family was
 * absent. Scout's research lane routed SDF-organizational questions correctly
 * but had nothing quotable to serve: the Mandate page's "self-funded, pays
 * taxes" wording, the Terms page's Delaware-nonprofit wording, and the
 * Enterprise Fund page's venture-style / portfolio-over-$100m wording all
 * lived only on the live pages. The fix is a PAGE-FAMILY ingester driven by
 * the declarative CANONICAL_PAGES registry (src/lib/canonical-pages.ts) —
 * one mechanism for the whole family, guarded as a class by
 * scripts/eval/corpus-coverage-check.ts.
 *
 * Extraction: every registered page was verified server-rendered on
 * 2026-07-13 (signature phrases present in the raw HTML — no JS shell, unlike
 * the HackerOne policy which needed its GraphQL endpoint). Content is scoped
 * to the page's <main> element (drops header/footer chrome BEFORE the shared
 * boilerplate stripper runs), stripHtml'd, and chunked on H2 boundaries.
 *
 * Honesty rails:
 *   - A page whose extraction loses ANY registered signature phrase is
 *     REFUSED (error + skip, exit 1) — a renderer change or JS-shell
 *     migration must fail loudly, never silently ingest navigation.
 *   - publishedAt only when the page states a date (Terms' "EFFECTIVE DATE:
 *     MARCH 23, 2026" line). Undated pages stay undated (freshness neutral);
 *     historical mandates say "historical" in their titles instead of
 *     carrying invented dates. Crawl-observation time = each row's Payload
 *     `updatedAt` (set whenever ingest observes changed content).
 *
 * Usage:
 *   pnpm exec tsx scripts/ingest-sdf-org.ts             # dry run (fetch + chunk, no write)
 *   pnpm exec tsx scripts/ingest-sdf-org.ts --execute   # embed + write
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import {
	CANONICAL_PAGES,
	parseEffectiveDateLine,
} from "../src/lib/canonical-pages";
import {
	chunkMarkdown,
	loadExistingChunks,
	type ResearchChunk,
	stripHtml,
	upsertChunks,
} from "../src/lib/research-ingest";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

const BASE_TAGS = ["sdf-org", "sdf", "stellar-development-foundation"];

/** Extraction floor: below this the page is a shell/redirect, not content. */
const MIN_EXTRACTED_CHARS = 400;

async function fetchHtml(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { "User-Agent": "stellarlight-scout-ingest" },
	});
	if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status}`);
	return res.text();
}

/**
 * Scope to the page's <main> element. stellar.org pages carry the full nav +
 * footer outside <main>; scoping first keeps the shared boilerplate stripper
 * a second line of defense instead of the only one.
 */
export function extractMain(html: string): string | null {
	const m = html.match(/<main[\s\S]*?<\/main>/i);
	return m ? m[0] : null;
}

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");

	const rows = CANONICAL_PAGES.filter(
		(p) => p.ingestedBy === "ingest-sdf-org.ts",
	);
	console.log(`${rows.length} registered sdf-org pages\n`);

	const allChunks: ResearchChunk[] = [];
	const skips: string[] = [];

	for (const row of rows) {
		console.log(`[${row.id}] ${row.url}`);
		let html: string;
		try {
			html = await fetchHtml(row.url);
		} catch (err) {
			console.error(
				`  ✗ ${(err as Error).message} — SKIPPED (page kept out of corpus, guard will red)`,
			);
			skips.push(`${row.id}: fetch failed`);
			continue;
		}

		const main = extractMain(html);
		if (!main) {
			console.error(
				"  ✗ no <main> element — layout change or JS shell; SKIPPED (find the page's data endpoint like the HackerOne GraphQL precedent before re-adding)",
			);
			skips.push(`${row.id}: no <main>`);
			continue;
		}

		// Drop the in-page nav scaffold stellar.org renders at the top of <main>
		// ("Jump to...") so it never leads a chunk.
		const md = stripHtml(main).replace(/^Jump to\.\.\.\s*/i, "");
		if (md.length < MIN_EXTRACTED_CHARS) {
			console.error(
				`  ✗ extraction too thin (${md.length} chars < ${MIN_EXTRACTED_CHARS}) — likely a JS shell; SKIPPED`,
			);
			skips.push(`${row.id}: thin extraction`);
			continue;
		}

		const publishedAt =
			row.dateStrategy === "effective-date-line"
				? parseEffectiveDateLine(md)
				: undefined;
		if (row.dateStrategy === "effective-date-line" && !publishedAt) {
			console.error(
				"  ⚠ effective-date line not found — serving undated (wording changed?)",
			);
		}

		const chunks = chunkMarkdown({
			md,
			parentDocId: `sdf-org-${row.id}`,
			title: row.title,
			url: row.url,
			tags: [...BASE_TAGS, row.family, ...(row.tags ?? [])],
			publishedAt,
		});

		// Signature self-check on the CHUNKED output — exactly the contract
		// the corpus-coverage guard asserts later. Refuse to write a page
		// whose registered quotable wording didn't survive extraction.
		const union = chunks
			.map((c) => c.content)
			.join("\n")
			.toLowerCase();
		const missing = row.signatures.filter(
			(s) => !union.includes(s.toLowerCase()),
		);
		if (missing.length) {
			console.error(
				`  ✗ extraction lost registered signature(s): ${missing
					.map((s) => `"${s}"`)
					.join(
						", ",
					)} — SKIPPED (renderer change; fix extraction or update the registry from the live page)`,
			);
			skips.push(`${row.id}: lost signature`);
			continue;
		}

		console.log(
			`  → ${chunks.length} chunk(s), ${md.length} chars${publishedAt ? `, publishedAt ${publishedAt}` : ", undated"}`,
		);
		allChunks.push(...chunks);
	}

	console.log(
		`\nChunks: ${allChunks.length} total; skips: ${skips.length}${skips.length ? ` (${skips.join("; ")})` : ""}`,
	);

	if (!execute) {
		console.log("\nDry run — preview (no embed, no write):");
		for (const c of allChunks) {
			console.log(
				`   ${c.parentDocId}#${c.chunkIndex} [${c.publishedAt ?? "undated"}] ${c.content.length} chars — "${c.content.slice(0, 70).replace(/\n/g, " ")}…"`,
			);
		}
		console.log("\n--execute to embed + write.");
		if (skips.length) process.exitCode = 1;
		return;
	}

	const payload = await getPayload({ config: configPromise });
	const existing = await loadExistingChunks(payload, "sdf-org");
	const existingCount = [...existing.values()].reduce((s, m) => s + m.size, 0);
	console.log(`  ${existingCount} existing sdf-org chunks`);

	const r = await upsertChunks({
		payload,
		source: "sdf-org",
		chunks: allChunks,
		existing,
	});
	console.log(
		`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — new: ${r.new}, updated: ${r.updated}, unchanged: ${r.unchanged}, errors: ${r.errors}`,
	);
	if (r.errors > 0 || skips.length > 0) process.exitCode = 1;
}

run()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
