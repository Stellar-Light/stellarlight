import { describe, expect, it } from "vitest";
import {
	chunkMarkdown,
	MAX_CHARS_PER_CHUNK,
	splitOversized,
} from "../research-ingest";

// The Idempotence re-plan's first catch (2026-09-13): the getTransactions page
// carries one 66k-char JSON example with no blank line inside it. chunkMarkdown
// packed paragraphs greedily but never split one, so the chunk shipped whole,
// Payload's 40,000-char textarea cap rejected it on every refresh, and the
// dev-docs ingester counted it "new: 1" forever.
describe("chunkMarkdown never emits a chunk over MAX_CHARS_PER_CHUNK", () => {
	const line = (i: number) =>
		` "tx${i}": "${"A".repeat(120)}", "ledger": ${1000 + i},`;
	const example = `{\n${Array.from({ length: 500 }, (_, i) => line(i)).join("\n")}\n}`;
	const md = `# getTransactions\n\n## Examples\n\n### Result\n${example}`;

	it("hard-splits a single oversized paragraph and keeps every character", () => {
		expect(example.length).toBeGreaterThan(MAX_CHARS_PER_CHUNK * 5);
		const chunks = chunkMarkdown({
			md,
			parentDocId: "gettransactions",
			title: "getTransactions",
			url: "https://developers.stellar.org/x",
			tags: ["dev-docs"],
		});
		expect(chunks.length).toBeGreaterThan(5);
		for (const c of chunks) {
			expect(c.content.length).toBeLessThanOrEqual(MAX_CHARS_PER_CHUNK + 2);
		}
		// lossless: every example line lands in exactly one chunk, in order
		const joined = chunks.map((c) => c.content).join("\n");
		for (const i of [0, 137, 499]) expect(joined).toContain(`"tx${i}":`);
		expect(joined.indexOf('"tx0":')).toBeLessThan(joined.indexOf('"tx499":'));
	});

	it("a small section is still one chunk (no behaviour change below the cap)", () => {
		const chunks = chunkMarkdown({
			md: "# T\n\n## Params\n\nA short paragraph.\n\nAnother one.",
			parentDocId: "p",
			title: "T",
			url: "https://x/y",
			tags: [],
		});
		expect(chunks).toHaveLength(1);
		expect(chunks[0].content).toContain("A short paragraph.");
	});
});

describe("splitOversized", () => {
	it("returns the text untouched under the cap", () => {
		expect(splitOversized("abc\ndef", 100)).toEqual(["abc\ndef"]);
	});
	it("splits at line boundaries, then a single overlong line at fixed width", () => {
		const out = splitOversized("aaaa\nbbbb\ncccc", 9);
		expect(out).toEqual(["aaaa\nbbbb", "cccc"]);
		expect(splitOversized("x".repeat(25), 10)).toEqual([
			"xxxxxxxxxx",
			"xxxxxxxxxx",
			"xxxxx",
		]);
		expect(splitOversized("aa\n" + "y".repeat(12) + "\nbb", 5)).toEqual([
			"aa",
			"yyyyy",
			"yyyyy",
			"yy",
			"bb",
		]);
	});
});
