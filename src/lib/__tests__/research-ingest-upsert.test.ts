import { beforeEach, describe, expect, it, vi } from "vitest";

// Voyage embedding — mocked so the test never makes a network/API call.
vi.mock("../embed", () => ({
	embedBatch: vi.fn(async (arr: string[]) => arr.map(() => [0.1, 0.2, 0.3])),
}));

import { embedBatch } from "../embed";
import { type ResearchChunk, sha256, upsertChunks } from "../research-ingest";

// A valid 24-hex ObjectId string so the raw-Mongo re-stamp path can convert it.
const OID = "507f1f77bcf86cd799439011";

function chunk(
	over: Partial<ResearchChunk> & { content: string },
): ResearchChunk {
	return {
		parentDocId: over.parentDocId ?? "p1",
		chunkIndex: over.chunkIndex ?? 0,
		title: over.title ?? "T",
		section: null,
		url: "https://x/y",
		contentHash: sha256(over.content),
		tags: ["dev-docs"],
		...over,
		content: over.content,
	};
}

function makePayload() {
	const updateMany = vi.fn(async () => ({ modifiedCount: 1 }));
	return {
		create: vi.fn(async () => ({ id: "new" })),
		update: vi.fn(async () => ({})),
		db: { collections: { "research-docs": { updateMany } } },
		_updateMany: updateMany,
		// biome-ignore lint/suspicious/noExplicitAny: minimal Payload stub
	} as any;
}

describe("upsertChunks — observedAt universal re-stamp", () => {
	beforeEach(() => vi.clearAllMocks());

	it("re-stamps an UNCHANGED chunk via one bulk updateMany (no re-embed, no per-doc write)", async () => {
		const payload = makePayload();
		const c = chunk({ content: "identical body of the section here" });
		const existing = new Map([
			[
				c.parentDocId,
				new Map([
					[
						c.chunkIndex,
						{
							id: OID,
							contentHash: c.contentHash,
							title: c.title,
							publishedAt: undefined,
						},
					],
				]),
			],
		]);

		const stats = await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [c],
			existing,
		});

		expect(stats.unchanged).toBe(1);
		expect(payload.create).not.toHaveBeenCalled(); // not re-embedded/created
		expect(payload.update).not.toHaveBeenCalled(); // not a per-doc write
		// one bulk op, matching the id, setting observedAt
		expect(payload._updateMany).toHaveBeenCalledTimes(1);
		const [filter, update] = payload._updateMany.mock.calls[0];
		expect(String(filter._id.$in[0])).toBe(OID);
		expect(typeof update.$set.observedAt).toBe("string");
	});

	it("embeds + creates a NEW chunk (and stamps observedAt on it)", async () => {
		const payload = makePayload();
		const c = chunk({ content: "a brand new section not seen before" });
		const stats = await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [c],
			existing: new Map(),
		});

		expect(stats.new).toBe(1);
		expect(payload.create).toHaveBeenCalledTimes(1);
		expect(typeof payload.create.mock.calls[0][0].data.observedAt).toBe(
			"string",
		);
		expect(payload._updateMany).not.toHaveBeenCalled();
	});

	it("title drift on identical content → per-doc metadata update, not the bulk path", async () => {
		const payload = makePayload();
		const c = chunk({ content: "same body", title: "New Title" });
		const existing = new Map([
			[
				c.parentDocId,
				new Map([
					[
						c.chunkIndex,
						{
							id: OID,
							contentHash: c.contentHash,
							title: "Old Title",
							publishedAt: undefined,
						},
					],
				]),
			],
		]);

		const stats = await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [c],
			existing,
		});

		expect(stats.updated).toBe(1);
		expect(payload.update).toHaveBeenCalledTimes(1); // per-doc (carries observedAt)
		expect(typeof payload.update.mock.calls[0][0].data.observedAt).toBe(
			"string",
		);
		expect(payload._updateMany).not.toHaveBeenCalled();
		expect(payload.create).not.toHaveBeenCalled();
	});
});

describe("upsertChunks — dryRun is the refresh lane's Idempotence re-plan", () => {
	beforeEach(() => vi.clearAllMocks());

	it("classifies new / changed / meta-drift / unchanged, prints one plan line, writes nothing", async () => {
		const payload = makePayload();
		const unchanged = chunk({ parentDocId: "u", content: "same body" });
		const meta = chunk({
			parentDocId: "m",
			content: "same body, new title",
			title: "New title",
		});
		const changed = chunk({ parentDocId: "c", content: "a new body" });
		const fresh = chunk({ parentDocId: "n", content: "never seen" });
		const ref = (
			c: ResearchChunk,
			over: Partial<{ contentHash: string; title: string }> = {},
		) => ({
			id: OID,
			contentHash: c.contentHash,
			title: c.title,
			publishedAt: undefined,
			...over,
		});
		const existing = new Map([
			["u", new Map([[0, ref(unchanged)]])],
			["m", new Map([[0, ref(meta, { title: "Old title" })]])],
			["c", new Map([[0, ref(changed, { contentHash: sha256("old body") })]])],
		]);
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		const stats = await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [unchanged, meta, changed, fresh],
			existing,
			dryRun: true,
		});
		const lines = log.mock.calls.map((c) => String(c[0]));
		log.mockRestore();
		expect(stats).toMatchObject({
			new: 1,
			updated: 2,
			unchanged: 1,
			errors: 0,
		});
		// the plan is a claim about the DB, not a write to it
		expect(payload.create).not.toHaveBeenCalled();
		expect(payload.update).not.toHaveBeenCalled();
		expect(payload._updateMany).not.toHaveBeenCalled();
		expect(embedBatch).not.toHaveBeenCalled();
		const line = lines.find((l) => l.startsWith("replan: "));
		expect(line).toBe(
			"replan: writes=3 new=1 updated=2 (meta-only 1) unchanged=1 errors=0",
		);
	});

	it("an execute pass ends on the same line under `wrote:` so the two can be compared", async () => {
		const payload = makePayload();
		const fresh = chunk({ parentDocId: "n", content: "never seen" });
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [fresh],
			existing: new Map(),
		});
		const lines = log.mock.calls.map((c) => String(c[0]));
		log.mockRestore();
		expect(payload.create).toHaveBeenCalledTimes(1);
		const line = lines.find((l) => l.startsWith("wrote: "));
		expect(line).toBe(
			"wrote: writes=1 new=1 updated=0 (meta-only 0) unchanged=0 errors=0",
		);
	});
});
