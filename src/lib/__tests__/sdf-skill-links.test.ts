import { describe, expect, it } from "vitest";
import { parseLlmsSkillLinks } from "../integrations/sdf-skills";

// The registry's llms.txt is the source of truth for WHERE a skill is served
// from, not only which skills exist: entries hosted in an author's repository
// must resolve to that repository, never to a derived skills.stellar.org path.
describe("parseLlmsSkillLinks", () => {
	const txt = [
		"# Stellar Skills",
		"- [Setup](https://skills.stellar.org/skills/setup-stellar-contracts/SKILL.md): scaffold",
		"- [LumenLoop MCP Connect](https://raw.githubusercontent.com/lumenloop/lumenloop-skills/main/skills/lumenloop-mcp-connect/SKILL.md): connect",
		"- [Setup again](https://example.org/skills/setup-stellar-contracts/SKILL.md): duplicate name keeps the first link",
	].join("\n");
	it("maps every listed skill to the SKILL.md the registry links", () => {
		const links = parseLlmsSkillLinks(txt);
		expect([...links.keys()]).toEqual([
			"setup-stellar-contracts",
			"lumenloop-mcp-connect",
		]);
		expect(links.get("lumenloop-mcp-connect")).toBe(
			"https://raw.githubusercontent.com/lumenloop/lumenloop-skills/main/skills/lumenloop-mcp-connect/SKILL.md",
		);
		expect(links.get("setup-stellar-contracts")).toBe(
			"https://skills.stellar.org/skills/setup-stellar-contracts/SKILL.md",
		);
	});
	it("returns an empty map for text without skill links", () => {
		expect(parseLlmsSkillLinks("nothing here").size).toBe(0);
	});
});
