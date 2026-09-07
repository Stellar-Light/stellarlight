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

/** The reduction curate applies before writing. Mirrors the loop exactly:
 *  every patch for a row was built from the same stored doc, so the keys where
 *  a patch DIFFERS from what is stored are what that section meant to change. */
function reduceToIntent(
	stored: Record<string, unknown>,
	writes: Array<{ id: string; data: Record<string, unknown> }>,
): Record<string, unknown> {
	const data: Record<string, unknown> = {};
	for (const w of writes) {
		for (const [key, val] of Object.entries(w.data)) {
			const cur = stored[key];
			if (
				val && cur && typeof val === "object" && typeof cur === "object" &&
				!Array.isArray(val) && !Array.isArray(cur)
			) {
				const base = (data[key] ?? { ...(cur as object) }) as Record<string, unknown>;
				for (const [k2, v2] of Object.entries(val as Record<string, unknown>)) {
					if ((cur as Record<string, unknown>)[k2] !== v2) base[k2] = v2;
				}
				data[key] = base;
			} else {
				data[key] = val;
			}
		}
	}
	return data;
}

describe("planned writes coalesce per row", () => {
	it("keeps BOTH nulls when two sections clear two links on one row", () => {
		// The exact mimoto case: stored links carry a dead website AND a dead
		// github; two sections each clear one, each spreading what it read.
		const links = { website: "https://github.com/nkoorty/mimoto", github: "https://github.com/nkoorty/mimoto" };
		const out = reduceToIntent({ links }, [
			{ id: "1", data: { links: { ...links, github: null } } },
			{ id: "1", data: { links: { ...links, website: null } } },
		]);
		expect(out.links).toEqual({ website: null, github: null });
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
		const out = reduceToIntent(
			{ lifecycle: { wasLive: false }, links: { website: "x" } },
			[
				{ id: "1", data: { lifecycle: { wasLive: true } } },
				{ id: "1", data: { links: { website: null } } },
			],
		);
		expect(out.lifecycle).toEqual({ wasLive: true });
		expect(out.links).toEqual({ website: null });
	});

	it("a later scalar still wins over an earlier one", () => {
		const out = reduceToIntent({ status: "Draft" }, [
			{ id: "1", data: { status: "Live" } },
			{ id: "1", data: { status: "Inactive" } },
		]);
		expect(out.status).toBe("Inactive");
	});

	it("an unchanged key in a patch is not re-written", () => {
		// The spread carries siblings that did not change; they must not appear
		// in the reduced patch at all.
		const links = { website: "keep", github: "dead" };
		const out = reduceToIntent({ links }, [
			{ id: "1", data: { links: { ...links, github: null } } },
		]);
		expect(out.links).toEqual({ website: "keep", github: null });
	});
});
