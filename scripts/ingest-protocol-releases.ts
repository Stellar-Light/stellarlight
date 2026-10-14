/**
 * Ingest Stellar protocol/tooling RELEASES into the research corpus as the
 * `release` source — the event-shaped record the corpus lacked (2026-07-19:
 * Protocol 27 "Zipper" voted onto mainnet on July 8 and the corpus had no
 * document saying so; the snapshot-shaped sources only carried the pre-vote
 * guide). One doc per GitHub release: tag, date, and the release notes.
 *
 * Sources (GitHub releases + security-advisories APIs — 8 requests/run):
 *   stellar/stellar-core     — protocol + validator releases
 *   stellar/stellar-cli      — developer CLI
 *   stellar/js-stellar-sdk   — JS SDK
 *   stellar/rs-soroban-sdk   — Soroban Rust SDK
 *
 * Each repo's published security advisories ride the same source, one doc
 * per advisory titled with its GHSA and CVE ids (sls-090: CVE-2026-24889
 * had no document anywhere in the corpus).
 *
 * Usage:
 *   pnpm exec tsx scripts/ingest-protocol-releases.ts             # dry run
 *   pnpm exec tsx scripts/ingest-protocol-releases.ts --execute   # write
 */

import "./load-env";
import { getPayload } from "payload";
import {
	chunkMarkdown,
	loadExistingChunks,
	type ResearchChunk,
	upsertChunks,
} from "../src/lib/research-ingest";
import { RELEASE_REPOS } from "../src/lib/research-rank";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
// --replan: dry + the DB diff, writes nothing — the refresh lane's
// Idempotence step (must plan 0 right after the execute pass).
const replan = args.includes("--replan");

const REPOS = RELEASE_REPOS.map((r) => `stellar/${r}`);
const PER_REPO = 15; // newest releases per repo — history beyond that is noise
// ...except a security release. sls-090: v25.0.2, the patch for
// GHSA-96xm-fv9w-pf3f, had aged out of the newest 15 before this source
// existed, so release notes that link an advisory are kept at any age
// within the newest 100.
const ADVISORY_LINK_RE = /GHSA(?:-[0-9a-z]{4}){3}/i;

interface GhRelease {
	tag_name: string;
	name: string | null;
	body: string | null;
	html_url: string;
	published_at: string;
	prerelease: boolean;
	draft: boolean;
}

interface GhAdvisory {
	ghsa_id: string;
	cve_id: string | null;
	html_url: string;
	summary: string;
	description: string | null;
	severity: string | null;
	published_at: string;
	vulnerabilities: Array<{
		vulnerable_version_range: string | null;
		patched_versions: string | null;
	}> | null;
}

async function gh<T>(path: string): Promise<T> {
	const r = await fetch(`https://api.github.com/repos/${path}`, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "stellarlight-scout-ingest",
			...(process.env.GITHUB_TOKEN
				? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
				: {}),
		},
	});
	if (!r.ok) throw new Error(`fetch ${path}: ${r.status}`);
	return (await r.json()) as T;
}

async function run() {
	const startedAt = Date.now();
	const observedAtIso = new Date(startedAt).toISOString();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log("source: release (GitHub releases)\n");

	const allChunks: ResearchChunk[] = [];
	for (const repo of REPOS) {
		const shortRepo = repo.split("/")[1];
		const releases = (
			await gh<GhRelease[]>(`${repo}/releases?per_page=100`)
		).filter(
			(r, i) =>
				!r.draft &&
				!r.prerelease &&
				(i < PER_REPO || ADVISORY_LINK_RE.test(r.body ?? "")),
		);
		console.log(`${repo}: ${releases.length} stable releases`);
		for (const rel of releases) {
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

		const advisories = await gh<GhAdvisory[]>(
			`${repo}/security-advisories?state=published&per_page=100`,
		);
		console.log(`${repo}: ${advisories.length} published advisories`);
		for (const a of advisories) {
			const title = `${shortRepo} ${a.ghsa_id}${a.cve_id ? ` (${a.cve_id})` : ""}: ${a.summary}`;
			const vulns = a.vulnerabilities ?? [];
			const affected = vulns
				.map((v) => v.vulnerable_version_range)
				.filter(Boolean)
				.join("; ");
			const patched = vulns
				.map((v) => v.patched_versions)
				.filter(Boolean)
				.join(", ");
			const chunks = chunkMarkdown({
				md: `# ${title}\n\nPublished ${a.published_at.slice(0, 10)}. Severity: ${a.severity ?? "not rated"}. Affected versions: ${affected || "not listed"}. Patched versions: ${patched || "not listed"}.\n\n${(a.description ?? "").trim() || a.summary}`,
				parentDocId: `advisory-${shortRepo}-${a.ghsa_id}`,
				title,
				url: a.html_url,
				tags: [
					"advisory",
					shortRepo,
					a.ghsa_id.toLowerCase(),
					...(a.cve_id ? [a.cve_id.toLowerCase()] : []),
				],
				publishedAt: a.published_at,
			});
			for (const c of chunks) c.observedAt = observedAtIso;
			allChunks.push(...chunks);
		}
	}

	console.log(`\nChunks: ${allChunks.length} total`);
	if (!execute && !replan) {
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
		dryRun: replan,
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
