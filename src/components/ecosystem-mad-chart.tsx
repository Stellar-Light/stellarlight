"use client";

import { AreaChart, Area } from "@/components/charts/area-chart";
import { ChartTooltip } from "@/components/charts/tooltip";

export interface ChainLine {
	/** Object key in the merged data points (e.g. "stellar") */
	key: string;
	/** Display label in tooltip */
	label: string;
	/** Line color */
	color: string;
	/** Stroke width override */
	strokeWidth?: number;
	/** Whether this line gets a filled area (true only for Stellar) */
	filled?: boolean;
}

interface Props {
	/** One row per date, keyed by chain key — e.g. {date, stellar, ethereum, ...} */
	data: Array<Record<string, Date | number>>;
	/** Chain configs. Render order matters: peers first (background), Stellar last (on top) */
	chains: ChainLine[];
}

export function EcosystemMadChart({ data, chains }: Props) {
	return (
		<AreaChart
			data={data as unknown as Record<string, unknown>[]}
			xDataKey="date"
			aspectRatio="4 / 1"
			margin={{ top: 8, right: 0, bottom: 24, left: 0 }}
		>
			{chains.map((c) => (
				<Area
					key={c.key}
					dataKey={c.key}
					stroke={c.color}
					fill={c.color}
					fillOpacity={c.filled ? 0.4 : 0}
					strokeWidth={c.strokeWidth ?? 1.5}
				/>
			))}
			<ChartTooltip
				showCrosshair
				showDots
				showDatePill
				rows={(point) =>
					chains
						.map((c) => ({
							color: c.color,
							label: c.label,
							value: (point[c.key] as number) ?? 0,
						}))
						.sort((a, b) => (b.value as number) - (a.value as number))
				}
			/>
		</AreaChart>
	);
}
