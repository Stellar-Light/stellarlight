import { describe, expect, it } from "vitest";
import { scorePartners } from "../partner-match";

/** Minimal published-anchor doc shaped like a Payload partner record. */
const latamAnchor = {
	slug: "latam-anchor",
	name: "LatAm Anchor",
	partnerType: "anchor",
	regions: ["latam"],
	rampTypes: ["off-ramp"],
	assets: [{ code: "USDC" }],
	freshnessStatus: "fresh",
	acceptingClients: true,
	tagline: "USDC off-ramp across Latin America",
};

describe("scorePartners region gate", () => {
	it("does NOT read 'usdc' as a USD / North-America region signal", () => {
		// Regression: "usd" is a substring of "usdc", and the old raw-substring
		// region matcher gated the whole query to North-America → 0 LatAm results.
		const res = scorePartners("usdc off-ramp", [latamAnchor], 10);
		expect(res.map((r) => r.partner.slug)).toContain("latam-anchor");
	});

	it("still gates by a real region keyword (word-boundary)", () => {
		// A genuine "asia" ask must drop a LatAm-only anchor.
		const res = scorePartners("off-ramp in asia", [latamAnchor], 10);
		expect(res.map((r) => r.partner.slug)).not.toContain("latam-anchor");
	});

	it("reads a currency code only as a whole word (EUR, not EURC)", () => {
		// A LatAm anchor issuing EURC must not be gated to Europe by "eurc".
		const latamEurc = {
			...latamAnchor,
			slug: "latam-eurc",
			assets: [{ code: "EURC" }],
			tagline: "EURC off-ramp across Latin America",
		};
		const res = scorePartners("eurc off-ramp", [latamEurc], 10);
		expect(res.map((r) => r.partner.slug)).toContain("latam-eurc");
	});
});
