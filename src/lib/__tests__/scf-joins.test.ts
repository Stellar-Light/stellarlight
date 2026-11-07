/**
 * Which SCF page joins which directory row (scripts/data/scf-joins.ts), and
 * what the reader takes off a page (readScfPage). Shapes from the pages read
 * 2026-11-07: wellspring-xuv is a RampMeDaddy submission whose SCF record was
 * retitled "Wellspring", so it joined our wellspring row by name and that row
 * served RampMeDaddy's #30 and $150,000.
 */
import { describe, expect, it } from "vitest";
import {
	foldLinkNote,
	type JoinRow,
	matchListingRow,
} from "../../../scripts/data/scf-joins";
import { readScfPage, uniqueNames } from "../../../scripts/eval/scf-official";

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

const wellspring: JoinRow = {
	slug: "wellspring",
	name: "Wellspring",
	links: {
		website: "https://wellspring.money/",
		github: "https://github.com/acme/treasury-mvp",
	},
};
const rows: JoinRow[] = [
	wellspring,
	{
		slug: "rampmedaddy",
		name: "RampMeDaddy",
		links: {
			website: "https://rampmedaddy.com/",
			github: "https://github.com/acme/rampmedaddy-frontend",
		},
	},
	{
		slug: "vaquita",
		name: "Vaquita",
		links: { website: "https://vaquita.fi/" },
	},
	{
		slug: "swiftex",
		name: "SwiftEx",
		links: { website: "https://swiftexchange.io/" },
	},
];

describe("SCF page joins (2026-11-07)", () => {
	it("a page SCF retitled with another project's name joins its own project", () => {
		const index = indexOf(rows);
		expect(
			matchListingRow({ slug: "wellspring-xuv", title: "Wellspring" }, index)
				?.slug,
		).toBe("rampmedaddy");
		expect(
			matchListingRow({ slug: "wellspring-rdo", title: "Wellspring" }, index)
				?.slug,
		).toBe("wellspring");
	});

	it("a renamed record and a two-page project still join their row", () => {
		const index = indexOf(rows);
		const slugOf = (slug: string, title: string) =>
			matchListingRow({ slug, title }, index)?.slug;
		expect(
			slugOf("vaquita-gamified-finance-pqq", "Vaquita: Gamified Finance"),
		).toBe("vaquita");
		expect(slugOf("swiftex-qxc", "SwiftEx")).toBe("swiftex");
		expect(slugOf("swiftex-0ll", "SwiftEx")).toBe("swiftex");
	});

	it("a fold of name-joined pages is confirmed only by a link each page shares with the row", () => {
		// swiftex-qxc and swiftex-0ll both publish swiftexchange.io, the row's
		// site: one project.
		expect(
			foldLinkNote(
				[
					{ website: "https://swiftexchange.io" },
					{
						website: "https://swiftexchange.io/",
						github: "https://github.com/acme-wallet/SwiftEx",
					},
				],
				rows[3],
			),
		).toBe("swiftexchange.io");
		// The RampMeDaddy page shares only a GitHub org with Wellspring (one
		// company, two products): no link confirms it.
		expect(
			foldLinkNote(
				[
					{ website: "https://wellspring.money" },
					{ github: "https://github.com/acme/rampmedaddy-frontend/" },
				],
				wellspring,
			),
		).toBeNull();
	});
});

describe("readScfPage", () => {
	it("a page with no project record for its slug is not a page", () => {
		// SCF renamed Vaquita's record; the old slug answers HTTP 200 with
		// Next's not-found payload and no project in it.
		const notFound =
			'<html><script>self.__next_f.push([1,"{\\"digest\\":\\"NEXT_NOT_FOUND\\"}"])</script></html>';
		expect(readScfPage(notFound, "vaquita-gamified-savings-pqq")).toBeNull();
	});

	it("reads the verdicts and the awarded total, never buildAwardRounds or totalPaid", () => {
		const page = [
			'{"project":{"id":"recVaq","title":"Vaquita: Gamified Finance","slug":"vaquita-gamified-finance-pqq","totalAwarded":64900,"totalPaid":79900,"awarded":true,"lastAwardedRound":42,"buildAwardRounds":["SCF #38","SCF #39","SCF #40","SCF #42","SCF #46"],"submissions":[',
			'{"id":"recV42","title":"Vaquita: Gamified savings","status":"Awarded","roundName":"SCF #42","budget":64900,"awardType":"Build"},',
			'{"id":"recV40","title":"Vaquita: Gamified savings","status":"Not Awarded","roundName":"SCF #40","budget":122000,"awardType":"Build"},',
			'{"id":"recV39","title":"First gamify DeFi platform","status":"Not Awarded","roundName":"SCF #39","budget":60000,"awardType":"Build"},',
			'{"id":"recV38","title":"First Save-to-earn gamify DeFi platform","status":"Not Awarded","roundName":"SCF #38","budget":60000,"awardType":"Build"}',
			"]}}",
		].join("");
		const read = readScfPage(page, "vaquita-gamified-finance-pqq");
		expect(read).toMatchObject({
			pageSlug: "vaquita-gamified-finance-pqq",
			totalAwarded: 64900,
			awardedRounds: [42],
			notAwardedRounds: [38, 39, 40],
		});
		expect(read?.roundAwards).toEqual([
			{ round: 42, awardName: undefined, amountUSD: 64900, awardType: "Build" },
		]);
	});
});
