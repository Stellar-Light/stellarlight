// @vitest-environment node
// (mirror.ts imports ballot.ts, which pulls the Stellar SDK — see
// awards-ballot.test.ts for why that suite runs outside jsdom.)

/**
 * i³ Awards mirror — the DB copy as a tally source after a testnet reset.
 *
 * The invariant that matters: a tally rebuilt from the mirror is IDENTICAL to
 * the tally read from the chain for the same ballots. Everything else here
 * pins the reconcile diff so a class can't silently change meaning.
 */

import { describe, expect, it } from "vitest";
import {
	type BallotNominee,
	type BallotRound,
	type BallotSelections,
	dataKey,
	decodeAccountVotes,
	tallyRound,
} from "../awards/ballot";
import {
	type ChainProbe,
	mirrorAccountData,
	normalizeSelections,
	planReconcile,
	sameSelections,
	summarizeReconcile,
} from "../awards/mirror";

const round: BallotRound = {
	slug: "i3-2026-test",
	status: "closed",
	ballotMode: "one-per-category",
	categories: [
		{ key: "impact", name: "Impact", tagline: null },
		{ key: "innovation", name: "Innovation", tagline: null },
	],
	opensAt: null,
	closesAt: null,
};
const shortlist: BallotRound = {
	...round,
	slug: "i3-2026-shortlist",
	ballotMode: "multi-pick",
	picksPerCategory: 2,
};
const nominees: BallotNominee[] = [
	{ category: "impact", slug: "decaf", name: "Decaf" },
	{ category: "impact", slug: "beans", name: "Beans" },
	{ category: "innovation", slug: "blend", name: "Blend" },
	{ category: "innovation", slug: "reflector", name: "Reflector" },
];
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const funded = (data: Record<string, string>): ChainProbe["result"] => ({
	funded: true,
	account: { sequence: "1", data, signers: [] },
});

describe("mirrorAccountData", () => {
	it("round-trips a single-pick ballot through decodeAccountVotes", () => {
		const selections = { impact: ["decaf"], innovation: ["blend"] };
		const acct = mirrorAccountData(round, { address: "GA1", selections });
		expect(acct.data).toEqual({
			[dataKey(round.slug, "impact")]: b64("decaf"),
			[dataKey(round.slug, "innovation")]: b64("blend"),
		});
		expect(decodeAccountVotes(round, nominees, acct.data ?? {})).toEqual(
			selections,
		);
	});

	it("round-trips a multi-pick ballot into slots and drops picks past the cap", () => {
		const acct = mirrorAccountData(shortlist, {
			address: "GA1",
			selections: { impact: ["decaf", "beans", "ghost"] },
		});
		expect(acct.data).toEqual({
			[dataKey(shortlist.slug, "impact", 1)]: b64("decaf"),
			[dataKey(shortlist.slug, "impact", 2)]: b64("beans"),
		});
		expect(decodeAccountVotes(shortlist, nominees, acct.data ?? {})).toEqual({
			impact: ["decaf", "beans"],
		});
	});

	it("mirror-backed tally equals chain-backed tally for the same ballots", () => {
		const chain = [
			{
				address: "GA1",
				data: {
					[dataKey(round.slug, "impact")]: b64("decaf"),
					[dataKey(round.slug, "innovation")]: b64("blend"),
				},
			},
			{
				address: "GA2",
				data: { [dataKey(round.slug, "impact")]: b64("decaf") },
			},
			{
				address: "GA3",
				data: { [dataKey(round.slug, "impact")]: b64("beans") },
			},
			{ address: "GA4", data: {} },
			{ address: "GA5", data: null },
		];
		const mirror = new Map<string, BallotSelections>([
			["GA1", { impact: ["decaf"], innovation: ["blend"] }],
			["GA2", { impact: ["decaf"] }],
			["GA3", { impact: ["beans"] }],
		]);
		const rebuilt = chain.map(({ address }) => {
			const s = mirror.get(address);
			return s
				? mirrorAccountData(round, { address, selections: s })
				: { address, data: null };
		});
		expect(tallyRound(round, nominees, rebuilt)).toEqual(
			tallyRound(round, nominees, chain),
		);
	});
});

describe("normalizeSelections / sameSelections", () => {
	it("accepts the recorded array shape and the legacy single-slug shape", () => {
		expect(
			normalizeSelections({ impact: ["decaf", "decaf"], innovation: "blend" }),
		).toEqual({ impact: ["decaf"], innovation: ["blend"] });
	});

	it("drops junk rather than trusting the JSON column", () => {
		expect(normalizeSelections(null)).toEqual({});
		expect(normalizeSelections("decaf")).toEqual({});
		expect(normalizeSelections(["decaf"])).toEqual({});
		expect(
			normalizeSelections({ impact: [1, null, ""], innovation: 7, x: [] }),
		).toEqual({});
	});

	it("compares picks ignoring order and empty categories", () => {
		expect(
			sameSelections(
				{ impact: ["beans", "decaf"], innovation: [] },
				{ impact: ["decaf", "beans"] },
			),
		).toBe(true);
		expect(sameSelections({ impact: ["decaf"] }, { impact: ["beans"] })).toBe(
			false,
		);
		expect(
			sameSelections(
				{ impact: ["decaf"] },
				{ impact: ["decaf"], innovation: ["blend"] },
			),
		).toBe(false);
	});
});

describe("planReconcile", () => {
	const impact = (slug: string) => ({
		[dataKey(round.slug, "impact")]: b64(slug),
	});

	it("classifies every address into exactly one explicit class", () => {
		const probes: ChainProbe[] = [
			{ address: "G-CREATE", result: funded(impact("decaf")) },
			{ address: "G-UPDATE", result: funded(impact("beans")) },
			{ address: "G-OK", result: funded(impact("decaf")) },
			{ address: "G-NOVOTE", result: funded({}) },
			{ address: "G-CHAINEMPTY", result: funded({}) },
			{ address: "G-MERGED", result: { funded: false } },
			{ address: "G-UNFUNDED", result: { funded: false } },
			{
				address: "G-DOWN",
				result: { funded: null, error: "Horizon responded 503" },
			},
		];
		const mirror = new Map<string, BallotSelections>([
			["G-UPDATE", { impact: ["decaf"] }],
			["G-OK", { impact: ["decaf"] }],
			["G-CHAINEMPTY", { impact: ["decaf"] }],
			["G-MERGED", { impact: ["beans"] }],
		]);
		const actions = planReconcile(round, nominees, probes, mirror);
		expect(actions).toEqual([
			{
				kind: "create",
				address: "G-CREATE",
				selections: { impact: ["decaf"] },
			},
			{
				kind: "update",
				address: "G-UPDATE",
				selections: { impact: ["beans"] },
				prior: { impact: ["decaf"] },
			},
			{ kind: "ok", address: "G-OK" },
			{ kind: "no-vote", address: "G-NOVOTE" },
			{ kind: "chain-empty", address: "G-CHAINEMPTY" },
			{ kind: "chain-empty", address: "G-MERGED" },
			{ kind: "unfunded", address: "G-UNFUNDED" },
			{
				kind: "unreachable",
				address: "G-DOWN",
				error: "Horizon responded 503",
			},
		]);
		const summary = summarizeReconcile(actions, mirror.size);
		expect(summary.counts).toEqual({
			create: 1,
			update: 1,
			ok: 1,
			"no-vote": 1,
			"chain-empty": 2,
			unfunded: 1,
			unreachable: 1,
		});
		expect(summary.chainVoters).toBe(3);
		expect(summary.resetSuspected).toBe(false);
	});

	it("a vote for a since-removed nominee is not a ballot", () => {
		const [a] = planReconcile(
			round,
			nominees,
			[{ address: "G1", result: funded(impact("ghost")) }],
			new Map(),
		);
		expect(a).toEqual({ kind: "no-vote", address: "G1" });
	});

	it("suspects a reset when the mirror has ballots and a reachable chain has none", () => {
		const mirror = new Map<string, BallotSelections>([
			["G1", { impact: ["decaf"] }],
			["G2", { impact: ["beans"] }],
		]);
		const wiped: ChainProbe[] = [
			{ address: "G1", result: { funded: false } },
			{ address: "G2", result: { funded: false } },
			{ address: "G3", result: { funded: false } },
		];
		expect(
			summarizeReconcile(
				planReconcile(round, nominees, wiped, mirror),
				mirror.size,
			).resetSuspected,
		).toBe(true);

		// Horizon entirely down is an outage, not a reset.
		const down: ChainProbe[] = wiped.map(({ address }) => ({
			address,
			result: { funded: null, error: "unreachable" },
		}));
		expect(
			summarizeReconcile(
				planReconcile(round, nominees, down, mirror),
				mirror.size,
			).resetSuspected,
		).toBe(false);

		// An empty mirror on an empty chain is just a round nobody voted in.
		expect(
			summarizeReconcile(planReconcile(round, nominees, wiped, new Map()), 0)
				.resetSuspected,
		).toBe(false);
	});
});
