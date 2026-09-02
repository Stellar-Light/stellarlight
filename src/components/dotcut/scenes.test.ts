import { describe, expect, it } from "vitest";
import { glyphInkMask, tileAcross } from "./scenes";

// Builds a flat RGBA buffer: `bright` pixel indices get white (ink
// candidate), everything else black, all fully opaque unless `alpha0`
// marks an index as fully transparent instead.
function rgba(
	n: number,
	bright: Set<number>,
	alpha0?: Set<number>,
): Uint8ClampedArray {
	const data = new Uint8ClampedArray(n * 4);
	for (let i = 0; i < n; i++) {
		const v = bright.has(i) ? 255 : 0;
		data[i * 4] = v;
		data[i * 4 + 1] = v;
		data[i * 4 + 2] = v;
		data[i * 4 + 3] = alpha0?.has(i) ? 0 : 255;
	}
	return data;
}

describe("glyphInkMask", () => {
	it("returns null when nothing is opaque", () => {
		const n = 10;
		expect(
			glyphInkMask(
				rgba(n, new Set(), new Set(Array.from({ length: n }, (_, i) => i))),
				n,
			),
		).toBeNull();
	});

	it("flags the brighter-than-midpoint pixels as ink when coverage is in band", () => {
		const n = 10;
		const bright = new Set([0, 1, 2, 3, 4]); // 50% coverage
		const mask = glyphInkMask(rgba(n, bright), n);
		expect(mask).not.toBeNull();
		expect(Array.from(mask ?? [])).toEqual([1, 1, 1, 1, 1, 0, 0, 0, 0, 0]);
	});

	it("rejects coverage below the 3% floor (would-be near-empty carve)", () => {
		const n = 100;
		const mask = glyphInkMask(rgba(n, new Set([0])), n); // 1%
		expect(mask).toBeNull();
	});

	it("rejects coverage above the 55% ceiling (would-be inside-out carve)", () => {
		const n = 100;
		const bright = new Set(Array.from({ length: 90 }, (_, i) => i)); // 90%
		const mask = glyphInkMask(rgba(n, bright), n);
		expect(mask).toBeNull();
	});
});

describe("tileAcross", () => {
	const tile = { mask: new Uint8Array([1, 1, 1, 1]), cols: 2, rows: 2 };

	it("refuses a tile taller than the grid has rows for", () => {
		expect(tileAcross(tile, 20, 1)).toBeNull();
	});

	it("repeats the tile across the width, centred, with the right total ink count", () => {
		const cols = 20;
		const rows = 6;
		const out = tileAcross(tile, cols, rows);
		expect(out).not.toBeNull();
		if (!out) return;

		// gap=2, period=4, count=floor((20+2)/4)=5, totalW=18, startX=1 —
		// tiles land at x=1,5,9,13,17, each 2 cols wide.
		const totalOn = out.reduce((a, b) => a + b, 0);
		expect(totalOn).toBe(5 * 4); // 5 copies of a fully-inked 2x2 tile

		const startY = 2; // floor((6-2)/2)
		for (const ox of [1, 5, 9, 13, 17]) {
			expect(out[startY * cols + ox]).toBe(1);
			expect(out[startY * cols + ox + 1]).toBe(1);
			expect(out[(startY + 1) * cols + ox]).toBe(1);
		}
		// Margin rows above/below the tile stay empty.
		expect(out.slice(0, cols).every((v) => v === 0)).toBe(true);
		expect(out.slice(5 * cols, 6 * cols).every((v) => v === 0)).toBe(true);
		// Gap column between the first two tiles stays empty.
		expect(out[startY * cols + 3]).toBe(0);
	});

	it("only ever adds cells for the tile's own ink (a hollow tile leaves gaps)", () => {
		const hollow = { mask: new Uint8Array([1, 0, 0, 1]), cols: 2, rows: 2 };
		const out = tileAcross(hollow, 20, 6);
		expect(out).not.toBeNull();
		if (!out) return;
		const totalOn = out.reduce((a, b) => a + b, 0);
		expect(totalOn).toBe(5 * 2); // 2 ink cells per tile, 5 tiles
	});
});
