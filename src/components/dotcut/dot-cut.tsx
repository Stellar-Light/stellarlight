"use client";

/**
 * Canvas "dot-cut" banner for the /stablecoins header — a dense mesh of
 * touching circles that carves negative space out of the field. Five
 * full-bleed patterns (rings/columns/checker/boxes/bars, the whole surface
 * reorganising) alternate with three tiled marks (the USDT0 logo, $, €) —
 * each mark repeats several times across the width as small standing
 * circles (Scene.tile) rather than one hole carved into a solid field, so
 * it reads without the banner needing extra rows. Framework-free Canvas 2D
 * + rAF, driven entirely by `DotCut` (./engine.ts); this component only
 * loads the one logo, builds the scene list, and wires lifecycle.
 */

import { useEffect, useRef } from "react";
import { DotCut } from "./engine";
import type { Scene } from "./scenes";

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
// Fewer, bigger cells means fewer rows, which means every scene had to be
// re-proven at the new grid — see the scene list below for which marks
// survive at ~42 cols and in what form (tiled small vs. one big carve),
// verified via ASCII dumps of the real rasterize() output at this exact
// grid — see this PR's description.
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

		loadImage("/stablecoins/logos/usdt0.png")
			.then((usdt0) => {
				if (cancelled) return;

				// A single big glyph loses to this banner's own proportions: at
				// the ~42-circle density the owner asked for, the strip is nearly
				// four times wider than tall, which left nine rows — not enough
				// for one contained mark to read (T came out a six-cell blob, "$"
				// no better; usdc/eurc/pyusd fared worse still). Rather than grow
				// the banner to buy one glyph more rows, each mark here is tiled
				// (Scene.tile) as several small copies marching across the WIDTH
				// instead: standing (positive) circles on an empty field, not a
				// hole carved into a solid one. A small tile only needs ~7 rows to
				// read, so this ships at the SAME 320px/9-row banner the five
				// patterns already used — verified against the real rasterize()
				// output at this exact grid, see this PR's description.
				//
				// usdt0's blocky pixel-art T survives the crop to ~5x7 cleanly.
				// $ and € are bold enough closed forms to read tiled just as
				// small. usdc and eurc stayed out: their thin ring-plus-glyph
				// strokes read as scattered noise at every tile size tested, up
				// to and including sizes well past this banner's height budget —
				// the same failure mode a single big carve of them hit before.
				// pyusd's double-bar accent is likewise noise below a tile size
				// this banner has no room for.
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
						kind: "boxes",
						label: "boxes",
						transition: "collapse",
						palette: 10,
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
			className="mb-8 h-56 w-full overflow-hidden rounded-xl bg-[#1A1A1A] md:h-80"
		/>
	);
}
