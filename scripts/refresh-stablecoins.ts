/**
 * Measure the stablecoin registry and write it to our own store — the job
 * that replaces the Replit-hosted service /api/stablecoins proxies.
 *
 *   npx tsx scripts/refresh-stablecoins.ts            # dry run, writes nothing
 *   npx tsx scripts/refresh-stablecoins.ts --execute  # upsert + snapshot
 *
 * Two writes per asset:
 *   stablecoins           current state, upserted on assetId
 *   stablecoin-snapshots  one row per asset per UTC day, upserted on
 *                         `${assetId}:${day}` — so running hourly still
 *                         yields exactly one point per day and the series
 *                         can't be skewed by how often the job fires.
 *
 * DELIBERATE: an unmeasured asset is still written, with basis "unmeasured"
 * and a note. It keeps a bad fetch from looking like a delisting — the exact
 * failure that made Circle USDC vanish from the upstream for hours while the
 * asset was live on-chain (stellar-raven sls-066).
 *
 * ALSO DELIBERATE: a null metric never overwrites a good previous value with
 * null in the CURRENT row — the last real measurement is kept and
 * `measuredAt`/`basis` tell you it's stale. The snapshot row still records
 * the null, because that day genuinely has no measurement. Current state
 * answers "what is it"; the series answers "what did we see when".
 */
import "./load-env";
import { getPayload } from "payload";
import { STABLECOIN_REGISTRY } from "../src/data/stablecoin-registry";
import {
	type MeasuredStablecoin,
	measureRegistry,
} from "../src/lib/stablecoin-pipeline";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

/** Percent change vs the closest snapshot ~7 days back. Null unless both exist. */
function pctChange(now: number | null, then: number | null): number | null {
	if (now == null || then == null || then === 0) return null;
	return Number((((now - then) / then) * 100).toFixed(2));
}

async function main() {
	console.log(
		`Stablecoin refresh — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}\n`,
	);
	const payload = await getPayload({ config: await configPromise });

	const measured = await measureRegistry(STABLECOIN_REGISTRY);
	const day = utcDay(new Date());
	let created = 0;
	let updated = 0;
	let snapshots = 0;
	const problems: string[] = [];

	for (const m of measured) {
		// ── 7-day change, from our own series ──
		const weekAgo = new Date(Date.now() - 7 * 864e5);
		let change7d: number | null = null;
		try {
			const prior = await payload.find({
				collection: "stablecoin-snapshots",
				where: {
					and: [
						{ assetId: { equals: m.id } },
						{ day: { less_than_equal: utcDay(weekAgo) } },
					],
				},
				sort: "-day",
				limit: 1,
				depth: 0,
			});
			const then = (prior.docs[0] as { supply?: number } | undefined)?.supply;
			change7d = pctChange(m.supply, then ?? null);
		} catch {
			// No series yet on a fresh install — null, never 0.
		}

		const existing = await payload.find({
			collection: "stablecoins",
			where: { assetId: { equals: m.id } },
			limit: 1,
			depth: 0,
		});
		const prev = existing.docs[0] as
			| (Record<string, unknown> & { id: string })
			| undefined;

		// Never let a failed fetch blank a good number in CURRENT state.
		const keep = <T>(fresh: T | null, old: unknown): T | null => {
			if (fresh != null) return fresh;
			if (old != null) {
				kept = true;
				return old as T;
			}
			return null;
		};
		let kept = false;

		const row = {
			assetId: m.id,
			code: m.code,
			issuer: m.issuer,
			name: m.name,
			company: m.company,
			domain: m.domain,
			website: m.website,
			peg: m.peg,
			country: m.country,
			assetType: m.assetType,
			supply: keep(m.supply, prev?.supply),
			priceUSD: keep(m.priceUSD, prev?.priceUSD),
			marketCapUSD: keep(m.marketCapUSD, prev?.marketCapUSD),
			holders: keep(m.holders, prev?.holders),
			volume24hUSD: keep(m.volume24hUSD, prev?.volume24hUSD),
			supplyChange7d: change7d,
			logoUrl: m.logoUrl,
			logoSource: m.logoSource,
			basis: m.basis,
			measuredAt: m.measuredAt,
			note: m.note ?? null,
		};
		if (kept) kept7(m, problems);

		if (m.basis !== "live")
			problems.push(`${m.id}: ${m.basis} — ${m.note ?? ""}`);

		if (EXECUTE) {
			if (prev) {
				await payload.update({
					collection: "stablecoins",
					id: prev.id,
					data: row,
				});
				updated++;
			} else {
				await payload.create({ collection: "stablecoins", data: row });
				created++;
			}

			// Snapshot records what we ACTUALLY measured today, nulls included.
			const key = `${m.id}:${day}`;
			const snap = {
				key,
				assetId: m.id,
				code: m.code,
				issuer: m.issuer,
				day,
				supply: m.supply,
				priceUSD: m.priceUSD,
				marketCapUSD: m.marketCapUSD,
				holders: m.holders,
				volume24hUSD: m.volume24hUSD,
				basis: m.basis,
				measuredAt: m.measuredAt,
				source: "stellarlight",
			};
			const had = await payload.find({
				collection: "stablecoin-snapshots",
				where: { key: { equals: key } },
				limit: 1,
				depth: 0,
			});
			if (had.docs[0]) {
				await payload.update({
					collection: "stablecoin-snapshots",
					id: (had.docs[0] as { id: string }).id,
					data: snap,
				});
			} else {
				await payload.create({
					collection: "stablecoin-snapshots",
					data: snap,
				});
			}
			snapshots++;
		}
	}

	const live = measured.filter((m) => m.basis === "live").length;
	console.log(
		`\n${measured.length} assets — ${live} live, ${measured.length - live} static/unmeasured`,
	);
	if (problems.length) {
		console.log("\nrows needing attention:");
		for (const p of problems) console.log(`  · ${p}`);
	}

	if (!EXECUTE) {
		console.log(
			`\nDRY RUN — would upsert ${measured.length} stablecoins and ${measured.length} snapshots for ${day}.`,
		);
		console.log("Re-run with --execute to write.");
		process.exit(0);
	}

	// ── read-back: payload.update silently drops unknown keys, so prove it ──
	const back = await payload.find({
		collection: "stablecoins",
		limit: 200,
		depth: 0,
	});
	const byId = new Map(
		(back.docs as Array<Record<string, unknown>>).map((d) => [
			String(d.assetId),
			d,
		]),
	);
	let mismatches = 0;
	for (const m of measured) {
		const got = byId.get(m.id);
		if (!got) {
			console.error(`  ✗ ${m.id} — not found after write`);
			mismatches++;
			continue;
		}
		if (got.basis !== m.basis || !got.measuredAt) {
			console.error(
				`  ✗ ${m.id} — basis/measuredAt did not land (basis=${got.basis})`,
			);
			mismatches++;
		}
	}
	console.log(
		`\nwrote ${created} new, ${updated} updated, ${snapshots} snapshots for ${day}`,
	);
	console.log(
		mismatches === 0
			? `read-back verified: ${byId.size} rows carry basis + measuredAt`
			: `read-back FAILED on ${mismatches} rows`,
	);
	process.exit(mismatches === 0 ? 0 : 1);
}

/** Note when a row kept a previous value because this run couldn't measure it. */
function kept7(m: MeasuredStablecoin, problems: string[]) {
	problems.push(
		`${m.id}: kept previous value(s) — this run measured null (basis ${m.basis})`,
	);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
