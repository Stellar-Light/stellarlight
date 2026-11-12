/** Lane DQ1 (2026-10-23): a Live row whose linked upstream protocol is dead
 * must not read as plainly Live, and a read that failed or never ran must
 * never read as a death. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_COMPACT } from "../compact-view";
import { factConfidence } from "../fact-confidence";
import { spec } from "../openapi-spec";
import { PROJECT_TYPES } from "../project-types";
import {
	CHECK_RESULTS,
	doublecountedOf,
	LLAMA_MAP,
	type LlamaTvlInput,
	llamaListingOf,
	llamaRowsFor,
	MIN_PROTOCOLS,
	MIN_STELLAR_PROTOCOLS,
	ONCHAIN_USE_TYPES,
	protocolListProblem,
	QUIET_DAYS,
	quietSinceFor,
	STATUS_CHECKS,
	statusChecksFor,
	stellarDoublecountedIds,
	stellarTvlOf,
	TVL_FLOOR_TYPES,
	TVL_FRESH_DAYS,
	tvlFieldsFor,
	tvlReadOf,
	tvlStaleOf,
	tvlUnavailableOf,
} from "../status-checks";

const NOW = new Date("2026-10-26T12:00:00.000Z");

// DefiLlama rows shaped as /protocols serves them (2026-10-23): the first
// three are Allbridge's real rows; the rest model the review's cases.
const PROTOCOLS = [
	{
		slug: "allbridge-core",
		deprecated: true,
		deadFrom: "2026-08-31",
		tvl: null,
		parentProtocol: "parent#allbridge",
	},
	{
		slug: "allbridge-next",
		deprecated: null,
		deadFrom: null,
		tvl: null,
		parentProtocol: "parent#allbridge",
	},
	{
		slug: "allbridge-classic",
		deprecated: null,
		deadFrom: null,
		tvl: 1_094_934,
		parentProtocol: "parent#allbridge",
	},
	{ slug: "blend-pools-v2", deprecated: null, deadFrom: null, tvl: 9 },
	{ slug: "old-v1", deprecated: true, deadFrom: "2025-01-15", tvl: null },
	{ slug: "old-v2", deprecated: true, deadFrom: "2026-02-01", tvl: null },
	// deprecated, no deadFrom, nothing locked, no family: a death
	{ slug: "quiet-exit", deprecated: true, deadFrom: null, tvl: 0 },
	// deprecated, no deadFrom, $35M still locked: a retired listing
	{ slug: "big-dex-v1", deprecated: true, deadFrom: null, tvl: 35_000_000 },
	// deprecated, no deadFrom, drained, but its family has a live listing
	{
		slug: "fam-v1",
		deprecated: true,
		deadFrom: null,
		tvl: 0,
		parentProtocol: "parent#fam",
	},
	{
		slug: "fam-v2",
		deprecated: null,
		deadFrom: null,
		tvl: 4_000,
		parentProtocol: "parent#fam",
	},
];

describe("llamaListingOf: DefiLlama's verdict on the mapped slugs", () => {
	it("a deprecated slug with deadFrom is deprecated, dated, whatever its family", () => {
		expect(llamaListingOf(["allbridge-core"], PROTOCOLS)).toEqual({
			state: "deprecated",
			deadFrom: "2026-08-31",
		});
	});
	it("deprecated with nothing locked and no live family listing is deprecated", () => {
		expect(llamaListingOf(["quiet-exit"], PROTOCOLS)).toEqual({
			state: "deprecated",
			deadFrom: null,
		});
	});
	it("deprecated with value still locked and no deadFrom is superseded, not dead", () => {
		expect(llamaListingOf(["big-dex-v1"], PROTOCOLS)).toEqual({
			state: "superseded",
			deadFrom: null,
		});
	});
	it("deprecated and drained while its family has a live listing is superseded", () => {
		expect(llamaListingOf(["fam-v1"], PROTOCOLS).state).toBe("superseded");
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
	it("a missing slug is never support for a death", () => {
		// soroswap: the mapped slug left the list on a rename (2026-10-23)
		expect(llamaListingOf(["soroswap"], PROTOCOLS)).toEqual({
			state: "not-found",
			deadFrom: null,
		});
		// one dead slug and one missing: the missing one may be the live one
		expect(llamaListingOf(["soroswap", "allbridge-core"], PROTOCOLS)).toEqual({
			state: "partial",
			deadFrom: null,
		});
	});
});

describe("stellarTvlOf: a missing TVL is null, never 0", () => {
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
});

// #1912 (2026-11-11): tvlFieldsFor reads each mapped slug from DefiLlama's
// FULL list. The Stellar-only list could not tell "listed with no Stellar
// figure" (DefiLlama's answer) from "not listed" (could not check), so Spiko
// and Etherfuse kept their 2026-09-14 figures for eight weeks.
describe("tvlFieldsFor: a figure, no figure (dated), or could not check", () => {
	const AT = "2026-11-11T22:47:04.000Z";
	const onStellar = (tvl: number | null, more: object = {}) => ({
		chains: ["Stellar"],
		tvl,
		...more,
	});
	it("every slug listed with a figure: the Stellar sum, no reason", () => {
		expect(
			tvlFieldsFor(["a", "b"], ["a", "b"], [onStellar(2.4), onStellar(1)], AT),
		).toEqual({ tvlUSD: 3, llamaSlugs: ["a", "b"], tvlUnavailable: null });
	});
	it("listed with no Stellar chain and no figure: tvlUSD null with a dated reason, never 0", () => {
		// spiko and etherfuse as /protocols served them on 2026-11-11
		const out = tvlFieldsFor(
			["spiko"],
			["spiko"],
			[{ chains: [], tvl: null, chainTvls: {} }],
			AT,
		);
		expect(out).toEqual({
			tvlUSD: null,
			llamaSlugs: ["spiko"],
			tvlUnavailable:
				"DefiLlama lists spiko but publishes no Stellar TVL figure for it (checked 2026-11-11).",
		});
	});
	it("a figure on other chains only is no Stellar figure, under the same slugs or not", () => {
		const curator = {
			chains: ["Ethereum", "Solana"],
			tvl: 2_780_582_444,
			chainTvls: { Ethereum: 1_533_086_219, Solana: 373_365_292 },
		};
		expect(tvlFieldsFor(["c"], ["c"], [curator], AT)?.tvlUSD).toBeNull();
		expect(tvlFieldsFor(["c"], ["c"], [curator], AT)?.tvlUnavailable).toMatch(
			/publishes no Stellar TVL figure for it \(checked 2026-11-11\)/,
		);
		// Beside a row on Stellar it is a partial sum, never the row's figure
		// (#1912 audit): could not check, so a moved mapping is cleared.
		expect(
			tvlFieldsFor(["c", "hub"], [], [curator, onStellar(80.4)], AT),
		).toEqual({
			tvlUSD: null,
			llamaSlugs: ["c", "hub"],
			tvlUnavailable:
				"No Stellar TVL could be read for c, hub: DefiLlama publishes a Stellar figure for only some of them (checked 2026-11-11).",
		});
	});
	it("one slug of a multi-slug row off Stellar keeps the stored sum, never the remainder (#1912 audit)", () => {
		// blend-pools-v2 leaving Stellar would have left blend-pools' $39,517
		// as Blend's whole figure.
		const blend = [
			onStellar(39_517, { chainTvls: { Stellar: 39_517 } }),
			{
				chains: ["Ethereum"],
				tvl: 115_000_000,
				chainTvls: { Ethereum: 115_000_000 },
			},
			onStellar(0, { chainTvls: { Stellar: 0 } }),
			onStellar(0, { chainTvls: { Stellar: 0 } }),
		];
		const slugs = ["a", "b", "c", "d"];
		expect(tvlReadOf(slugs, blend)).toEqual({ outcome: "partial" });
		expect(tvlFieldsFor(slugs, slugs, blend, AT)).toBeNull();
		// A retired slug without a figure is not a partial: it adds nothing.
		const retired = [
			onStellar(39_517),
			onStellar(null, { deprecated: true, deadFrom: "2026-01-01" }),
		];
		expect(tvlReadOf(["a", "b"], retired)).toEqual({
			outcome: "figure",
			tvlUSD: 39_517,
		});
		// No live slug carries a Stellar figure: DefiLlama's answer, dated.
		const none = [
			{ chains: [], tvl: null, chainTvls: {} },
			{ chains: [], tvl: null, chainTvls: {} },
		];
		expect(tvlReadOf(["a", "b"], none)).toEqual({ outcome: "no-figure" });
		expect(tvlFieldsFor(["a", "b"], ["a", "b"], none, AT)?.tvlUnavailable).toBe(
			"DefiLlama lists a, b but publishes no Stellar TVL figure for them (checked 2026-11-11).",
		);
	});
	it("a retired row without a figure is no figure: upstream stopped computing it", () => {
		expect(
			tvlFieldsFor(
				["allbridge-core"],
				["allbridge-core"],
				[onStellar(null, { deprecated: true, deadFrom: "2026-08-31" })],
				AT,
			),
		).toEqual({
			tvlUSD: null,
			llamaSlugs: ["allbridge-core"],
			tvlUnavailable:
				"DefiLlama lists allbridge-core but publishes no Stellar TVL figure for it (checked 2026-11-11).",
		});
	});
	it("a slug missing from the list under the same slugs: could not check, the stored fields stay", () => {
		// sentora from 2026-08-17 and templar-protocol on 2026-11-09
		expect(tvlFieldsFor(["sentora"], ["sentora"], [], AT)).toBeNull();
		// One of several missing: the rest is not the whole sum.
		expect(tvlFieldsFor(["x", "y"], ["x", "y"], [onStellar(5)], AT)).toBeNull();
	});
	it("a live row on Stellar without a figure under the same slugs keeps the stored TVL (a one-run gap)", () => {
		expect(tvlFieldsFor(["x"], ["x"], [onStellar(null)], AT)).toBeNull();
		expect(
			tvlFieldsFor(["x", "y"], ["x", "y"], [onStellar(5), onStellar(null)], AT),
		).toBeNull();
	});
	it("could not check under moved slugs: the old mapping's figure is cleared, with why", () => {
		expect(tvlFieldsFor(["new"], ["old"], [onStellar(null)], AT)).toEqual({
			tvlUSD: null,
			llamaSlugs: ["new"],
			tvlUnavailable:
				"No Stellar TVL could be read for new: a live listing on Stellar came back without a figure this run (checked 2026-11-11).",
		});
		expect(tvlFieldsFor(["gone"], ["old"], [], AT)).toEqual({
			tvlUSD: null,
			llamaSlugs: ["gone"],
			tvlUnavailable:
				"No Stellar TVL could be read for gone: DefiLlama's protocol list does not hold it (checked 2026-11-11).",
		});
	});
	it("a listed slug with no chain under moved slugs is DefiLlama's answer, dated", () => {
		expect(
			tvlFieldsFor(
				["allbridge-next"],
				["allbridge-core"],
				[{ chains: [], tvl: null, chainTvls: {} }],
				AT,
			),
		).toEqual({
			tvlUSD: null,
			llamaSlugs: ["allbridge-next"],
			tvlUnavailable:
				"DefiLlama lists allbridge-next but publishes no Stellar TVL figure for it (checked 2026-11-11).",
		});
	});
	it("tvlUnavailableOf serves the reason only while there is no figure", () => {
		const why =
			"DefiLlama lists spiko but publishes no Stellar TVL figure for it (checked 2026-11-11).";
		expect(tvlUnavailableOf({ tvlUSD: null, tvlUnavailable: why })).toBe(why);
		expect(tvlUnavailableOf({ tvlUnavailable: why })).toBe(why);
		expect(tvlUnavailableOf({ tvlUSD: 0, tvlUnavailable: why })).toBeNull();
		expect(tvlUnavailableOf({ tvlUSD: null, tvlUnavailable: "" })).toBeNull();
		expect(tvlUnavailableOf({ tvlUSD: null })).toBeNull();
	});
});

// The plan the enrich-tvl dry run makes for the #1912 rows, from DefiLlama's
// /protocols list as read 2026-11-11T22:47Z (each row trimmed to the fields
// read; templar-lending's chainTvls to two of its chains). Neither sentora nor
// templar-protocol is in that list: both are parent pages now.
const LIST_2026_11_11: (LlamaTvlInput & { slug: string })[] = [
	{ slug: "spiko", chains: [], tvl: null, chainTvls: {} },
	{ slug: "etherfuse", chains: [], tvl: null, chainTvls: {} },
	{ slug: "allbridge-next", chains: [], tvl: null, chainTvls: {} },
	{
		slug: "stellar-defi-hub",
		chains: ["Stellar"],
		tvl: 80769055.05454363,
		chainTvls: { Stellar: 80769055.05454363 },
	},
	{
		slug: "sentora-curator",
		chains: ["Ethereum", "Ink", "Solana", "Tempo"],
		tvl: 2780582444.3555136,
		chainTvls: {
			Ink: 806246893.089237,
			Solana: 373365292.02340823,
			Tempo: 67884039.67833374,
			Ethereum: 1533086219.564535,
		},
	},
	{
		slug: "templar-lending",
		chains: ["Stellar", "Ethereum"],
		tvl: 28587875.175082993,
		chainTvls: { Stellar: 11589629.090683961, Ethereum: 10614249.017921638 },
	},
	{
		slug: "templar-precept",
		chains: ["Stellar"],
		tvl: 38.573055980964,
		chainTvls: { Stellar: 38.573055980964 },
	},
];
describe("LLAMA_MAP follows DefiLlama's current identities (#1912)", () => {
	const AT = "2026-11-11T22:47:04.000Z";
	const plan = (row: string, storedSlugs: string[]) => {
		const slugs = LLAMA_MAP[row];
		const listed = slugs.flatMap((s) =>
			LIST_2026_11_11.filter((p) => p.slug === s),
		);
		return tvlFieldsFor(slugs, storedSlugs, listed, AT);
	};
	it("sentora reads stellar-defi-hub, the Stellar vaults it curates: a fresh figure", () => {
		expect(plan("sentora", ["sentora"])).toEqual({
			tvlUSD: 80769055,
			llamaSlugs: ["stellar-defi-hub"],
			tvlUnavailable: null,
		});
	});
	it("templar-protocol reads templar-lending, its renamed listing", () => {
		expect(plan("templar-protocol", ["templar-protocol"])).toEqual({
			tvlUSD: 11589629,
			llamaSlugs: ["templar-lending"],
			tvlUnavailable: null,
		});
	});
	it("spiko, etherfuse and allbridge carry no figure and a dated reason", () => {
		for (const [row, slug] of [
			["spiko", "spiko"],
			["etherfuse", "etherfuse"],
			["allbridge", "allbridge-next"],
		])
			expect(plan(row, [slug]), row).toEqual({
				tvlUSD: null,
				llamaSlugs: [slug],
				tvlUnavailable: `DefiLlama lists ${slug} but publishes no Stellar TVL figure for it (checked 2026-11-11).`,
			});
	});
	it("one DefiLlama slug belongs to one row: none is summed twice", () => {
		const slugs = Object.values(LLAMA_MAP).flat();
		expect(slugs.length).toBeGreaterThan(20);
		expect(new Set(slugs).size).toBe(slugs.length);
		// The directory's own stellar-defi-hub row stays unlinked (see the map).
		expect(LLAMA_MAP).not.toHaveProperty("stellar-defi-hub");
	});
});

// #1912 audit (2026-11-11): what the lane reads from DefiLlama's lists
// before it writes anything.
describe("DefiLlama's lists: a degraded answer, a CEX slug and double counts (#1912 audit)", () => {
	// A /protocols body the size of the real one (9,004 rows on 2026-11-11):
	// 35 Stellar rows, the rest elsewhere.
	const list = (blankChains: boolean) =>
		Array.from({ length: MIN_PROTOCOLS + 50 }, (_, i) => ({
			id: String(i),
			slug: `p${i}`,
			category: "Dexs",
			chains: blankChains ? [] : i < 35 ? ["Stellar"] : ["Ethereum"],
			tvl: blankChains ? null : 1000,
			chainTvls: blankChains ? {} : { [i < 35 ? "Stellar" : "Ethereum"]: 1000 },
		}));
	it("a well-formed list with its chains blank is no list: nothing is written", () => {
		expect(protocolListProblem(list(false))).toBeNull();
		// The audit's shape: 200, at least 1,000 rows, every chain list empty
		// and every tvl null. It read all 21 mapped rows as "no Stellar
		// figure" and cleared them, green.
		expect(protocolListProblem(list(true))).toMatch(
			/0 Stellar protocols \(< 20/,
		);
		expect(MIN_STELLAR_PROTOCOLS).toBe(20);
		expect(protocolListProblem(list(false).slice(0, 999))).toMatch(/999/);
		// Chains intact but every Stellar figure $0 or missing (#1912 audit
		// re-check): no reading, so no $0 is written over a mapped row.
		const zeros = list(false).map((p, i) =>
			i < 35 ? { ...p, tvl: 0, chainTvls: { Stellar: 0 } } : p,
		);
		expect(protocolListProblem(zeros)).toMatch(/no Stellar figure above \$0/);
		const nulls = list(false).map((p, i) =>
			i < 35 ? { ...p, tvl: null, chainTvls: {} } : p,
		);
		expect(protocolListProblem(nulls)).toMatch(/no Stellar figure above \$0/);
		expect(protocolListProblem({ error: "down" })).toMatch(/no protocols/);
		// The run reads the guard before it opens the store.
		const script = readFileSync(
			join(process.cwd(), "scripts/enrich-tvl.ts"),
			"utf8",
		);
		const guard = script.indexOf("protocolListProblem(all)");
		expect(guard).toBeGreaterThan(0);
		expect(guard).toBeLessThan(script.indexOf("getPayload({"));
	});
	it("a CEX listing is never a mapped row's TVL", () => {
		const rows = [
			{ slug: "dex", category: "Dexs" },
			{ slug: "exchange", category: "CEX" },
		];
		expect(llamaRowsFor(["exchange", "dex"], rows)).toEqual({
			listed: [{ slug: "dex", category: "Dexs" }],
			missing: ["exchange"],
		});
	});
	it("DefiLlama's own double-count verdict on Stellar is read from its lite list", () => {
		const lite = (blank: boolean) => ({
			protocols: Array.from({ length: MIN_PROTOCOLS }, (_, i) => ({
				defillamaId: String(i),
				chainTvls: blank
					? {}
					: i < 30
						? {
								Stellar: { tvl: 5 },
								...(i < 2 ? { "Stellar-doublecounted": { tvl: 5 } } : {}),
							}
						: { Ethereum: { tvl: 5 } },
			})),
		});
		expect(stellarDoublecountedIds(lite(false))).toEqual(new Set(["0", "1"]));
		// A blank or short list is no verdict: each row keeps its own.
		expect(stellarDoublecountedIds(lite(true))).toBeNull();
		expect(stellarDoublecountedIds({ protocols: [] })).toBeNull();
		// Stellar rows with no double-count key at all left the keys out: no
		// verdict, so the stored ones stay (#1912 audit re-check).
		const keyless = lite(false);
		for (const p of keyless.protocols)
			delete (p.chainTvls as Record<string, unknown>)["Stellar-doublecounted"];
		expect(stellarDoublecountedIds(keyless)).toBeNull();
		// With the keys present on other chains, no Stellar key is DefiLlama
		// saying nothing on Stellar is double counted: every verdict clears,
		// so a flag cannot outlive DefiLlama's own.
		const clear = lite(false);
		for (const p of clear.protocols) {
			const c = p.chainTvls as Record<string, unknown>;
			delete c["Stellar-doublecounted"];
			if (c.Ethereum) c["Ethereum-doublecounted"] = { tvl: 5 };
		}
		expect(stellarDoublecountedIds(clear)).toEqual(new Set());
		const ids = new Set(["8425"]);
		expect(doublecountedOf([{ id: "8425" }], [], ids, false)).toBe(true);
		expect(doublecountedOf([{ id: "6122" }], [], ids, true)).toBe(false);
		expect(doublecountedOf([{ id: "8425" }], [], null, false)).toBe(false);
		expect(doublecountedOf([], ["gone"], ids, true)).toBe(true);
		expect(doublecountedOf([], ["gone"], ids, undefined)).toBeNull();
	});
});

// #1912: the stored figure stays when no row resolves (above), so a served
// reading can sit for weeks under "refreshed weekly": Sentora since 08-10.
describe("tvlStaleOf: a reading past the weekly refresh says so", () => {
	const ago = (days: number) =>
		new Date(NOW.getTime() - days * 86_400_000).toISOString();
	it("fresh up to TVL_FRESH_DAYS, stale past it or undated, null with no reading", () => {
		expect(tvlStaleOf(5, ago(TVL_FRESH_DAYS), NOW)).toBe(false);
		expect(tvlStaleOf(5, ago(TVL_FRESH_DAYS + 1), NOW)).toBe(true);
		// A reading of 0 is a reading; its age still decides.
		expect(tvlStaleOf(0, ago(1), NOW)).toBe(false);
		expect(tvlStaleOf(5, null, NOW)).toBe(true);
		expect(tvlStaleOf(5, "not a date", NOW)).toBe(true);
		expect(tvlStaleOf(null, ago(1), NOW)).toBeNull();
		// Semantic rows come from a raw aggregate, where the date is a Date.
		expect(tvlStaleOf(5, new Date(ago(1)), NOW)).toBe(false);
	});
	it("a future or unparseable date is never fresh (review 2026-11-04)", () => {
		expect(tvlStaleOf(5, "2099-01-01T00:00:00.000Z", NOW)).toBe(true);
		expect(tvlStaleOf(5, new Date(NOW.getTime() + 86_400_000), NOW)).toBe(true);
		expect(tvlStaleOf(5, new Date("nope"), NOW)).toBe(true);
		expect(tvlStaleOf(5, "", NOW)).toBe(true);
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

	it("the review's case: a Live DEX, deprecated without deadFrom, $35M locked, is not caveated", () => {
		const out = statusChecksFor(
			{
				status: "Live",
				statusBasis: "onchain-activity",
				statusAsOf: "2026-10-20",
				types: ["DEX"],
				tvlUSD: 35_000_000,
				tvlAsOf: "2026-10-26T05:00:00.000Z",
				llamaSlugs: ["big-dex-v1"],
				llamaListing: {
					...llamaListingOf(["big-dex-v1"], PROTOCOLS),
					checkedAt: "2026-10-26T05:00:00.000Z",
				},
			},
			NOW,
		);
		expect(byCheck(out, "defillama-listing")?.result).toBe("could-not-check");
		expect(byCheck(out, "defillama-listing")?.detail).toMatch(
			/superseded|retired/,
		);
		expect(byCheck(out, "tvl-zero-onchain-quiet")?.result).toBe("clear");
		expect(out.statusCaveat).toBeNull();
	});

	it("a partial listing (one slug missing) could not be checked", () => {
		const out = statusChecksFor(
			{
				...allbridge,
				llamaListing: {
					state: "partial",
					deadFrom: null,
					checkedAt: "2026-10-26",
				},
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
	it("a TVL reading older than 14 days could not be checked, 0 or not", () => {
		const quiet = {
			...listed,
			onchain: { ...listed.onchain, quietSince: "2026-08-20T00:00:00.000Z" },
		};
		const stale = statusChecksFor({ ...quiet, tvlAsOf: "2026-10-01" }, NOW);
		expect(byCheck(stale, "tvl-zero-onchain-quiet")?.result).toBe(
			"could-not-check",
		);
		expect(stale.statusCaveat).toBeNull();
		expect(
			byCheck(
				statusChecksFor(
					{ ...listed, tvlUSD: 1200, tvlAsOf: "2026-10-01" },
					NOW,
				),
				"tvl-zero-onchain-quiet",
			)?.result,
		).toBe("could-not-check");
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
	it("enrich-onchain reads quietSince back after it writes it", () => {
		const script = readFileSync(
			join(process.cwd(), "scripts/data/enrich-onchain-projects.ts"),
			"utf8",
		);
		expect(script).toMatch(/diffWritten\([^;]*"quietSince"/s);
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
	it("every TVL row serves tvlStale from the one helper, and the spec declares it", () => {
		const builders = (route.match(/\.\.\.statusChecksFor\(\w+\)/g) ?? [])
			.length;
		const stale = /tvlStale: tvlStaleOf\((\w+)\.tvlUSD, \1\.tvlAsOf\)/g;
		expect((route.match(stale) ?? []).length).toBe(builders);
		const board = readFileSync(
			join(process.cwd(), "src/app/api/leaderboard/route.ts"),
			"utf8",
		);
		expect((board.match(stale) ?? []).length).toBe(1);
		expect(PROJECT_COMPACT.keep).toHaveProperty("tvlStale", true);
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const s: any = spec;
		for (const name of ["Project", "LeaderboardProject"]) {
			const f = s.components.schemas[name].properties.tvlStale;
			expect(f).toMatchObject({ type: "boolean", nullable: true });
		}
	});
	it("every TVL row serves tvlUnavailable from the one helper, and the spec declares it (#1912)", () => {
		const builders = (route.match(/\.\.\.statusChecksFor\(\w+\)/g) ?? [])
			.length;
		const why = /tvlUnavailable: tvlUnavailableOf\(\w+\)/g;
		expect((route.match(why) ?? []).length).toBe(builders);
		// the semantic rows' $project (the F3 projection class)
		expect(route).toMatch(/tvlUnavailable: 1/);
		const board = readFileSync(
			join(process.cwd(), "src/app/api/leaderboard/route.ts"),
			"utf8",
		);
		expect((board.match(why) ?? []).length).toBe(1);
		expect(board).toMatch(/tvlUnavailable: true/);
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const s: any = spec;
		for (const name of ["Project", "LeaderboardProject"]) {
			const f = s.components.schemas[name].properties.tvlUnavailable;
			expect(f).toMatchObject({ type: "string", nullable: true });
		}
	});
	it("enrich-tvl reads tvlUnavailable back, and never reports a missing figure as $0 (#1912)", () => {
		const script = readFileSync(
			join(process.cwd(), "scripts/enrich-tvl.ts"),
			"utf8",
		);
		expect(script).toMatch(/VERIFIED_FIELDS = \[[^\]]*"tvlUnavailable"/s);
		// The liveness report read stellarTvlOf(...) ?? 0 and printed "TVL $0"
		// for Spiko, Etherfuse and Sentora.
		expect(script).not.toMatch(/\) \?\? 0;/);
	});
});

// Review 2026-10-31 (another model family), each case reproduced first.
describe("statusChecksFor: what a reading must hold before it decides", () => {
	// A Live DEX, listed on DefiLlama, $0 TVL this week, quiet since August.
	const dex = {
		status: "Live",
		statusBasis: "human-verified",
		statusAsOf: "2026-09-05T00:00:00.000Z",
		types: ["DEX"],
		tvlUSD: 0,
		tvlAsOf: "2026-10-25T00:00:00.000Z",
		llamaSlugs: ["x"],
		llamaListing: { state: "listed", checkedAt: "2026-10-26T00:00:00.000Z" },
		onchain: {
			asOf: "2026-10-26T00:00:00.000Z",
			quietSince: "2026-08-01T00:00:00.000Z",
			contracts: [{ eventsDelta: 0, subinvocationsDelta: 0 }],
		},
	};
	const tvl = (row: object) =>
		byCheck(statusChecksFor(row, NOW), "tvl-zero-onchain-quiet");

	it("control: both counters silent for 60 days with $0 TVL is a hit", () => {
		expect(tvl(dex)?.result).toBe("hit");
	});

	it("a contract with one counter read is not quiet: the other may have moved", () => {
		const one = {
			...dex,
			onchain: { ...dex.onchain, contracts: [{ eventsDelta: 0 }] },
		};
		expect(tvl(one)?.result).toBe("could-not-check");
		expect(
			quietSinceFor([{ eventsDelta: 0 }], {
				asOf: "2026-10-19T00:00:00.000Z",
				quietSince: "2026-08-01T00:00:00.000Z",
			}),
		).toBeNull();
	});

	it("an unparseable reading date is no window, never a hit", () => {
		const bad = { ...dex, onchain: { ...dex.onchain, asOf: "not-a-date" } };
		expect(tvl(bad)?.result).toBe("could-not-check");
		expect(tvl(bad)?.detail).not.toMatch(/NaN/);
	});

	it("a negative TVL is not a reading of $0", () => {
		expect(tvl({ ...dex, tvlUSD: -5 })?.result).toBe("could-not-check");
	});

	it("$0 over a listing with a slug DefiLlama no longer lists decides nothing", () => {
		const partial = {
			...dex,
			llamaListing: { ...dex.llamaListing, state: "partial" },
		};
		expect(tvl(partial)?.result).toBe("could-not-check");
	});

	it("reads dates handed as Date objects, as the semantic search rows hand them", () => {
		const raw = {
			...allbridge,
			tvlAsOf: new Date(allbridge.tvlAsOf),
			llamaListing: {
				...allbridge.llamaListing,
				checkedAt: new Date(allbridge.llamaListing.checkedAt),
			},
			onchain: {
				...allbridge.onchain,
				asOf: new Date(allbridge.onchain.asOf),
				prevAsOf: new Date(allbridge.onchain.prevAsOf),
			},
		};
		const out = statusChecksFor(raw, NOW);
		expect(out).toEqual(statusChecksFor(allbridge, NOW));
		expect(byCheck(out, "defillama-listing")?.result).toBe("hit");
	});

	it("a per-chain breakdown without Stellar is no Stellar TVL", () => {
		expect(
			stellarTvlOf([{ chainTvls: { Ethereum: 2_000_000 }, tvl: 2_000_000 }]),
		).toBeNull();
		// No breakdown at all: the total stands, as before.
		expect(stellarTvlOf([{ tvl: 7 }])).toBe(7);
	});
});

describe("Derivatives rows are held to the on-chain checks (sls-113, 2026-11-07)", () => {
	// A perpetuals or rate-swap protocol IS on-chain use, as a DEX is: Zenex's
	// XLM-USD market contract emits its orders and liquidations on mainnet.
	it("TVL 0 and 60+ days of contract silence caveat a Derivatives row as they do a DEX", () => {
		const out = statusChecksFor(
			{
				...allbridge,
				types: ["Derivatives"],
				llamaListing: {
					state: "listed",
					deadFrom: null,
					checkedAt: "2026-10-26",
				},
				onchain: {
					...allbridge.onchain,
					quietSince: "2026-08-20T00:00:00.000Z",
				},
			},
			NOW,
		);
		expect(byCheck(out, "tvl-zero-onchain-quiet")?.result).toBe("hit");
	});
	it("the spec names every type the TVL check covers, Derivatives among them", () => {
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const d: string = (spec as any).components.schemas.Project.properties
			.statusChecks.description;
		expect(d).toMatch(/only for [^:]*\bDerivatives\b[^:]* rows:/);
		for (const t of ONCHAIN_USE_TYPES) expect(d, t).toContain(t);
	});
	it("the liveness report's TVL floor covers Derivatives, and holds only real types", () => {
		expect(TVL_FLOOR_TYPES as readonly string[]).toContain("Derivatives");
		for (const t of TVL_FLOOR_TYPES)
			expect(PROJECT_TYPES as readonly string[], t).toContain(t);
	});
});
