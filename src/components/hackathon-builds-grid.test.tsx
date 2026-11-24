// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	type BuildCardRow,
	HackathonBuildsGrid,
} from "./hackathon-builds-grid";

const row = (id: string, over: Partial<BuildCardRow> = {}): BuildCardRow => ({
	id,
	name: id,
	href: `https://dorahacks.io/buidl/${id}`,
	external: true,
	repo: null,
	track: null,
	placement: null,
	isWinner: false,
	status: null,
	blurb: null,
	contracts: 0,
	stack: [],
	project: null,
	links: [],
	...over,
});
const render = (rows: BuildCardRow[]) =>
	renderToStaticMarkup(<HackathonBuildsGrid rows={rows} />);
const count = (html: string, s: string) => html.split(s).length - 1;

describe("HackathonBuildsGrid", () => {
	it("pages 48 cards at a time, as the builders directory does", () => {
		const html = render(Array.from({ length: 50 }, (_, i) => row(`b${i}`)));
		expect(count(html, 'class="idea-card')).toBe(48);
		expect(html).toContain("Show 2 more");
		expect(html).toContain(">48 of 50</span>");
	});

	it("a card opens its repo first: name, a GitHub button and owner/repo; demo, its own page and its directory project after", () => {
		const html = render([
			row("vault", { track: "Genesis", contracts: 2 }),
			row("nest", {
				href: "https://github.com/ethan-r13n/nest",
				repo: "https://github.com/ethan-r13n/nest",
				isWinner: true,
				placement: { label: "First place", classes: "x" },
				stack: ["Stellar JS SDK", "Freighter API", "Blend SDK", "x402"],
				project: { slug: "nest", name: "Nest" },
				links: [
					{ label: "Demo", href: "https://nest.example" },
					{
						label: "HackProof",
						href: "https://github.com/devodii/hackproof/x.yml",
					},
				],
			}),
		]);
		expect(html).toContain(">Genesis</span>");
		expect(html).toContain("2 contracts on testnet");
		expect(html).toContain(">First place</span>");
		// The name and the GitHub button both open the repo.
		expect(count(html, 'href="https://github.com/ethan-r13n/nest"')).toBe(2);
		expect(html).toContain("ethan-r13n/nest</p>");
		expect(html).toContain('src="https://github.com/ethan-r13n.png?size=64"');
		// No internal basis or source jargon on a card.
		expect(html).not.toMatch(/secondhand|Listed placement|repo-names-event/i);
		// Three libraries, then a count of the rest.
		expect(html).toContain(">Blend SDK</span>");
		expect(html).not.toContain(">x402</span>");
		expect(html).toContain(">+1</span>");
		expect(html).toContain('href="/project/nest"');
		expect(html).toContain('href="https://nest.example"');
		// No card is one link around others.
		let depth = 0;
		for (const m of html.matchAll(/<a[\s>]|<\/a>/g)) {
			depth += m[0] === "</a>" ? -1 : 1;
			expect(depth).toBeLessThanOrEqual(1);
		}
	});
});
