"use client";

/**
 * Canvas "dot-cut" banner for the /stablecoins header — a dense mesh of
 * touching circles that carves negative space out of the field. Five
 * full-bleed patterns (rings/columns/checker/boxes/bars, the whole surface
 * reorganising) alternate with five tiled marks (the USDT0/USDC/PYUSD
 * logos, $, €) — each mark repeats several times across the width as small
 * standing circles (Scene.tile) rather than one hole carved into a solid
 * field. Framework-free Canvas 2D + rAF, driven entirely by `DotCut`
 * (./engine.ts); this component only loads the three logos, builds the
 * scene list, and wires lifecycle.
 */

import { useEffect, useRef } from "react";
import { DotCut } from "./engine";
import type { Scene } from "./scenes";

const FONT_FAMILY = "ui-sans-serif, system-ui, sans-serif";

// Must match engine.ts's own inset margin (pitch derivation) — see resize().
const GRID_MARGIN = 0.75;
// Grid density is driven by a target CELL SIZE, not a target row count.
// Deriving cols from a fixed row count (an earlier approach) means cell
// count explodes with width — at a typical 1400px-wide banner that was 480
// cols x 70 rows = 33,600 cells at a 2.9px pitch: three pixels per circle,
// the concave diamonds between four touching circles (the whole texture
// this piece is built on) sub-pixel and invisible, and ~2ms/frame of
// arc/trig work repainting a mesh nobody can actually resolve. 8px fixed
// that, but overcorrected the other way; 28.5px (this banner's real
// container width, ~1232px capped by `max-w-7xl`, divided into ~42
// columns) read cleanly but at only 9 rows tall, a tiled mark had 7 rows
// to work with — plenty for the mark itself to read, but each instance
// stayed small relative to a frame nearly 4x wider than tall ("still hard
// to tell" on desktop, even though the same tiles read fine on mobile,
// where a narrower host and the same cell size mean far more rows — see
// the floor comment below).
//
// CELL_PX=19 buys ROWS, which is what a tile's detail is actually made of:
// 15 rows instead of 9, so each tile renders at ~13 rows of glyph instead
// of 7 — roughly double. Circles stay comfortably above the mush floor
// (18-22px was the tested range; below it the concave-diamond texture
// degrades the way it did at 8px, above it the marks had less detail to
// work with — see this PR's description for the masks this was picked
// from). MAX_COLS is a defensive cap on total cell count for a
// hypothetical much wider host, not a load-bearing constraint at this
// banner's real ~1232px width (natural cols there is ~63, comfortably
// under it).
const CELL_PX = 19;
const MAX_COLS = 80;

function colsForCellSize(w: number): number {
	const cols = w / CELL_PX - 2 * GRID_MARGIN;
	// Floor guards a host measured at 0 width (e.g. read before layout has
	// run) from handing the engine a negative cols — which its own internal
	// floor would silently accept as 6, turning the mesh into a handful of
	// giant circles instead of ever getting a real resize to recompute from.
	// It also happens to be the operative value on mobile: at that host's
	// real ~327px width the naturally-computed cols is well under 42 at any
	// CELL_PX in the range this file has used, so mobile has been rendering
	// at cols=42 (not a value CELL_PX controls) all along — pitch there
	// works out to ~7.5px, well under CELL_PX, and rows to ~28, which is why
	// mobile's tiles already had plenty of rows to read before this change
	// and are completely unaffected by it (verified: colsForCellSize(327)
	// returns 42 both before and after this PR's CELL_PX change).
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

		Promise.all([
			loadImage("/stablecoins/logos/usdt0.png"),
			loadImage("/stablecoins/logos/usdc.png"),
			loadImage("/stablecoins/logos/pyusd.png"),
		])
			.then(([usdt0, usdc, pyusd]) => {
				if (cancelled) return;

				// Each mark is tiled (Scene.tile) as several small copies marching
				// across the width — standing (positive) circles on an empty
				// field, not a hole carved into a solid one — rather than one big
				// glyph fighting this banner's own proportions (nearly 4x wider
				// than tall). At 9 rows (this banner's height before this PR) a
				// tile got 7 rows: usdt0/$/€ read fine there, but the owner's
				// live read was "still hard to tell" on desktop specifically
				// (mobile, which lands on far more rows at the same cell size —
				// see CELL_PX's comment above — was already fine). 7 rows of
				// detail in a frame 4x wider than tall means each instance reads
				// as small relative to the whole, and usdc/eurc/pyusd's thinner
				// strokes didn't have enough resolution to read at all.
				//
				// CELL_PX now buys rows instead: 15 at this banner's real width,
				// ~13 per tile. Re-tested every mark at that size against the
				// real rasterize() output (see this PR's description for the
				// masks): usdc's ring-plus-glyph now resolves to a legible
				// asymmetric squiggle and pyusd's loop-and-descender reads as a
				// "P" — both back in the cycle. eurc stayed a symmetric blob with
				// no feature that reads as "€" specifically, so it stays out;
				// the € text scene already covers that currency without it.
				const scenes: Scene[] = [
					{
						kind: "image",
						image: usdt0,
						label: "usdt0",
						transition: "wipe",
						palette: 6,
						style: "grain",
						tile: true,
					},
					{
						kind: "rings",
						label: "rings",
						transition: "wipe",
						palette: 7,
						style: "swell",
					},
					{
						kind: "text",
						value: "$",
						label: "usd",
						transition: "ripple",
						palette: 12,
						style: "swell",
						tile: true,
					},
					{
						kind: "columns",
						label: "columns",
						transition: "columns",
						palette: 8,
						style: "streak",
					},
					{
						kind: "text",
						value: "€",
						label: "eur",
						transition: "scatter",
						palette: 13,
						style: "grain",
						tile: true,
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
						image: usdc,
						label: "usdc",
						transition: "ripple",
						palette: 14,
						style: "grain",
						tile: true,
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
						transition: "wipe",
						palette: 15,
						style: "swell",
						tile: true,
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
			className="mb-8 h-56 w-full overflow-hidden rounded-xl bg-[#1A1A1A] md:h-80"
		/>
	);
}
