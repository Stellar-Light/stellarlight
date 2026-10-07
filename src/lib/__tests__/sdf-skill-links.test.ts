import { describe, expect, it } from "vitest";
import {
	mergeSkillLists,
	parseLlmsRegistry,
	parseLlmsSkillLinks,
	registrySkillView,
} from "../integrations/sdf-skills";

// The registry's llms.txt is the source of truth for WHERE a skill is served
// from and WHO stands behind it, not only which skills exist: entries hosted
// in an author's repository must resolve to that repository, never to a
// derived skills.stellar.org path, and the Community Built section is not
// SDF's work.
const txt = [
	"# Stellar Skills",
	"",
	"## Installing",
	"- [Changelog](https://example.org/CHANGELOG.md): a link outside the skill sections is not a skill",
	"",
	"## Included Stellar Skills",
	"- [Stellar Smart Contracts](https://skills.stellar.org/skills/smart-contracts/SKILL.md): Soroban contracts in Rust. Testing and security too.",
	"",
	"## Community Built",
	"- [OpenZeppelin Contracts](https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-skills/main/skills/setup-stellar-contracts/SKILL.md): scaffold with OZ",
	"- [LumenLoop MCP Connect](https://raw.githubusercontent.com/lumenloop/lumenloop-skills/main/skills/lumenloop-mcp-connect/SKILL.md): connect",
	"- [Stellar Agent Search](https://raw.githubusercontent.com/example/stellar-agent-search/main/skills/mcp/SKILL.md): a generic path segment",
	"- [PMLL](https://raw.githubusercontent.com/example/pmll/main/SKILL.md): a root-level SKILL.md",
	"- [Trustless Work Escrow](https://raw.githubusercontent.com/example/trustlesswork-skill/main/trustless-work-dev/SKILL.md): a directory outside skills/",
	"- [DeFindex SDK](https://raw.githubusercontent.com/example/defindex-sdk/main/defindex-sdk-skill.md): a bare .md the registry lists",
	"- [Setup again](https://example.org/skills/setup-stellar-contracts/SKILL.md): duplicate name keeps the first link",
].join("\n");

describe("parseLlmsRegistry", () => {
	const reg = parseLlmsRegistry(txt);
	it("keeps the section, title and summary of every .md entry under a skills section", () => {
		expect([...reg.keys()]).toEqual([
			"smart-contracts",
			"setup-stellar-contracts",
			"lumenloop-mcp-connect",
			"stellar-agent-search",
			"pmll",
			"trustless-work-dev",
			"defindex-sdk",
		]);
		expect(reg.get("smart-contracts")).toMatchObject({
			section: "official",
			title: "Stellar Smart Contracts",
			summary: "Soroban contracts in Rust. Testing and security too.",
		});
		expect(reg.get("setup-stellar-contracts")).toMatchObject({
			section: "community",
			title: "OpenZeppelin Contracts",
			url: "https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-skills/main/skills/setup-stellar-contracts/SKILL.md",
		});
	});
	it("names a generic path segment or a root-level SKILL.md after its title", () => {
		expect(reg.get("stellar-agent-search")?.url).toContain(
			"/skills/mcp/SKILL.md",
		);
		expect(reg.get("pmll")?.url).toBe(
			"https://raw.githubusercontent.com/example/pmll/main/SKILL.md",
		);
	});
});

describe("parseLlmsSkillLinks", () => {
	it("maps every listed skill to the SKILL.md the registry links", () => {
		const links = parseLlmsSkillLinks(txt);
		expect(links.get("lumenloop-mcp-connect")).toBe(
			"https://raw.githubusercontent.com/lumenloop/lumenloop-skills/main/skills/lumenloop-mcp-connect/SKILL.md",
		);
		expect(links.get("smart-contracts")).toBe(
			"https://skills.stellar.org/skills/smart-contracts/SKILL.md",
		);
	});
	it("returns an empty map for text without skill links", () => {
		expect(parseLlmsSkillLinks("nothing here").size).toBe(0);
	});
});

describe("registrySkillView", () => {
	const base = {
		description: "From the frontmatter.",
		userInvocable: false,
		url: "",
		rawUrl: "",
	};
	it("labels an SDF-authored entry sdf with the registry's own install command", () => {
		const v = registrySkillView({
			...base,
			name: "smart-contracts",
			title: "Stellar Smart Contracts",
			summary: "Soroban contracts in Rust.",
			community: false,
			url: "https://skills.stellar.org/skills/smart-contracts/",
			rawUrl: "https://skills.stellar.org/skills/smart-contracts/SKILL.md",
		});
		expect(v).toMatchObject({
			slug: "smart-contracts",
			name: "Stellar Smart Contracts",
			source: "sdf",
			registry: "skills.stellar.org",
			install: "npx skills add https://github.com/stellar/stellar-dev-skill",
			tags: ["smart-contracts", "SDF"],
		});
	});
	it("labels a community-built entry community, installed from its own repository, with no claimed compatibility", () => {
		const v = registrySkillView({
			...base,
			name: "pmll",
			title: "PMLL",
			summary: "Root-level skill.",
			community: true,
			url: "https://github.com/example/pmll/tree/main",
			rawUrl: "https://raw.githubusercontent.com/example/pmll/main/SKILL.md",
		});
		expect(v).toMatchObject({
			source: "community",
			registry: "skills.stellar.org",
			install: "npx skills add https://github.com/example/pmll",
			repository: "https://github.com/example/pmll",
			tags: ["pmll", "community", "example"],
		});
		expect(v).not.toHaveProperty("compatibility");
		expect(v).not.toHaveProperty("installAlt");
	});
	it("claims no install command for a bare .md the skills CLI cannot install", () => {
		const v = registrySkillView({
			...base,
			name: "defindex-sdk",
			title: "DeFindex SDK",
			summary: "Vaults.",
			community: true,
			url: "https://github.com/example/defindex-sdk/tree/main",
			rawUrl:
				"https://raw.githubusercontent.com/example/defindex-sdk/main/defindex-sdk-skill.md",
		});
		expect(v).toMatchObject({
			repository: "https://github.com/example/defindex-sdk",
			rawUrl:
				"https://raw.githubusercontent.com/example/defindex-sdk/main/defindex-sdk-skill.md",
		});
		expect(v).not.toHaveProperty("install");
	});
});

describe("mergeSkillLists", () => {
	it("lets a curated entry replace the registry copy it names, and counts it", () => {
		const { all, merged } = mergeSkillLists(
			[{ slug: "lumenloop-scf-radar" }, { slug: "lumenloop-mcp-connect" }],
			[
				{ slug: "scf-submission-radar" },
				{ slug: "lumenloop-mcp-connect" },
				{ slug: "sub-rosa" },
			],
			[{ slug: "sub-rosa" }, { slug: "mine" }],
			["scf-submission-radar", "lumenloop-mcp-connect"],
		);
		expect(all.map((s) => s.slug)).toEqual([
			"lumenloop-scf-radar",
			"lumenloop-mcp-connect",
			"sub-rosa",
			"mine",
		]);
		expect(merged).toBe(2);
	});
});
