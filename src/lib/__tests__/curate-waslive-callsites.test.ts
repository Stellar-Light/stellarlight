/**
 * Drives scripts/data/curate-projects.ts itself, with a fake Payload, so the
 * two places it writes lifecycle.wasLive are under test and not only the rule
 * they call (statusFixWasLive): the from-guard branch, which corrects a row
 * already at the entry's status, and the move branch, which writes the flag
 * with the status. Reverting either call site to reading `from: "Live"` as a
 * launch turns this red.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { STATUS_FIX } from "../../../scripts/data/curation-maps";

// biome-ignore lint/suspicious/noExplicitAny: fake Payload rows
type Row = Record<string, any>;
const state: { rows: Row[]; updates: Array<{ id: string; data: Row }> } = {
	rows: [],
	updates: [],
};

vi.mock("../../../scripts/load-env", () => ({}));
vi.mock("../../payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("payload", () => ({
	getPayload: async () => ({
		// biome-ignore lint/suspicious/noExplicitAny: Payload query shape
		find: async ({ collection, where }: any) => {
			const want = where?.slug?.equals;
			const docs =
				collection === "projects" && typeof want === "string"
					? state.rows.filter((r) => r.slug === want)
					: [];
			return { docs, totalDocs: docs.length };
		},
		findByID: async ({ id }: { id: string }) =>
			state.rows.find((r) => r.id === id),
		update: async (a: { id: string; data: Row }) => {
			state.updates.push({ id: a.id, data: a.data });
			return {};
		},
		create: async () => ({}),
	}),
}));

class Exit extends Error {}

/** Runs the curate pass once and returns what it printed. */
async function curate(rows: Row[], execute: boolean): Promise<string[]> {
	state.rows = rows;
	state.updates = [];
	const lines: string[] = [];
	const argv = process.argv;
	process.argv = execute ? [...argv, "--execute"] : [...argv];
	vi.spyOn(console, "log").mockImplementation((...a) => {
		lines.push(a.join(" "));
	});
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.stubGlobal("fetch", async () => new Response("", { status: 200 }));
	let finish: () => void = () => {};
	const exited = new Promise<void>((r) => {
		finish = r;
	});
	let calls = 0;
	vi.spyOn(process, "exit").mockImplementation(() => {
		// The first exit ends the pass; main().catch calls exit again.
		if (calls++ === 0) {
			finish();
			throw new Exit();
		}
		return undefined as never;
	});
	vi.resetModules();
	try {
		await import("../../../scripts/data/curate-projects");
		await exited;
	} finally {
		process.argv = argv;
	}
	return lines;
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("curate-projects writes lifecycle.wasLive through statusFixWasLive", () => {
	it("the from-guard branch clears a launch a corrected Live label wrote", async () => {
		const lines = await curate(
			[
				{
					id: "n",
					slug: "noether",
					status: "Pre-Release",
					lifecycle: { wasLive: true, note: STATUS_FIX.noether.note },
				},
			],
			false,
		);
		expect(lines).toContain(
			"  noether: already Pre-Release — wasLive cleared (Pre-Release as of 2026-08-25: no record of a launch)",
		);
		expect(state.updates).toEqual([]);
	});

	it("a stamp already in sync still writes the entry's verdict", async () => {
		// chaincred's entry is an Inactive to Inactive stamp: every other field
		// matched, so the pass skipped the row and its wasLive override never
		// reached it.
		const fix = STATUS_FIX.chaincred;
		const row = {
			id: "c",
			slug: "chaincred",
			status: "Inactive",
			statusAsOf: fix.asOf,
			statusSourceUrl: fix.sourceUrl,
			statusBasis: fix.basis,
			lifecycle: { wasLive: true, note: "stored" },
		};
		const lines = await curate([row], false);
		expect(lines).toContain(
			"  chaincred: stamp in sync; wasLive cleared (Inactive as of 2026-09-14: no record of a launch)",
		);
		await curate([row], true);
		const w = state.updates.find((u) => u.id === "c");
		expect(w?.data.lifecycle).toEqual({ wasLive: false, note: "stored" });
		expect(w?.data.status).toBeUndefined();
	});

	it("a basis hold still writes the entry's wasLive verdict", async () => {
		// A stamp with a weak basis is held when the row carries a strong one a
		// lane earned. The hold keeps the status provenance; it must not swallow
		// the entry's launch verdict too.
		vi.doMock("../../../scripts/data/curation-maps", async (orig) => {
			const m =
				await orig<typeof import("../../../scripts/data/curation-maps")>();
			return {
				...m,
				STATUS_FIX: {
					...m.STATUS_FIX,
					"zz-held": {
						from: "Inactive",
						to: "Inactive",
						basis: "site-liveness",
						asOf: "2026-11-12",
						wasLive: false,
					},
				},
			};
		});
		const row = {
			id: "h",
			slug: "zz-held",
			status: "Inactive",
			statusBasis: "human-verified",
			lifecycle: { wasLive: true, note: "stored" },
		};
		try {
			const lines = await curate([row], false);
			expect(lines).toContain(
				"  zz-held: keeps human-verified (basis hold); wasLive cleared (Inactive as of 2026-11-12: no record of a launch)",
			);
			await curate([row], true);
			const w = state.updates.find((u) => u.id === "h");
			expect(w?.data.lifecycle).toEqual({ wasLive: false, note: "stored" });
			expect(w?.data.statusBasis).toBeUndefined();
		} finally {
			vi.doUnmock("../../../scripts/data/curation-maps");
		}
	});

	it("the move branch writes the entry's verdict with the status", async () => {
		await curate(
			[
				{
					id: "n",
					slug: "noether",
					status: "Live",
					lifecycle: { wasLive: true, note: null },
				},
			],
			true,
		);
		const w = state.updates.find((u) => u.id === "n");
		expect(w?.data.status).toBe("Pre-Release");
		expect(w?.data.lifecycle?.wasLive).toBe(false);
	});
});
