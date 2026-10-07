import { describe, expect, it } from "vitest";
import { claimVerifiedByDomain } from "../partner-invite";

// Ownership verification by construction: only a mailbox at the listing's own
// registrable domain can claim it, and shared hosts never qualify.
describe("claimVerifiedByDomain", () => {
	it("accepts a mailbox on the listing's domain, ignoring www and subdomains", () => {
		expect(
			claimVerifiedByDomain("ops@bitso.com", "https://www.bitso.com/"),
		).toBe(true);
		expect(claimVerifiedByDomain("Ops@Mail.Bitso.com", "bitso.com")).toBe(true);
		expect(
			claimVerifiedByDomain("team@coins.com.ph", "https://coins.com.ph/en"),
		).toBe(true);
	});
	it("rejects other domains, lookalikes and missing websites", () => {
		expect(claimVerifiedByDomain("ops@bitso.co", "https://bitso.com")).toBe(
			false,
		);
		expect(
			claimVerifiedByDomain("ops@bitso.com.evil.com", "https://bitso.com"),
		).toBe(false);
		expect(claimVerifiedByDomain("ops@bitso.com", null)).toBe(false);
		expect(claimVerifiedByDomain("not-an-email", "https://bitso.com")).toBe(
			false,
		);
	});
	it("never verifies a listing hosted on a shared host", () => {
		expect(
			claimVerifiedByDomain("anyone@github.io", "https://someone.github.io/"),
		).toBe(false);
		expect(claimVerifiedByDomain("a@gmail.com", "gmail.com")).toBe(false);
	});
});
