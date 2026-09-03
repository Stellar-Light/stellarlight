export interface Scene {
	kind: "text" | "rings" | "checker" | "bars" | "columns" | "boxes" | "image";
	value?: string;
	/** Source for `kind: "image"` — a decoded, ready-to-draw image. */
	image?: CanvasImageSource;
	/** Debug/identification only, e.g. for logging which scene carved what. */
	label?: string;
	transition: TransitionKind;
	palette: number;
	style?: StyleKind;
	/**
	 * Tile this text/image mark repeatedly across the grid as small,
	 * STANDING (positive) circles on an otherwise empty field, instead of
	 * carving one large hole into a solid one. This is the inverse of the
	 * default polarity: a single big glyph fights this banner's own
	 * proportions (far wider than tall) for legibility, but a small glyph
	 * repeated across the width doesn't need the aspect ratio to cooperate
	 * — see rasterize()'s tile-mode path below.
	 */
	tile?: boolean;
}

export type TransitionKind =
	| "wipe"
	| "ripple"
	| "scatter"
	| "collapse"
	| "columns";

export function cellMotion(
	kind: TransitionKind,
	t: number,
	dir: number,
	rand: number,
): { scale: number; dx: number; dy: number; spin: number } {
	const u = Math.sin(Math.min(1, Math.max(0, t)) * Math.PI);
	switch (kind) {
		case "wipe":
			return { scale: 1, dx: u * 0.16 * -dir, dy: 0, spin: 0 };
		case "ripple":
			return { scale: 1 - u * 0.1, dx: 0, dy: u * -0.13, spin: 0 };
		case "scatter":
			return {
				scale: 1,
				dx: u * 0.18 * Math.cos(rand * Math.PI * 2),
				dy: u * 0.18 * Math.sin(rand * Math.PI * 2),
				spin: 0,
			};
		case "collapse":
			return { scale: 1 - u * 0.18, dx: 0, dy: 0, spin: 0 };
		case "columns":
			return { scale: 1, dx: 0, dy: u * 0.22, spin: 0 };
	}
}

export type StyleKind = "drift" | "grain" | "swell" | "streak" | null;

function smooth01(v: number, e0: number, e1: number): number {
	const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
}

function hash2(x: number, y: number): number {
	const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
	return s - Math.floor(s);
}

export const SCENES: Scene[] = [
	{ kind: "text", value: "A", transition: "wipe", palette: 0, style: "drift" },
	{ kind: "rings", transition: "ripple", palette: 1, style: "grain" },
	{ kind: "columns", transition: "columns", palette: 2, style: "streak" },
	{ kind: "checker", transition: "scatter", palette: 3, style: "swell" },
	{ kind: "boxes", transition: "collapse", palette: 4, style: "grain" },
	{ kind: "bars", transition: "wipe", palette: 5, style: "drift" },
];

export function styleField(
	scene: Scene,
	cols: number,
	rows: number,
	t: number,
	out: Float32Array,
	prev?: Scene,
	period?: { w: number; h: number },
) {
	// Tiled mark scenes (Scene.tile) repeat the same small glyph at several
	// positions — see tileAcross. Without `period`, this style texture is
	// computed from each cell's ABSOLUTE grid position, which varies wildly
	// between one copy and the next (a cell near the grid's centre gets a
	// very different "swell" depth than the same relative cell in a copy
	// near the edge) — the mask is identical per copy, but the ring/bore
	// texture drawn on top of it was not, so two copies of the same mark
	// could render as different WEIGHTS (mostly solid vs. mostly hollow
	// circles) even with identical outlines. `period` wraps the coordinates
	// used below to the size of one tile slot, so the texture repeats with
	// the same period the mask does, and every copy renders identically.
	const pcols = period?.w ?? cols;
	const prows = period?.h ?? rows;
	const cx = (pcols - 1) / 2;
	const cy = (prows - 1) / 2;
	const maxR = Math.hypot(pcols, prows) / 2;
	const FLIP = 0.32;

	const stateOf = (
		style: StyleKind | undefined,
		x: number,
		y: number,
	): number => {
		switch (style) {
			case "drift": {
				const a = Math.sin(x * 0.41 + y * 0.23);
				const b = Math.sin(x * 0.17 - y * 0.53 + 2.1);
				return smooth01((a + b) * 0.5, -0.15, 0.75);
			}
			case "grain": {
				const n =
					hash2(x, y) * 0.55 +
					hash2(x + 1, y) * 0.15 +
					hash2(x, y + 1) * 0.15 +
					hash2(x + 1, y + 1) * 0.15;
				return smooth01(n, 0.34, 0.86);
			}
			case "swell": {
				const d = Math.hypot(x - cx, y - cy) / maxR;
				const warp = Math.sin(Math.atan2(y - cy, x - cx) * 3.0) * 0.14;
				return smooth01(1 - (d + warp), 0.28, 0.92);
			}
			case "streak": {
				const s = Math.sin(x * 0.28 + y * 0.62);
				const cut = Math.sin(x * 0.09 - y * 0.11 + 1.3) * 0.5 + 0.5;
				return smooth01(s * cut, -0.05, 0.7);
			}
			default:
				return 0;
		}
	};

	for (let y = 0; y < rows; y++) {
		for (let x = 0; x < cols; x++) {
			const px = period ? x % pcols : x;
			const py = period ? y % prows : y;
			let order = 0;
			switch (scene.style) {
				case "drift":
					order = (px / pcols) * 0.75 + Math.sin(py * 0.5) * 0.12 + 0.12;
					break;
				case "grain":
					order =
						(px / pcols) * 0.55 + (py / prows) * 0.25 + hash2(px, py) * 0.2;
					break;
				case "swell":
					order = Math.hypot(px - cx, py - cy) / maxR;
					break;
				case "streak":
					order = (px / pcols) * 0.8 + (py / prows) * 0.2;
					break;
			}
			const from = stateOf(prev?.style ?? scene.style, px, py);
			const to = stateOf(scene.style, px, py);
			const u = Math.min(1, Math.max(0, (t - order * (1 - FLIP)) / FLIP));
			const eased = u * u * (3 - 2 * u);
			out[y * cols + x] = from + (to - from) * eased;
		}
	}
}

// CIRCLE colour only, one per scene — the ground used to be a second half
// of every entry here (a per-scene dark colour, mixed the same way as the
// circle on every transition), but that made the banner read as its own
// dark rectangle pasted onto the page rather than circles living directly
// on it: the page background is `#171717`, the banner's own darkest
// grounds were close but not exact, and close-but-not-exact still shows a
// seam. The ground is now a single colour for every scene — the page's own
// background, read once at runtime from its `--background` custom
// property (see engine.ts's `groundColor`) rather than duplicated here —
// so there is no seam to get close to. The colour rhythm across a scene
// change now comes entirely from the circles.
export const PALETTES: string[] = [
	"#8aa9ff",
	"#ffd166",
	"#b8f2c9",
	"#ffc2e2",
	"#c7d2fe",
	"#fde68a",
	// 6-14: the stablecoins-header banner's own palette, one bold, saturated
	// circle colour per scene (~55-70% luminance, "genuine two-tone" against
	// the now-fixed dark ground) so each scene still reads as its own event.
	"#2FD98A", // usdt0 — vivid mint (Tether)
	"#3E7BFA", // rings — vivid blue
	"#FF5D5D", // columns — coral
	"#A56EFF", // checker — violet
	"#EDEFF5", // stellar — near-white silver, the mark's own common dark-UI treatment (index 10 was "boxes"; freed when that pattern scene was dropped for stellar, reused rather than left dead)
	"#FF63B0", // bars — hot pink
	"#F5B942", // $ — gold
	"#4FC3F7", // € — sky blue
	"#6C5CE7", // pyusd — indigo (index 14 was usdc, dropped this pass — its
	// inner $ never cleared the legibility bar even at this file's largest
	// tested slot, and it's height-bound, not width-bound, so a bigger slot
	// couldn't have helped; see the PR for the masks this call was made
	// from. Slot freed, not left dead — nothing new needed it this round.)
];

export function rasterize(
	scene: Scene,
	cols: number,
	rows: number,
	fontFamily: string,
): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(new ArrayBuffer(cols * rows)).fill(1);
	const cx = (cols - 1) / 2;
	const cy = (rows - 1) / 2;

	if (scene.kind === "checker") {
		const b = Math.max(2, Math.round(cols / 14));
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				if ((Math.floor(x / b) + Math.floor(y / b)) % 2 === 0)
					out[y * cols + x] = 0;
			}
		}
		return out;
	}

	if (scene.kind === "bars") {
		const period = 3;
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				if (Math.floor((x + y) / period) % 2 === 0) out[y * cols + x] = 0;
			}
		}
		return out;
	}

	if (scene.kind === "columns") {
		const bw = 4;
		const bh = 3;
		for (let y = 0; y < rows; y++) {
			const band = Math.floor(y / bh);
			const shift = band % 2 === 0 ? 0 : bw / 2;
			for (let x = 0; x < cols; x++) {
				if (Math.floor((x + shift) / bw) % 2 === 0) out[y * cols + x] = 0;
			}
		}
		return out;
	}

	if (scene.kind === "boxes") {
		const period = 2.5;
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				const d = Math.max(Math.abs(x - cx), Math.abs(y - cy));
				if (Math.floor(d / period) % 2 === 0) out[y * cols + x] = 0;
			}
		}
		return out;
	}

	if (scene.kind === "rings") {
		const maxR = Math.hypot(cols, rows) / 2;
		for (let y = 0; y < rows; y++) {
			for (let x = 0; x < cols; x++) {
				const d = Math.hypot(x - cx, y - cy) / maxR;
				if (Math.floor(d * 6.0) % 2 === 0) out[y * cols + x] = 0;
			}
		}
		return out;
	}

	if (scene.tile) return rasterizeTiled(scene, cols, rows, fontFamily, out);

	const cv = document.createElement("canvas");
	cv.width = cols;
	cv.height = rows;
	const ctx = cv.getContext("2d", { willReadFrequently: true });
	if (!ctx) return out;

	if (scene.kind === "image" && scene.image)
		return rasterizeImage(scene.image, ctx, cols, rows, out);

	const text = (scene.value || "").trim();
	if (!text) return out;

	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, cols, rows);
	ctx.fillStyle = "#fff";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	// Sized to command the banner, not just survive it: on a very wide strip
	// a mark sized off height alone reads as a small island in a lot of dead
	// texture. Start the size guess above the height target (below, the
	// shrink-only logic here can never grow past a low initial guess).
	let size = rows * 1.0;
	ctx.font = `600 ${size}px ${fontFamily}`;
	const maxW = cols * 0.6;
	const m = ctx.measureText(text);
	if (m.width > maxW) {
		size *= maxW / m.width;
		ctx.font = `600 ${size}px ${fontFamily}`;
	}

	const maxH = rows * 0.82;
	const mm = ctx.measureText(text);
	const gh = mm.actualBoundingBoxAscent + mm.actualBoundingBoxDescent;
	if (gh > maxH) {
		size *= maxH / gh;
		ctx.font = `600 ${size}px ${fontFamily}`;
	}
	ctx.fillText(text, cols / 2, rows / 2 + rows * 0.02);

	const data = ctx.getImageData(0, 0, cols, rows).data;
	for (let i = 0; i < cols * rows; i++) {
		if (data[i * 4] > 110) out[i] = 0;
	}
	return out;
}

function imageSize(img: CanvasImageSource): { w: number; h: number } {
	if (img instanceof HTMLImageElement)
		return { w: img.naturalWidth, h: img.naturalHeight };
	if (img instanceof HTMLVideoElement)
		return { w: img.videoWidth, h: img.videoHeight };
	if (img instanceof HTMLCanvasElement || img instanceof ImageBitmap) {
		return { w: img.width, h: img.height };
	}
	return { w: 0, h: 0 };
}

// Footprint-fill fraction for the one big hole-mode carve (rasterizeImage):
// centred, aspect preserved, sized to command the grid rather than survive
// it, with room left around it so the carve doesn't touch the grid edge.
const MARK_FILL = 0.82;

// Every tiled mark scene places instances in a grid of fixed-size slots —
// SLOT_W x SLOT_H cells each — instead of sizing the slot to whatever the
// glyph's own rasterised width happened to be. That older approach made
// the instance COUNT an accident of each glyph's aspect ratio (a wide
// glyph like € fit fewer copies than a narrow one, so the count visibly
// jumped between scenes) and undersized every glyph relative to what a
// consistent slot can actually hold. SLOT_H is bounded hard by this
// banner's own height (15 rows at the current 19px cells) — 13 leaves the
// same one row of margin top and bottom this file has used since #1261.
// SLOT_W has more room: tested 18-31 cells against every mark (see the PR
// that introduced this — masks don't lie), and going past 21 bought
// nothing further for any mark that wasn't already HEIGHT-bound (a wider
// slot just adds unused side margin for those), so 21 is the smallest
// width already doing all the useful work — and it still fits 3 copies
// across the real desktop width.
export const SLOT_W = 21;
export const SLOT_H = 13;

/**
 * The slot height to use for a given grid.
 *
 * `SLOT_H` is sized for the DESKTOP banner (15 rows at 19px cells), where one
 * row of slots is all that fits. Mobile's grid is much taller in proportion
 * (~42x28), and the first attempt at filling it stacked a SECOND row of
 * marks — four copies, two above two. The owner's verdict: "they're like 4 of
 * them they're stacked on top of each other either cut it to 2 or remove the
 * whole thing". He is right; four small marks in a narrow frame is busier
 * than the emptiness a single mark left behind.
 *
 * So a tall grid grows the SLOT rather than adding instances: two copies side
 * by side, each using the full height. The glyph still scales to whichever
 * axis binds first (FILL_W/FILL_H below), so on mobile it ends up
 * width-bound and centred in the taller slot — bigger mark, same count.
 */
export function slotHeightFor(rows: number): number {
	return rows >= 2 * SLOT_H ? Math.max(SLOT_H, rows - 2) : SLOT_H;
}

// Fraction of the slot each glyph may use, per axis — the remainder is
// outer margin (height) or the gap between instances (width). FILL_H
// mirrors the old TILE_FILL (nearly the full slot height — breathing room
// comes from the grid of slots itself, not a second shrink inside one).
// FILL_W is more generous than the old inter-tile gap ratio on purpose:
// most of this pass's legibility gain came from letting width-bound
// glyphs (€ especially) use more of their slot, not from a bigger gap.
const FILL_H = 0.98;
const FILL_W = 0.85;

/**
 * Which pixels of an already-drawn raster are "ink" (positive polarity: 1 =
 * ink) as opposed to disc/background — shared by the hole-mode carve and
 * the tile-mode rasterisers below. Two kinds of source image, two ink
 * rules:
 *
 * Most of these marks are a coloured disc/square with a lighter glyph
 * inside (USDT0 = white T on green, USDC / EURC = white glyph on blue,
 * PYUSD similar), so "opaque pixel" is not "ink": that would flag the
 * whole disc and lose the glyph. For those, the glyph is the ink: among
 * alpha > 0.5 pixels, whichever are brighter than the midpoint of the
 * luminance range — which only works because the disc and the glyph are
 * two different shades to split.
 *
 * A single-colour mark on transparency (e.g. Stellar's logo: solid black
 * strokes, nothing else drawn) has no such split — every opaque pixel is
 * close to the same shade, so a luminance midpoint has nothing meaningful
 * to divide and would carve anti-aliasing noise instead of the shape (empty
 * or inverted, never the mark). Detected by near-zero luminance spread
 * among the opaque pixels; the ink there is the opaque region itself.
 *
 * The sanity check only ever REJECTS (null), it never inverts. For the
 * disc-and-glyph case, coverage is judged against the mark's own opaque
 * footprint, not the raster as a whole — checking against the whole raster
 * meant the glyph could never clear the floor on a banner far wider than
 * tall, and silently carving the disc instead (a "plain filled circle") is
 * exactly the failure this exists to avoid. For the single-colour case
 * there is no separate footprint to check ink against (ink IS the opaque
 * region), so coverage there is judged against the whole raster instead —
 * still the same question, "is this a legible minority shape, not empty
 * and not everything." Either way: too little or too much to read as a
 * legible shape, and callers leave their lattice/tile intact rather than
 * ship an empty, nearly-full, or inside-out result.
 */
export function glyphInkMask(
	data: Uint8ClampedArray,
	n: number,
): Uint8Array | null {
	const lum = new Float32Array(n);
	const alpha = new Float32Array(n);
	let lo = 255;
	let hi = 0;
	let opaque = 0;
	for (let i = 0; i < n; i++) {
		const a = data[i * 4 + 3] / 255;
		alpha[i] = a;
		if (a <= 0.5) continue;
		opaque++;
		const l =
			0.2126 * data[i * 4] +
			0.7152 * data[i * 4 + 1] +
			0.0722 * data[i * 4 + 2];
		lum[i] = l;
		if (l < lo) lo = l;
		if (l > hi) hi = l;
	}
	if (opaque === 0) return null;

	if (hi - lo < 20) {
		// Single-colour-on-transparency: ink is the opaque region itself.
		const mask = new Uint8Array(n);
		for (let i = 0; i < n; i++) mask[i] = alpha[i] > 0.5 ? 1 : 0;
		const coverage = opaque / n;
		return coverage >= 0.03 && coverage <= 0.55 ? mask : null;
	}

	const mid = (lo + hi) / 2;
	const mask = new Uint8Array(n);
	let ink = 0;
	for (let i = 0; i < n; i++) {
		if (alpha[i] <= 0.5) continue;
		if (lum[i] > mid) {
			mask[i] = 1;
			ink++;
		}
	}

	const coverage = ink / opaque;
	return coverage >= 0.03 && coverage <= 0.55 ? mask : null;
}

/**
 * Carve an image-backed scene into a cols×rows mask, glyph-as-hole: the
 * disc itself is never carved — the mark has to read as a hole punched in
 * the surface, not as the surface punched into a big hole with the mark
 * left standing inside it.
 */
function rasterizeImage(
	image: CanvasImageSource,
	ctx: CanvasRenderingContext2D,
	cols: number,
	rows: number,
	out: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
	const { w: iw, h: ih } = imageSize(image);
	if (!iw || !ih) return out;

	const dh = rows * MARK_FILL;
	const dw = iw * (dh / ih);
	ctx.clearRect(0, 0, cols, rows);
	ctx.drawImage(image, (cols - dw) / 2, (rows - dh) / 2, dw, dh);

	const { data } = ctx.getImageData(0, 0, cols, rows);
	const ink = glyphInkMask(data, cols * rows);
	if (!ink) return out; // nothing legible — leave the lattice intact

	const mask = new Uint8Array(cols * rows).fill(1);
	for (let i = 0; i < mask.length; i++) if (ink[i]) mask[i] = 0;
	return mask;
}

/**
 * Dispatch a tile-mode scene (Scene.tile) to its text/image rasteriser and
 * repeat the result across the grid in both directions — see tileAcross.
 * Same refusal contract as every other carve in this file: anything that
 * doesn't produce a legible small glyph leaves the solid lattice (`out`)
 * intact rather than ship a broken or empty banner for a cycle.
 */
function rasterizeTiled(
	scene: Scene,
	cols: number,
	rows: number,
	fontFamily: string,
	out: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
	if (cols < SLOT_W || rows < SLOT_H) return out; // grid too small for even one slot

	// A tall grid grows the slot instead of stacking a second row of marks
	// (slotHeightFor) — mobile ends up two copies side by side, each using the
	// full height, rather than four small ones in a 2x2.
	const slotH = slotHeightFor(rows);
	const tile =
		scene.kind === "image" && scene.image
			? rasterizeImageTile(scene.image, slotH)
			: scene.kind === "text"
				? rasterizeTextTile((scene.value ?? "").trim(), fontFamily, slotH)
				: null;
	if (!tile) return out;

	return tileAcross(tile, cols, rows) ?? out;
}

/**
 * Crop an image scene down to just its own glyph (glyphBBox) and rasterise
 * THAT to fit within one SLOT_W x SLOT_H slot, ink = 1 (this scene's mark
 * stands as circles — see Scene.tile). Sized to the slot's height first
 * (FILL_H, aspect preserved) and only shrunk further if that would
 * overflow the slot's own width budget (FILL_W) — most marks are
 * height-bound and never hit that second constraint; wide ones (€, the
 * widest glyph this file rasterises) are exactly why it exists. The
 * source PNGs are also a coloured square/disc with a lot of flat colour
 * around a much smaller mark; cropping to glyphBBox first (rather than
 * sizing against the full image) means every pixel of the small raster
 * below is doing work.
 */
function rasterizeImageTile(
	image: CanvasImageSource,
	slotH: number = SLOT_H,
): { mask: Uint8Array; cols: number; rows: number } | null {
	const box = glyphBBox(image);
	if (!box) return null;

	let dh = slotH * FILL_H;
	let dw = dh * (box.w / box.h);
	const maxW = SLOT_W * FILL_W;
	if (dw > maxW) {
		const scale = maxW / dw;
		dw *= scale;
		dh *= scale;
	}
	const gCols = Math.max(1, Math.round(dw));
	const gRows = Math.max(1, Math.round(dh));

	const cv = document.createElement("canvas");
	cv.width = gCols;
	cv.height = gRows;
	const ctx = cv.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	ctx.drawImage(image, box.x, box.y, box.w, box.h, 0, 0, gCols, gRows);

	const { data } = ctx.getImageData(0, 0, gCols, gRows);
	const ink = glyphInkMask(data, gCols * gRows);
	if (!ink) return null;
	return blitIntoSlot(ink, gCols, gRows, slotH);
}

/**
 * Centre a small, already-thresholded glyph ink mask inside one SLOT_W x
 * SLOT_H slot — the fixed-size unit tileAcross repeats across the grid.
 * Every mark scene blits into the same slot size, and tileAcross places
 * copies at exact integer multiples of it, so the copies are
 * pixel-identical by construction: there is no independent
 * re-rasterisation or rounding at each position that could make one land
 * differently.
 */
function blitIntoSlot(
	glyph: Uint8Array,
	gCols: number,
	gRows: number,
	slotH: number,
): { mask: Uint8Array; cols: number; rows: number } {
	const dx = Math.floor((SLOT_W - gCols) / 2);
	const dy = Math.floor((slotH - gRows) / 2);
	const mask = new Uint8Array(SLOT_W * slotH);
	for (let y = 0; y < gRows; y++) {
		const oy = dy + y;
		if (oy < 0 || oy >= slotH) continue;
		const gBase = y * gCols;
		const oBase = oy * SLOT_W;
		for (let x = 0; x < gCols; x++) {
			if (!glyph[gBase + x]) continue;
			const ox = dx + x;
			if (ox >= 0 && ox < SLOT_W) mask[oBase + ox] = 1;
		}
	}
	return { mask, cols: SLOT_W, rows: slotH };
}

/**
 * Bounding box of a glyph-bearing image's own ink (same disc-vs-glyph
 * luminance split as glyphInkMask), at the image's native resolution, so
 * rasterizeImageTile can crop to it instead of carrying the mark's own
 * flat-colour padding into a tile that has few pixels to spare.
 */
function glyphBBox(
	image: CanvasImageSource,
): { x: number; y: number; w: number; h: number } | null {
	const { w: iw, h: ih } = imageSize(image);
	if (!iw || !ih) return null;

	const cv = document.createElement("canvas");
	cv.width = iw;
	cv.height = ih;
	const ctx = cv.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	ctx.drawImage(image, 0, 0);

	const { data } = ctx.getImageData(0, 0, iw, ih);
	const ink = glyphInkMask(data, iw * ih);
	if (!ink) return null;

	let minX = iw;
	let minY = ih;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < ih; y++) {
		for (let x = 0; x < iw; x++) {
			if (!ink[y * iw + x]) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	if (maxX < minX) return null;
	return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Rasterise a short text glyph (a currency symbol) to fit within one slot,
 * ink = 1 — the text-mode sibling of rasterizeImageTile. Same two-axis fit
 * (height first via FILL_H, width capped by FILL_W) and the same
 * measure-then-fit two-pass the full-grid "text" branch above uses; no
 * disc to crop away here, so this measures and fits directly.
 */
function rasterizeTextTile(
	text: string,
	fontFamily: string,
	slotH: number = SLOT_H,
): { mask: Uint8Array; cols: number; rows: number } | null {
	if (!text) return null;

	const cv = document.createElement("canvas");
	const ctx = cv.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;

	let size = slotH;
	ctx.font = `600 ${size}px ${fontFamily}`;
	let m = ctx.measureText(text);
	const gh0 = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || size;
	size *= (slotH * FILL_H) / gh0;
	ctx.font = `600 ${size}px ${fontFamily}`;
	m = ctx.measureText(text);

	const maxW = SLOT_W * FILL_W;
	if (m.width > maxW) {
		size *= maxW / m.width;
		ctx.font = `600 ${size}px ${fontFamily}`;
		m = ctx.measureText(text);
	}

	// Padded a bit wider/taller than the measured glyph so strokes don't
	// touch this tight crop's own edge — the gap between repeats is a
	// separate concern, handled by tileAcross once this is blitted into a
	// full slot.
	const gCols = Math.max(1, Math.round(m.width * 1.25));
	const gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || size;
	const gRows = Math.max(1, Math.round(gh * 1.15));
	cv.width = gCols;
	cv.height = gRows;
	// Resizing the canvas resets context state, so the font has to be set
	// again after cv.width/height are assigned above.
	ctx.font = `600 ${size}px ${fontFamily}`;
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, gCols, gRows);
	ctx.fillStyle = "#fff";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(text, gCols / 2, gRows / 2 + gRows * 0.02);

	const { data } = ctx.getImageData(0, 0, gCols, gRows);
	const mask = new Uint8Array(gCols * gRows);
	let ink = 0;
	for (let i = 0; i < mask.length; i++) {
		if (data[i * 4] > 110) {
			mask[i] = 1;
			ink++;
		}
	}
	if (ink === 0) return null;
	return blitIntoSlot(mask, gCols, gRows, slotH);
}

/**
 * Repeat a fixed SLOT_W x SLOT_H stamp across the grid in BOTH directions —
 * however many whole slots fit each way, evenly spaced, centred as one
 * block (see Scene.tile). Desktop (wide, short) works out to several
 * columns and one row; mobile (much closer to square, and taller in
 * proportion) works out to several columns AND several rows — the same
 * formula either way, so a future container size just gets whatever it
 * geometrically fits instead of needing another special case. Every
 * instance is the exact same source array at an integer-multiple offset,
 * so copies are pixel-identical: no independent re-rasterisation, no
 * rounding that could make one land differently.
 */
export function tileAcross(
	tile: { mask: Uint8Array; cols: number; rows: number },
	cols: number,
	rows: number,
): Uint8Array<ArrayBuffer> | null {
	const { mask, cols: tCols, rows: tRows } = tile;
	const instCols = Math.max(1, Math.floor(cols / tCols));
	const instRows = Math.max(1, Math.floor(rows / tRows));
	const totalW = instCols * tCols;
	const totalH = instRows * tRows;
	// floor (not round): keeps a too-large stamp refused below rather than
	// rounding a negative half-width up to a startX/Y of 0 and silently
	// clipping the outermost instance's own far edge.
	const startX = Math.floor((cols - totalW) / 2);
	const startY = Math.floor((rows - totalH) / 2);
	if (startX < 0 || startY < 0) return null;

	const out = new Uint8Array(new ArrayBuffer(cols * rows));
	for (let cy = 0; cy < instRows; cy++) {
		const oy0 = startY + cy * tRows;
		for (let cx = 0; cx < instCols; cx++) {
			const ox0 = startX + cx * tCols;
			for (let ty = 0; ty < tRows; ty++) {
				const y = oy0 + ty;
				if (y < 0 || y >= rows) continue;
				const base = ty * tCols;
				const rowOff = y * cols;
				for (let tx = 0; tx < tCols; tx++) {
					if (mask[base + tx]) out[rowOff + ox0 + tx] = 1;
				}
			}
		}
	}
	return out;
}

export function cellDelay(
	kind: TransitionKind,
	x: number,
	y: number,
	cols: number,
	rows: number,
	rand: number,
): number {
	const fx = cols > 1 ? x / (cols - 1) : 0;
	const fy = rows > 1 ? y / (rows - 1) : 0;
	switch (kind) {
		case "wipe":
			return Math.min(
				1,
				Math.max(0, (fx * 0.75 + fy * 0.25) * 0.85 + rand * 0.15),
			);
		case "ripple": {
			const d = Math.hypot(fx - 0.5, fy - 0.5) / Math.SQRT1_2;
			return Math.min(1, d * 0.9 + rand * 0.1);
		}
		case "scatter":
			return rand;
		case "collapse": {
			const d = Math.hypot(fx - 0.5, fy - 0.5) / Math.SQRT1_2;
			return Math.min(1, (1 - d) * 0.85 + rand * 0.15);
		}
		case "columns":
			return Math.min(1, fx * 0.9 + rand * 0.1);
	}
}
