/**
 * Ingest Electric Capital Developer Reports into the ResearchDocs corpus.
 *
 * Source: github.com/electric-capital/developer-reports (7 PDFs, 260⭐).
 * EC has stopped publishing PDFs after 2022/2023 — newer reports
 * (2024, 2025+) live at developerreport.com as client-side-rendered
 * pages we can't easily scrape. This ingests the historical archive,
 * which still grounds macro ecosystem questions ("how is Stellar's dev
 * count trending", "where are Stellar devs concentrated", etc.).
 *
 * Each PDF becomes ~5–40 chunks depending on length. Tagged with
 * source="ec-developer-report" + year tag so /api/research?source=
 * ec-developer-report&q=stellar surfaces them.
 *
 * Usage:
 *   pnpm exec tsx scripts/ingest-ec-developer-report.ts            # dry
 *   pnpm exec tsx scripts/ingest-ec-developer-report.ts --execute  # write
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
	type ResearchChunk,
} from "../src/lib/research-ingest";

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

const REPO_API_BASE =
	"https://api.github.com/repos/electric-capital/developer-reports/contents";
const REPO_BLOB_BASE =
	"https://raw.githubusercontent.com/electric-capital/developer-reports/master";

interface RepoFile {
	name: string;
	type: string;
	size: number;
	download_url: string;
}

/**
 * Pull the file list directly from GitHub's contents API so a daily cron
 * automatically picks up any new PDFs EC drops into the repo.
 */
async function listReports(): Promise<RepoFile[]> {
	const r = await fetch(REPO_API_BASE, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "stellarlight-scout-ingest",
		},
	});
	if (!r.ok) throw new Error(`GitHub contents API: ${r.status}`);
	const files = (await r.json()) as RepoFile[];
	return files.filter(
		(f) => f.type === "file" && f.name.toLowerCase().endsWith(".pdf"),
	);
}

/**
 * Pull metadata out of EC's filenames. Examples that exist as of writing:
 *   dev_report_H1_2019.pdf                       → year=2019, type=annual
 *   dev_report_2020.pdf                          → year=2020, type=annual
 *   dev_report_2020_updated_april_2021.pdf       → year=2020, type=annual (update)
 *   dev_report_2022.pdf                          → year=2022, type=annual
 *   Blockchain Developer Geography Analysis 2023.pdf → year=2023, type=geography
 */
function parseMeta(name: string): { year: number; reportType: string; title: string } {
	const lower = name.toLowerCase();
	const yearMatch = lower.match(/(20\d{2})/g);
	// First year in filename = report year. A trailing "updated_2021" is the
	// revision year, not the report year — using max would mis-bucket the
	// 2020 report as 2021.
	const year = yearMatch ? Number(yearMatch[0]) : 0;
	const reportType = lower.includes("geography") ? "geography" : "annual";
	const title = name
		.replace(/\.pdf$/i, "")
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return { year, reportType, title };
}

async function run() {
	const startedAt = Date.now();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log("source: github.com/electric-capital/developer-reports\n");

	console.log("Fetching report list…");
	const files = await listReports();
	console.log(`  ${files.length} PDF reports\n`);

	const payload = execute ? await getPayload({ config: configPromise }) : null;
	const existing = payload
		? await loadExistingChunks(payload, "ec-developer-report")
		: new Map();
	if (payload) {
		const total = [...existing.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing EC chunks in collection\n`);
	}

	const allChunks: ResearchChunk[] = [];
	let pdfErrors = 0;
	let tooShort = 0;

	for (const file of files) {
		const meta = parseMeta(file.name);
		const url = `https://github.com/electric-capital/developer-reports/blob/master/${encodeURIComponent(file.name)}`;
		try {
			process.stdout.write(
				`[${meta.year} ${meta.reportType}] ${file.name} (${(file.size / 1024).toFixed(0)}KB)… `,
			);
			const res = await fetch(
				`${REPO_BLOB_BASE}/${encodeURIComponent(file.name)}`,
				{ headers: { "User-Agent": "stellarlight-scout-ingest" } },
			);
			if (!res.ok) throw new Error(`download ${res.status}`);
			const buf = Buffer.from(await res.arrayBuffer());
			const text = await extractPdfText(buf);
			console.log(`${text.length} chars`);
			if (text.length < 1000) {
				tooShort += 1;
				continue;
			}
			const parentDocId = `ec-${meta.year}-${meta.reportType}`;
			const tags = [
				"electric-capital",
				"developer-report",
				meta.reportType,
				`year-${meta.year}`,
			];
			const md = `# ${meta.title}\n\n${text}`;
			const chunks = chunkMarkdown({
				md,
				parentDocId,
				title: meta.title,
				url,
				tags,
				publishedAt: `${meta.year}-01-01`,
			});
			allChunks.push(...chunks);
		} catch (err) {
			console.log(`✗ ${(err as Error).message}`);
			pdfErrors += 1;
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
	console.log(
		`  to embed: ${stats.toEmbed} | PDF errors: ${pdfErrors} | too short: ${tooShort}`,
	);

	if (!execute || !payload) {
		console.log("\nDry run. --execute to embed + write.");
		return;
	}

	const r = await upsertChunks({
		payload,
		source: "ec-developer-report",
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
