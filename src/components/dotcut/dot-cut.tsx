"use client";

/**
 * Canvas "dot-cut" banner for the /stablecoins header — a dense mesh of
 * touching circles that carves each token's mark as negative space, and
 * reorganises through two full-bleed patterns between logos so a mark lands
 * as an event rather than blending into a steady scroll. Framework-free
 * Canvas 2D + rAF, driven entirely by `DotCut` (./engine.ts); this component
 * only loads the logos, builds the scene list, and wires lifecycle.
 */

import { useEffect, useRef } from "react";
import { DotCut } from "./engine";
import type { Scene } from "./scenes";

const LOGO_SLUGS = ["usdt0", "usdc", "eurc", "pyusd"] as const;

// Must match engine.ts's own inset margin (pitch derivation) — see resize().
const GRID_MARGIN = 0.75;
// The engine's default cols=42 assumes a roughly square container. This
// banner is a full-width, short strip (~6:1 at desktop): at 42 cols that
// starves the grid to ~5 rows, which is too little vertical resolution for a
// logo's internal glyph to survive downsampling — verified empirically
// against the real marks, coverage collapsed to 0 (the fallback-to-intact-
// lattice path) for several of them. Solving for a fixed row count instead
// keeps every mark legible regardless of the banner's actual aspect ratio.
const TARGET_ROWS = 20;

function colsForRows(w: number, h: number, targetRows: number): number {
	const cols = (w * (targetRows + 2 * GRID_MARGIN)) / h - 2 * GRID_MARGIN;
	return Math.max(42, Math.round(cols));
}

function loadImage(src: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.src = src;
	return img.decode().then(() => img);
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

				// Four token marks + two full-bleed patterns, so the field visibly
				// reorganises between logos rather than reading as a steady scroll.
				// Each scene's `style` axis (linear/radial/random) deliberately
				// differs from its `transition` axis — see engine.ts's cellMotion /
				// styleField for what each transition and style actually is.
				const scenes: Scene[] = [
					{
						kind: "image",
						image: usdt0,
						label: "usdt0",
						transition: "wipe",
						palette: 6,
						style: "swell",
					},
					{ kind: "rings", transition: "ripple", palette: 10, style: "grain" },
					{
						kind: "image",
						image: usdc,
						label: "usdc",
						transition: "scatter",
						palette: 7,
						style: "streak",
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
						kind: "checker",
						transition: "columns",
						palette: 11,
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
				];

				const engine = new DotCut(
					host,
					scenes,
					"ui-sans-serif, system-ui, sans-serif",
				);
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
