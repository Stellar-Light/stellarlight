import { describe, expect, it } from "vitest";
import {
	buildEmbeddingText,
	embeddingTextHash,
} from "@/lib/hackathon-build-embedding";

describe("what a submission is embedded as", () => {
	it("joins name, summary, track and the write-up without markdown noise", () => {
		const t = buildEmbeddingText({
			name: "TollPay",
			vision: "Stripe for MCP servers.",
			track: "All BUIDLs",
			description:
				"## What is Toll?\n\n![logo](https://x/y.png) Toll is **payment infrastructure** for [MCP](https://mcp.dev) servers.",
		});
		expect(t).toBe(
			"TollPay. Stripe for MCP servers.. All BUIDLs. What is Toll? Toll is payment infrastructure for MCP servers.",
		);
	});

	it("skips empty parts and caps the write-up", () => {
		const t = buildEmbeddingText({
			name: "X",
			vision: null,
			description: "a".repeat(10_000),
		});
		expect(t.startsWith("X. aaa")).toBe(true);
		expect(t.length).toBeLessThanOrEqual(4000);
	});

	it("hashes the text so only changed rows re-embed", () => {
		const a = embeddingTextHash("same text");
		expect(a).toBe(embeddingTextHash("same text"));
		expect(a).not.toBe(embeddingTextHash("same text, edited"));
	});
});
