/**
 * Ingest Stellar Ecosystem Proposals (SEPs) into the ResearchDocs
 * collection so Stellar Scout can cite them.
 *
 * Source: github.com/stellar/stellar-protocol/tree/master/ecosystem
 * Each `ecosystem/sep-*.md` becomes one parent doc, chunked on H2
 * headings (with fallback splits for very long sections), embedded
 * via Voyage AI, upserted to Payload.
 *
 * Idempotent: per-chunk content hash (SHA-256). Re-runs only embed
 * chunks whose content changed.
 *
 * Usage:
 *   npx tsx scripts/ingest-seps.ts             # dry run (no writes)
 *   npx tsx scripts/ingest-seps.ts --execute   # write to Payload
 *
 * Env required: PAYLOAD_SECRET, MONGODB_URI/DATABASE_URI, VOYAGE_API_KEY.
 */
import { config as loadEnv } from "dotenv";

// .env.local first (Next.js convention), then .env as fallback
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { createHash } from "node:crypto";
import { getPayload } from "payload";
import { embedBatch } from "../src/lib/embed";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

const GITHUB_API = "https://api.github.com/repos/stellar/stellar-protocol";
const RAW_BASE =
	"https://raw.githubusercontent.com/stellar/stellar-protocol/master";

interface SepFile {
	name: string; // e.g. "sep-0024.md"
	path: string; // e.g. "ecosystem/sep-0024.md"
}

interface SepChunk {
	parentDocId: string; // e.g. "sep-0024"
	chunkIndex: number;
	title: string; // SEP title parsed from frontmatter or H1
	section: string | null; // H2/H3 section heading this chunk is under
	url: string; // canonical URL to the SEP
	content: string; // chunk markdown
	contentHash: string;
	tags: string[]; // ["sep", "sep-24", ...]
}

const MAX_CHARS_PER_CHUNK = 6000; // ~1500 tokens at 4 chars/tok

function sha256(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

async function listSepFiles(): Promise<SepFile[]> {
	const res = await fetch(`${GITHUB_API}/contents/ecosystem`, {
		headers: { "User-Agent": "stellarlight-scout-ingest" },
	});
	if (!res.ok) {
		throw new Error(`GitHub list failed: ${res.status} ${await res.text()}`);
	}
	const items = (await res.json()) as Array<{
		name: string;
		path: string;
		type: string;
	}>;
	return items
		.filter((f) => f.type === "file" && /^sep-\d+\.md$/i.test(f.name))
		.map((f) => ({ name: f.name, path: f.path }));
}

async function fetchSepMarkdown(path: string): Promise<string> {
	const url = `${RAW_BASE}/${path}`;
	const res = await fetch(url, { headers: { "User-Agent": "stellarlight" } });
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	return res.text();
}

/**
 * Extract the title from an SEP — preamble `Title:` field first, H1 fallback.
 * Preamble-first because the H1 regex matches ANY `# ` line in the body:
 * audit R2 caught sep-0020/cap-0066 titled with a mid-document body fragment
 * (the doc's first `# ` heading) while the canonical Title: sat unread.
 */
function extractTitle(md: string, fallbackId: string): string {
	const fm = md.match(/^Title:\s*(.+?)$/m);
	if (fm) return fm[1].trim();
	const h1 = md.match(/^#\s+(.+?)$/m);
	if (h1) return h1[1].trim();
	return fallbackId;
}

/** Chunk on H2 headings; further split sections > MAX_CHARS by paragraph. */
function chunkMarkdown(
	md: string,
	parentDocId: string,
	title: string,
	url: string,
): SepChunk[] {
	const tags = ["sep", parentDocId];
	// Split on lines starting with `## ` — keep heading as the section label
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

	// Now further-split any section exceeding MAX_CHARS on paragraph boundaries
	const chunks: SepChunk[] = [];
	let chunkIndex = 0;
	for (const sec of sections) {
		const text = sec.body.join("\n").trim();
		if (!text) continue;
		const prefix = sec.heading ? `## ${sec.heading}\n\n` : "";

		if (text.length <= MAX_CHARS_PER_CHUNK) {
			const content = prefix + text;
			chunks.push({
				parentDocId,
				chunkIndex: chunkIndex++,
				title,
				section: sec.heading,
				url,
				content,
				contentHash: sha256(content),
				tags,
			});
			continue;
		}

		// Split big sections on blank-line paragraphs, packing greedily
		const paras = text.split(/\n\s*\n/);
		let buf = prefix;
		for (const para of paras) {
			if ((buf + para + "\n\n").length > MAX_CHARS_PER_CHUNK && buf.length) {
				chunks.push({
					parentDocId,
					chunkIndex: chunkIndex++,
					title,
					section: sec.heading,
					url,
					content: buf.trim(),
					contentHash: sha256(buf.trim()),
					tags,
				});
				buf = prefix + para + "\n\n";
			} else {
				buf += para + "\n\n";
			}
		}
		if (buf.trim()) {
			chunks.push({
				parentDocId,
				chunkIndex: chunkIndex++,
				title,
				section: sec.heading,
				url,
				content: buf.trim(),
				contentHash: sha256(buf.trim()),
				tags,
			});
		}
	}

	return chunks;
}

async function run() {
	const startedAt = Date.now();
	const stats = {
		sepsFetched: 0,
		chunksTotal: 0,
		chunksNew: 0,
		chunksUnchanged: 0,
		chunksUpdated: 0,
		embedTokens: 0,
		errors: 0,
	};

	console.log(execute ? "EXECUTE MODE — writing to Payload" : "DRY RUN MODE");
	console.log("");

	console.log("Listing SEPs from GitHub…");
	const files = await listSepFiles();
	console.log(`  ${files.length} SEP files found`);
	stats.sepsFetched = files.length;

	const payload = execute ? await getPayload({ config: configPromise }) : null;

	// Existing chunks by parentDocId → Map<chunkIndex, {id, contentHash}>
	const existingBySep = new Map<
		string,
		Map<number, { id: string; contentHash: string }>
	>();
	if (payload) {
		console.log("Loading existing chunks for dedup…");
		const existing = await payload.find({
			collection: "research-docs",
			where: { source: { equals: "sep" } },
			limit: 10_000,
			depth: 0,
		});
		for (const d of existing.docs as unknown as Array<{
			id: string;
			parentDocId: string;
			chunkIndex: number;
			contentHash: string;
		}>) {
			if (!existingBySep.has(d.parentDocId))
				existingBySep.set(d.parentDocId, new Map());
			existingBySep
				.get(d.parentDocId)!
				.set(d.chunkIndex, { id: d.id, contentHash: d.contentHash });
		}
		const total = [...existingBySep.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing SEP chunks already in collection`);
	}

	const toEmbed: SepChunk[] = [];

	for (const file of files) {
		const parentDocId = file.name.replace(/\.md$/i, "").toLowerCase();
		const url = `https://github.com/stellar/stellar-protocol/blob/master/${file.path}`;
		try {
			const md = await fetchSepMarkdown(file.path);
			const title = extractTitle(md, parentDocId);
			const chunks = chunkMarkdown(md, parentDocId, title, url);
			stats.chunksTotal += chunks.length;

			const existing = existingBySep.get(parentDocId);
			for (const chunk of chunks) {
				const prev = existing?.get(chunk.chunkIndex);
				if (prev && prev.contentHash === chunk.contentHash) {
					stats.chunksUnchanged++;
					continue;
				}
				toEmbed.push(chunk);
				if (prev) stats.chunksUpdated++;
				else stats.chunksNew++;
			}
		} catch (err) {
			console.error(`  ✗ ${file.name}: ${(err as Error).message}`);
			stats.errors++;
		}
	}

	console.log("");
	console.log(`Chunks: ${stats.chunksTotal} total`);
	console.log(`  new: ${stats.chunksNew}`);
	console.log(`  updated: ${stats.chunksUpdated}`);
	console.log(`  unchanged (skipped embed): ${stats.chunksUnchanged}`);
	console.log(`  to embed: ${toEmbed.length}`);

	if (!execute) {
		console.log("");
		console.log("Dry run complete. Pass --execute to embed + write.");
		return;
	}

	if (toEmbed.length === 0) {
		console.log("\nNothing to embed. Done.");
		return;
	}

	console.log("");
	console.log(`Embedding ${toEmbed.length} chunks via Voyage AI…`);
	const embeddings = await embedBatch(toEmbed.map((c) => c.content));
	// Approximate token usage for reporting (Voyage doesn't return per-input
	// breakdown in batch mode reliably across SDKs)
	stats.embedTokens = toEmbed.reduce(
		(s, c) => s + Math.ceil(c.content.length / 4),
		0,
	);
	console.log(
		`  ~${stats.embedTokens} tokens (~$${((stats.embedTokens * 0.06) / 1_000_000).toFixed(4)})`,
	);

	console.log("");
	console.log("Upserting to Payload…");
	for (let i = 0; i < toEmbed.length; i++) {
		const chunk = toEmbed[i];
		const embedding = embeddings[i];
		const existing = existingBySep
			.get(chunk.parentDocId)
			?.get(chunk.chunkIndex);
		const data = {
			source: "sep" as const,
			title: chunk.title,
			section: chunk.section ?? undefined,
			url: chunk.url,
			parentDocId: chunk.parentDocId,
			chunkIndex: chunk.chunkIndex,
			content: chunk.content,
			contentHash: chunk.contentHash,
			tags: chunk.tags.map((tag) => ({ tag })),
			embedding,
		};
		try {
			if (existing) {
				await payload!.update({
					collection: "research-docs",
					id: existing.id,
					data,
				});
			} else {
				await payload!.create({ collection: "research-docs", data });
			}
		} catch (err) {
			console.error(
				`  ✗ ${chunk.parentDocId}#${chunk.chunkIndex}: ${(err as Error).message}`,
			);
			stats.errors++;
		}
	}

	console.log("");
	console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
	console.log(`  errors: ${stats.errors}`);
}

run()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error("FATAL:", err);
		process.exit(1);
	});
