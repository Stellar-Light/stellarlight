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
 *   5. the stack: the Stellar packages each submission's repo declares in its
 *      package.json and Cargo.toml files, read once a month per repo, winners
 *      and the newest events first, at most STACK_MAX_REPOS repos a run
 *   6. repo activity: the last commit on each repo's default branch and
 *      whether it is archived, every run (GraphQL, 50 repos a call)
 *   7. categories: the directory project types of each submission's nearest
 *      directory projects (src/lib/hackathon-build-categories.ts), written
 *      only when the method's leave-one-out precision on the directory's own
 *      hand-set types clears the floor
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
	assign as assignTypes,
	bestCalibration,
	type Labeled,
	MIN_PRECISION,
	MIN_SUPPORT,
	neighbours,
	typeScores,
	unit,
} from "../src/lib/hackathon-build-categories";
import {
	buildEmbeddingText,
	embeddingTextHash,
} from "../src/lib/hackathon-build-embedding";
import {
	indexProjectRepos,
	indexProjectSites,
	type LinkedProject,
	type ProjectRepoRow,
	repoFullNameOf,
	siteKeyOf,
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
import {
	createGh,
	fetchRepoActivity,
	fetchRepoStack,
	RateLimitError,
} from "./scan/fetch-repo-code";

const EXECUTE = process.argv.includes("--execute");
const DETAIL_MAX_AGE_MS = 30 * 86_400_000;
const STACK_MAX_AGE_MS = 30 * 86_400_000;
/** One REST call per repo, so the first backfill (about a thousand repos)
 * spreads over a few days and never drains the Actions token. A dry run reads
 * a sample to check the pipeline. */
const STACK_MAX_REPOS = EXECUTE ? 400 : 25;
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
	"projectLinkBasis",
	"hiddenUpstream",
	"stack",
	"categories",
	"repoArchived",
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
	let sites: Map<string, LinkedProject | null> | null = null;
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
		sites = indexProjectSites(projects.docs as unknown as ProjectRepoRow[]);
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
			// No project lists the repo: the demo site may still be a project's
			// own website. An ambiguous repo stays unlinked either way.
			const key = siteKeyOf(r.demoUrl);
			const s = p === undefined && key ? sites?.get(key) : undefined;
			const linked = p ?? s ?? null;
			r.projectSlug = linked?.slug ?? null;
			r.projectName = linked?.name ?? null;
			r.projectLinkBasis = p ? "repo" : s ? "website" : null;
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

	// ── 5. what each repo builds on ──────────────────────────────────────
	// Read once per repo and shared by every build that links it. A repo that
	// answered not found waits a month too; a failed read keeps what is
	// stored and is retried next run.
	const fresh = (at?: string | null) =>
		!!at && Date.now() - Date.parse(at) < STACK_MAX_AGE_MS;
	const stackDue = new Map<string, Row[]>();
	const byPriority = [...rows.values()].sort(
		(a, b) =>
			Number(!!b.isWinner) - Number(!!a.isWinner) ||
			(b.endedAt ?? "").localeCompare(a.endedAt ?? ""),
	);
	for (const r of byPriority) {
		const old = stored.get(r.buildId);
		if (!r.repoFullName || fresh(old?.stackReadAt) || fresh(old?.repoMissingAt))
			continue;
		stackDue.set(r.repoFullName, [...(stackDue.get(r.repoFullName) ?? []), r]);
	}
	const stackRun = { read: 0, missing: 0, failed: 0, rateLimited: false };
	const ghToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	const stackBatch = [...stackDue.keys()].slice(0, STACK_MAX_REPOS);
	if (!stackDue.size) {
		console.log("\nrepo stacks: none due");
	} else if (!ghToken) {
		console.log(
			`\nrepo stacks: ${stackDue.size} repos due, not read (GITHUB_TOKEN is not set)`,
		);
	} else {
		const gh = createGh(ghToken);
		await pool(stackBatch, 4, async (repo) => {
			if (stackRun.rateLimited) return;
			try {
				const s = await fetchRepoStack(gh, repo);
				for (const r of stackDue.get(repo) ?? []) {
					if (s.state === "read") {
						r.stack = s.stack;
						r.stackReadAt = now;
						r.repoMissingAt = null;
					} else if (s.state === "missing") r.repoMissingAt = now;
				}
				if (s.state === "error") {
					stackRun.failed++;
					console.error(`  ✗ ${repo}: ${s.note}`);
				} else stackRun[s.state]++;
			} catch (e) {
				if (e instanceof RateLimitError) stackRun.rateLimited = true;
				else {
					stackRun.failed++;
					console.error(`  ✗ ${repo}: ${(e as Error).message}`);
				}
			}
		});
		console.log(
			`\nrepo stacks: ${stackDue.size} repos due, ${stackBatch.length} this run: ${stackRun.read} read, ${stackRun.missing} not found (deleted, renamed or private), ${stackRun.failed} could not be read (stored values kept)${stackRun.rateLimited ? "; GitHub rate limit reached, the rest wait for the next run" : ""}`,
		);
		const tally = new Map<string, number>();
		for (const repo of stackBatch)
			for (const p of stackDue.get(repo)?.[0]?.stack ?? [])
				tally.set(p, (tally.get(p) ?? 0) + 1);
		console.log(
			`  repos per package this run: ${
				[...tally]
					.sort((a, b) => b[1] - a[1])
					.slice(0, 12)
					.map(([p, n]) => `${p} ${n}`)
					.join(", ") || "none"
			}`,
		);
	}

	// ── 6. repo activity ─────────────────────────────────────────────────
	// Cheap enough to refresh every run. A repo GitHub reports missing is left
	// to the stack step, the one writer of repoMissingAt.
	const activityRepos = [
		...new Set(
			[...rows.values()]
				.map((r) => r.repoFullName)
				.filter((x): x is string => !!x),
		),
	];
	let activityRead = 0;
	if (!ghToken) {
		console.log(
			`\nrepo activity: ${activityRepos.length} repos, not read (GITHUB_TOKEN is not set)`,
		);
	} else {
		const activity = await fetchRepoActivity(ghToken, activityRepos);
		for (const r of rows.values()) {
			const a = r.repoFullName ? activity.get(r.repoFullName) : undefined;
			if (a?.state !== "read") continue;
			r.repoLastCommitAt = a.lastCommitAt;
			r.repoArchived = a.archived;
			r.activityCheckedAt = now;
		}
		activityRead = [...activity.values()].filter(
			(a) => a.state === "read",
		).length;
		const missing = activity.size - activityRead;
		console.log(
			`\nrepo activity: ${activityRepos.length} repos, ${activityRead} read, ${missing} not found, ${activityRepos.length - activity.size} could not be read (stored values kept)`,
		);
	}

	// ── 7. categories ────────────────────────────────────────────────────
	// Measured before it is trusted: every typed directory project is sorted
	// from its neighbours without itself, over the k/cut grid, and categories
	// are written only with a setting that clears MIN_PRECISION.
	let categoriesOk = false;
	try {
		const projects = await payload.find({
			collection: "projects",
			pagination: false,
			depth: 0,
			select: { slug: true, status: true, types: true, embedding: true },
		});
		const labeled: Labeled[] = [];
		const typesBySlug = new Map<string, string[]>();
		for (const p of projects.docs as Array<{
			slug: string;
			status?: string;
			types?: string[] | null;
			embedding?: unknown;
		}>) {
			typesBySlug.set(p.slug, p.types ?? []);
			const vec = unit(p.embedding);
			if (p.status === "Draft" || !p.types?.length || !vec) continue;
			labeled.push({ id: p.slug, vec, types: p.types });
		}
		// Calibrated on the directory's own hand-set types: every type gets the
		// lowest cut at which it is right MIN_PRECISION of the time, and the k
		// with the best F1 among calibrations that clear the floor is used.
		const { best, all } = bestCalibration(labeled);
		console.log(
			`\ncategories: ${labeled.length} hand-typed directory projects to learn from; each type gets its own cut (precision ${MIN_PRECISION}+, ${MIN_SUPPORT}+ examples), leave-one-out:`,
		);
		for (const c of all)
			console.log(
				`  k=${String(c.k).padStart(2)}  precision ${c.precision.toFixed(3)}  recall ${c.recall.toFixed(3)}  f1 ${c.f1.toFixed(3)}  covered ${c.covered.toFixed(3)}  types assignable ${c.cuts.size}${c === best ? "  <- used" : ""}`,
			);
		if (best) {
			console.log(
				"  per type at the used k (support, cut, precision, recall):",
			);
			for (const t of best.types)
				console.log(
					`    ${t.type.padEnd(16)} ${String(t.support).padStart(4)}  ${t.cut == null ? "  -" : t.cut.toFixed(1)}  ${t.cut == null ? "never assigned" : `${t.precision.toFixed(2)}  ${t.recall.toFixed(2)}`}`,
				);
		}
		if (!best) {
			console.error(
				`  ✗ no k reaches precision ${MIN_PRECISION}: categories not written`,
			);
		} else {
			const method = `nearest directory projects, k=${best.k}, a cut per type set at precision ${MIN_PRECISION}+ (${best.cuts.size} types assignable); leave-one-out on ${labeled.length} hand-typed directory projects: precision ${best.precision}, recall ${best.recall}`;
			let sorted = 0;
			let agree = 0;
			let linkedChecked = 0;
			const sample: string[] = [];
			for (const r of byPriority) {
				const old = stored.get(r.buildId);
				const vec = unit(r.embedding ?? old?.embedding);
				if (!vec) continue;
				const cats = assignTypes(
					typeScores(neighbours(vec, labeled, best.k), best.k),
					best.cuts,
				);
				r.categories = cats;
				r.categoriesAt = now;
				r.categoriesMethod = method;
				sorted++;
				// The few builds linked to a directory project are a check on the
				// submission side: does the top type match the project's own?
				const own = r.projectSlug ? typesBySlug.get(r.projectSlug) : undefined;
				if (own?.length && cats.length) {
					linkedChecked++;
					if (own.includes(cats[0].type)) agree++;
				}
				if (r.isWinner && sample.length < 30)
					sample.push(
						`  ${(r.name ?? "").slice(0, 34).padEnd(34)} ${cats.map((c) => `${c.type} ${c.score}`).join(", ") || "(none above the cut)"}`,
					);
			}
			const tally = new Map<string, number>();
			for (const r of rows.values())
				for (const c of (r.categories as Array<{ type: string }> | undefined) ??
					[])
					tally.set(c.type, (tally.get(c.type) ?? 0) + 1);
			const none = [...rows.values()].filter(
				(r) => Array.isArray(r.categories) && !r.categories.length,
			).length;
			console.log(
				`  sorted ${sorted} submissions (${none} with no type above the cut); linked builds whose top type is their project's own: ${agree} of ${linkedChecked}`,
			);
			console.log(
				`  submissions per type: ${[...tally]
					.sort((a, b) => b[1] - a[1])
					.map(([t, n]) => `${t} ${n}`)
					.join(", ")}`,
			);
			console.log("  winners, first 30:");
			for (const line of sample) console.log(line);
			categoriesOk = sorted > 0;
		}
	} catch (e) {
		console.error(
			`\n✗ categories: could not run (${(e as Error).message}); stored categories kept`,
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
		`\n${linked.length} builds link to a directory project (${linked.filter((r) => r.isWinner).length} winners; ${linked.filter((r) => r.projectLinkBasis === "website").length} by website, the rest by repo); ${ambiguous} builds' repos are listed by more than one project and stay unlinked`,
	);
	for (const r of linked.slice(0, 80))
		console.log(
			`  ${r.isWinner ? "winner" : "      "} ${(r.name ?? "").slice(0, 40).padEnd(40)} ${r.projectLinkBasis === "website" ? `site ${siteKeyOf(r.demoUrl)}` : r.repoFullName} -> ${r.projectSlug}`,
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
	if (!categoriesOk && !process.exitCode) {
		console.error(
			"✗ categories were not written this run (see the categories section). Rows were written; the analyze category facet keeps the stored values.",
		);
		process.exitCode = 2;
	}
	if (
		activityRepos.length >= 20 &&
		activityRead === 0 &&
		ghToken &&
		!process.exitCode
	) {
		console.error(
			"✗ no repo activity could be read. Rows were written; activity needs a re-run.",
		);
		process.exitCode = 2;
	}
	if (
		stackBatch.length >= 20 &&
		stackRun.failed > stackBatch.length / 2 &&
		!process.exitCode
	) {
		console.error(
			`✗ ${stackRun.failed} of ${stackBatch.length} repos could not be read. Rows were written; the stacks need a re-run.`,
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
