/**
 * The cached builds index's size. Next keeps one data-cache item up to 2 MB;
 * past it the set fails with no error, and every reader rebuilds the index
 * from the store on every request. buildHackathonBuildsIndex logs the size
 * on each build, /api/status serves it, and the live canary reds above
 * INDEX_BYTES_RED.
 */

/** Red well before Next's 2 MB item limit. */
export const INDEX_BYTES_RED = 1_800_000;

/** The index's serialised size, in UTF-8 bytes. */
export const indexBytes = (index: unknown): number =>
	new TextEncoder().encode(JSON.stringify(index)).length;

/** ok, red above INDEX_BYTES_RED, or could-not-check when no size was read. */
export function indexSizeVerdict(
	bytes: unknown,
): "ok" | "red" | "could-not-check" {
	if (typeof bytes !== "number" || !Number.isFinite(bytes))
		return "could-not-check";
	return bytes > INDEX_BYTES_RED ? "red" : "ok";
}
