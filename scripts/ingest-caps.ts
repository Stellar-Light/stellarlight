/**
 * Ingest Stellar Ecosystem Proposals (SEPs) into the ResearchDocs
 * collection so Stellar Scout can cite them.
 *
 * Source: github.com/stellar/stellar-protocol/tree/master/core (CAPs)
 * Each `core/cap-*.md` becomes one parent doc, chunked on H2
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

import "./load-env";
import { createHash } from "node:crypto";
import { getPayload } from "payload";
import { CAP_REGISTRY } from "../src/data/cap-registry";
import { parseCapPreamble } from "../src/lib/cap-preamble";
import { embedBatch } from "../src/lib/embed";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");

// #778: the committed cap-registry (generated via shallow clone, immune to
// API rate limits) is the status/protocolVersion source of truth. Live-fetch
// preamble parsing stays as fallback for CAPs the registry doesn't know yet.
const REGISTRY_BY_CAP = new Map(CAP_REGISTRY.map((r) => [r.cap, r]));
// #785: legacy docs from older ingests carry non-standard parentDocIds the
// cap-N pattern can't parse — fall back to an EXACT normalized-title match
// against the registry (never fuzzy; ambiguity never stamps).
const REGISTRY_BY_TITLE = new Map(
	CAP_REGISTRY.map((r) => [r.title.trim().toLowerCase(), r]),
);
const capNumOf = (parentDocId: string): number | null => {
	const m = parentDocId.match(/^cap-0*(\d+)$/);
	return m ? Number(m[1]) : null;
};

const GITHUB_API = "https://api.github.com/repos/stellar/stellar-protocol";
const RAW_BASE =
	"https://raw.githubusercontent.com/stellar/stellar-protocol/master";

interface CapFile {
	name: string; // e.g. "cap-0046.md"
	path: string; // e.g. "ecosystem/cap-0046.md"
}

interface SepChunk {
	parentDocId: string; // e.g. "cap-0046"
	chunkIndex: number;
	title: string; // SEP title parsed from frontmatter or H1
	section: string | null; // H2/H3 section heading this chunk is under
	url: string; // canonical URL to the SEP
	content: string; // chunk markdown
	contentHash: string;
	tags: string[]; // ["cap", "sep-24", ...]
	capStatus: string | null;
	capProtocolVersion: number | null;
}

const MAX_CHARS_PER_CHUNK = 6000; // ~1500 tokens at 4 chars/tok

function sha256(s: string): string {
	return createHash("sha256").update(s).digest("hex");
}

// Unauthenticated GitHub API is 60 req/hr per IP — shared across every Action
// on a runner, so the corpus refresh's CAP list intermittently 4xx'd and (until
// the workflow guard was added) aborted the whole job. Send the token when the
// runner provides one; still works locally without it.
const GH_HEADERS: Record<string, string> = {
	"User-Agent": "stellarlight-scout-ingest",
	Accept: "application/vnd.github+json",
	...(process.env.GITHUB_TOKEN
		? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
		: {}),
};

async function listCapFiles(): Promise<CapFile[]> {
	const res = await fetch(`${GITHUB_API}/contents/core`, {
		headers: GH_HEADERS,
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
		.filter((f) => f.type === "file" && /^cap-\d+\.md$/i.test(f.name))
		.map((f) => ({ name: f.name, path: f.path }));
}

async function fetchSepMarkdown(path: string): Promise<string> {
	const url = `${RAW_BASE}/${path}`;
	const res = await fetch(url, { headers: { "User-Agent": "stellarlight" } });
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	return res.text();
}

/**
 * Extract the title from a CAP — preamble `Title:` field first, H1 fallback.
 * Preamble-first because the H1 regex matches ANY `# ` line in the body:
 * audit R2 caught cap-0066 titled 'First, append as many archived keys…' (a
 * mid-document heading) while the canonical Title: sat unread.
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
	const tags = ["cap", parentDocId];
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
	const files = await listCapFiles();
	console.log(`  ${files.length} SEP files found`);
	stats.sepsFetched = files.length;

	const payload = execute ? await getPayload({ config: configPromise }) : null;

	// Existing chunks by parentDocId → Map<chunkIndex, {id, contentHash, title}>
	const existingBySep = new Map<
		string,
		Map<
			number,
			{
				id: string;
				contentHash: string;
				title: string | null;
				capStatus: string | null;
				capProtocolVersion: number | null;
			}
		>
	>();
	if (payload) {
		console.log("Loading existing chunks for dedup…");
		const existing = await payload.find({
			collection: "research-docs",
			where: { source: { equals: "cap" } },
			limit: 10_000,
			depth: 0,
		});
		// #785 (final layer): legacy duplicate rows share (parentDocId,
		// chunkIndex) with a maintained row — the map's last-write-wins used to
		// SHADOW one of them (invisible to the backfill) while the serving-side
		// per-doc collapse could still SERVE it. On collision keep the
		// maintained row (non-null capStatus, tiebreak newest id) and DELETE
		// the shadowed duplicate (execute mode; dry run reports).
		let shadowDupes = 0;
		for (const d of existing.docs as unknown as Array<{
			id: string;
			parentDocId: string;
			chunkIndex: number;
			contentHash: string;
			title?: string | null;
			capStatus?: string | null;
			capProtocolVersion?: number | null;
		}>) {
			if (!existingBySep.has(d.parentDocId))
				existingBySep.set(d.parentDocId, new Map());
			const slot = existingBySep.get(d.parentDocId)!;
			const cur = {
				id: d.id,
				contentHash: d.contentHash,
				title: d.title ?? null,
				capStatus: d.capStatus ?? null,
				capProtocolVersion: d.capProtocolVersion ?? null,
			};
			const prev = slot.get(d.chunkIndex);
			if (!prev) {
				slot.set(d.chunkIndex, cur);
				continue;
			}
			const keep =
				(prev.capStatus !== null) !== (cur.capStatus !== null)
					? prev.capStatus !== null
						? prev
						: cur
					: prev.id > cur.id
						? prev
						: cur;
			const drop = keep === prev ? cur : prev;
			slot.set(d.chunkIndex, keep);
			shadowDupes++;
			console.log(
				`  shadow dupe ${d.parentDocId}#${d.chunkIndex}: ${payload ? "deleting" : "would delete"} ${drop.id} (keeping ${keep.id})`,
			);
			if (payload) {
				try {
					await payload.delete({ collection: "research-docs", id: drop.id });
				} catch (err) {
					console.error(`  ✗ shadow delete: ${(err as Error).message}`);
					stats.errors++;
				}
			}
		}
		if (shadowDupes)
			console.log(`  ${shadowDupes} shadowed duplicate chunk row(s) resolved`);
		const total = [...existingBySep.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing SEP chunks already in collection`);
		// #785 (diagnosis only — no writes): the vector serving path aggregates
		// the Mongo collection directly, but payload.find can silently skip rows
		// it can't hydrate (legacy pre-Payload seeds). Such ghosts serve null
		// facts forever and no Payload-side pass can reach them. This block only
		// REPORTS the divergence — ids logged for a human-reviewed cleanup.
		// biome-ignore lint/suspicious/noExplicitAny: payload.db internals
		const rawCol = (payload as any)?.db?.connection?.db?.collection(
			"research-docs",
		);
		if (rawCol) {
			const rawDocs = await rawCol
				.find({ source: "cap" })
				.project({
					_id: 1,
					parentDocId: 1,
					chunkIndex: 1,
					title: 1,
					capStatus: 1,
				})
				.toArray();
			const payloadIds = new Set(
				(existing.docs as Array<{ id: string }>).map((d) => String(d.id)),
			);
			// biome-ignore lint/suspicious/noExplicitAny: raw rows
			const ghosts = rawDocs.filter((r: any) => !payloadIds.has(String(r._id)));
			console.log(
				`  raw mongo source=cap: ${rawDocs.length} vs payload.find: ${existing.docs.length} → ${ghosts.length} payload-invisible ghost(s)`,
			);
			// biome-ignore lint/suspicious/noExplicitAny: raw rows
			for (const g of ghosts as any[])
				console.log(
					`  ghost ${String(g._id)} pid=${g.parentDocId ?? "?"} idx=${g.chunkIndex ?? "?"} capStatus=${g.capStatus ?? "null"} title=${String(g.title ?? "").slice(0, 50)}`,
				);
			// #785 targeted dump: chunk …549 of cap-0046 serves null while its
			// sibling …53f serves Final, yet every stamping pass reports nothing
			// to stamp. Print the STORED truth for every cap-0046 row so the
			// contradiction resolves on evidence.
			// biome-ignore lint/suspicious/noExplicitAny: raw rows
			for (const r of rawDocs.filter((d: any) =>
				String(d.parentDocId ?? "").includes("0046"),
			) as any[])
				console.log(
					`  cap-0046 row ${String(r._id)} pid=${r.parentDocId} idx=${r.chunkIndex} capStatus=${JSON.stringify(r.capStatus ?? null)} title=${String(r.title ?? "").slice(0, 40)}`,
				);
		}
	}

	// #778 backfill: existing rows with NULL capStatus never got stamped —
	// stamping used to require a successful per-file GitHub fetch, and starved
	// fetches skipped the file silently. Registry-only pass: pure DB + the
	// committed registry, no GitHub calls, idempotent.
	let registryStamped = 0;
	for (const [pid, chunks] of existingBySep) {
		const byPid = REGISTRY_BY_CAP.get(capNumOf(pid) ?? -1);
		for (const c of chunks.values()) {
			if (c.capStatus !== null) continue;
			const reg =
				byPid ??
				REGISTRY_BY_TITLE.get((c.title ?? "").trim().toLowerCase());
			if (!reg || reg.status === null) continue;
			registryStamped++;
			if (payload) {
				try {
					await payload.update({
						collection: "research-docs",
						id: c.id,
						data: {
							capStatus: reg.status,
							capProtocolVersion: reg.protocolVersion ?? undefined,
						},
					});
				} catch (err) {
					console.error(`  ✗ registry stamp ${pid}: ${(err as Error).message}`);
					stats.errors++;
				}
			}
		}
	}
	console.log(
		`  registry backfill: ${registryStamped} null-capStatus chunk(s) ${payload ? "stamped" : "would be stamped (dry)"}`,
	);

	const toEmbed: SepChunk[] = [];

	for (const file of files) {
		const parentDocId = file.name.replace(/\.md$/i, "").toLowerCase();
		const url = `https://github.com/stellar/stellar-protocol/blob/master/${file.path}`;
		try {
			const md = await fetchSepMarkdown(file.path);
			const title = extractTitle(md, parentDocId);
			const preamble = parseCapPreamble(md);
			const reg = REGISTRY_BY_CAP.get(capNumOf(parentDocId) ?? -1);
			const chunks = chunkMarkdown(md, parentDocId, title, url).map((c) => ({
				...c,
				capStatus: reg?.status ?? preamble.status,
				capProtocolVersion: reg?.protocolVersion ?? preamble.protocolVersion,
			}));
			stats.chunksTotal += chunks.length;

			const existing = existingBySep.get(parentDocId);
			for (const chunk of chunks) {
				const prev = existing?.get(chunk.chunkIndex);
				if (prev && prev.contentHash === chunk.contentHash) {
					// Lesson class 25: the title lives OUTSIDE the content hash, so
					// extraction fixes (preamble-Title-first) never reach existing
					// rows through the embed path. Content-identical + drifted
					// title → update in place, no re-embed. (This script has its
					// own upsert loop — the shared upsertChunks fix doesn't apply.)
					const factsDrifted =
						(prev.capStatus ?? null) !== (chunk.capStatus ?? null) ||
						(prev.capProtocolVersion ?? null) !==
							(chunk.capProtocolVersion ?? null);
					if (payload && ((prev.title ?? "") !== chunk.title || factsDrifted)) {
						stats.chunksUpdated++;
						try {
							await payload.update({
								collection: "research-docs",
								id: prev.id,
								data: {
									title: chunk.title,
									capStatus: chunk.capStatus ?? undefined,
									capProtocolVersion: chunk.capProtocolVersion ?? undefined,
								},
							});
							console.log(
								`  title fixed ${chunk.parentDocId}#${chunk.chunkIndex}: '${chunk.title}'`,
							);
						} catch (err) {
							console.error(
								`  ✗ title ${chunk.parentDocId}#${chunk.chunkIndex}: ${(err as Error).message}`,
							);
							stats.errors++;
						}
					} else {
						stats.chunksUnchanged++;
					}
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
			source: "cap" as const,
			title: chunk.title,
			section: chunk.section ?? undefined,
			url: chunk.url,
			parentDocId: chunk.parentDocId,
			chunkIndex: chunk.chunkIndex,
			content: chunk.content,
			contentHash: chunk.contentHash,
			tags: chunk.tags.map((tag) => ({ tag })),
			capStatus: chunk.capStatus ?? undefined,
			capProtocolVersion: chunk.capProtocolVersion ?? undefined,
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
