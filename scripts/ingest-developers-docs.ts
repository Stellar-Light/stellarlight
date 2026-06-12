/**
 * Ingest developers.stellar.org pages into the ResearchDocs corpus.
 *
 * Uses the sitemap to enumerate every page, strips HTML, chunks, embeds.
 *
 * Usage:
 *   npx tsx scripts/ingest-developers-docs.ts             # dry run
 *   npx tsx scripts/ingest-developers-docs.ts --execute   # write to Payload
 *   npx tsx scripts/ingest-developers-docs.ts --limit=20  # cap pages
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
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 500;

const BASE = "https://developers.stellar.org";
const SITEMAP = `${BASE}/sitemap.xml`;

async function fetchHtml(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { "User-Agent": "stellarlight-scout-ingest" },
	});
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	return res.text();
}

interface PageData {
	url: string;
	title: string;
	body: string;
}

/**
 * A page title that tells a reader nothing about the content — bare dates
 * ("2026-04-16"), tag-index listings ("58 posts tagged developer"), generic
 * section indexes ("Meeting Notes"). These come from listing/archive pages
 * whose <title> is navigation, not a description. When we hit one we salvage
 * a real title from the page's first content heading instead, so a retrieved
 * chunk carries a usable citation (the "artifact" Tyler's agent needs).
 */
function isJunkyDocTitle(t: string): boolean {
	const s = t.trim();
	return (
		s.length < 3 ||
		/^\d{4}-\d{2}-\d{2}$/.test(s) ||
		/^\d+\s+posts?\s+tagged/i.test(s) ||
		/^meeting notes$/i.test(s)
	);
}

function firstHeading(body: string): string | null {
	const m = body.match(/^#{1,6}\s+(.+)$/m);
	if (!m) return null;
	return m[1].trim().replace(/​/g, "").trim() || null;
}

async function fetchPage(url: string): Promise<PageData> {
	const html = await fetchHtml(url);
	const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
	const rawTitle = titleMatch ? titleMatch[1].trim() : url;
	let title = rawTitle
		.split(/\s+[|\-—]\s+/)[0]
		.replace(/\s+\|.*$/, "")
		.trim();

	const main =
		html.match(/<main[\s\S]*?<\/main>/i) ||
		html.match(/<article[\s\S]*?<\/article>/i);
	const body = stripHtml(main ? main[0] : html);

	// Salvage a descriptive title from the body when the <title> is nav junk.
	if (isJunkyDocTitle(title)) {
		const h = firstHeading(body);
		if (h && !isJunkyDocTitle(h)) title = h;
	}

	return { url, title, body };
}

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log(`source: ${BASE}\n`);

	const payload = execute ? await getPayload({ config: configPromise }) : null;
	const existing = payload
		? await loadExistingChunks(payload, "dev-docs")
		: new Map();
	if (payload) {
		const total = [...existing.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing chunks in collection\n`);
	}

	console.log("Listing sitemap…");
	const allUrls = await fetchSitemapUrls(SITEMAP, BASE);
	const urls = allUrls.slice(0, limit);
	console.log(`  ${urls.length} pages (cap ${limit})`);

	const allChunks: ReturnType<typeof chunkMarkdown> = [];
	let pageErrors = 0;

	for (const url of urls) {
		try {
			const page = await fetchPage(url);
			if (page.body.length < 150) continue;
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
				tags: ["dev-docs", "stellar-docs"],
			});
			allChunks.push(...chunks);
		} catch (err) {
			console.error(`  ✗ ${url}: ${(err as Error).message}`);
			pageErrors += 1;
		}
	}

	const stats = { new: 0, updated: 0, unchanged: 0, toEmbed: 0 };
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
	console.log(
		`  new: ${stats.new} | updated: ${stats.updated} | unchanged: ${stats.unchanged}`,
	);
	console.log(`  to embed: ${stats.toEmbed} | page errors: ${pageErrors}`);

	if (!execute || !payload) {
		console.log("\nDry run. --execute to embed + write.");
		return;
	}

	const r = await upsertChunks({
		payload,
		source: "dev-docs",
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
