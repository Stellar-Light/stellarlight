/**
 * Ingest lumenloop.com/research articles into the ResearchDocs corpus.
 *
 * Distinct from the existing `lumenloop` source (which holds the GitHub
 * awesome-stellar-community-fund repo — SCF playbooks + AI skills).
 * This one's `lumenloop-research`: ecosystem analyses, weekly roundups,
 * protocol deep-dives, project breakdowns. Pure builder-facing research
 * written by Lumen Loop.
 *
 * Discovery: lumenloop.com/sitemap.xml lists every research URL.
 *
 * Usage:
 *   npx tsx scripts/ingest-lumenloop-research.ts             # dry run
 *   npx tsx scripts/ingest-lumenloop-research.ts --execute   # write to Payload
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
import { JUNK_URL_RE } from "../src/lib/research-rank";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

const BASE = "https://lumenloop.com";
const SITEMAP = `${BASE}/sitemap.xml`;
const RESEARCH_PREFIX = `${BASE}/research/`;

async function fetchHtml(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { "User-Agent": "stellarlight-scout-ingest" },
	});
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	return res.text();
}

interface Article {
	url: string;
	title: string;
	body: string;
	publishedAt?: string;
}

async function fetchArticle(url: string): Promise<Article> {
	const html = await fetchHtml(url);

	const titleMatch =
		html.match(
			/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i,
		) || html.match(/<title[^>]*>([^<]+)<\/title>/i);
	const title = titleMatch
		? titleMatch[1].replace(/\s+\|\s+Lumen.*$/i, "").trim()
		: url;

	const dateMatch =
		html.match(
			/<meta\s+property=["']article:published_time["']\s+content=["']([^"']+)["']/i,
		) || html.match(/<time[^>]*datetime=["']([^"']+)["']/i);
	const publishedAt = dateMatch ? dateMatch[1] : undefined;

	// Prefer <article> for the main content; fall back to <main>
	const main =
		html.match(/<article[\s\S]*?<\/article>/i) ||
		html.match(/<main[\s\S]*?<\/main>/i);
	const body = stripHtml(main ? main[0] : html);
	return { url, title, body, publishedAt };
}

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log(`source: ${BASE}/research\n`);

	const payload = execute ? await getPayload({ config: configPromise }) : null;
	const existing = payload
		? await loadExistingChunks(payload, "lumenloop-research")
		: new Map();
	if (payload) {
		const total = [...existing.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing chunks in collection\n`);
	}

	console.log("Listing research articles via sitemap…");
	const allUrls = await fetchSitemapUrls(SITEMAP, BASE);
	// JUNK_URL_RE hardening is defensive: lumenloop's sitemap has no
	// tag/author/pagination URLs today, but the dev-docs ingest learned this
	// the hard way (author-archive mirrors served the same chunk 3x).
	const researchUrls = allUrls.filter(
		(u) => u.startsWith(RESEARCH_PREFIX) && !JUNK_URL_RE.test(u),
	);
	console.log(`  ${researchUrls.length} research articles`);

	const allChunks: ReturnType<typeof chunkMarkdown> = [];
	let postErrors = 0;

	for (const url of researchUrls) {
		try {
			const post = await fetchArticle(url);
			if (post.body.length < 200) continue;
			const slug = url.replace(RESEARCH_PREFIX, "").replace(/\/$/, "");
			const chunks = chunkMarkdown({
				md: `# ${post.title}\n\n${post.body}`,
				parentDocId: `research/${slug}`,
				title: post.title,
				url,
				tags: ["lumenloop-research", "lumenloop", "ecosystem-analysis"],
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
	console.log(
		`  new: ${stats.new} | updated: ${stats.updated} | unchanged: ${stats.unchanged}`,
	);
	console.log(`  to embed: ${stats.toEmbed} | post errors: ${postErrors}`);

	if (!execute || !payload) {
		console.log("\nDry run. --execute to embed + write.");
		return;
	}

	const r = await upsertChunks({
		payload,
		source: "lumenloop-research",
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
