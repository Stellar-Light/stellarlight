/**
 * Engine A P-ATTR probe construction + grading (Q2 of the 2026-07-23 triage).
 *
 * The failing probe was `q=evm` demanding `band` in the top 10 of 91 matches.
 * Two defects, both pinned here:
 *   1. band uses the empty-types convention (`types: []` + `category:
 *      "Infrastructure"`), so `"<net> <types[0]>"` produced a BARE `q=evm` —
 *      a query about the CHAIN, not about band. The category fallback restores
 *      the discriminator the generator meant to use.
 *   2. "top-10" is recall when 12 records match and a ranking preference when
 *      91 do. The window scales with the population that actually matched.
 *
 * Neither relaxes recall: a record the attribute stops retrieving entirely
 * still fails.
 */
import { describe, expect, it } from "vitest";
import {
	ATTR_BASE_WINDOW,
	ATTR_MAX_WINDOW,
	attrWindow,
	gradeAttrProbe,
	networkProbeQuery,
	probeDiscriminator,
} from "../recall-probes";

// The three real records this was found on (live values, 2026-07-23).
const band = {
	slug: "band",
	types: [],
	category: "Infrastructure",
	supportedNetworks: ["stellar", "evm", "xrpl", "cosmos"],
};
const warpdrive = {
	slug: "warpdrive",
	types: ["Infrastructure"],
	category: "Tooling",
	supportedNetworks: ["stellar", "evm"],
};
const allbridge = {
	slug: "allbridge",
	types: ["Bridge"],
	category: "Infrastructure",
	supportedNetworks: ["stellar", "evm", "solana"],
};

describe("probeDiscriminator", () => {
	it("prefers types[0]", () => {
		expect(probeDiscriminator(warpdrive)).toBe("infrastructure");
		expect(probeDiscriminator(allbridge)).toBe("bridge");
	});

	it("falls back to category when types is empty (the Oracle convention)", () => {
		expect(probeDiscriminator(band)).toBe("infrastructure");
	});

	it("ignores blank type entries rather than emitting an empty token", () => {
		expect(
			probeDiscriminator({ slug: "x", types: ["", "  "], category: "Tooling" }),
		).toBe("tooling");
	});

	it("is empty only when the record carries neither", () => {
		expect(probeDiscriminator({ slug: "x", types: [], category: "" })).toBe("");
	});
});

describe("networkProbeQuery", () => {
	it("never emits a bare chain query — the q=evm regression", () => {
		expect(networkProbeQuery(band)).toBe("evm infrastructure");
		expect(networkProbeQuery(band)).not.toBe("evm");
	});

	it("skips the first network when it is stellar", () => {
		expect(networkProbeQuery(allbridge)).toBe("evm bridge");
	});

	it("returns null when there is no non-Stellar chain", () => {
		expect(
			networkProbeQuery({
				slug: "x",
				types: ["Wallet"],
				supportedNetworks: ["stellar"],
			}),
		).toBeNull();
	});

	it("returns null — not a bare chain — when no discriminator exists", () => {
		expect(
			networkProbeQuery({
				slug: "x",
				types: [],
				category: "",
				supportedNetworks: ["stellar", "evm"],
			}),
		).toBeNull();
	});
});

describe("attrWindow", () => {
	it("stays at the base window for uncrowded queries", () => {
		expect(attrWindow(4)).toBe(ATTR_BASE_WINDOW);
		expect(attrWindow(12)).toBe(ATTR_BASE_WINDOW);
	});

	it("grows with the matching population", () => {
		expect(attrWindow(91)).toBe(23); // the live q=evm population
		expect(attrWindow(64)).toBe(16); // the live q=evm infrastructure population
	});

	it("is capped, so the assertion keeps meaning something", () => {
		expect(attrWindow(10_000)).toBe(ATTR_MAX_WINDOW);
	});

	it("degrades safely on a missing/absurd count", () => {
		expect(attrWindow(0)).toBe(ATTR_BASE_WINDOW);
		expect(attrWindow(Number.NaN)).toBe(ATTR_BASE_WINDOW);
	});
});

describe("gradeAttrProbe", () => {
	const ranked = (n: number, at?: { slug: string; rank: number }) => {
		const out = Array.from({ length: n }, (_, i) => `filler-${i + 1}`);
		if (at) out[at.rank - 1] = at.slug;
		return out;
	};

	it("passes a record inside the scaled window of a crowded query", () => {
		// band at #19 of 91 — failed the old flat top-10, passes top-23.
		const r = gradeAttrProbe({
			slug: "band",
			impliers: new Set(["band"]),
			returned: ranked(50, { slug: "band", rank: 19 }),
			totalMatches: 91,
		});
		expect(r).toMatchObject({ ok: true, window: 23, mode: "record" });
	});

	it("still fails a record the attribute does not retrieve at all", () => {
		const r = gradeAttrProbe({
			slug: "band",
			impliers: new Set(["band"]),
			returned: ranked(50),
			totalMatches: 91,
		});
		expect(r.ok).toBe(false);
	});

	it("still fails a record ranked past even the scaled window", () => {
		const r = gradeAttrProbe({
			slug: "band",
			impliers: new Set(["band"]),
			returned: ranked(50, { slug: "band", rank: 40 }),
			totalMatches: 91,
		});
		expect(r.ok).toBe(false);
	});

	it("keeps the flat window for an uncrowded query", () => {
		const r = gradeAttrProbe({
			slug: "niche",
			impliers: new Set(["niche"]),
			returned: ranked(50, { slug: "niche", rank: 12 }),
			totalMatches: 12,
		});
		expect(r).toMatchObject({ ok: false, window: ATTR_BASE_WINDOW });
	});

	it("grades at set level when many records imply the same query", () => {
		const impliers = new Set(["a", "b", "c", "d", "e", "f"]);
		const r = gradeAttrProbe({
			slug: "a",
			impliers,
			returned: ["b", "c", "d", ...ranked(20)],
			totalMatches: 70,
		});
		// 'a' itself is absent, but the SET is well represented — the existing
		// crowded-bucket rule, unchanged.
		expect(r).toMatchObject({ ok: true, mode: "set" });
	});

	it("fails set-level grading when the set has all but vanished", () => {
		const impliers = new Set(["a", "b", "c", "d", "e", "f"]);
		const r = gradeAttrProbe({
			slug: "a",
			impliers,
			returned: ["b", ...ranked(20)],
			totalMatches: 70,
		});
		expect(r).toMatchObject({ ok: false, mode: "set" });
	});
});
