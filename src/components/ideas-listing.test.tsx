// @vitest-environment node

/**
 * /ideas and the brief pages once SCF's RFP Track page names no open brief
 * (October 2026: Q4 RFPs coming soon): the page opens on the empty active
 * quarter without calling it open, and the dropped Q3 briefs render as
 * closed past-round briefs, not as 404s.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IdeaDetailPage from "@/app/(frontend)/ideas/[id]/page";
import { IdeasListing } from "./ideas-listing";

/** Each quarter tab's text, as the listing renders it. */
const tabs = (html: string) =>
	[...html.matchAll(/<button[^>]*>(Q\d \d{4})<div[^>]*>([^<]*)<\/div>/g)].map(
		(m) => `${m[1]}: ${m[2]}`,
	);

describe("/ideas", () => {
	it("opens on Q4 2026, coming soon with no brief, and every earlier quarter closed", () => {
		const html = renderToStaticMarkup(<IdeasListing />);
		expect(tabs(html)).toEqual([
			"Q4 2026: Coming soon",
			"Q3 2026: Closed",
			"Q2 2026: Closed",
			"Q1 2026: Closed",
		]);
		expect(html).toContain("No RFPs found");
	});
});

describe("the Q3 brief pages", () => {
	it.each([
		["layerzero-dvn", "Stellar-compatible LayerZero DVN"],
		["x402-facilitator-bazaar", "x402 Facilitator with Bazaar Discovery"],
	])("%s renders as a closed past-round brief", async (id, title) => {
		const html = renderToStaticMarkup(
			await IdeaDetailPage({ params: Promise.resolve({ id }) }),
		);
		expect(html).toContain(title);
		expect(html).toContain("Closed: past round");
		expect(html).toContain("This brief is closed");
		expect(html).not.toContain("Apply for Funding");
	});
});
