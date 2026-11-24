// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MAX_CHARS_PER_CHUNK } from "../research-ingest";
import { type Discussion, discussionChunks } from "../stellar-discussions";

const base: Discussion = {
	number: 2065,
	title: "Fees Should Be Increased (up to 1 XLM)",
	url: "https://github.com/orgs/stellar/discussions/2065",
	category: { slug: "tokenomics", name: "Tokenomics" },
	author: "alice",
	createdAt: "2026-11-07T15:32:20Z",
	updatedAt: "2026-11-20T09:00:00Z",
	body: "Raise the base fee. See CAP-0084 and sep 41 in prose.\r\n<!-- template -->",
	comments: [
		{
			author: "bob",
			createdAt: "2026-11-08T10:00:00Z",
			body: "I disagree with raising fees this far.",
			replies: [
				{ author: null, createdAt: "2026-11-09T10:00:00Z", body: "Same here." },
			],
		},
	],
};

describe("discussionChunks", () => {
	const [c] = discussionChunks(base);

	it("keys, dates and categorizes the discussion by its own fields", () => {
		expect(c.parentDocId).toBe("discussion-2065");
		expect(c.url).toBe(base.url);
		expect(c.publishedAt).toBe(base.createdAt);
		expect(c.discussionCategory).toBe("tokenomics");
		expect(c.tags).toEqual(["stellar-discussions", "tokenomics", "cap-0084"]);
	});

	it("opens with a header a row read alone can be cited from", () => {
		expect(c.content.split("\n")[0]).toBe(
			"Stellar discussion #2065 in Tokenomics: Fees Should Be Increased (up to 1 XLM). Opened by @alice on 2026-11-07; last updated on GitHub 2026-11-20; 1 comment and 1 reply. Names CAP-0084.",
		);
	});

	it("signs every comment and reply, and drops template comments", () => {
		expect(c.content).toContain("**Comment by @bob on 2026-11-08:**");
		expect(c.content).toContain(
			"**Reply by a deleted account on 2026-11-09 to @bob:**\n\nSame here.",
		);
		expect(c.content).not.toContain("template");
		expect(c.content).not.toContain("\r");
	});

	it("packs a long thread into bounded chunks, each piece still signed", () => {
		const long = discussionChunks({
			...base,
			comments: Array.from({ length: 30 }, (_, i) => ({
				author: `u${i}`,
				createdAt: "2026-11-10T00:00:00Z",
				body: `${"word ".repeat(400)}${i}`,
			})),
		});
		expect(long.length).toBeGreaterThan(1);
		for (const [i, k] of long.entries()) {
			expect(k.chunkIndex).toBe(i);
			expect(k.content.length).toBeLessThanOrEqual(MAX_CHARS_PER_CHUNK);
			expect(k.content.startsWith("Stellar discussion #2065")).toBe(true);
			expect(k.content.split("\n\n")[1]).toMatch(
				/^\*\*(Opening post|Comment) by /,
			);
		}
		expect(new Set(long.map((k) => k.contentHash)).size).toBe(long.length);
	});

	it("keeps the replies of a comment left out, and does not count it", () => {
		const [k] = discussionChunks({
			...base,
			comments: [{ ...base.comments[0], body: "" }],
		});
		expect(k.content.split("\n")[0]).toContain("0 comments and 1 reply.");
		expect(k.content).not.toContain("**Comment by @bob");
		expect(k.content).toContain("Same here.");
	});

	it("keeps a discussion with no text as one row", () => {
		const empty = discussionChunks({ ...base, body: "  ", comments: [] });
		expect(empty).toHaveLength(1);
		expect(empty[0].content).toContain("(no text)");
	});
});
