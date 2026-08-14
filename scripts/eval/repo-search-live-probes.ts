/**
 * Live repo-search answer-key probes — the post-ingest quality gate.
 *
 * Asserts that canonical answers still rank in the top 3 for a frozen set of
 * queries a real builder asks. Run AFTER any bulk repo ingest (EC taxonomy
 * waves) so tier demotion is proven by an answer key, not by reasoning:
 * thousands of community/archive rows entering the candidate pools must not
 * displace the canonical references.
 *
 *   npx tsx scripts/eval/repo-search-live-probes.ts
 *   BASE_URL=http://localhost:3000 npx tsx scripts/eval/repo-search-live-probes.ts
 *
 * Every probe passed against production on 2026-08-14 BEFORE the first EC
 * wave — this is a regression gate, not an aspiration. Exits 1 on any miss.
 * Requests are cache-busted (the repos CDN cache is ~5min).
 */
const BASE = process.env.BASE_URL || "https://stellarlight.xyz";

/** q → acceptable top-3 fullName substrings (any-of, case-insensitive). */
const PROBES: Array<{ q: string; anyOf: string[] }> = [
	{ q: "soroban rust sdk", anyOf: ["stellar/rs-soroban-sdk"] },
	{ q: "javascript sdk", anyOf: ["stellar/js-stellar-sdk"] },
	{ q: "oracle", anyOf: ["reflector-network/reflector-contract"] },
	{ q: "anchor platform", anyOf: ["stellar/anchor-platform"] },
	// Canonical wallet-tooling set.
	{ q: "wallet kit", anyOf: ["kalepail/passkey-kit", "stellar/freighter", "creit-tech/xbull-wallet", "creit-tech/stellar-wallets-kit"] },
	// Spaced product-name identity (fixed 2026-08-14): the exact name spoken
	// with spaces must surface the repo itself.
	{ q: "stellar wallets kit", anyOf: ["creit-tech/stellar-wallets-kit"] },
	{ q: "soroswap", anyOf: ["soroswap/core", "soroswap/aggregator"] },
	{ q: "blend lending protocol", anyOf: ["blend-capital/blend-contracts"] },
	{ q: "passkey smart wallet", anyOf: ["kalepail/passkey-kit"] },
	{ q: "horizon api server", anyOf: ["stellar/go"] },
	{ q: "stellar core consensus", anyOf: ["stellar/stellar-core"] },
];

async function main(): Promise<number> {
	let failed = 0;
	for (const p of PROBES) {
		const url = `${BASE}/api/repos/search?q=${encodeURIComponent(p.q)}&limit=3&_probe=${Date.now()}`;
		let top: string[] = [];
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`http ${res.status}`);
			const body = (await res.json()) as { repos?: Array<{ fullName?: string }> };
			top = (body.repos ?? []).map((r) => String(r.fullName ?? "").toLowerCase());
		} catch (err) {
			console.error(`✗ "${p.q}" — request failed: ${(err as Error).message}`);
			failed += 1;
			continue;
		}
		const hit = p.anyOf.some((want) => top.some((got) => got.includes(want.toLowerCase())));
		if (hit) {
			console.log(`✓ "${p.q}" → ${top[0]}`);
		} else {
			console.error(`✗ "${p.q}" — expected one of [${p.anyOf.join(", ")}] in top 3, got [${top.join(", ")}]`);
			failed += 1;
		}
	}
	console.log(`\n${PROBES.length - failed}/${PROBES.length} probes passed`);
	return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
