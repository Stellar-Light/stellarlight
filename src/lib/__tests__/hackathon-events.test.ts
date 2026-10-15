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
	it("joins the description and each tab under its name, its headings one level down", () => {
		expect(
			eventPageMarkdown("# Brief\n\nBuild on Stellar.", [
				{ name: "Judging Criteria", body: "- Innovation 30%\n- Impact 30%" },
				{ name: "Ideas", body: "# Ideas & Inspiration\n\nTry x402." },
				{ name: "Empty", body: "  " },
			]),
		).toBe(
			"# Brief\n\nBuild on Stellar.\n\n# Judging Criteria\n\n- Innovation 30%\n- Impact 30%\n\n# Ideas\n\n## Ideas & Inspiration\n\nTry x402.",
		);
	});

	// Build on Stellar's requirements tab opens with its own sub-heading; read
	// from the joined page it stopped at "Core Requirements" and dropped the
	// rest, the English-only rule included.
	it("reads a requirements tab whole, sub-headings included", () => {
		const page = eventPageMarkdown("# Brief\n\nBuild on Stellar.", [
			{
				name: "Project Submission Requirements",
				body: "## Core Requirements\n\n- A public repo\n\n## Multiple Submissions Policy\n\nOne per team.\n\n## Language Requirements\n\nEnglish only.",
			},
			{ name: "Resources", body: "Docs." },
		]);
		const req = markdownSection(page, REQUIREMENTS_HEADING) ?? "";
		expect(req).toContain("A public repo");
		expect(req).toContain("Multiple Submissions Policy");
		expect(req).toContain("English only.");
		expect(req).not.toContain("Docs.");
	});

	it("ends a description's own section at the next tab", () => {
		const page = eventPageMarkdown("# Judging\n\nInnovation 50%.", [
			{ name: "Resources", body: "Docs at example.com" },
		]);
		expect(markdownSection(page, JUDGING_HEADING)).toBe("Innovation 50%.");
	});

	it("leaves a tab's code blocks alone", () => {
		expect(
			eventPageMarkdown(null, [
				{ name: "Setup", body: "```sh\n# install\npnpm i\n```" },
			]),
		).toBe("# Setup\n\n```sh\n# install\npnpm i\n```");
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
