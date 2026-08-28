/**
 * Canonical-asset guard (reframed 2026-08-28: "we don't need to find every
 * fake asset — there's millions of them; we just need to serve the real one").
 *
 * Anyone can issue any code, so enumerating fakes is an unbounded treadmill
 * that can never close. What IS ours to guarantee, and what this guard reds
 * on:
 *
 *   1. THE REAL ONE EXISTS - every ticker we serve a canonical issuer for
 *      must still have that exact asset live on Horizon mainnet.
 *   2. THE REAL ONE AGREES - the operator's own stellar.toml (at the real
 *      domain) must still declare the issuer our registry serves. A conflict
 *      means OUR canonical answer may be wrong - the one failure mode that
 *      actually poisons consumers.
 *   3. THE REAL ONE IS NAMED - a watchlist ticker agents ask about with NO
 *      canonical resolution is our data gap: either verify an issuer or
 *      record that no genuine Stellar issuance exists.
 *
 * The lookalike sweep (src/lib/lookalike-domains.ts) still runs, but its
 * output is CONTEXT INTEL in the artifact - never findings, never a red:
 * fakes are the ocean, the canonical row is the lighthouse.
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
	/** "none-on-stellar" records the VERIFIED absence of a genuine issuance
	 * (closes the naming gap without inventing an issuer) */
	resolution?: "none-on-stellar";
}

/** Institutional tickers with NO canonical Stellar issuance we could verify —
 * any issuance at all is suspect, and a brand-referencing home_domain is the
 * farm. Grows as the queue work finds more squatted names. */
const WATCHLIST: WatchEntry[] = [
	{
		// 2026-08-28: no canonical issuance establishable (no toml, no curated
		// stellar.expert record; every on-chain issuance is farm). Until the
		// operator publishes one, the honest canonical answer is "none".
		code: "WTGXX",
		brand: "WisdomTree",
		realDomains: ["wisdomtree.com"],
		canonicalIssuers: [],
		resolution: "none-on-stellar",
	},
	{
		code: "USTBL",
		brand: "Spiko",
		resolution: "none-on-stellar",
		realDomains: ["spiko.io", "spiko.finance"],
		canonicalIssuers: [],
	},
	{
		code: "EUTBL",
		brand: "Spiko",
		resolution: "none-on-stellar",
		realDomains: ["spiko.io", "spiko.finance"],
		canonicalIssuers: [],
	},
	{
		code: "BUIDL",
		brand: "BlackRock Securitize",
		resolution: "none-on-stellar",
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

	// ── The guard: the REAL one exists, agrees, and is named ──
	type GuardFail = {
		kind: "canonical-missing" | "canonical-conflict" | "canonical-unnamed";
		code: string;
		brand: string;
		detail: string;
	};
	const guardFails: GuardFail[] = [];

	// ── Context intel (never findings, never red): the fake ocean ──
	type Intel = {
		code: string;
		issuer: string;
		homeDomain: string | null;
		brandHit?: string;
		victims: number;
	};
	const lookalikes: Intel[] = [];
	let unverifiedCount = 0;
	let issuersSeen = 0;

	for (const entry of byCode.values()) {
		// 1+2. canonical existence + toml agreement (only where we NAME one)
		if (entry.canonicalIssuers.length > 0) {
			for (const iss of entry.canonicalIssuers) {
				try {
					const d = await j(
						`${HORIZON}/assets?asset_code=${encodeURIComponent(entry.code)}&asset_issuer=${iss}`,
					);
					if (((d?._embedded?.records ?? []) as unknown[]).length === 0)
						guardFails.push({
							kind: "canonical-missing",
							code: entry.code,
							brand: entry.brand,
							detail: `registry canonical issuer ${iss} has NO ${entry.code} asset on Horizon mainnet — the real one is gone or our canonical is wrong`,
						});
				} catch (e) {
					console.log(
						`  ${entry.code}: horizon canonical check error ${(e as Error).message}`,
					);
				}
			}
			const dom = entry.realDomains[0];
			if (dom) {
				try {
					const r = await fetch(`https://${dom}/.well-known/stellar.toml`, {
						headers: UA,
					});
					if (r.ok) {
						const toml = await r.text();
						const declared = [
							...toml.matchAll(
								/code\s*=\s*"([A-Z0-9]+)"[\s\S]{0,160}?issuer\s*=\s*"(G[A-Z0-9]{55})"/g,
							),
						]
							.filter((m) => m[1] === entry.code)
							.map((m) => m[2]);
						if (
							declared.length > 0 &&
							!declared.some((d) => entry.canonicalIssuers.includes(d))
						) {
							// Reconcile before accusing ourselves: GBPZ's operator toml
							// declares an issuer that does not EXIST on-chain while our
							// registry's does (home_domain reverse-verified). A conflict
							// is a red only when the toml's issuer is real AND ours
							// fails; a broken operator toml is their bug, noted as
							// intel, not ours.
							let tomlIssuerExists = false;
							for (const d of declared) {
								try {
									const chk = await j(
										`${HORIZON}/assets?asset_code=${encodeURIComponent(entry.code)}&asset_issuer=${d}`,
									);
									if (((chk?._embedded?.records ?? []) as unknown[]).length > 0)
										tomlIssuerExists = true;
								} catch {}
							}
							if (tomlIssuerExists)
								guardFails.push({
									kind: "canonical-conflict",
									code: entry.code,
									brand: entry.brand,
									detail: `${dom}/.well-known/stellar.toml declares ${entry.code} issuer(s) ${declared.map((x) => `${x.slice(0, 10)}…`).join(", ")} (live on-chain) but our registry serves ${entry.canonicalIssuers.map((x) => `${x.slice(0, 10)}…`).join(", ")} — OUR canonical answer may be poisoning consumers`,
								});
							else
								console.log(
									`  note: ${entry.code} toml at ${dom} declares a non-existent issuer while ours is live — operator toml bug, not a red`,
								);
						}
					}
					// unreachable toml = a site flake, noted by absence — never a red
				} catch {}
			}
		} else if (entry.resolution !== "none-on-stellar") {
			// 3. a ticker agents ask about with no canonical answer and no
			// verified absence — OUR closable data gap
			guardFails.push({
				kind: "canonical-unnamed",
				code: entry.code,
				brand: entry.brand,
				detail: `no canonical issuer named and no verified absence recorded — verify one or set resolution: "none-on-stellar"`,
			});
		}

		// ── intel sweep (unchanged mechanics, demoted to context) ──
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
		} catch {
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
			} catch {}
			const verdict = classifyIssuerDomain({ homeDomain, brands, realDomains });
			if (verdict.kind === "canonical-domain") continue;
			if (verdict.kind === "lookalike")
				lookalikes.push({
					code: entry.code,
					issuer,
					homeDomain,
					brandHit: verdict.brandHit,
					victims: Number(r.num_accounts ?? r.accounts?.authorized ?? 0),
				});
			else unverifiedCount++;
		}
	}

	lookalikes.sort((a, b) => b.victims - a.victims);

	const report = {
		generatedAt: new Date().toISOString(),
		frame: {
			codesChecked: byCode.size,
			issuersSeen,
			watchlist: WATCHLIST.map((w) => `${w.code}${w.resolution ? ` (${w.resolution})` : ""}`),
		},
		meaning:
			"We serve THE REAL asset; we do not chase fakes. guard.* are OUR closable findings (the canonical row missing, conflicted, or unnamed). intel.* is context about the fake ocean — informational, unbounded by nature, never a finding.",
		guard: {
			canonicalMissing: guardFails.filter((f) => f.kind === "canonical-missing"),
			canonicalConflicts: guardFails.filter(
				(f) => f.kind === "canonical-conflict",
			),
			canonicalUnnamed: guardFails.filter((f) => f.kind === "canonical-unnamed"),
		},
		intel: {
			lookalikeCount: lookalikes.length,
			lookalikeSample: lookalikes.slice(0, 15),
			unverifiedCount,
			totalVictimTrustlines: lookalikes.reduce((a, f) => a + f.victims, 0),
		},
	};

	if (OUT_FILE) writeFileSync(OUT_FILE, `${JSON.stringify(report, null, 1)}\n`);
	if (JSON_OUT) console.log(JSON.stringify(report, null, 1));
	else {
		for (const f of guardFails)
			console.log(`  ✗ [${f.kind}] ${f.code} (${f.brand}): ${f.detail}`);
		console.log(
			`\ncanonical-assets: ${byCode.size} codes guarded · ${guardFails.length} guard failure(s) · intel: ${lookalikes.length} lookalikes (${report.intel.totalVictimTrustlines} victim trustlines), ${unverifiedCount} unverified`,
		);
	}
	// Red ONLY when the real one is missing/conflicted/unnamed — never for fakes.
	process.exit(guardFails.length > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("FATAL:", e);
	process.exit(1);
});
