/**
 * SCF round-level count check (sls-111): awards per round in our directory
 * versus SCF's own round pages. On 2026-11-11 SCF's #45 page listed 37
 * Awarded submissions and three more whose project pages pin the award (40)
 * while the directory carried 28. The listing the check used before gave only
 * the latest round exactly: every earlier round was a floor, so a row
 * claiming a round SCF never awarded read "unconfirmed" and never red.
 */
import { describe, expect, it } from "vitest";
import {
	readAwardRounds,
	readRoundSubmissions,
	submissionVerdict,
} from "../../../scripts/eval/scf-official";
import baselineFile from "../../../scripts/eval/scf-round-shortfalls.json";
import {
	compareRoundCounts,
	judgeAgainstBaseline,
	ourPageProblem,
	parseShortfallBaseline,
	type RoundCount,
	type ScfListingRow,
	type ScfRound,
	type ShortfallBaseline,
} from "../scf-round-counts";

const PAGE = "https://communityfund.stellar.org/project/";
const listed = (
	id: string,
	lastAwardedRound: unknown,
	slug = `${id}-page`,
): ScfListingRow => ({ id, slug, lastAwardedRound });
const row = (rounds: number[] | null, page: string) => ({
	scfAwardedRounds: rounds,
	scfSourceUrl: PAGE + page,
});
type Verdict = "awarded" | "declined" | "pending";
const sub = (id: string, project: string | null, verdict: Verdict) => ({
	id,
	project,
	verdict,
});
const round = (
	n: number,
	submissions: ScfRound["submissions"],
	phase = "Ended",
): ScfRound => ({ round: n, phase, submissions });
/** SCF numbers its rounds from 1 without a gap, and the check refuses an
 * index that skips one: fill each round below the highest a fixture names
 * with one declined submission that has no project page, which counts
 * nothing. */
const whole = (...given: ScfRound[]): ScfRound[] => {
	const top = Math.max(...given.map((r) => r.round));
	const filler = Array.from({ length: top }, (_, i) => i + 1)
		.filter((n) => !given.some((r) => r.round === n))
		.map((n) => round(n, [sub(`filler-${n}`, null, "declined")]));
	return [...given, ...filler];
};
/** compareRoundCounts over a whole index made from the rounds a fixture names. */
const compare = (input: Parameters<typeof compareRoundCounts>[0]) =>
	compareRoundCounts({
		...input,
		rounds: input.rounds?.length ? whole(...input.rounds) : input.rounds,
	});
const ids = (prefix: string, n: number) =>
	Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
const cannotReason = (r: ReturnType<typeof compareRoundCounts>) =>
	r.status === "could-not-check"
		? r.reason
		: `not could-not-check: ${r.status}`;

describe("compareRoundCounts: SCF's side is its round pages, exact in every round", () => {
	// The #45 shape read 2026-11-11: 37 Awarded projects, three in
	// Information Collection that the listing pins at lastAwardedRound 45
	// (pods, minisend, canary), one in Panel Review it does not (its last
	// award is #40), and the declined rest.
	const awarded = ids("a", 37);
	const r45 = round(45, [
		...awarded.map((p) => sub(`s-${p}`, p, "awarded")),
		...["pods", "minisend", "canary"].map((p) => sub(`s-${p}`, p, "pending")),
		sub("s-houdini", "houdini", "pending"),
		...ids("d", 50).map((p) => sub(`s-${p}`, p, "declined")),
	]);
	const listing = [
		...awarded.map((p) => listed(p, 45)),
		...["pods", "minisend", "canary"].map((p) => listed(p, 45)),
		listed("houdini", 40),
	];

	it("SCF #45 counts its Awarded submissions and the pending ones a page summary pins", () => {
		const ours = awarded.slice(0, 28).map((p) => row([45], `${p}-page`));
		const report = compare({ rounds: [r45], listing, ours });
		if (report.status === "could-not-check") throw new Error(report.reason);
		expect(report.status).toBe("mismatch");
		expect(report.rounds[0]).toMatchObject({
			round: 45,
			scf: 40,
			undecided: 1,
			ours: 28,
			verdict: "short",
		});
		// the twelve pages no row claiming #45 cites: nine Awarded, three pinned
		expect(report.rounds[0].uncited).toHaveLength(12);
		expect(report.rounds[0].uncited).toContain(`${PAGE}pods-page`);
		expect(report.rounds[0].uncited).toContain(`${PAGE}a37-page`);

		const all = [...awarded, "pods", "minisend", "canary"].map((p) =>
			row([45], `${p}-page`),
		);
		// Houdiniswap's own #40 award, the one its listing entry pins
		all.push(row([40], "houdini-page"));
		const full = compare({ rounds: [r45], listing, ours: all });
		expect(full.status).toBe("match");
		if (full.status === "could-not-check") return;
		expect(full.rounds[0]).toMatchObject({
			round: 45,
			scf: 40,
			ours: 40,
			verdict: "agrees",
		});
	});

	it("an earlier round is exact too: a row claiming an award SCF never gave reds", () => {
		const report = compare({
			rounds: [
				round(45, [sub("s1", "x", "awarded")]),
				round(44, [
					sub("s2", "p", "awarded"),
					sub("s3", "q", "awarded"),
					sub("s4", "r", "declined"),
				]),
			],
			listing: [
				listed("x", 45),
				listed("p", 44),
				listed("q", 44),
				listed("r", 0),
			],
			ours: [
				row([45], "x-page"),
				row([44], "p-page"),
				row([44], "q-page"),
				row([44], "r-page"),
			],
		});
		if (report.status === "could-not-check") throw new Error(report.reason);
		expect(report.status).toBe("mismatch");
		expect(report.rounds.find((r) => r.round === 44)).toMatchObject({
			scf: 2,
			undecided: 0,
			ours: 3,
			verdict: "over",
		});
	});

	it("an award with no submission in its round counts through the page summary", () => {
		// stride-4uu: awarded true, lastAwardedRound 33, and no card on #33's page
		const report = compare({
			rounds: [
				round(33, [sub("s1", "a", "awarded"), sub("s2", "b", "declined")]),
			],
			listing: [listed("a", 33), listed("stride", 33), listed("b", 0)],
			ours: [row([33], "a-page"), row([33], "stride-page")],
		});
		expect(report.status).toBe("match");
		if (report.status === "could-not-check") return;
		expect(report.rounds[0]).toMatchObject({
			round: 33,
			scf: 2,
			ours: 2,
			verdict: "agrees",
		});
	});

	it("a pending submission no summary pins is undecided, never an award or a refusal", () => {
		const rounds = [
			round(40, [
				sub("s1", "a", "awarded"),
				sub("s2", "b", "pending"),
				sub("s3", "c", "pending"),
			]),
		];
		const listing = [
			listed("a", 40),
			listed("b", 38),
			listed("c", 0),
			listed("d", 0),
		];
		const count = (ours: ReturnType<typeof row>[]) => {
			const r = compare({ rounds, listing, ours });
			if (r.status === "could-not-check") throw new Error(r.reason);
			return r.rounds[0];
		};
		expect(count([row([40], "a-page")])).toMatchObject({
			scf: 1,
			undecided: 2,
			verdict: "agrees",
		});
		expect(
			count([row([40], "a-page"), row([40], "b-page"), row([40], "c-page")]),
		).toMatchObject({ verdict: "unconfirmed" });
		expect(
			count([
				row([40], "a-page"),
				row([40], "b-page"),
				row([40], "c-page"),
				row([40], "d-page"),
			]),
		).toMatchObject({ verdict: "over" });
	});

	it("a submission with no project page is its own award", () => {
		const report = compare({
			rounds: [
				round(18, [
					sub("s1", "a", "awarded"),
					sub("s2", null, "awarded"),
					sub("s3", null, "declined"),
				]),
			],
			listing: [listed("a", 18)],
			ours: [row([18], "a-page")],
		});
		if (report.status === "could-not-check") throw new Error(report.reason);
		expect(report.rounds[0]).toMatchObject({ scf: 2, verdict: "short" });
		expect(report.rounds[0].uncited).toEqual([
			"submission s2 (no project page)",
		]);
	});

	it("a round only we claim is over: one SCF does not list, or one still in review", () => {
		const report = compare({
			rounds: [
				round(46, [], "Initial Review"),
				round(45, [sub("s1", "a", "awarded")]),
			],
			listing: [listed("a", 45)],
			ours: [row([45, 46], "a-page"), row([47], "b-page")],
		});
		if (report.status === "could-not-check") throw new Error(report.reason);
		const by = Object.fromEntries(report.rounds.map((r) => [r.round, r]));
		expect(by[46]).toMatchObject({ scf: 0, ours: 1, verdict: "over" });
		expect(by[47]).toMatchObject({ scf: 0, ours: 1, verdict: "over" });
		expect(by[45]).toMatchObject({ verdict: "agrees" });
		expect(report.status).toBe("mismatch");
	});

	it("an award outside the listing is named by record id, not as a missing slug", () => {
		const report = compare({
			rounds: [round(26, [sub("s1", "recBeyond", "awarded")])],
			listing: [listed("a", 45)],
			ours: [row([45], "a-page")],
		});
		if (report.status === "could-not-check") throw new Error(report.reason);
		expect(report.rounds.find((r) => r.round === 26)?.uncited).toEqual([
			`${PAGE}recBeyond (outside the SCF listing)`,
		]);
	});

	it("an awarded row with no rounds and no SCF page cited is counted as rounds unread", () => {
		const report = compare({
			rounds: [round(45, [sub("s1", "a", "awarded")])],
			listing: [listed("a", 45)],
			ours: [
				row([45], "a-page"),
				{ scfAwardedRounds: [], scfSourceUrl: `${PAGE}blend-mfy` },
				{ scfAwardedRounds: [], scfSourceUrl: null },
			],
		});
		if (report.status === "could-not-check") throw new Error(report.reason);
		expect(report.roundsUnread).toBe(1);
	});
});

describe("compareRoundCounts: closed rounds, folded pages and the witnesses (audit, 2026-11-11)", () => {
	it("in a closed round a pending submission allows nothing: a false claim is over", () => {
		// the audit's probe: a round before the latest ended one, with pending
		// submissions, read a claim SCF never made as unconfirmed and passed
		const report = compare({
			rounds: [
				round(41, [sub("s0", "x", "awarded")]),
				round(31, [
					sub("s1", "a", "awarded"),
					sub("s2", "b", "pending"),
					sub("s3", "c", "pending"),
				]),
			],
			listing: [
				listed("x", 41),
				listed("a", 31),
				listed("b", 0),
				listed("c", 0),
			],
			ours: [
				row([41], "x-page"),
				row([31], "a-page"),
				row([31], "unrelated-page"),
			],
		});
		if (report.status === "could-not-check") throw new Error(report.reason);
		expect(report.rounds.find((r) => r.round === 31)).toMatchObject({
			scf: 1,
			undecided: 2,
			ours: 2,
			closed: true,
			verdict: "over",
		});
		expect(report.status).toBe("mismatch");
	});
	it("a page a row folds without citing it is carried through the enrich's join", () => {
		const input = {
			rounds: [
				round(41, [sub("s1", "p1", "awarded"), sub("s2", "p2", "awarded")]),
			],
			listing: [listed("p1", 41), listed("p2", 41), listed("bo", 0, "b-other")],
			// row b cites its other page and carries p2's round by a join
			ours: [
				{ slug: "a", scfAwardedRounds: [41], scfSourceUrl: `${PAGE}p1-page` },
				{ slug: "b", scfAwardedRounds: [41], scfSourceUrl: `${PAGE}b-other` },
			],
		};
		const bare = compare(input);
		if (bare.status === "could-not-check") throw new Error(bare.reason);
		expect(bare.rounds[0]).toMatchObject({
			verdict: "agrees",
			uncitedPages: ["p2-page"],
		});
		const joined = compare({
			...input,
			joinedRow: (page) => (page.slug === "p2-page" ? "b" : undefined),
		});
		if (joined.status === "could-not-check") throw new Error(joined.reason);
		expect(joined.rounds[0].uncitedPages).toEqual([]);
	});
	it("a listing without a page our rows cite for the latest ended round is cut", () => {
		const report = compare({
			rounds: [round(45, [sub("s1", "a", "awarded")])],
			listing: [listed("a", 45)],
			ours: [row([45], "a-page"), row([45], "gone-page")],
		});
		expect(cannotReason(report)).toMatch(
			/lacks 1 page\(s\) our rows cite for #45: gone-page/,
		);
	});
	it("an index that skips a round is a partial read, not a round only we claim", () => {
		// the audit's probe: an index that dropped #43, a round the baseline
		// does not list, read as ours 28 over SCF's 0
		const rounds = whole(
			round(45, [sub("s1", "a", "awarded")]),
			round(43, [sub("s2", "b", "awarded")]),
		).filter((r) => r.round !== 43);
		const report = compareRoundCounts({
			rounds,
			listing: [listed("a", 45), listed("b", 43)],
			ours: [row([45], "a-page"), row([43], "b-page")],
		});
		expect(cannotReason(report)).toMatch(/skips #43 below #45/);
	});
	it("an index without a round the baseline lists is a partial read", () => {
		const report = compare({
			rounds: [round(45, [sub("s1", "a", "awarded")])],
			listing: [listed("a", 45)],
			ours: [row([45], "a-page")],
			expectRounds: [46, 5],
		});
		expect(cannotReason(report)).toMatch(/lacks #46, which the baseline lists/);
	});
});

describe("compareRoundCounts: could-not-check whenever a side was not read in full", () => {
	const rounds = [round(45, [sub("s1", "a", "awarded")])];
	const listing = [listed("a", 45)];
	const ours = [row([45], "a-page")];

	it("the round index or a round page unread", () => {
		expect(cannotReason(compare({ rounds: null, listing, ours }))).toMatch(
			/round index/,
		);
		expect(cannotReason(compare({ rounds: [], listing, ours }))).toMatch(
			/round index/,
		);
		expect(
			cannotReason(
				compare({
					rounds: [...rounds, round(44, null)],
					listing,
					ours,
				}),
			),
		).toMatch(/SCF #44 page unread/);
	});

	it("an ended round whose page lists nothing is a page that changed shape", () => {
		expect(
			cannotReason(
				compare({
					rounds: [...rounds, round(44, [])],
					listing,
					ours,
				}),
			),
		).toMatch(/SCF #44 has ended/);
	});

	it("the listing or our rows unread, and the listing's old cap", () => {
		for (const l of [null, []])
			expect(compare({ rounds, listing: l, ours }).status).toBe(
				"could-not-check",
			);
		for (const o of [null, []])
			expect(compare({ rounds, listing, ours: o }).status).toBe(
				"could-not-check",
			);
		const capped = ids("p", 500).map((p) => listed(p, 45));
		expect(cannotReason(compare({ rounds, listing: capped, ours }))).toMatch(
			/500/,
		);
	});

	it("a listing row it cannot read, never a skipped pin", () => {
		// "45" as a string used to be skipped, so a pin vanished and SCF's
		// count shrank toward ours.
		expect(
			cannotReason(
				compare({
					rounds,
					listing: [...listing, listed("b", "45")],
					ours,
				}),
			),
		).toMatch(/unreadable/);
		expect(
			compare({
				rounds,
				listing: [...listing, { slug: "c-page", lastAwardedRound: 45 }],
				ours,
			}).status,
		).toBe("could-not-check");
		expect(
			cannotReason(
				compare({
					rounds,
					listing: [...listing, listed("a", 44)],
					ours,
				}),
			),
		).toMatch(/twice/);
	});
});

describe("ourPageProblem: a page of our rows counts only when read whole and after the sync", () => {
	const sync = new Date("2026-11-11T20:00:00Z");
	const page = (meta: Record<string, unknown>) => ({
		projects: [],
		meta: {
			partial: false,
			failedReads: [],
			counts: { total: 0 },
			generatedAt: "2026-11-11T20:05:00Z",
			...meta,
		},
	});
	it("a whole page generated after the sync counts", () => {
		expect(ourPageProblem(page({}), sync)).toBeNull();
		expect(
			ourPageProblem(page({ generatedAt: "2026-11-10T00:00:00Z" }), null),
		).toBeNull();
	});
	it("a page the edge cache held from before the sync does not", () => {
		expect(
			ourPageProblem(page({ generatedAt: "2026-11-11T19:58:00Z" }), sync),
		).toMatch(/before the sync/);
		expect(ourPageProblem(page({ generatedAt: undefined }), sync)).toMatch(
			/generatedAt/,
		);
	});
	it("a partial page, failed reads or no total do not", () => {
		expect(ourPageProblem(page({ partial: true }), null)).toMatch(/partial/);
		expect(ourPageProblem(page({ failedReads: ["x"] }), null)).toMatch(
			/failed/,
		);
		expect(ourPageProblem(page({ counts: {} }), null)).toMatch(/total/);
		expect(ourPageProblem(null, null)).toMatch(/projects/);
	});
});

/** A page the way SCF serves it: RSC flight chunks cut at arbitrary points. */
const flight = (...chunks: string[]) =>
	`<html>${chunks.map((c) => `<script>self.__next_f.push([1,${JSON.stringify(c)}])</script>`).join("")}</html>`;

describe("the round pages are read by field name, across chunk cuts", () => {
	it("readAwardRounds: numbered build award rounds with id and phase", () => {
		const index = [
			'2:["$","x",null,{"contentComponent":"award_rounds","content":[',
			'{"id":"recR46","name":"SCF #46","type":"Build Award Round","phase":"Initial Review","roundNumber":46,"dates":{"abstract":{"open":"","close":""}},"submissions":[]},',
			// fields reordered after the id: SCF has moved fields before
			'{"id":"recR45","phase":"Ended","roundNumber":45,"submissions":[],"name":"SCF #45","type":"Build Award Round"},',
			'{"id":"recK3","name":"Kickstart #3","type":"Kickstart Round","phase":"Ended","roundNumber":3}',
			"]}]",
		].join("");
		const html = flight(
			index.slice(0, 120),
			index.slice(120, 260),
			index.slice(260),
		);
		expect(readAwardRounds(html)?.sort((a, b) => b.round - a.round)).toEqual([
			{ id: "recR46", round: 46, phase: "Initial Review" },
			{ id: "recR45", round: 45, phase: "Ended" },
		]);
		// records that stop opening with their id read as no rounds, which
		// the comparison reports as could-not-check, never as no awards
		const moved = flight(
			index.replace(/\{"id":"(rec\w+)",/g, '{"x":1,"id":"$1",'),
		);
		expect(readAwardRounds(moved)).toEqual([]);
		expect(
			compare({
				rounds: [],
				listing: [listed("a", 45)],
				ours: [row([45], "a-page")],
			}).status,
		).toBe("could-not-check");
	});

	it("readRoundSubmissions: every submission of that round, its project and verdict", () => {
		const page = [
			'{"id":"recA","title":"Ramp","status":"Awarded","project":"recP1","projectName":["Pollar"],"roundName":"SCF #45","budget":89500,"awardType":"Build","thumbnail":{"url":"x"}},',
			'{"id":"recB","title":"Pay","status":"Awarded (50%)","project":"recP2","roundName":"SCF #45","budget":10,"awardType":"Build"},',
			'{"id":"recC","title":"Pods","status":"Information Collection","project":"recP3","roundName":"SCF #45"},',
			'{"id":"recD","title":"Prescreen","status":"Not Approved","project":"recP4","roundName":"SCF #45"},',
			'{"id":"recE","title":"Old","status":"Ineligible ","roundName":"SCF #45","awardType":"Legacy"},',
			'{"id":"recF","title":"Elsewhere","status":"Awarded","project":"recP5","roundName":"SCF #44"},',
			// the same card embedded twice
			'{"id":"recA","title":"Ramp","status":"Awarded","project":"recP1","roundName":"SCF #45"}',
		].join("");
		// a cut inside a card, the class that once parsed a card with no round
		const html = flight(page.slice(0, 333), page.slice(333));
		expect(
			readRoundSubmissions(html, 45)?.sort((a, b) => a.id.localeCompare(b.id)),
		).toEqual([
			{ id: "recA", project: "recP1", verdict: "awarded" },
			{ id: "recB", project: "recP2", verdict: "awarded" },
			{ id: "recC", project: "recP3", verdict: "pending" },
			{ id: "recD", project: "recP4", verdict: "declined" },
			{ id: "recE", project: null, verdict: "declined" },
		]);
	});

	it("a page not read whole is no page: a record that does not close or parse", () => {
		const whole =
			'{"id":"recA","title":"Ramp","status":"Awarded","project":"recP1","roundName":"SCF #45"},{"id":"recB","title":"Pay","status":"Not Awarded","project":"recP2","roundName":"SCF #45"}';
		expect(readRoundSubmissions(flight(whole), 45)).toHaveLength(2);
		// the stream cut inside the second record
		expect(readRoundSubmissions(flight(whole.slice(0, -40)), 45)).toBeNull();
		// a record that closes but does not parse
		expect(
			readRoundSubmissions(flight(whole.replace('"Pay"', '"Pay" oops')), 45),
		).toBeNull();
		expect(
			readAwardRounds(
				flight(
					'{"id":"recR45","name":"SCF #45","type":"Build Award Round","phase":"Ended","roundNumber":45',
				),
			),
		).toBeNull();
	});
	it("submissionVerdict: decisions against an award are declined, pipeline steps pending", () => {
		expect(submissionVerdict("Awarded")).toBe("awarded");
		expect(submissionVerdict("Awarded (10%)")).toBe("awarded");
		for (const s of [
			"Not Awarded",
			"Not Approved",
			"Panel Review Failed",
			"Rejected - timeout",
			"Ineligible ",
		])
			expect(submissionVerdict(s)).toBe("declined");
		for (const s of [
			"Information Collection",
			"Panel Review",
			"Submitted",
			"Ready for Payment",
		])
			expect(submissionVerdict(s)).toBe("pending");
	});
});

describe("judgeAgainstBaseline: the ratchet reds on what changed, never on a known gap", () => {
	const count = (
		round: number,
		scf: number,
		ours: number,
		undecided = 0,
		uncitedPages: string[] = [],
		awardPages: string[] = uncitedPages,
	): RoundCount => ({
		round,
		scf,
		undecided,
		ours,
		verdict:
			ours === scf
				? "agrees"
				: ours < scf
					? "short"
					: ours > scf + undecided
						? "over"
						: "unconfirmed",
		closed: false,
		uncited: uncitedPages.map((p) => PAGE + p),
		uncitedPages,
		awardPages,
	});
	const baseline: ShortfallBaseline = {
		asOf: "2026-11-11",
		rounds: [
			{ round: 44, scf: 46, ours: 43, missing: ["passkey-ui-sj6"] },
			{ round: 5, scf: 9, ours: 1, missing: ["lettuce-4zo"] },
		],
	};
	const kinds = (rounds: RoundCount[], b = baseline) =>
		judgeAgainstBaseline(rounds, b).findings.map(
			(f) => `${f.kind} #${f.round}`,
		);

	it("known shortfalls held exactly pass, so the step is not red on every execute", () => {
		expect(
			judgeAgainstBaseline(
				[count(45, 40, 40, 1), count(44, 46, 43), count(5, 9, 1)],
				baseline,
			),
		).toEqual({ findings: [], notes: [] });
	});
	it("a short round the baseline does not list fails", () => {
		expect(
			kinds([count(45, 40, 28, 1), count(44, 46, 43), count(5, 9, 1)]),
		).toEqual(["new #45"]);
	});
	it("a listed round whose shortfall grew fails", () => {
		expect(kinds([count(44, 46, 42), count(5, 9, 1)])).toEqual(["grew #44"]);
		// SCF adding an award to an old round grows the gap too
		expect(kinds([count(44, 47, 43), count(5, 9, 1)])).toEqual(["grew #44"]);
	});
	it("over always fails, listed or not", () => {
		expect(
			kinds([count(44, 46, 43), count(5, 9, 1), count(33, 13, 14)]),
		).toEqual(["over #33"]);
		// a listed round that went over is over, and its entry is stale too
		expect(kinds([count(44, 46, 47), count(5, 9, 1)])).toEqual([
			"over #44",
			"stale #44",
		]);
	});
	it("a closed gap, a smaller gap and a round no side counts are stale entries", () => {
		expect(kinds([count(44, 46, 46), count(5, 9, 1)])).toEqual(["stale #44"]);
		const lowered = judgeAgainstBaseline(
			[count(44, 46, 45), count(5, 9, 1)],
			baseline,
		).findings;
		expect(lowered).toMatchObject([{ kind: "stale", round: 44 }]);
		expect(lowered[0].detail).toMatch(/lower its entry to SCF 46, ours 45/);
		expect(kinds([count(44, 46, 43)])).toEqual(["stale #5"]);
	});
	it("an SCF page no row carries fails outside the baseline: a swap inside an unchanged total", () => {
		// #43 agrees 28 to 28, yet one award page is carried by no row: some
		// other row claims the round with no SCF page of its own
		expect(
			kinds([
				count(44, 46, 43, 0, ["passkey-ui-sj6"]),
				count(5, 9, 1),
				count(43, 28, 28, 0, ["swapped-page-abc"]),
			]),
		).toEqual(["uncited #43"]);
		// a listed round may leave uncited only the pages its entry names
		expect(
			kinds([
				count(44, 46, 43, 0, ["passkey-ui-sj6", "other-page"]),
				count(5, 9, 1),
			]),
		).toEqual(["uncited #44"]);
		// named as a slug or as the page URL alike
		expect(
			kinds([count(44, 46, 43, 0, ["passkey-ui-sj6"]), count(5, 9, 1)], {
				asOf: "2026-11-11",
				rounds: [
					{ round: 44, scf: 46, ours: 43, missing: [`${PAGE}passkey-ui-sj6`] },
					{ round: 5, scf: 9, ours: 1, missing: ["lettuce-4zo"] },
				],
			}),
		).toEqual([]);
	});
	it("a recorded swap holds while its page stays uncited, and is stale once the page is carried", () => {
		const b: ShortfallBaseline = {
			asOf: "2026-11-11",
			rounds: [{ round: 37, scf: 19, ours: 19, missing: ["paysomeai-7gh"] }],
		};
		expect(kinds([count(37, 19, 19, 0, ["paysomeai-7gh"])], b)).toEqual([]);
		expect(kinds([count(37, 19, 19)], b)).toEqual(["stale #37"]);
	});
	it("each page an entry names is stale once carried, so the list is never a standing allowance", () => {
		const b: ShortfallBaseline = {
			asOf: "2026-11-11",
			rounds: [
				{
					round: 37,
					scf: 19,
					ours: 19,
					missing: ["paysomeai-7gh", "stellar-integration-in-adamik-api-piy"],
				},
			],
		};
		// adamik's page is carried now, smilepay's is not: the entry stays,
		// but the carried name must go, or the page could be lost again in
		// silence
		const r = judgeAgainstBaseline(
			[
				count(
					37,
					19,
					19,
					0,
					["paysomeai-7gh"],
					["paysomeai-7gh", "stellar-integration-in-adamik-api-piy"],
				),
			],
			b,
		);
		expect(r.findings.map((f) => `${f.kind} #${f.round}`)).toEqual([
			"stale #37",
		]);
		expect(r.findings[0].detail).toMatch(
			/stellar-integration-in-adamik-api-piy is carried now/,
		);
		// a page outside the listing is named by record id at run time, so
		// its name is neither checked nor judged stale
		expect(
			kinds([count(44, 46, 43, 0, ["passkey-ui-sj6"]), count(5, 9, 1)], {
				asOf: "2026-11-11",
				rounds: [
					{
						round: 44,
						scf: 46,
						ours: 43,
						missing: ["passkey-ui-sj6", "beyond-the-listing-abc"],
					},
					{ round: 5, scf: 9, ours: 1, missing: ["lettuce-4zo"] },
				],
			}),
		).toEqual([]);
	});
	it("a listed round whose counts moved together is a note, not a pass in silence", () => {
		const r = judgeAgainstBaseline(
			[count(44, 47, 44), count(5, 9, 1)],
			baseline,
		);
		expect(r.findings).toEqual([]);
		expect(r.notes[0]).toMatch(/SCF #44: SCF 46 -> 47 and ours 43 -> 44/);
	});
});

describe("parseShortfallBaseline: a broken baseline is could-not-check, never empty", () => {
	const ok = {
		asOf: "2026-11-11",
		rounds: [{ round: 44, scf: 46, ours: 43, missing: [] }],
	};
	it("reads a well-formed baseline", () => {
		expect(parseShortfallBaseline(ok)).toEqual(ok);
		// equal counts are a recorded swap, read only with the pages named
		const swap = {
			asOf: "2026-11-11",
			rounds: [{ round: 37, scf: 19, ours: 19, missing: ["paysomeai-7gh"] }],
		};
		expect(parseShortfallBaseline(swap)).toEqual(swap);
	});
	it("refuses no date, no list, a non-shortfall, a repeated round and junk", () => {
		const bad = [
			null,
			{ rounds: [] },
			{ asOf: "2026-11-11" },
			{
				asOf: "2026-11-11",
				rounds: [{ round: 33, scf: 13, ours: 14, missing: [] }],
			},
			{
				asOf: "2026-11-11",
				rounds: [{ round: 33, scf: 13, ours: 13, missing: [] }],
			},
			{
				asOf: "2026-11-11",
				rounds: [{ round: "44", scf: 46, ours: 43, missing: [] }],
			},
			{ asOf: "2026-11-11", rounds: [{ round: 44, scf: 46, ours: 43 }] },
			{ asOf: "2026-11-11", rounds: [ok.rounds[0], ok.rounds[0]] },
		];
		for (const b of bad)
			expect(parseShortfallBaseline(b)).toHaveProperty("error");
	});
	it("the committed baseline is valid, dated, and lists no SCF #45 gap", () => {
		const b = parseShortfallBaseline(baselineFile);
		if ("error" in b) throw new Error(b.error);
		expect(b.asOf).toBe("2026-11-12");
		expect(b.rounds.map((e) => e.round)).not.toContain(45);
		// sls-116: 34 short rounds short by 119 and 5 swaps (2026-11-11)
		// become 20 short rounds short by 27 and no swap once the sync reads
		// the pages outside the listing
		expect(b.rounds.filter((e) => e.scf > e.ours)).toHaveLength(20);
		expect(b.rounds.filter((e) => e.scf === e.ours)).toEqual([]);
		expect(b.rounds.reduce((n, e) => n + e.scf - e.ours, 0)).toBe(27);
		for (const e of b.rounds)
			expect(e.missing.length, `#${e.round}`).toBeGreaterThan(0);
	});
});
