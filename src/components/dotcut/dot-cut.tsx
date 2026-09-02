"use client";

/**
 * Canvas "dot-cut" banner for the /stablecoins header — a dense mesh of
 * touching circles that carves each token's mark (or a currency symbol) as
 * negative space, cycling between them so a mark lands as an event rather
 * than blending into a steady scroll. Framework-free Canvas 2D + rAF, driven
 * entirely by `DotCut` (./engine.ts); this component only loads the logos,
 * builds the scene list, and wires lifecycle.
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
// arc/trig work repainting a mesh nobody can actually resolve. 8px is picked
// for how it looks — big enough that those diamonds read as circles, not a
// fine halftone — while still leaving enough rows at this banner's height
// for a mark to survive downsampling (verified — see this PR). MAX_COLS
// caps a very wide viewport at roughly the 1400px reference case, so an
// ultrawide monitor can't blow the cell count back up just by being wide.
const CELL_PX = 8;
const MAX_COLS = 180;

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

				// Four token marks interleaved with four currency symbols — no
				// filler pattern scenes (rings/checker carved nothing, so they read
				// as noise between the marks). Symbols are picked for surviving a
				// coarse grid: bold, closed, high-contrast glyphs only (the dollar,
				// euro, pound and yen signs) — most lowercase, arrows and
				// punctuation dissolve at this cell count. Each scene's `style`
				// axis (linear/radial/random) deliberately differs from its
				// `transition` axis — see engine.ts's cellMotion / styleField for
				// what each transition and style actually is.
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
						kind: "text",
						value: "$",
						label: "usd",
						transition: "ripple",
						palette: 10,
						style: "grain",
					},
					{
						kind: "image",
						image: usdc,
						label: "usdc",
						transition: "scatter",
						palette: 7,
						style: "streak",
					},
					{
						kind: "text",
						value: "€",
						label: "eur",
						transition: "columns",
						palette: 11,
						style: "swell",
					},
					{
						kind: "image",
						image: eurc,
						label: "eurc",
						transition: "collapse",
						palette: 8,
						style: "drift",
					},
					{
						kind: "text",
						value: "£",
						label: "gbp",
						transition: "wipe",
						palette: 10,
						style: "grain",
					},
					{
						kind: "image",
						image: pyusd,
						label: "pyusd",
						transition: "collapse",
						palette: 9,
						style: "streak",
					},
					{
						kind: "text",
						value: "¥",
						label: "jpy",
						transition: "scatter",
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
