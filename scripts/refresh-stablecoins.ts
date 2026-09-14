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
 *
 * END-STATE CLAIM (QUALITY.md §3, second condition): after the writes, every
 * row this run wrote — current rows, retirements and snapshots — is read back
 * and compared to the exact payload sent, on every key of that payload
 * (payload.update silently drops unknown keys and reports success). Exit 1 =
 * a finding (a field did not persist, a write threw, or the pacing is still
 * rate-limited). Exit 2 = could not look: more than half the live-tracked
 * roster came back unmeasured, so the run — dry or not — is not evidence
 * about the registry. Kept-forward and retired counts are printed every run.
 */
import "./load-env";
import { getPayload } from "payload";
import { STABLECOIN_REGISTRY } from "../src/data/stablecoin-registry";
import {
	type MeasuredStablecoin,
	measureRegistry,
	RATE_LIMIT_MARK,
} from "../src/lib/stablecoin-pipeline";
import { formatMismatches, verifyWrites } from "../src/lib/utils/read-back";
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
	let keptRows = 0;
	let failed = 0;
	const problems: string[] = [];
	// What was SENT, per collection, keyed the way each is read back: current
	// rows and retirements on assetId (a retired asset is never a measured one,
	// so they share a map), snapshots on `${assetId}:${day}`. Only a write that
	// resolved is recorded — a throw is counted in `failed`, red on its own.
	const sentRows = new Map<string, Record<string, unknown>>();
	const sentSnaps = new Map<string, Record<string, unknown>>();
	const attempt = async (label: string, fn: () => Promise<void>) => {
		try {
			await fn();
		} catch (e) {
			failed++;
			console.error(`  ✗ ${label}: ${e instanceof Error ? e.message : e}`);
		}
	};

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
			// Moves with priceUSD, never on its own: the pipeline sets priceBasis
			// null exactly when priceUSD is null, so keep() carries the pair
			// forward together — a kept-forward price keeps the basis that
			// produced it, or the pair would describe two runs.
			priceBasis: keep(m.priceBasis, prev?.priceBasis),
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
		if (kept) {
			keptRows++;
			kept7(m, problems);
		}

		if (m.basis !== "live")
			problems.push(`${m.id}: ${m.basis} — ${m.note ?? ""}`);

		if (EXECUTE) {
			await attempt(`${m.id} current row`, async () => {
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
				sentRows.set(m.id, row);
			});

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
			await attempt(`${key} snapshot`, async () => {
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
				sentSnaps.set(key, snap);
			});
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
				await attempt(`${d.assetId} retire`, async () => {
					await payload.update({
						collection: "stablecoins",
						id: d.id,
						data: { retiredAt: now },
					});
					sentRows.set(String(d.assetId), { retiredAt: now });
				});
		}
	}

	const live = measured.filter((m) => m.basis === "live").length;
	console.log(
		`\n${measured.length} assets — ${live} live, ${measured.length - live} static/unmeasured`,
	);
	// Where each row's logo came from. The first YLDS refresh served no logo
	// while the same code resolved it locally, and nothing in this log said
	// so — a runner-side toml/CDN failure should be visible here, not days
	// later as a blank tile.
	const bySource = new Map<string, number>();
	for (const m of measured)
		bySource.set(m.logoSource, (bySource.get(m.logoSource) ?? 0) + 1);
	const noLogo = measured
		.filter((m) => m.logoSource === "none")
		.map((m) => m.code);
	console.log(
		`logos — ${[...bySource].map(([k, v]) => `${k} ${v}`).join(" · ")}${
			noLogo.length ? ` · none: ${noLogo.join(", ")}` : ""
		}`,
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
	if (stillRateLimited.length > RATE_LIMIT_EXIT_THRESHOLD) {
		console.error(
			`${stillRateLimited.length} rows exceed the rate-limit threshold (${RATE_LIMIT_EXIT_THRESHOLD}) — a failing run.`,
		);
		process.exitCode = 1;
	}

	// A run that could not MEASURE most of the roster proves nothing about it.
	// Every row is still written by design (basis "unmeasured", good values
	// kept forward — the rule that keeps a bad fetch from reading as a
	// delisting), and every one of those writes reads back exactly as sent, so
	// the read-back alone would call a blind run green. Curated-static rows are
	// never measured and count neither way. Its own exit code (2), so
	// could-not-look never reads as checked-and-clean; a finding (1) wins.
	const askable = measured.filter((m) => m.basis !== "curated-static");
	const blind = askable.filter((m) => m.basis === "unmeasured");
	console.log(
		`kept previous value(s) on ${keptRows} row(s) · unmeasured ${blind.length}/${askable.length} live-tracked`,
	);
	if (askable.length && blind.length > askable.length / 2) {
		console.error(
			`\n✗ FAILED TO MEASURE ${blind.length}/${askable.length} live-tracked asset(s) — do not read this run as evidence about the registry (exit 2 unless a finding sets 1).`,
		);
		if (!process.exitCode) process.exitCode = 2;
	}

	if (!EXECUTE) {
		console.log(
			`\nDRY RUN — would upsert ${measured.length} stablecoins and ${measured.length} snapshots for ${day}.`,
		);
		console.log("Re-run with --execute to write.");
		return;
	}

	// ── read-back: every row this run wrote, against the exact payload sent ──
	// payload.update() resolves and silently drops keys with no schema field
	// at that path (#615), so "wrote N" is a claim about the calls, not the
	// data. Every key of every payload is compared — a field added to `row` or
	// `snap` is verified without anyone remembering to list it here — and a
	// row is re-fetched by its own key before it is called missing (the bulk
	// `in` artifact of 2026-08-13).
	const rows = (r: { docs: unknown[] }) => r.docs as Record<string, unknown>[];
	const readBack = async (
		collection: "stablecoins" | "stablecoin-snapshots",
		keyField: "assetId" | "key",
		sent: Map<string, Record<string, unknown>>,
	) => {
		if (!sent.size) {
			console.log(`  · ${collection}: nothing written`);
			return;
		}
		const fields = [...new Set([...sent.values()].flatMap(Object.keys))];
		const mismatches = await verifyWrites(
			sent,
			async (keys) =>
				new Map(
					rows(
						await payload.find({
							collection,
							where: { [keyField]: { in: keys } },
							limit: keys.length,
							depth: 0,
						}),
					).map((d) => [String(d[keyField]), d]),
				),
			fields,
			200,
			async (key) =>
				rows(
					await payload.find({
						collection,
						where: { [keyField]: { equals: key } },
						limit: 1,
						depth: 0,
					}),
				)[0] ?? null,
		);
		if (mismatches.length) {
			console.error(
				`  ✗ ${collection}: ${mismatches.length} field(s) did NOT persist as sent — the write reported success:\n${formatMismatches(mismatches)}`,
			);
			process.exitCode = 1;
		} else {
			console.log(
				`  ✓ ${collection}: all ${sent.size} row(s) hold the values written (${fields.length} fields: ${fields.join(", ")})`,
			);
		}
	};
	console.log("\n── Read-back ──");
	await readBack("stablecoins", "assetId", sentRows);
	await readBack("stablecoin-snapshots", "key", sentSnaps);

	console.log(
		`\nwrote ${created} new, ${updated} updated, ${snapshots} snapshots for ${day} · retired ${toRetire.length} · ${failed} write(s) threw`,
	);
	if (failed) {
		console.error(
			`✗ ${failed} write(s) threw — exiting 1 so the run shows red.`,
		);
		process.exitCode = 1;
	}
}

/** Note when a row kept a previous value because this run couldn't measure it. */
function kept7(m: MeasuredStablecoin, problems: string[]) {
	problems.push(
		`${m.id}: kept previous value(s) — this run measured null (basis ${m.basis})`,
	);
}

// exitCode, not exit(0): a read-back mismatch, a thrown write, the rate-limit
// finding or a blind run sets it above, and exit(0) here would stomp it — the
// class-20 bug where a run reports GREEN after its writes died.
main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
