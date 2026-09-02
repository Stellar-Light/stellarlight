"use client";

import { useMemo } from "react";
import { useChartStable, useYScale } from "./chart-context";

export interface SeriesEndLabelProps {
	/**
	 * Series key to label. Deliberately not called `dataKey` — LineChart and
	 * AreaChart both sniff any child's `dataKey` prop to register it in the
	 * shared y-domain scan, and this component draws nothing of its own that
	 * should factor into that.
	 */
	forKey: string;
	label: string;
	color: string;
	yAxisId?: string | number;
}

/**
 * A small colour-matched tag at a series' last point, so identity never
 * rides on colour alone (house rule: ≥2 series → legend always, ≤4 series →
 * also direct-labelled).
 *
 * "Last point" is the last row where `forKey` actually has a number, not
 * necessarily the dataset's last row — a gap can leave today undefined for
 * one ticker. No defined value anywhere, no label: never fabricates a
 * position.
 */
export function SeriesEndLabel({
	forKey,
	label,
	color,
	yAxisId,
}: SeriesEndLabelProps) {
	const { data, xScale, xAccessor } = useChartStable();
	const yScale = useYScale(yAxisId);

	const point = useMemo(() => {
		for (let i = data.length - 1; i >= 0; i--) {
			const row = data[i];
			const value = row[forKey];
			if (typeof value === "number") {
				return { x: xScale(xAccessor(row)) ?? 0, y: yScale(value) ?? 0 };
			}
		}
		return null;
	}, [data, forKey, xAccessor, xScale, yScale]);

	if (!point) {
		return null;
	}

	return (
		<g pointerEvents="none">
			<circle cx={point.x} cy={point.y} fill={color} r={2.5} />
			<text
				dy="0.32em"
				fill={color}
				fontSize={10}
				fontWeight={600}
				x={point.x + 6}
				y={point.y}
			>
				{label}
			</text>
		</g>
	);
}

SeriesEndLabel.displayName = "SeriesEndLabel";

// Render after the interaction overlay and outside the reveal clip — same
// treatment as LineSeriesTerminalMarker, the kit's other "anchored at the
// last point" component, so the tag is never clipped mid-animation.
(SeriesEndLabel as unknown as Record<string, boolean>).__isPostOverlay = true;

export default SeriesEndLabel;
