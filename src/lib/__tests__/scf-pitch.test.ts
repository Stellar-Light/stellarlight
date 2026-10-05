import { describe, expect, it } from "vitest";
import { computeEcosystemGaps, GAP_PROJECT_SELECT } from "@/lib/ecosystem-gaps";
import { countWentQuiet, fundedInVertical } from "@/lib/scf-pitch";

describe("funded peers count every funded project", () => {
	const docs = Array.from({ length: 12 }, (_, i) => ({
		slug: `p${i}`,
		name: `P${i}`,
		types: ["Payments"],
		scf: { awarded: true, totalAwarded: (i + 1) * 1000 },
	}));

	it("counts and totals all of them, largest first", () => {
		const f = fundedInVertical(docs, "Payments");
		expect(f.count).toBe(12);
		expect(f.totalAwardedUSD).toBe(78_000);
		expect(f.peers[0].slug).toBe("p11");
	});

	it("ignores other verticals and unfunded rows", () => {
		const f = fundedInVertical(
			[
				...docs,
				{ slug: "x", types: ["Wallet"], scf: { awarded: true } },
				{ slug: "y", types: ["Payments"] },
			],
			"Payments",
		);
		expect(f.count).toBe(12);
	});
});

describe("prior attempts that went quiet", () => {
	it("counts dormant and archived repos, not maintained or active ones", () => {
		expect(
			countWentQuiet([
				{ activityState: "active" },
				{ activityState: "maintained" },
				{ activityState: "dormant" },
				{ activityState: "archived" },
				{ activityState: "unknown" },
			]),
		).toBe(2);
	});
});

describe("the gap computation's field list", () => {
	it("keeps what it needs to count a hackathon winner", () => {
		const full = {
			slug: "w",
			name: "W",
			types: ["Payments"],
			status: "Live",
			scf: { awarded: false },
			hackathonPlacement: "1st",
			description: "not selected",
		};
		// What a Payload select of GAP_PROJECT_SELECT hands back.
		const selected = Object.fromEntries(
			Object.keys(GAP_PROJECT_SELECT).map((k) => [
				k,
				full[k as keyof typeof full],
			]),
		);
		const gaps = computeEcosystemGaps([selected], ["Payments"]);
		expect(
			gaps.byType.find((c) => c.type === "Payments")?.hackathonWinners,
		).toBe(1);
	});
});
