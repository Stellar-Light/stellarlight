import {
	cellDelay,
	cellMotion,
	PALETTES,
	rasterize,
	SCENES,
	type Scene,
	styleField,
} from "./scenes";

const COLS = 42;
const HOLD_MS = 600;
const MORPH_MS = 520;

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

function hash(n: number): number {
	const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
	return s - Math.floor(s);
}

export interface DotCutParams {
	cols: number;
	squareness: number;
	hold: number;
	morph: number;
	brush: number;
	fill: number;
}

export const DEFAULTS: DotCutParams = {
	cols: COLS,
	squareness: 0,
	hold: HOLD_MS,
	morph: MORPH_MS,
	brush: 1.6,
	fill: 1.0,
};

export class DotCut {
	private host: HTMLElement;
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D | null = null;

	readonly params: DotCutParams = { ...DEFAULTS };

	private cols = COLS;
	private rows = 12;
	private pitch = 10;
	private ox = 0;
	private oy = 0;

	private target = new Uint8Array(0);
	private live = new Float32Array(0);
	private from = new Float32Array(0);
	private delay = new Float32Array(0);
	private rnd = new Float32Array(0);
	private prog = new Float32Array(0);
	private dir = new Float32Array(0);
	private bore = new Float32Array(0);
	private styleT = 0;

	private sceneIdx = 0;
	private phase: "hold" | "morph" = "hold";
	private phaseT = 0;

	private paletteMix = 1;
	private prevPalette = 0;
	private prevScene = 0;

	// True when the on-screen pixels already match the settled state — hold
	// phase, palette done blending, nothing pending. Cleared by anything that
	// invalidates that (pointer move, resize, a fresh scene target) and
	// consumed by the next paint. Lets the hold phase (the spec calls it
	// "completely still") skip rebuilding the arc/bore path and repainting
	// identical pixels every frame — the single biggest cost at a wide grid.
	private dirty = true;

	private pointer: { x: number; y: number } | null = null;
	private raf = 0;
	private last = 0;
	private running = false;
	private dpr = 1;
	private ro: ResizeObserver | null = null;
	private disposed = false;
	private fontFamily = "sans-serif";
	private scenes: Scene[];

	// The canvas ground colour, read once from the page's own `--background`
	// custom property (the same token `bg-background` resolves to
	// everywhere else in the app — see globals.css's `@layer base` and
	// tailwind.config's `background: "var(--background)"`) rather than
	// hardcoded here, so the banner can never drift from the page colour it
	// sits on. A canvas fillStyle can't reference `var(--background)`
	// directly (custom properties only resolve in the CSS cascade, not in
	// Canvas 2D), so this resolves it once via getComputedStyle instead —
	// the fallback only fires if that property is somehow missing (e.g. a
	// future rename here without updating this file), not a second copy of
	// the real value.
	private groundColor = "#171717";

	constructor(
		host: HTMLElement,
		scenes: Scene[] = SCENES,
		fontFamily?: string,
	) {
		this.host = host;
		this.scenes = scenes.length > 0 ? scenes : SCENES;
		if (fontFamily) this.fontFamily = fontFamily;
		const bg = getComputedStyle(host).getPropertyValue("--background").trim();
		if (bg) this.groundColor = bg;
		this.canvas = document.createElement("canvas");
		this.canvas.style.cssText = "display:block;width:100%;height:100%";
		host.appendChild(this.canvas);
		this.ctx = this.canvas.getContext("2d");
		if (!this.ctx) return;

		this.resize();
		this.ro = new ResizeObserver(() => this.resize());
		this.ro.observe(host);
	}

	get ok() {
		return !!this.ctx;
	}

	private applyScene(scene: Scene, instant: boolean) {
		const next = rasterize(scene, this.cols, this.rows, this.fontFamily);
		this.from.set(this.live);
		this.target = next;
		for (let y = 0; y < this.rows; y++) {
			for (let x = 0; x < this.cols; x++) {
				const i = y * this.cols + x;
				this.delay[i] = cellDelay(
					scene.transition,
					x,
					y,
					this.cols,
					this.rows,
					this.rnd[i],
				);
			}
		}
		if (instant) {
			for (let i = 0; i < next.length; i++) this.live[i] = next[i];
			this.from.set(this.live);
		}
	}

	private resize() {
		const ctx = this.ctx;
		if (!ctx || this.disposed) return;
		const w = this.host.clientWidth;
		const h = this.host.clientHeight;
		if (!w || !h) return;
		this.dirty = true;

		this.dpr = Math.min(window.devicePixelRatio || 1, 2);
		this.canvas.width = Math.round(w * this.dpr);
		this.canvas.height = Math.round(h * this.dpr);

		const margin = 0.75;
		this.cols = Math.max(6, Math.round(this.params.cols));
		this.pitch = w / (this.cols + 2 * margin);
		this.rows = Math.max(
			3,
			Math.floor((h - 2 * margin * this.pitch) / this.pitch),
		);

		this.ox = (w - this.cols * this.pitch) / 2;
		this.oy = (h - this.rows * this.pitch) / 2;

		const n = this.cols * this.rows;
		this.target = new Uint8Array(n);
		this.live = new Float32Array(n);
		this.from = new Float32Array(n);
		this.delay = new Float32Array(n);
		this.rnd = new Float32Array(n);
		this.prog = new Float32Array(n);
		this.dir = new Float32Array(n);
		this.bore = new Float32Array(n);
		for (let i = 0; i < n; i++) this.rnd[i] = hash(i * 1.37 + 0.5);

		this.applyScene(this.scenes[this.sceneIdx], true);
		if (!this.running) this.draw(0);
	}

	setParams(p: Partial<DotCutParams>) {
		const needsGrid = p.cols !== undefined && p.cols !== this.params.cols;
		Object.assign(this.params, p);
		if (needsGrid) this.resize();
	}

	setPointer(p: { x: number; y: number } | null) {
		this.pointer = p;
		this.dirty = true;
	}

	advance() {
		this.prevScene = this.sceneIdx;
		this.sceneIdx = (this.sceneIdx + 1) % this.scenes.length;
		this.prevPalette =
			this.scenes[
				(this.sceneIdx - 1 + this.scenes.length) % this.scenes.length
			].palette;
		this.paletteMix = 0;
		this.phase = "morph";
		this.phaseT = 0;
		this.styleT = 0;
		this.applyScene(this.scenes[this.sceneIdx], false);
	}

	// Cheap, O(1) clock bookkeeping — timing and phase transitions only. Runs
	// every frame regardless of whether anything is going to be repainted, so
	// hold still times out and morphs still start on schedule while the
	// field is otherwise idling.
	private advanceClock(dt: number) {
		this.phaseT += dt * 1000;

		if (this.phase === "hold" && this.phaseT >= this.params.hold) {
			this.advance();
		} else if (this.phase === "morph" && this.phaseT >= this.params.morph) {
			this.phase = "hold";
			this.phaseT = 0;
		}

		this.paletteMix = Math.min(1, this.paletteMix + dt * 2.2);
		this.styleT =
			this.phase === "morph"
				? Math.min(1, this.styleT + dt / (this.params.morph / 1000))
				: 1;
	}

	// O(cells) — per-cell interpolation plus styleField's trig. Both are
	// provably constant once phase is "hold" and styleT/paletteMix have
	// settled (p and t both pin at 1, so every cell's eased/eased-style value
	// stops changing) — that's exactly the case draw() skips this in.
	private updateCells() {
		const p =
			this.phase === "morph" ? Math.min(1, this.phaseT / this.params.morph) : 1;
		const n = this.cols * this.rows;
		for (let i = 0; i < n; i++) {
			const d = this.delay[i];
			const local = Math.min(1, Math.max(0, (p - d * 0.72) / 0.28));
			const e = easeOut(local);
			this.live[i] = this.from[i] + (this.target[i] - this.from[i]) * e;

			const changing =
				this.from[i] !== this.target[i] && this.phase === "morph";
			this.prog[i] = changing ? local : 0;
			this.dir[i] = this.target[i] > this.from[i] ? 1 : -1;
		}

		styleField(
			this.scenes[this.sceneIdx],
			this.cols,
			this.rows,
			this.styleT,
			this.bore,
			this.scenes[this.prevScene],
		);
	}

	private draw(dt: number) {
		const ctx = this.ctx;
		if (!ctx) return;

		this.advanceClock(dt);

		// The spec calls the hold phase "completely still" — once the morph is
		// done, the palette has finished blending, and nothing (pointer,
		// resize, a fresh target) marked the frame dirty, the canvas already
		// shows the settled state pixel for pixel. Skip rebuilding the
		// arc/bore path and repainting it; let the loop idle instead.
		const needsPaint =
			this.phase === "morph" || this.paletteMix < 1 || this.dirty;
		if (!needsPaint) return;
		this.dirty = false;
		this.updateCells();

		const W = this.canvas.width;
		const H = this.canvas.height;
		const s = this.dpr;
		const scene = this.scenes[this.sceneIdx];

		const cA = PALETTES[this.prevPalette % PALETTES.length];
		const cB = PALETTES[scene.palette % PALETTES.length];
		const m = easeInOut(this.paletteMix);
		const circle = mixHex(cA, cB, m);

		// The ground never changes between scenes — it's always the page
		// background (see groundColor's own comment) — so the colour rhythm
		// across a scene change comes entirely from the circles.
		ctx.fillStyle = this.groundColor;
		ctx.fillRect(0, 0, W, H);

		const pitch = this.pitch * s;
		const r = pitch / 2;
		const sq = Math.max(0, Math.min(1, this.params.squareness));

		ctx.fillStyle = circle;
		const solidPath = new Path2D();
		const stroke = Math.max(1.1 * s, r * 0.3);
		const brush = this.params.brush;

		for (let y = 0; y < this.rows; y++) {
			for (let x = 0; x < this.cols; x++) {
				const i = y * this.cols + x;
				let v = this.live[i];
				if (v <= 0.004) continue;

				if (this.pointer && brush > 0) {
					const d = Math.hypot(
						x + 0.5 - this.pointer.x,
						y + 0.5 - this.pointer.y,
					);
					if (d < brush) v *= Math.min(1, (d / brush) ** 2);
				}
				if (v <= 0.004) continue;

				const mo = cellMotion(
					scene.transition,
					this.prog[i],
					this.dir[i],
					this.rnd[i],
				);

				const cx = this.ox * s + (x + 0.5) * pitch + mo.dx * pitch;
				const cy = this.oy * s + (y + 0.5) * pitch + mo.dy * pitch;

				const pop = 1;
				const rr = r * v * pop * mo.scale * this.params.fill;
				if (rr <= 0.3) continue;

				const canRing = rr > 3.2 * s;
				const bore = canRing ? (rr - stroke) * this.bore[i] : 0;

				solidPath.moveTo(cx + rr, cy);
				if (sq < 0.02) {
					solidPath.arc(cx, cy, rr, 0, Math.PI * 2);
				} else {
					roundedSquare(solidPath, cx, cy, rr, sq);
				}
				if (bore > 0.4) {
					solidPath.moveTo(cx + bore, cy);
					solidPath.arc(cx, cy, bore, 0, Math.PI * 2, true);
				}
			}
		}

		ctx.fill(solidPath, "evenodd");
	}

	renderStill() {
		this.phase = "hold";
		this.phaseT = 0;
		this.paletteMix = 1;
		this.dirty = true;
		this.applyScene(this.scenes[this.sceneIdx], true);
		this.draw(0);
	}

	start() {
		if (this.running || !this.ok || this.disposed) return;
		this.running = true;
		this.last = performance.now();
		const tick = (now: number) => {
			if (!this.running) return;
			const dt = Math.min((now - this.last) / 1000, 1 / 30);
			this.last = now;
			this.draw(dt);
			this.raf = requestAnimationFrame(tick);
		};
		this.raf = requestAnimationFrame(tick);
	}

	stop() {
		this.running = false;
		if (this.raf) cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	destroy() {
		this.disposed = true;
		this.stop();
		this.ro?.disconnect();
		this.ro = null;
		this.ctx = null;
		this.canvas.remove();
	}

	toCell(px: number, py: number) {
		return { x: (px - this.ox) / this.pitch, y: (py - this.oy) / this.pitch };
	}
}

function roundedSquare(
	ctx: Pick<CanvasRenderingContext2D, "moveTo" | "lineTo" | "closePath">,
	cx: number,
	cy: number,
	r: number,
	sq: number,
) {
	const n = 2 + sq * 8;
	const steps = 22;
	ctx.moveTo(cx + r, cy);
	for (let i = 1; i <= steps; i++) {
		const t = (i / steps) * Math.PI * 2;
		const c = Math.cos(t);
		const s = Math.sin(t);
		const x = Math.sign(c) * Math.abs(c) ** (2 / n) * r;
		const y = Math.sign(s) * Math.abs(s) ** (2 / n) * r;
		ctx.lineTo(cx + x, cy + y);
	}
	ctx.closePath();
}

function mixHex(a: string, b: string, t: number): string {
	const pa = Number.parseInt(a.slice(1), 16);
	const pb = Number.parseInt(b.slice(1), 16);
	const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
	const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
	const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
	return `rgb(${r},${g},${bl})`;
}
