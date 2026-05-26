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
import configPromise from "../src/payload.config";
import {
	chunkMarkdown,
	loadExistingChunks,
	stripHtml,
	upsertChunks,
} from "../src/lib/research-ingest";

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

/** Find all blog post URLs from the index pages (paginated). */
async function listBlogPosts(): Promise<string[]> {
	const seen = new Set<string>();
	for (let page = 1; page <= 30; page++) {
		const url = page === 1 ? `${BASE}/blog` : `${BASE}/blog/page/${page}`;
		try {
			const html = await fetchHtml(url);
			const matches = [
				...html.matchAll(/href=["'](\/blog\/[a-z0-9][a-z0-9-]+)["']/gi),
			];
			let pageNew = 0;
			for (const m of matches) {
				const full = `${BASE}${m[1].replace(/\/$/, "")}`;
				if (full === `${BASE}/blog`) continue;
				if (full.match(/\/page\/\d+/)) continue;
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
}

async function fetchPost(url: string): Promise<Post> {
	const html = await fetchHtml(url);
	const titleMatch =
		html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
		html.match(/<title[^>]*>([^<]+)<\/title>/i);
	const title = titleMatch
		? titleMatch[1].replace(/\s+\|\s+Stellar.*$/i, "").trim()
		: url;

	const dateMatch =
		html.match(
			/<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i,
		) || html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
	const publishedAt = dateMatch ? dateMatch[1] : undefined;

	const main = html.match(/<article[\s\S]*?<\/article>/i)
		|| html.match(/<main[\s\S]*?<\/main>/i);
	const body = stripHtml(main ? main[0] : html);
	return { url, title, body, publishedAt };
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

	for (const url of urls) {
		try {
			const post = await fetchPost(url);
			if (post.body.length < 200) continue;
			const slug = url.replace(`${BASE}/blog/`, "").replace(/\/$/, "");
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
	console.log(`  new: ${stats.new} | updated: ${stats.updated} | unchanged: ${stats.unchanged}`);
	console.log(`  to embed: ${stats.toEmbed} | post errors: ${postErrors}`);

	if (!execute || !payload) {
		console.log("\nDry run. --execute to embed + write.");
		return;
	}

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
