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
// On production this banner renders at ~545×160 CSS px — a ~3.4:1 strip, far
// wider than tall. A mark sized to ~58% of grid HEIGHT is only a handful of
// cells tall at a low row count, which is too coarse for a logo or currency
// symbol to survive downsampling: at the previous TARGET_ROWS=20 (72×20 at
// that size) a "$" carved down to an unreadable diagonal squiggle. Solving
// for a much higher row count fixes this directly — the fix is resolution,
// not a smaller/differently-shaped mark. Verified by hand at 70: every mark
// this component uses reads clearly in an ASCII dump of the actual carved
// mask at production size (see this PR's description). Cols follow from the
// container's own aspect ratio, so pitch stays fine enough at any width.
const TARGET_ROWS = 70;

function colsForRows(w: number, h: number, targetRows: number): number {
	const cols = (w * (targetRows + 2 * GRID_MARGIN)) / h - 2 * GRID_MARGIN;
	return Math.max(42, Math.round(cols));
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
				engine.setParams({
					cols: colsForRows(host.clientWidth, host.clientHeight, TARGET_ROWS),
				});

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
			className="h-40 w-full overflow-hidden rounded-xl bg-[#1A1A1A] md:h-52"
		/>
	);
}
