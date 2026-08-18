/**
 * Stamp activitySignals (commits90d, lastCommitAt, stars, …) on repos that
 * have none — the lane enrich-repos.ts never reaches.
 *
 * Why this exists: enrich-repos.ts walks repos FROM projects (github.repos +
 * links.github), so a repo with no projectSlug is never visited. That is
 * 10,017 of the 10,538 rows with no commits90d (2026-08-18) — the whole
 * `source: ec-taxonomy` lane, sitting at codeScanState pending since ingest.
 * Every "is this repo active" answer about them is null; /api/builders
 * onStellar reads own90d = 0 for people who own 78 of them; the leaderboard
 * cannot rank on commits it doesn't hold.
 *
 * Deliberately NARROW: only the activity block + the plain GitHub facts that
 * ride on the same query (stars, openIssues, lastCommitAt, isArchived,
 * primaryLanguage). It never touches projectSlug, repoScore, tier, triage or
 * knowledgeNotes — those are enrich-repos' job and are derived from the
 * project link this lane does not have. Read-back verified (payload.update
 * silently drops unknown keys — prove it landed).
 *
 * Budget: one PAT/hour pool is shared with the scanner and enrich passes
 * (the starvation class). fetchRepoInfoBatch puts 15 repos per GraphQL
 * query; ACTIVITY_LIMIT caps rows per run (default 1,500 ≈ 100 queries).
 * Oldest-stamped / never-stamped first, so a daily run walks the whole lane
 * in about a week and then keeps it fresh.
 *
 *   npx tsx scripts/enrich-repo-activity.ts              # dry-run
 *   npx tsx scripts/enrich-repo-activity.ts --execute    # write
 *   ACTIVITY_LIMIT=300 … --execute                       # smaller bite
 *   … --only owner/name                                  # one repo
 *   … --stale-days 14                                    # also refresh rows older than N days
 */
import "./load-env";
import { getPayload } from "payload";
import { fetchRepoInfoBatch, gqlBatchStats } from "../src/lib/github";
import { formatMismatches, verifyWrites } from "../src/lib/utils/read-back";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const LIMIT = Number(process.env.ACTIVITY_LIMIT || "1500") || 1500;
const onlyIdx = process.argv.indexOf("--only");
const ONLY = onlyIdx >= 0 ? (process.argv[onlyIdx + 1] ?? "") : "";
const staleIdx = process.argv.indexOf("--stale-days");
const STALE_DAYS =
	staleIdx >= 0 ? Number(process.argv[staleIdx + 1] ?? "0") || 0 : 0;

type Doc = Record<string, any>;
const VALID = /^[A-Za-z0-9_.-]+$/;

async function main() {
	console.log(
		`enrich-repo-activity — ${EXECUTE ? "EXECUTE" : "DRY RUN"} · limit ${LIMIT}${ONLY ? ` · only ${ONLY}` : ""}${STALE_DAYS ? ` · stale>${STALE_DAYS}d` : ""} · token: ${process.env.GITHUB_TOKEN ? "yes" : "NO"}`,
	);
	const payload = await getPayload({ config: configPromise });

	// Candidates: never-stamped first, then (optionally) the stalest.
	// biome-ignore lint/suspicious/noExplicitAny: Payload Where
	let where: any = ONLY
		? { fullName: { equals: ONLY } }
		: { "activitySignals.commits90d": { exists: false } };
	if (!ONLY && STALE_DAYS > 0) {
		const cutoff = new Date(Date.now() - STALE_DAYS * 86_400_000).toISOString();
		where = {
			or: [
				{ "activitySignals.commits90d": { exists: false } },
				{ "activitySignals.asOf": { less_than: cutoff } },
			],
		};
	}

	const res = await payload.find({
		collection: "repos",
		where,
		limit: LIMIT,
		depth: 0,
		// oldest stamp first; never-stamped rows sort first under Mongo nulls
		sort: "activitySignals.asOf",
		select: {
			fullName: true,
			owner: true,
			source: true,
			activitySignals: true,
			isArchived: true,
		},
	});
	const docs = res.docs as Doc[];
	console.log(
		`candidates: ${docs.length} (of ${res.totalDocs} matching) · by source: ${JSON.stringify(
			docs.reduce<Record<string, number>>((m, d) => {
				const k = String(d.source ?? "unknown");
				m[k] = (m[k] ?? 0) + 1;
				return m;
			}, {}),
		)}`,
	);
	if (!docs.length) {
		console.log("nothing to do");
		return;
	}

	const pairs = docs
		.map((d) => {
			const [owner, ...rest] = String(d.fullName ?? "").split("/");
			return { doc: d, owner, name: rest.join("/") };
		})
		.filter((p) => VALID.test(p.owner) && VALID.test(p.name));
	const skipped = docs.length - pairs.length;
	if (skipped)
		console.log(`  skipped ${skipped} row(s) with malformed fullName`);

	const results = await fetchRepoInfoBatch(
		pairs.map((p) => ({ owner: p.owner, name: p.name })),
	);
	const st = gqlBatchStats();
	console.log(
		`  GraphQL: ${st.queries} batched queries covering ${st.repos} repos`,
	);

	const sent = new Map<string, Record<string, unknown>>();
	let ok = 0;
	let gone = 0;
	let errored = 0;
	const asOf = new Date().toISOString();
	for (let i = 0; i < pairs.length; i++) {
		const { doc } = pairs[i];
		const r = results[i];
		if (!r || "error" in r) {
			// "Repository not found" = deleted/renamed/private on GitHub. That
			// is a FACT worth keeping: stamp asOf so we don't re-ask daily, and
			// mark it observed-missing rather than leaving null (= never asked).
			if (r && /not found/i.test(r.error)) {
				// A null commits90d with a FRESH asOf reads as "asked, GitHub had
				// no repo" — distinct from asOf missing (= never asked). No extra
				// note field: activitySignals has no such key and payload.update
				// would drop it silently.
				gone++;
				sent.set(String(doc.id), {
					activitySignals: {
						commits90d: null,
						lastReleaseAt: null,
						releaseTag: null,
						openPRs: null,
						asOf,
					},
				});
			} else {
				errored++;
			}
			continue;
		}
		const info = r.info;
		ok++;
		sent.set(String(doc.id), {
			// activity block — identical shape to enrich-repos.ts
			activitySignals: {
				commits90d: info.commits90d ?? null,
				lastReleaseAt: info.lastReleaseAt ?? null,
				releaseTag: info.releaseTag ?? null,
				openPRs: info.openPRs ?? null,
				asOf,
			},
			// plain facts from the same query; harmless to refresh
			lastCommitAt: info.lastCommitAt ?? null,
			stars: info.stargazerCount ?? 0,
			openIssues: info.openIssues ?? 0,
			isArchived: !!info.isArchived,
			primaryLanguage: info.primaryLanguage ?? null,
		});
	}
	console.log(
		`  fetched ok: ${ok} · not found on GitHub: ${gone} · other errors (left untouched): ${errored}`,
	);

	// Preview a few so a dry run is inspectable.
	let shown = 0;
	for (const [id, data] of sent) {
		if (shown++ >= 5) break;
		const d = docs.find((x) => String(x.id) === id);
		const a = data.activitySignals as Record<string, unknown>;
		console.log(
			`    ${d?.fullName}: commits90d=${a.commits90d} lastCommitAt=${String(data.lastCommitAt ?? "").slice(0, 10) || "-"} stars=${data.stars ?? "-"}`,
		);
	}

	if (!EXECUTE) {
		console.log(
			`\nDRY RUN — ${sent.size} row(s) would be updated. Re-run with --execute.`,
		);
		return;
	}

	let written = 0;
	for (const [id, data] of sent) {
		try {
			await payload.update({
				collection: "repos",
				id,
				data,
				context: { internal: true },
			});
			written++;
		} catch (e) {
			console.error(
				`  update failed for ${id}: ${e instanceof Error ? e.message : e}`,
			);
		}
	}
	console.log(`  wrote ${written}/${sent.size}`);

	// Read back: prove the activity block landed (payload.update drops
	// unknown keys silently and reports success).
	const mismatches = await verifyWrites(
		sent,
		async (keys) => {
			const back = await payload.find({
				collection: "repos",
				where: { id: { in: keys } },
				limit: keys.length,
				depth: 0,
				select: { activitySignals: true, lastCommitAt: true, stars: true },
			});
			const m = new Map<string, Record<string, unknown>>();
			for (const d of back.docs as Doc[]) m.set(String(d.id), d);
			return m;
		},
		// verifyWrites compares TOP-LEVEL keys (no dotted paths — a dotted
		// name would compare undefined to undefined and pass vacuously). The
		// whole activitySignals group is one key; sameValue handles the nesting.
		["activitySignals", "lastCommitAt"],
	);
	if (mismatches.length) {
		console.error(
			`  READ-BACK MISMATCHES: ${mismatches.length}\n${formatMismatches(mismatches)}`,
		);
		process.exit(1);
	}
	console.log("  read-back: all writes verified");
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
