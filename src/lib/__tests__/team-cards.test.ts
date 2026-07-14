import { describe, expect, it } from "vitest";
import { extractPersonCards, renderRosterMarkdown } from "../team-cards";

/** Minimal shape mirroring stellar.org/foundation/team's __NEXT_DATA__:
 * Sanity `card` blocks for people, a `drawerPanel`/`foundationPage` prose block,
 * and the client-search widget's placeholder cards. */
function page(nextData: unknown): string {
	return `<html><body><main>names render here</main><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
		nextData,
	)}</script></body></html>`;
}

const FIXTURE = page({
	props: {
		pageProps: {
			content: [
				{
					_type: "foundationPage",
					title: "The SDF Team",
					description:
						"Our goal is to unlock the world's economic potential by making money more fluid, markets more open, and people more empowered.",
				},
				{
					_type: "section",
					items: [
						{
							_type: "card",
							title: "David Mazières",
							description: "Founder and Chief Scientist",
						},
						{
							_type: "card",
							title: "Justin Rice",
							description: "VP of Ecosystem",
						},
						{
							_type: "card",
							title: "Denelle Dixon",
							description: "CEO and Executive Director",
						},
						// board affiliation (longer but still a role)
						{
							_type: "card",
							title: "Patrick Collison",
							description: "CEO of Stripe",
						},
						// duplicate — must dedupe
						{
							_type: "card",
							title: "Justin Rice",
							description: "VP of Ecosystem",
						},
						// UI-placeholder search states — must be dropped
						{
							_type: "card",
							title: "Sorry, no matches found.",
							description: "Please try a different search term.",
						},
						{
							_type: "card",
							title: "Search error, apologies!",
							description: "Please try again. Thanks for your patience.",
						},
					],
				},
				// prose block with title+description but NOT a person (_type != card, long desc)
				{
					_type: "drawerPanel",
					title: "About Stellar",
					description:
						"The Stellar network is an open-source blockchain designed to move value the way information moves on the internet, quickly and cheaply.",
				},
			],
		},
	},
});

describe("extractPersonCards", () => {
	it("pairs each leadership/board name with its role", () => {
		const cards = extractPersonCards(FIXTURE);
		expect(cards).toContainEqual({
			name: "David Mazières",
			role: "Founder and Chief Scientist",
		});
		expect(cards).toContainEqual({
			name: "Justin Rice",
			role: "VP of Ecosystem",
		});
		expect(cards).toContainEqual({
			name: "Denelle Dixon",
			role: "CEO and Executive Director",
		});
		expect(cards).toContainEqual({
			name: "Patrick Collison",
			role: "CEO of Stripe",
		});
	});

	it("drops the client-search placeholder cards", () => {
		const names = extractPersonCards(FIXTURE).map((c) => c.name);
		expect(names.some((n) => /sorry|apolog|no matches/i.test(n))).toBe(false);
	});

	it("ignores non-person blocks (prose sections, page/drawer descriptions)", () => {
		const names = extractPersonCards(FIXTURE).map((c) => c.name);
		expect(names).not.toContain("The SDF Team");
		expect(names).not.toContain("About Stellar");
	});

	it("de-duplicates repeated name+role", () => {
		const jr = extractPersonCards(FIXTURE).filter(
			(c) => c.name === "Justin Rice",
		);
		expect(jr).toHaveLength(1);
	});

	it("returns [] on a page with no __NEXT_DATA__ (fails safe → ingester signature guard reds)", () => {
		expect(extractPersonCards("<html><main>no data</main></html>")).toEqual([]);
	});

	it("renders one quotable line per pair", () => {
		const md = renderRosterMarkdown([
			{ name: "David Mazières", role: "Founder and Chief Scientist" },
		]);
		expect(md).toContain("- David Mazières — Founder and Chief Scientist");
		expect(md).toMatch(/^## SDF leadership and board/);
	});
});
