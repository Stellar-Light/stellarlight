/**
 * Ingest Electric Capital's crypto-ecosystems taxonomy (the public repo list
 * their developer-report numbers are computed from) into the `repos` index.
 *
 *   npx tsx scripts/ingest-ec-taxonomy.ts                 # dry run (default)
 *   npx tsx scripts/ingest-ec-taxonomy.ts --execute       # write
 *   npx tsx scripts/ingest-ec-taxonomy.ts --limit=2000    # batch size (default 2000)
 *   npx tsx scripts/ingest-ec-taxonomy.ts --skip=2000     # resume offset
 *   npx tsx scripts/ingest-ec-taxonomy.ts --backfill-tiers  # also tier existing rows
 *   npx tsx scripts/ingest-ec-taxonomy.ts --sync-removals   # archive EC-removed rows
 *
 * Design (repo-code-depth plan, Phase 1; unparked 2026-08-14 with the 9
 * review-blocker fixes — read-back on every write, rename-twin guard, fresh
 * per-row backfill, zero-work-red, derived exit code, GraphQL budget pacing,
 * removals→archive implemented, post-ingest live probes ride the workflow,
 * storage re-checked against Flex):
 *   - Coverage: EC's net Stellar list is ~10.5k repos vs our ~2.4k (4.4×).
 *   - METADATA-ONLY: EC-sourced repos never store readmeExcerpt. Storage at
 *     ~2.5KB/doc ≈ 26MB for the full list — trivial on the Flex cluster
 *     (the old M0 512MB concern dissolved with the 2026-08 upgrade).
 *   - Scored at ingest via repoGrade() on pure own-merit, then TIERED
 *     (tag-and-demote, never delete): archive / community / quality.
 *   - Provenance: source="ec-taxonomy" forever distinguishes these rows.
 *   - Backfill and removals passes are opt-in flags so the default ingest
 *     never touches rows other writers (enrich, scan) may be updating; run
 *     them when the enrich workflow is idle.
 */
import "./load-env";

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getPayload } from "payload";
import { isAllowlisted } from "../src/lib/repo-allowlist";
import { repoGrade } from "../src/lib/repo-grade";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const BACKFILL = args.includes("--backfill-tiers");
const SYNC_REMOVALS = args.includes("--sync-removals");
const LIMIT = Number(
	args.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 2000,
);
const SKIP = Number(
	args.find((a) => a.startsWith("--skip="))?.split("=")[1] ?? 0,
);
const TAXO_DIR = args
	.find((a) => a.startsWith("--taxonomy-dir="))
	?.split("=")[1];

const GH_TOKEN =
	process.env.GITHUB_TOKEN?.trim() ||
	process.env.NEXT_PUBLIC_GITHUB_TOKEN?.trim();
const VALID_IDENT = /^[A-Za-z0-9_.-]+$/;
const STALE_MS = 730 * 86_400_000; // ~24 months
const ACTIVE_MS = 90 * 86_400_000; // removals guard: fresh commits = manual review
/** GraphQL points kept in reserve — the PAT is shared with the scan waves. */
const BUDGET_RESERVE = 100;
const BATCH_PAUSE_MS = 300;

/** Net Stellar repo list from the EC taxonomy's migration log. */
function ecNetStellarList(): { net: string[]; removed: Set<string> } {
	let dir = TAXO_DIR;
	if (!dir) {
		dir = mkdtempSync(join(tmpdir(), "ec-taxonomy-"));
		console.log("Cloning electric-capital/crypto-ecosystems (shallow)…");
		execFileSync(
			"git",
			[
				"clone",
				"--depth",
				"1",
				"https://github.com/electric-capital/crypto-ecosystems.git",
				dir,
			],
			{ stdio: "pipe" },
		);
	}
	const migrations = join(dir, "migrations");
	if (!existsSync(migrations))
		throw new Error(`no migrations dir under ${dir}`);
	const adds = new Set<string>();
	const rems = new Set<string>();
	for (const f of readdirSync(migrations)) {
		const text = readFileSync(join(migrations, f), "utf8");
		for (const line of text.split("\n")) {
			const t = line.trim();
			let m = t.match(/^repadd Stellar (\S+)/);
			if (m) adds.add(m[1].toLowerCase().replace(/\/$/, ""));
			m = t.match(/^reprem Stellar (\S+)/);
			if (m) rems.add(m[1].toLowerCase().replace(/\/$/, ""));
		}
	}
	const toFull = (url: string): string | null => {
		if (!url.startsWith("https://github.com/")) return null;
		const [owner, name, ...rest] = url
			.replace("https://github.com/", "")
			.split("/");
		if (!owner || !name || rest.length) return null;
		if (!VALID_IDENT.test(owner) || !VALID_IDENT.test(name)) return null;
		return `${owner}/${name}`;
	};
	const net: string[] = [];
	for (const url of adds) {
		if (rems.has(url)) continue;
		const full = toFull(url);
		if (full) net.push(full);
	}
	const removed = new Set<string>();
	for (const url of rems) {
		const full = toFull(url);
		if (full) removed.add(full.toLowerCase());
	}
	return { net: net.sort(), removed };
}

interface GhRepo {
	fullName: string;
	description: string | null;
	topics: string[];
	primaryLanguage: string | null;
	stars: number;
	openIssues: number;
	lastCommitAt: string | null;
	isFork: boolean;
	isArchived: boolean;
	homepageUrl: string | null;
}

/** Batched GraphQL lookup — 50 repos per query via aliases, plus the API's
 * own budget meter so the run can stop BEFORE starving the shared PAT. */
async function fetchBatch(fulls: string[]): Promise<{
	repos: Map<string, GhRepo | null>;
	remaining: number;
	resetAt: string;
}> {
	const fields = fulls
		.map((full, i) => {
			const [owner, name] = full.split("/");
			return `r${i}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
				nameWithOwner description isFork isArchived homepageUrl pushedAt stargazerCount
				issues(states: OPEN) { totalCount }
				primaryLanguage { name }
				repositoryTopics(first: 10) { nodes { topic { name } } }
			}`;
		})
		.join("\n");
	const res = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			authorization: `Bearer ${GH_TOKEN}`,
			"content-type": "application/json",
			"user-agent": "stellarlight-ec-ingest",
		},
		body: JSON.stringify({
			query: `query {\nrateLimit { remaining resetAt }\n${fields}\n}`,
		}),
	});
	if (!res.ok)
		throw new Error(
			`graphql ${res.status}: ${(await res.text()).slice(0, 200)}`,
		);
	// biome-ignore lint/suspicious/noExplicitAny: GraphQL response shape
	const body = (await res.json()) as {
		data?: Record<string, any>;
		errors?: unknown[];
	};
	const out = new Map<string, GhRepo | null>();
	fulls.forEach((full, i) => {
		const r = body.data?.[`r${i}`];
		if (!r) {
			out.set(full, null); // deleted / renamed / DMCA — skip
			return;
		}
		out.set(full, {
			fullName: r.nameWithOwner,
			description: r.description ?? null,
			// biome-ignore lint/suspicious/noExplicitAny: GraphQL response shape
			topics: (r.repositoryTopics?.nodes ?? [])
				.map((n: any) => n?.topic?.name)
				.filter(Boolean),
			primaryLanguage: r.primaryLanguage?.name ?? null,
			stars: r.stargazerCount ?? 0,
			openIssues: r.issues?.totalCount ?? 0,
			lastCommitAt: r.pushedAt ?? null,
			isFork: !!r.isFork,
			isArchived: !!r.isArchived,
			homepageUrl: r.homepageUrl ?? null,
		});
	});
	return {
		repos: out,
		remaining: Number(body.data?.rateLimit?.remaining ?? 0),
		resetAt: String(body.data?.rateLimit?.resetAt ?? ""),
	};
}

/** Tier from stored/fetched fields — tag-and-demote, never delete. Allowlisted
 * canonical repos never tier to archive (that is what the allowlist is FOR). */
function tierOf(d: {
	fullName?: string | null;
	isArchived?: boolean | null;
	lastCommitAt?: string | Date | null;
	stars?: number | null;
	repoScoreLabel?: string | null;
}): "quality" | "community" | "archive" {
	const stale =
		!d.lastCommitAt ||
		Date.now() - new Date(d.lastCommitAt).getTime() > STALE_MS;
	const archivable = !isAllowlisted(d.fullName);
	if (archivable && (d.isArchived || (stale && (d.stars ?? 0) < 3)))
		return "archive";
	if (d.repoScoreLabel === "high") return "quality";
	return "community";
}

/** Payload type for the repo docs this script reads/writes. */
interface RepoDocLite {
	id: string;
	fullName: string;
	tier?: string | null;
	source?: string | null;
	repoScoreLabel?: string | null;
	isArchived?: boolean | null;
	lastCommitAt?: string | null;
	stars?: number | null;
}

async function main(): Promise<number> {
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"} | limit=${LIMIT} skip=${SKIP}` +
			`${BACKFILL ? " +backfill-tiers" : ""}${SYNC_REMOVALS ? " +sync-removals" : ""}`,
	);
	if (!GH_TOKEN) console.log("⚠ No GITHUB_TOKEN — GraphQL will fail. Set it.");

	const { net, removed } = ecNetStellarList();
	console.log(
		`EC net Stellar list: ${net.length} repos (${removed.size} removed historically)`,
	);
	if (net.length === 0) {
		// Empty-sweep red: a zero-row net list means the clone or the parser
		// broke, not that EC delisted the ecosystem (check-record-completeness
		// discipline).
		console.error(
			"RED: EC net list is EMPTY — parser or clone failure, refusing to proceed.",
		);
		return 1;
	}

	const payload = await getPayload({ config: await configPromise });
	const existing = new Map<string, RepoDocLite>();
	{
		let page = 1;
		for (;;) {
			const r = await payload.find({
				collection: "repos",
				limit: 500,
				page,
				depth: 0,
				select: {
					fullName: true,
					tier: true,
					source: true,
					repoScoreLabel: true,
					isArchived: true,
					lastCommitAt: true,
					stars: true,
				},
			});
			// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
			for (const d of r.docs as any[]) {
				existing.set(String(d.fullName).toLowerCase(), {
					id: String(d.id),
					fullName: String(d.fullName),
					tier: d.tier,
					source: d.source,
					repoScoreLabel: d.repoScoreLabel,
					isArchived: d.isArchived,
					lastCommitAt: d.lastCommitAt,
					stars: d.stars,
				});
			}
			if (!r.hasNextPage) break;
			page += 1;
		}
	}
	console.log(`existing index: ${existing.size} repos`);

	const stats = {
		created: 0,
		gone: 0,
		renamedDupes: 0,
		errors: 0,
		readbackMismatch: 0,
		budgetStopped: false,
		batchesDone: 0,
		tiers: { quality: 0, community: 0, archive: 0 },
	};

	// ── Optional: backfill tier for existing repos. Re-reads each candidate
	// FRESH before computing (the in-memory snapshot only nominates), writes
	// only the tier field, and read-backs the write — so a concurrent enrich
	// pass can't be clobbered and a silent drop can't pass (C1/#615 class).
	if (BACKFILL) {
		let backfilled = 0;
		let skippedFresh = 0;
		for (const [, snap] of existing) {
			const nominatedTier = tierOf(snap);
			if (snap.tier === nominatedTier) continue;
			if (!EXECUTE) {
				backfilled += 1;
				continue;
			}
			const fresh = (await payload.findByID({
				collection: "repos",
				id: snap.id,
				depth: 0,
			})) as unknown as RepoDocLite | null;
			if (!fresh) continue;
			const t = tierOf(fresh);
			if (fresh.tier === t) {
				skippedFresh += 1; // another writer already fixed it
				continue;
			}
			await payload.update({
				collection: "repos",
				id: snap.id,
				data: { tier: t },
			});
			const check = (await payload.findByID({
				collection: "repos",
				id: snap.id,
				depth: 0,
			})) as unknown as RepoDocLite | null;
			if (check?.tier !== t) {
				stats.readbackMismatch += 1;
				console.error(
					`  ✗ read-back mismatch (tier) ${snap.fullName}: wrote ${t}, read ${check?.tier}`,
				);
			} else {
				backfilled += 1;
			}
		}
		console.log(
			`tier backfill: ${backfilled} ${EXECUTE ? "updated+verified" : "would update"}` +
				`${skippedFresh ? ` (${skippedFresh} already fixed concurrently)` : ""}`,
		);
	}

	// ── Optional: EC removals → tier=archive (the header's promise, now real).
	// Guards: allowlisted repos never archive; rows with fresh commits are
	// listed for manual review instead of archived (a rename or an EC
	// reclassification of a live repo is not evidence of death).
	if (SYNC_REMOVALS) {
		const netSet = new Set(net.map((f) => f.toLowerCase()));
		const candidates = [...existing.values()].filter(
			(d) =>
				d.source === "ec-taxonomy" && !netSet.has(d.fullName.toLowerCase()),
		);
		let archived = 0;
		const reviewList: string[] = [];
		for (const d of candidates) {
			if (isAllowlisted(d.fullName)) continue;
			const active =
				d.lastCommitAt &&
				Date.now() - new Date(d.lastCommitAt).getTime() < ACTIVE_MS;
			if (active) {
				reviewList.push(d.fullName);
				continue;
			}
			if (d.tier === "archive") continue;
			archived += 1;
			if (!EXECUTE) continue;
			await payload.update({
				collection: "repos",
				id: d.id,
				data: { tier: "archive" },
			});
			const check = (await payload.findByID({
				collection: "repos",
				id: d.id,
				depth: 0,
			})) as unknown as RepoDocLite | null;
			if (check?.tier !== "archive") {
				stats.readbackMismatch += 1;
				console.error(`  ✗ read-back mismatch (removal) ${d.fullName}`);
			}
		}
		console.log(
			`EC removals: ${candidates.length} candidates → ${archived} ${EXECUTE ? "archived+verified" : "would archive"}` +
				`${reviewList.length ? ` | removed-but-ACTIVE (manual review, untouched): ${reviewList.join(", ")}` : ""}`,
		);
	}

	// ── New repos from EC, batched
	const fresh = net.filter((f) => !existing.has(f.toLowerCase()));
	console.log(`NEW from EC (not indexed): ${fresh.length}`);
	console.log(
		`  storage estimate for full list: ~${Math.round((fresh.length * 2.5) / 1024)}MB metadata-only (Flex cluster — fine)`,
	);
	const slice = fresh.slice(SKIP, SKIP + LIMIT);
	console.log(`this run processes: ${slice.length} (skip=${SKIP})`);

	/** Canonical names created THIS run — the second half of the rename-twin
	 * guard (two EC entries can resolve to one canonical repo). */
	const createdThisRun = new Set<string>();

	for (let i = 0; i < slice.length; i += 50) {
		const batch = slice.slice(i, i + 50);
		let fetched: Map<string, GhRepo | null>;
		try {
			const r = await fetchBatch(batch);
			fetched = r.repos;
			stats.batchesDone += 1;
			if (r.remaining > 0 && r.remaining < BUDGET_RESERVE) {
				// BUDGET-STOPPED (scan-wave discipline): stop cleanly with a
				// resume offset instead of starving the shared PAT to zero.
				console.log(
					`BUDGET-STOPPED: rateLimit.remaining=${r.remaining} < reserve ${BUDGET_RESERVE} (resets ${r.resetAt}).`,
				);
				console.log(`  resume with: --skip=${SKIP + i + batch.length}`);
				stats.budgetStopped = true;
			}
		} catch (err) {
			console.error(`  ✗ batch @${SKIP + i}: ${(err as Error).message}`);
			stats.errors += batch.length;
			continue;
		}
		for (const [full, r] of fetched) {
			if (!r) {
				stats.gone += 1;
				continue;
			}
			// Rename-twin guard (#783/#843 class): GraphQL returns the CANONICAL
			// nameWithOwner, which can differ from the EC-queried name. If a row
			// already exists under the canonical name (in the DB or created
			// earlier this run), this is the same repo reached twice — skip.
			const canonical = r.fullName.toLowerCase();
			if (
				(canonical !== full.toLowerCase() && existing.has(canonical)) ||
				createdThisRun.has(canonical)
			) {
				stats.renamedDupes += 1;
				continue;
			}
			const grade = repoGrade({
				lastCommitAt: r.lastCommitAt,
				stargazerCount: r.stars,
				isFork: r.isFork,
				isArchived: r.isArchived,
				hasDescription: !!r.description,
				topicCount: r.topics.length,
				openIssues: r.openIssues,
			});
			const tier = tierOf({
				fullName: r.fullName,
				isArchived: r.isArchived,
				lastCommitAt: r.lastCommitAt,
				stars: r.stars,
				repoScoreLabel: grade.label,
			});
			stats.tiers[tier] += 1;
			stats.created += 1;
			createdThisRun.add(canonical);
			if (EXECUTE) {
				const [owner, name] = r.fullName.split("/");
				try {
					const doc = await payload.create({
						collection: "repos",
						data: {
							fullName: r.fullName,
							owner,
							name,
							url: `https://github.com/${r.fullName}`,
							description: r.description,
							topics: r.topics,
							primaryLanguage: r.primaryLanguage,
							stars: r.stars,
							openIssues: r.openIssues,
							lastCommitAt: r.lastCommitAt,
							homepageUrl: r.homepageUrl,
							isFork: r.isFork,
							isArchived: r.isArchived,
							// METADATA-ONLY by design: no readmeExcerpt for EC-sourced repos
							repoScore: grade.score,
							repoScoreLabel: grade.label,
							source: "ec-taxonomy",
							tier,
							lastEnrichedAt: new Date().toISOString(),
						},
					});
					// Read-back (C1/#615 silent-drop class): prove the write
					// persisted AS SENT — payload reports success even when it
					// drops unknown keys.
					const check = (await payload.findByID({
						collection: "repos",
						id: String(doc.id),
						depth: 0,
					})) as unknown as RepoDocLite | null;
					if (!check || check.source !== "ec-taxonomy" || check.tier !== tier) {
						stats.readbackMismatch += 1;
						console.error(
							`  ✗ read-back mismatch ${r.fullName}: source=${check?.source} tier=${check?.tier} (sent ec-taxonomy/${tier})`,
						);
					}
				} catch (err) {
					stats.errors += 1;
					stats.created -= 1;
					console.error(`  ✗ create ${r.fullName}: ${(err as Error).message}`);
				}
			}
		}
		if (stats.budgetStopped) break;
		if ((i / 50) % 10 === 0)
			console.log(`  …${SKIP + i + batch.length}/${SKIP + slice.length}`);
		if (i + 50 < slice.length)
			await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
	}

	console.log(`\n${EXECUTE ? "Created" : "Would create"}: ${stats.created}`);
	console.log(
		`  tiers: quality=${stats.tiers.quality} community=${stats.tiers.community} archive=${stats.tiers.archive}`,
	);
	console.log(
		`  gone: ${stats.gone} | renamed-dupes: ${stats.renamedDupes} | errors: ${stats.errors} | read-back mismatches: ${stats.readbackMismatch}`,
	);
	console.log(
		`  remaining after this run: ${Math.max(0, fresh.length - SKIP - slice.length)}`,
	);
	if (!EXECUTE) console.log("\nDry run. --execute to write.");

	// Exit code DERIVED from what happened (no unconditional green — the C3
	// exit-stomp class). Zero-work-red: attempted work but produced nothing.
	const attempted = slice.length;
	if (stats.readbackMismatch > 0) {
		console.error(
			"RED: read-back mismatches — writes are not persisting as sent.",
		);
		return 1;
	}
	if (stats.budgetStopped && stats.batchesDone <= 1) {
		console.error(
			"RED: BUDGET-STOPPED with ≤1 batch done — zero-work run, PAT starved.",
		);
		return 1;
	}
	if (attempted > 0 && stats.created === 0 && stats.errors > 0) {
		console.error(
			"RED: attempted a wave but created nothing and saw errors — zero-work run.",
		);
		return 1;
	}
	if (stats.errors > attempted * 0.3) {
		console.error(`RED: error rate ${stats.errors}/${attempted} exceeds 30%.`);
		return 1;
	}
	return 0;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
