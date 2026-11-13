/**
 * sls-116: SCF awards in rounds before #45 that no row carried, and an award
 * a row carried that its source does not support. On 2026-11-12 SCF's round
 * pages named 216 projects outside the 531-row listing with an award or a
 * pending submission, and the enrich read only the 117 a hand map named. The
 * StellarPay row served SCF #30 and $148,400 copied from the Arculus page,
 * which the arculus row also carries; StellarPay's own page (stellarpay-dy1,
 * outside the listing) awards SCF #2 and marks #30 Not Awarded.
 */
import { describe, expect, it } from "vitest";
import {
	type JoinRow,
	joinOffListing,
	SCF_PAGES_BEYOND_CAP,
	SCF_SLUG_OVERRIDES,
	sharedLink,
	strandedAwards,
} from "../../../scripts/data/scf-joins";
import {
	offListingAwardees,
	readProjectRecord,
	readScfPage,
	storedTotal,
	uniqueNames,
} from "../../../scripts/eval/scf-official";
import { compareRoundCounts, type ScfRound } from "../scf-round-counts";

const PAGE = "https://communityfund.stellar.org/project/";
/** One SCF page as the browser receives it: the flight stream in chunks. */
const flight = (...parts: string[]) =>
	parts
		.map((p) => `<script>self.__next_f.push([1,${JSON.stringify(p)}])</script>`)
		.join("");

const indexOf = (rows: JoinRow[]) => {
	const bySlug = new Map(rows.map((r) => [r.slug, r]));
	const identityOf = (r: JoinRow) =>
		r.canonicalSlug && bySlug.has(r.canonicalSlug) ? r.canonicalSlug : r.slug;
	return {
		rows,
		bySlug,
		identityOf,
		byNormName: uniqueNames(rows, identityOf),
	};
};

describe("SCF's round pages find the awards its listing does not carry (sls-116)", () => {
	it("every project a round page awards or still holds, outside the listing, Blend-style", () => {
		const rounds: ScfRound[] = [
			{
				round: 29,
				phase: "Ended",
				submissions: [
					{ id: "s1", project: "recMystic", verdict: "awarded" },
					{ id: "s2", project: "recListed", verdict: "awarded" },
					{ id: "s3", project: "recLost", verdict: "declined" },
					// a funded submission can sit in a pipeline status for years
					{ id: "s4", project: "recPipeline", verdict: "pending" },
					{ id: "s5", project: null, verdict: "awarded" },
				],
			},
			{
				round: 30,
				phase: "Ended",
				submissions: [{ id: "s6", project: "recMystic", verdict: "awarded" }],
			},
			{ round: 31, phase: "Ended", submissions: null },
		];
		expect(offListingAwardees(rounds, new Set(["recListed"])).sort()).toEqual([
			"recMystic",
			"recPipeline",
		]);
	});

	it("/project/<record id> is read for the page's own record: id, slug, title, last award", () => {
		const html = flight(
			'2:["$","$L1c",null,{"project":{"id":"recBlueMarble","title":"The Blue Marble","slug":"the-blue-',
			'marble-zsl","totalAwarded":328000,"totalPaid":0,"siteUrls":{"website":"https://thebluemarble.io","github":"https://github.com/orgs/taskdotio"},"awarded":true,"lastAwardedRound":13,"submissions":[{"id":"recS10","title":"Fandom","status":"Awarded","roundName":"SCF #10","budget":180000,"awardType":"Legacy v3.0 Award"}]}}]',
		);
		expect(readProjectRecord(html)).toEqual({
			id: "recBlueMarble",
			slug: "the-blue-marble-zsl",
			title: "The Blue Marble",
			lastAwardedRound: 13,
		});
		const notFound = flight('{"digest":"NEXT_NOT_FOUND"}');
		expect(readProjectRecord(notFound)).toBeNull();
	});

	it("a record that does not say awarded pins no SCF round: its number can be a Kickstart round", () => {
		// money-app-treasury-and-invoice-dashboard-8ey (2026-11-12): Kickstart
		// Eligible, $10,000 paid, lastAwardedRound 11, and SCF #11's page does
		// not list it. Read as a pin it counted an SCF #11 award no row has.
		const html = flight(
			'{"project":{"id":"recywttEzUxr5Z8Ey","title":"Money app Treasury and Invoice Dashboard","slug":"money-app-treasury-and-invoice-dashboard-8ey","totalAwarded":0,"totalPaid":10000,"status":"Kickstart Eligible","siteUrls":{"website":"https://www.sfxchange.co/en"},"lastAwardedRound":11,"buildAwardRounds":["SCF #38"],"submissions":[{"id":"rec4BZ","title":"Money app","status":"Panel Review","roundName":"SCF #38"}]}}',
		);
		expect(readProjectRecord(html)?.lastAwardedRound).toBeNull();
	});

	it("a follow button is not the project's X account", () => {
		// pactta-api-kgf links twitter.com/intent/follow?screen_name=paychant
		const html = flight(
			'{"project":{"id":"recPactta","title":"Pactta API","slug":"pactta-api-kgf","totalAwarded":120700,"siteUrls":{"website":"https://www.pactta.com","x":"https://twitter.com/intent/follow?screen_name=paychant"},"awarded":true,"lastAwardedRound":16,"submissions":[{"id":"recP16","title":"Pactta","status":"Awarded","roundName":"SCF #16","budget":120700,"awardType":"Legacy v4.0 Award"}]}}',
		);
		const page = readScfPage(html, "pactta-api-kgf");
		expect(page?.website).toBe("https://www.pactta.com");
		expect(page?.twitter).toBeUndefined();
	});

	it("a title with a double quote in it is still a page (Fixie, SCF #21)", () => {
		const html = flight(
			'{"project":{"id":"recFuxFJeZZ4dRdxh","title":"Fixed Rate \\"Fixie\\"","slug":"fixed-rate-fixie-dxh","totalAwarded":4900,"siteUrls":{"website":"https://jetprotocol.io"},"awarded":true,"lastAwardedRound":21,"submissions":[{"id":"recF21","title":"Fixie","status":"Awarded","roundName":"SCF #21","budget":4900,"awardType":"Build"}]}}',
		);
		expect(readScfPage(html, "fixed-rate-fixie-dxh")).toMatchObject({
			title: 'Fixed Rate "Fixie"',
			pageSlug: "fixed-rate-fixie-dxh",
			awardedRounds: [21],
			website: "https://jetprotocol.io",
		});
		expect(readProjectRecord(html)?.title).toBe('Fixed Rate "Fixie"');
	});
});

describe("a page outside the listing joins one row, by a reviewed entry or a name a link confirms (sls-116)", () => {
	const rows: JoinRow[] = [
		{
			slug: "stellarpay",
			name: "StellarPay",
			links: { github: "https://github.com/stellarpay" },
		},
		{
			slug: "the-hub",
			name: "THE HUB",
			links: { website: "https://thehubdao.xyz/" },
		},
		{
			slug: "the-blue-marble",
			name: "The Blue Marble",
			links: { github: "https://github.com/taskdotio" },
		},
		{ slug: "wally", name: "Wally", links: {} },
		{
			slug: "sorosplits",
			name: "SoroSplits",
			links: { website: "https://github.com/findolor/sorosplits" },
		},
		{
			slug: "blend",
			name: "Blend",
			links: { website: "https://blend.capital" },
		},
		{
			slug: "gatewayfm",
			name: "Gateway.fm",
			links: { website: "https://gateway.fm/" },
		},
	];
	const index = indexOf(rows);
	const slugOf = (page: Parameters<typeof joinOffListing>[0]) => {
		const j = joinOffListing(page, index);
		return j.row?.slug;
	};

	it("a reviewed entry joins whatever the title says", () => {
		// StellarPay's own 2018 page: no links, its description names Shopify
		// merchants, as the row's does
		expect(slugOf({ slug: "stellarpay-dy1", title: "StellarPay" })).toBe(
			"stellarpay",
		);
		expect(slugOf({ slug: "blend-mfy", title: "Blend" })).toBe("blend");
		expect(
			slugOf({
				slug: "oz-accounts-policy-builder-by-gatewayfm-mqp",
				title: "OZ Accounts Policy Builder by Gateway.fm",
			}),
		).toBe("gatewayfm");
	});

	it("a name joins only with a link the page and the row share", () => {
		expect(
			joinOffListing(
				{
					slug: "the-hub-citizens-portal-yac",
					title: "THE HUB: Citizens Portal",
					website: "https://www.thehubdao.xyz/",
				},
				index,
			),
		).toMatchObject({
			row: { slug: "the-hub" },
			how: "name, site thehubdao.xyz",
		});
		// SCF writes an org link as github.com/orgs/<owner>
		expect(
			slugOf({
				slug: "the-blue-marble-zsl",
				title: "The Blue Marble",
				github: "https://github.com/orgs/taskdotio",
			}),
		).toBe("the-blue-marble");
		// the same name with no link is a hypothesis: a person decides
		expect(
			joinOffListing({ slug: "wally-ygy", title: "Wally" }, index),
		).toEqual({
			why: "name only, no link the page and the row share",
			candidate: rows[3],
		});
		expect(
			joinOffListing({ slug: "nobody-abc", title: "Nobody" }, index),
		).toEqual({
			why: "no row of the page's name",
		});
	});

	it("a code host is not a site: two owners on github.com share nothing, one owner does", () => {
		expect(
			sharedLink({ website: "https://github.com/someone/sorodrop" }, rows[4]),
		).toBeNull();
		expect(
			sharedLink({ github: "https://github.com/findolor/sorodrop" }, rows[4]),
		).toBe("github findolor");
	});

	it("each reviewed page joins one row: no page in both maps for two rows", () => {
		const byPage = new Map<string, string>();
		for (const [ours, page] of Object.entries(SCF_PAGES_BEYOND_CAP)) {
			expect(byPage.get(page) ?? ours, page).toBe(ours);
			byPage.set(page, ours);
		}
		for (const [page, ours] of Object.entries(SCF_SLUG_OVERRIDES))
			expect(byPage.get(page) ?? ours, page).toBe(ours);
	});
});

describe("one page, one row: an award copied from another project's page is removed (sls-116)", () => {
	type Row = JoinRow & {
		scf?: {
			awarded?: boolean;
			slug?: string | null;
			basis?: string | null;
			awardedRounds?: number[];
		};
	};
	const rows: Row[] = [
		// the fossil: Arculus's page, copied by a substring matcher
		{
			slug: "stellarpay",
			name: "StellarPay",
			scf: {
				awarded: true,
				slug: "arculus-x-stellar-payments-with-soroban-fpz",
				basis: null,
				awardedRounds: [30],
			},
		},
		{
			slug: "arculus",
			name: "Arculus",
			scf: {
				awarded: true,
				slug: "arculus-x-stellar-payments-with-soroban-fpz",
				basis: "official-record",
				awardedRounds: [30],
			},
		},
		// a lineage shadow and its canonical row are one project
		{
			slug: "lul",
			name: "Lul",
			canonicalSlug: "lulpay",
			scf: { awarded: true, slug: "lul-ckz", awardedRounds: [29] },
		},
		{
			slug: "lulpay",
			name: "LulPay",
			scf: { awarded: true, slug: "lul-ckz", awardedRounds: [29] },
		},
		// curate's SCF_FIX owns a human-verified record
		{
			slug: "hermes",
			name: "Hermes",
			scf: {
				awarded: true,
				slug: "hermes-isy",
				basis: "human-verified",
				awardedRounds: [32],
			},
		},
		// a stored page that joins no row this run stands, unread
		{
			slug: "solang",
			name: "Solang",
			scf: {
				awarded: true,
				slug: "hyperledger-solang-dwa",
				awardedRounds: [33],
			},
		},
	];
	const bySlug = new Map(rows.map((r) => [r.slug, r]));
	const identityOf = (r: Row) =>
		r.canonicalSlug && bySlug.has(r.canonicalSlug) ? r.canonicalSlug : r.slug;
	const joinedPage = new Map([
		["arculus-x-stellar-payments-with-soroban-fpz", "arculus"],
		["lul-ckz", "lulpay"],
		["hermes-isy", "zenex"],
	]);

	it("only the row whose stored page another project joins loses the award", () => {
		const out = strandedAwards(
			rows,
			joinedPage,
			new Set(["arculus", "lulpay"]),
			identityOf,
		);
		expect(out.map((s) => [s.row.slug, s.page, s.owner])).toEqual([
			["stellarpay", "arculus-x-stellar-payments-with-soroban-fpz", "arculus"],
		]);
	});

	it("a row joined to its own page this run is rewritten from it, never removed", () => {
		const out = strandedAwards(
			rows,
			joinedPage,
			new Set(["arculus", "lulpay", "stellarpay"]),
			identityOf,
		);
		expect(out).toEqual([]);
	});

	it("StellarPay's page: #2 awarded, #30 refused, no total disclosed, so the copied $148,400 goes", () => {
		const html = flight(
			'{"project":{"id":"recSP","title":"StellarPay","slug":"stellarpay-dy1","totalAwarded":0,"totalPaid":0,"siteUrls":{},"awarded":true,"lastAwardedRound":2,"submissions":[',
			'{"id":"recSP2","title":"Shopify Merchants Can Now Accept Stellar Payments","status":"Awarded","roundName":"SCF #2","awardType":"Legacy v1.0 Award"},',
			'{"id":"recSP30","title":"StellarPay","status":"Not Awarded","roundName":"SCF #30","budget":150000,"awardType":"Build"}]}}',
		);
		const page = readScfPage(html, "stellarpay-dy1");
		expect(page).toMatchObject({
			awardedRounds: [2],
			notAwardedRounds: [30],
			totalAwarded: 0,
		});
		// 0 on the page is no disclosed total: the stored one is cleared
		expect(storedTotal(page?.totalAwarded)).toBeNull();
		// a total the reader did not find leaves the stored one alone
		expect(storedTotal(undefined)).toBeUndefined();
		expect(storedTotal(148400)).toBe(148400);
	});
});

describe("the round-count ratchet judges awards outside the listing by their own page (sls-116)", () => {
	const whole = (top: number, given: ScfRound): ScfRound[] => [
		given,
		...Array.from({ length: top }, (_, i) => i + 1)
			.filter((n) => n !== given.round)
			.map((n) => ({
				round: n,
				phase: "Ended",
				submissions: [
					{ id: `f${n}`, project: null, verdict: "declined" as const },
				],
			})),
	];
	const rounds = whole(45, {
		round: 26,
		phase: "Ended",
		submissions: [{ id: "s1", project: "recBeyond", verdict: "awarded" }],
	});
	const listing = [
		{ id: "a", slug: "a-page", title: "A", lastAwardedRound: 45 },
	];
	const offListing = [
		{
			id: "recBeyond",
			slug: "beyond-page",
			title: "Beyond",
			lastAwardedRound: 26,
		},
	];

	it("an uncarried award outside the listing is named by its slug and judged", () => {
		const report = compareRoundCounts({
			rounds,
			listing,
			offListing,
			ours: [{ scfAwardedRounds: [45], scfSourceUrl: `${PAGE}a-page` }],
		});
		if (report.status === "could-not-check") throw new Error(report.reason);
		const r26 = report.rounds.find((r) => r.round === 26);
		expect(r26?.uncitedPages).toEqual(["beyond-page"]);
		expect(r26?.awardPages).toEqual(["beyond-page"]);
	});

	it("a row citing that page carries it", () => {
		const report = compareRoundCounts({
			rounds,
			listing,
			offListing,
			ours: [
				{ scfAwardedRounds: [45], scfSourceUrl: `${PAGE}a-page` },
				{ scfAwardedRounds: [26], scfSourceUrl: `${PAGE}beyond-page` },
			],
		});
		if (report.status === "could-not-check") throw new Error(report.reason);
		expect(report.rounds.find((r) => r.round === 26)).toMatchObject({
			scf: 1,
			ours: 1,
			verdict: "agrees",
			uncited: [],
		});
	});
});
