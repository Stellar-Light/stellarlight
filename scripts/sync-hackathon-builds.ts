/**
 * Store every Stellar hackathon submission DoraHacks lists, and link each one
 * to the directory project that lists its exact repo.
 *
 *   pnpm exec tsx scripts/sync-hackathon-builds.ts            # dry run, writes nothing
 *   pnpm exec tsx scripts/sync-hackathon-builds.ts --execute  # upsert
 *
 * Until now the builds index was read live from DoraHacks on every cold
 * request, so a submission DoraHacks drops, or an API change like 2026-08's,
 * took the prior-art layer with it. This lane keeps our own copy in the
 * hackathon-builds collection, which /api/hackathons/builds serves first.
 *
 * Per run:
 *   1. every ended Stellar event on DoraHacks, then each one's full roster
 *   2. each submission's own page (the team's full write-up and self-reported
 *      tags) when it has not been read in the last 30 days
 *   3. the project link: the one directory project that lists the exact repo
 *      (src/lib/hackathon-build-links.ts; a shared GitHub owner never counts)
 *   4. embeddings for search by meaning, only for rows whose text changed
 *      (voyage-3 via src/lib/embed.ts), and the vector index they need
 *
 * The rules the stablecoin and RWA lanes earned:
 *   - a row is never deleted;
 *   - a failed read never blanks a stored value;
 *   - no events, or empty rosters for most of them, is an instrument failure:
 *     exit 2 and write nothing; pages unreadable for most rows also exits 2;
 *   - every write is read back (payload.update drops unknown keys silently).
 */
import "./load-env";
import { createRequire } from "node:module";
import { getPayload } from "payload";
import { embedBatch } from "../src/lib/embed";
import {
	buildEmbeddingText,
	embeddingTextHash,
} from "../src/lib/hackathon-build-embedding";
import {
	indexProjectRepos,
	type LinkedProject,
	type ProjectRepoRow,
	repoFullNameOf,
} from "../src/lib/hackathon-build-links";
import {
	type DoraHacksSubmission,
	doraEventRef,
	endedDoraHacksEvents,
	fetchAllDoraHacksHackathons,
	fetchBuidlDetail,
	fetchHackathonSubmissions,
} from "../src/lib/integrations/dorahacks";
import { formatMismatches, verifyWrites } from "../src/lib/utils/read-back";
import configPromise from "../src/payload.config";
import type { HackathonBuild } from "../src/payload-types";

const EXECUTE = process.argv.includes("--execute");
const DETAIL_MAX_AGE_MS = 30 * 86_400_000;
const req = createRequire(import.meta.url);
// biome-ignore lint/suspicious/noExplicitAny: dynamic require, no types
const { MongoClient } = req("mongodb") as any;

/** The index search by meaning reads: cosine over the 1024-dim embedding,
 * with the fields a query filters on. */
const VECTOR_INDEX = {
	name: "hackathon_build_vector_index",
	type: "vectorSearch" as const,
	definition: {
		fields: [
			{
				type: "vector",
				path: "embedding",
				numDimensions: 1024,
				similarity: "cosine",
			},
			{ type: "filter", path: "isWinner" },
			{ type: "filter", path: "hiddenUpstream" },
			{ type: "filter", path: "hackathonSlug" },
		],
	},
};

/** List the collection's search indexes; on --execute, create ours if it is
 * missing. Returns false when the check itself failed. */
async function ensureVectorIndex(): Promise<boolean> {
	const uri = process.env.DATABASE_URI || process.env.MONGODB_URI;
	if (!uri) {
		console.error("\n✗ no DATABASE_URI: vector index not checked");
		return false;
	}
	const client = new MongoClient(uri);
	try {
		await client.connect();
		const coll = client.db().collection("hackathon-builds");
		const existing = (await coll.listSearchIndexes().toArray()) as Array<{
			name: string;
			status?: string;
		}>;
		const found = existing.find((i) => i.name === VECTOR_INDEX.name);
		if (found) {
			console.log(
				`\nvector index: ${VECTOR_INDEX.name} exists (${found.status ?? "status unknown"})`,
			);
			return true;
		}
		if (!EXECUTE) {
			console.log(
				`\nvector index: ${VECTOR_INDEX.name} is missing; --execute creates it`,
			);
			return true;
		}
		await coll.createSearchIndex(VECTOR_INDEX);
		console.log(
			`\nvector index: created ${VECTOR_INDEX.name}; Atlas builds it in the background`,
		);
		return true;
	} catch (e) {
		console.error(
			`\n✗ vector index check failed: ${(e as Error).message}\nAtlas UI fallback, collection hackathon-builds, index ${VECTOR_INDEX.name}:\n${JSON.stringify(VECTOR_INDEX.definition)}`,
		);
		return false;
	} finally {
		await client.close();
	}
}

type Row = Partial<Omit<HackathonBuild, "id" | "updatedAt" | "createdAt">> & {
	buildId: string;
};

/** Fields whose change is worth reporting (bookkeeping dates are not). */
const FIELDS = [
	"name",
	"vision",
	"description",
	"selfTags",
	"hackathonSlug",
	"hackathonTitle",
	"endedAt",
	"track",
	"placement",
	"award",
	"isWinner",
	"url",
	"githubUrl",
	"demoUrl",
	"videoUrl",
	"repoFullName",
	"projectSlug",
	"projectName",
	"hiddenUpstream",
] as const;

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (i < items.length) await fn(items[i++]);
		}),
	);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const same = (a: unknown, b: unknown) =>
	JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const now = new Date().toISOString();
	console.log(
		`sync-hackathon-builds: ${EXECUTE ? "EXECUTING" : "dry run, writes nothing"}\n`,
	);

	const stored = new Map<string, HackathonBuild>();
	const prev = await payload.find({
		collection: "hackathon-builds",
		pagination: false,
		depth: 0,
	});
	for (const d of prev.docs as HackathonBuild[]) stored.set(d.buildId, d);
	console.log(`${stored.size} builds already stored`);

	// ── 1. events and their rosters ──────────────────────────────────────
	const events = endedDoraHacksEvents(await fetchAllDoraHacksHackathons());
	if (!events.length) {
		console.error(
			"✗ DoraHacks listed no ended Stellar events. Instrument failure: nothing written.",
		);
		process.exitCode = 2;
		return;
	}
	const rows = new Map<string, Row>();
	let emptyRosters = 0;
	console.log(`\n${events.length} ended Stellar events on DoraHacks:`);
	for (const h of events) {
		let subs: DoraHacksSubmission[] = [];
		try {
			subs = await fetchHackathonSubmissions(h);
		} catch (e) {
			console.error(
				`  ✗ ${h.uname}: roster read failed: ${(e as Error).message}`,
			);
		}
		if (!subs.length) emptyRosters++;
		const ev = doraEventRef(h);
		for (const s of subs) {
			if (rows.has(s.id)) continue;
			rows.set(s.id, {
				buildId: s.id,
				name: s.name,
				vision: s.description,
				hackathonSlug: ev.slug,
				hackathonTitle: ev.title,
				endedAt: ev.endedAt,
				track: s.track,
				placement: s.hackathonPlacement,
				award: s.award,
				isWinner: s.isWinner,
				url: s.url,
				githubUrl: s.githubUrl,
				demoUrl: s.demoUrl,
				videoUrl: s.videoUrl,
				repoFullName: repoFullNameOf(s.githubUrl),
				lastSeenAt: now,
			});
		}
		console.log(
			`  ${ev.slug.padEnd(46)} ${String(subs.length).padStart(4)} submissions ${String(subs.filter((s) => s.isWinner).length).padStart(3)} winners`,
		);
	}
	if (emptyRosters > events.length / 2) {
		console.error(
			`✗ ${emptyRosters} of ${events.length} rosters came back empty. Instrument failure: nothing written.`,
		);
		process.exitCode = 2;
		return;
	}

	// ── 2. submission pages ──────────────────────────────────────────────
	const due = [...rows.values()].filter((r) => {
		const at = stored.get(r.buildId)?.detailReadAt;
		return !at || Date.now() - Date.parse(at) > DETAIL_MAX_AGE_MS;
	});
	const detail = { read: 0, notFound: 0, failed: 0 };
	await pool(due, 3, async (r) => {
		const id = Number(r.buildId.replace(/^dorahacks-buidl-/, ""));
		try {
			const d = Number.isFinite(id) ? await fetchBuidlDetail(id) : null;
			if (!d) {
				detail.notFound++;
				return;
			}
			// Only what the page holds: an empty field never blanks a stored one.
			if (d.description) r.description = d.description;
			if (d.selfTags.length) r.selfTags = d.selfTags;
			r.hiddenUpstream = d.hidden;
			r.detailReadAt = now;
			detail.read++;
		} catch {
			detail.failed++;
		} finally {
			await sleep(200);
		}
	});
	console.log(
		`\nsubmission pages: ${due.length} due, ${detail.read} read, ${detail.notFound} not found, ${detail.failed} could not be read (stored values kept)`,
	);

	// ── 3. project links ─────────────────────────────────────────────────
	let links: Map<string, LinkedProject | null> | null = null;
	try {
		const projects = await payload.find({
			collection: "projects",
			pagination: false,
			depth: 0,
			select: {
				slug: true,
				name: true,
				status: true,
				canonicalSlug: true,
				links: true,
				github: true,
			},
		});
		links = indexProjectRepos(projects.docs as unknown as ProjectRepoRow[]);
		console.log(
			`\n${projects.docs.length} directory projects read; ${links.size} repos listed by a project`,
		);
	} catch (e) {
		console.error(
			`\n✗ projects read failed, links left as stored: ${(e as Error).message}`,
		);
	}
	let ambiguous = 0;
	if (links) {
		for (const r of rows.values()) {
			const p = r.repoFullName ? links.get(r.repoFullName) : undefined;
			if (p === null) ambiguous++;
			r.projectSlug = p?.slug ?? null;
			r.projectName = p?.name ?? null;
			r.linkCheckedAt = now;
		}
	}

	// ── 4. embeddings ────────────────────────────────────────────────────
	// Re-embed only rows whose text changed or that have none, so a run with
	// no new submissions or edits costs nothing. A failed batch keeps what is
	// stored.
	const toEmbed: Array<{ r: Row; text: string; hash: string }> = [];
	for (const r of rows.values()) {
		const old = stored.get(r.buildId);
		const text = buildEmbeddingText({
			name: r.name ?? "",
			vision: r.vision,
			track: r.track,
			description: r.description ?? old?.description,
		});
		const hash = embeddingTextHash(text);
		if (old?.embeddingTextHash === hash && Array.isArray(old?.embedding))
			continue;
		toEmbed.push({ r, text, hash });
	}
	const emb = { done: 0, failed: 0 };
	if (!toEmbed.length) {
		console.log("\nembeddings: none due");
	} else if (!process.env.VOYAGE_API_KEY) {
		console.log(
			`\nembeddings: ${toEmbed.length} due, not run (VOYAGE_API_KEY is not set)`,
		);
	} else if (!EXECUTE) {
		try {
			const [probe] = await embedBatch([toEmbed[0].text]);
			console.log(
				`\nembeddings: ${toEmbed.length} due; pipeline check returned ${probe.length} dimensions`,
			);
		} catch (e) {
			console.error(
				`\n✗ embeddings: ${toEmbed.length} due; pipeline check failed: ${(e as Error).message}`,
			);
		}
	} else {
		for (let i = 0; i < toEmbed.length; i += 100) {
			const batch = toEmbed.slice(i, i + 100);
			try {
				const vecs = await embedBatch(batch.map((x) => x.text));
				batch.forEach((x, j) => {
					x.r.embedding = vecs[j];
					x.r.embeddingTextHash = x.hash;
				});
				emb.done += batch.length;
			} catch (e) {
				emb.failed += batch.length;
				console.error(
					`  ✗ embedding batch ${i / 100 + 1} failed: ${(e as Error).message}`,
				);
			}
		}
		console.log(
			`\nembeddings: ${toEmbed.length} due, ${emb.done} embedded, ${emb.failed} failed (stored vectors kept)`,
		);
	}

	// ── diff ─────────────────────────────────────────────────────────────
	const creates: Row[] = [];
	const updates: { id: string; data: Row; changed: string[] }[] = [];
	const fieldChanges = new Map<string, number>();
	for (const r of rows.values()) {
		const old = stored.get(r.buildId);
		if (!old) {
			creates.push({ ...r, firstSeenAt: now });
			continue;
		}
		const changed = FIELDS.filter((f) => f in r && !same(r[f], old[f]));
		for (const f of changed)
			fieldChanges.set(f, (fieldChanges.get(f) ?? 0) + 1);
		updates.push({ id: old.id, data: r, changed });
	}
	const notListed = [...stored.keys()].filter((k) => !rows.has(k)).length;
	console.log(
		`\n${rows.size} builds read: ${creates.length} new, ${updates.filter((u) => u.changed.length).length} changed, ${updates.filter((u) => !u.changed.length).length} unchanged; ${notListed} stored builds not listed this run (kept)`,
	);
	if (fieldChanges.size)
		console.log(
			`changed fields: ${[...fieldChanges].map(([f, n]) => `${f} ${n}`).join(", ")}`,
		);
	const linked = [...rows.values()]
		.filter((r) => r.projectSlug)
		.sort((a, b) => Number(!!b.isWinner) - Number(!!a.isWinner));
	console.log(
		`\n${linked.length} builds link to a directory project (${linked.filter((r) => r.isWinner).length} winners); ${ambiguous} builds' repos are listed by more than one project and stay unlinked`,
	);
	for (const r of linked.slice(0, 60))
		console.log(
			`  ${r.isWinner ? "winner" : "      "} ${(r.name ?? "").slice(0, 40).padEnd(40)} ${r.repoFullName} -> ${r.projectSlug}`,
		);

	if (!EXECUTE) {
		await ensureVectorIndex();
		console.log("\ndry run: nothing written. Re-run with --execute to upsert.");
		return;
	}

	// ── write, then read back ────────────────────────────────────────────
	let failed = 0;
	const sent = new Map<string, Record<string, unknown>>();
	const writes = [
		...creates.map((data) => ({ id: null as string | null, data })),
		...updates.map((u) => ({ id: u.id as string | null, data: u.data })),
	];
	await pool(writes, 4, async ({ id, data }) => {
		try {
			if (id)
				await payload.update({
					collection: "hackathon-builds",
					id,
					data,
					context: { internal: true },
				});
			else
				await payload.create({
					collection: "hackathon-builds",
					data: data as Omit<HackathonBuild, "id" | "updatedAt" | "createdAt">,
					context: { internal: true },
				});
			sent.set(data.buildId, data);
		} catch (e) {
			failed++;
			console.error(
				`  ✗ ${data.buildId}: write failed: ${String((e as Error).message).slice(0, 120)}`,
			);
		}
	});
	console.log(
		`\nwrote ${sent.size} row(s) (${creates.length} new); ${failed} write(s) threw`,
	);

	console.log("\n── Read-back ──");
	const docs = (r: { docs: unknown[] }) => r.docs as Record<string, unknown>[];
	const fields = [...new Set([...sent.values()].flatMap(Object.keys))];
	const mismatches = await verifyWrites(
		sent,
		async (keys) =>
			new Map(
				docs(
					await payload.find({
						collection: "hackathon-builds",
						where: { buildId: { in: keys } },
						limit: keys.length,
						depth: 0,
					}),
				).map((d) => [String(d.buildId), d]),
			),
		fields,
		200,
		async (key) =>
			docs(
				await payload.find({
					collection: "hackathon-builds",
					where: { buildId: { equals: key } },
					limit: 1,
					depth: 0,
				}),
			)[0] ?? null,
	);
	if (mismatches.length) {
		console.error(
			`  ✗ ${mismatches.length} field(s) did NOT persist as sent:\n${formatMismatches(mismatches)}`,
		);
		process.exitCode = 1;
	} else {
		console.log(
			`  ✓ all ${sent.size} row(s) hold the values written (${fields.length} fields)`,
		);
	}
	if (failed) process.exitCode = 1;
	const indexOk = await ensureVectorIndex();
	if ((!indexOk || emb.failed > toEmbed.length / 2) && !process.exitCode) {
		console.error(
			"✗ embeddings or the vector index did not complete. Rows were written; search by meaning needs a re-run.",
		);
		process.exitCode = 2;
	}
	if (due.length >= 20 && detail.failed > due.length / 2 && !process.exitCode) {
		console.error(
			`✗ ${detail.failed} of ${due.length} submission pages could not be read. Rosters were written; the pages need a re-run.`,
		);
		process.exitCode = 2;
	}
}

// exitCode, not exit(0): a failed write, a read-back mismatch or an
// instrument failure sets it above, and exit(0) would stomp it.
main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
