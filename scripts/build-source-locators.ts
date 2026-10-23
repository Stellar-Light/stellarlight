/**
 * Build the source-locator index that locateSource (/api/sources/locate)
 * serves: per allowlisted repo, resolve the default-branch commit, read the
 * tree from ONE public tarball at that commit, extract locators per file
 * type (src/lib/source-locator-extract.ts) and store pointers in
 * source-locators (repo, ref, path, locator kind and name, line, git blob
 * sha, match terms; never a file body) and each repo's indexed commit in
 * source-locator-repos.
 *
 *   pnpm exec tsx scripts/build-source-locators.ts                # dry run: plan vs the stored index
 *   pnpm exec tsx scripts/build-source-locators.ts --execute      # write, read back, stamp repo state
 *   pnpm exec tsx scripts/build-source-locators.ts --execute --scheduled
 *       # the schedule's form: writes only once the index has been seeded by
 *       # a hand-dispatched execute (after its dry run was read); dry before
 *   pnpm exec tsx scripts/build-source-locators.ts --replan       # rebuild at each repo's STORED ref; must plan 0
 *   pnpm exec tsx scripts/build-source-locators.ts --no-db --out f.json [--repo quickstart]
 *       # no database at all: counts, plus the rows as JSON for offline evaluation
 *
 * Writes only when a pointer is new, gone, or its file's blob changed, so
 * a second run at the same commits plans 0 writes and a HEAD move that
 * leaves a file untouched rewrites none of its pointers (the stored ref
 * stays a valid permalink: same blob, same lines). The one writer of both
 * collections.
 *
 * Cost: 8 GitHub API reads (HEAD sha) and 8 tarballs per run, about 45 MB
 * in total; GITHUB_TOKEN is optional (lifts the 60/hour API limit).
 */

import "./load-env";
import { writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
	type IndexRow,
	resolveRepo,
	SOURCE_REPO_NAMES,
} from "../src/lib/source-locator";
import { buildRows, tarFiles } from "../src/lib/source-locator-extract";
import { formatMismatches, verifyWrites } from "../src/lib/utils/read-back";

/** Bump when extraction or term rules change; changed terms are re-planned either way. */
const BUILDER_VERSION = "1";
const args = process.argv.slice(2);
const flag = (name: string) =>
	args.includes(name) ? (args[args.indexOf(name) + 1] ?? "") : null;
let execute = args.includes("--execute");
const scheduled = args.includes("--scheduled");
const replan = args.includes("--replan");
const noDb = args.includes("--no-db");
const outPath = flag("--out");
const repoArg = flag("--repo");
const onlyRepo = repoArg === null ? null : resolveRepo(repoArg);
if (repoArg !== null && !onlyRepo) {
	console.error(`unknown --repo; valid: ${SOURCE_REPO_NAMES.join(", ")}`);
	process.exit(2);
}
if (!noDb && !process.env.DATABASE_URI) {
	console.error("DATABASE_URI is not set (pass --no-db for a counts-only run)");
	process.exit(2);
}
if (noDb && (execute || replan)) {
	console.error("--execute and --replan need the database");
	process.exit(2);
}

const ghHeaders = (accept: string): Record<string, string> => ({
	Accept: accept,
	"User-Agent": "stellarlight-source-locators",
	...(process.env.GITHUB_TOKEN
		? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
		: {}),
});

async function headRef(repo: string): Promise<string> {
	const r = await fetch(`https://api.github.com/repos/${repo}/commits/HEAD`, {
		headers: ghHeaders("application/vnd.github.sha"),
		signal: AbortSignal.timeout(30_000),
	});
	const sha = (await r.text()).trim();
	if (!r.ok || !/^[0-9a-f]{40}$/.test(sha))
		throw new Error(`${repo}: HEAD sha read failed (${r.status})`);
	return sha;
}

async function tarball(repo: string, ref: string): Promise<Buffer> {
	const r = await fetch(`https://codeload.github.com/${repo}/tar.gz/${ref}`, {
		headers: { "User-Agent": "stellarlight-source-locators" },
		signal: AbortSignal.timeout(180_000),
	});
	if (!r.ok) throw new Error(`${repo}@${ref}: tarball ${r.status}`);
	return gunzipSync(Buffer.from(await r.arrayBuffer()));
}

const sameTerms = (a: string[] = [], b: string[] = []) =>
	a.length === b.length && a.every((t, i) => t === b[i]);

async function run() {
	// biome-ignore lint/suspicious/noExplicitAny: mongoose models behind payload.db
	let models: { rows: any; repos: any } | null = null;
	if (!noDb) {
		const { getPayload } = await import("payload");
		const { default: config } = await import("../src/payload.config");
		const payload = await getPayload({ config });
		// biome-ignore lint/suspicious/noExplicitAny: payload.db mongoose internals
		const collections = (payload.db as any)?.collections;
		models = {
			rows: collections?.["source-locators"],
			repos: collections?.["source-locator-repos"],
		};
		if (!models.rows || !models.repos)
			throw new Error("source-locators collections missing from Payload");
		if (execute && scheduled && !(await models.repos.countDocuments())) {
			console.log(
				"scheduled run on an unseeded index: dry run only. The first fill is a hand-dispatched execute, after its dry run is read.",
			);
			execute = false;
		}
		if (execute) {
			await models.rows.createIndexes();
			await models.repos.createIndexes();
		}
	}
	console.log(
		execute ? "EXECUTE MODE" : replan ? "REPLAN (stored refs)" : "DRY RUN MODE",
	);
	console.log(noDb ? "database: none (counts only)\n" : "database: yes\n");

	const repos = onlyRepo ? [onlyRepo] : SOURCE_REPO_NAMES;
	const out: Record<string, unknown> = {};
	let totalWrites = 0;
	let failures = 0;
	for (const repo of repos) {
		const started = Date.now();
		try {
			let ref: string;
			if (replan) {
				const state = await models?.repos.findOne({ repo }).lean();
				if (!state?.ref) {
					console.log(`${repo}: no stored ref, nothing to replan`);
					continue;
				}
				ref = state.ref;
			} else ref = await headRef(repo);
			const build = buildRows(repo, ref, tarFiles(await tarball(repo, ref)));
			const byKind = { file: 0, symbol: 0, heading: 0 };
			for (const r of build.rows) byKind[r.locatorKind]++;
			const bytes = Buffer.byteLength(JSON.stringify(build.rows));
			console.log(
				`${repo}@${ref.slice(0, 12)}: ${build.files} files, ${build.rows.length} pointers (file ${byKind.file}, symbol ${byKind.symbol}, heading ${byKind.heading}), ${(bytes / 1024 / 1024).toFixed(2)} MiB as JSON, ${Date.now() - started} ms`,
			);
			out[repo] = { ref, files: build.files, byKind, rows: build.rows };
			if (!models) continue;

			const existing = new Map<string, IndexRow>();
			for (const r of await models.rows
				.find(
					{ repo },
					{ key: 1, blobSha: 1, line: 1, terms: 1, ref: 1, _id: 0 },
				)
				.lean())
				existing.set(r.key, r);
			const next = new Map(build.rows.map((r) => [r.key, r]));
			const upserts = build.rows.filter((r) => {
				const prev = existing.get(r.key);
				return (
					!prev ||
					prev.blobSha !== r.blobSha ||
					(prev.line ?? null) !== r.line ||
					!sameTerms(prev.terms, r.terms)
				);
			});
			const deletes = [...existing.keys()].filter((k) => !next.has(k));
			const creates = upserts.filter((r) => !existing.has(r.key)).length;
			const writes = upserts.length + deletes.length;
			totalWrites += writes;
			console.log(
				`  plan: writes=${writes} (create ${creates}, update ${upserts.length - creates}, delete ${deletes.length}); stored ${existing.size}`,
			);
			if (!execute) continue;

			for (let i = 0; i < upserts.length; i += 1000)
				await models.rows.bulkWrite(
					upserts.slice(i, i + 1000).map((r) => ({
						updateOne: {
							filter: { key: r.key },
							update: { $set: r },
							upsert: true,
						},
					})),
					{ ordered: false },
				);
			for (let i = 0; i < deletes.length; i += 1000)
				await models.rows.deleteMany({
					key: { $in: deletes.slice(i, i + 1000) },
				});

			// Read-back: every upserted row holds what was sent; no deleted key remains.
			const sent = new Map(
				upserts.map((r) => [r.key, r as unknown as Record<string, unknown>]),
			);
			const mismatches = await verifyWrites(
				sent,
				async (keys) => {
					const back = await models?.rows
						.find({ key: { $in: keys } }, { _id: 0 })
						.lean();
					return new Map(
						(back ?? []).map((d: Record<string, unknown>) => [
							String(d.key),
							d,
						]),
					);
				},
				["ref", "path", "locatorKind", "locator", "line", "blobSha", "terms"],
				1000,
			);
			const lingering = deletes.length
				? await models.rows.countDocuments({ key: { $in: deletes } })
				: 0;
			if (mismatches.length || lingering) {
				console.error(
					`  ✗ read-back: ${mismatches.length} field(s) not as sent, ${lingering} deleted key(s) still stored\n${formatMismatches(mismatches)}`,
				);
				failures++;
				continue; // repo state keeps the previous build: verifiedAt never overstates
			}
			const stored = await models.rows.countDocuments({ repo });
			await models.repos.updateOne(
				{ repo },
				{
					$set: {
						repo,
						ref,
						builtAt: new Date(),
						files: build.files,
						pointers: stored,
						builderVersion: BUILDER_VERSION,
					},
				},
				{ upsert: true },
			);
			console.log(`  ✓ wrote ${writes}, read back; ${stored} stored`);
		} catch (e) {
			failures++;
			console.error(`${repo}: ${e instanceof Error ? e.message : e}`);
		}
	}
	if (outPath) {
		writeFileSync(outPath, JSON.stringify(out));
		console.log(`\nrows written to ${outPath}`);
	}
	if (models) console.log(`\nreplan: writes=${totalWrites}`);
	if (failures) process.exitCode = 1;
	else if (replan && totalWrites > 0) {
		console.error("✗ replan planned writes right after an execute");
		process.exitCode = 1;
	}
}

run()
	.catch((e) => {
		console.error(e);
		process.exitCode = 1;
	})
	.finally(() => {
		// Payload keeps the Mongo pool open; exit with the code set above.
		setTimeout(() => process.exit(), 100).unref();
	});
