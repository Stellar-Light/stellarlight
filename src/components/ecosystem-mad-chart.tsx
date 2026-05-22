"use client";

import { AreaChart, Area } from "@/components/charts/area-chart";
import { ChartTooltip } from "@/components/charts/tooltip";

interface Props {
	data: Array<{ date: Date; mad: number }>;
}

export function EcosystemMadChart({ data }: Props) {
	return (
		<AreaChart
			data={data}
			xDataKey="date"
			aspectRatio="4 / 1"
			margin={{ top: 8, right: 0, bottom: 24, left: 0 }}
		>
			<Area
				dataKey="mad"
				stroke="#FDDA24"
				fill="#FDDA24"
				strokeWidth={2}
			/>
			<ChartTooltip
				showCrosshair
				showDots
				showDatePill
				rows={(point) => [
					{
						color: "#FDDA24",
						label: "Active devs",
						value: (point.mad as number) ?? 0,
					},
				]}
			/>
		</AreaChart>
	);
}
