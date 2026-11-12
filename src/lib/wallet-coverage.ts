/**
 * sls-033: every Wallet row ends in a recorded state for both wallet facts.
 *
 * productKind: a cited kind (PRODUCT_KIND) or a dated reason it stays null
 * (PRODUCT_KIND_UNRESOLVED), both in scripts/data/curation-maps.ts.
 * availability: dated platform rows, or a dated check that found none or
 * could not read a source (availabilityCheck). A null availability alone
 * cannot tell "nobody looked" from "looked and found nothing", which is the
 * gap Raven measured as 39 of 72 rows on 2026-11-06.
 *
 * Pure functions, shared by the route (what is served), curate-projects (what
 * is written) and the nightly record-completeness sweep (what is missing).
 */
import type { AVAILABILITY_CHECK_RESULTS } from "./project-types";

export interface AvailabilityCheck {
	result: (typeof AVAILABILITY_CHECK_RESULTS)[number];
	checkedAt: string;
	sources: string[];
	note: string;
}

/** The served check, or null. A check explains an empty availability, so it
 * is served only while no availability row is served beside it. */
export function pickAvailabilityCheck(
	check: unknown,
	availabilityServed: unknown,
): AvailabilityCheck | null {
	if (Array.isArray(availabilityServed) && availabilityServed.length)
		return null;
	const c = check as Partial<AvailabilityCheck> | null | undefined;
	if (!c || typeof c.result !== "string" || typeof c.checkedAt !== "string")
		return null;
	return {
		result: c.result,
		checkedAt: c.checkedAt,
		sources: Array.isArray(c.sources)
			? c.sources.filter((s): s is string => typeof s === "string")
			: [],
		note: typeof c.note === "string" ? c.note : "",
	};
}

/** One comparable form of a stored or wanted check (Payload adds no row ids
 * to a group, but a never-written group reads back with null members). */
export function normCheck(c: unknown): string {
	const v = c as Partial<AvailabilityCheck> | null | undefined;
	if (!v?.result) return "null";
	return JSON.stringify({
		result: v.result,
		checkedAt: v.checkedAt ?? null,
		sources: Array.isArray(v.sources) ? v.sources : [],
		note: v.note ?? null,
	});
}

/** An availability row as the curated maps hold it (storeUrl and note left
 * out when there is none). */
export interface CuratedAvailabilityRow {
	platform: string;
	state: string;
	storeUrl?: string;
	checkedAt: string;
	note?: string;
}
type StoredRow = {
	platform: string;
	state: string;
	storeUrl: string | null;
	checkedAt: string;
	note: string | null;
};

/** One comparable form of stored or wanted rows (Payload's row ids dropped). */
function normRows(rows: unknown): string {
	return JSON.stringify(
		(Array.isArray(rows) ? rows : []).map((r) => ({
			platform: r?.platform ?? null,
			state: r?.state ?? null,
			storeUrl: r?.storeUrl ?? null,
			checkedAt: r?.checkedAt ?? null,
			note: r?.note ?? null,
		})),
	);
}

export interface AvailabilityPatch {
	availability?: StoredRow[];
	availabilityCheck?: AvailabilityCheck | typeof CLEARED_CHECK;
}

/** Every member null: how curate-projects clears a stored check. */
export const CLEARED_CHECK = {
	result: null,
	checkedAt: null,
	sources: [],
	note: null,
} as const;

/**
 * What curate-projects writes to one row's availability and availabilityCheck
 * from the curated maps. Rows are EXACT-SYNC when a map gives them. A check is
 * kept only while the row will have no rows, from the maps or from what is
 * stored, and is cleared once it has some, so a slug moved from
 * AVAILABILITY_CHECKED to a rows map (or named by both) clears its check in
 * the same run. Only fields that differ from the stored row are returned; an
 * empty patch means the row is in sync.
 */
export function availabilityPatch(
	stored: { availability?: unknown; availabilityCheck?: unknown },
	wantRows: readonly CuratedAvailabilityRow[] | undefined,
	wantCheck: AvailabilityCheck | undefined,
): AvailabilityPatch {
	const patch: AvailabilityPatch = {};
	let rowsAfter: unknown = stored.availability;
	if (wantRows) {
		const want = wantRows.map((r) => ({
			platform: r.platform,
			state: r.state,
			storeUrl: r.storeUrl ?? null,
			checkedAt: r.checkedAt,
			note: r.note ?? null,
		}));
		if (normRows(stored.availability) !== normRows(want))
			patch.availability = want;
		rowsAfter = want;
	}
	const hasRows = Array.isArray(rowsAfter) && rowsAfter.length > 0;
	const keep = wantCheck && !hasRows ? wantCheck : null;
	if (normCheck(stored.availabilityCheck) !== normCheck(keep))
		patch.availabilityCheck = keep ?? CLEARED_CHECK;
	return patch;
}

/**
 * The Wallet rows that miss a recorded state: no productKind and no dated
 * reason, or no availability and no availability check. The type is checked
 * here as well as in the sweep's query, so a route that stopped honouring
 * type=Wallet cannot pass a row.
 */
export function walletCoverageGaps<
	T extends {
		slug: string;
		types?: readonly string[] | null;
		productKind?: string | null;
		availability?: readonly unknown[] | null;
		availabilityCheck?: { result?: string | null } | null;
	},
>(
	rows: readonly T[],
	kindUnresolved: Readonly<Record<string, string>>,
): Array<T & { missing: Array<"productKind" | "availability"> }> {
	const out: Array<T & { missing: Array<"productKind" | "availability"> }> = [];
	for (const r of rows) {
		if (!r.types?.includes("Wallet")) continue;
		const missing: Array<"productKind" | "availability"> = [];
		if (
			!r.productKind &&
			!(Object.hasOwn(kindUnresolved, r.slug) && kindUnresolved[r.slug].trim())
		)
			missing.push("productKind");
		if (!r.availability?.length && !r.availabilityCheck?.result)
			missing.push("availability");
		if (missing.length) out.push({ ...r, missing });
	}
	return out;
}
