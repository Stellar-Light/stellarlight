/**
 * Measure the verified RWA registry and write it to our own store — the
 * second bounded lane (P3). The registry says WHAT exists and how it was
 * verified; this says what is TRUE about it now, dated.
 *
 *   pnpm exec tsx scripts/refresh-rwa.ts            # dry run, writes nothing
 *   pnpm exec tsx scripts/refresh-rwa.ts --execute  # upsert
 *
 * Per registry row, one measurement:
 *   classic  stellar.expert /asset/CODE-ISSUER -> supply, trustlines, payments
 *   soroban  stellar.expert /contract/ID -> lifetime events; RPC total_supply
 *            where the contract exposes it
 *
 * Trinary, and the rules the stablecoin lane earned the hard way:
 *   - a failed fetch NEVER blanks a good number (keep the previous value,
 *     basis "unmeasured", note says why) — a bad fetch must not read as a
 *     delisting;
 *   - a row is never deleted;
 *   - "could not measure MOST of the set" is an instrument failure and gets
 *     its own exit code (2) so a rate-limited run cannot pass as a clean one.
 */
import "./load-env";
import { getPayload } from "payload";
import {
	RWA_REGISTRY,
	type RwaAsset as RegistryAsset,
} from "../src/data/rwa-registry";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const EX = "https://api.stellar.expert/explorer/public";
const RPC = process.env.SOROBAN_RPC_URL || "https://mainnet.sorobanrpc.com";
const UA = {
	"user-agent": "stellar-light-refresh-rwa/1.0 (+https://stellarlight.xyz)",
};
const STROOP = 10_000_000;

async function getJson(url: string, tries = 3): Promise<any | null> {
	for (let i = 0; i < tries; i++) {
		try {
			const r = await fetch(url, {
				headers: UA,
				signal: AbortSignal.timeout(20_000),
			});
			if (r.status === 429 || r.status >= 500) {
				await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
				continue;
			}
			if (!r.ok) return null; // a real 404 is an answer
			return await r.json();
		} catch {
			await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
		}
	}
	throw new Error("rate-limited or unreachable after retries");
}

type Measure = {
	supply: number | null;
	holders: number | null;
	activityCount: number | null;
	basis: "live" | "unmeasured";
	note: string | null;
};

async function measureClassic(r: RegistryAsset): Promise<Measure> {
	const d = await getJson(`${EX}/asset/${r.code}-${r.issuer}`);
	if (!d)
		return {
			supply: null,
			holders: null,
			activityCount: null,
			basis: "unmeasured",
			note: "stellar.expert returned no asset record",
		};
	const tl = d.trustlines;
	return {
		supply: d.supply != null ? Number(d.supply) / STROOP : null,
		holders: typeof tl === "object" ? (tl?.total ?? null) : (tl ?? null),
		activityCount: Number.isFinite(Number(d.payments))
			? Number(d.payments)
			: null,
		basis: "live",
		note: null,
	};
}

async function sorobanTotalSupply(contract: string): Promise<number | null> {
	// total_supply() via simulateTransaction is heavier than this lane needs on
	// every cycle; stellar.expert's contract record carries the token's supply
	// for SEP-41 tokens it indexes. Read it there; null when absent.
	const d = await getJson(`${EX}/asset/${contract}`);
	return d?.supply != null ? Number(d.supply) / STROOP : null;
}

async function measureSoroban(r: RegistryAsset): Promise<Measure> {
	const c = r.contract as string;
	const d = await getJson(`${EX}/contract/${c}`);
	if (!d)
		return {
			supply: null,
			holders: null,
			activityCount: null,
			basis: "unmeasured",
			note: "stellar.expert returned no contract record",
		};
	let supply: number | null = null;
	try {
		supply = await sorobanTotalSupply(c);
	} catch {
		supply = null;
	}
	return {
		supply,
		holders: null,
		activityCount: Number.isFinite(Number(d.events)) ? Number(d.events) : null,
		basis: "live",
		note: supply == null ? "supply not exposed for this contract" : null,
	};
}

(async () => {
	const payload = await getPayload({ config: await configPromise });
	const now = new Date().toISOString();
	const t = {
		live: 0,
		unmeasured: 0,
		couldNotCheck: 0,
		created: 0,
		updated: 0,
		writeFailed: 0,
	};
	const problems: string[] = [];
	console.log(
		`${RWA_REGISTRY.length} registry rows — ${EXECUTE ? "EXECUTING" : "dry run"}\n`,
	);

	for (const r of RWA_REGISTRY) {
		let m: Measure;
		try {
			m =
				r.kind === "classic"
					? await measureClassic(r)
					: await measureSoroban(r);
		} catch (e) {
			t.couldNotCheck++;
			m = {
				supply: null,
				holders: null,
				activityCount: null,
				basis: "unmeasured",
				note: `could not check: ${String((e as Error).message).slice(0, 80)}`,
			};
		}
		const existing = await payload.find({
			collection: "rwa-assets",
			where: { assetId: { equals: r.id } },
			limit: 1,
			depth: 0,
		});
		const prev = existing.docs[0] as unknown as
			| (Record<string, unknown> & { id: string })
			| undefined;
		// Never let a failed fetch blank a good number.
		const keep = <T>(fresh: T | null, old: unknown): T | null =>
			fresh != null ? fresh : old != null ? (old as T) : null;
		const row = {
			assetId: r.id,
			kind: r.kind,
			symbol: r.symbol,
			issuerEntity: r.issuerEntity,
			supply: keep(m.supply, prev?.supply),
			holders: keep(m.holders, prev?.holders),
			activityCount: keep(m.activityCount, prev?.activityCount),
			measureBasis: m.basis,
			measuredAt: m.basis === "live" ? now : String(prev?.measuredAt ?? now),
			note: m.note,
		};
		if (m.basis === "live") t.live++;
		else {
			t.unmeasured++;
			problems.push(`${r.id.slice(0, 20)}: ${m.note}`);
		}
		console.log(
			`  ${m.basis === "live" ? "live " : "UNMEAS"} ${r.symbol.padEnd(10)} supply=${row.supply ?? "-"} holders=${row.holders ?? "-"} activity=${row.activityCount ?? "-"}${m.note ? ` — ${m.note}` : ""}`,
		);
		if (!EXECUTE) continue;
		try {
			if (prev) {
				await payload.update({
					collection: "rwa-assets",
					id: prev.id,
					data: row,
					context: { internal: true },
				});
				t.updated++;
			} else {
				await payload.create({
					collection: "rwa-assets",
					data: row,
					context: { internal: true },
				});
				t.created++;
			}
		} catch (e) {
			t.writeFailed++;
			problems.push(
				`${r.id.slice(0, 20)}: WRITE FAILED ${String((e as Error).message).slice(0, 80)}`,
			);
		}
		await new Promise((s) => setTimeout(s, 350));
	}

	console.log(
		`\nlive ${t.live} | unmeasured ${t.unmeasured} (could-not-check ${t.couldNotCheck}) | created ${t.created} | updated ${t.updated} | write-failed ${t.writeFailed}`,
	);
	if (problems.length) console.log(`\nproblems:\n  ${problems.join("\n  ")}`);
	// End-state assertion: a run that could not measure MOST of the set is an
	// instrument failure, not a measurement — its own exit code, never green.
	const mostUnmeasured = t.unmeasured > RWA_REGISTRY.length / 2;
	process.exit(t.writeFailed ? 1 : mostUnmeasured ? 2 : 0);
})();
