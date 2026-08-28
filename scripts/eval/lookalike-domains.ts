/**
 * Lookalike-domain sweep — the fake-issuer-farm detector (2026-08-28 lesson).
 *
 * For every ticker we hold a canonical truth for (the stablecoin registry's
 * issuer set + a watchlist of institutional tickers agents ask about), pull
 * EVERY issuer of that code from Horizon mainnet, read each issuer account's
 * `home_domain`, and classify it against the brand's real domains
 * (src/lib/lookalike-domains.ts):
 *
 *   lookalike   -> the home_domain references the brand on a domain the
 *                  operator does not own (wisdomtree.xlmhq.org,
 *                  treasury.dtcc.company). THE finding: impersonation with
 *                  trustline victims. Exit-1 red.
 *   unverified  -> same code, non-canonical issuer, no brand reference —
 *                  listed informationally (same-code assets are legal).
 *
 * Read-only (public Horizon + our own API), no secrets. Weekly via
 * engine-c-health; findings land in the improvement ledger as
 * surface:onchain, severity high.
 *
 *   pnpm exec tsx scripts/eval/lookalike-domains.ts [--json] [--out=path]
 */
import { writeFileSync } from "node:fs";
import {
	brandTokens,
	classifyIssuerDomain,
} from "../../src/lib/lookalike-domains";

const HORIZON = "https://horizon.stellar.org";
const API = process.env.BASE_URL || "https://stellarlight.xyz";
const JSON_OUT = process.argv.includes("--json");
const OUT_FILE = process.argv
	.find((x) => x.startsWith("--out="))
	?.slice("--out=".length);
const UA = { "User-Agent": "stellarlight-lookalike-sweep" };

// biome-ignore lint/suspicious/noExplicitAny: external JSON
async function j(url: string): Promise<any> {
	const r = await fetch(url, { headers: UA });
	if (!r.ok) throw new Error(`${r.status} ${url}`);
	return r.json();
}

interface WatchEntry {
	code: string;
	brand: string;
	realDomains: string[];
	/** canonical issuer G-addresses; anything else issuing the code is at
	 * minimum unverified */
	canonicalIssuers: string[];
}

/** Institutional tickers with NO canonical Stellar issuance we could verify —
 * any issuance at all is suspect, and a brand-referencing home_domain is the
 * farm. Grows as the queue work finds more squatted names. */
const WATCHLIST: WatchEntry[] = [
	{
		code: "WTGXX",
		brand: "WisdomTree",
		realDomains: ["wisdomtree.com"],
		canonicalIssuers: [],
	},
	{
		code: "USTBL",
		brand: "Spiko",
		realDomains: ["spiko.io", "spiko.finance"],
		canonicalIssuers: [],
	},
	{
		code: "EUTBL",
		brand: "Spiko",
		realDomains: ["spiko.io", "spiko.finance"],
		canonicalIssuers: [],
	},
	{
		code: "BUIDL",
		brand: "BlackRock Securitize",
		realDomains: ["blackrock.com", "securitize.io"],
		canonicalIssuers: [],
	},
	// Institutional brands the farm already impersonated across codes: sweep
	// their names via the codes above; DTCC itself issues nothing on Stellar,
	// so it rides as extra brand vocabulary on every entry below.
];

/** Brands whose deception value is high enough to check on EVERY swept code's
 * issuer domains, whatever the code (the farm mixed brands freely). */
const GLOBAL_BRANDS: Array<{ brand: string; realDomains: string[] }> = [
	{ brand: "DTCC", realDomains: ["dtcc.com"] },
	{ brand: "WisdomTree", realDomains: ["wisdomtree.com"] },
	{ brand: "Franklin Templeton", realDomains: ["franklintempleton.com"] },
	{ brand: "BlackRock", realDomains: ["blackrock.com"] },
];

async function main() {
	console.log("Lookalike-domain sweep → Horizon mainnet\n");

	// Canonical truth from our own registry: ticker -> issuer + real domain.
	const entries: WatchEntry[] = [...WATCHLIST];
	try {
		const reg = await j(`${API}/api/stablecoins?limit=100`);
		for (const r of reg.stablecoins ?? []) {
			if (!r.ticker || !r.issuer) continue;
			entries.push({
				code: r.ticker,
				brand: String(r.company ?? r.name ?? r.ticker),
				realDomains: [String(r.issuerDomain ?? "")].filter(Boolean),
				canonicalIssuers: [String(r.issuer)],
			});
		}
	} catch (e) {
		console.log(`  registry unavailable (${(e as Error).message}) — watchlist only`);
	}
	// one sweep per code; merge duplicate codes (registry + watchlist)
	const byCode = new Map<string, WatchEntry>();
	for (const e of entries) {
		const cur = byCode.get(e.code);
		if (!cur) byCode.set(e.code, { ...e });
		else {
			cur.realDomains = [...new Set([...cur.realDomains, ...e.realDomains])];
			cur.canonicalIssuers = [
				...new Set([...cur.canonicalIssuers, ...e.canonicalIssuers]),
			];
		}
	}

	type Finding = {
		code: string;
		issuer: string;
		homeDomain: string | null;
		kind: "lookalike" | "unverified-issuer";
		brand: string;
		brandHit?: string;
		victims: number;
		supply: string | null;
		canonicalIssuers: string[];
		evidence: string;
	};
	const lookalikes: Finding[] = [];
	const unverified: Finding[] = [];
	let issuersSeen = 0;

	for (const entry of byCode.values()) {
		const brands = [
			...brandTokens(entry.brand),
			...GLOBAL_BRANDS.flatMap((g) => brandTokens(g.brand)),
		];
		const realDomains = [
			...entry.realDomains,
			...GLOBAL_BRANDS.flatMap((g) => g.realDomains),
		];
		// biome-ignore lint/suspicious/noExplicitAny: horizon shape
		let recs: any[] = [];
		try {
			const d = await j(
				`${HORIZON}/assets?asset_code=${encodeURIComponent(entry.code)}&limit=50`,
			);
			recs = d?._embedded?.records ?? [];
		} catch (e) {
			console.log(`  ${entry.code}: horizon error ${(e as Error).message}`);
			continue;
		}
		for (const r of recs) {
			const issuer = String(r.asset_issuer);
			if (entry.canonicalIssuers.includes(issuer)) continue;
			issuersSeen++;
			let homeDomain: string | null = null;
			try {
				// biome-ignore lint/suspicious/noExplicitAny: horizon shape
				const acct: any = await j(`${HORIZON}/accounts/${issuer}`);
				homeDomain = acct.home_domain ?? null;
			} catch {
				// deleted/merged account: the asset row remains, the account is gone
			}
			const verdict = classifyIssuerDomain({ homeDomain, brands, realDomains });
			if (verdict.kind === "canonical-domain") continue;
			const victims = Number(
				r.num_accounts ?? r.accounts?.authorized ?? 0,
			);
			const supply = String(r.amount ?? r.balances?.authorized ?? "") || null;
			const base = {
				code: entry.code,
				issuer,
				homeDomain,
				brand: entry.brand,
				victims,
				supply,
				canonicalIssuers: entry.canonicalIssuers,
			};
			if (verdict.kind === "lookalike") {
				lookalikes.push({
					...base,
					kind: "lookalike",
					brandHit: verdict.brandHit,
					evidence: `home_domain "${homeDomain}" references "${verdict.brandHit}" on a domain the operator does not own; ${victims} trustline(s); canonical issuer(s): ${entry.canonicalIssuers.join(", ") || "none exists (any issuance of this code is suspect)"}`,
				});
			} else {
				unverified.push({
					...base,
					kind: "unverified-issuer",
					evidence: `non-canonical issuer of ${entry.code} (home_domain ${homeDomain ?? "unset"}); same-code assets are legal, listed for context only`,
				});
			}
		}
	}

	lookalikes.sort((a, b) => b.victims - a.victims);
	unverified.sort((a, b) => b.victims - a.victims);

	const report = {
		generatedAt: new Date().toISOString(),
		frame: {
			codesChecked: byCode.size,
			issuersSeen,
			watchlist: WATCHLIST.map((w) => w.code),
		},
		// THE findings — impersonation. Exit-red below.
		lookalikes,
		// context, not findings: legal same-code issuances without brand theft
		unverifiedCount: unverified.length,
		unverifiedSample: unverified.slice(0, 15),
	};

	if (OUT_FILE) writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 1)}\n`);
	if (JSON_OUT) console.log(JSON.stringify(report, null, 1));
	else {
		for (const f of lookalikes)
			console.log(
				`  ✗ ${f.code.padEnd(7)} ${String(f.homeDomain).padEnd(28)} ${f.victims} trustline(s)  issuer ${f.issuer.slice(0, 8)}…`,
			);
		console.log(
			`\nlookalike-domains: ${byCode.size} codes · ${issuersSeen} non-canonical issuers · ${lookalikes.length} LOOKALIKE(s) · ${unverified.length} unverified (context)`,
		);
	}
	// Engine convention: a red exit IS the signal.
	process.exit(lookalikes.length > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("FATAL:", e);
	process.exit(1);
});
