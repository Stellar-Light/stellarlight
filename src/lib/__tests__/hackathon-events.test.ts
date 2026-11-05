import { describe, expect, it } from "vitest";
import {
	eventPageMarkdown,
	hiddenWinnersNote,
	JUDGING_HEADING,
	markdownSection,
	REQUIREMENTS_HEADING,
	submissionCoverageNote,
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

// L5-03 sweep, 2026-11-04: Stellar IdeaThon Mulheres Que Codam publishes
// "Critérios de Avaliação" on a line of its own, no heading, and the reader
// served judgingCriteria null for criteria the page lists.
describe("a section a page writes as a label line", () => {
	const MQC = [
		"Prêmios",
		"",
		"1ª 1.000,00",
		"",
		"Critérios de Avaliação",
		"",
		"Inovação e Originalidade, Melhor apresentação, Go to market, Qualidade Técnica",
		"",
		"Entregáveis",
		"",
		"- Repositório Git: [LINK]",
		"- Apresentação: [PDF]",
	].join("\n");

	it("reads the paragraph under the label, in Portuguese or Spanish too", () => {
		expect(markdownSection(MQC, JUDGING_HEADING)).toBe(
			"Inovação e Originalidade, Melhor apresentação, Go to market, Qualidade Técnica",
		);
		expect(markdownSection(MQC, REQUIREMENTS_HEADING)).toBe(
			"- Repositório Git: [LINK]\n- Apresentação: [PDF]",
		);
		expect(
			markdownSection(
				"**Criterios de evaluación**\n\nImpacto y uso de Stellar.",
				JUDGING_HEADING,
			),
		).toBe("Impacto y uso de Stellar.");
	});

	it("does not read a sentence, a list item or a long line as a label", () => {
		expect(
			markdownSection(
				"Judges evaluate every project on the same criteria regardless of category.\n\nNext.",
				JUDGING_HEADING,
			),
		).toBeNull();
		expect(markdownSection("- Judging\n\nNext.", JUDGING_HEADING)).toBeNull();
		// A heading still wins over a label line.
		expect(
			markdownSection(`Judging\n\nNot this.\n\n${PAGE}`, JUDGING_HEADING),
		).toBe("Impact, Stellar integration, completeness.");
	});
});

// Review round 3: one track's section served as the event's, an inline
// bold label read as a bare one, "Judges" read as criteria, "requisit"
// inside "Prerequisites", and one combined section served under both.
describe("which section a page's headings name", () => {
	it("takes the shallowest matching heading: the event's, over a track's", () => {
		// ideaton2026's shape: track sub-sections first, the event's Rules after.
		const page = [
			"## Track 1",
			"### Requisitos del proyecto",
			"- A public repo is not required.",
			"## Track 2",
			"#### Submission requirements",
			"- An article link.",
			"## Rules",
			"- One submission per team.",
		].join("\n");
		expect(markdownSection(page, REQUIREMENTS_HEADING)).toBe(
			"- One submission per team.",
		);
	});

	it("serves matches that sit under different tracks per track, never one as the event's", () => {
		const page = [
			"## Track Producto",
			"### Judging",
			"- Impact.",
			"## Track Contenido",
			"### Judging",
			"- Clarity.",
		].join("\n");
		expect(markdownSection(page, JUDGING_HEADING)).toBe(
			"**Track Producto**\n- Impact.\n\n**Track Contenido**\n- Clarity.",
		);
	});

	it("reads an inline bold label's own text, and never a list of judges as criteria", () => {
		expect(
			markdownSection(
				"**Judging criteria:** impact and originality\nand Stellar use.\n\nNot this.",
				JUDGING_HEADING,
			),
		).toBe("impact and originality\nand Stellar use.");
		expect(
			markdownSection("Judges\n\nAda, Grace and Alan.", JUDGING_HEADING),
		).toBeNull();
		expect(
			markdownSection("# Judges\n\nAda, Grace.", JUDGING_HEADING),
		).toBeNull();
	});

	it("does not read Prerequisites as requirements", () => {
		expect(
			markdownSection("## Prerequisites\n\n- Node 20", REQUIREMENTS_HEADING),
		).toBeNull();
		expect(
			markdownSection("## Requisitos\n\n- Repo público", REQUIREMENTS_HEADING),
		).toBe("- Repo público");
	});

	it("reads a heading that names both sections once for each, by its labelled parts", () => {
		// give-hackathon-argentina's shape.
		const page = [
			"## Entregables y Criterios de Evaluación",
			"",
			"- **Requisitos:**",
			"    - Video pitch.",
			"    - Repositorio en GitHub.",
			"- **Criterios de evaluación:**",
			"    - Ejecución técnica.",
			"    - Uso de Stellar.",
			"- **Jurado:**",
			"    - Miembros de SDF.",
			"",
			"## Premios",
		].join("\n");
		expect(markdownSection(page, REQUIREMENTS_HEADING)).toBe(
			"- Video pitch.\n- Repositorio en GitHub.",
		);
		expect(markdownSection(page, JUDGING_HEADING)).toBe(
			"- Ejecución técnica.\n- Uso de Stellar.",
		);
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

// sls-092: say when the submissions served differ from DoraHacks' own count.
describe("submissionCoverageNote", () => {
	it("is null when the counts agree or one is unknown", () => {
		expect(submissionCoverageNote(39, 39)).toBeNull();
		expect(submissionCoverageNote(null, 39)).toBeNull();
		expect(submissionCoverageNote(345, null)).toBeNull();
	});

	it("names the gap and why, in both directions", () => {
		const fewer = submissionCoverageNote(345, 319) ?? "";
		expect(fewer).toMatch(/DoraHacks counts 345 submissions/);
		expect(fewer).toMatch(/The other 26 are not/);
		expect(fewer).toMatch(/hid or deleted/);
		expect(submissionCoverageNote(40, 41)).toMatch(
			/including 1 DoraHacks no longer lists/,
		);
		// One missing submission reads as one, not "1 are".
		expect(submissionCoverageNote(27, 26)).toMatch(
			/The other one is not: a submission its team hid or deleted/,
		);
	});
});

// sls-092: Build on Stellar Chile served 14 of 15 winners with no word why.
describe("hiddenWinnersNote", () => {
	it("names each hidden winner's placement and award, singular and plural", () => {
		expect(hiddenWinnersNote([{ placement: "2nd Place" }])).toBe(
			"One winning submission is not served here: its team hid or deleted it on DoraHacks (2nd Place).",
		);
		expect(
			hiddenWinnersNote([
				{ placement: "Winners", award: "Best Video Pitch" },
				{ placement: null },
			]),
		).toBe(
			"2 winning submissions are not served here: their teams hid or deleted them on DoraHacks (Winners, Best Video Pitch; Winner).",
		);
	});

	it("says nothing when none is hidden or the read failed", () => {
		expect(hiddenWinnersNote([])).toBeNull();
		expect(hiddenWinnersNote(null)).toBeNull();
	});

	it("names the award category a hidden winner placed in, never as its prize", () => {
		expect(
			hiddenWinnersNote([
				{
					placement: "6th Place",
					award: null,
					awardCategory: "$10,000 XLM Prize",
				},
			]),
		).toBe(
			"One winning submission is not served here: its team hid or deleted it on DoraHacks (6th Place in $10,000 XLM Prize).",
		);
	});
});
