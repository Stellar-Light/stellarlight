"use client";

import { EcosystemMadChart, type ChainLine } from "@/components/ecosystem-mad-chart";

interface Props {
	data: Array<Record<string, Date | number>>;
	chains: ChainLine[];
	stats: {
		activeDevs: number;
		commits28d: number;
		yoyPct: number;
		fullTimeDevs: number;
	};
	asOf: string;
	stellarRank: number;
	totalRanked: number;
}

/**
 * Off-screen 1200×675 social-card render of the dashboard. Lives at a
 * fixed position out of viewport flow so it has zero on-page impact —
 * it exists purely for the PNG export to target via getElementById.
 *
 * Twitter / X large-image cards want ~1200×675 (16:9). LinkedIn ~1200×627.
 * 1200×675 is the sweet spot.
 */
export function EcosystemShareableCard({
	data,
	chains,
	stats,
	asOf,
	stellarRank,
	totalRanked,
}: Props) {
	const dateLabel = (() => {
		try {
			return new Date(asOf).toLocaleDateString("en-US", {
				month: "long",
				day: "numeric",
				year: "numeric",
			});
		} catch {
			return asOf;
		}
	})();

	const yoy = stats.yoyPct;
	const yoyStr = `${yoy >= 0 ? "+" : ""}${yoy}%`;

	return (
		<div
			id="shareable-snapshot"
			aria-hidden="true"
			// Off-screen via horizontal offset (not negative top) so the element
			// still gets normal layout + ResizeObserver fires for the chart.
			// Extreme negative coords like `top: -9999px` cause some browsers
			// to defer layout/paint, which leaves the chart blank when
			// html-to-image captures it.
			style={{
				position: "fixed",
				top: 0,
				left: "100vw",
				width: 1200,
				height: 675,
				background: "#0a0a0a",
				color: "#E5E5E5",
				fontFamily:
					"-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
				padding: 48,
				boxSizing: "border-box",
				display: "flex",
				flexDirection: "column",
				border: "1px solid rgba(255,255,255,0.06)",
				borderRadius: 24,
				pointerEvents: "none",
				zIndex: -1,
			}}
		>
			{/* Header */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "baseline",
					marginBottom: 24,
				}}
			>
				<div>
					<div
						style={{
							fontSize: 13,
							letterSpacing: "0.08em",
							textTransform: "uppercase",
							color: "#A3A3A3",
							marginBottom: 6,
						}}
					>
						Stellar Ecosystem · Developer Activity
					</div>
					<div style={{ fontSize: 36, fontWeight: 700, color: "#FDDA24" }}>
						{stats.activeDevs.toLocaleString()} active devs (28d)
					</div>
				</div>
				<div
					style={{
						fontSize: 12,
						color: "#737373",
						textAlign: "right",
					}}
				>
					{dateLabel}
					<br />
					Source: Electric Capital
				</div>
			</div>

			{/* Headline stats strip */}
			<div
				style={{
					display: "grid",
					gridTemplateColumns: "1fr 1fr 1fr",
					gap: 16,
					marginBottom: 20,
				}}
			>
				<StatBlock label="Commits (28d)" value={stats.commits28d.toLocaleString()} />
				<StatBlock label="YoY growth" value={yoyStr} positive={yoy >= 0} />
				<StatBlock
					label="Full-time devs"
					value={stats.fullTimeDevs.toLocaleString()}
				/>
			</div>

			{/* Chart */}
			<div style={{ flex: 1, minHeight: 0 }}>
				<div
					style={{
						fontSize: 11,
						letterSpacing: "0.06em",
						textTransform: "uppercase",
						color: "#A3A3A3",
						marginBottom: 4,
					}}
				>
					Active devs over the last year — Stellar vs L1 peers
				</div>
				<EcosystemMadChart
					data={data}
					chains={chains}
					animationDuration={0}
				/>
			</div>

			{/* Footer */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginTop: 16,
					paddingTop: 16,
					borderTop: "1px solid rgba(255,255,255,0.08)",
					fontSize: 13,
					color: "#A3A3A3",
				}}
			>
				<span>
					Stellar ranks{" "}
					<span style={{ color: "#FDDA24", fontWeight: 600 }}>
						#{stellarRank}
					</span>{" "}
					of {totalRanked} tracked L1s by active devs
				</span>
				<span style={{ color: "#E5E5E5", fontWeight: 600 }}>
					stellarlight.xyz
				</span>
			</div>
		</div>
	);
}

function StatBlock({
	label,
	value,
	positive,
}: {
	label: string;
	value: string;
	positive?: boolean;
}) {
	return (
		<div
			style={{
				background: "#171717",
				border: "1px solid rgba(255,255,255,0.06)",
				borderRadius: 12,
				padding: "14px 18px",
			}}
		>
			<div
				style={{
					fontSize: 11,
					letterSpacing: "0.06em",
					textTransform: "uppercase",
					color: "#A3A3A3",
					marginBottom: 6,
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: 28,
					fontWeight: 700,
					color: positive === false ? "#FB7185" : "#E5E5E5",
				}}
			>
				{value}
			</div>
		</div>
	);
}
