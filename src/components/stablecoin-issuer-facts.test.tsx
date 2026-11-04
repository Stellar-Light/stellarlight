// @vitest-environment jsdom

/**
 * Review 2026-11-04 (sls-107 class): the explorer's asset drawer labelled the
 * curated domain "Home Domain" and the peg's country "Country", showed the
 * brand where a reader looks for the issuer, and never showed the issuer of
 * record. Each value now carries the label of what it is.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { type CoinView, IssuerFacts } from "./stablecoin-explorer";

afterEach(cleanup);

const coin: CoinView = {
	id: "AUDD-GDC7X2MX",
	ticker: "AUDD",
	name: "AUDD",
	company: "Novatti Group",
	issuerCode: "GDC7X2MXTYSAKUUGAIQ7J7RPEIM7GXSAIWFYWWH4GLNFECQVJJLB2EEU",
	issuerDomain: "audd.digital",
	issuerOfRecord: "AUDC PTY LTD",
	issuerOfRecordCheck: "named",
	issuerOfRecordAsOf: "2026-11-05T06:25:00.000Z",
	issuerOfRecordNote: null,
	country: "AU",
	peg: "AUD",
	assetType: null,
	logoUrl: null,
	useFlagIcon: true,
	basis: "curated-static",
	note: null,
	measuredAt: "2026-11-05T06:30:00.000Z",
	supplyRaw: null,
	holdersRaw: null,
	marketCapRaw: null,
	volumeRaw: null,
	priceRaw: null,
};

describe("IssuerFacts: each value labelled for what it is", () => {
	it("names the brand as the brand and the issuer of record with its read date", () => {
		render(<IssuerFacts coin={coin} />);
		expect(screen.getByText("Brand")).toBeTruthy();
		expect(screen.getByText("Novatti Group")).toBeTruthy();
		expect(screen.getByText("Issuer of record")).toBeTruthy();
		expect(
			screen.getByText("AUDC PTY LTD (stellar.toml, read Nov 5, 2026)"),
		).toBeTruthy();
	});

	it("calls the curated domain Domain and the peg's country Peg country", () => {
		render(<IssuerFacts coin={coin} />);
		expect(screen.getByText("Domain")).toBeTruthy();
		expect(screen.queryByText("Home Domain")).toBeNull();
		expect(screen.getByText("Peg country")).toBeTruthy();
		expect(screen.queryByText("Country")).toBeNull();
	});

	it("a checked absence and an unread row say so, never the brand", () => {
		render(
			<IssuerFacts
				coin={{
					...coin,
					issuerOfRecord: null,
					issuerOfRecordCheck: "not-named",
					issuerOfRecordNote: "the issuer account sets no home_domain",
				}}
			/>,
		);
		expect(
			screen.getByText("None named by its stellar.toml (checked Nov 5, 2026)"),
		).toBeTruthy();
		expect(
			screen.getByText("the issuer account sets no home_domain"),
		).toBeTruthy();
		cleanup();
		render(
			<IssuerFacts
				coin={{
					...coin,
					issuerOfRecord: null,
					issuerOfRecordCheck: null,
					issuerOfRecordAsOf: null,
				}}
			/>,
		);
		expect(screen.getByText("Not read from its stellar.toml yet")).toBeTruthy();
	});
});
