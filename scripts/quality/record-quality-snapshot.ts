/**
 * Append today's quality snapshot to the committed trend history
 * (improvements/quality/history.json), the data feed for /quality's Trends
 * section (QUALITY.md P1, the last item).
 *
 * One row per UTC date, idempotent (a re-run replaces today's row, so the
 * daily workflow and a manual run cannot double-append). Ratchet numbers
 * come from their committed baselines; provenance numbers from a live
 * directory sample; battery/parity counts are passed in by the workflow
 * that just measured them (never fabricated here, absent means "not
 * measured today", recorded as null, and the chart shows the gap).
 *
 *   pnpm exec tsx scripts/quality/record-quality-snapshot.ts \
 *     [--battery-pass N --battery-fail N --battery-errors N] [--parity-pass N]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { censusProjects } from "./sample-frame";

const arg = (name: string): number | null => {
	const i = process.argv.indexOf(name);
	if (i < 0 || !process.argv[i + 1]) return null;
	const n = Number(process.argv[i + 1]);
	return Number.isFinite(n) ? n : null;
};

const opacity = JSON.parse(
	readFileSync(join(process.cwd(), "specs/opacity-baseline.json"), "utf8"),
) as { openMaps: number };
const honesty = JSON.parse(
	readFileSync(join(process.cwd(), "specs/honesty-baseline.json"), "utf8"),
) as { operations: Record<string, { exempt: boolean }> };
const honestyDebt = Object.values(honesty.operations).filter(
	(o) => !o.exempt,
).length;

// Provenance CENSUS. This used to fire its own hand-picked list of search
// terms, which differed from the sibling script's list by three terms, so the
// dashboard published two irreconcilable answers to "how many human-verified
// rows do we have" (32 and 29) with nothing saying they were different frames.
// Both scripts now enumerate the same collection through the same module.
async function provenance(): Promise<{
	sampled: number;
	population: number;
	liveRows: number;
	liveNoSource: number;
	humanVerified: number;
} | null> {
	try {
		const { rows, total } = await censusProjects();
		const live = rows.filter((p) => p.status === "Live");
		return {
			sampled: rows.length,
			population: total,
			liveRows: live.length,
			liveNoSource: live.filter((p) => !p.statusSourceUrl).length,
			humanVerified: rows.filter((p) => p.statusBasis === "human-verified")
				.length,
		};
	} catch {
		return null;
	}
}

const prov = await provenance();
const date = new Date().toISOString().slice(0, 10);
const row = {
	date,
	batteryPass: arg("--battery-pass"),
	batteryFail: arg("--battery-fail"),
	// The battery reports three counters and this row used to drop the third.
	// A run where slices CRASH recorded "57 pass, 0 fail" and landed as a
	// perfect green day, which is the exact lie the trend exists to prevent.
	batteryErrors: arg("--battery-errors"),
	parityPass: arg("--parity-pass"),
	openMaps: opacity.openMaps,
	honestyDebt,
	...(prov ?? {
		sampled: null,
		population: null,
		liveRows: null,
		liveNoSource: null,
		humanVerified: null,
	}),
};

const path = join(process.cwd(), "improvements/quality/history.json");
let history: Array<typeof row> = [];
try {
	history = JSON.parse(readFileSync(path, "utf8"));
} catch {}
history = history.filter((r) => r.date !== date);
history.push(row);
history.sort((a, b) => a.date.localeCompare(b.date));
writeFileSync(path, `${JSON.stringify(history, null, 1)}\n`);
console.log(`recorded ${date}: ${JSON.stringify(row)}`);
