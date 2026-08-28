/**
 * Clear findings that no longer reproduce.
 *
 * A detector only clears its own findings when it next runs, so a fix that
 * lands mid-week leaves its findings sitting "open" — and the open count
 * reads as debt when it is really staleness. The miss funnel measured this:
 * 88% of a sample no longer reproduced. This replays EVERY open recall
 * finding (not a sample) and clears the ones that now pass.
 *
 * Honest by construction:
 *  - only clears on a PASS observed live right now; never on age or vibes
 *  - writes clearedAt + clearedBy so the reason is auditable
 *  - --execute required; the default is a dry run
 *
 *   pnpm exec tsx scripts/quality/clear-stale-findings.ts [--execute]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const EXECUTE = process.argv.includes("--execute");
const UA = { "User-Agent": "stellarlight-stale-sweep" };

type Finding = {
	id: string;
	source: string;
	probe: string;
	status: string;
	clearedAt?: string | null;
	clearedBy?: string | null;
};
const path = join(process.cwd(), "improvements/ledger/findings.json");
const raw = JSON.parse(readFileSync(path, "utf8")) as
	| Finding[]
	| { findings: Finding[] };
const findings: Finding[] = Array.isArray(raw) ? raw : raw.findings;

const open = findings.filter(
	(f) => f.status === "open" && f.source === "engine-a-recall",
);
const parsed = open
	.map((f) => {
		const m = /^(\S+)\s+in top-3 for '(.+)'$/.exec(f.probe);
		return m ? { f, slug: m[1], query: m[2] } : null;
	})
	.filter((x): x is { f: Finding; slug: string; query: string } => !!x);

console.log(
	`${open.length} open recall findings · ${parsed.length} parseable · mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`,
);

const passes = async (slug: string, query: string): Promise<boolean | null> => {
	try {
		const r = await fetch(
			`https://stellarlight.xyz/api/projects/search?q=${encodeURIComponent(query)}&limit=10`,
			{ headers: UA },
		);
		if (!r.ok) return null;
		const d = (await r.json()) as { projects?: Array<{ slug?: string }> };
		return (d.projects ?? []).slice(0, 3).some((p) => String(p.slug) === slug);
	} catch {
		return null;
	}
};

// small concurrency pool — be polite to prod
let cleared = 0;
let stillFailing = 0;
let errored = 0;
const now = new Date().toISOString();
const queue = [...parsed];
const worker = async () => {
	while (queue.length) {
		const item = queue.shift();
		if (!item) break;
		const ok = await passes(item.slug, item.query);
		if (ok === null) {
			errored++;
			continue;
		}
		if (ok) {
			cleared++;
			if (EXECUTE) {
				item.f.status = "cleared";
				item.f.clearedAt = now;
				item.f.clearedBy = "stale-sweep: re-probed live and passing";
			}
		} else stillFailing++;
	}
};
await Promise.all(Array.from({ length: 6 }, worker));

console.log(
	`  now passing (clearable): ${cleared}\n  still failing (real debt): ${stillFailing}\n  probe errors (left open):  ${errored}`,
);
if (EXECUTE) {
	writeFileSync(
		path,
		`${JSON.stringify(Array.isArray(raw) ? findings : raw, null, 1)}\n`,
	);
	console.log(`  ledger written — ${cleared} findings cleared`);
} else {
	console.log("  DRY RUN — re-run with --execute to write the ledger");
}
