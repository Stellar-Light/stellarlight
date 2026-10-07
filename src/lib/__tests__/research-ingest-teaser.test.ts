// @vitest-environment node

/**
 * lumenloop's related-post teaser sits inside <article> and changes on
 * every request; the ingester must cut it or the same chunk re-embeds daily.
 */
import { describe, expect, it } from "vitest";
import { stripTrailingTeaser } from "../research-ingest";

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
	});
});
