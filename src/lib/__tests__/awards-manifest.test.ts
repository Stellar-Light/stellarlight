// @vitest-environment node

/**
 * The pre-vote anchor is only worth something if it actually moves when the
 * round moves. These are the four edits someone would contest after a close
 * result — a nominee added, an address slipped onto the whitelist, the pick
 * count changed, the close date pushed — and each must change the digest.
 */
import { describe, expect, it } from "vitest";
import { roundManifestDigest } from "../awards/publish";
import type { LoadedRound } from "../awards/round";

const base = {
	round: {
		slug: "i3-2026",
		title: "i³ Awards 2026",
		status: "open",
		ballotMode: "one-per-category",
		picksPerCategory: 1,
		categories: [
			{ key: "impact", name: "Impact", tagline: null },
			{ key: "innovation", name: "Innovation", tagline: null },
		],
		opensAt: "2026-10-01T00:00:00.000Z",
		closesAt: "2026-10-15T00:00:00.000Z",
	},
	nominees: [
		{ category: "impact", slug: "decaf", name: "Decaf" },
		{ category: "impact", slug: "beans", name: "Beans" },
		{ category: "innovation", slug: "blend", name: "Blend" },
	],
	whitelist: new Set(["GA1", "GA2", "GA3"]),
} as unknown as LoadedRound;

const digest = (over: Partial<Record<string, unknown>> = {}) =>
	roundManifestDigest({ ...base, ...over } as LoadedRound);

describe("roundManifestDigest", () => {
	it("is stable, and independent of nominee and voter ordering", () => {
		expect(digest()).toMatch(/^[0-9a-f]{64}$/);
		expect(digest({ nominees: [...base.nominees].reverse() })).toBe(digest());
		expect(digest({ whitelist: new Set(["GA3", "GA1", "GA2"]) })).toBe(
			digest(),
		);
		// address casing/padding is normalised the way the record stores it
		expect(digest({ whitelist: new Set([" ga1 ", "GA2", "GA3"]) })).toBe(
			digest(),
		);
	});

	it("changes when a nominee is added to the ballot", () => {
		expect(
			digest({
				nominees: [
					...base.nominees,
					{ category: "innovation", slug: "sneaky", name: "Sneaky" },
				],
			}),
		).not.toBe(digest());
	});

	it("changes when an address is added to the electorate", () => {
		expect(
			digest({ whitelist: new Set(["GA1", "GA2", "GA3", "GA4"]) }),
		).not.toBe(digest());
		// and when one is removed
		expect(digest({ whitelist: new Set(["GA1", "GA2"]) })).not.toBe(digest());
	});

	it("changes when the pick count, categories or dates move", () => {
		expect(digest({ round: { ...base.round, picksPerCategory: 3 } })).not.toBe(
			digest(),
		);
		expect(
			digest({
				round: {
					...base.round,
					closesAt: "2026-10-30T00:00:00.000Z",
				},
			}),
		).not.toBe(digest());
		expect(
			digest({
				round: {
					...base.round,
					categories: [
						{ key: "impact", name: "Impact" },
						{ key: "innovation", name: "Renamed" },
					],
				},
			}),
		).not.toBe(digest());
	});

	it("is a hash, so it discloses no address", () => {
		const d = digest();
		expect(d).not.toContain("GA1");
		expect(d).toHaveLength(64);
	});
});
