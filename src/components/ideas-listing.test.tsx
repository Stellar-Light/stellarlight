// @vitest-environment node

/**
 * /ideas and the brief pages: the page opens on the active quarter's briefs
 * as SCF's RFP Track page lists them (Q4 2026, published 2026-11-11), and the
 * dropped Q3 briefs render as closed past-round briefs, not as 404s.
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
	it("opens on Q4 2026 with SCF's two published briefs open, and every earlier quarter closed", () => {
		const html = renderToStaticMarkup(<IdeasListing />);
		expect(tabs(html)).toEqual([
			"Q4 2026: Open",
			"Q3 2026: Closed",
			"Q2 2026: Closed",
			"Q1 2026: Closed",
		]);
		expect(html).toContain(
			"Web and API Analytics for Stellar Ecosystem Projects",
		);
		expect(html).toContain(
			"XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide",
		);
		expect(html).not.toContain("No RFPs found");
		expect(html).not.toContain("SCF has not published its Q4 2026 RFPs yet");
	});
});

describe("a brief page", () => {
	const render = async (id: string) =>
		renderToStaticMarkup(
			await IdeaDetailPage({ params: Promise.resolve({ id }) }),
		);

	it("shows the brief SCF published apart from the idea summary", async () => {
		const html = await render("contract-source-verification");
		expect(html).toContain("Technical requirements (idea summary)");
		expect(html).not.toContain(">Technical Requirements<");
		expect(html).toContain("Published brief");
		expect(html).toContain(
			'href="https://github.com/stellar/scf-handbook/blob/1e04b79973358e3dea58d821ed6419b50c93370c/scf-awards/build-award/rfp-track.md"',
		);
		expect(html).toContain("SDF-allowlisted trusted build image");
		expect(html).toContain(
			"Fully deterministic Rust compilation as a research effort",
		);
	});

	it("sends a reader of a closed brief to the open ones, now that SCF lists some", async () => {
		const html = await render("layerzero-dvn");
		expect(html).toContain("Browse the currently open briefs instead");
		expect(html).not.toContain("No brief is open now");
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
