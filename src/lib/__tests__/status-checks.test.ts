/** Lane DQ1 (2026-10-23): a Live row whose linked upstream protocol is dead
 * must not read as plainly Live, and a read that failed or never ran must
 * never read as a death. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { factConfidence } from "../fact-confidence";
import { spec } from "../openapi-spec";
import {
	CHECK_RESULTS,
	llamaListingOf,
	QUIET_DAYS,
	quietSinceFor,
	STATUS_CHECKS,
	statusChecksFor,
	stellarTvlOf,
	tvlFieldsFor,
} from "../status-checks";

const NOW = new Date("2026-10-26T12:00:00.000Z");

// DefiLlama's own rows as /protocols served them on 2026-10-23.
const PROTOCOLS = [
	{ slug: "allbridge-core", deprecated: true, deadFrom: "2026-08-31" },
	{ slug: "allbridge-next", deprecated: null, deadFrom: null },
	{ slug: "blend-pools", deprecated: null, deadFrom: null },
	{ slug: "blend-pools-v2", deprecated: null, deadFrom: null },
	{ slug: "old-v1", deprecated: true, deadFrom: "2025-01-15" },
	{ slug: "old-v2", deprecated: true, deadFrom: "2026-02-01" },
	{ slug: "quiet-exit", deprecated: true, deadFrom: null },
];

describe("llamaListingOf: DefiLlama's verdict on the mapped slugs", () => {
	it("a deprecated slug with deadFrom is deprecated, dated", () => {
		expect(llamaListingOf(["allbridge-core"], PROTOCOLS)).toEqual({
			state: "deprecated",
			deadFrom: "2026-08-31",
		});
	});
	it("deprecated without a deadFrom is still deprecated", () => {
		expect(llamaListingOf(["quiet-exit"], PROTOCOLS)).toEqual({
			state: "deprecated",
			deadFrom: null,
		});
	});
	it("a listed slug is listed", () => {
		expect(llamaListingOf(["allbridge-next"], PROTOCOLS).state).toBe("listed");
	});
	it("one live slug among dead ones keeps the project listed", () => {
		expect(llamaListingOf(["old-v1", "blend-pools-v2"], PROTOCOLS)).toEqual({
			state: "listed",
			deadFrom: null,
		});
	});
	it("every slug dead: deprecated from the latest deadFrom", () => {
		expect(llamaListingOf(["old-v1", "old-v2"], PROTOCOLS)).toEqual({
			state: "deprecated",
			deadFrom: "2026-02-01",
		});
	});
	it("a slug missing from the list is not-found, never deprecated", () => {
		// soroswap: the mapped slug left the list on a rename (2026-10-23)
		expect(llamaListingOf(["soroswap"], PROTOCOLS)).toEqual({
			state: "not-found",
			deadFrom: null,
		});
		expect(
			llamaListingOf(["soroswap", "allbridge-core"], PROTOCOLS).state,
		).toBe("deprecated");
	});
});

describe("stellarTvlOf and tvlFieldsFor: a missing TVL is null, never 0", () => {
	it("prefers the Stellar slice, then the protocol total", () => {
		expect(stellarTvlOf([{ chainTvls: { Stellar: 5 }, tvl: 900 }])).toBe(5);
		expect(stellarTvlOf([{ tvl: 7 }])).toBe(7);
		expect(stellarTvlOf([{ tvl: 0 }])).toBe(0);
	});
	it("a deprecated protocol's null TVL stays null", () => {
		// allbridge-core on 2026-10-23: tvl null, no Stellar slice. The lane
		// wrote 0 for this, a figure DefiLlama never published.
		expect(stellarTvlOf([{ tvl: null, chainTvls: {} }])).toBeNull();
		expect(stellarTvlOf([{ tvl: null }, { tvl: 3 }])).toBe(3);
	});
	it("a resolved mapping writes its TVL and slugs", () => {
		expect(
			tvlFieldsFor(["a", "b"], ["a", "b"], [{ tvl: 2.4 }, { tvl: 1 }]),
		).toEqual({ tvlUSD: 3, llamaSlugs: ["a", "b"] });
	});
	it("no Stellar row under the same slugs: the stored TVL stays", () => {
		expect(tvlFieldsFor(["soroswap"], ["soroswap"], [])).toBeNull();
	});
	it("no Stellar row under moved slugs: the old figure is cleared", () => {
		expect(tvlFieldsFor(["allbridge-next"], ["allbridge-core"], [])).toEqual({
			tvlUSD: null,
			llamaSlugs: ["allbridge-next"],
		});
	});
});

describe("quietSinceFor: silence is only what two readings showed", () => {
	const quiet = [{ eventsDelta: 0, subinvocationsDelta: 0 }];
	it("a contract that moved ends the quiet run", () => {
		expect(
			quietSinceFor([{ eventsDelta: 3, subinvocationsDelta: 0 }], {
				asOf: "2026-10-20",
				quietSince: "2026-08-01",
			}),
		).toBeNull();
	});
	it("no prior reading: nothing is known", () => {
		expect(quietSinceFor(quiet, null)).toBeNull();
	});
	it("a contract never measured leaves the run unknown", () => {
		expect(
			quietSinceFor(
				[...quiet, { eventsDelta: null, subinvocationsDelta: null }],
				{
					asOf: "2026-10-20",
				},
			),
		).toBeNull();
	});
	it("a quiet window after a quiet window reaches back to its start", () => {
		expect(
			quietSinceFor(quiet, {
				asOf: "2026-10-20",
				prevAsOf: "2026-10-13",
				contracts: quiet,
			}),
		).toBe("2026-10-13");
	});
	it("a quiet window after an active one starts at the prior reading", () => {
		expect(
			quietSinceFor(quiet, {
				asOf: "2026-10-20",
				prevAsOf: "2026-10-13",
				contracts: [{ eventsDelta: 9, subinvocationsDelta: 0 }],
			}),
		).toBe("2026-10-20");
	});
	it("a stored quietSince carries forward", () => {
		expect(
			quietSinceFor(quiet, { asOf: "2026-10-20", quietSince: "2026-07-01" }),
		).toBe("2026-07-01");
	});
});

// The Allbridge row as served on 1.9.101, plus the listing the enrich-tvl
// lane writes for allbridge-core.
const allbridge = {
	status: "Live",
	statusBasis: "human-verified",
	statusAsOf: "2026-09-05T00:00:00.000Z",
	types: ["Bridge"],
	tvlUSD: 0,
	tvlAsOf: "2026-10-19T10:38:57.354Z",
	llamaSlugs: ["allbridge-core"],
	llamaListing: {
		state: "deprecated",
		deadFrom: "2026-08-31",
		checkedAt: "2026-10-26T05:00:00.000Z",
	},
	onchain: {
		asOf: "2026-10-20T11:18:39.690Z",
		prevAsOf: "2026-10-13T13:59:10.392Z",
		contracts: [
			{ eventsDelta: 0, subinvocationsDelta: 0 },
			{ eventsDelta: 0, subinvocationsDelta: 0 },
		],
	},
};

const byCheck = (r: ReturnType<typeof statusChecksFor>, check: string) =>
	r.statusChecks?.find((c) => c.check === check);

describe("statusChecksFor: the guard on served status", () => {
	it("a row with no DefiLlama link is exactly as before", () => {
		const row = {
			status: "Live",
			statusBasis: "site-liveness",
			statusAsOf: "2026-10-01",
			types: ["Wallet"],
		};
		const out = statusChecksFor(row, NOW);
		expect(Object.keys(out)).toEqual(["statusConfidence"]);
		expect(out.statusConfidence).toEqual(
			factConfidence("site-liveness", "2026-10-01", NOW),
		);
		expect(
			Object.keys(statusChecksFor({ ...row, llamaSlugs: [] }, NOW)),
		).toEqual(["statusConfidence"]);
	});

	it("Allbridge: a deprecated DefiLlama slug caveats the Live label and halves its confidence", () => {
		const out = statusChecksFor(allbridge, NOW);
		expect(byCheck(out, "defillama-listing")).toMatchObject({
			result: "hit",
			asOf: "2026-10-26",
			sourceUrl: "https://defillama.com/protocol/allbridge-core",
		});
		expect(out.statusCaveat).toMatch(/allbridge-core deprecated/);
		expect(out.statusCaveat).toMatch(/2026-08-31/);
		expect(out.statusCaveat).toMatch(/^Live on record, but /);
		// 0.9 high (human-verified, 51 days) halves to 0.45 low
		expect(out.statusConfidence).toEqual({
			score: 0.45,
			label: "low",
			ageDays: 51,
		});
	});

	it("TVL 0 with only a week of observed silence could not be checked", () => {
		const out = statusChecksFor(allbridge, NOW);
		expect(byCheck(out, "tvl-zero-onchain-quiet")).toMatchObject({
			result: "could-not-check",
		});
		expect(byCheck(out, "tvl-zero-onchain-quiet")?.detail).toMatch(
			/2026-10-13/,
		);
	});

	it("no listing stored yet: could not check, no caveat, confidence unchanged", () => {
		const { llamaListing: _, ...noListing } = allbridge;
		const out = statusChecksFor(noListing, NOW);
		expect(byCheck(out, "defillama-listing")?.result).toBe("could-not-check");
		expect(out.statusCaveat).toBeNull();
		expect(out.statusConfidence).toEqual(
			factConfidence("human-verified", allbridge.statusAsOf, NOW),
		);
	});

	it("a slug not found upstream could not be checked: a rename is not a death", () => {
		const out = statusChecksFor(
			{
				...allbridge,
				llamaListing: { ...allbridge.llamaListing, state: "not-found" },
			},
			NOW,
		);
		expect(byCheck(out, "defillama-listing")?.result).toBe("could-not-check");
		expect(out.statusCaveat).toBeNull();
	});

	it("a listed slug is clear", () => {
		const out = statusChecksFor(
			{
				...allbridge,
				llamaListing: {
					state: "listed",
					deadFrom: null,
					checkedAt: "2026-10-26",
				},
			},
			NOW,
		);
		expect(byCheck(out, "defillama-listing")?.result).toBe("clear");
		expect(out.statusCaveat).toBeNull();
	});

	const listed = {
		...allbridge,
		llamaListing: { state: "listed", deadFrom: null, checkedAt: "2026-10-26" },
	};
	it(`TVL 0 and ${QUIET_DAYS}+ days of observed contract silence caveats an on-chain protocol`, () => {
		const out = statusChecksFor(
			{
				...listed,
				onchain: { ...listed.onchain, quietSince: "2026-08-20T00:00:00.000Z" },
			},
			NOW,
		);
		expect(byCheck(out, "tvl-zero-onchain-quiet")?.result).toBe("hit");
		expect(out.statusCaveat).toMatch(/TVL is \$0/);
		expect(out.statusCaveat).toMatch(/since 2026-08-20/);
		expect(out.statusConfidence?.label).toBe("low");
	});
	it("59 days of silence is not yet enough", () => {
		const out = statusChecksFor(
			{
				...listed,
				onchain: { ...listed.onchain, quietSince: "2026-08-22T00:00:00.000Z" },
			},
			NOW,
		);
		expect(byCheck(out, "tvl-zero-onchain-quiet")?.result).toBe(
			"could-not-check",
		);
		expect(out.statusCaveat).toBeNull();
	});
	it("a null TVL could not be checked; a positive TVL is clear", () => {
		expect(
			byCheck(
				statusChecksFor({ ...listed, tvlUSD: null }, NOW),
				"tvl-zero-onchain-quiet",
			)?.result,
		).toBe("could-not-check");
		expect(
			byCheck(
				statusChecksFor({ ...listed, tvlUSD: 1200 }, NOW),
				"tvl-zero-onchain-quiet",
			)?.result,
		).toBe("clear");
	});
	it("TVL 0 with contracts that moved is clear; with no contracts, could not check", () => {
		const moved = {
			...listed,
			onchain: {
				...listed.onchain,
				contracts: [
					{ eventsDelta: 0, subinvocationsDelta: 0 },
					{ eventsDelta: 4, subinvocationsDelta: 0 },
				],
			},
		};
		expect(
			byCheck(statusChecksFor(moved, NOW), "tvl-zero-onchain-quiet")?.result,
		).toBe("clear");
		expect(
			byCheck(
				statusChecksFor({ ...listed, onchain: null }, NOW),
				"tvl-zero-onchain-quiet",
			)?.result,
		).toBe("could-not-check");
	});
	it("the TVL check applies only to on-chain protocol types", () => {
		const out = statusChecksFor({ ...listed, types: ["RWA"] }, NOW);
		expect(byCheck(out, "tvl-zero-onchain-quiet")).toBeUndefined();
		expect(byCheck(out, "defillama-listing")).toBeDefined();
	});

	it("a non-Live row keeps its checks but gets no caveat and no confidence cut", () => {
		const out = statusChecksFor({ ...allbridge, status: "Inactive" }, NOW);
		expect(byCheck(out, "defillama-listing")?.result).toBe("hit");
		expect(out.statusCaveat).toBeNull();
		expect(out.statusConfidence).toEqual(
			factConfidence("human-verified", allbridge.statusAsOf, NOW),
		);
	});

	it("served text carries no em or en dashes", () => {
		const texts = [
			statusChecksFor(allbridge, NOW),
			statusChecksFor(
				{ ...listed, onchain: { ...listed.onchain, quietSince: "2026-08-01" } },
				NOW,
			),
			statusChecksFor({ ...listed, tvlUSD: null, llamaListing: null }, NOW),
		].flatMap((o) => [
			o.statusCaveat ?? "",
			...(o.statusChecks ?? []).map((c) => c.detail),
		]);
		// U+2013 and U+2014, written as escapes so this file carries neither
		const dashes = /[\u2013\u2014]/;
		for (const t of texts) expect(t).not.toMatch(dashes);
	});
});

describe("every serving point carries the guard, and the spec declares it", () => {
	const route = readFileSync(
		join(process.cwd(), "src/app/api/projects/search/route.ts"),
		"utf8",
	);
	it("no search row builder computes statusConfidence on its own", () => {
		expect(route).not.toMatch(/statusConfidence: factConfidence\(/);
		expect((route.match(/\.\.\.statusChecksFor\(\w+\)/g) ?? []).length).toBe(3);
	});
	it("the semantic projection reads the stored listing (the F3 projection class)", () => {
		expect(route).toMatch(/llamaListing: 1/);
	});
	it("the spec declares statusChecks and statusCaveat with the served enums", () => {
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const s: any = spec;
		const row = s.components.schemas.Project.properties;
		const item = row.statusChecks.items.properties;
		expect([...item.check.enum].sort()).toEqual([...STATUS_CHECKS].sort());
		expect([...item.result.enum].sort()).toEqual([...CHECK_RESULTS].sort());
		expect(row.statusCaveat.nullable).toBe(true);
		const kinds: string[] =
			s.paths["/api/verify"].get.responses["200"].content["application/json"]
				.schema.properties.evidence.items.properties.kind.enum;
		expect(kinds).toContain("status-check");
	});
});
