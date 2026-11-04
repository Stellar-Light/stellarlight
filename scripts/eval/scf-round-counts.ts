/**
 * SCF round-level count check (sls-111): awards per round in our directory
 * versus the SCF site. Public reads only (no DB, no secrets), so any lane can
 * run it, for example after an enrich-scf execute has deployed:
 *
 *   pnpm exec tsx scripts/eval/scf-round-counts.ts
 *
 * Exit 0 match, 1 mismatch, 2 could-not-check (a side unread or partial).
 * The basis of each count: src/lib/scf-round-counts.ts.
 */
import {
	compareRoundCounts,
	type OurAwardedRow,
	type ScfListingRow,
} from "../../src/lib/scf-round-counts";

const BASE = (process.env.SCOUT_BASE || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const UA = { "User-Agent": "stellarlight-scf-round-counts" };

async function readListing(): Promise<ScfListingRow[] | null> {
	try {
		const res = await fetch(
			"https://communityfund.stellar.org/backend/projects",
			{ headers: UA },
		);
		if (!res.ok) return null;
		const body: unknown = await res.json();
		return Array.isArray(body) ? body : null;
	} catch {
		return null;
	}
}

/** Every awarded row, paged to the API's own total. Null on any failed,
 * partial or short read: a cut sweep must never pass as a count. */
async function readOurs(): Promise<OurAwardedRow[] | null> {
	const rows: OurAwardedRow[] = [];
	try {
		for (let offset = 0; ; offset += 100) {
			const res = await fetch(
				`${BASE}/api/projects/search?scfAwarded=true&limit=100&offset=${offset}`,
				{ headers: { Accept: "application/json", ...UA } },
			);
			if (!res.ok) return null;
			const body = (await res.json()) as {
				projects?: OurAwardedRow[];
				meta?: {
					partial?: boolean;
					failedReads?: unknown[];
					counts?: { total?: number };
				};
			};
			const total = body.meta?.counts?.total;
			if (
				!Array.isArray(body.projects) ||
				body.meta?.partial !== false ||
				(body.meta.failedReads ?? []).length > 0 ||
				typeof total !== "number"
			)
				return null;
			rows.push(...body.projects);
			if (rows.length >= total || body.projects.length === 0)
				return rows.length === total ? rows : null;
		}
	} catch {
		return null;
	}
}

async function main() {
	const [listing, ours] = await Promise.all([readListing(), readOurs()]);
	const report = compareRoundCounts(listing, ours);
	if (report.status === "could-not-check") {
		console.log(`COULD NOT CHECK: ${report.reason}`);
		process.exit(2);
	}
	console.log(
		`SCF listing ${listing?.length} rows; our awarded rows ${ours?.length} (${BASE})`,
	);
	for (const r of report.rounds) {
		console.log(
			`SCF #${r.round} ${r.exact ? `exact: SCF ${r.scf}` : `floor: SCF >= ${r.scf}`}, ours ${r.ours}${r.disagrees ? "  DISAGREES" : ""}`,
		);
		for (const s of r.uncited)
			console.log(
				`    no row cites https://communityfund.stellar.org/project/${s}`,
			);
	}
	console.log(`VERDICT: ${report.status}`);
	process.exit(report.status === "match" ? 0 : 1);
}

main().catch((err) => {
	console.log(`COULD NOT CHECK: ${err instanceof Error ? err.message : err}`);
	process.exit(2);
});
