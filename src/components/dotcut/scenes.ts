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
	// 6-9: token brand colour vs. a near-black ground (site bg/card tone),
	// for the stablecoins-header scenes — kept calm, not saturated.
	["#5FE3B3", "#101613"], // USDT0 — Tether mint
	["#6FA8F5", "#101318"], // USDC — Circle blue
	["#8FB0F2", "#111319"], // EURC — Circle blue (euro variant)
	["#9FB4F0", "#12131c"], // PYUSD — PayPal blue
	// 10-11: neutral pairs for the full-bleed pattern scenes between logos.
	["#9AA0A6", "#141414"],
	["#B7BEC7", "#161616"],
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

	let size = rows * 0.8;
	ctx.font = `600 ${size}px ${fontFamily}`;
	const maxW = cols * 0.36;
	const m = ctx.measureText(text);
	if (m.width > maxW) {
		size *= maxW / m.width;
		ctx.font = `600 ${size}px ${fontFamily}`;
	}

	const maxH = rows * 0.58;
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

/**
 * Carve an image-backed scene into a cols×rows mask. These marks are a
 * coloured disc with a white glyph inside (USDT0 = white T on green, USDC /
 * EURC = white glyph on blue, PYUSD similar) — so "opaque pixel" is not
 * "ink": that would carve a plain filled circle and lose the glyph. The
 * glyph is always the ink: among alpha > 0.5 pixels, whichever are brighter
 * than the midpoint of the luminance range. The disc itself is never carved
 * — the mark has to read as a hole punched in the surface, not as the
 * surface punched into a big hole with the mark left standing inside it.
 *
 * The sanity check only ever REJECTS, it never inverts: coverage is judged
 * against the mark's own opaque footprint (not the whole grid — this banner
 * is far wider than tall, so the mark is already a small fraction of the
 * grid before its glyph is a fraction of that again; checking against the
 * whole grid meant the glyph could never clear the floor, and the old code
 * silently flipped to carving the disc instead — exactly the "plain filled
 * circle" failure this function exists to avoid). If the glyph covers too
 * little or too much of the mark's own pixels to read as a legible shape,
 * leave the lattice intact rather than ship an empty, nearly-full, or
 * inside-out carve.
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

	// ~58% of grid height, centred, aspect preserved — same footprint rule
	// as the text glyph.
	const dh = rows * 0.58;
	const dw = iw * (dh / ih);
	ctx.clearRect(0, 0, cols, rows);
	ctx.drawImage(image, (cols - dw) / 2, (rows - dh) / 2, dw, dh);

	const { data } = ctx.getImageData(0, 0, cols, rows);
	const n = cols * rows;
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
	if (opaque === 0 || hi <= lo) return out; // nothing opaque — leave the lattice intact

	const mid = (lo + hi) / 2;
	const mask = new Uint8Array(n).fill(1);
	let ink = 0;
	for (let i = 0; i < n; i++) {
		if (alpha[i] <= 0.5) continue;
		if (lum[i] > mid) {
			mask[i] = 0;
			ink++;
		}
	}

	const coverage = ink / opaque;
	if (coverage >= 0.03 && coverage <= 0.55) return mask;

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
