import { describe, expect, it } from "vitest";
import { deriveCleanTitle, humanizeSlug, titleIssue } from "../title-quality";

const URL = "https://lumenloop.com/news/usdc-coming-stellar";

describe("titleIssue (S6 classifier)", () => {
	it("flags each S6 class", () => {
		expect(titleIssue("", URL)).toBe("empty");
		expect(titleIssue("2026-04-16", URL)).toBe("bare-date");
		expect(titleIssue("June 3, 2026", URL)).toBe("bare-date");
		expect(titleIssue("x".repeat(111), URL)).toContain("overlong");
		expect(titleIssue("USDC is Coming to Stellar!", URL)).toContain(
			"sentence-like",
		);
		expect(titleIssue("We launched. Here's why.", URL)).toContain(
			"sentence-like",
		);
		expect(titleIssue("America&#x27;s fifth-largest bank", URL)).toBe(
			"html-entities",
		);
		expect(titleIssue("Payments &amp; Anchors", URL)).toBe("html-entities");
	});

	it("passes legit titles, including lowercase CLI identifiers (calibration)", () => {
		expect(titleIssue("tx sign and tx send", URL)).toBeNull();
		expect(titleIssue("SEP-24: Hosted Deposit and Withdrawal", URL)).toBeNull();
		expect(titleIssue("Stellar Protocol Meeting 2026-04-16", URL)).toBeNull();
		expect(
			titleIssue("Issue an Asset on Stellar: Set Trustlines…", URL),
		).toBeNull();
	});
});

describe("deriveCleanTitle", () => {
	it("decodes entities (the lumenloop-research class)", () => {
		expect(
			deriveCleanTitle(
				"America&#x27;s fifth-largest bank US Bancorp tests stablecoin",
				URL,
			),
		).toBe("America's fifth-largest bank US Bancorp tests stablecoin");
	});

	it("strips trailing sentence punctuation, keeping internal punctuation", () => {
		expect(deriveCleanTitle("USDC is Coming to Stellar!", URL)).toBe(
			"USDC is Coming to Stellar",
		);
		expect(
			deriveCleanTitle(
				"The world's government debt is coming onchain. It's choosing Stellar.",
				URL,
			),
		).toBe(
			"The world's government debt is coming onchain. It's choosing Stellar",
		);
	});

	it("clamps overlong titles at their title-proper separator", () => {
		const long =
			"Faraday vs Point-Solutions: A comparison for handling stablecoin routing, compliance and settlement across many corridors";
		expect(long.length).toBeGreaterThan(110);
		expect(deriveCleanTitle(long, URL)).toBe("Faraday vs Point-Solutions");
	});

	it("falls back to the humanized slug for a bare-date title", () => {
		expect(
			deriveCleanTitle(
				"2026-04-16",
				"https://developers.stellar.org/meetings/2026-04-16-notes",
			),
		).toBe("2026 04 16 notes");
	});

	it("clamps at a comma when no stronger separator fits", () => {
		const long =
			"Visa expands stablecoin settlement to include PayPal's PYUSD, Paxos-issued USDG, Circle's EURC, and adds support for Stellar and Avalanche";
		expect(long.length).toBeGreaterThan(110);
		expect(deriveCleanTitle(long, URL)).toBe(
			"Visa expands stablecoin settlement to include PayPal's PYUSD",
		);
	});

	it("drops a leading brand segment from an overlong title, keeping the real title intact", () => {
		const long =
			"Stellar | Representing Blockchain on the Commodity Futures Trading Commission's Global Market Advisory Committee";
		expect(long.length).toBeGreaterThan(110);
		expect(deriveCleanTitle(long, URL)).toBe(
			"Representing Blockchain on the Commodity Futures Trading Commission's Global Market Advisory Committee",
		);
	});

	it("never derives a letterless title from a date URL (the '09' regression)", () => {
		expect(
			deriveCleanTitle(
				"2024-02-09",
				"https://developers.stellar.org/meetings/2024-02-09",
			),
		).toBe("Meetings 2024-02-09");
	});

	it("word-truncates an overlong title with no separator as last resort", () => {
		const words = `Stellar ${"word ".repeat(40)}end`;
		const out = deriveCleanTitle(words, "https://example.com/");
		expect(out.length).toBeLessThanOrEqual(110);
		expect(titleIssue(out, "https://example.com/")).toBeNull();
	});

	it("leaves clean titles untouched", () => {
		for (const t of [
			"SEP-24: Hosted Deposit and Withdrawal",
			"tx sign and tx send",
			"v22.0.10",
			"Stellar Protocol Meeting 2026-04-16",
		])
			expect(deriveCleanTitle(t, URL)).toBe(t);
	});

	it("always yields a classifier-clean title for the live S6 samples", () => {
		const samples: Array<[string, string]> = [
			[
				"We Launched a Stablecoin. Here&#x27;s Why – And Why Now.",
				"https://lumenloop.com/news/we-launched-stablecoin-now",
			],
			[
				"Stellar Price Rises by 10% After USDC Heralds it as &quot;Official Chain&quot;",
				"https://lumenloop.com/news/stellar-price-rises-10-usdc-heralds-as-official-chain",
			],
			["Who will drive stablecoin innovation in 2024?", URL],
			["2026-04-16", "https://developers.stellar.org/meetings/2026-04-16"],
		];
		for (const [raw, url] of samples)
			expect(titleIssue(deriveCleanTitle(raw, url), url)).toBeNull();
	});
});

describe("humanizeSlug", () => {
	it("humanizes the last path segment", () => {
		expect(humanizeSlug("https://a.com/news/usdc-coming-stellar")).toBe(
			"Usdc coming stellar",
		);
		expect(humanizeSlug("https://a.com/core/cap-0046.md")).toBe("Cap 0046");
	});
	it("appends letterless tail segments to the nearest worded one", () => {
		expect(humanizeSlug("https://a.com/meetings/2024-02-09")).toBe(
			"Meetings 2024-02-09",
		);
		expect(humanizeSlug("https://a.com/meetings/2024/02/09")).toBe(
			"Meetings 2024 02 09",
		);
	});
	it("returns null for a bare host or an all-numeric path", () => {
		expect(humanizeSlug("https://a.com/")).toBeNull();
		expect(humanizeSlug("https://a.com/2024/02/09")).toBeNull();
	});
});
