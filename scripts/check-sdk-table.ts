/**
 * Is the dated SDK table in src/lib/soroban-versions.ts behind upstream? It
 * sat at 2026-08-11 for three months while soroban-sdk 28 and 29 shipped and
 * mainnet moved to Protocol 29; its comment promised a "CB6 sanity check" that
 * no code implemented. Reads three public sources and compares:
 *   crates.io soroban-sdk max_stable_version  vs the newest tabled sdk major
 *   Horizon mainnet current_protocol_version  vs LATEST_PROTOCOL
 *   npm @stellar/stellar-sdk dist-tags.latest vs JS_SDK_LATEST_MAJOR
 *
 *   pnpm exec tsx scripts/check-sdk-table.ts
 *
 * Known limit: it watches the newest majors only. It does not notice the
 * publishers' support windows moving past our floors, or an npm package
 * newly marked deprecated (soroban-client went unlisted that way until
 * 2026-11-12); those still need the maintenance pass in soroban-versions.ts.
 *
 * Exit 0: current. Exit 1: behind; re-verify the table against
 * developers.stellar.org/docs/networks/software-versions and the SDK release
 * notes. Exit 2: could not check. Read-only: three GETs, no writes.
 */

import {
	JS_SDK_ASOF,
	TABLE_ASOF,
	upstreamVersions,
	versionTableStaleness,
} from "../src/lib/soroban-versions";

// crates.io refuses requests without a User-Agent naming the client.
const UA = { "User-Agent": "stellarlight-sdk-table-check (stellarlight.xyz)" };

async function json(url: string, headers: Record<string, string> = {}) {
	const res = await fetch(url, {
		headers,
		signal: AbortSignal.timeout(20_000),
	});
	if (!res.ok) throw new Error(`${url} answered ${res.status}`);
	return res.json();
}

async function main() {
	const [crate, horizon, tags] = await Promise.all([
		json("https://crates.io/api/v1/crates/soroban-sdk", UA),
		json("https://horizon.stellar.org/"),
		json("https://registry.npmjs.org/-/package/@stellar/stellar-sdk/dist-tags"),
	]);
	const upstream = upstreamVersions(crate, horizon, tags);
	if (!upstream)
		throw new Error(
			`a source answered without a released version: ${JSON.stringify({ sdk: crate?.crate?.max_stable_version, protocol: horizon?.current_protocol_version, js: tags?.latest })}`,
		);
	console.log(
		`upstream: soroban-sdk ${upstream.sorobanSdkMaxStable}, mainnet protocol ${upstream.networkProtocol}, @stellar/stellar-sdk ${upstream.jsSdkLatest}. Table as of ${TABLE_ASOF} (JS ${JS_SDK_ASOF}).`,
	);
	const stale = versionTableStaleness(upstream);
	if (!stale.length) return;
	for (const line of stale) console.log(`  behind: ${line}`);
	console.log(
		"Re-verify src/lib/soroban-versions.ts against developers.stellar.org/docs/networks/software-versions and the SDK release notes.",
	);
	process.exit(1);
}

// A crash is no check: exit 2, never the 1 that means the table is behind.
main().catch((err) => {
	console.log(`could not check: ${err instanceof Error ? err.message : err}`);
	process.exit(2);
});
