/**
 * Gone repos — the index serves repositories that no longer exist on GitHub,
 * and they rank first for their own name.
 *
 * Measured live 2026-09-14: `safetrust-ZK` returned PatrickKish1/safetrust-ZK
 * as result #1 while `GET /repos/PatrickKish1/safetrust-ZK` is a 404. Same for
 * kingfavourjudah/FundBlock and Dione-b/stellarsight. 424 rows sit at
 * codeScanState `error`; the ones whose codeScanError is no-tree/unfetchable
 * are mostly not scanner failures at all — the repository is deleted.
 *
 *   pnpm exec tsx scripts/check-gone-repos.ts               # probe + artifact
 *   pnpm exec tsx scripts/check-gone-repos.ts --self-test   # classifier only
 *   pnpm exec tsx scripts/check-gone-repos.ts --execute     # + write the state
 *
 * Reads candidates from the PUBLIC repos API (no store credentials), asks
 * GitHub once per repo, and classifies from the HTTP STATUS:
 *
 *   gone       404 — deleted, renamed with no redirect, or now private
 *   empty      200 and size 0 KB (unborn HEAD; the trees API 409s on these)
 *   alive      200 with content — a genuine scanner failure, a different bug
 *   unchecked  no token, rate limit, 5xx, thrown fetch — NOT a verdict
 *
 * `unchecked` is never reported as `gone`. The trap that makes this a written
 * rule: `gh api repos/<x> --jq .full_name` prints GitHub's error JSON on a
 * 404, so a non-empty result is not proof of existence — the first pass over
 * this population reported "162 alive, 0 gone" for 126 dead repos. The
 * classifier (`repoExistence`, src/lib/github.ts) therefore takes a status and
 * never a body, and is pinned by src/lib/__tests__/gone-repos.test.ts.
 *
 * Exits: 0 clean · 1 a finding (rows are gone, or a `gone` row came back) ·
 * 2 could not look (no token, the API did not answer, or more than half the
 * run was blind). A run that could not look must never read as a clean run.
 *
 * --execute writes codeScanState + codeScanError and reads every row back
 * (QUALITY.md §3): payload.update() drops unknown keys and reports success.
 * It writes nothing else — no tier, no score, no retirement. The schedule is
 * report-only; the flip stays a dispatch a human makes.
 */
// First import, hoisted: scripts/load-env must evaluate before anything that
// can reach payload.config (the ESM-ordering class). The config itself is
// imported lazily below so the read-only lane needs no store credentials.
import "./load-env";
import { strict as assert } from "node:assert";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type RepoExistence, repoExistence } from "../src/lib/github";
import { formatMismatches, verifyWrites } from "../src/lib/utils/read-back";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const OUT = join(process.cwd(), "improvements/audits/gone-repos-latest.json");
const EXECUTE = process.argv.includes("--execute");
const JSON_OUT = process.argv.includes("--json");
const LIMIT = Number(
	process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 600,
);
const GH_TOKEN =
	process.env.GITHUB_TOKEN?.trim() || process.env.GH_TOKEN?.trim() || "";
const UA = "stellarlight-gone-repos/1.0 (+https://stellarlight.xyz)";
const CONCURRENCY = 4;

/** States worth asking GitHub about. `error` is the population the defect was
 *  measured in; `gone` rides along so a repo that comes BACK (restored, or a
 *  rename that grew a redirect) is un-hidden instead of hidden forever. */
const CANDIDATE_STATES = ["error", "gone"] as const;

interface RepoRow {
	id?: string;
	fullName?: string | null;
	source?: string | null;
	codeScanState?: string | null;
	codeScanError?: string | null;
}

export interface GoneRow {
	fullName: string;
	was: string;
	verdict: RepoExistence;
	httpStatus: number | null;
	sizeKb: number | null;
	priorError: string | null;
	checkedAt: string;
}

/** Page the public repos API. null = it did not answer (blind, never empty). */
async function fetchCandidates(): Promise<RepoRow[] | null> {
	const rows: RepoRow[] = [];
	const where = CANDIDATE_STATES.map(
		(s, i) => `where[or][${i}][codeScanState][equals]=${s}`,
	).join("&");
	for (let p = 1; p < 40; p++) {
		try {
			const res = await fetch(
				`${BASE}/api/repos?${where}&limit=200&page=${p}&depth=0`,
				{
					headers: { accept: "application/json", "user-agent": UA },
					signal: AbortSignal.timeout(30_000),
				},
			);
			if (!res.ok) return null;
			const body = (await res.json()) as {
				docs?: RepoRow[];
				hasNextPage?: boolean;
			};
			rows.push(...(body.docs ?? []));
			if (!body.hasNextPage) break;
		} catch {
			return null;
		}
	}
	return rows;
}

/** ONE GitHub read per repo. Returns the status (and size when it answered);
 *  a thrown fetch is a null status, which the classifier calls `unchecked`.
 *  fetch follows redirects, so a renamed repo resolves to its 200 and is
 *  alive — an unfollowed 301/308 faking a death is the liveness-probe class. */
async function probe(
	fullName: string,
): Promise<{ status: number | null; sizeKb: number | null }> {
	try {
		const res = await fetch(`https://api.github.com/repos/${fullName}`, {
			headers: {
				accept: "application/vnd.github+json",
				authorization: `Bearer ${GH_TOKEN}`,
				"user-agent": UA,
			},
			signal: AbortSignal.timeout(20_000),
		});
		if (res.status !== 200) return { status: res.status, sizeKb: null };
		const body = (await res.json()) as { size?: number };
		return {
			status: 200,
			sizeKb: typeof body.size === "number" ? body.size : null,
		};
	} catch {
		return { status: null, sizeKb: null };
	}
}

/** --execute: write the state and PROVE it persisted. Imported lazily so the
 *  read-only lane never evaluates payload.config and needs no DATABASE_URI. */
type Change = { r: GoneRow; data: Record<string, string> };

async function applyWrites(rows: GoneRow[]): Promise<number> {
	const changes = rows
		.map((r): Change | null => {
			const day = r.checkedAt.slice(0, 10);
			if (r.verdict === "gone" && r.was !== "gone")
				return {
					r,
					data: {
						codeScanState: "gone",
						codeScanError: `repo not found on GitHub (404) as of ${day}`,
					},
				};
			// A gone row that answers again goes back to `error`, the state the
			// scanner re-picks with --retry-excluded. Never straight to scanned.
			if (r.was === "gone" && (r.verdict === "alive" || r.verdict === "empty"))
				return {
					r,
					data: {
						codeScanState: "error",
						codeScanError: `reachable again on ${day} (${r.verdict}) — requeued for scan`,
					},
				};
			return null;
		})
		.filter((c): c is Change => c !== null);
	if (!changes.length) {
		console.log("\nEXECUTE: nothing to write.");
		return 0;
	}
	const { getPayloadOrInconclusive } = await import("./lib/payload-connect");
	const config = (await import("../src/payload.config")).default;
	const payload = await getPayloadOrInconclusive(await config);

	const sent = new Map<string, Record<string, unknown>>();
	let failed = 0;
	for (const { r, data } of changes) {
		try {
			const found = await payload.find({
				collection: "repos",
				where: { fullName: { equals: r.fullName } },
				limit: 1,
				depth: 0,
				select: { fullName: true },
				context: { internal: true },
			});
			const id = String(found.docs[0]?.id ?? "");
			if (!id) {
				failed++;
				console.error(`  no row for ${r.fullName}`);
				continue;
			}
			await payload.update({
				collection: "repos",
				id,
				data,
				context: { internal: true },
			});
			sent.set(id, data);
		} catch (e) {
			failed++;
			console.error(
				`  update failed for ${r.fullName}: ${e instanceof Error ? e.message : e}`,
			);
		}
	}
	console.log(`\nEXECUTE: wrote ${sent.size}/${changes.length}`);

	// Read-back: "the call resolved" is evidence about the CALL (#615).
	const FIELDS = ["codeScanState", "codeScanError"] as const;
	const select = { codeScanState: true, codeScanError: true };
	const readOne = async (id: string) => {
		const one = await payload.find({
			collection: "repos",
			where: { id: { equals: id } },
			limit: 1,
			depth: 0,
			select,
			context: { internal: true },
		});
		return (one.docs[0] as Record<string, unknown> | undefined) ?? null;
	};
	const mismatches = sent.size
		? await verifyWrites(
				sent,
				async (keys) => {
					const back = await payload.find({
						collection: "repos",
						where: { id: { in: keys } },
						limit: keys.length,
						depth: 0,
						select,
						context: { internal: true },
					});
					const m = new Map<string, Record<string, unknown>>();
					for (const d of back.docs as Array<Record<string, unknown>>)
						m.set(String(d.id), d);
					return m;
				},
				FIELDS,
				200,
				readOne,
			)
		: [];
	if (mismatches.length) {
		console.error(
			`  ✗ ${mismatches.length} field(s) did NOT persist as sent:\n${formatMismatches(mismatches)}`,
		);
		return failed + mismatches.length;
	}
	if (sent.size)
		console.log(`  ✓ all ${sent.size} row(s) hold ${FIELDS.join(" + ")}`);
	return failed;
}

async function main(): Promise<number> {
	if (!GH_TOKEN) {
		// A missing credential is not evidence about any repository.
		console.error(
			"INCONCLUSIVE: no GITHUB_TOKEN/GH_TOKEN — every candidate would be `unchecked`, and unauthenticated GitHub gives 60 reads an hour. No artifact written, no verdict.",
		);
		return 2;
	}
	const candidates = await fetchCandidates();
	if (!candidates) {
		console.error(
			`INCONCLUSIVE: ${BASE}/api/repos did not answer — no artifact written, no verdict.`,
		);
		return 2;
	}
	// Rows already marked gone last, so a capped run spends its budget on the
	// unknown population first.
	const pool = candidates
		.filter((r) => typeof r.fullName === "string" && r.fullName.includes("/"))
		.sort(
			(a, b) =>
				Number(a.codeScanState === "gone") - Number(b.codeScanState === "gone"),
		);
	const batch = pool.slice(0, LIMIT);
	const truncated = batch.length < pool.length;
	console.log(
		`gone-repos — ${EXECUTE ? "EXECUTE" : "REPORT ONLY"} · pool ${pool.length} row(s) at ${CANDIDATE_STATES.join("/")} · probing ${batch.length}`,
	);
	// ponytail: a capped run reports only what it asked. The rows it skipped are
	// absent from the artifact, which the ledger would read as resolved — so a
	// truncated run SAYS so, in the artifact and on stdout. Raise --limit (the
	// whole pool was 425 on 2026-09-14) rather than letting this become normal.
	if (truncated)
		console.warn(
			`  ! TRUNCATED: ${pool.length - batch.length} row(s) of the pool were not probed this run — their absence from this artifact is not a clean verdict.`,
		);

	const rows: GoneRow[] = [];
	for (let i = 0; i < batch.length; i += CONCURRENCY) {
		rows.push(
			...(await Promise.all(
				batch.slice(i, i + CONCURRENCY).map(async (r) => {
					const fullName = String(r.fullName);
					const { status, sizeKb } = await probe(fullName);
					return {
						fullName,
						was: String(r.codeScanState ?? ""),
						verdict: repoExistence(status, sizeKb),
						httpStatus: status,
						sizeKb,
						priorError: r.codeScanError ?? null,
						checkedAt: new Date().toISOString(),
					};
				}),
			)),
		);
	}

	const count = (v: RepoExistence) =>
		rows.filter((r) => r.verdict === v).length;
	// The finding is what we are SERVING wrongly, in both directions: a live
	// row whose repo is a 404, and a hidden row whose repo answers again.
	const newlyGone = rows.filter(
		(r) => r.verdict === "gone" && r.was !== "gone",
	);
	const resurrected = rows.filter(
		(r) => r.was === "gone" && (r.verdict === "alive" || r.verdict === "empty"),
	);
	const tally = {
		poolSize: pool.length,
		checked: rows.length,
		gone: count("gone"),
		empty: count("empty"),
		alive: count("alive"),
		unchecked: count("unchecked"),
		newlyGone: newlyGone.length,
		resurrected: resurrected.length,
	};
	const blind = tally.unchecked * 2 > tally.checked || tally.checked === 0;

	const report = {
		generatedAt: new Date().toISOString(),
		source: "scripts/check-gone-repos.ts",
		rule: "Every repos row at codeScanState error/gone gets ONE GitHub read. The verdict comes from the HTTP status, never the body: 404 = gone, 200 = alive (size 0 = empty), anything else = unchecked. An unchecked row is never reported as gone, and a run more than half blind writes nothing and exits 2.",
		mode: EXECUTE ? "execute" : "report-only",
		blind,
		truncated,
		tally,
		rows,
	};
	mkdirSync(join(process.cwd(), "improvements/audits"), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(report, null, "\t")}\n`);

	if (JSON_OUT) console.log(JSON.stringify(report, null, "\t"));
	else
		for (const r of rows)
			if (r.verdict !== "alive")
				console.log(
					`  ${r.verdict === "gone" ? "✗" : r.verdict === "unchecked" ? "?" : "·"} ${r.fullName.padEnd(52)} ${String(r.httpStatus ?? "-").padEnd(5)} ${r.verdict}`,
				);

	console.log(
		`\n${blind ? "BLIND" : newlyGone.length || resurrected.length ? "RED" : "GREEN"}: ${tally.gone} gone · ${tally.empty} empty · ${tally.alive} alive · ${tally.unchecked} unchecked (of ${tally.checked} probed, pool ${tally.poolSize}) — ${tally.newlyGone} newly gone, ${tally.resurrected} back from the dead`,
	);
	if (blind) {
		console.error(
			"INCONCLUSIVE: more than half the run could not be checked — no verdict, nothing written.",
		);
		return 2;
	}
	if (EXECUTE && (await applyWrites(rows)) > 0) return 1;
	return newlyGone.length || resurrected.length ? 1 : 0;
}

/** The smallest check that fails if the classifier regresses. The full pinning
 *  lives in src/lib/__tests__/gone-repos.test.ts; this keeps the script itself
 *  runnable as its own proof without a vitest install. */
function selfTest() {
	assert.equal(repoExistence(404), "gone");
	assert.equal(repoExistence(403), "unchecked");
	assert.equal(repoExistence(null), "unchecked");
	assert.equal(repoExistence(200, 0), "empty");
	assert.equal(repoExistence(200, 51), "alive");
	assert.equal(repoExistence(200), "alive");
	console.log("self-test ok (6 classifier cases)");
}

if (process.argv.includes("--self-test")) selfTest();
else
	main()
		.then((code) => process.exit(code))
		.catch((e) => {
			console.error(
				"INCONCLUSIVE (the sweep did not complete):",
				e?.message ?? e,
			);
			process.exit(2);
		});
