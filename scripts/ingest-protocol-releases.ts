/**
 * Ingest Stellar protocol/tooling RELEASES into the research corpus as the
 * `release` source — the event-shaped record the corpus lacked (2026-07-19:
 * Protocol 27 "Zipper" voted onto mainnet on July 8 and the corpus had no
 * document saying so; the snapshot-shaped sources only carried the pre-vote
 * guide). One doc per GitHub release: tag, date, and the release notes.
 *
 * Sources (GitHub releases API, unauthenticated — 4 requests/run):
 *   stellar/stellar-core     — protocol + validator releases
 *   stellar/stellar-cli      — developer CLI
 *   stellar/js-stellar-sdk   — JS SDK
 *   stellar/rs-soroban-sdk   — Soroban Rust SDK
 *
 * Usage:
 *   pnpm exec tsx scripts/ingest-protocol-releases.ts             # dry run
 *   pnpm exec tsx scripts/ingest-protocol-releases.ts --execute   # write
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import {
	chunkMarkdown,
	loadExistingChunks,
	type ResearchChunk,
	upsertChunks,
} from "../src/lib/research-ingest";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

const REPOS = [
	"stellar/stellar-core",
	"stellar/stellar-cli",
	"stellar/js-stellar-sdk",
	"stellar/rs-soroban-sdk",
];
const PER_REPO = 15; // newest releases per repo — history beyond that is noise

interface GhRelease {
	tag_name: string;
	name: string | null;
	body: string | null;
	html_url: string;
	published_at: string;
	prerelease: boolean;
	draft: boolean;
}

async function fetchReleases(repo: string): Promise<GhRelease[]> {
	const r = await fetch(
		`https://api.github.com/repos/${repo}/releases?per_page=${PER_REPO}`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				"User-Agent": "stellarlight-scout-ingest",
				...(process.env.GITHUB_TOKEN
					? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
					: {}),
			},
		},
	);
	if (!r.ok) throw new Error(`fetch ${repo} releases: ${r.status}`);
	return (await r.json()) as GhRelease[];
}

async function run() {
	const startedAt = Date.now();
	const observedAtIso = new Date(startedAt).toISOString();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log("source: release (GitHub releases)\n");

	const allChunks: ResearchChunk[] = [];
	for (const repo of REPOS) {
		const releases = (await fetchReleases(repo)).filter(
			(r) => !r.draft && !r.prerelease,
		);
		console.log(`${repo}: ${releases.length} stable releases`);
		for (const rel of releases) {
			const shortRepo = repo.split("/")[1];
			const title = `${shortRepo} ${rel.tag_name}${
				rel.name && rel.name !== rel.tag_name ? ` — ${rel.name}` : ""
			}`;
			const parentDocId = `release-${shortRepo}-${rel.tag_name}`;
			const body = (rel.body ?? "").trim() || "(no release notes published)";
			const chunks = chunkMarkdown({
				md: `# ${title}\n\nReleased ${rel.published_at.slice(0, 10)}.\n\n${body}`,
				parentDocId,
				title,
				url: rel.html_url,
				tags: ["release", shortRepo, rel.tag_name.toLowerCase()],
				publishedAt: rel.published_at,
			});
			for (const c of chunks) c.observedAt = observedAtIso;
			allChunks.push(...chunks);
		}
	}

	console.log(`\nChunks: ${allChunks.length} total`);
	if (!execute) {
		for (const c of allChunks.filter((c) => c.chunkIndex === 0).slice(0, 8)) {
			console.log(`  ${c.publishedAt?.slice(0, 10)} ${c.title}`);
		}
		console.log("\nDry run. --execute to embed + write.");
		return;
	}

	const payload = await getPayload({ config: configPromise });
	const existing = await loadExistingChunks(payload, "release");
	const r = await upsertChunks({
		payload,
		source: "release",
		chunks: allChunks,
		existing,
	});
	console.log(
		`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — errors: ${r.errors}`,
	);
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
