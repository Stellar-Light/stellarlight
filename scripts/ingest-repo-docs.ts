/**
 * Ingest in-repo documentation from CANONICAL ecosystem repos into
 * ResearchDocs — the earrietadev class: repos whose ONLY docs live inside the
 * repo (Stellar-Indexer-SDK ships per-protocol extension guides under
 * src/protocols/x/README.md) were invisible to research retrieval, so
 * "how do I index Blend state" had nothing to surface.
 *
 * CURATED sources only — this is not a corpus-wide README sweep (repos already
 * carry readmeExcerpt for repo search; this feeds the RESEARCH surface where
 * how-to retrieval happens). Extend SOURCES as consumers ask.
 *
 * Same discipline as ingest-caps: per-chunk content hash (re-runs embed only
 * changed chunks), dry-run default, zero-work/failed-work exits 1. Doc files
 * are fetched from raw.githubusercontent (no API rate cost); only the tree
 * listing spends one API call per repo.
 *
 * Usage:
 *   npx tsx scripts/ingest-repo-docs.ts             # dry run
 *   npx tsx scripts/ingest-repo-docs.ts --execute   # embed + write
 *
 * Env: PAYLOAD_SECRET, DATABASE_URI, VOYAGE_API_KEY (execute); GITHUB_TOKEN
 * optional (raises the tree-listing rate limit).
 */

import "./load-env";
import { createHash } from "node:crypto";
import { getPayload } from "payload";
import { embedBatch } from "../src/lib/embed";
import configPromise from "../src/payload.config";

const execute = process.argv.includes("--execute");

/** Canonical repos whose in-repo docs answer real how-to queries. `include`
 * matches repo-relative paths; boilerplate is excluded globally. */
const SOURCES: Array<{ repo: string; ref: string; include: RegExp }> = [
	{
		// The motivating case: per-protocol indexer extension guides under src/.
		repo: "Creit-Tech/Stellar-Indexer-SDK",
		ref: "main",
		include: /^(README\.md|src\/protocols\/[^/]+\/README\.md)$/i,
	},
	{
		repo: "Creit-Tech/Stellar-Wallets-Kit",
		ref: "main",
		include: /^(README\.md|docs\/.+\.md)$/i,
	},
	{
		repo: "fazzatti/colibri",
		ref: "main",
		include: /^(README\.md|docs\/.+\.md)$/i,
	},
	{
		repo: "fazzatti/colibri-examples",
		ref: "main",
		include: /^README\.md$/i,
	},
	{
		repo: "stellar/passkey-kit",
		ref: "main",
		include: /^(README\.md|docs\/.+\.md)$/i,
	},
];

const EXCLUDE = /(changelog|license|contributing|code_of_conduct|security)\.md$/i;
const MAX_FILES_PER_REPO = 12;
const MAX_CHARS_PER_CHUNK = 4000;

interface DocChunk {
	parentDocId: string;
	chunkIndex: number;
	source: "repo-docs";
	title: string;
	section: string | null;
	url: string;
	content: string;
	contentHash: string;
	tags: string[];
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

function extractTitle(md: string, fallback: string): string {
	const h1 = md.match(/^#\s+(.+?)$/m);
	return h1 ? h1[1].trim() : fallback;
}

/** H2-section chunker with paragraph splits for oversized sections — the
 * ingest-caps chunker's shape, copied (that module runs its ingest on import,
 * so it can't be imported for its helpers). */
function chunkMarkdown(
	md: string,
	parentDocId: string,
	title: string,
	url: string,
	tags: string[],
): DocChunk[] {
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

	const chunks: DocChunk[] = [];
	let chunkIndex = 0;
	const push = (section: string | null, content: string) => {
		chunks.push({
			parentDocId,
			chunkIndex: chunkIndex++,
			source: "repo-docs",
			title,
			section,
			url,
			content,
			contentHash: sha(content),
			tags,
		});
	};
	for (const sec of sections) {
		const text = sec.body.join("\n").trim();
		if (!text) continue;
		const prefix = sec.heading ? `## ${sec.heading}\n\n` : "";
		if (text.length <= MAX_CHARS_PER_CHUNK) {
			push(sec.heading, prefix + text);
			continue;
		}
		let buf = "";
		for (const para of text.split(/\n\n+/)) {
			if (buf && buf.length + para.length > MAX_CHARS_PER_CHUNK) {
				push(sec.heading, prefix + buf.trim());
				buf = "";
			}
			buf += `${para}\n\n`;
		}
		if (buf.trim()) push(sec.heading, prefix + buf.trim());
	}
	return chunks;
}

const GH_HEADERS: Record<string, string> = {
	"User-Agent": "stellarlight-repo-docs-ingest",
	...(process.env.GITHUB_TOKEN
		? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
		: {}),
};

async function listDocPaths(src: (typeof SOURCES)[number]): Promise<string[]> {
	const res = await fetch(
		`https://api.github.com/repos/${src.repo}/git/trees/${src.ref}?recursive=1`,
		{ headers: GH_HEADERS },
	);
	if (!res.ok) throw new Error(`tree ${src.repo}: HTTP ${res.status}`);
	const tree = (await res.json()) as {
		tree?: Array<{ path: string; type: string }>;
	};
	return (tree.tree ?? [])
		.filter(
			(e) =>
				e.type === "blob" &&
				src.include.test(e.path) &&
				!EXCLUDE.test(e.path),
		)
		.map((e) => e.path)
		.slice(0, MAX_FILES_PER_REPO);
}

async function fetchRaw(repo: string, ref: string, path: string) {
	const res = await fetch(
		`https://raw.githubusercontent.com/${repo}/${ref}/${path}`,
		{ headers: { "User-Agent": GH_HEADERS["User-Agent"] } },
	);
	if (!res.ok) throw new Error(`raw ${repo}/${path}: HTTP ${res.status}`);
	return res.text();
}

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE — writing to Payload" : "DRY RUN MODE");
	const payload = execute
		? await getPayload({ config: await configPromise })
		: null;

	// Existing repo-docs chunks for hash-idempotency.
	const existing = new Map<string, Map<number, { id: string; contentHash: string }>>();
	if (payload) {
		const res = await payload.find({
			collection: "research-docs",
			where: { source: { equals: "repo-docs" } },
			limit: 5000,
			depth: 0,
		});
		for (const d of res.docs as unknown as Array<{
			id: string;
			parentDocId: string;
			chunkIndex: number;
			contentHash: string;
		}>) {
			if (!existing.has(d.parentDocId)) existing.set(d.parentDocId, new Map());
			existing.get(d.parentDocId)!.set(d.chunkIndex, {
				id: d.id,
				contentHash: d.contentHash,
			});
		}
		console.log(`  ${res.totalDocs} existing repo-docs chunks`);
	}

	const toEmbed: DocChunk[] = [];
	let filesSeen = 0;
	let errors = 0;
	let unchanged = 0;
	for (const src of SOURCES) {
		const repoShort = src.repo.split("/")[1];
		try {
			const paths = await listDocPaths(src);
			console.log(`\n${src.repo}: ${paths.length} doc file(s)`);
			for (const path of paths) {
				try {
					const md = await fetchRaw(src.repo, src.ref, path);
					filesSeen++;
					const pathSlug = path
						.toLowerCase()
						.replace(/\.md$/, "")
						.replace(/[^a-z0-9]+/g, "-");
					const parentDocId = `repodoc-${src.repo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}--${pathSlug}`;
					const url = `https://github.com/${src.repo}/blob/${src.ref}/${path}`;
					const title = `${repoShort}: ${extractTitle(md, path)}`;
					const tags = ["repo-docs", src.repo.toLowerCase()];
					for (const chunk of chunkMarkdown(md, parentDocId, title, url, tags)) {
						const prev = existing.get(chunk.parentDocId)?.get(chunk.chunkIndex);
						if (prev && prev.contentHash === chunk.contentHash) {
							unchanged++;
							continue;
						}
						toEmbed.push(chunk);
					}
					console.log(`  ${path}`);
				} catch (err) {
					console.error(`  ✗ ${path}: ${(err as Error).message}`);
					errors++;
				}
			}
		} catch (err) {
			console.error(`  ✗ ${src.repo}: ${(err as Error).message}`);
			errors++;
		}
	}

	console.log(
		`\nfiles: ${filesSeen} · chunks to embed: ${toEmbed.length} · unchanged: ${unchanged} · errors: ${errors}`,
	);
	// Zero-work/failed-work runs are failures (2026-08-08 sweep): an empty
	// sweep means the sources or tree fetches broke, not a clean pass.
	if (filesSeen === 0) {
		console.error("✗ zero doc files fetched — sources unreachable; exiting 1.");
		process.exit(1);
	}
	if (!execute) {
		console.log("Dry run complete. Pass --execute to embed + write.");
		process.exit(errors ? 1 : 0);
	}
	if (toEmbed.length > 0) {
		console.log(`Embedding ${toEmbed.length} chunks via Voyage AI…`);
		const embeddings = await embedBatch(toEmbed.map((c) => c.content));
		for (let i = 0; i < toEmbed.length; i++) {
			const chunk = toEmbed[i];
			const prev = existing.get(chunk.parentDocId)?.get(chunk.chunkIndex);
			const data = {
				source: "repo-docs" as const,
				title: chunk.title,
				section: chunk.section ?? undefined,
				url: chunk.url,
				parentDocId: chunk.parentDocId,
				chunkIndex: chunk.chunkIndex,
				content: chunk.content,
				contentHash: chunk.contentHash,
				tags: chunk.tags.map((tag) => ({ tag })),
				embedding: embeddings[i],
			};
			try {
				if (prev) {
					await payload!.update({
						collection: "research-docs",
						id: prev.id,
						data,
					});
				} else {
					await payload!.create({ collection: "research-docs", data });
				}
			} catch (err) {
				console.error(
					`  ✗ ${chunk.parentDocId}#${chunk.chunkIndex}: ${(err as Error).message}`,
				);
				errors++;
			}
		}
	}
	console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
	if (errors) {
		console.error(`✗ ${errors} error(s) — exiting 1 so the run shows red.`);
		process.exit(1);
	}
	process.exit(0);
}

run().catch((err) => {
	console.error("FATAL:", err);
	process.exit(1);
});
