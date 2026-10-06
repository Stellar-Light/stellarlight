import { describe, expect, it } from "vitest";
import {
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
