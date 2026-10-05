import { describe, expect, it } from "vitest";
import {
	assign,
	type Labeled,
	leaveOneOut,
	neighbours,
	pickSetting,
	typeScores,
	unit,
} from "@/lib/hackathon-build-categories";

const v = (...xs: number[]) => unit(xs, xs.length) as Float32Array;
const row = (id: string, types: string[], ...xs: number[]): Labeled => ({
	id,
	types,
	vec: v(...xs),
});

// Two clean clusters: payments along x, DEXes along y.
const LABELED = [
	row("p1", ["Payments"], 1, 0.1, 0),
	row("p2", ["Payments"], 1, 0.2, 0),
	row("p3", ["Payments", "AI"], 1, 0.05, 0.1),
	row("d1", ["DEX"], 0.1, 1, 0),
	row("d2", ["DEX"], 0.2, 1, 0),
	row("d3", ["DEX"], 0.05, 1, 0.1),
];

describe("nearest directory projects", () => {
	it("rejects anything that is not a usable vector", () => {
		expect(unit([1, 2], 3)).toBeNull();
		expect(unit([0, 0, 0], 3)).toBeNull();
		expect(unit("x", 3)).toBeNull();
	});

	it("scores a type by its weighted share of the neighbours, and leaves the row itself out", () => {
		const near = neighbours(v(1, 0.1, 0), LABELED, 3, "p1");
		expect(near.map((n) => n.types[0])).toEqual([
			"Payments",
			"Payments",
			"DEX",
		]);
		const s = typeScores(near, 2);
		expect(s.get("Payments")).toBe(1);
		expect(assign(s, 0.5)).toEqual([{ type: "Payments", score: 1 }]);
	});

	it("measures itself on the labeled rows and picks a setting that clears the floor", () => {
		const m = leaveOneOut(LABELED, [2], [0.5]);
		expect(m[0]).toMatchObject({ k: 2, cut: 0.5, precision: 1, covered: 1 });
		expect(pickSetting(m)?.k).toBe(2);
		expect(pickSetting([{ ...m[0], precision: 0.5 }])).toBeNull();
	});
});
