/**
 * One strong-basis list. STRONG_STATUS_BASES in src/lib/project-status.ts is
 * the canonical list; every copy that classifies a statusBasis as strong or
 * protects it from a lane must agree with it.
 *
 * Found 2026-11-12: /api/lifecycle counted operator-announcement as strong
 * (its own copy), basis-from-repo did not protect package-release (its dry
 * run would have overwritten a curated package-release row with
 * repo-activity), and basis-from-product protected neither repo-activity nor
 * package-release. The owner decided operator-announcement is weak everywhere.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { GET as qualityGET } from "@/app/api/quality/route";
import { NEVER_OVERWRITE as deploymentProtected } from "../../../scripts/basis-from-deployment";
import {
	NEVER_OVERWRITE as onchainProtected,
	REPLACES_STRONG as onchainReplaces,
} from "../../../scripts/basis-from-onchain";
import { NEVER_OVERWRITE as productProtected } from "../../../scripts/basis-from-product";
import { NEVER_OVERWRITE as repoProtected } from "../../../scripts/basis-from-repo";
import {
	DEFINITIONS,
	isLiveOnStrongEvidence,
	type SnapshotRow,
} from "../lifecycle-metrics";
import { STATUS_BASES, STRONG_STATUS_BASES } from "../project-status";

const row = (basis: string): SnapshotRow => ({
	slug: "p",
	status: "Live",
	basis,
	asOf: null,
	wasLive: null,
	lastActivity: null,
	scf: false,
	scfRounds: [],
	network: null,
	networkBasis: null,
	category: null,
	repos: 0,
	listed: null,
});

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const strong = new Set<string>(STRONG_STATUS_BASES);

describe("lifecycle liveOnStrongEvidence uses the canonical list", () => {
	for (const b of STATUS_BASES)
		it(`${b} is ${strong.has(b) ? "strong" : "weak"}`, () => {
			expect(isLiveOnStrongEvidence(row(b))).toBe(strong.has(b));
		});
	it("the definition text does not name operator announcements as strong", () => {
		expect(DEFINITIONS.liveOnStrongEvidence).not.toMatch(/operator/i);
	});
});

describe("every basis lane protects every canonical strong basis", () => {
	// A lane may replace a strong basis only where the statusBasis spec ranks
	// the basis it awards higher (WEAKEST LAST: human-verified,
	// onchain-activity, repo-activity, package-release, product-integration),
	// and it may re-date its own. That exception is written in the lane and
	// pinned here, so a new strong basis is protected by default.
	const lanes: Record<
		string,
		{ protects: ReadonlySet<string>; replaces: readonly string[] }
	> = {
		"basis-from-repo": { protects: repoProtected, replaces: [] },
		"basis-from-product": { protects: productProtected, replaces: [] },
		"basis-from-deployment": { protects: deploymentProtected, replaces: [] },
		"basis-from-onchain": {
			protects: onchainProtected,
			replaces: onchainReplaces,
		},
	};
	for (const [lane, { protects, replaces }] of Object.entries(lanes))
		for (const b of STRONG_STATUS_BASES)
			it(`${lane} never replaces ${b} unless it is a documented upgrade`, () => {
				expect(protects.has(b) || replaces.includes(b)).toBe(true);
			});
	it("basis-from-onchain replaces only bases ranked below onchain-activity, and its own", () => {
		expect([...onchainReplaces].sort()).toEqual(
			[
				"onchain-activity",
				"package-release",
				"product-integration",
				"repo-activity",
			].sort(),
		);
		expect(onchainProtected.has("human-verified")).toBe(true);
	});
	it("no lane protects a weak basis as if it were strong", () => {
		for (const set of [
			repoProtected,
			productProtected,
			deploymentProtected,
			onchainProtected,
		])
			for (const b of set) expect(strong.has(b), b).toBe(true);
	});
});

describe("/api/quality serves the canonical list", () => {
	it("rowQuality.strongBases equals STRONG_STATUS_BASES", async () => {
		const res = await qualityGET(new NextRequest("https://x.test/api/quality"));
		const body = await res.json();
		expect([...body.rowQuality.strongBases].sort()).toEqual(
			[...STRONG_STATUS_BASES].sort(),
		);
	});
});
