import { describe, expect, it } from "vitest";
import { BATCH_SIZE, buildBatchQuery } from "../github";

describe("buildBatchQuery", () => {
	it("aliases every pair against the shared fragment", () => {
		const q = buildBatchQuery([
			{ owner: "stellar", name: "stellar-core" },
			{ owner: "blend-capital", name: "blend-contracts-v2" },
		]);
		expect(q).toContain(
			'r0: repository(owner: "stellar", name: "stellar-core")',
		);
		expect(q).toContain(
			'r1: repository(owner: "blend-capital", name: "blend-contracts-v2")',
		);
		expect(q).toContain("fragment RepoFields on Repository");
		expect(q).toContain("$since: GitTimestamp!");
	});

	it("throws on names outside GitHub's charset — literal-injection proof", () => {
		expect(() => buildBatchQuery([{ owner: 'a"){x}', name: "b" }])).toThrow(
			/invalid owner\/name/,
		);
		expect(() => buildBatchQuery([{ owner: "ok", name: "bad name" }])).toThrow(
			/invalid owner\/name/,
		);
	});

	it("dots, dashes, underscores are legal (real-world names)", () => {
		const q = buildBatchQuery([
			{ owner: "Creit-Tech", name: "Stellar-Wallets-Kit" },
		]);
		expect(q).toContain('owner: "Creit-Tech"');
	});

	it("BATCH_SIZE stays a sane chunk (GraphQL point budget)", () => {
		expect(BATCH_SIZE).toBeGreaterThan(10);
		expect(BATCH_SIZE).toBeLessThanOrEqual(50);
	});
});
