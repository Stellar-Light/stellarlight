import { afterEach, describe, expect, it, vi } from "vitest";
import { HACKPROOF_BUILDS } from "@/data/curated-builds";
import { CURATED_HACKATHONS } from "@/data/curated-hackathons";
import { curatedFacts } from "@/lib/curated-import";

const ev = CURATED_HACKATHONS.find((h) => h.uname === "hackmeridian-2026");
const stored = HACKPROOF_BUILDS.map((b) => ({
	...(ev ? curatedFacts(b, ev) : {}),
	id: b.id,
	firstSeenAt: "2026-11-04T00:00:00.000Z",
	lastSeenAt: "2026-11-04T00:00:00.000Z",
}));
let reads: Array<{ select?: Record<string, unknown>; where?: unknown }> = [];
let fail = false;
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(
			async (a: {
				collection: string;
				select?: Record<string, unknown>;
				where?: unknown;
			}) => {
				reads.push(a);
				if (
					fail &&
					a.select &&
					"contracts" in a.select &&
					a.select.contracts === true
				)
					throw new Error("down");
				return { docs: a.collection === "hackathon-builds" ? stored : [] };
			},
		),
	})),
}));
afterEach(() => {
	reads = [];
	fail = false;
	vi.restoreAllMocks();
});

// Audit 2026-11-04: nothing kept the cached builds index under Next's 2 MB
// item limit, past which the cache set fails with no error and every reader
// rebuilds from the store; HackMeridian 2026's contracts added 60 KB of it.
describe("the builds index stays small enough to cache", () => {
	it("leaves contracts out of the cached index, and logs its size", async () => {
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const { buildHackathonBuildsIndex } = await import(
			"@/lib/hackathon-builds"
		);
		const idx = await buildHackathonBuildsIndex();
		expect(idx).toHaveLength(HACKPROOF_BUILDS.length);
		expect(idx.some((b) => "contracts" in b)).toBe(false);
		expect(reads[0]?.select).toMatchObject({ contracts: false });
		const { indexBytes } = await import("@/lib/builds-index-size");
		expect(log).toHaveBeenCalledWith(
			`hackathon builds index: ${idx.length} rows, ${indexBytes(idx)} bytes serialised (red above 1800000)`,
		);
	});

	it("reads a page's contracts from the store, by entry, and says unknown when the read fails", async () => {
		const { readBuildContracts } = await import("@/lib/hackathon-builds");
		const { getPayloadSafe } = await import("@/lib/payload-client");
		const payload = await getPayloadSafe();
		const b = HACKPROOF_BUILDS.find((r) => r.contracts?.length);
		if (!b || !payload) throw new Error("no row with contracts");
		const key = `${b.id}@hackmeridian-2026`;
		const got = await readBuildContracts(payload, [key]);
		expect(got?.get(key)).toEqual(b.contracts);
		expect(reads.at(-1)?.select).toEqual({
			entryKey: true,
			contracts: true,
			contractsCheckedAt: true,
		});
		fail = true;
		expect(await readBuildContracts(payload, [key])).toBeNull();
		// Nothing to read, nothing asked.
		const before = reads.length;
		expect(await readBuildContracts(payload, [])).toEqual(new Map());
		expect(reads.length).toBe(before);
	});

	it("reds above 1.8 MB, and an unread size is could-not-check", async () => {
		const { indexBytes, indexSizeVerdict, INDEX_BYTES_RED } = await import(
			"@/lib/builds-index-size"
		);
		expect(INDEX_BYTES_RED).toBe(1_800_000);
		expect(indexBytes([{ name: "café" }])).toBe(18);
		expect(indexSizeVerdict(1_400_000)).toBe("ok");
		expect(indexSizeVerdict(1_800_001)).toBe("red");
		expect(indexSizeVerdict(null)).toBe("could-not-check");
		expect(indexSizeVerdict(undefined)).toBe("could-not-check");
	});
});
