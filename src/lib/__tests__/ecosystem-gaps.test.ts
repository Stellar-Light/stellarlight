import { describe, expect, it } from "vitest";
import {
	computeEcosystemGaps,
	type GapProject,
	UNDERBUILT_MAX,
} from "../ecosystem-gaps";

const VERTICALS = ["DEX", "Oracle", "NFT", "RWA", "Wallet"] as const;

// A small synthetic ecosystem: DEX is crowded + proven, Oracle is built but
// nothing Live (unproven), NFT has one project (underbuilt), RWA has none
// (absent), Wallet is healthy.
const PROJECTS: GapProject[] = [
	{ types: ["DEX"], status: "Live", scf: { awarded: true } },
	{ types: ["DEX"], status: "Live" },
	{ types: ["DEX"], status: "Development" },
	{ types: ["DEX", "Wallet"], status: "Live" },
	{ types: ["Oracle"], status: "Development" },
	{ types: ["Oracle"], status: "Pre-Release", hackathonPlacement: "1st" },
	{ types: ["NFT"], status: "Live" },
	{ types: ["Wallet"], status: "Live" },
	{ types: ["Wallet"], status: "Live" },
	// RWA: intentionally none.
];

describe("computeEcosystemGaps", () => {
	const gaps = computeEcosystemGaps(PROJECTS, VERTICALS);

	it("tallies per-type coverage, multi-valued (a project counts under each type)", () => {
		const dex = gaps.byType.find((c) => c.type === "DEX");
		expect(dex).toMatchObject({ total: 4, live: 3, inProgress: 1, scfFunded: 1 });
		const wallet = gaps.byType.find((c) => c.type === "Wallet");
		// one Wallet comes from the DEX+Wallet project → 3 total
		expect(wallet?.total).toBe(3);
	});

	it("absent = a canonical vertical with zero active projects", () => {
		expect(gaps.signals.absent).toEqual(["RWA"]);
	});

	it("unproven = built but nothing Live (total>0, live===0)", () => {
		expect(gaps.signals.unproven).toEqual(["Oracle"]);
	});

	it("underbuilt = total at or below the absolute floor", () => {
		// NFT total 1 (≤3) and Oracle total 2 (≤3) are underbuilt; DEX/Wallet are not.
		expect(gaps.signals.underbuilt).toContain("NFT");
		expect(gaps.signals.underbuilt).toContain("Oracle");
		expect(gaps.signals.underbuilt).not.toContain("DEX");
		expect(gaps.thresholds.underbuiltMax).toBe(UNDERBUILT_MAX);
	});

	it("byType is thinnest-first so the whitespace leads", () => {
		expect(gaps.byType[0].type).toBe("RWA"); // total 0
		expect(gaps.byType.at(-1)?.type).toBe("DEX"); // total 4
	});

	it("a stray non-canonical type never becomes an ecosystem gap signal", () => {
		const g = computeEcosystemGaps(
			[{ types: ["Infrastructure"], status: "Development" }],
			VERTICALS,
		);
		// Infrastructure isn't a canonical vertical → not in any signal…
		expect(g.signals.unproven).not.toContain("Infrastructure");
		// …but every canonical vertical is absent here.
		expect(g.signals.absent).toEqual([...VERTICALS].sort());
	});

	it("carries the supply-not-demand caveat in basis", () => {
		expect(gaps.basis.toLowerCase()).toContain("not market demand");
	});
});
