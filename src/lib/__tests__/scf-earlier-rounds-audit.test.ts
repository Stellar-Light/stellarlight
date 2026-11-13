/**
 * sls-116, the independent audit's findings (2026-11-12): two removals that
 * stranded an award from the row SCF's page names, a removal pass with no
 * ceiling, a fold that wrote a reduced record over an unread member page, a
 * stale lastAwardedRound, a zero total that cleared real amounts, and a round
 * page that parsed to nothing read as a round with no submissions.
 */
import { describe, expect, it } from "vitest";
import {
	couldNotCheck,
	countedRows,
	type JoinRow,
	SCF_SHARED_CLAIMS,
	SCF_SLUG_OVERRIDES,
	STRANDED_CEILING,
	strandedAwards,
	strandedWrites,
} from "../../../scripts/data/scf-joins";
import {
	foldPageDetails,
	readScfRounds,
	storedLastRound,
	storedTotal,
} from "../../../scripts/eval/scf-official";

type Row = JoinRow & {
	scf?: { awarded?: boolean; slug?: string | null; awardedRounds?: number[] };
};

describe("a reviewed shared claim keeps both rows (peer and honey-coin)", () => {
	const rows: Row[] = [
		{
			slug: "peer",
			name: "Peer",
			scf: {
				awarded: true,
				slug: "peer-by-honeycoin-inz",
				awardedRounds: [22, 26],
			},
		},
		{
			slug: "honey-coin",
			name: "Honey Coin",
			scf: {
				awarded: true,
				slug: "peer-by-honeycoin-inz",
				awardedRounds: [22, 26],
			},
		},
		{
			slug: "stbl",
			name: "STBL",
			scf: {
				awarded: true,
				slug: "catalyst-blockchain-manager-woe",
				awardedRounds: [22],
			},
		},
	];
	const joinedPage = new Map([
		["peer-by-honeycoin-inz", "honey-coin"],
		["catalyst-blockchain-manager-woe", "catalyst"],
	]);
	const id = (r: Row) => r.slug;

	it("the peer row is not stranded: product row or company row is the owner's call", () => {
		expect(SCF_SHARED_CLAIMS.peer).toMatchObject({
			page: "peer-by-honeycoin-inz",
			joinedTo: "honey-coin",
		});
		const out = strandedAwards(
			rows,
			joinedPage,
			new Set(["honey-coin", "catalyst"]),
			id,
		);
		expect(out.map((s) => s.row.slug)).toEqual(["stbl"]);
	});

	it("the round count counts that award once, on the row the page joins", () => {
		expect(countedRows(rows).map((r) => r.slug)).toEqual([
			"honey-coin",
			"stbl",
		]);
	});
});

describe("the stranded pass has a ceiling and needs a clean run", () => {
	const two = ["stbl", "ankr"];

	it("a run under the ceiling with nothing unchecked writes its removals", () => {
		expect(STRANDED_CEILING).toBeLessThanOrEqual(5);
		expect(
			strandedWrites(two, { ceiling: STRANDED_CEILING, couldNotCheck: [] }),
		).toEqual({
			write: two,
			refused: null,
		});
	});

	it("more than the ceiling writes none of them", () => {
		const many = Array.from(
			{ length: STRANDED_CEILING + 1 },
			(_, i) => `row-${i}`,
		);
		const out = strandedWrites(many, {
			ceiling: STRANDED_CEILING,
			couldNotCheck: [],
		});
		expect(out.write).toEqual([]);
		expect(out.refused).toMatch(/ceiling/);
	});

	it("anything the run could not check writes none of them", () => {
		const out = strandedWrites(two, {
			ceiling: STRANDED_CEILING,
			couldNotCheck: ["https://communityfund.stellar.org/project/rec123"],
		});
		expect(out.write).toEqual([]);
		expect(out.refused).toMatch(/could not check/);
	});

	it("a joined page the run could not read is could-not-check (exit 2)", () => {
		expect(
			couldNotCheck({
				beyondCap: [],
				roundPath: [],
				joinedPages: ["flow-sbr (fold member of obsrvr)"],
			}),
		).toEqual(["flow-sbr (fold member of obsrvr)"]);
	});
});

describe("a fold with an unread member page writes nothing", () => {
	const prism = {
		totalAwarded: 79999,
		awardedRounds: [41],
		roundAwards: [{ round: 41, amountUSD: 79999, awardType: "Build" }],
	};
	const flow = {
		totalAwarded: 120000,
		awardedRounds: [35],
		roundAwards: [{ round: 35, amountUSD: 120000, awardType: "Build" }],
	};

	it("every member read: the union and the summed total", () => {
		expect(foldPageDetails([prism, flow])).toMatchObject({
			totalAwarded: 199999,
			awardedRounds: [35, 41],
		});
	});

	it("one member unread: no record, never the reduced one", () => {
		expect(foldPageDetails([prism, null])).toBeNull();
		expect(foldPageDetails([undefined, flow])).toBeNull();
	});
});

describe("lastAwardedRound is the highest round the page awards", () => {
	it("reclaim and solang: SCF's summary names an earlier round", () => {
		expect(storedLastRound(21, [21, 36])).toBe(36);
		expect(storedLastRound(23, [20, 23, 33])).toBe(33);
	});

	it("an award SCF does not number keeps no round", () => {
		expect(storedLastRound(-326, [])).toBeNull();
		expect(storedLastRound(-326, undefined)).toBeNull();
	});
});

describe("a zero total clears a stored total only when no award carries an amount", () => {
	it("StellarPay: #2 with no amount, total 0: cleared", () => {
		expect(
			storedTotal(0, [
				{ round: 2, amountUSD: null, awardType: "Legacy v1.0 Award" },
			]),
		).toBeNull();
	});

	it("a page with a round amount and a 0 total leaves the stored total", () => {
		expect(
			storedTotal(0, [{ round: 9, amountUSD: 40000, awardType: "Build" }]),
		).toBeUndefined();
	});
});

describe("a closed round's page that lists nothing is could-not-check", () => {
	const index =
		'<script>self.__next_f.push([1,"{\\"id\\":\\"recR44\\",\\"name\\":\\"SCF #44\\",\\"type\\":\\"Build Award Round\\",\\"phase\\":\\"Ended\\",\\"roundNumber\\":44}{\\"id\\":\\"recR46\\",\\"name\\":\\"SCF #46\\",\\"type\\":\\"Build Award Round\\",\\"phase\\":\\"Initial Review\\",\\"roundNumber\\":46}"])</script>';
	const empty =
		'<script>self.__next_f.push([1,"{\\"digest\\":\\"x\\"}"])</script>';

	it("an ended round reads null, a round still in review reads []", async () => {
		const get = async (url: string) =>
			url.endsWith("/awards") ? index : empty;
		const rounds = await readScfRounds(get, 0);
		expect(rounds?.find((r) => r.round === 44)?.submissions).toBeNull();
		expect(rounds?.find((r) => r.round === 46)?.submissions).toEqual([]);
	});
});

describe("the reviewed passkey-ui join (M3)", () => {
	it("the SCF #44 page's own submission is SoroPass, by the soropass row's author", () => {
		expect(SCF_SLUG_OVERRIDES["passkey-ui-sj6"]).toBe("soropass");
	});
});

describe("re-audit (2026-11-12): the flag must name the count, and a shared claim holds only on its page", () => {
	const many = Array.from(
		{ length: STRANDED_CEILING + 2 },
		(_, i) => `row-${i}`,
	);

	it("--allow-stranded that is not a whole number writes nothing", () => {
		// the run used to pass the flag as the ceiling: Number("abc") is NaN,
		// and no count is over NaN
		expect(
			strandedWrites(many, { ceiling: Number.NaN, couldNotCheck: [] }).write,
		).toEqual([]);
		for (const allow of [Number.NaN, 2.5, -1])
			expect(
				strandedWrites(many, {
					ceiling: STRANDED_CEILING,
					allow,
					couldNotCheck: [],
				}).write,
				String(allow),
			).toEqual([]);
	});

	it("--allow-stranded writes only when it equals the count the run found", () => {
		const opts = { ceiling: STRANDED_CEILING, couldNotCheck: [] };
		expect(
			strandedWrites(many, { ...opts, allow: many.length + 1 }).write,
		).toEqual([]);
		expect(strandedWrites(["a", "b"], { ...opts, allow: 3 }).write).toEqual([]);
		expect(strandedWrites(many, { ...opts, allow: many.length }).write).toEqual(
			many,
		);
	});

	it("countedRows drops peer only while it stores the claim's page", () => {
		const claim = SCF_SHARED_CLAIMS.peer.page;
		const rows = [
			{ slug: "peer", scf: { slug: claim } },
			{ slug: "honey-coin", scf: { slug: claim } },
		];
		expect(countedRows(rows).map((r) => r.slug)).toEqual(["honey-coin"]);
		// cited the same page through the served field
		expect(
			countedRows([
				{
					slug: "peer",
					scfSourceUrl: `https://communityfund.stellar.org/project/${claim}`,
				},
			]),
		).toEqual([]);
		// once peer carries a page of its own, it is a row like any other
		const own = [{ slug: "peer", scf: { slug: "peer-wallet-abc" } }];
		expect(countedRows(own)).toEqual(own);
		// a stored page that could not be read is not the claim's page
		expect(countedRows([{ slug: "peer" }])).toEqual([{ slug: "peer" }]);
	});
});
