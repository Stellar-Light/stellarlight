/**
 * One repo, one row, whatever the letter case.
 *
 * GitHub fullNames are case-insensitive; Mongo `equals` is not. A writer that
 * guards its create with an exact-case lookup makes a twin row whenever a
 * source spells the repo differently (#783). enrich-builder-repos did this
 * inside one run: thisisouvik/Autopilot and thisisouvik/autopilot were
 * created in the same second on 2026-10-06 and broke enrich-repos'
 * one-row-per-repo guard from at least 11-02 until a dedupe on 11-12.
 */
import type { Payload } from "payload";

// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
type Doc = Record<string, any>;

/** The stored row for a GitHub fullName, matched case-insensitively. Held
 *  repos too: a lookup that misses one creates a second, unheld row. `like`
 *  is a case-insensitive SUBSTRING match, so the JS filter makes it exact. */
export async function findRepoDoc(
	payload: Pick<Payload, "find">,
	key: string,
): Promise<Doc | undefined> {
	const exact = (
		await payload.find({
			collection: "repos",
			where: { fullName: { equals: key } },
			limit: 1,
			depth: 0,
			context: { includeSecurityHeld: true },
		})
	).docs[0] as Doc | undefined;
	if (exact) return exact;
	const near = await payload.find({
		collection: "repos",
		where: { fullName: { like: key } },
		// `like` is a substring match: a short name can return many rows that
		// merely contain it before the exact one, so read past the first few.
		limit: 50,
		depth: 0,
		context: { includeSecurityHeld: true },
	});
	return (near.docs as Doc[]).find(
		(d) => String(d.fullName ?? "").toLowerCase() === key.toLowerCase(),
	);
}

/** The fullNames not in `known` (lowercased), each added to `known` as it is
 *  taken, so a second spelling of one repo in the same run is not taken. */
export function takeUnknown(known: Set<string>, fullNames: string[]): string[] {
	const out: string[] = [];
	for (const f of fullNames) {
		const k = f.toLowerCase();
		if (known.has(k)) continue;
		known.add(k);
		out.push(f);
	}
	return out;
}
