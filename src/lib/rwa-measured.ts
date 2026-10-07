import type { RwaAsset } from "@/data/rwa-registry";

/** What the six-hour refresh lane measured about one registry row. */
export interface RwaMeasured {
	supply: number | null;
	holders: number | null;
	activityCount: number | null;
	/** live = read that cycle; unmeasured = the fetch failed and the previous good numbers were kept. */
	measureBasis: "live" | "unmeasured";
	measuredAt: string;
	note: string | null;
}

/**
 * Attach the measured state to a registry row. null when the lane has not
 * measured this asset yet — an admission, never "zero supply". Identity
 * fields come from the registry and are never touched by a measurement.
 */
export function mergeMeasured(
	row: RwaAsset,
	doc: Partial<RwaMeasured> | null | undefined,
): RwaAsset & { measured: RwaMeasured | null } {
	if (!doc || !doc.measuredAt || !doc.measureBasis)
		return { ...row, measured: null };
	return {
		...row,
		measured: {
			supply: doc.supply ?? null,
			holders: doc.holders ?? null,
			activityCount: doc.activityCount ?? null,
			measureBasis: doc.measureBasis,
			measuredAt: doc.measuredAt,
			note: doc.note ?? null,
		},
	};
}
