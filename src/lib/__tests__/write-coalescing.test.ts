/**
 * Two patches for one row must merge, not overwrite each other.
 *
 * Curate builds each patch by spreading the group as it was READ:
 * `{ links: { ...d.links, website: null } }`. When two sections plan a write
 * for the same row, applying them in sequence means the second patch's stale
 * spread RESURRECTS what the first cleared.
 *
 * 2026-09-07: `mimoto` and `sorosorcerer` are named by both GITHUB_LINK_REMOVE
 * and WEBSITE_REMOVE_DEAD. Both writes reported success; the row ended with
 * `github: null` and the dead website back. 42 of 44 removals stuck — the two
 * that failed were exactly the two with a second write in the same run.
 */
import { describe, expect, it } from "vitest";

/** The coalescing curate applies before writing. Mirrors the loop exactly. */
function coalesce(
	writes: Array<{ id: string; data: Record<string, unknown> }>,
): Array<{ id: string; data: Record<string, unknown> }> {
	const merged = new Map<string, { id: string; data: Record<string, unknown> }>();
	for (const w of writes) {
		const prev = merged.get(w.id);
		if (!prev) {
			merged.set(w.id, { ...w, data: { ...w.data } });
			continue;
		}
		for (const [k, v] of Object.entries(w.data)) {
			const a = prev.data[k];
			prev.data[k] =
				a && v && typeof a === "object" && typeof v === "object" &&
				!Array.isArray(a) && !Array.isArray(v)
					? { ...(a as object), ...(v as object) }
					: v;
		}
	}
	return [...merged.values()];
}

describe("planned writes coalesce per row", () => {
	it("keeps BOTH nulls when two sections clear two links on one row", () => {
		// The exact mimoto case: stored links carry a dead website AND a dead
		// github; two sections each clear one, each spreading what it read.
		const stored = { website: "https://github.com/nkoorty/mimoto", github: "https://github.com/nkoorty/mimoto" };
		const out = coalesce([
			{ id: "1", data: { links: { ...stored, github: null } } },
			{ id: "1", data: { links: { ...stored, website: null } } },
		]);
		expect(out).toHaveLength(1);
		expect(out[0].data.links).toEqual({ website: null, github: null });
	});

	it("without coalescing the second patch resurrects the first's removal", () => {
		// Documents the bug this exists to prevent.
		const stored = { website: "dead", github: "dead" };
		const a = { links: { ...stored, github: null } };
		const b = { links: { ...stored, website: null } };
		const lastWriteWins = b.links;
		expect(lastWriteWins.github).toBe("dead"); // ← the resurrection
	});

	it("merges sibling groups without dropping either", () => {
		const out = coalesce([
			{ id: "1", data: { lifecycle: { wasLive: true } } },
			{ id: "1", data: { links: { website: null } } },
		]);
		expect(out[0].data).toEqual({
			lifecycle: { wasLive: true },
			links: { website: null },
		});
	});

	it("a later scalar still wins over an earlier one", () => {
		const out = coalesce([
			{ id: "1", data: { status: "Live" } },
			{ id: "1", data: { status: "Inactive" } },
		]);
		expect(out[0].data.status).toBe("Inactive");
	});

	it("leaves single-write rows exactly as planned", () => {
		const w = [{ id: "1", data: { status: "Live" } }, { id: "2", data: { status: "Draft" } }];
		expect(coalesce(w)).toEqual(w);
	});
});
