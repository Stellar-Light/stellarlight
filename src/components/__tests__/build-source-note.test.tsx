// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BuildSourceNote } from "../build-source-note";

const FILE = "https://example.test/hackmeridian-2026.yaml";
const html = (
	row: Parameters<typeof BuildSourceNote>[0]["row"],
	showSource = true,
	linkSource = true,
) =>
	renderToStaticMarkup(
		<BuildSourceNote
			row={row}
			event="HackMeridian 2026"
			showSource={showSource}
			linkSource={linkSource}
		/>,
	);

// Audit 2026-11-04: a builder's profile listed a HackProof row as a
// DoraHacks submission with "First place" and no word that it is secondhand.
describe("a build's source, basis and placement, said as the event page says them", () => {
	it("a row of a partial list: its basis, and its placement as the list's, secondhand, with the file", () => {
		const out = html({
			id: "curated-hackmeridian-2026-nest",
			entryBasis: "placement-listed",
			isWinner: true,
			winnerSource: FILE,
		});
		expect(out).toContain(
			"HackProof lists this repo as a placement; the repo&#x27;s own text does not name the event.",
		);
		expect(out).toContain(
			"The placement is HackProof&#x27;s, secondhand: no organizer page we read names the winners.",
		);
		expect(out).toContain(`href="${FILE}"`);
		expect(out).not.toContain("DoraHacks submission");
	});

	it("a DoraHacks row says so, and a placement DoraHacks assigned needs no source", () => {
		const out = html({ id: "dorahacks-buidl-1", isWinner: true });
		expect(out).toContain("DoraHacks submission");
		expect(out).not.toContain("secondhand");
		// On an event page, where every row is the event's, nothing is said.
		expect(html({ id: "dorahacks-buidl-1", isWinner: true }, false)).toBe("");
	});

	it("a win a page off DoraHacks names says so, with the page", () => {
		const out = html({
			id: "dorahacks-buidl-2",
			isWinner: true,
			winnerSource: FILE,
		});
		expect(out).toContain(
			"The placement is named off DoraHacks, by the page linked here",
		);
		expect(out).toContain(`href="${FILE}"`);
	});

	// Final re-check 2026-11-05: the event page's cards are links, and the
	// note's "Source" link inside them nested an <a> in an <a>.
	it("inside a card it names the source as text, never as a link", () => {
		const out = html(
			{
				id: "curated-hackmeridian-2026-nest",
				entryBasis: "placement-listed",
				isWinner: true,
				winnerSource: FILE,
			},
			false,
			false,
		);
		expect(out).not.toContain("<a");
		expect(out).toContain("Source: example.test/hackmeridian-2026.yaml");
	});
});
