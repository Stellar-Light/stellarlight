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
	RATE_LIMIT_MARK,
} from "../src/lib/stablecoin-pipeline";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const utcDay = (d: Date) => d.toISOString().slice(0, 10);

// ponytail: flat heuristic, not derived from anything — revisit if the
// registry (41 assets as of 2026-09-02) grows enough that a couple of
// genuinely-transient 429s becomes the expected steady state.
const RATE_LIMIT_EXIT_THRESHOLD = 3;

/** Percent change vs the closest snapshot ~7 days back. Null unless both exist. */
function pctChange(now: number | null, then: number | null): number | null {
	if (now == null || then == null || then === 0) return null;
	return Number((((now - then) / then) * 100).toFixed(2));
}

/** Raw count delta vs the closest snapshot ~1 day back. Null unless both
 *  exist, and null (never negative) if the counter went backwards — that's
 *  an upstream rebase/correction, not a real count of payments. */
function countDelta(now: number | null, then: number | null): number | null {
	if (now == null || then == null) return null;
	const delta = now - then;
	return delta >= 0 ? delta : null;
}

async function main() {
	console.log(
		`Stablecoin refresh — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}\n`,
	);
	const payload = await getPayload({ config: await configPromise });

	/** Closest stablecoin-snapshots row at or before `cutoff` for one asset, or
	 *  undefined if the series doesn't reach back that far yet (fresh install
	 *  or a gap). Shared by the 7-day supply-change and ~24h payments-count
	 *  deltas below — same query shape, different lookback. */
	async function snapshotOnOrBefore(assetId: string, cutoff: Date) {
		try {
			const prior = await payload.find({
				collection: "stablecoin-snapshots",
				where: {
					and: [
						{ assetId: { equals: assetId } },
						{ day: { less_than_equal: utcDay(cutoff) } },
					],
				},
				sort: "-day",
				limit: 1,
				depth: 0,
			});
			return prior.docs[0] as
				| { supply?: number; paymentsCountLifetime?: number }
				| undefined;
		} catch {
			// No series yet on a fresh install — treated as "no prior snapshot".
			return undefined;
		}
	}

	const measured = await measureRegistry(STABLECOIN_REGISTRY);
	const day = utcDay(new Date());
	let created = 0;
	let updated = 0;
	let snapshots = 0;
	const problems: string[] = [];

	for (const m of measured) {
		// ── 7-day supply change, and ~24h payments-count change, from our own series ──
		const weekAgoSnap = await snapshotOnOrBefore(
			m.id,
			new Date(Date.now() - 7 * 864e5),
		);
		const change7d = pctChange(m.supply, weekAgoSnap?.supply ?? null);

		const yesterdaySnap = await snapshotOnOrBefore(
			m.id,
			new Date(Date.now() - 1 * 864e5),
		);
		const paymentsCount24h = countDelta(
			m.paymentsCountLifetime,
			yesterdaySnap?.paymentsCountLifetime ?? null,
		);

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
			paymentsCountLifetime: keep(
				m.paymentsCountLifetime,
				prev?.paymentsCountLifetime,
			),
			// Derived fresh from history each run, like supplyChange7d — never
			// kept forward from a previous run when it can't be computed now.
			paymentsCount24h,
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
				paymentsCountLifetime: m.paymentsCountLifetime,
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

	// ── retire rows the registry no longer lists ──
	// Dropping an asset from src/data/stablecoin-registry.ts stops it being
	// measured, but the row it already wrote would sit in the collection
	// forever with a frozen `measuredAt`, still served. Stamp `retiredAt`
	// instead of deleting: the series keeps its history, the API and the
	// explorer both filter retired rows out, and — per the collection's own
	// contract — retired means WE stopped tracking it, never that the issuer
	// stopped issuing it.
	const measuredIds = new Set(measured.map((m) => m.id));
	const everything = await payload.find({
		collection: "stablecoins",
		limit: 500,
		depth: 0,
	});
	const toRetire = (
		everything.docs as Array<{
			id: string;
			assetId?: string;
			retiredAt?: string;
		}>
	).filter((d) => d.assetId && !measuredIds.has(d.assetId) && !d.retiredAt);

	if (toRetire.length) {
		console.log(`\n${toRetire.length} row(s) no longer in the registry:`);
		for (const d of toRetire) console.log(`  · ${d.assetId} → retiredAt`);
		if (EXECUTE) {
			const now = new Date().toISOString();
			for (const d of toRetire)
				await payload.update({
					collection: "stablecoins",
					id: d.id,
					data: { retiredAt: now },
				});
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

	// measureRegistry already ran a slower retry pass over anything Stellar
	// Expert rate-limited. A row still showing that mark after the retry means
	// the pacing itself is behind the roster's growth again — worth a red
	// build, not a silent "unmeasured" that looks the same as a genuinely new
	// or delisted asset.
	const stillRateLimited = measured.filter((m) =>
		m.note?.includes(RATE_LIMIT_MARK),
	);
	if (stillRateLimited.length) {
		console.log(
			`\n${stillRateLimited.length} row(s) still rate-limited after the retry pass:`,
		);
		for (const m of stillRateLimited) console.log(`  · ${m.id}`);
	}
	const rateLimitFailure = stillRateLimited.length > RATE_LIMIT_EXIT_THRESHOLD;

	if (!EXECUTE) {
		console.log(
			`\nDRY RUN — would upsert ${measured.length} stablecoins and ${measured.length} snapshots for ${day}.`,
		);
		console.log("Re-run with --execute to write.");
		if (rateLimitFailure) {
			console.error(
				`${stillRateLimited.length} rows exceed the rate-limit threshold (${RATE_LIMIT_EXIT_THRESHOLD}) — would be a failing run.`,
			);
		}
		process.exit(rateLimitFailure ? 1 : 0);
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
	process.exit(mismatches === 0 && !rateLimitFailure ? 0 : 1);
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
