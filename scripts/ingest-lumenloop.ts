/**
 * Ingest community SCF playbooks + companion AI skills from
 * github.com/lumenloop/awesome-stellar-community-fund into the
 * ResearchDocs corpus.
 *
 * Two subdirs ingested:
 *   - docs/    : SCF-builder-facing playbooks (proving-traction.md,
 *                rfp-response-guide.md, scf-7-guide.md, scf-history.md,
 *                interest-form-tips.md, etc.) — operational knowledge
 *                a Stellar builder needs to win SCF funding.
 *   - skills/  : SCF-specific SKILL.md companion skills (scf-reviewer,
 *                scf-budget-builder, scf-competitor-analyst, …) — Scout
 *                can recommend these as companion installs when a user
 *                needs deeper SCF task help (mirrors the skills.stellar.org
 *                chain pattern).
 *
 * Each chunk is tagged with `awesome-scf` + the subdir name (`docs` or
 * `skills`) so the agent can scope queries.
 *
 * Usage:
 *   npx tsx scripts/ingest-lumenloop.ts             # dry run
 *   npx tsx scripts/ingest-lumenloop.ts --execute   # write to Payload
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { createHash } from "node:crypto";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import { embedBatch } from "../src/lib/embed";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

const REPO = "lumenloop/awesome-stellar-community-fund";
const GITHUB_API = `https://api.github.com/repos/${REPO}`;
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/main`;
const SUBDIRS: Array<"docs" | "skills"> = ["docs", "skills"];

const MAX_CHARS_PER_CHUNK = 6000;

interface Chunk {
	parentDocId: string; // e.g. "docs/scf-7-guide" or "skills/scf-reviewer"
	chunkIndex: number;
	title: string;
	section: string | null;
	url: string;
	content: string;
	contentHash: string;
	tags: string[];
}

function sha256(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

async function listMarkdownFiles(
	subdir: "docs" | "skills",
): Promise<Array<{ name: string; path: string }>> {
	const res = await fetch(`${GITHUB_API}/contents/${subdir}`, {
		headers: { "User-Agent": "stellarlight-scout-ingest" },
	});
	if (!res.ok) throw new Error(`list ${subdir}: ${res.status}`);
	const items = (await res.json()) as Array<{
		name: string;
		path: string;
		type: string;
	}>;
	return items
		.filter(
			(f) =>
				f.type === "file" &&
				/\.md$/i.test(f.name) &&
				f.name.toLowerCase() !== "readme.md",
		)
		.map((f) => ({ name: f.name, path: f.path }));
}

async function fetchMarkdown(path: string): Promise<string> {
	const url = `${RAW_BASE}/${path}`;
	const res = await fetch(url, { headers: { "User-Agent": "stellarlight" } });
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	return res.text();
}

function extractTitle(md: string, fallback: string): string {
	const h1 = md.match(/^#\s+(.+?)$/m);
	if (h1) return h1[1].trim();
	// Try YAML frontmatter `title:` or `name:`
	const fm = md.match(/^(?:title|name):\s*(.+?)$/im);
	if (fm) return fm[1].trim().replace(/^["']|["']$/g, "");
	return fallback;
}

function chunkMarkdown(
	md: string,
	parentDocId: string,
	title: string,
	url: string,
	subdir: "docs" | "skills",
): Chunk[] {
	const tags = ["lumenloop", "awesome-scf", subdir];
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

	const chunks: Chunk[] = [];
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
		filesFetched: 0,
		chunksTotal: 0,
		chunksNew: 0,
		chunksUnchanged: 0,
		chunksUpdated: 0,
		embedTokens: 0,
		errors: 0,
	};

	console.log(execute ? "EXECUTE MODE — writing to Payload" : "DRY RUN MODE");
	console.log(`source: github.com/${REPO}`);
	console.log("");

	const payload = execute ? await getPayload({ config: configPromise }) : null;

	// Existing chunks by parentDocId → Map<chunkIndex, {id, contentHash}>
	const existingByDoc = new Map<
		string,
		Map<number, { id: string; contentHash: string }>
	>();
	if (payload) {
		console.log("Loading existing lumenloop chunks for dedup…");
		const existing = await payload.find({
			collection: "research-docs",
			where: { source: { equals: "lumenloop" } },
			limit: 10_000,
			depth: 0,
		});
		for (const d of existing.docs as unknown as Array<{
			id: string;
			parentDocId: string;
			chunkIndex: number;
			contentHash: string;
		}>) {
			if (!existingByDoc.has(d.parentDocId))
				existingByDoc.set(d.parentDocId, new Map());
			existingByDoc
				.get(d.parentDocId)!
				.set(d.chunkIndex, { id: d.id, contentHash: d.contentHash });
		}
		const total = [...existingByDoc.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing chunks already in collection`);
	}

	const toEmbed: Chunk[] = [];

	for (const subdir of SUBDIRS) {
		console.log(`\nListing ${subdir}/ …`);
		let files: Array<{ name: string; path: string }>;
		try {
			files = await listMarkdownFiles(subdir);
		} catch (err) {
			console.error(`  ✗ failed to list: ${(err as Error).message}`);
			stats.errors++;
			continue;
		}
		console.log(`  ${files.length} markdown files`);
		stats.filesFetched += files.length;

		for (const file of files) {
			const id = `${subdir}/${file.name.replace(/\.md$/i, "").toLowerCase()}`;
			const url = `https://github.com/${REPO}/blob/main/${file.path}`;
			try {
				const md = await fetchMarkdown(file.path);
				const title = extractTitle(md, file.name);
				const chunks = chunkMarkdown(md, id, title, url, subdir);
				stats.chunksTotal += chunks.length;

				const existing = existingByDoc.get(id);
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
	}

	console.log("");
	console.log(`Chunks: ${stats.chunksTotal} total`);
	console.log(`  new: ${stats.chunksNew}`);
	console.log(`  updated: ${stats.chunksUpdated}`);
	console.log(`  unchanged (skipped embed): ${stats.chunksUnchanged}`);
	console.log(`  to embed: ${toEmbed.length}`);

	if (!execute) {
		console.log("\nDry run complete. Pass --execute to embed + write.");
		return;
	}

	if (toEmbed.length === 0) {
		console.log("\nNothing to embed. Done.");
		return;
	}

	console.log("");
	console.log(`Embedding ${toEmbed.length} chunks via Voyage AI…`);
	const embeddings = await embedBatch(toEmbed.map((c) => c.content));
	stats.embedTokens = toEmbed.reduce(
		(s, c) => s + Math.ceil(c.content.length / 4),
		0,
	);
	console.log(
		`  ~${stats.embedTokens} tokens (~$${(stats.embedTokens * 0.06 / 1_000_000).toFixed(4)})`,
	);

	console.log("\nUpserting to Payload…");
	for (let i = 0; i < toEmbed.length; i++) {
		const chunk = toEmbed[i];
		const embedding = embeddings[i];
		const existing = existingByDoc.get(chunk.parentDocId)?.get(chunk.chunkIndex);
		const data = {
			source: "lumenloop" as const,
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
