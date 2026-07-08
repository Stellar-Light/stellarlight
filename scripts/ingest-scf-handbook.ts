/**
 * Ingest the SCF Handbook (stellar.gitbook.io/scf-handbook) into the
 * ResearchDocs corpus.
 *
 * GitBook exposes a sitemap.xml listing every page; each page is HTML
 * that we strip + chunk like any other markdown source.
 *
 * Usage:
 *   npx tsx scripts/ingest-scf-handbook.ts             # dry run
 *   npx tsx scripts/ingest-scf-handbook.ts --execute   # write to Payload
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import {
	chunkMarkdown,
	fetchSitemapUrls,
	loadExistingChunks,
	stripHtml,
	upsertChunks,
} from "../src/lib/research-ingest";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

const BASE = "https://stellar.gitbook.io/scf-handbook";
const SITEMAP = `${BASE}/sitemap.xml`;

interface PageData {
	url: string;
	title: string;
	body: string;
}

async function fetchPage(url: string): Promise<PageData> {
	const res = await fetch(url, {
		headers: { "User-Agent": "stellarlight-scout-ingest" },
	});
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	const html = await res.text();
	const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
	const rawTitle = titleMatch ? titleMatch[1].trim() : url;
	// GitBook titles often look like "Page Name | SCF Handbook" — strip suffix
	const title = rawTitle.split(/\s+[|\-—]\s+/)[0].trim();

	// Try to scope to the main content area; fallback to whole body
	const mainMatch = html.match(/<main[\s\S]*?<\/main>/i);
	const body = stripHtml(mainMatch ? mainMatch[0] : html);
	return { url, title, body };
}

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log(`source: ${BASE}\n`);

	const payload = execute ? await getPayload({ config: configPromise }) : null;
	const existing = payload
		? await loadExistingChunks(payload, "scf-handbook")
		: new Map();
	if (payload) {
		const total = [...existing.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing chunks already in collection\n`);
	}

	console.log("Listing sitemap…");
	const urls = await fetchSitemapUrls(SITEMAP, BASE);
	console.log(`  ${urls.length} pages in sitemap`);

	const allChunks: ReturnType<typeof chunkMarkdown> = [];
	let pageErrors = 0;

	for (const url of urls) {
		try {
			const page = await fetchPage(url);
			if (page.body.length < 100) continue; // skip stubs/landing pages
			// parentDocId = slug derived from URL path
			const slug =
				url
					.replace(BASE, "")
					.replace(/^\//, "")
					.replace(/\/$/, "")
					.replace(/[^a-z0-9-/]/gi, "-")
					.toLowerCase() || "index";
			const chunks = chunkMarkdown({
				md: `# ${page.title}\n\n${page.body}`,
				parentDocId: slug,
				title: page.title,
				url,
				tags: ["scf-handbook", "scf", "governance"],
			});
			allChunks.push(...chunks);
		} catch (err) {
			console.error(`  ✗ ${url}: ${(err as Error).message}`);
			pageErrors += 1;
		}
	}

	const stats = {
		new: 0,
		updated: 0,
		unchanged: 0,
		toEmbed: 0,
	};
	for (const c of allChunks) {
		const prev = existing.get(c.parentDocId)?.get(c.chunkIndex);
		if (prev && prev.contentHash === c.contentHash) stats.unchanged += 1;
		else if (prev) {
			stats.updated += 1;
			stats.toEmbed += 1;
		} else {
			stats.new += 1;
			stats.toEmbed += 1;
		}
	}

	console.log(`\nChunks: ${allChunks.length} total`);
	console.log(`  new: ${stats.new}`);
	console.log(`  updated: ${stats.updated}`);
	console.log(`  unchanged: ${stats.unchanged}`);
	console.log(`  to embed: ${stats.toEmbed}`);
	console.log(`  page errors: ${pageErrors}`);

	if (!execute || !payload) {
		console.log("\nDry run complete. Pass --execute to embed + write.");
		return;
	}

	const r = await upsertChunks({
		payload,
		source: "scf-handbook",
		chunks: allChunks,
		existing,
	});
	console.log(
		`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — errors: ${r.errors}`,
	);
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
