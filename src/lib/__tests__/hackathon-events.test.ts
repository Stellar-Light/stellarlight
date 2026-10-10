import { describe, expect, it } from "vitest";
import {
	eventPageMarkdown,
	JUDGING_HEADING,
	markdownSection,
	REQUIREMENTS_HEADING,
} from "@/lib/hackathon-events";

const PAGE = `# Stellar Hacks: Real-World ZK

Build anything with zero-knowledge.

# Submission Requirements

- A public repo
- A demo video

## Format
Under 3 minutes.

# Judging Criteria
Impact, Stellar integration, completeness.

# Key Dates
Oct 1`;

describe("what an organizer published", () => {
	it("reads a section to the next heading of its own level, sub-headings included", () => {
		expect(markdownSection(PAGE, REQUIREMENTS_HEADING)).toBe(
			"- A public repo\n- A demo video\n\n## Format\nUnder 3 minutes.",
		);
		expect(markdownSection(PAGE, JUDGING_HEADING)).toBe(
			"Impact, Stellar integration, completeness.",
		);
	});

	it("says nothing when the organizer published nothing", () => {
		expect(
			markdownSection("# Brief\nBuild things.", JUDGING_HEADING),
		).toBeNull();
		expect(markdownSection(null, JUDGING_HEADING)).toBeNull();
		expect(markdownSection("# Judging\n\n# Next", JUDGING_HEADING)).toBeNull();
	});
});

describe("eventPageMarkdown", () => {
	it("joins the description and each tab, naming a tab that has no heading", () => {
		expect(
			eventPageMarkdown("# Brief\n\nBuild on Stellar.", [
				{ name: "Judging Criteria", body: "- Innovation 30%\n- Impact 30%" },
				{ name: "Ideas", body: "# Ideas & Inspiration\n\nTry x402." },
				{ name: "Empty", body: "  " },
			]),
		).toBe(
			"# Brief\n\nBuild on Stellar.\n\n## Judging Criteria\n\n- Innovation 30%\n- Impact 30%\n\n# Ideas & Inspiration\n\nTry x402.",
		);
	});

	it("finds judging criteria published only in a tab", () => {
		const page = eventPageMarkdown("# Brief\n\nNo rules here.", [
			{ name: "Judging Criteria", body: "Innovation, impact, execution." },
			{
				name: "Project Submission Requirements",
				body: "A public repo and a demo video.",
			},
		]);
		expect(markdownSection(page, JUDGING_HEADING)).toBe(
			"Innovation, impact, execution.",
		);
		expect(markdownSection(page, REQUIREMENTS_HEADING)).toBe(
			"A public repo and a demo video.",
		);
	});

	it("is null when nothing was published", () => {
		expect(eventPageMarkdown(null, [])).toBeNull();
		expect(eventPageMarkdown("  ", [{ name: "x", body: "" }])).toBeNull();
	});
});
