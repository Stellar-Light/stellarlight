"use client";

/**
 * Canvas "dot-cut" banner for the /stablecoins header — a dense mesh of
 * touching circles that carves negative space out of the field. Five
 * full-bleed patterns (rings/columns/checker/boxes/bars, the whole surface
 * reorganising) with the four token logos (USDT0/USDC/EURC/PYUSD) spread
 * out between them as the contained marks, so each one lands as an event
 * rather than blending into a steady scroll of small figures. Framework-free
 * Canvas 2D + rAF, driven entirely by `DotCut` (./engine.ts); this component
 * only loads the logos, builds the scene list, and wires lifecycle.
 */

import { useEffect, useRef } from "react";
import { DotCut } from "./engine";
import type { Scene } from "./scenes";

const LOGO_SLUGS = ["usdt0", "usdc", "eurc", "pyusd"] as const;
const FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";

// Must match engine.ts's own inset margin (pitch derivation) — see resize().
const GRID_MARGIN = 0.75;
// Grid density is driven by a target CELL SIZE, not a target row count.
// Deriving cols from a fixed row count (the previous approach) means cell
// count explodes with width — at a typical 1400px-wide banner that was 480
// cols x 70 rows = 33,600 cells at a 2.9px pitch: three pixels per circle,
// the concave diamonds between four touching circles (the whole texture
// this piece is built on) sub-pixel and invisible, and ~2ms/frame of
// arc/trig work repainting a mesh nobody can actually resolve.
//
// 8px fixed that, but overcorrected the other way: the owner's ask was the
// original spec's density back — "~42 circles across, on a square lattice at
// EXACTLY the pitch, so neighbours meet" — which at this banner's real
// container width (~1232px, capped by `max-w-7xl` on the page) is ~28.5px,
// not 8px. CELL_PX now targets that directly. MAX_COLS is a defensive cap,
// not the load-bearing constraint it was at 8px: the container can't exceed
// ~1232px (max-w-7xl), so cols never approaches it in practice — it just
// stops this component from exploding back to a fine mesh if it's ever
// dropped into a wider, unconstrained host.
//
// Fewer, bigger cells means fewer rows for a given height — and a mark
// needs rows, not cols, to read (see the host `className` at the bottom of
// this file for the row math). CELL_PX itself stays exactly what it was:
// 42 cols is the density the owner called perfect, and this file doesn't
// trade it away for a shorter banner — see this PR's description for the
// ASCII proof, scene by scene.
const CELL_PX = 28.5;
const MAX_COLS = 50;

function colsForCellSize(w: number): number {
	const cols = w / CELL_PX - 2 * GRID_MARGIN;
	// Floor guards a host measured at 0 width (e.g. read before layout has
	// run) from handing the engine a negative cols — which its own internal
	// floor would silently accept as 6, turning the mesh into a handful of
	// giant circles instead of ever getting a real resize to recompute from.
	return Math.max(42, Math.min(MAX_COLS, Math.round(cols)));
}

/**
 * Resolve on `load`, not `decode()`.
 *
 * `HTMLImageElement.decode()` ties its promise to the rendering pipeline, so
 * in a BACKGROUND TAB it can stall indefinitely — the promise never settles,
 * the engine is never constructed, and the strip stays permanently blank even
 * after the reader focuses the tab, because nothing retries. Opening a page in
 * a background tab is completely ordinary (a middle-click, a restored
 * session), so this was a real blank-banner path, not a test-environment
 * quirk: measured on production, the host element existed with zero children
 * while the same image loaded fine via `onload` in the same hidden document.
 *
 * `drawImage` accepts a loaded image without an explicit decode, so waiting on
 * `load` costs nothing and works whether or not the document is visible.
 */
function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () =>
			reject(new Error(`dot-cut: image failed to load — ${src}`));
		img.src = src;
	});
}

export function DotCutBanner() {
	const hostRef = useRef<HTMLDivElement>(null);
	const engineRef = useRef<DotCut | null>(null);

	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;

		let cancelled = false;
		let io: IntersectionObserver | null = null;
		let ro: ResizeObserver | null = null;
		let visible = true;
		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;

		const onVisibilityChange = () => {
			const engine = engineRef.current;
			if (!engine) return;
			if (document.hidden) engine.stop();
			else if (visible) engine.start();
		};

		Promise.all(
			LOGO_SLUGS.map((slug) => loadImage(`/stablecoins/logos/${slug}.png`)),
		)
			.then(([usdt0, usdc, eurc, pyusd]) => {
				if (cancelled) return;

				// Rows, not cell size, is what a contained mark needs — and it
				// needs more than "a dozen" turned out to require in practice.
				// usdc/eurc/pyusd lean on thin ring-bracket/outline strokes that
				// stay scattered noise clear through 22 rows and are still
				// fragmented at 28; they don't resolve into their real shape
				// (a ring with the currency sign inside, for usdc/eurc) until
				// somewhere in the low 30s. usdt0's mark is its own separate
				// case: it's built from a checkered block pattern, not solid
				// strokes, so it reads as a clean "T" at very low rows *and* at
				// 32 (the checkering itself resolves cleanly there too) — the
				// only range where it doesn't work is the 12-22ish middle,
				// which this banner is skipping over entirely anyway. 32 rows
				// is the smallest count where all four hold up (verified —
				// every mask in this PR's description, cropped from the real
				// rasterize() output, not eyeballed off a render).
				//
				// cols stays 42 — CELL_PX above is untouched — so the only
				// lever is height: 32 rows at this pitch needs a 949px-tall
				// host (see the `h-[949px]` on the div below; the resize() math
				// this depends on lives in engine.ts).
				//
				// Five patterns, four marks, spread apart rather than
				// clustered — a contained figure is only an "event" if it's
				// surrounded by full-bleed reorganisation, not by more figures.
				const scenes: Scene[] = [
					{
						kind: "image",
						image: usdt0,
						label: "usdt0",
						transition: "wipe",
						palette: 6,
						style: "swell",
					},
					{
						kind: "rings",
						label: "rings",
						transition: "wipe",
						palette: 7,
						style: "swell",
					},
					{
						kind: "columns",
						label: "columns",
						transition: "columns",
						palette: 8,
						style: "streak",
					},
					{
						kind: "image",
						image: usdc,
						label: "usdc",
						transition: "scatter",
						palette: 13,
						style: "streak",
					},
					{
						kind: "checker",
						label: "checker",
						transition: "scatter",
						palette: 9,
						style: "swell",
					},
					{
						kind: "image",
						image: eurc,
						label: "eurc",
						transition: "collapse",
						palette: 14,
						style: "drift",
					},
					{
						kind: "boxes",
						label: "boxes",
						transition: "collapse",
						palette: 10,
						style: "grain",
					},
					{
						kind: "image",
						image: pyusd,
						label: "pyusd",
						transition: "ripple",
						palette: 15,
						style: "grain",
					},
					{
						kind: "bars",
						label: "bars",
						transition: "wipe",
						palette: 11,
						style: "drift",
					},
				];

				const engine = new DotCut(host, scenes, FONT_FAMILY);
				engineRef.current = engine;
				if (!engine.ok) return;

				// A one-shot `setParams` at construction time raced the host's
				// layout: `clientWidth` can still read 0 here (measured on a fresh
				// load, not just under test), which locked cols at this function's
				// own floor and never got a second chance to correct itself once
				// the container actually resized — the engine's own internal
				// resize() re-derives `cols` from `params.cols` on every resize, but
				// never recomputes what that policy value should BE. Recomputing it
				// on every observed resize (including the first, which
				// ResizeObserver always fires once with the current size) fixes
				// both: an initial 0-width read self-corrects on the next callback,
				// and a real width change (e.g. the user resizing the window)
				// keeps the cell size right instead of freezing whatever cols was
				// picked on mount.
				ro = new ResizeObserver(() => {
					engine.setParams({ cols: colsForCellSize(host.clientWidth) });
				});
				ro.observe(host);

				if (reduceMotion) {
					engine.renderStill();
					return;
				}

				io = new IntersectionObserver(
					([entry]) => {
						visible = entry.isIntersecting;
						if (visible && !document.hidden) engine.start();
						else engine.stop();
					},
					{ threshold: 0.01 },
				);
				io.observe(host);
				document.addEventListener("visibilitychange", onVisibilityChange);
			})
			.catch(() => {
				// A logo failed to load/decode — leave the strip as the plain
				// panel underneath rather than take the page down for it.
			});

		return () => {
			cancelled = true;
			io?.disconnect();
			ro?.disconnect();
			document.removeEventListener("visibilitychange", onVisibilityChange);
			engineRef.current?.destroy();
			engineRef.current = null;
		};
	}, []);

	// Decorative only: aria-hidden keeps it out of the a11y tree and it takes
	// no tabIndex/role, so it is unreachable by keyboard or screen reader.
	// Pointer events stay on (not pointer-events:none) so the brush works.
	const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
		const engine = engineRef.current;
		if (!engine) return;
		const rect = e.currentTarget.getBoundingClientRect();
		engine.setPointer(
			engine.toCell(e.clientX - rect.left, e.clientY - rect.top),
		);
	};

	const onPointerLeave = () => {
		engineRef.current?.setPointer(null);
	};

	return (
		<div
			ref={hostRef}
			aria-hidden="true"
			onPointerMove={onPointerMove}
			onPointerLeave={onPointerLeave}
			className="mb-8 h-56 w-full overflow-hidden rounded-xl bg-[#1A1A1A] md:h-[949px]"
		/>
	);
}
