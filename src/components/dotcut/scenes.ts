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
) {
	const cx = (cols - 1) / 2;
	const cy = (rows - 1) / 2;
	const maxR = Math.hypot(cols, rows) / 2;
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
			let order = 0;
			switch (scene.style) {
				case "drift":
					order = (x / cols) * 0.75 + Math.sin(y * 0.5) * 0.12 + 0.12;
					break;
				case "grain":
					order = (x / cols) * 0.55 + (y / rows) * 0.25 + hash2(x, y) * 0.2;
					break;
				case "swell":
					order = Math.hypot(x - cx, y - cy) / maxR;
					break;
				case "streak":
					order = (x / cols) * 0.8 + (y / rows) * 0.2;
					break;
			}
			const from = stateOf(prev?.style ?? scene.style, x, y);
			const to = stateOf(scene.style, x, y);
			const u = Math.min(1, Math.max(0, (t - order * (1 - FLIP)) / FLIP));
			const eased = u * u * (3 - 2 * u);
			out[y * cols + x] = from + (to - from) * eased;
		}
	}
}

export const PALETTES: [string, string][] = [
	["#8aa9ff", "#1f45f5"],
	["#ffd166", "#e5484d"],
	["#b8f2c9", "#0f8a5f"],
	["#ffc2e2", "#c81d77"],
	["#c7d2fe", "#4338ca"],
	["#fde68a", "#b45309"],
	// 6-12: the stablecoins-header banner's own palettes. An earlier pass
	// here made BOTH halves of every pair dark and close in value (circle
	// ~15-23% luminance, ground ~6-8%) to keep the banner from reading as a
	// bright slab against the page's near-black surface — but a pair that
	// close in value reads as a flat grey rectangle, not a carved mark. The
	// spec is explicit that the contrast belongs *inside* the pair: "the
	// circle colour and background colour are always a matched pair so the
	// glyph keeps reading as negative space" — matched doesn't mean matched
	// in VALUE. Background stays near-black here (~5-7% luminance, darker
	// than the page's own #1A1A1A cards, so the banner still sits inside the
	// surface, not on top of it) while the circle colour is bold and
	// saturated (~55-70% luminance) — a ~45-60pt gap per pair, the "genuine
	// two-tone" the spec calls for. Each pair keeps one hue family so it
	// still reads as matched, just a characterful match rather than a
	// muted one.
	["#2FD98A", "#0A1712"], // usdt0 — vivid mint (Tether) / near-black green
	["#3E7BFA", "#070B16"], // rings — vivid blue / near-black navy
	["#FF5D5D", "#160707"], // columns — coral / near-black red
	["#A56EFF", "#0E0716"], // checker — violet / near-black violet
	["#2DE0C7", "#051312"], // boxes — cyan-teal / near-black teal
	["#FF63B0", "#160611"], // bars — hot pink / near-black magenta
	["#F5B942", "#171006"], // $ — gold / near-black amber
	["#4FC3F7", "#03131A"], // € — sky blue / near-black teal-blue
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

// Tile mode's own fill fraction, close to 1: a tile's "room to breathe"
// comes from tileAcross's own 1-row outer margin and the gap between
// instances, not from shrinking the glyph inside its own box too — the
// reference this mode reproduces has the mark filling nearly the full
// height, "only a thin margin above and below," so MARK_FILL's more
// conservative fraction (tuned for a lone glyph carved into a full grid
// it needs to not touch the edge of) would just add a second, unwanted
// layer of padding on top of that margin.
const TILE_FILL = 0.98;

/**
 * Which pixels of an already-drawn raster are "ink" (positive polarity: 1 =
 * ink) as opposed to disc/background — shared by the hole-mode carve and
 * the tile-mode rasterisers below. These marks are a coloured disc/square
 * with a lighter glyph inside (USDT0 = white T on green, USDC / EURC =
 * white glyph on blue, PYUSD similar), so "opaque pixel" is not "ink": that
 * would flag the whole disc and lose the glyph. The glyph is always the
 * ink: among alpha > 0.5 pixels, whichever are brighter than the midpoint
 * of the luminance range.
 *
 * The sanity check only ever REJECTS (null), it never inverts: coverage is
 * judged against the mark's own opaque footprint, not the raster as a
 * whole — checking against the whole raster meant the glyph could never
 * clear the floor on a banner far wider than tall, and silently carving the
 * disc instead (a "plain filled circle") is exactly the failure this
 * exists to avoid. If the glyph covers too little or too much of the
 * mark's own pixels to read as a legible shape, callers leave their
 * lattice/tile intact rather than ship an empty, nearly-full, or
 * inside-out result.
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
	if (opaque === 0 || hi <= lo) return null;

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
 * repeat the result across the grid. Same refusal contract as every other
 * carve in this file: anything that doesn't produce a legible small glyph
 * leaves the solid lattice (`out`) intact rather than ship a broken or
 * empty banner for a cycle.
 */
function rasterizeTiled(
	scene: Scene,
	cols: number,
	rows: number,
	fontFamily: string,
	out: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
	// Leave a row of margin top and bottom where there's room to spare —
	// tiny grids (well below this banner's real ~9 rows) get the full
	// height instead, on the theory that a cramped mark beats no margin at
	// all only once there's truly nothing to give up.
	const tileRows = rows > 6 ? rows - 2 : rows;
	if (tileRows < 4) return out; // not enough rows to say anything

	const tile =
		scene.kind === "image" && scene.image
			? rasterizeImageTile(scene.image, tileRows)
			: scene.kind === "text"
				? rasterizeTextTile((scene.value ?? "").trim(), tileRows, fontFamily)
				: null;
	if (!tile) return out;

	return tileAcross(tile, cols, rows) ?? out;
}

/**
 * Crop an image scene down to just its own glyph (glyphBBox) and rasterise
 * THAT into a small tileRows-tall raster, ink = 1 (this scene's mark stands
 * as circles — see Scene.tile). The source PNGs are a coloured square/disc
 * with a lot of flat colour around a much smaller mark; sizing against the
 * full image the way the hole-mode carve above does (which has a whole
 * grid of rows to spend) would spend most of a small tile's few pixels on
 * that flat margin instead of the shape. Cropping to the mark's own
 * bounding box first means every pixel of the tile is doing work.
 */
function rasterizeImageTile(
	image: CanvasImageSource,
	tileRows: number,
): { mask: Uint8Array; cols: number; rows: number } | null {
	const box = glyphBBox(image);
	if (!box) return null;

	const dh = tileRows * TILE_FILL;
	const dw = dh * (box.w / box.h);
	const tileCols = Math.max(1, Math.round(dw));

	const cv = document.createElement("canvas");
	cv.width = tileCols;
	cv.height = tileRows;
	const ctx = cv.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;
	ctx.drawImage(
		image,
		box.x,
		box.y,
		box.w,
		box.h,
		(tileCols - dw) / 2,
		(tileRows - dh) / 2,
		dw,
		dh,
	);

	const { data } = ctx.getImageData(0, 0, tileCols, tileRows);
	const ink = glyphInkMask(data, tileCols * tileRows);
	if (!ink) return null;
	return { mask: ink, cols: tileCols, rows: tileRows };
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
 * Rasterise a short text glyph (a currency symbol) into a small
 * tileRows-tall raster, ink = 1 — the text-mode sibling of
 * rasterizeImageTile. No disc to crop away here (just black background,
 * white glyph), so this measures and fits directly instead of
 * bbox-cropping first — the same two-pass measure-then-fit the full-grid
 * "text" branch above uses, just fit to a tile box instead of the grid.
 */
function rasterizeTextTile(
	text: string,
	tileRows: number,
	fontFamily: string,
): { mask: Uint8Array; cols: number; rows: number } | null {
	if (!text) return null;

	const cv = document.createElement("canvas");
	const ctx = cv.getContext("2d", { willReadFrequently: true });
	if (!ctx) return null;

	let size = tileRows;
	ctx.font = `600 ${size}px ${fontFamily}`;
	let m = ctx.measureText(text);
	const gh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent || size;
	size *= (tileRows * TILE_FILL) / gh;
	ctx.font = `600 ${size}px ${fontFamily}`;
	m = ctx.measureText(text);

	// Padded a bit wider than the measured glyph so strokes don't touch the
	// tile's own edge — the gap tileAcross puts between repeats is separate
	// from this, an inset within one tile's own box.
	const tileCols = Math.max(1, Math.round(m.width * 1.3));
	cv.width = tileCols;
	cv.height = tileRows;
	// Resizing the canvas resets context state, so the font has to be set
	// again after cv.width/height are assigned above.
	ctx.font = `600 ${size}px ${fontFamily}`;
	ctx.fillStyle = "#000";
	ctx.fillRect(0, 0, tileCols, tileRows);
	ctx.fillStyle = "#fff";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(text, tileCols / 2, tileRows / 2 + tileRows * 0.02);

	const { data } = ctx.getImageData(0, 0, tileCols, tileRows);
	const mask = new Uint8Array(tileCols * tileRows);
	let ink = 0;
	for (let i = 0; i < mask.length; i++) {
		if (data[i * 4] > 110) {
			mask[i] = 1;
			ink++;
		}
	}
	return ink > 0 ? { mask, cols: tileCols, rows: tileRows } : null;
}

/**
 * Repeat a small glyph tile across the full cols×rows grid as a single
 * horizontal row of copies, evenly spaced and vertically centred — the
 * composition this scene mode reproduces: several copies of the same mark
 * marching across the width on an otherwise empty field, rather than one
 * hole carved into a solid one (see Scene.tile). How many copies fit is
 * derived from the real grid width, not fixed — a narrower host just shows
 * fewer.
 */
export function tileAcross(
	tile: { mask: Uint8Array; cols: number; rows: number },
	cols: number,
	rows: number,
): Uint8Array<ArrayBuffer> | null {
	const { mask, cols: tCols, rows: tRows } = tile;
	// floor (not round): for an odd leftover this puts the extra row of
	// margin on the bottom rather than rounding it onto the top, and it
	// keeps a by-1-too-tall tile refused below rather than rounding -0.5
	// up to a startY of 0 and silently clipping the tile's own bottom row.
	const startY = Math.floor((rows - tRows) / 2);
	if (startY < 0) return null;

	const gap = Math.max(2, Math.round(tCols * 0.6));
	const period = tCols + gap;
	const count = Math.max(1, Math.floor((cols + gap) / period));
	const totalW = count * tCols + (count - 1) * gap;
	const startX = Math.round((cols - totalW) / 2);

	const out = new Uint8Array(new ArrayBuffer(cols * rows));
	for (let n = 0; n < count; n++) {
		const ox = startX + n * period;
		for (let ty = 0; ty < tRows; ty++) {
			const y = startY + ty;
			if (y < 0 || y >= rows) continue;
			const base = ty * tCols;
			for (let tx = 0; tx < tCols; tx++) {
				if (!mask[base + tx]) continue;
				const x = ox + tx;
				if (x >= 0 && x < cols) out[y * cols + x] = 1;
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
