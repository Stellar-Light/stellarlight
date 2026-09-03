import { describe, expect, it } from "vitest";
import { glyphInkMask, type Scene, styleField, tileAcross } from "./scenes";

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

// Builds a flat RGBA buffer for a SINGLE-COLOUR mark on transparency (e.g.
// Stellar's logo: solid black strokes, nothing else drawn) — every pixel in
// `opaque` gets the same near-black shade (no luminance spread to split),
// everything else is fully transparent.
function rgbaMono(n: number, opaque: Set<number>): Uint8ClampedArray {
	const data = new Uint8ClampedArray(n * 4);
	for (let i = 0; i < n; i++) {
		const v = opaque.has(i) ? 8 : 0; // near-black, same shade everywhere
		data[i * 4] = v;
		data[i * 4 + 1] = v;
		data[i * 4 + 2] = v;
		data[i * 4 + 3] = opaque.has(i) ? 255 : 0;
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

	// Single-colour-on-transparency (Stellar's logo: solid black, no
	// second shade to split) — the bug the coordinator flagged: the
	// disc-vs-glyph luminance split has nothing to divide here, so it must
	// fall back to alpha-based ink instead of coming out empty or inverted.
	it("uses alpha, not luminance, when opaque pixels have no luminance spread", () => {
		const n = 10;
		const opaque = new Set([2, 3, 4, 5]); // 40% of the raster
		const mask = glyphInkMask(rgbaMono(n, opaque), n);
		expect(mask).not.toBeNull();
		expect(Array.from(mask ?? [])).toEqual([0, 0, 1, 1, 1, 1, 0, 0, 0, 0]);
	});

	it("rejects a single-colour mark whose opaque region is too small a fraction of the raster", () => {
		const n = 100;
		const mask = glyphInkMask(rgbaMono(n, new Set([0])), n); // 1%
		expect(mask).toBeNull();
	});

	it("rejects a single-colour mark whose opaque region covers most of the raster", () => {
		const n = 100;
		const opaque = new Set(Array.from({ length: 90 }, (_, i) => i)); // 90%
		const mask = glyphInkMask(rgbaMono(n, opaque), n);
		expect(mask).toBeNull();
	});
});

describe("tileAcross", () => {
	// 3x2, fully inked (6 "on" cells) — a stand-in for one already-blitted
	// SLOT_W x SLOT_H stamp.
	const tile = { mask: new Uint8Array([1, 1, 1, 1, 1, 1]), cols: 3, rows: 2 };

	it("refuses a tile taller than the grid has rows for", () => {
		expect(tileAcross(tile, 20, 1)).toBeNull();
	});

	it("refuses a tile wider than the grid has columns for", () => {
		expect(tileAcross(tile, 2, 20)).toBeNull();
	});

	it("tiles in both directions and fills the grid exactly when it divides evenly", () => {
		// cols=18=6*3, rows=8=4*2 — no leftover, no margin.
		const cols = 18;
		const rows = 8;
		const out = tileAcross(tile, cols, rows);
		expect(out).not.toBeNull();
		if (!out) return;
		const totalOn = out.reduce((a, b) => a + b, 0);
		expect(totalOn).toBe(6 * 4 * 6); // 6x4 instances, 6 ink cells each
		expect(out.every((v) => v === 1)).toBe(true); // fully inked tile, exact fit — every cell on
	});

	it("tiles in both directions, centred, with margin when it doesn't divide evenly", () => {
		// cols=20 (6 instances of width 3 = 18, 1 margin each side),
		// rows=9 (4 instances of height 2 = 8, floor(1/2)=0 top margin,
		// the leftover 1 row goes to the bottom — see tileAcross's own
		// floor-not-round comment).
		const cols = 20;
		const rows = 9;
		const out = tileAcross(tile, cols, rows);
		expect(out).not.toBeNull();
		if (!out) return;

		const instCols = 6;
		const instRows = 4;
		const totalOn = out.reduce((a, b) => a + b, 0);
		expect(totalOn).toBe(instCols * instRows * 6);

		// Left/right margin columns stay empty on every row.
		for (let y = 0; y < rows; y++) {
			expect(out[y * cols + 0]).toBe(0);
			expect(out[y * cols + 19]).toBe(0);
		}
		// Top margin row (startY=0 here) is the first instance row itself —
		// row 8 (the leftover row, floored to the bottom) stays empty.
		expect(out.slice(8 * cols, 9 * cols).every((v) => v === 0)).toBe(true);
		// First instance lands at (1,0).
		expect(out[0 * cols + 1]).toBe(1);
		expect(out[0 * cols + 3]).toBe(1); // gap column before the next instance
	});

	it("every instance is byte-identical (same source array, integer offsets only)", () => {
		const hollow = {
			mask: new Uint8Array([1, 0, 1, 0, 1, 0]),
			cols: 3,
			rows: 2,
		};
		const cols = 18;
		const rows = 8;
		const out = tileAcross(hollow, cols, rows);
		expect(out).not.toBeNull();
		if (!out) return;
		const blocks: string[] = [];
		for (let cy = 0; cy < 4; cy++) {
			for (let cx = 0; cx < 6; cx++) {
				let s = "";
				for (let ty = 0; ty < 2; ty++) {
					for (let tx = 0; tx < 3; tx++) {
						s += out[(cy * 2 + ty) * cols + (cx * 3 + tx)];
					}
				}
				blocks.push(s);
			}
		}
		expect(blocks.every((b) => b === blocks[0])).toBe(true);
	});
});

describe("styleField", () => {
	const scene: Scene = {
		kind: "text",
		transition: "wipe",
		palette: 0,
		style: "swell",
	};

	it("repeats the texture with the given period (every tile copy renders identically)", () => {
		const cols = 9;
		const rows = 4;
		const period = { w: 3, h: 2 };
		const out = new Float32Array(cols * rows);
		// prev omitted -> from===to internally, isolating stateOf's own
		// periodicity from the transition-morph interpolation.
		styleField(scene, cols, rows, 1, out, undefined, period);

		const v00 = out[0 * cols + 0];
		expect(out[0 * cols + 3]).toBeCloseTo(v00, 5); // one period across
		expect(out[0 * cols + 6]).toBeCloseTo(v00, 5); // two periods across
		expect(out[2 * cols + 0]).toBeCloseTo(v00, 5); // one period down
	});

	it("does not repeat by that period without one (proves period isn't a no-op)", () => {
		const cols = 9;
		const rows = 4;
		const out = new Float32Array(cols * rows);
		styleField(scene, cols, rows, 1, out, undefined);
		expect(out[0 * cols + 3]).not.toBeCloseTo(out[0 * cols + 0], 2);
	});
});
