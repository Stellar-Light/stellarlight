/**
 * Ingest the Stellar Development Foundation blog (stellar.org/blog) into
 * the ResearchDocs corpus.
 *
 * stellar.org doesn't expose a discoverable RSS, but the blog landing
 * pages list posts. We crawl the index pages, follow into each post,
 * strip HTML, chunk, embed.
 *
 * Usage:
 *   npx tsx scripts/ingest-sdf-blog.ts             # dry run
 *   npx tsx scripts/ingest-sdf-blog.ts --execute   # write to Payload
 *   npx tsx scripts/ingest-sdf-blog.ts --limit=10  # only first 10 posts
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import { decodeHtmlEntities } from "../src/lib/decode-entities";
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

const BASE = "https://stellar.org";

async function fetchHtml(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { "User-Agent": "stellarlight-scout-ingest" },
	});
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	return res.text();
}

/**
 * Find all blog post URLs from the index pages (paginated).
 *
 * sls-006: the old single-segment regex (`/blog/[a-z0-9-]+`) missed every
 * article nested under a category path (`/blog/developers/q1-2026-…`) — the
 * flagship quarterly reports were absent from the corpus entirely — while
 * MATCHING the category listing pages themselves (`/blog/press`), which then
 * got ingested as "posts" whose bodies are just lists of titles. Nested paths
 * are now followed; listing pages are excluded here by pattern and again at
 * fetch time by page classification.
 */
async function listBlogPosts(): Promise<string[]> {
	// Primary discovery: the sitemap. stellar.org/sitemap.xml lists ~555 blog
	// URLs — ~550 of them nested under category paths the old regex never
	// matched, i.e. the corpus was missing nearly the ENTIRE blog, not just
	// the Q1 report sls-006 flagged. Index-page crawling below stays as a
	// fallback/union for anything the sitemap lags on.
	const seen = new Set<string>();
	try {
		const urls = await fetchSitemapUrls(`${BASE}/sitemap.xml`, `${BASE}/blog/`);
		for (const u of urls) {
			const clean = u.replace(/\/$/, "");
			if (clean === `${BASE}/blog`) continue;
			if (clean.match(/\/page\/\d+/) || clean.match(/\/tags?\//)) continue;
			seen.add(clean);
		}
		console.log(`  sitemap: ${seen.size} blog URLs`);
	} catch {
		// fall through to index crawl
	}
	for (let page = 1; page <= 30; page++) {
		const url = page === 1 ? `${BASE}/blog` : `${BASE}/blog/page/${page}`;
		try {
			const html = await fetchHtml(url);
			const matches = [
				...html.matchAll(
					/href=["'](\/blog\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)["']/gi,
				),
			];
			let pageNew = 0;
			for (const m of matches) {
				const full = `${BASE}${m[1].replace(/\/$/, "")}`;
				if (full === `${BASE}/blog`) continue;
				if (full.match(/\/page\/\d+/)) continue;
				if (full.match(/\/tags?\//)) continue; // tag/filter listings
				if (!seen.has(full)) {
					seen.add(full);
					pageNew += 1;
				}
			}
			if (pageNew === 0 && page > 1) break; // no new posts on this page
		} catch {
			break;
		}
	}
	return Array.from(seen);
}

interface Post {
	url: string;
	title: string;
	body: string;
	publishedAt?: string;
	/**
	 * sls-006: listing/category/tag pages classify as non-articles — they have
	 * no article:published_time and no og:type=article, and their "bodies" are
	 * just lists of other posts' titles. They pollute retrieval (queries for a
	 * report return the index page that merely NAMES it) and must not chunk.
	 */
	isArticle: boolean;
}

async function fetchPost(url: string): Promise<Post> {
	const html = await fetchHtml(url);
	const titleMatch =
		html.match(
			/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
		) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
	// Brand-segment cleanup, BOTH orderings: developers posts use
	// "Real Title | Stellar", but foundation-news uses "Stellar | Real Title" —
	// the old suffix-only strip matched the FIRST " | Stellar" there and
	// deleted the whole real title, leaving ~50 posts titled just "Stellar"
	// (the Protocol 27 "Zipper" upgrade guide was invisible to retrieval:
	// title carries 3x keyword weight).
	const cleanTitle = (raw: string): string => {
		// Decode HTML entities FIRST (S6 hygiene): scraped og:title/<title> carries
		// raw "&#x27;"/"&amp;" — a title is the citation an agent shows, so it must
		// be human-readable, not markup. Then the brand-segment cleanup below.
		const t = decodeHtmlEntities(raw).trim();
		if (/^Stellar\s*\|\s*\S/i.test(t))
			return t.replace(/^Stellar\s*\|\s*/i, "").trim();
		return t.replace(/\s+\|\s+Stellar.*$/i, "").trim();
	};
	const title = titleMatch ? cleanTitle(titleMatch[1]) : url;

	const dateMatch =
		html.match(
			/<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i,
		) || html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
	const publishedAt = dateMatch ? dateMatch[1] : undefined;

	const ogType = html.match(
		/<meta\s+property=["']og:type["']\s+content=["']([^"']+)["']/i,
	)?.[1];
	const isArticle = Boolean(publishedAt) || ogType === "article";

	const main =
		html.match(/<article[\s\S]*?<\/article>/i) ||
		html.match(/<main[\s\S]*?<\/main>/i);
	const body = stripHtml(main ? main[0] : html);
	return { url, title, body, publishedAt, isArticle };
}

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log(`source: ${BASE}/blog\n`);

	const payload = execute ? await getPayload({ config: configPromise }) : null;
	const existing = payload
		? await loadExistingChunks(payload, "sdf-blog")
		: new Map();
	if (payload) {
		const total = [...existing.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing chunks in collection\n`);
	}

	console.log("Listing blog posts…");
	const allUrls = await listBlogPosts();
	const urls = allUrls.slice(0, limit);
	console.log(`  ${urls.length} posts (capped at --limit=${limit})`);

	const allChunks: ReturnType<typeof chunkMarkdown> = [];
	let postErrors = 0;
	// sls-006: pages fetched this run and classified as listings — their
	// previously-ingested chunks are poison and get pruned in execute mode.
	const listingDocIds: string[] = [];
	// Content-hash dedupe across URLs: the same body reachable via several
	// paths (canonical + category path) must chunk exactly once.
	const seenBodies = new Set<string>();
	let skippedListings = 0;
	let skippedDupes = 0;

	for (const url of urls) {
		try {
			const post = await fetchPost(url);
			const slug = url.replace(`${BASE}/blog/`, "").replace(/\/$/, "");
			if (!post.isArticle) {
				skippedListings += 1;
				listingDocIds.push(`blog/${slug}`);
				continue;
			}
			if (post.body.length < 200) continue;
			const bodyHash = post.body.slice(0, 4000);
			if (seenBodies.has(bodyHash)) {
				skippedDupes += 1;
				continue;
			}
			seenBodies.add(bodyHash);
			const chunks = chunkMarkdown({
				md: `# ${post.title}\n\n${post.body}`,
				parentDocId: `blog/${slug}`,
				title: post.title,
				url,
				tags: ["sdf-blog", "stellar.org"],
				publishedAt: post.publishedAt,
			});
			allChunks.push(...chunks);
		} catch (err) {
			console.error(`  ✗ ${url}: ${(err as Error).message}`);
			postErrors += 1;
		}
	}
	console.log(
		`  skipped: ${skippedListings} listing/tag pages, ${skippedDupes} duplicate bodies`,
	);
	if (listingDocIds.length) {
		const poisoned = listingDocIds.filter((id) => existing.has(id));
		console.log(
			`  poison chunks to prune (previously-ingested listing pages): ${poisoned.length}` +
				(poisoned.length ? ` → ${poisoned.slice(0, 8).join(", ")}` : ""),
		);
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
	console.log(`  to embed: ${stats.toEmbed} | post errors: ${postErrors}`);

	if (!execute || !payload) {
		console.log("\nDry run. --execute to embed + write.");
		return;
	}

	// Prune poison: delete chunks of pages we just re-fetched and classified
	// as listings (targeted — only pages verified non-article THIS run).
	let pruned = 0;
	for (const docId of listingDocIds) {
		const chunkMap = existing.get(docId);
		if (!chunkMap) continue;
		for (const { id } of chunkMap.values()) {
			try {
				await payload.delete({ collection: "research-docs", id });
				pruned += 1;
			} catch (err) {
				console.error(`  ✗ prune ${docId}: ${(err as Error).message}`);
			}
		}
	}
	if (pruned) console.log(`  pruned ${pruned} listing-page chunks`);

	const r = await upsertChunks({
		payload,
		source: "sdf-blog",
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
