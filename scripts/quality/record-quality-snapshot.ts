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
 *     [--battery-pass N --battery-fail N] [--parity-pass N]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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

// Live provenance sample, the same broad sweep the audits used.
async function provenance(): Promise<{
	sampled: number;
	liveRows: number;
	liveNoSource: number;
	humanVerified: number;
} | null> {
	try {
		const seen = new Map<
			string,
			{ status?: string; statusSourceUrl?: string; statusBasis?: string }
		>();
		for (const q of [
			"stellar",
			"wallet",
			"defi",
			"payment",
			"soroban",
			"oracle",
			"exchange",
			"lending",
			"bridge",
			"game",
		]) {
			const r = await fetch(
				`https://stellarlight.xyz/api/projects/search?q=${q}&limit=100`,
				{ headers: { "User-Agent": "stellarlight-quality-snapshot" } },
			);
			const d = (await r.json()) as {
				projects?: Array<{
					slug?: string;
					status?: string;
					statusSourceUrl?: string;
					statusBasis?: string;
				}>;
			};
			for (const p of d.projects ?? []) if (p.slug) seen.set(p.slug, p);
		}
		const rows = [...seen.values()];
		const live = rows.filter((p) => p.status === "Live");
		return {
			sampled: rows.length,
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
	parityPass: arg("--parity-pass"),
	openMaps: opacity.openMaps,
	honestyDebt,
	...(prov ?? {
		sampled: null,
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
