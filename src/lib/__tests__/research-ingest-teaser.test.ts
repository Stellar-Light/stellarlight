// @vitest-environment node

/**
 * lumenloop's related-post teaser sits inside <article> and changes on
 * every request; the ingester must cut it or the same chunk re-embeds daily.
 */
import { describe, expect, it } from "vitest";
import {
	dropH2Sections,
	missingH2Sections,
	slpChunks,
	stripTrailingTeaser,
} from "../research-ingest";

describe("dropH2Sections", () => {
	// stellar.org/community's shape: a newest-posts list mid-page, FAQ after.
	const page =
		"# Unlocking our potential\nIntro.\n\n## Grow with Stellar\nSCF.\n\n## Onchain updates\nNovember 16, 2026\n### Q3 2026: The rail, put to work\n\n## Common questions\nSDF cannot recover funds.";

	it("drops the named section and keeps what follows it", () => {
		const out = dropH2Sections(page, ["Onchain updates"]);
		expect(out).not.toContain("Onchain updates");
		expect(out).not.toContain("The rail, put to work");
		expect(out).toContain("## Grow with Stellar\nSCF.");
		expect(out).toContain("## Common questions\nSDF cannot recover funds.");
	});

	it("matches whole headings only and leaves other pages untouched", () => {
		expect(dropH2Sections(page, ["Onchain"])).toBe(page);
		expect(dropH2Sections(page, [])).toBe(page);
	});

	it("names a heading to drop that the page no longer has", () => {
		expect(missingH2Sections(page, ["Onchain updates"])).toEqual([]);
		expect(missingH2Sections(page, ["Onchain"])).toEqual(["Onchain"]);
		const demoted = page.replace("## Onchain updates", "### Onchain updates");
		expect(missingH2Sections(demoted, ["Onchain updates"])).toEqual([
			"Onchain updates",
		]);
	});
});

const article =
	"Perps on Stellar would let traders hedge exposure in leveraged trading. It uses…";
const teaserA =
	"\n\n- View →More from research6d ago5 minStellar Weekly Roundup: Week of Sep 11, 2026Adapter (Protocol 28) went live on Stellar Mainnet.";
const teaserB =
	"\n\n- View →More from researchtoday4 minStellar Weekly Roundup: Week of Sep 18, 2026BVNK integrated Stellar.";

describe("stripTrailingTeaser", () => {
	it("cuts the teaser so two renders of one page hash the same", () => {
		expect(stripTrailingTeaser(article + teaserA)).toBe(article);
		expect(stripTrailingTeaser(article + teaserB)).toBe(article);
	});

	it("also cuts the bare header when a relative time follows it", () => {
		expect(
			stripTrailingTeaser(
				"Body text.\n\nMore from news 2h ago 3 min Some post",
			),
		).toBe("Body text.");
	});

	it("leaves a body without a teaser alone, including the phrase in prose", () => {
		const prose = "We expect more from research teams next year.";
		expect(stripTrailingTeaser(prose)).toBe(prose);
		const related = "See the related articles below for context.";
		expect(stripTrailingTeaser(related)).toBe(related);
	});

	// News pages end with a related list that changes as news is published.
	it("cuts a news page's Related articles list and what follows it", () => {
		const news =
			"Stellar launched an interactive anchor coverage map.\n\nOriginal articleRead on stellar.orgstellar.org/blog/developers/introducing-anchor-network-interac…Open ↗";
		const tailA =
			"Related articles\n- Stellar | MoneyGram International Case Studystellar.org · Aug 1\n- Anchors: connecting the real-world to Stellarstellar.org · Jul 9\n\nMentioned projects1 project";
		const tailB =
			"Related articles\n- Introducing Stellar Ramps: Access On and Off Ramps with a Single Integrationstellar.org · Aug 4\n\nMentioned projects1 project";
		expect(stripTrailingTeaser(news + tailA)).toBe(news);
		expect(stripTrailingTeaser(news + tailB)).toBe(news);
	});
});

// sls-118: the real head of limits/slp-0006.md (stellar/stellar-protocol
// master, read 2026-11-22). A row read alone must say which vote it is,
// that it is Final, and when it was created.
const SLP_0006 = `## Preamble

\`\`\`
SLP: 0006
Title: Freeze YieldBlox Exploit Stellar Accounts
Authors: Alex Mootz <@mootz12>
Consulted:
Status: Final
Created: 2026-05-07
\`\`\`

## Summary

This proposal freezes three account entries using the frozen ledger key mechanism defined in [CAP-0077](../core/cap-0077.md). These accounts are currently blocked by validators at the overlay layer. This proposal moves the block to a network configuration.

## Proposed Settings

This proposal applies a \`CONFIG_SETTING_FROZEN_LEDGER_KEYS_DELTA\` configuration upgrade as defined by CAP-0077.
`;

describe("slpChunks", () => {
	const chunks = slpChunks(SLP_0006, "slp-0006.md");
	it("keys every chunk to the proposal and dates it from the preamble", () => {
		expect(chunks.length).toBeGreaterThan(1);
		for (const c of chunks) {
			expect(c.parentDocId).toBe("slp-0006");
			expect(c.url).toBe(
				"https://github.com/stellar/stellar-protocol/blob/master/limits/slp-0006.md",
			);
			expect(c.title).toBe("Freeze YieldBlox Exploit Stellar Accounts");
			expect(c.publishedAt).toBe("2026-05-07T00:00:00.000Z");
			expect(c.content.split("\n")[0]).toBe(
				"SLP-0006: Freeze YieldBlox Exploit Stellar Accounts. Status: Final. Created: 2026-05-07.",
			);
		}
	});
	it("hashes the content it stores", () => {
		const again = slpChunks(SLP_0006, "slp-0006.md");
		expect(again.map((c) => c.contentHash)).toEqual(
			chunks.map((c) => c.contentHash),
		);
		expect(new Set(chunks.map((c) => c.contentHash)).size).toBe(chunks.length);
	});
	it("says a field is not stated rather than inventing one", () => {
		const [c] = slpChunks(
			"## Summary\n\nNo preamble here at all, just prose about limits.",
			"slp-0009.md",
		);
		expect(c.content.split("\n")[0]).toBe(
			"SLP-0009: SLP-0009. Status: not stated. Created: not stated.",
		);
		expect(c.publishedAt).toBeUndefined();
	});
});
