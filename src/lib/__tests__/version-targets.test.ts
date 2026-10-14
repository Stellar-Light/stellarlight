import { describe, expect, it } from "vitest";
import {
	isReleaseTitle,
	matchesVersionTarget,
	rankResearchChunks,
	releaseTagTargets,
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

// sls-090: "rs-soroban-sdk v25.0.2" is a lookup for that repo's release.
// stellar-core shares the version numbers, so the repo must match too.
describe("repo-qualified release tags", () => {
	it("reads the repo and tag, with the crate name as an alias", () => {
		expect(releaseTagTargets("rs-soroban-sdk v25.0.2")).toEqual([
			{ repo: "rs-soroban-sdk", tag: "v25.0.2" },
		]);
		expect(releaseTagTargets("soroban-sdk 25.0.2 notes")).toEqual([
			{ repo: "rs-soroban-sdk", tag: "v25.0.2" },
		]);
		expect(releaseTagTargets("upgrade to 27.1.0 notes")).toEqual([]);
	});

	it("matches only that repo's release, and only that exact tag", () => {
		const t = { repo: "rs-soroban-sdk", tag: "v25.0.2" };
		expect(isReleaseTitle("rs-soroban-sdk v25.0.2", t)).toBe(true);
		expect(isReleaseTitle("rs-soroban-sdk v25.0.2 — 25.0.2", t)).toBe(true);
		expect(isReleaseTitle("stellar-core v25.0.2", t)).toBe(false);
		expect(isReleaseTitle("rs-soroban-sdk v25.0.20", t)).toBe(false);
		expect(
			isReleaseTitle("stellar-core v25.2.2-external", {
				repo: "stellar-core",
				tag: "v25.2.2",
			}),
		).toBe(false);
	});

	it("pins the named repo's release over another repo's same tag", () => {
		const mk = (title: string, score: number) => ({
			id: title,
			source: "release",
			title,
			url: `https://github.com/stellar/${title.split(" ")[0]}/releases/tag/${title.split(" ")[1]}`,
			content: `${title} release notes with enough words to not be a low-value chunk at all here`,
			chunkIndex: 0,
			publishedAt: "2026-06-01T00:00:00.000Z",
			score,
		});
		const ranked = rankResearchChunks(
			[mk("stellar-core v25.0.2", 0.9), mk("rs-soroban-sdk v25.0.2", 0.5)],
			{ limit: 5, mode: "vector", query: "rs-soroban-sdk v25.0.2" },
		);
		expect(ranked[0].title).toBe("rs-soroban-sdk v25.0.2");
	});
});
