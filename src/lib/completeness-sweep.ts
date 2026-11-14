/**
 * The parts of scripts/check-record-completeness.ts that decide whether a
 * sweep read anything, kept here so CI tests them without the network.
 *
 * A page that could not be read is not a page with no rows. Until 2026-11-13
 * the script read `body.projects ?? []` from any answer: a 429, a 5xx, a 400
 * and the 200 the search route gives a request with no filter
 * (meta.error "no_query") all counted as an empty page, and S0 printed
 * "0 projects + 0 audits, 0 dangling references" with a tick every night.
 */
import { PROJECT_CATEGORIES } from "./project-types";

/** A sweep page that could not be read. The script lets it reach its
 * top-level handler, which exits 2: "I could not look", never a pass. */
export class SweepUnreadable extends Error {
	override name = "SweepUnreadable";
}

/**
 * The rows of one sweep page. Throws SweepUnreadable on anything other than
 * a 2xx whose body holds an array under `key` and no error: an HTTP error, an
 * `error` in the body or in its meta, or a body of another shape.
 */
export function sweepRows(
	path: string,
	status: number,
	body: unknown,
	key = "projects",
): Array<Record<string, unknown>> {
	const b = (body && typeof body === "object" ? body : {}) as Record<
		string,
		unknown
	>;
	const err = b.error ?? (b.meta as { error?: unknown } | undefined)?.error;
	const said = err
		? `: ${typeof err === "string" ? err : JSON.stringify(err)}`
		: "";
	if (status < 200 || status > 299)
		throw new SweepUnreadable(`${path} answered HTTP ${status}${said}`);
	if (err) throw new SweepUnreadable(`${path} answered an error${said}`);
	const rows = b[key];
	if (!Array.isArray(rows))
		throw new SweepUnreadable(`${path} answered no ${key} array in its body`);
	return rows;
}

/**
 * The search paths that together read the whole directory: one per category
 * the collection holds (every project has exactly one). A search with no
 * filter is not a way to list the directory; it answers no_query.
 */
export const DIRECTORY_SWEEPS: readonly string[] = PROJECT_CATEGORIES.map(
	(c) => `/api/projects/search?category=${encodeURIComponent(c)}`,
);
