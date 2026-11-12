/**
 * Read every oracle contract in src/data/oracle-registry.ts from the chain
 * and store what it showed (sls-029): one oracle-readings row per network and
 * contract, which the search route joins onto the provider's `products`.
 *
 *   pnpm exec tsx scripts/refresh-oracle-feeds.ts            # dry run
 *   pnpm exec tsx scripts/refresh-oracle-feeds.ts --execute  # upsert
 *   pnpm exec tsx scripts/refresh-oracle-feeds.ts --offline  # chain only, no store
 *
 * Reads: getLedgerEntries for each contract instance, then each provider's
 * own getter, simulated read-only (src/lib/oracle-observe.ts names which).
 * Public RPCs only; nothing is signed or sent, and stellar.expert is not used.
 *
 * A check that could not run (the instance read failed, the feed list could
 * not be read, or every feed read failed) writes nothing, so the stored row
 * stays the last check that did run, with its own checkedAt. More than half
 * the registry unchecked is an instrument failure: exit 2, never a clean run.
 * A thrown write or a read-back mismatch: exit 1.
 */
// First import, hoisted: scripts/load-env must evaluate before anything that
// can reach payload.config. The config is imported lazily below, so
// --offline needs no store credentials.
import "./load-env";
import { ORACLE_REGISTRY } from "../src/data/oracle-registry";
import {
	type ObserveResult,
	observeOracle,
	stellarOracleRpc,
} from "../src/lib/oracle-observe";
import {
	agedOutReadings,
	observationTier,
	READING_MAX_AGE_SECONDS,
	readingKey,
} from "../src/lib/oracle-products";
import { formatMismatches, verifyWrites } from "../src/lib/utils/read-back";

const EXECUTE = process.argv.includes("--execute");
const OFFLINE = process.argv.includes("--offline");

function line(r: ObserveResult, name: string, addressTier: string) {
	const o = r.observation;
	if (!o) return `! unchecked ${name} | NOT WRITTEN: ${r.why}`;
	const counts = new Map<string, number>();
	for (const f of o.feeds ?? [])
		counts.set(f.state, (counts.get(f.state) ?? 0) + 1);
	const feeds = o.feeds
		? [...counts].map(([s, n]) => `${n} ${s}`).join(", ") || "0 feeds"
		: "feeds n/a";
	const list = o.feedList
		? ` | list ${o.feedList.basis} ${o.feedList.asOf.slice(0, 10)}`
		: "";
	return `${r.ok ? " " : "!"} ${o.contract.padEnd(7)} ${name} | ${addressTier} / ${observationTier(o) ?? "no tier"} | last write ${o.lastUpdateAt ?? "none"} | ${feeds}${list}${r.why ? ` | NOT WRITTEN: ${r.why}` : ""}`;
}

async function main() {
	const now = new Date();
	const rpc = stellarOracleRpc();
	console.log(
		`${ORACLE_REGISTRY.length} oracle contracts, ${OFFLINE ? "OFFLINE (no store)" : EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}, ${now.toISOString()}\n`,
	);
	const results: Array<{ key: string; r: ObserveResult }> = [];
	for (const p of ORACLE_REGISTRY) {
		const r = await observeOracle(p, rpc, now);
		const key = readingKey(p.network, p.contractId);
		results.push({ key, r });
		console.log(
			line(
				r,
				`${p.slug} ${p.network} ${p.contractId.slice(0, 8)} ${p.name}`,
				p.addressTier,
			),
		);
		if (OFFLINE && process.argv.includes("--feeds"))
			for (const f of r.observation?.feeds ?? [])
				console.log(
					`      ${f.state.padEnd(15)} ${f.feed}${f.label ? ` (${f.label})` : ""} ${f.lastUpdateAt ?? ""}`,
				);
	}
	const unchecked = results.filter((x) => !x.r.ok);
	console.log(
		`\nchecked ${results.length - unchecked.length}/${results.length}; not checked ${unchecked.length}`,
	);
	if (unchecked.length > results.length / 2) {
		console.error(
			`✗ could not check ${unchecked.length}/${results.length} contracts: an instrument failure, not evidence about the feeds (exit 2).`,
		);
		process.exitCode = 2;
	}
	if (OFFLINE) return;

	const { getPayloadOrInconclusive } = await import("./lib/payload-connect");
	const config = (await import("../src/payload.config")).default;
	const payload = await getPayloadOrInconclusive(await config);
	const prior = await payload.find({
		collection: "oracle-readings",
		limit: 0,
		pagination: false,
		depth: 0,
	});
	const byKey = new Map<string, { id: string; checkedAt: string }>(
		(prior.docs as Array<{ id: string; key: string; checkedAt: string }>).map(
			(d) => [d.key, d],
		),
	);

	const sent = new Map<string, Record<string, unknown>>();
	let failed = 0;
	for (const { key, r } of results) {
		if (!r.ok || !r.observation) continue;
		const [network, contractId] = key.split(":");
		const data = { key, network, contractId, ...r.observation };
		const prev = byKey.get(key);
		console.log(`  ${prev ? "update" : "create"} ${key}`);
		if (!EXECUTE) continue;
		try {
			if (prev)
				await payload.update({
					collection: "oracle-readings",
					id: prev.id,
					data,
					context: { internal: true },
				});
			else
				await payload.create({
					collection: "oracle-readings",
					data,
					context: { internal: true },
				});
			sent.set(key, data);
		} catch (e) {
			failed++;
			console.error(
				`  ✗ ${key}: ${String((e as Error).message).slice(0, 120)}`,
			);
		}
	}
	// A stored reading this run did not refresh is still served. Past
	// READING_MAX_AGE_SECONDS its tier is withheld when served, and the lane
	// says so here, non-zero: an unchecked contract on an execute, or every
	// contract on a dry run (which refreshes nothing).
	const agedOut = agedOutReadings(
		results.map((x) => x.key),
		byKey,
		new Set(sent.keys()),
		now,
	);
	if (agedOut.length) {
		console.error(
			`\n✗ ${agedOut.length} stored reading(s) older than ${READING_MAX_AGE_SECONDS / 3600} h and not refreshed by this run (served with no tier):\n${agedOut.map((a) => `    ${a.key} checked ${a.checkedAt}`).join("\n")}`,
		);
		process.exitCode = 1;
	}
	if (!EXECUTE) {
		console.log("\nDRY RUN: nothing written. Re-run with --execute to write.");
		return;
	}

	// payload.update() drops keys with no schema field and still resolves, so
	// "wrote N" is a claim about the calls: read every row back.
	const fields = [...new Set([...sent.values()].flatMap(Object.keys))];
	const mismatches = await verifyWrites(
		sent,
		async (keys) => {
			const res = await payload.find({
				collection: "oracle-readings",
				where: { key: { in: keys } },
				limit: keys.length,
				depth: 0,
			});
			return new Map(
				(res.docs as Array<Record<string, unknown>>).map((d) => [
					String(d.key),
					d,
				]),
			);
		},
		fields,
	);
	if (mismatches.length) {
		console.error(
			`✗ ${mismatches.length} field(s) did not persist as sent:\n${formatMismatches(mismatches)}`,
		);
		process.exitCode = 1;
	} else console.log(`✓ read back ${sent.size} row(s) as written`);
	if (failed) process.exitCode = 1;
}

// exitCode, never exit(0): a stomped exitCode reads as green (class 20).
main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
