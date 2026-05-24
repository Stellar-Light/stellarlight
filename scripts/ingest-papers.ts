/**
 * Ingest foundational Stellar papers (whitepapers, SCP papers) into
 * the ResearchDocs corpus. Currently a small, hand-curated list of
 * known-good PDF URLs — easy to grow over time.
 *
 * Uses pdf-parse to extract text. PDFs are split into pages, then
 * chunked like any other markdown source.
 *
 * Usage:
 *   npx tsx scripts/ingest-papers.ts             # dry run
 *   npx tsx scripts/ingest-papers.ts --execute   # write to Payload
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import {
	chunkMarkdown,
	loadExistingChunks,
	upsertChunks,
} from "../src/lib/research-ingest";

// pdf-parse 2.x ships a `PDFParse` class via CJS; pull it through createRequire
import { createRequire } from "node:module";
const cjsRequire = createRequire(import.meta.url);
const { PDFParse } = cjsRequire("pdf-parse") as {
	PDFParse: new (opts: {
		data: Uint8Array;
	}) => { getText(): Promise<{ text: string }> };
};

async function extractPdfText(buf: Buffer): Promise<string> {
	const parser = new PDFParse({ data: new Uint8Array(buf) });
	const r = await parser.getText();
	return r.text ?? "";
}

const args = process.argv.slice(2);
const execute = args.includes("--execute");

interface Paper {
	id: string;
	title: string;
	url: string;
	tags: string[];
}

/**
 * Hand-curated list of foundational Stellar papers. Add more as they
 * surface. Each entry is one paper that gets chunked into multiple
 * ResearchDocs rows.
 */
const PAPERS: Paper[] = [
	{
		id: "scp-mazieres",
		title:
			"The Stellar Consensus Protocol: A Federated Model for Internet-level Consensus",
		url: "https://stellar.org/papers/stellar-consensus-protocol.pdf",
		tags: ["paper", "scp", "consensus", "mazieres", "foundational"],
	},
];

async function fetchPdfText(url: string): Promise<{ text: string }> {
	const res = await fetch(url, {
		headers: { "User-Agent": "stellarlight-scout-ingest" },
		redirect: "follow",
	});
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	const buf = Buffer.from(await res.arrayBuffer());
	const text = await extractPdfText(buf);
	return { text };
}

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log(`source: hand-curated Stellar papers (${PAPERS.length})\n`);

	const payload = execute ? await getPayload({ config: configPromise }) : null;
	const existing = payload
		? await loadExistingChunks(payload, "paper")
		: new Map();
	if (payload) {
		const total = [...existing.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing paper chunks in collection\n`);
	}

	const allChunks: ReturnType<typeof chunkMarkdown> = [];
	let paperErrors = 0;

	for (const paper of PAPERS) {
		try {
			console.log(`Fetching ${paper.id}…`);
			const { text } = await fetchPdfText(paper.url);
			console.log(`  ${text.length} chars extracted`);
			if (text.length < 500) {
				console.log("  ⚠ PDF text too short, skipping");
				continue;
			}
			// Synthesize a markdown wrapper so chunkMarkdown can split sensibly.
			// Treat double-newlines in PDF text as paragraph breaks.
			const md = `# ${paper.title}\n\n${text}`;
			const chunks = chunkMarkdown({
				md,
				parentDocId: paper.id,
				title: paper.title,
				url: paper.url,
				tags: paper.tags,
			});
			allChunks.push(...chunks);
		} catch (err) {
			console.error(`  ✗ ${paper.id}: ${(err as Error).message}`);
			paperErrors += 1;
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
	console.log(`  to embed: ${stats.toEmbed} | paper errors: ${paperErrors}`);

	if (!execute || !payload) {
		console.log("\nDry run. --execute to embed + write.");
		return;
	}

	const r = await upsertChunks({
		payload,
		source: "paper",
		chunks: allChunks,
		existing,
	});
	console.log(
		`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — errors: ${r.errors}`,
	);
}

run().catch((e) => {
	console.error("FATAL:", e);
	process.exit(1);
});
