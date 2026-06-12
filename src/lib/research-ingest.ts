/**
 * Shared utilities for ResearchDocs ingestion scripts.
 *
 * Each ingest-*.ts script handles source-specific listing + fetching,
 * then hands raw markdown to these helpers for:
 *   - chunkMarkdown(): split on H2 boundaries, max 1500 tokens / chunk
 *   - upsertChunks(): dedup by contentHash, embed via Voyage, write to Payload
 *
 * Lives outside /scripts so it can be unit-tested + shared.
 */

import { createHash } from "node:crypto";
import type { Payload } from "payload";
import { embedBatch } from "./embed";

export const MAX_CHARS_PER_CHUNK = 6000; // ~1500 tokens at 4 chars/tok

export type ResearchSource =
	| "sdf-blog"
	| "scf-handbook"
	| "sep"
	| "dev-docs"
	| "paper"
	| "scf-proposal"
	| "lumenloop"
	| "lumenloop-research"
	| "audit"
	| "ec-developer-report";

export type AuditSeverity =
	| "critical"
	| "high"
	| "medium"
	| "low"
	| "informational"
	| "unknown";

export interface ResearchChunk {
	parentDocId: string;
	chunkIndex: number;
	title: string;
	section: string | null;
	url: string;
	content: string;
	contentHash: string;
	tags: string[];
	publishedAt?: string;
	// Audit-specific (only set when source='audit')
	auditor?: string;
	protocol?: string;
	severity?: AuditSeverity;
}

export function sha256(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

/**
 * Reject chunks that carry no answerable content — the kind that pollute
 * vector results (a query matches them on a stray token, but a synthesizer
 * gets nothing). Seen in the wild from HTML doc scrapes: breadcrumb/TOC
 * stubs ("# x402 on Stellar\n- Agentic Payments\nOn this page"), tag-index
 * listings ("58 posts tagged developer"), and bare date archive headers.
 *
 * Deliberately conservative: it only drops chunks with essentially no prose.
 * Real sections — even short ones, code samples, bulleted how-tos — keep
 * enough sentence text to clear the bar. Used at ingest (addChunk) AND by
 * the prune-low-value-chunks maintenance script, so the rule is one place.
 */
export function isLowValueChunk(content: string): boolean {
	const raw = content.trim();
	if (!raw) return true;

	// Tag-index / archive listing pages — pure navigation, never answerable.
	if (/\b\d+\s+posts?\s+tagged\b/i.test(raw)) return true;

	// Docusaurus auto-generated index "card" link teasers (📄 marker). These
	// are navigation to a sub-page (which we ingest separately), not content —
	// short, keyword-dense, duplicated across every category page, and they
	// out-rank the real how-to they point at. A block with 2+ cards is a card
	// grid; a single short card is a teaser stub. Real prose pages run
	// thousands of chars and don't carry the marker.
	const cardMarkers = (raw.match(/📄/g) ?? []).length;
	if (cardMarkers >= 2) return true;
	if (cardMarkers === 1 && raw.length < 400) return true;

	// Count UNIQUE word tokens, keeping list/heading TEXT (strip only the
	// markdown markers themselves + TOC scaffolding). This is the key to not
	// nuking real content: a breadcrumb stub repeats the page title a few
	// times ("x402 on Stellar" ×3 → ~4 unique words); a genuine bulleted
	// section (event lists, audit methodology steps, code diffs) carries many
	// distinct words even when every line is a bullet. So count distinct, not
	// total, and keep the bullet text in the count.
	const text = raw
		.replace(/^#{1,6}\s+/gm, "") // heading hashes
		.replace(/^[-*+]\s+/gm, "") // bullet markers
		.replace(/^\d+\.\s+/gm, "") // numbered-list markers
		.replace(/on this page/gi, ""); // GitBook/docs TOC scaffold
	const words = text.toLowerCase().match(/[a-z0-9][a-z0-9_-]*/gi) ?? [];
	const unique = new Set(words);

	// Header-only, breadcrumb-only, and date-only chunks land below this;
	// any real section — even a short one — clears it comfortably.
	return unique.size < 6;
}

/**
 * Chunk markdown on H2 boundaries; further-split any section that
 * exceeds MAX_CHARS by packing paragraphs greedily.
 */
export function chunkMarkdown(opts: {
	md: string;
	parentDocId: string;
	title: string;
	url: string;
	tags: string[];
	publishedAt?: string;
}): ResearchChunk[] {
	const { md, parentDocId, title, url, tags, publishedAt } = opts;
	const lines = md.split("\n");
	const sections: Array<{ heading: string | null; body: string[] }> = [];
	let current: { heading: string | null; body: string[] } = {
		heading: null,
		body: [],
	};

	for (const line of lines) {
		const h2 = line.match(/^##\s+(.+)/);
		if (h2) {
			if (current.body.length) sections.push(current);
			current = { heading: h2[1].trim(), body: [] };
		} else {
			current.body.push(line);
		}
	}
	if (current.body.length || current.heading) sections.push(current);

	const chunks: ResearchChunk[] = [];
	let chunkIndex = 0;

	function addChunk(section: string | null, content: string) {
		const trimmed = content.trim();
		if (!trimmed) return;
		// Drop nav/breadcrumb/date-only chunks before they ever get embedded.
		if (isLowValueChunk(trimmed)) return;
		chunks.push({
			parentDocId,
			chunkIndex: chunkIndex++,
			title,
			section,
			url,
			content: trimmed,
			contentHash: sha256(trimmed),
			tags,
			publishedAt,
		});
	}

	for (const sec of sections) {
		const text = sec.body.join("\n").trim();
		if (!text) continue;
		const prefix = sec.heading ? `## ${sec.heading}\n\n` : "";

		if (text.length <= MAX_CHARS_PER_CHUNK) {
			addChunk(sec.heading, prefix + text);
			continue;
		}

		// Split big sections on paragraph (blank line) boundaries, pack greedily
		const paras = text.split(/\n\s*\n/);
		let buf = prefix;
		for (const para of paras) {
			if ((buf + para + "\n\n").length > MAX_CHARS_PER_CHUNK && buf.length) {
				addChunk(sec.heading, buf);
				buf = prefix + para + "\n\n";
			} else {
				buf += `${para}\n\n`;
			}
		}
		if (buf.trim()) addChunk(sec.heading, buf);
	}

	return chunks;
}

/**
 * Load existing chunks for `source`, indexed by (parentDocId, chunkIndex).
 * Used by ingest scripts to dedup and skip re-embedding unchanged chunks.
 */
export async function loadExistingChunks(
	payload: Payload,
	source: ResearchSource,
): Promise<Map<string, Map<number, { id: string; contentHash: string }>>> {
	const map = new Map<
		string,
		Map<number, { id: string; contentHash: string }>
	>();
	const existing = await payload.find({
		collection: "research-docs",
		where: { source: { equals: source } },
		limit: 10_000,
		depth: 0,
	});
	for (const d of existing.docs as unknown as Array<{
		id: string;
		parentDocId: string;
		chunkIndex: number;
		contentHash: string;
	}>) {
		if (!map.has(d.parentDocId)) map.set(d.parentDocId, new Map());
		map.get(d.parentDocId)?.set(d.chunkIndex, {
			id: d.id,
			contentHash: d.contentHash,
		});
	}
	return map;
}

export interface UpsertStats {
	new: number;
	updated: number;
	unchanged: number;
	embedTokens: number;
	errors: number;
}

/**
 * Embed and upsert a batch of chunks against the existing collection.
 * Skips chunks whose content hash hasn't changed.
 */
export async function upsertChunks(opts: {
	payload: Payload;
	source: ResearchSource;
	chunks: ResearchChunk[];
	existing: Map<string, Map<number, { id: string; contentHash: string }>>;
}): Promise<UpsertStats> {
	const { payload, source, chunks, existing } = opts;
	const stats: UpsertStats = {
		new: 0,
		updated: 0,
		unchanged: 0,
		embedTokens: 0,
		errors: 0,
	};

	const toEmbed: ResearchChunk[] = [];
	for (const chunk of chunks) {
		const prev = existing.get(chunk.parentDocId)?.get(chunk.chunkIndex);
		if (prev && prev.contentHash === chunk.contentHash) {
			stats.unchanged += 1;
			continue;
		}
		toEmbed.push(chunk);
		if (prev) stats.updated += 1;
		else stats.new += 1;
	}

	if (toEmbed.length === 0) return stats;

	console.log(`  Embedding ${toEmbed.length} chunks via Voyage AI…`);
	const embeddings = await embedBatch(toEmbed.map((c) => c.content));
	stats.embedTokens = toEmbed.reduce(
		(s, c) => s + Math.ceil(c.content.length / 4),
		0,
	);
	console.log(
		`    ~${stats.embedTokens} tokens (~$${((stats.embedTokens * 0.06) / 1_000_000).toFixed(4)})`,
	);

	console.log("  Upserting to Payload…");
	for (let i = 0; i < toEmbed.length; i++) {
		const chunk = toEmbed[i];
		const embedding = embeddings[i];
		const prev = existing.get(chunk.parentDocId)?.get(chunk.chunkIndex);
		const data = {
			source,
			title: chunk.title,
			section: chunk.section ?? undefined,
			url: chunk.url,
			parentDocId: chunk.parentDocId,
			chunkIndex: chunk.chunkIndex,
			content: chunk.content,
			contentHash: chunk.contentHash,
			tags: chunk.tags.map((tag) => ({ tag })),
			publishedAt: chunk.publishedAt,
			auditor: chunk.auditor,
			protocol: chunk.protocol,
			severity: chunk.severity,
			embedding,
		};
		try {
			if (prev) {
				await payload.update({
					collection: "research-docs",
					id: prev.id,
					data,
				});
			} else {
				await payload.create({ collection: "research-docs", data });
			}
		} catch (err) {
			console.error(
				`    ✗ ${chunk.parentDocId}#${chunk.chunkIndex}: ${(err as Error).message}`,
			);
			stats.errors += 1;
		}
	}

	return stats;
}

/**
 * Pull every <loc> URL from a sitemap. Handles two layouts:
 *   - flat sitemap with <url><loc>...</loc></url> entries
 *   - sitemap index with <sitemap><loc>...child sitemap...</loc></sitemap>
 *     (recurses one level into each child)
 *
 * Optional `hostFilter` restricts URLs to a prefix (e.g. only keep
 * stellar.org URLs, drop external links).
 */
export async function fetchSitemapUrls(
	sitemapUrl: string,
	hostFilter?: string,
): Promise<string[]> {
	async function fetchXml(url: string): Promise<string | null> {
		try {
			const r = await fetch(url, {
				headers: { "User-Agent": "stellarlight-scout-ingest" },
			});
			if (!r.ok) return null;
			return await r.text();
		} catch {
			return null;
		}
	}

	const xml = await fetchXml(sitemapUrl);
	if (!xml) return [];

	const isIndex = /<sitemapindex/i.test(xml);
	if (isIndex) {
		const children = [
			...xml.matchAll(/<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/g),
		].map((m) => m[1].trim());
		const all: string[] = [];
		for (const child of children) {
			const cx = await fetchXml(child);
			if (!cx) continue;
			const urls = [...cx.matchAll(/<loc>([^<]+)<\/loc>/g)]
				.map((m) => m[1].trim())
				.filter((u) => !hostFilter || u.startsWith(hostFilter));
			all.push(...urls);
		}
		return Array.from(new Set(all));
	}

	const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
		.map((m) => m[1].trim())
		.filter((u) => !hostFilter || u.startsWith(hostFilter));
	return Array.from(new Set(urls));
}

/** Strip HTML to a markdown-ish text blob (no proper parser, just regex). */
export function stripHtml(html: string): string {
	return (
		html
			// Remove script/style blocks completely
			.replace(/<(script|style)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "")
			// Drop HTML comments
			.replace(/<!--[\s\S]*?-->/g, "")
			// Headings → markdown
			.replace(/<h1[^>]*>/gi, "\n\n# ")
			.replace(/<\/h1>/gi, "\n")
			.replace(/<h2[^>]*>/gi, "\n\n## ")
			.replace(/<\/h2>/gi, "\n")
			.replace(/<h3[^>]*>/gi, "\n\n### ")
			.replace(/<\/h3>/gi, "\n")
			// Lists
			.replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
			.replace(/<li[^>]*>/gi, "- ")
			.replace(/<\/li>/gi, "\n")
			// Paragraphs + breaks
			.replace(/<\/p>/gi, "\n\n")
			.replace(/<br\s*\/?>/gi, "\n")
			// Drop everything else
			.replace(/<[^>]+>/g, "")
			// Collapse whitespace
			.replace(/&nbsp;/g, " ")
			.replace(/&amp;/g, "&")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/[ \t]+/g, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim()
	);
}
