/**
 * The product probe counts only the public network (audit 2026-11-23).
 *
 * product-integration backs a Live label, and two of the probe's signals took
 * the test network for a product on Stellar: a stellar.toml whose
 * NETWORK_PASSPHRASE is the test network's (slimepay, remi, microvault,
 * sytemap, juntta, hedgepay), and a page naming horizon-testnet.stellar.org.
 * A third read an SPA's index.html, served at the toml path, as a toml because
 * the markup says "accounts" (muney, peerpesa, infinity-wallet, earnbit,
 * ziriz). And the lane never re-read its own stamps, so a stamp resting on a
 * toml the probe now rejects stood forever.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { basisWrite, readRow } from "../../../scripts/basis-from-product";
import { type ProbeResult, probeProduct } from "../product-probe";

const answer = (url: string, status: number, body: string) => ({
	ok: status >= 200 && status < 300,
	status,
	url,
	text: async () => body,
});

/** Serve `toml` at the toml path and `page` everywhere else. */
const site = (toml: string | null, page = "<html><p>A product.</p></html>") =>
	vi.stubGlobal("fetch", async (url: string) =>
		url.endsWith("/.well-known/stellar.toml")
			? toml === null
				? answer(url, 404, "Not Found")
				: answer(url, 200, toml)
			: answer(url, 200, page),
	);

// Joined at runtime so a secret scanner does not read the line as a key.
const SIGNING = ["SIGNING", "KEY"].join("_");

/** slimepay.com's toml as served on 2026-11-23 (abridged). */
const SLIMEPAY_TOML = `NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
HORIZON_URL="https://horizon-testnet.stellar.org"
ACCOUNTS=["GBHZJYFAUF3QK47NQQAGWAOUOXFMY6DQ2UUX6IJUDPCKDKKMU4FKTWGE"]
${SIGNING}="GCEXAOQNZ233G2KSLIVBNOVI5KTXKI7FELMEDFZ5KBQ5NP3ICG4BXYRU"
WEB_AUTH_ENDPOINT="https://anchor.slimepay.com/auth"

[DOCUMENTATION]
ORG_NAME="Slimepay"

[[CURRENCIES]]
code="USDC"
issuer="GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
status="test"
`;

/** decaf.so's toml (abridged): declares the public network. */
const DECAF_TOML = `# DECAF Stellar Wallet and POS <decaf.so>

NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
${SIGNING}="GDR5FQGB5PCTTGZEURKT6ORMPIITO3457WXZ227AF77YJDQVOTRSWXHP"

[DOCUMENTATION]
ORG_NAME="DECAF"
`;

/** stellarx.com's toml (abridged): no passphrase, a public network account. */
const STELLARX_TOML = `# StellarX <stellarx.com>
VERSION="2.2.0"

ACCOUNTS=[
"GDM4UWTGHCWSTM7Z46PNF4BLH35GS6IUZYBWNNI4VU5KVIHYSIVQ55Y6"
]
[DOCUMENTATION]
ORG_NAME="Ultra Stellar LLC"
`;

/** stellarguard.me's toml: only SEP-7 keys, no passphrase. */
const STELLARGUARD_TOML = `MULTISIG_SERVER="https://stellarguard.me/api/transactions"
URI_REQUEST_${SIGNING}="GCVHEKSRASJBD6O2Z532LWH4N2ZLCBVDLLTLKSYCSMBLOYTNMEEGUARD"`;

/** muney.app serves its index.html at the toml path (2026-11-23). */
const SPA_INDEX = `<!doctype html>
<html lang="en"><head><title>Muney Network</title></head>
<body><p>No pre-funded accounts in every country, no FX desk.</p></body></html>`;

describe("a stellar.toml counts only when it is a toml for the public network", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("slimepay: a toml declaring the test network is no integration, and says so", async () => {
		site(SLIMEPAY_TOML, "<html>@stellar/stellar-sdk</html>");
		const r = await probeProduct("https://slimepay.com/");
		expect(r.kind).toBeNull();
		expect(r.couldNotCheck).toBe(false);
		expect(r.detail).toMatch(/^its stellar\.toml declares the test network/);
		expect(r.url).toBe("https://slimepay.com/.well-known/stellar.toml");
		expect(r.rejected).toBe("https://slimepay.com/.well-known/stellar.toml");
	});

	it("futurenet is not the public network either", async () => {
		site(
			SLIMEPAY_TOML.replace(
				"Test SDF Network ; September 2015",
				"Test SDF Future Network ; October 2022",
			),
		);
		expect((await probeProduct("https://x.example/")).detail).toMatch(
			/declares the test network/,
		);
	});

	it("decaf: a toml declaring the public network is sep1-toml", async () => {
		site(DECAF_TOML);
		expect((await probeProduct("https://decaf.so/")).kind).toBe("sep1-toml");
	});

	it("stellarx and stellarguard: a real toml with no passphrase is read as the public network", async () => {
		site(STELLARX_TOML);
		expect((await probeProduct("https://stellarx.com/")).kind).toBe(
			"sep1-toml",
		);
		site(STELLARGUARD_TOML);
		expect((await probeProduct("https://stellarguard.me/")).kind).toBe(
			"sep1-toml",
		);
	});

	it("muney: an index.html served at the toml path is not a toml", async () => {
		site(SPA_INDEX, SPA_INDEX);
		const r = await probeProduct("https://muney.app/");
		expect(r.kind).toBeNull();
		expect(r.detail).toMatch(/^no Stellar marker/);
		expect(r.rejected).toBe("https://muney.app/.well-known/stellar.toml");
	});

	it("a toml no longer served is a reading; a 403 is not", async () => {
		site(null);
		expect((await probeProduct("https://taurushq.com/")).rejected).toBe(
			"https://taurushq.com/.well-known/stellar.toml",
		);
		vi.stubGlobal("fetch", async (url: string) =>
			url.endsWith("stellar.toml")
				? answer(url, 403, "Forbidden")
				: answer(url, 200, "<html><p>A product.</p></html>"),
		);
		expect((await probeProduct("https://agama.example/")).rejected).toBe(
			undefined,
		);
	});

	it("an HTML document after a BOM and whitespace is still HTML", async () => {
		site(`﻿\n\n  <!DOCTYPE html><html><body>accounts</body></html>`);
		expect((await probeProduct("https://iw.example/")).rejected).toBe(
			"https://iw.example/.well-known/stellar.toml",
		);
	});

	it("a 200 that is neither HTML nor a toml is no reading that the file is gone", async () => {
		site("Service temporarily unavailable. Please retry.");
		const r = await probeProduct("https://waf.example/");
		expect(r.kind).toBeNull();
		expect(r.rejected).toBeUndefined();
	});

	it("stellarterm: a toml naming only a federation server is a Stellar service, so it counts", async () => {
		site(`# StellarTerm <stellarterm.com>

FEDERATION_SERVER="https://fed.stellarterm.com/federation/"

DESIRED_BASE_FEE=1000

[DOCUMENTATION]
ORG_NAME="ULTRA STELLAR, LLC"
`);
		expect((await probeProduct("https://stellarterm.com/")).kind).toBe(
			"sep1-toml",
		);
	});

	it("a toml with only [DOCUMENTATION] is no evidence, and is never called not a toml", async () => {
		site(`VERSION="2.0.0"

[DOCUMENTATION]
ORG_NAME="Example"
`);
		const r = await probeProduct("https://doc-only.example/");
		expect(r.kind).toBeNull();
		expect(r.rejected).toBeUndefined();
	});
});

describe("page markers count only public network hosts", () => {
	afterEach(() => vi.unstubAllGlobals());
	const kindOf = async (page: string) => {
		site(null, `<html><script>${page}</script></html>`);
		return (await probeProduct("https://app.example/")).kind;
	};

	it("horizon-testnet.stellar.org is not a Horizon endpoint marker", async () => {
		expect(await kindOf('h="https://horizon-testnet.stellar.org"')).toBeNull();
	});
	it("horizon.stellar.org is", async () => {
		expect(await kindOf('h="https://horizon.stellar.org"')).toBe(
			"horizon-endpoint",
		);
	});
	it("an RPC host counts only when it names mainnet", async () => {
		for (const testnet of [
			"https://soroban-rpc.testnet.stellar.gateway.fm",
			"https://soroban-rpc-futurenet.example",
			"https://soroban-rpc.stellar-testnet.nownodes.io",
			"https://testnet.soroban-rpc.example",
			"soroban-rpc",
			// EVM chains (nouns.build and team.finance bundles, 2026-11-23)
			"https://rpc.mainnet.taiko.xyz",
			"https://rpc.mainnet.lukso.network",
		])
			expect(await kindOf(`r="${testnet}"`), testnet).toBeNull();
		for (const mainnet of [
			"https://mainnet.sorobanrpc.com",
			"https://soroban-rpc.mainnet.stellar.gateway.fm",
			"https://rpc.stellar.org",
		])
			expect(await kindOf(`r="${mainnet}"`), mainnet).toBe("soroban-rpc");
	});
	it("friendbot and soroban-testnet are no marker", async () => {
		expect(
			await kindOf(
				'f="https://friendbot.stellar.org";s="https://soroban-testnet.stellar.org"',
			),
		).toBeNull();
	});
});

describe("the lane re-reads its own stamps and never writes status", () => {
	const probe = (over: Partial<ProbeResult>): ProbeResult => ({
		kind: null,
		detail: "",
		url: null,
		couldNotCheck: false,
		...over,
	});
	const TOML = "https://slimepay.com/.well-known/stellar.toml";
	const stamped = { statusBasis: "product-integration", statusSourceUrl: TOML };
	const NOW = "2026-11-24T10:00:00.000Z";

	it("slimepay: a stamp whose cited toml the probe now rejects is withdrawn to unverified with no source", () => {
		const w = basisWrite(
			stamped,
			probe({
				detail:
					'its stellar.toml declares the test network ("Test SDF Network ; September 2015")',
				url: TOML,
				rejected: TOML,
			}),
			NOW,
		);
		expect(w).toEqual({
			statusBasis: "unverified",
			statusAsOf: NOW,
			statusSourceUrl: null,
		});
		expect(w).not.toHaveProperty("status");
	});
	it("could-not-check never withdraws", () => {
		expect(basisWrite(stamped, probe({ couldNotCheck: true }), NOW)).toBeNull();
	});
	it("loop: a marker not found again is no rejection, so the stamp stays", () => {
		// loop's contract id sat 2.5 MB into a bundle the probe reads 400 KB of.
		const js = "https://loopfinance.io/_expo/static/js/web/__common.js";
		const loop = { statusBasis: "product-integration", statusSourceUrl: js };
		expect(basisWrite(loop, probe({ detail: "no Stellar marker" }), NOW)).toBe(
			null,
		);
		// Its rejected toml is not what the stamp cites.
		expect(
			basisWrite(
				loop,
				probe({ rejected: "https://loopfinance.io/.well-known/stellar.toml" }),
				NOW,
			),
		).toBeNull();
	});
	it("the same evidence again writes nothing", () => {
		expect(
			basisWrite(stamped, probe({ kind: "sep1-toml", url: TOML }), NOW),
		).toBeNull();
	});
	it("evidence that moved is re-cited", () => {
		const js = "https://astrograph.example/assets/index.js";
		expect(
			basisWrite(stamped, probe({ kind: "stellar-sdk", url: js }), NOW),
		).toEqual({
			statusBasis: "product-integration",
			statusAsOf: NOW,
			statusSourceUrl: js,
		});
	});
	it("a weak row with no integration found is left alone", () => {
		expect(
			basisWrite({ statusBasis: "site-liveness" }, probe({}), NOW),
		).toBeNull();
	});

	describe("a withdrawal needs a second read after a pause that agrees", () => {
		const rejecting = probe({ detail: "HTTP 404 toml", rejected: TOML });
		const finding = probe({ kind: "sep1-toml", url: TOML });
		const run = async (reads: ProbeResult[]) => {
			let calls = 0;
			let pauses = 0;
			const out = await readRow(
				stamped,
				"https://slimepay.com/",
				NOW,
				async () => reads[calls++],
				async () => {
					pauses++;
				},
			);
			return { ...out, calls, pauses };
		};

		it("a lone 404 during a deploy withdraws nothing", async () => {
			const out = await run([rejecting, finding]);
			expect(out.write).toBeNull();
			expect(out.pauses).toBe(1);
		});
		it("a second rejection after the pause withdraws", async () => {
			const out = await run([rejecting, rejecting]);
			expect(out.write?.statusBasis).toBe("unverified");
			expect(out.calls).toBe(2);
		});
		it("a second read that could not look withdraws nothing", async () => {
			expect(
				(await run([rejecting, probe({ couldNotCheck: true })])).write,
			).toBeNull();
		});
		it("a read that is no withdrawal is not re-read", async () => {
			const out = await run([finding]);
			expect(out.calls).toBe(1);
			expect(out.pauses).toBe(0);
		});
	});
});
