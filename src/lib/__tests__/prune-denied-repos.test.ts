/**
 * Drives scripts/data/prune-denied-repos.ts with a fake Payload: an execute
 * deletes every row stored under a denied name, held rows included, and
 * reads the names back, failing when a delete did not take.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: fake Payload rows
type Row = Record<string, any>;
const state: { rows: Row[]; deleted: string[]; dropDeletes: boolean } = {
	rows: [],
	deleted: [],
	dropDeletes: false,
};

vi.mock("../../../scripts/load-env", () => ({}));
vi.mock("../../payload.config", () => ({ default: Promise.resolve({}) }));
vi.mock("payload", () => ({
	getPayload: async () => ({
		// biome-ignore lint/suspicious/noExplicitAny: Payload query shape
		find: async ({ where, context, limit }: any) => {
			const ids: string[] | undefined = where?.id?.in;
			const like = String(where?.fullName?.like ?? "").toLowerCase();
			const docs = state.rows.filter(
				(r) =>
					(ids
						? ids.includes(r.id)
						: String(r.fullName).toLowerCase().includes(like)) &&
					(!r.securityHeld || context?.includeSecurityHeld === true),
			);
			return { docs: docs.slice(0, limit) };
		},
		delete: async ({ id }: { id: string }) => {
			state.deleted.push(id);
			if (!state.dropDeletes)
				state.rows = state.rows.filter((r) => r.id !== id);
			return {};
		},
	}),
}));

class Exit extends Error {}

async function prune(rows: Row[], dropDeletes = false) {
	state.rows = rows;
	state.deleted = [];
	state.dropDeletes = dropDeletes;
	const lines: string[] = [];
	const argv = process.argv;
	process.argv = [...argv, "--execute"];
	vi.spyOn(console, "log").mockImplementation((...a) => {
		lines.push(a.join(" "));
	});
	vi.spyOn(console, "error").mockImplementation((...a) => {
		lines.push(a.join(" "));
	});
	let code = -1;
	let finish: () => void = () => {};
	const exited = new Promise<void>((r) => {
		finish = r;
	});
	vi.spyOn(process, "exit").mockImplementation((c) => {
		if (code === -1) {
			code = Number(c ?? 0);
			finish();
			throw new Exit();
		}
		return undefined as never;
	});
	vi.resetModules();
	try {
		await import("../../../scripts/data/prune-denied-repos");
		await exited;
	} finally {
		process.argv = argv;
	}
	return { lines, code };
}

afterEach(() => {
	vi.restoreAllMocks();
});

const ROWS = [
	{ id: "a", fullName: "Moon-Launch/flow" },
	{ id: "b", fullName: "orbit-cdp/hermes", securityHeld: true },
	{ id: "c", fullName: "zenith-protocols/hermes" },
	// Eleven longer names a `like` on Moon-Launch/flow also matches, ahead
	// of the exact one in the store: a 10-row window would miss it.
	...Array.from({ length: 11 }, (_, i) => ({
		id: `x${i}`,
		fullName: `Moon-Launch/flow-${i}`,
	})),
];
// The exact row last, behind its look-alikes.
ROWS.push(ROWS.splice(0, 1)[0]);

describe("prune-denied-repos", () => {
	it("deletes every denied row, held ones too, and reads the names back", async () => {
		const { lines, code } = await prune(ROWS.map((r) => ({ ...r })));
		expect(state.deleted.sort()).toEqual(["a", "b"]);
		expect(state.rows.map((r) => r.id)).toContain("x0");
		expect(code).toBe(0);
		expect(lines.some((l) => l.startsWith("read back: none of the"))).toBe(
			true,
		);
	});

	it("fails when a delete did not take", async () => {
		const { lines, code } = await prune(
			ROWS.map((r) => ({ ...r })),
			true,
		);
		expect(code).toBe(1);
		const left = lines.find((l) =>
			l.startsWith("✗ still indexed after the delete: "),
		);
		expect(left).toContain("moon-launch/flow");
		expect(left).toContain("orbit-cdp/hermes");
	});
});
