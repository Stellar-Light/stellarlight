"use client";

/**
 * Interactive Sankey — the client half of the /quality defect-flow chart.
 *
 * Two things forced this off the server-only path:
 *  1. WIDTH. The server version drew into a fixed 760-unit viewBox with a
 *     fixed pixel height, so preserveAspectRatio letterboxed it inside any
 *     wider container — the chart looked "stuck" at one width. This version
 *     measures its container and lays out in real pixels, so it fills
 *     whatever it is given.
 *  2. HOVER. Ribbons only had native <title> tooltips (delayed, unstyled).
 *     Hovering a ribbon now dims everything else and shows a styled tooltip
 *     with the flow and its share; hovering a node highlights every ribbon
 *     touching it. Pointer-only enhancement — the underlying <title> stays
 *     for keyboard/AT, and the reduced-motion case is a plain opacity swap.
 */

import { useEffect, useRef, useState } from "react";

type SankeyNode = { id: string; label: string; column: number; value: number };
type SankeyLink = { source: number; target: number; value: number };

export function Sankey({
	nodes,
	links,
	height = 340,
}: {
	nodes: SankeyNode[];
	links: SankeyLink[];
	height?: number;
}) {
	const wrapRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(760);
	const [hoverLink, setHoverLink] = useState<number | null>(null);
	const [hoverNode, setHoverNode] = useState<number | null>(null);
	const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);

	useEffect(() => {
		const el = wrapRef.current;
		if (!el) return;
		const measure = () => setWidth(Math.max(el.clientWidth, 320));
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const W = width;
	const H = height;
	const NODE_W = 9;
	const GAP = 10;
	const PAD_Y = 6;
	const columns = [...new Set(nodes.map((n) => n.column))].sort(
		(a, b) => a - b,
	);

	// throughput per node: max(in, out) - a node is as tall as the most that
	// passes through it, so a column never over- or under-states its mass
	const inSum = new Map<number, number>();
	const outSum = new Map<number, number>();
	for (const l of links) {
		outSum.set(l.source, (outSum.get(l.source) ?? 0) + l.value);
		inSum.set(l.target, (inSum.get(l.target) ?? 0) + l.value);
	}
	const thru = (i: number) => Math.max(inSum.get(i) ?? 0, outSum.get(i) ?? 0);
	const total = links.reduce((a, l) => a + l.value, 0);

	const colTotal = (c: number) =>
		nodes.reduce((a, n, i) => (n.column === c ? a + thru(i) : a), 0);
	const colCount = (c: number) => nodes.filter((n) => n.column === c).length;
	const maxMass = Math.max(...columns.map(colTotal), 1);
	const maxGaps = Math.max(...columns.map((c) => (colCount(c) - 1) * GAP), 0);
	const scale = (H - PAD_Y * 2 - maxGaps) / maxMass;

	const geom = new Map<number, { x: number; y: number; h: number }>();
	for (const c of columns) {
		const x =
			columns.length === 1
				? 0
				: (c / (columns.length - 1)) * (W - NODE_W - 150) + 75;
		let y = PAD_Y;
		nodes.forEach((n, i) => {
			if (n.column !== c) return;
			const h = Math.max(thru(i) * scale, 2);
			geom.set(i, { x, y, h });
			y += h + GAP;
		});
	}

	// running offsets so ribbons stack rather than overlap
	const outAt = new Map<number, number>();
	const inAt = new Map<number, number>();
	const ribbons = links
		.map((l, li) => ({ ...l, li }))
		.sort((a, b) => b.value - a.value)
		.map((l) => {
			const s = geom.get(l.source);
			const t = geom.get(l.target);
			if (!s || !t) return null;
			const sh = Math.max(l.value * scale, 1);
			const th = Math.max(l.value * scale, 1);
			const sy = s.y + (outAt.get(l.source) ?? 0);
			const ty = t.y + (inAt.get(l.target) ?? 0);
			outAt.set(l.source, (outAt.get(l.source) ?? 0) + sh);
			inAt.set(l.target, (inAt.get(l.target) ?? 0) + th);
			const x0 = s.x + NODE_W;
			const x1 = t.x;
			const cx = (x0 + x1) / 2;
			// two beziers out and back = a filled ribbon
			const d = [
				`M${x0},${sy}`,
				`C${cx},${sy} ${cx},${ty} ${x1},${ty}`,
				`L${x1},${ty + th}`,
				`C${cx},${ty + th} ${cx},${sy + sh} ${x0},${sy + sh}`,
				"Z",
			].join(" ");
			return {
				d,
				li: l.li,
				source: l.source,
				target: l.target,
				value: l.value,
				title: `${nodes[l.source].label} → ${nodes[l.target].label}`,
			};
		})
		.filter((x): x is NonNullable<typeof x> => !!x);

	const linkActive = (r: { li: number; source: number; target: number }) =>
		hoverLink === r.li ||
		(hoverNode !== null && (r.source === hoverNode || r.target === hoverNode));
	const anyHover = hoverLink !== null || hoverNode !== null;

	const hovered =
		hoverLink !== null ? ribbons.find((r) => r.li === hoverLink) : null;
	const tooltip = hovered
		? {
				title: hovered.title,
				value: hovered.value,
				share: total ? Math.round((hovered.value / total) * 100) : 0,
			}
		: hoverNode !== null
			? {
					title: nodes[hoverNode].label,
					value: thru(hoverNode),
					share: total ? Math.round((thru(hoverNode) / total) * 100) : 0,
				}
			: null;

	return (
		<div
			ref={wrapRef}
			className="relative w-full"
			onMouseLeave={() => {
				setHoverLink(null);
				setHoverNode(null);
				setMouse(null);
			}}
			onMouseMove={(e) => {
				const box = wrapRef.current?.getBoundingClientRect();
				if (box) setMouse({ x: e.clientX - box.left, y: e.clientY - box.top });
			}}
		>
			<svg
				viewBox={`0 0 ${W} ${H}`}
				width={W}
				height={H}
				className="block"
				role="img"
				aria-label={`Finding flow: ${links.map((l) => `${nodes[l.source].label} to ${nodes[l.target].label} ${l.value}`).join("; ")}`}
			>
				<title>Findings traced from detector, through surface, to outcome</title>
				{ribbons.map((r) => (
					<path
						key={r.d}
						d={r.d}
						fill="#FDDA24"
						fillOpacity={
							linkActive(r) ? 0.45 : anyHover ? 0.05 : 0.14
						}
						style={{ transition: "fill-opacity 120ms" }}
						onMouseEnter={() => {
							setHoverLink(r.li);
							setHoverNode(null);
						}}
						onMouseLeave={() => setHoverLink(null)}
					>
						<title>{`${r.title}: ${r.value}`}</title>
					</path>
				))}
				{nodes.map((n, i) => {
					const g = geom.get(i);
					if (!g) return null;
					const last = n.column === columns[columns.length - 1];
					const active =
						hoverNode === i ||
						(hoverLink !== null &&
							ribbons.some(
								(r) => r.li === hoverLink && (r.source === i || r.target === i),
							));
					return (
						<g key={n.id}>
							{/* wider invisible hit target than the 9px bar itself */}
							<rect
								x={g.x - 4}
								y={g.y - 2}
								width={NODE_W + 8}
								height={g.h + 4}
								fill="transparent"
								onMouseEnter={() => {
									setHoverNode(i);
									setHoverLink(null);
								}}
								onMouseLeave={() => setHoverNode(null)}
							/>
							<rect
								x={g.x}
								y={g.y}
								width={NODE_W}
								height={g.h}
								rx="2"
								fill="#FDDA24"
								fillOpacity={active ? 1 : anyHover ? 0.5 : 0.85}
								style={{ transition: "fill-opacity 120ms", pointerEvents: "none" }}
							>
								<title>{`${n.label}: ${thru(i)} findings`}</title>
							</rect>
							<text
								x={last ? g.x - 8 : g.x + NODE_W + 8}
								y={g.y + g.h / 2}
								textAnchor={last ? "end" : "start"}
								dominantBaseline="middle"
								className="fill-muted-foreground"
								style={{ fontSize: 10, pointerEvents: "none" }}
							>
								{n.label}
								<tspan className="fill-foreground" style={{ fontWeight: 500 }}>
									{"  "}
									{thru(i)}
								</tspan>
							</text>
						</g>
					);
				})}
			</svg>
			{tooltip && mouse && (
				<div
					className="pointer-events-none absolute z-10 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs shadow-md"
					style={{
						left: Math.min(mouse.x + 12, W - 190),
						top: Math.max(mouse.y - 40, 0),
						maxWidth: 220,
					}}
				>
					<div className="text-foreground">{tooltip.title}</div>
					<div className="text-muted-foreground tabular-nums">
						{tooltip.value} finding{tooltip.value === 1 ? "" : "s"} ·{" "}
						{tooltip.share}% of flow
					</div>
				</div>
			)}
		</div>
	);
}
