import { describe, expect, it } from "vitest";
import {
	matchesVersionTarget,
	rankResearchChunks,
	versionTargets,
} from "../research-rank";

describe("release tags are lookup keys", () => {
	it("extracts and normalizes semver tags", () => {
		expect(versionTargets("stellar-core v28.0.0")).toEqual(["v28.0.0"]);
		expect(versionTargets("upgrade to 27.1.0 notes")).toEqual(["v27.1.0"]);
		expect(versionTargets("latest soroban release")).toEqual([]);
	});

	it("matches the tag in a title but not a different release", () => {
		expect(matchesVersionTarget("stellar-core v28.0.0", ["v28.0.0"])).toBe(
			true,
		);
		expect(matchesVersionTarget("stellar-core v27.1.0", ["v28.0.0"])).toBe(
			false,
		);
	});

	it("pins the named release above higher-scored older ones", () => {
		const mk = (title: string, score: number) => ({
			id: title,
			source: "release",
			title,
			url: `https://github.com/stellar/stellar-core/releases/tag/${title.split(" ")[1]}`,
			content: `${title} release notes with enough words to not be a low-value chunk at all here`,
			chunkIndex: 0,
			publishedAt: "2026-06-01T00:00:00.000Z",
			score,
		});
		const ranked = rankResearchChunks(
			[mk("stellar-core v27.1.0", 0.9), mk("stellar-core v28.0.0", 0.6)],
			{ limit: 5, mode: "vector", query: "stellar-core v28.0.0" },
		);
		expect(ranked[0].title).toBe("stellar-core v28.0.0");
	});
});
