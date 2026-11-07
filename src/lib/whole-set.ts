/**
 * A read that returns the whole matching set, or says it did not.
 *
 * A fixed `limit:` truncates in silence: a listing counted, paged and
 * labelled a capped array as if it were every row (#1915, GET /api/builders
 * read 300 of 401 profiles and called it the full set). Here `limit` is a
 * ceiling, not a page size. Pagination stays on, so the database counts every
 * match, and a set that has outgrown the ceiling comes back with
 * `complete: false` and its true `totalDocs` for the caller to state, never
 * a cut list passing as all of it. `limit: 0` reads every row. A failed read
 * throws, as find does: the caller's could-not-check path handles it.
 */
import type { Payload } from "payload";

export interface WholeSet<T> {
	docs: T[];
	/** every row the query matches, counted by the database */
	totalDocs: number;
	/** true only when `docs` holds every match */
	complete: boolean;
}

/** For a caller that cannot use a cut set: thrown so its could-not-check
 * path runs. degradedWarning prints the name; the message has the counts. */
export class IncompleteRead extends Error {
	override name = "IncompleteRead";
	constructor(what: string, set: WholeSet<unknown>) {
		super(`read ${set.docs.length} of ${set.totalDocs} ${what}`);
	}
}

/** Matches every row. With an empty filter Payload's mongo adapter counts
 * with estimatedDocumentCount, the collection's metadata rather than its
 * rows, and `complete` must compare against an exact count: this clause
 * keeps the query non-empty so the database counts the rows. */
const EVERY_ROW = { id: { exists: true } } as const;

export async function findWholeSet<T = Record<string, unknown>>(
	payload: Pick<Payload, "find">,
	args: Parameters<Payload["find"]>[0],
): Promise<WholeSet<T>> {
	const res = await payload.find({
		...args,
		where: args.where ? { and: [args.where, EVERY_ROW] } : EVERY_ROW,
		pagination: true,
	});
	return {
		docs: res.docs as unknown as T[],
		totalDocs: res.totalDocs,
		complete: res.docs.length >= res.totalDocs,
	};
}
