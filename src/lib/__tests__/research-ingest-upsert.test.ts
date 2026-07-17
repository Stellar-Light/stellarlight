import { beforeEach, describe, expect, it, vi } from "vitest";

// Voyage embedding — mocked so the test never makes a network/API call.
vi.mock("../embed", () => ({
	embedBatch: vi.fn(async (arr: string[]) => arr.map(() => [0.1, 0.2, 0.3])),
}));

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
