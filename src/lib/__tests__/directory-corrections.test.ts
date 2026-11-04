/**
 * Curated directory corrections of 2026-11-04 (Raven sls-099, sls-100,
 * sls-112). The rows change only when the curation lane runs, so what can
 * fail here is the source: a curated value that would write the wrong fact
 * back on the next run, which is exactly how sls-100 would have returned
 * (the issue says so: fix the maps, or a later run restores the domain).
 */
import { describe, expect, it } from "vitest";
import {
	DEPLOYMENT_VERIFIED,
	DESCRIPTION_FIXES,
	SEEDS,
	STATUS_FIX,
	statusFixNote,
	WEBSITE_FIXES,
} from "../../../scripts/data/curation-maps";
import { registrableDomain } from "../partner-project-identity";

describe("a STATUS_FIX stamp's note (statusFixNote)", () => {
	const stamp = { from: "Live", to: "Live", note: "new" };
	it("fills an empty note and keeps a stored one", () => {
		expect(statusFixNote(stamp, undefined)).toBe("new");
		expect(statusFixNote(stamp, "old")).toBeNull();
	});
	it("replaces a stored note only when the entry says so, once", () => {
		expect(statusFixNote({ ...stamp, replaceNote: true }, "old")).toBe("new");
		expect(statusFixNote({ ...stamp, replaceNote: true }, "new")).toBeNull();
	});
	it("a status move always writes its note; no note writes nothing", () => {
		expect(
			statusFixNote({ from: "Live", to: "Inactive", note: "x" }, "y"),
		).toBe("x");
		expect(statusFixNote({ from: "Live", to: "Live" }, "y")).toBeNull();
	});
});

describe("Hana's curated links point at the wallet's own site (sls-100)", () => {
	// The stored note on 2026-11-02, the redirect claim that reversed.
	const STALE =
		"live wallet app; hanawallet.io 308s to hana.money (WEBSITE_FIXES moves the row)";
	it("website and status source are hanawallet.io, not hana.money", () => {
		expect(registrableDomain(WEBSITE_FIXES.hana)).toBe("hanawallet.io");
		expect(registrableDomain(STATUS_FIX.hana.sourceUrl)).toBe("hanawallet.io");
	});
	it("the next run replaces the stale redirect note", () => {
		expect(STATUS_FIX.hana.note).not.toMatch(/308s to hana\.money/);
		expect(statusFixNote(STATUS_FIX.hana, STALE)).toBe(STATUS_FIX.hana.note);
	});
});

describe("Soroswap's venues are the operator's documented API set (sls-099)", () => {
	it("names SushiSwap V3 and Comet, and SDEX as the separate classic path", () => {
		const d = DESCRIPTION_FIXES.soroswap;
		for (const venue of ["Aquarius", "SushiSwap V3", "Comet", "SDEX"])
			expect(d).toContain(venue);
		expect(d).not.toMatch(/Soroswap, Phoenix, Aquarius/);
		expect(d).toMatch(/separate classic path/);
	});
	it("Phoenix's Soroswap link is stated as contract-level only", () => {
		const d = DESCRIPTION_FIXES.phoenix;
		expect(d).not.toMatch(/aggregated by Soroswap/);
		expect(d).toMatch(/Aggregator v3 contract defines a Phoenix hop/);
		expect(d).toMatch(/not in the venue list of Soroswap's Aggregator API/);
	});
});

describe("first-party Stellar launches are seeded with their sources (sls-112)", () => {
	const seed = (slug: string) => SEEDS.find((s) => s.slug === slug);
	it("Chainlink: an Oracle row citing Chainlink's Stellar page, both proxies named", () => {
		const c = seed("chainlink");
		expect(c?.types).toEqual(["Oracle"]);
		expect(c?.statusSourceUrl).toBe(
			"https://docs.chain.link/data-feeds/stellar",
		);
		expect(c?.shortDescription).toContain(
			"CBUF6IADAWPWIDWRTHJNINKXHG2UTIQ6TU2F2HRAXWAI7OT3KJPKK6O4",
		);
		expect(c?.shortDescription).toContain(
			"CDQBHEUGLDHMSUHG4IH33RJBUTMNCZOT4JIAQR4WZFRDZW6DR6S32ZLZ",
		);
		expect(DEPLOYMENT_VERIFIED.chainlink).toMatchObject({ network: "mainnet" });
	});
	it("MetaMask: a Wallet row for its native Stellar network, apart from the Snap", () => {
		const m = seed("metamask");
		expect(m?.types).toEqual(["Wallet"]);
		expect(m?.statusSourceUrl).toBe(
			"https://support.metamask.io/configure/networks/stellar",
		);
		expect(DESCRIPTION_FIXES["stellar-metamask"]).toMatch(
			/default network, with no Snap needed/,
		);
	});
	it("seed slugs stay unique", () => {
		const slugs = SEEDS.map((s) => s.slug);
		expect(slugs.length).toBe(new Set(slugs).size);
	});
});
