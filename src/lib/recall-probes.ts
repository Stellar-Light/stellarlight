/** How Engine A's generated recall probes are BUILT and GRADED.
 *
 * Extracted from scripts/eval/generated-recall.ts (which runs `main()` in its
 * module body, so a test importing it would execute the whole eval) — same
 * reason link-history.ts was split out of check-links.ts.
 *
 * The eval derives its probes from the data: a record's own structured fields
 * imply the queries that must retrieve it. That only works if the generated
 * query is actually ABOUT the record, and if the expected window is fair for
 * how many records legitimately answer it. Two ways it wasn't:
 *
 *  1. **The discriminator could vanish.** The network probe was
 *     `"<network> <types[0]>"`. Records typed by convention with an EMPTY
 *     `types` array (the Oracle convention — `types: []` + `category:
 *     "Infrastructure"`) produced a BARE attribute query: band's probe was
 *     literally `q=evm`, which 91 records answer. The eval then demanded band
 *     specifically be in the top 10 of those 91. `q=evm infrastructure` — the
 *     query the generator meant to build — puts band at #9.
 *
 *  2. **The window didn't scale with the crowd.** "In the top 10" is a recall
 *     assertion when 12 records match and a RANKING-PREFERENCE assertion when
 *     91 do. P-ATTR is a recall bucket, so for a crowded query the window
 *     grows with the population instead of the assertion being dropped.
 *
 * Neither change makes the eval more lenient about recall: a record that the
 * attribute no longer retrieves AT ALL still fails, which is what the bucket
 * is for.
 */

export type ProbeRecord = {
	slug: string;
	types?: string[] | null;
	category?: string | null;
	supportedNetworks?: string[] | null;
};

/** Base expectation window for an attribute probe. */
export const ATTR_BASE_WINDOW = 10;
/** Never scale past this — beyond it the assertion stops meaning anything. */
export const ATTR_MAX_WINDOW = 50;
/** Fraction of the matching population the record must place within. */
export const ATTR_WINDOW_FRACTION = 4;

/** The token that makes an attribute query ABOUT this record rather than about
 * the attribute. `types[0]` normally; `category` when the record uses the
 * empty-types convention. Empty string only when the record carries neither —
 * callers must treat that as "no usable probe". */
export function probeDiscriminator(p: ProbeRecord): string {
	const fromTypes = (p.types ?? []).find((t) => t?.trim());
	if (fromTypes) return fromTypes.toLowerCase();
	return (p.category ?? "").trim().toLowerCase();
}

/** The `supportedNetworks` probe for a record: its first non-Stellar chain,
 * discriminated. Returns null when the record implies no network query, or
 * when it has no discriminator — a bare `q=<chain>` is not a probe ABOUT a
 * record, it is a probe about the whole chain, and grading one record against
 * it is what defect (1) above was. */
export function networkProbeQuery(p: ProbeRecord): string | null {
	const net = (p.supportedNetworks ?? []).find((n) => n && n !== "stellar");
	if (!net) return null;
	const discriminator = probeDiscriminator(p);
	if (!discriminator) return null;
	return `${net} ${discriminator}`;
}

/** How deep a record may sit and still count as retrieved, given how many
 * records the query actually matched. Grows with the population so a crowded
 * query is graded on recall rather than on rank preference. */
export function attrWindow(totalMatches: number): number {
	if (!Number.isFinite(totalMatches) || totalMatches <= 0)
		return ATTR_BASE_WINDOW;
	return Math.max(
		ATTR_BASE_WINDOW,
		Math.min(ATTR_MAX_WINDOW, Math.ceil(totalMatches / ATTR_WINDOW_FRACTION)),
	);
}

/** Generator-side crowding: when MANY records imply the SAME query string
 * (16 EVM bridges), a per-record expectation over-demands and the bucket is
 * graded at set level instead. Unchanged behaviour, kept alongside the window
 * scaling: the two catch different shapes of crowding. */
export const ATTR_SET_LEVEL_CROWD = 4;

export function gradeAttrProbe(args: {
	/** Slug the probe was generated FROM. */
	slug: string;
	/** Every slug whose fields imply this same query. */
	impliers: Set<string>;
	/** Result slugs in rank order (may be longer than the base window). */
	returned: string[];
	/** meta.counts.total for the query — the real population that matched. */
	totalMatches: number;
}): { ok: boolean; window: number; mode: "set" | "record" } {
	const { slug, impliers, returned, totalMatches } = args;
	if (impliers.size > ATTR_SET_LEVEL_CROWD) {
		const hits = returned
			.slice(0, ATTR_BASE_WINDOW)
			.filter((s) => impliers.has(s)).length;
		return { ok: hits >= 3, window: ATTR_BASE_WINDOW, mode: "set" };
	}
	const window = attrWindow(totalMatches);
	return {
		ok: returned.slice(0, window).includes(slug),
		window,
		mode: "record",
	};
}
