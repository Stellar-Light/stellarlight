import { describe, expect, it } from "vitest";
import {
	assign,
	bestCalibration,
	calibrate,
	type Labeled,
	looNeighbours,
	MIN_SUPPORT,
	neighbours,
	typeScores,
	unit,
} from "@/lib/hackathon-build-categories";

const v = (...xs: number[]) => unit(xs, xs.length) as Float32Array;
const row = (id: string, types: string[], ...xs: number[]): Labeled => ({
	id,
	types,
	vec: v(...xs),
});

describe("nearest directory projects", () => {
	it("rejects anything that is not a usable vector", () => {
		expect(unit([1, 2], 3)).toBeNull();
		expect(unit([0, 0, 0], 3)).toBeNull();
		expect(unit("x", 3)).toBeNull();
	});

	it("scores a type by its weighted share of the neighbours, leaving the row itself out", () => {
		const rows = [
			row("p1", ["Payments"], 1, 0.1, 0),
			row("p2", ["Payments"], 1, 0.2, 0),
			row("d1", ["DEX"], 0.1, 1, 0),
		];
		const near = neighbours(v(1, 0.1, 0), rows, 2, "p1");
		expect(near.map((n) => n.types[0])).toEqual(["Payments", "DEX"]);
		expect(typeScores(near, 1).get("Payments")).toBe(1);
		expect(assign(typeScores(near, 1), new Map([["Payments", 0.5]]))).toEqual([
			{ type: "Payments", score: 1 },
		]);
		// A type without a cut is never assigned, whatever its score.
		expect(assign(typeScores(near, 1), new Map())).toEqual([]);
	});
});

describe("a cut per type", () => {
	// Twenty payments rows and twenty DEX rows in two clean clusters, plus a
	// few AI rows inside the payments cluster: AI has too few examples, and
	// its neighbours are payments rows, so it never gets a cut.
	const rows: Labeled[] = [];
	for (let i = 0; i < 20; i++) {
		rows.push(row(`p${i}`, ["Payments"], 1, 0.01 * i, 0));
		rows.push(row(`d${i}`, ["DEX"], 0.01 * i, 1, 0));
	}
	for (let i = 0; i < 3; i++)
		rows.push(row(`ai${i}`, ["AI"], 1, 0.005 * i, 0.01));

	it("gives the clean types a cut and the thin one none", () => {
		const c = calibrate(rows, looNeighbours(rows, 5), 5);
		expect(c.cuts.has("Payments")).toBe(true);
		expect(c.cuts.has("DEX")).toBe(true);
		expect(c.cuts.has("AI")).toBe(false);
		expect(c.types.find((t) => t.type === "AI")?.support).toBeLessThan(
			MIN_SUPPORT,
		);
		expect(c.precision).toBeGreaterThanOrEqual(0.9);
	});

	it("picks a k whose overall precision clears the floor", () => {
		const { best, all } = bestCalibration(rows, [3, 5]);
		expect(all.map((c) => c.k)).toEqual([3, 5]);
		expect(best?.precision).toBeGreaterThanOrEqual(0.7);
	});
});
