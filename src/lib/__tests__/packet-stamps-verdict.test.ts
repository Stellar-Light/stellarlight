/**
 * The packet-stamp verdict, pinned on the four shapes that decide it.
 *
 * The dashed-stats case is the reason this guard exists: orbitcdp's page
 * carried a "Live on Stellar" banner over oUSD Minted —, Collateral Locked —,
 * Borrow APY —, and the packet read the banner. A body long enough and a
 * status of 200 are not, on their own, a product.
 */
import { describe, expect, it } from "vitest";
import { judgeStamp } from "../../../scripts/check-packet-stamps";

const base = {
	slug: "example",
	to: "Live",
	sourceUrl: "https://example.com/",
	httpStatus: 200,
	html: "",
};
const filler = "Real product copy about the thing this company ships. ".repeat(
	12,
);

describe("judgeStamp", () => {
	it("HOLDS a Live stamp on a 200 with a substantive body and no markers", () => {
		const v = judgeStamp({ ...base, html: `<p>${filler}</p>` });
		expect(v.verdict).toBe("HOLDS");
	});

	// Verbatim folds, fetched 2026-09-05. These two are the guard's reason to
	// exist: if a later loosening stops catching them, the guard is decorative.
	it("CONTRADICTS the two pages that motivated it (orbitcdp, skyhitz)", () => {
		const orbitcdp = judgeStamp({
			...base,
			slug: "orbitcdp",
			sourceUrl: "https://orbitcdp.finance/",
			html: `<title>Orbit CDP &mdash; Collateralized Debt Protocol on Stellar</title>
				Skip to main content OrbitCDP Collateral Protocol Features FAQ Launch App Collateral Protocol
				Features FAQ Launch App Live on Stellar Get your finances in Orbit Harness the power of
				Collateralized Debt Positions for secure, reliable stablecoins &mdash; built natively on
				Stellar. Launch App Read the Docs oUSD Minted &mdash; Collateral Locked &mdash; Borrow APY
				&mdash; BLND Emissions &mdash; TVL &mdash; Backstop &mdash; ${filler}`,
		});
		expect(orbitcdp.verdict).toBe("CONTRADICTED");
		expect(orbitcdp.reason).toMatch(/empty-metric dashes/);

		const skyhitz = judgeStamp({
			...base,
			slug: "skyhitz",
			sourceUrl: "https://skyhitz.io/",
			html: `<title>Skyhitz - Gravity. Mainnet</title>
				SKYHITZ &middot; Mainnet Whitepaper Connect S Total Mass 0.00 HITZ L Event Horizon 0.0000 HITZ
				B Balance &mdash; HITZ Your Orbit &ndash; &loz; Trade Vault &mdash; Monitor &mdash; Safe Orbit
				&mdash; Smart Swap &mdash; Multi-path aggregator. ${filler}`,
		});
		expect(skyhitz.verdict).toBe("CONTRADICTED");
	});

	// The false-alarm classes from the 2026-09-05 calibration run: all three
	// held a live product, and all three used to go red.
	it("does not fire on punctuation, deep prose, or a client-rendered shell", () => {
		// spydra: a numbered blog list of en-dashes, thousands of chars down.
		expect(
			judgeStamp({
				...base,
				html: `<title>Asset Tokenization Platform | Spydra</title><p>${filler}</p>
					<p>1. Telangana &ndash; a report. 2. EU &amp; MiCA &ndash; legal structures.
					3. SEC &ndash; refining rules. 4. Singapore &ndash; initiatives. 5. Japan &ndash; pilots.</p>`,
			}).verdict,
		).toBe("HOLDS");
		// stellar/quickstart: "Shut down the interactive container", in a README.
		expect(
			judgeStamp({
				...base,
				html: `<title>stellar/quickstart</title><p>${filler}</p><p>Shut down the interactive container (Ctrl-C).</p>`,
			}).verdict,
		).toBe("HOLDS");
		// albedo.link: a live signer whose HTML is a mount div plus a bundle.
		expect(
			judgeStamp({
				...base,
				slug: "albedo",
				html: '<title>Albedo</title><div id="app"></div><script src="/b.js"></script>',
			}).verdict,
		).toBe("COULD-NOT-CHECK");
	});

	it("CONTRADICTS a Live stamp on fold wind-down language, and on a non-200", () => {
		expect(
			judgeStamp({
				...base,
				html: `<h1>This service is winding down.</h1><p>${filler}</p>`,
			}).verdict,
		).toBe("CONTRADICTED");
		expect(judgeStamp({ ...base, httpStatus: 404 }).verdict).toBe(
			"CONTRADICTED",
		);
	});

	it("app-store listings HOLD on a naming title and skip the dash test", () => {
		const store = {
			...base,
			slug: "lobstr",
			sourceUrl:
				"https://apps.apple.com/app/lobstr-stellar-wallet/id1404357892",
			// Store chrome is wall-to-wall dashes; the dash test would fail it.
			html: `<title>LOBSTR: Stellar Wallet on the App Store</title><p>Age — Size — Category — Seller —</p>${filler}`,
		};
		expect(judgeStamp(store).verdict).toBe("HOLDS");
		// The listing title never reliably names the row (BOSS Money Transfer for
		// boss-revolution): a title alone HOLDS; the lookup's release date decides.
		const recent = new Date(Date.now() - 20 * 86_400_000).toISOString();
		const stale = new Date(Date.now() - 200 * 86_400_000).toISOString();
		expect(
			judgeStamp({ ...store, slug: "boss-revolution", storeReleasedAt: recent })
				.verdict,
		).toBe("HOLDS");
		expect(judgeStamp({ ...store, storeReleasedAt: stale }).verdict).toBe(
			"CONTRADICTED",
		);
		expect(
			judgeStamp({ ...store, html: "<p>no title at all</p>" }).verdict,
		).toBe("COULD-NOT-CHECK");
	});

	it("REVIVES an Inactive stamp whose page came back, and HOLDS a still-dead one", () => {
		expect(
			judgeStamp({ ...base, to: "Inactive", html: `<p>${filler}</p>` }).verdict,
		).toBe("REVIVED");
		expect(
			judgeStamp({
				...base,
				to: "Inactive",
				html: `<h1>This domain is parked.</h1><p>${filler}</p>`,
			}).verdict,
		).toBe("HOLDS");
		expect(
			judgeStamp({ ...base, to: "Inactive", httpStatus: 404 }).verdict,
		).toBe("HOLDS");
	});

	it("never turns an unreadable page into a contradiction, in either direction", () => {
		for (const to of ["Live", "Inactive"]) {
			expect(judgeStamp({ ...base, to, httpStatus: 403 }).verdict).toBe(
				"COULD-NOT-CHECK",
			);
			expect(judgeStamp({ ...base, to, httpStatus: 429 }).verdict).toBe(
				"COULD-NOT-CHECK",
			);
			expect(
				judgeStamp({
					...base,
					to,
					httpStatus: null,
					error: "The operation was aborted due to timeout",
				}).verdict,
			).toBe("COULD-NOT-CHECK");
		}
	});
	it("JSON-RPC endpoints judge on getHealth; a 401/405 on a GET is could-not-check", () => {
		expect(
			judgeStamp({
				...base,
				sourceUrl: "https://rpc.ankr.com/stellar_soroban",
				httpStatus: 200,
				html: "",
				rpcHealth: "healthy",
			}).verdict,
		).toBe("HOLDS");
		expect(
			judgeStamp({
				...base,
				sourceUrl: "https://rpc.ankr.com/stellar_soroban",
				httpStatus: 200,
				html: "",
				rpcHealth: "degraded",
			}).verdict,
		).toBe("CONTRADICTED");
		expect(judgeStamp({ ...base, httpStatus: 405, html: "" }).verdict).toBe(
			"COULD-NOT-CHECK",
		);
		expect(judgeStamp({ ...base, httpStatus: 401, html: "" }).verdict).toBe(
			"COULD-NOT-CHECK",
		);
	});
});

describe("failures that are not verdicts (weak-basis sweep, 2026-09-06)", () => {
	const base = { slug: "x", sourceUrl: "https://example.com/", html: "" };

	it("a 5xx is the server failing, not the product ending", () => {
		// Cost a false death on command-robotics' Heroku dyno.
		for (const status of [500, 502, 503, 504]) {
			const v = judgeStamp({ ...base, to: "Live", httpStatus: status });
			expect(v.verdict).toBe("COULD-NOT-CHECK");
			expect(v.reason).toMatch(/server error/);
		}
	});

	it("does not read a 5xx as confirmation of an Inactive row either", () => {
		expect(judgeStamp({ ...base, to: "Inactive", httpStatus: 503 }).verdict).toBe(
			"COULD-NOT-CHECK",
		);
	});

	it("names a domain that no longer resolves, and still refuses to flip it", () => {
		const v = judgeStamp({
			...base,
			to: "Live",
			httpStatus: null,
			error: "getaddrinfo ENOTFOUND stellarpay.io",
		});
		expect(v.verdict).toBe("COULD-NOT-CHECK");
		expect(v.reason).toMatch(/does not resolve/);
	});

	it("keeps a transport failure separate from a dead domain", () => {
		const v = judgeStamp({
			...base,
			to: "Live",
			httpStatus: null,
			error: "The operation timed out",
		});
		expect(v.verdict).toBe("COULD-NOT-CHECK");
		expect(v.reason).not.toMatch(/does not resolve/);
	});

	it("judges the page body, never the page title", () => {
		// zilt ships the unedited Next.js title over a live product; retiring it
		// on the title alone would have been wrong.
		const v = judgeStamp({
			...base,
			to: "Live",
			httpStatus: 200,
			html: `<title>Create Next App</title><body>${"Buy and sell USDC with mobile money on Stellar. ".repeat(20)}</body>`,
		});
		expect(v.verdict).toBe("HOLDS");
	});
});
