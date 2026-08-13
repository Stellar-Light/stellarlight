/**
 * Scan-coverage detector (code-truth track) — the xBull/passkey-kit class.
 *
 * The Raven-lens probe (2026-08-13) found two coverage failure modes that
 * capability work can't fix:
 *   - NEVER-SCANNED prominent repos: xBull-Wallet served no codeVerified at
 *     all — an agent asking "is this wallet real code" gets nothing;
 *   - STALE-SCANNED prominent repos: passkey-kit's scan predates newer
 *     detectors (sdkCapabilities persist fix, ciPresent/testsPresent), so
 *     rows carry [] / null where re-scanning would fill real facts.
 *
 * Read-only detector: counts both buckets corpus-wide, rosters the PRIORITY
 * slice (prominent by repoScore/stars), and prints ready-to-dispatch --only
 * commands. Exits 1 when the priority slice is non-empty — that red is
 * actionable (dispatch the printed waves), not decorative. Zero rows fetched
 * is an instrument failure, never "all covered".
 *
 *   pnpm exec tsx scripts/check-scan-coverage.ts
 */

import "./load-env";
import { getPayload } from "payload";
import config from "../src/payload.config";

const PRIORITY_SCORE = 50;
const PRIORITY_STARS = 25;
const STALE_DAYS = 45;

async function main() {
	const payload = await getPayload({ config });
	const res = await payload.find({
		collection: "repos",
		limit: 3000,
		depth: 0,
		overrideAccess: true,
		select: {
			fullName: true,
			repoScore: true,
			stars: true,
			isArchived: true,
			isFork: true,
			codeScannedAt: true,
			codeScanState: true,
		},
	});
	if (!res.docs.length) {
		console.error("✗ 0 repos fetched — instrument failure, not coverage");
		process.exit(1);
	}

	const now = Date.now();
	const staleBefore = now - STALE_DAYS * 86_400_000;
	type Row = {
		fullName: string;
		repoScore?: number | null;
		stars?: number | null;
		isArchived?: boolean | null;
		isFork?: boolean | null;
		codeScannedAt?: string | null;
		codeScanState?: string | null;
	};
	const rows = res.docs as unknown as Row[];

	const prominent = (r: Row) =>
		(r.repoScore ?? 0) >= PRIORITY_SCORE || (r.stars ?? 0) >= PRIORITY_STARS;
	// Archived/fork repos are deliberately down-tiered — their scan gaps are
	// not actionable priority work.
	const active = rows.filter((r) => !r.isArchived && !r.isFork && r.fullName);

	const neverScanned = active.filter((r) => !r.codeScannedAt);
	const staleScanned = active.filter(
		(r) =>
			r.codeScannedAt && Date.parse(String(r.codeScannedAt)) < staleBefore,
	);
	const priorityNever = neverScanned.filter(prominent);
	const priorityStale = staleScanned.filter(prominent);

	const roster = (list: Row[]) =>
		list
			.sort((a, b) => (b.repoScore ?? 0) - (a.repoScore ?? 0))
			.slice(0, 25)
			.map(
				(r) =>
					`    ${r.fullName.padEnd(48)} score=${r.repoScore ?? "–"} ★${r.stars ?? "–"}${r.codeScannedAt ? ` scanned ${String(r.codeScannedAt).slice(0, 10)}` : ""}`,
			)
			.join("\n");

	console.log(
		`scan coverage: ${active.length} active indexed repos · ${neverScanned.length} never-scanned (${priorityNever.length} priority) · ${staleScanned.length} stale >${STALE_DAYS}d (${priorityStale.length} priority)`,
	);
	if (priorityNever.length) {
		console.log(`\n  PRIORITY never-scanned (top ${Math.min(25, priorityNever.length)}):`);
		console.log(roster(priorityNever));
	}
	if (priorityStale.length) {
		console.log(`\n  PRIORITY stale-scanned (top ${Math.min(25, priorityStale.length)}):`);
		console.log(roster(priorityStale));
	}
	if (priorityNever.length || priorityStale.length) {
		const first = [...priorityNever, ...priorityStale][0];
		console.log(
			`\n  dispatch (one repo per run, or raise --limit on a lang wave):\n    gh workflow run scan-repo-code.yml -f execute=true -f lang=all -f limit=5 -f extra="--only ${first?.fullName ?? "<fullName>"} --rescan"`,
		);
		console.error(
			`✗ ${priorityNever.length + priorityStale.length} PRIORITY repos lack current code truth — dispatch the waves above`,
		);
		process.exit(1);
	}
	console.log("✓ every prominent active repo carries a current scan");
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
