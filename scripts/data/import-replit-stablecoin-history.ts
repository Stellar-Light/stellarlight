/**
 * Import the retired Replit stablecoin service's daily snapshot history.
 *
 *   npx tsx scripts/data/import-replit-stablecoin-history.ts            # DRY RUN
 *   npx tsx scripts/data/import-replit-stablecoin-history.ts --execute
 *   npx tsx scripts/data/import-replit-stablecoin-history.ts --dir ./export   # from a local capture
 *
 * The Replit Postgres was the ONLY copy of the series (2025-11-28 onward;
 * 18 assets, ~3,760 points). Its credentials live only in Replit's Secrets
 * panel — but the live service exposes the same rows over HTTP
 * (/api/stablecoins/:ticker/history?days=N), which is what this reads, so no
 * secret is needed. A local capture (stablecoins.json + snapshots.json) can
 * be supplied with --dir for the day the service is gone.
 *
 * Mapping is 1:1 — the migration kept Replit's `stablecoinId` as our
 * `assetId` (e.g. USDC-GA5ZSEJY), so keys line up: `${assetId}:${day}`.
 * Rules: never overwrite a row our own pipeline wrote (source "stellarlight");
 * imported points carry source "replit-import" and basis "live" (they were
 * live measurements by the retired service on that day). Idempotent.
 */

import "../load-env";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const dirIdx = process.argv.indexOf("--dir");
const DIR = dirIdx >= 0 ? process.argv[dirIdx + 1] : null;
const HOST =
	process.env.REPLIT_STABLECOIN_HOST || "https://stablecoin.stellarlight.xyz";

type Coin = { id: string; ticker: string; issuerCode?: string; name?: string };
type Snap = {
	id: string;
	stablecoinId: string;
	ticker: string;
	snapshotDate: string;
	supplyRaw?: string | null;
	holdersRaw?: string | null;
	volume24hRaw?: string | null;
	marketCapRaw?: string | null;
	price?: string | null;
	createdAt?: string;
};

async function fetchJson<T>(path: string): Promise<T> {
	const res = await fetch(`${HOST}${path}`, {
		headers: { "User-Agent": "stellar-light-import/1.0" },
	});
	if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
	return (await res.json()) as T;
}

async function load(): Promise<{ coins: Coin[]; snaps: Snap[] }> {
	if (DIR) {
		const coins = JSON.parse(
			await readFile(join(DIR, "stablecoins.json"), "utf8"),
		) as Coin[];
		const snaps = JSON.parse(
			await readFile(join(DIR, "snapshots.json"), "utf8"),
		) as Snap[];
		console.log(`loaded local capture from ${DIR}`);
		return { coins, snaps };
	}
	const coins = await fetchJson<Coin[]>("/api/stablecoins");
	const byId = new Map<string, Snap>();
	for (const t of [...new Set(coins.map((c) => c.ticker))]) {
		const rows = await fetchJson<Snap[]>(
			`/api/stablecoins/${encodeURIComponent(t)}/history?days=3650`,
		);
		for (const r of rows) byId.set(r.id, r);
	}
	console.log(
		`fetched ${byId.size} snapshot rows for ${coins.length} listed assets from ${HOST}`,
	);
	return { coins, snaps: [...byId.values()] };
}

const num = (v: string | null | undefined): number | null => {
	if (v == null || v === "") return null;
	const n = Number(String(v).replace(/[,$]/g, ""));
	return Number.isFinite(n) ? n : null;
};

async function main() {
	console.log(
		`replit stablecoin history import — ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`,
	);
	const { coins, snaps } = await load();
	const coinById = new Map(coins.map((c) => [c.id, c]));
	const payload = await getPayload({ config: await configPromise });

	const perAsset = new Map<
		string,
		{ days: number; min: string; max: string }
	>();
	let created = 0;
	let updated = 0;
	let keptOurs = 0;
	const skipped = 0;
	for (const s of snaps) {
		const day = s.snapshotDate.slice(0, 10);
		const coin = coinById.get(s.stablecoinId);
		const key = `${s.stablecoinId}:${day}`;
		const snap = {
			key,
			assetId: s.stablecoinId,
			code: s.ticker,
			issuer: coin?.issuerCode ?? s.stablecoinId.split("-").slice(1).join("-"),
			day,
			supply: num(s.supplyRaw),
			priceUSD: num(s.price),
			marketCapUSD: num(s.marketCapRaw),
			holders: num(s.holdersRaw),
			volume24hUSD: num(s.volume24hRaw),
			basis: "live" as const,
			measuredAt: s.createdAt ?? s.snapshotDate,
			source: "replit-import",
		};
		const a = perAsset.get(s.stablecoinId) ?? { days: 0, min: day, max: day };
		a.days++;
		if (day < a.min) a.min = day;
		if (day > a.max) a.max = day;
		perAsset.set(s.stablecoinId, a);

		const had = await payload.find({
			collection: "stablecoin-snapshots",
			where: { key: { equals: key } },
			limit: 1,
			depth: 0,
		});
		const existing = had.docs[0] as { id: string; source?: string } | undefined;
		if (existing?.source === "stellarlight") {
			keptOurs++;
			continue;
		}
		if (!EXECUTE) {
			existing ? updated++ : created++;
			continue;
		}
		if (existing) {
			await payload.update({
				collection: "stablecoin-snapshots",
				id: existing.id,
				data: snap,
			});
			updated++;
		} else {
			await payload.create({ collection: "stablecoin-snapshots", data: snap });
			created++;
		}
	}

	console.log(`\n${"asset".padEnd(20)} days  range`);
	for (const [id, a] of [...perAsset.entries()].sort(
		(x, y) => y[1].days - x[1].days,
	))
		console.log(
			`${id.padEnd(20)} ${String(a.days).padEnd(5)} ${a.min} → ${a.max}`,
		);
	console.log(
		`\ncreate ${created} · update ${updated} · kept ours (stellarlight) ${keptOurs} · skipped ${skipped}`,
	);

	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing written. Re-run with --execute.");
		process.exit(0);
	}
	const after = await payload.count({
		collection: "stablecoin-snapshots",
		where: { source: { equals: "replit-import" } },
	});
	console.log(
		`\nread-back: ${after.totalDocs} rows now carry source=replit-import`,
	);
	process.exit(after.totalDocs >= created ? 0 : 1);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
