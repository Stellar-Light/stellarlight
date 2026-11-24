/**
 * sls-116, the two items the 2026-11-23 partial left open.
 *
 * 1. A source page per award. Ten rows combine two SCF pages and cite one:
 *    gatewayfm served SCF #44 with scfSourceUrl on its own page (#16 only),
 *    while #44 is on the OZ Accounts Policy Builder page. Each award now names
 *    the page it was read from, through every path the award takes (the page
 *    reader, the fold, a duplicate merge, searchProjects).
 * 2. The per-round counts by an operation. GET /api/projects/scf-rounds
 *    serves, per round, the awards SCF's round page lists against the awards
 *    served rows carry, page by page, with each gap and why.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	foldPageDetails,
	readScfPage,
} from "../../../scripts/eval/scf-official";
import { fillScfFromDupe } from "../scf-merge";
import {
	type CoverageRow,
	type ListedRound,
	listedRounds,
	readScfSide,
	roundCoverage,
	type ScfRound,
} from "../scf-round-counts";

const PAGE = "https://communityfund.stellar.org/project/";

/** One SCF project page as the reader sees it: the record and its cards. */
const scfPage = (
	slug: string,
	title: string,
	cards: Array<{ round: number; budget: number }>,
) =>
	[
		`{"project":{"id":"rec${slug}","title":"${title}","slug":"${slug}","totalAwarded":${cards.reduce((t, c) => t + c.budget, 0)},"awarded":true,"lastAwardedRound":${Math.max(...cards.map((c) => c.round))},"submissions":[`,
		cards
			.map(
				(c) =>
					`{"id":"rec${slug}${c.round}","title":"${title}","status":"Awarded","roundName":"SCF #${c.round}","budget":${c.budget},"awardType":"Build"}`,
			)
			.join(","),
		"]}}",
	].join("");

const gatewayPage = scfPage("gatewayfm-noq", "Gateway.fm", [
	{ round: 16, budget: 98000 },
]);
const ozPage = scfPage(
	"oz-accounts-policy-builder-by-gatewayfm-mqp",
	"OZ Accounts Policy Builder by Gateway.fm",
	[{ round: 44, budget: 150000 }],
);

describe("1. each award names the SCF page it was read from", () => {
	it("the page reader stamps every award with its own page", () => {
		const read = readScfPage(gatewayPage, "gatewayfm-noq");
		expect(read?.roundAwards?.map((r) => r.sourceUrl)).toEqual([
			`${PAGE}gatewayfm-noq`,
		]);
	});

	it("a row folding two pages keeps each award on its own page", () => {
		const fold = foldPageDetails([
			readScfPage(gatewayPage, "gatewayfm-noq"),
			readScfPage(ozPage, "oz-accounts-policy-builder-by-gatewayfm-mqp"),
		]);
		expect(fold?.roundAwards?.map((r) => [r.round, r.sourceUrl])).toEqual([
			[16, `${PAGE}gatewayfm-noq`],
			[44, `${PAGE}oz-accounts-policy-builder-by-gatewayfm-mqp`],
		]);
	});

	it("a duplicate merge moves each award with its page", () => {
		const out = fillScfFromDupe(
			{},
			{
				awarded: true,
				sourceUrl: `${PAGE}gatewayfm-noq`,
				roundAwards: [
					{
						round: 44,
						amountUSD: 150000,
						sourceUrl: `${PAGE}oz-accounts-policy-builder-by-gatewayfm-mqp`,
					},
				],
			},
		);
		expect(out?.scf.roundAwards?.[0]?.sourceUrl).toBe(
			`${PAGE}oz-accounts-policy-builder-by-gatewayfm-mqp`,
		);
	});
});

// ── the routes, through a fake store that honours `select` ──
type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
	docs: {} as Record<string, Record<string, unknown>[]>,
	fail: false,
}));
const find = vi.fn(
	async (args: { collection: string; select?: Record<string, unknown> }) => {
		if (h.fail) throw new Error("connection reset by peer");
		// Payload's select: `true` fields only (plus id); `false` fields excluded
		const sel = args.select;
		const exclude = sel && Object.values(sel).some((v) => v === false);
		const docs = (h.docs[args.collection] ?? []).map((d) =>
			sel
				? Object.fromEntries(
						Object.entries(d).filter(([k]) =>
							exclude ? sel[k] !== false : k === "id" || sel[k],
						),
					)
				: d,
		);
		return { docs, totalDocs: docs.length };
	},
);
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ find })),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));

const row = (
	slug: string,
	scf: Row,
	status = "Live",
	extra: Row = {},
): Row => ({
	id: slug,
	slug,
	name: slug,
	category: "Protocol/Contract",
	shortDescription: `${slug} on Stellar.`,
	status,
	types: [],
	scf: { awarded: true, ...scf },
	...extra,
});
const gatewayfm = (stamped: boolean) =>
	row("gatewayfm", {
		sourceUrl: `${PAGE}gatewayfm-noq`,
		awardedRounds: [16, 44],
		roundAwards: [
			{
				round: 16,
				amountUSD: 98000,
				...(stamped ? { sourceUrl: `${PAGE}gatewayfm-noq` } : {}),
			},
			{
				round: 44,
				amountUSD: 150000,
				...(stamped
					? {
							sourceUrl: `${PAGE}oz-accounts-policy-builder-by-gatewayfm-mqp`,
						}
					: {}),
			},
		],
	});

beforeEach(() => {
	vi.stubEnv("VOYAGE_API_KEY", "");
	h.fail = false;
	h.docs = {};
	find.mockClear();
});

describe("1. searchProjects serves each award's page", () => {
	it("scfRoundAwards[].sourceUrl is the page the award was read from", async () => {
		h.docs.projects = [gatewayfm(true)];
		const { GET } = await import("@/app/api/projects/search/route");
		const body = await (
			await GET(
				new NextRequest("https://x.test/api/projects/search?q=gatewayfm"),
			)
		).json();
		const p = body.projects.find(
			(r: { slug: string }) => r.slug === "gatewayfm",
		);
		expect(p.scfSourceUrl).toBe(`${PAGE}gatewayfm-noq`);
		expect(
			p.scfRoundAwards.map((a: { round: number; sourceUrl: string }) => [
				a.round,
				a.sourceUrl,
			]),
		).toEqual([
			[16, `${PAGE}gatewayfm-noq`],
			[44, `${PAGE}oz-accounts-policy-builder-by-gatewayfm-mqp`],
		]);
	});
});

// SCF #44 as its round page lists it: three awards on three project pages.
const round44: ScfRound = {
	round: 44,
	phase: "Ended",
	pageUrl: "https://communityfund.stellar.org/awards/rec44",
	readAt: "2026-11-23T10:00:00.000Z",
	submissions: [
		{ id: "s1", project: "recOZ", verdict: "awarded" },
		{ id: "s2", project: "recPK", verdict: "awarded" },
		{ id: "s3", project: "recSV", verdict: "awarded" },
		{ id: "s4", project: "recXX", verdict: "declined" },
	],
};
const round15: ScfRound = {
	round: 15,
	phase: "Ended",
	submissions: [
		{ id: "rec52b54tNWXJ3tI3", project: null, verdict: "awarded" },
		{ id: "s6", project: "recEL", verdict: "awarded" },
	],
};
const listing = [
	{
		id: "recOZ",
		slug: "oz-accounts-policy-builder-by-gatewayfm-mqp",
		title: "OZ",
		lastAwardedRound: 44,
	},
	{ id: "recPK", slug: "passkey-ui-sj6", title: "PK", lastAwardedRound: 44 },
	{
		id: "recSV",
		slug: "soroban-contract-source-verification-service-bax",
		title: "SV",
		lastAwardedRound: 44,
	},
	{ id: "recEL", slug: "elio-dao-8ut", title: "Elio", lastAwardedRound: 15 },
];
const rounds = (extra: ScfRound[] = []): ListedRound[] => {
	const all = [round15, round44, ...extra];
	const side = readScfSide({
		// the index numbers rounds from 1 without a gap
		rounds: [
			...Array.from({ length: 44 }, (_, i) => i + 1)
				.filter((n) => n !== 15 && n !== 44)
				.map((n) => ({
					round: n,
					phase: "Ended",
					submissions: [
						{ id: `x${n}`, project: "recXX", verdict: "declined" as const },
					],
				})),
			...all,
		],
		listing,
	});
	if (side.status !== "read") throw new Error(side.reason);
	const out = listedRounds(all, side);
	if (!Array.isArray(out)) throw new Error(out.unresolved.join());
	return out;
};

describe("2. listedRounds: what the SCF sync stores", () => {
	it("names each award by page, an award with no page by submission", () => {
		const [r15, r44] = rounds();
		expect(r44).toMatchObject({
			round: 44,
			pageUrl: "https://communityfund.stellar.org/awards/rec44",
			readAt: "2026-11-23T10:00:00.000Z",
			awards: [
				{
					page: "oz-accounts-policy-builder-by-gatewayfm-mqp",
					submission: null,
				},
				{ page: "passkey-ui-sj6", submission: null },
				{
					page: "soroban-contract-source-verification-service-bax",
					submission: null,
				},
			],
		});
		expect(r15.awards).toEqual([
			{ page: "elio-dao-8ut", submission: null },
			{ page: null, submission: "rec52b54tNWXJ3tI3" },
		]);
	});

	it("a record no page resolved is a partial read, never stored", () => {
		const side = readScfSide({
			rounds: [
				{
					round: 1,
					phase: "Ended",
					submissions: [{ id: "s", project: "recGONE", verdict: "awarded" }],
				},
			],
			listing,
		});
		if (side.status !== "read") throw new Error(side.reason);
		expect(listedRounds([], side)).toEqual([]);
		expect(
			listedRounds([{ round: 1, phase: "Ended", submissions: [] }], side),
		).toEqual({ unresolved: ["recGONE"] });
	});
});

describe("2. roundCoverage: page by page, with each gap and why", () => {
	const others = [
		row("soropass", {
			sourceUrl: `${PAGE}passkey-ui-sj6`,
			awardedRounds: [44],
			roundAwards: [{ round: 44, sourceUrl: `${PAGE}passkey-ui-sj6` }],
		}),
		row(
			"elio-dao",
			{ sourceUrl: `${PAGE}elio-dao-8ut`, awardedRounds: [15] },
			"Draft",
		),
	];

	it("a folded award is carried once it names its own page", () => {
		const r44 = roundCoverage(rounds(), [
			gatewayfm(true),
			...others,
		] as CoverageRow[]).find((r) => r.round === 44);
		expect(r44).toMatchObject({
			roundPageUrl: "https://communityfund.stellar.org/awards/rec44",
			listed: 3,
			carried: 2,
			rowsClaiming: 2,
			notListed: [],
			notCarried: [
				{
					pageUrl: `${PAGE}soroban-contract-source-verification-service-bax`,
					submissionId: null,
					reason: "no-row",
					draftSlugs: [],
				},
			],
		});
	});

	it("before the award names its page, the row's one page is all it cites", () => {
		const r44 = roundCoverage(rounds(), [
			gatewayfm(false),
			...others,
		] as CoverageRow[]).find((r) => r.round === 44);
		expect(r44?.carried).toBe(1);
		expect(r44?.notListed).toEqual([
			{ slug: "gatewayfm", pageUrls: [`${PAGE}gatewayfm-noq`] },
		]);
	});

	it("says why: a Draft row only, or no project page", () => {
		const r15 = roundCoverage(rounds(), others as CoverageRow[]).find(
			(r) => r.round === 15,
		);
		expect(r15?.carried).toBe(0);
		expect(r15?.notCarried).toEqual([
			{
				pageUrl: `${PAGE}elio-dao-8ut`,
				submissionId: null,
				reason: "draft-row-only",
				draftSlugs: ["elio-dao"],
			},
			{
				pageUrl: null,
				submissionId: "rec52b54tNWXJ3tI3",
				reason: "no-project-page",
				draftSlugs: [],
			},
		]);
	});

	it("names an award two served rows carry, and a round only rows claim", () => {
		const shared = {
			sourceUrl: `${PAGE}passkey-ui-sj6`,
			awardedRounds: [44, 45],
		};
		const cov = roundCoverage(rounds(), [
			...others,
			row("passkey-copy", shared),
		] as CoverageRow[]);
		expect(cov.find((r) => r.round === 44)?.carriedOnSeveralRows).toEqual([
			{ pageUrl: `${PAGE}passkey-ui-sj6`, slugs: ["passkey-copy", "soropass"] },
		]);
		expect(cov[0]).toMatchObject({
			round: 45,
			phase: null,
			roundPageUrl: null,
			listed: 0,
			notListed: [
				{ slug: "passkey-copy", pageUrls: [`${PAGE}passkey-ui-sj6`] },
			],
		});
	});
});

describe("2. GET /api/projects/scf-rounds", () => {
	const get = async (qs = "") => {
		const { GET } = await import("@/app/api/projects/scf-rounds/route");
		const res = await GET(
			new NextRequest(`https://x.test/api/projects/scf-rounds${qs}`),
		);
		return { res, body: await res.json() };
	};

	it("serves each round against the rows, with the round page and read time", async () => {
		h.docs["scf-round-reads"] = [
			{ id: "r", readAt: "2026-11-23T10:05:00.000Z", rounds: rounds() },
		];
		h.docs.projects = [gatewayfm(true), ...soropassRow()];
		const { res, body } = await get("?round=44");
		expect(res.status).toBe(200);
		expect(body.meta.scfReadAt).toBe("2026-11-23T10:05:00.000Z");
		expect(body.totals).toEqual({
			rounds: 1,
			listed: 3,
			carried: 2,
			notCarried: 1,
			carriedOnSeveralRows: 0,
			notListed: 0,
			// no row carries a paid read in this fixture: not checked, never 0
			buildSharesRead: null,
			buildFinalTranchePaid: null,
		});
		expect(body.rounds[0].roundPageUrl).toBe(
			"https://communityfund.stellar.org/awards/rec44",
		);
		expect(body.rounds[0].readAt).toBe("2026-11-23T10:00:00.000Z");
	});

	it("no stored read is null with a reason, never a zero count", async () => {
		h.docs.projects = [gatewayfm(true)];
		const { res, body } = await get();
		expect(res.status).toBe(200);
		expect(body.rounds).toBeNull();
		expect(body.totals).toBeNull();
		expect(body.unavailable).toMatch(/not stored a whole read/);
	});

	it("a failed read is an outage; a bad round or param is a 400", async () => {
		h.fail = true;
		expect((await get()).res.status).toBe(503);
		h.fail = false;
		expect((await get("?round=0")).res.status).toBe(400);
		expect((await get("?rounds=44")).body.validParams).toEqual(["round"]);
	});
});

function soropassRow(): Row[] {
	return [
		row("soropass", {
			sourceUrl: `${PAGE}passkey-ui-sj6`,
			awardedRounds: [44],
			roundAwards: [{ round: 44, sourceUrl: `${PAGE}passkey-ui-sj6` }],
		}),
	];
}
