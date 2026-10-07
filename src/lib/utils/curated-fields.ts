/** Curated-field protection for feed syncs (lessons class 32).
 *
 * A curation registry OWNS the fields it names for a slug. Any job that
 * refreshes records from an upstream feed must drop those fields from its patch
 * or it silently reverts owner-reviewed edits — which is exactly what the daily
 * lumenloop sync did to 13 verified TYPES_SET rows for two weeks while every
 * job logged success.
 *
 * The ownership set itself is derived in scripts/data/curation-maps.ts
 * (`curatedFieldsFor`); this module is the pure application of it, kept in
 * src/ so it is unit-testable without loading a Payload config.
 */

/** Remove curated fields from a feed patch.
 *
 * Supports dotted paths ("links.website") so protecting one curated link does
 * not freeze the whole links object — the feed keeps refreshing the siblings.
 * A path whose parent is absent from the patch is a no-op: the feed cannot
 * clobber what it did not map.
 *
 * Returns the paths actually removed, so every sync run leaves a visible record
 * of what it declined to touch. */
export function withoutCuratedFields<T extends Record<string, unknown>>(
	mapped: T,
	owned: Set<string>,
): { data: T; protectedFields: string[] } {
	if (owned.size === 0) return { data: mapped, protectedFields: [] };
	const data: Record<string, unknown> = { ...mapped };
	const protectedFields: string[] = [];

	for (const path of owned) {
		const [head, sub] = path.split(".");
		if (!(head in data)) continue;
		if (!sub) {
			delete data[head];
			protectedFields.push(path);
			continue;
		}
		const parent = data[head];
		if (!parent || typeof parent !== "object") continue;
		const clone = { ...(parent as Record<string, unknown>) };
		if (!(sub in clone)) continue;
		delete clone[sub];
		data[head] = clone;
		protectedFields.push(path);
	}
	return { data: data as T, protectedFields: protectedFields.sort() };
}

/** The fields a feed patch would actually change on the stored record, as
 * dotted paths one level deep (links.github, github.orgLogin), so a dry run
 * names what an execute would write instead of only that it would write.
 * Payload array-row `id`s are ignored and `provenance` (the sync's own
 * bookkeeping, stamped on every write) is left out. */
export function changedFields(
	patch: Record<string, unknown>,
	doc: Record<string, unknown>,
	skip: ReadonlySet<string> = new Set(["provenance"]),
): string[] {
	const norm = (x: unknown) =>
		JSON.stringify(x ?? null, (key, val) => (key === "id" ? undefined : val));
	const out: string[] = [];
	for (const [key, value] of Object.entries(patch)) {
		if (skip.has(key) || value === undefined) continue;
		const current = doc[key];
		if (value && typeof value === "object" && !Array.isArray(value)) {
			const cur =
				current && typeof current === "object"
					? (current as Record<string, unknown>)
					: {};
			for (const [sub, v] of Object.entries(value as Record<string, unknown>)) {
				if (v !== undefined && norm(v) !== norm(cur[sub]))
					out.push(`${key}.${sub}`);
			}
		} else if (norm(value) !== norm(current)) out.push(key);
	}
	return out.sort();
}
