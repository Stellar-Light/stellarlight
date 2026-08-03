import { beforeEach, describe, expect, it, vi } from "vitest";

// Voyage embedding — mocked so the test never makes a network/API call.
vi.mock("../embed", () => ({
	embedBatch: vi.fn(async (arr: string[]) => arr.map(() => [0.1, 0.2, 0.3])),
}));

import {
	type ExistingChunkRef,
	type ResearchChunk,
	sha256,
	upsertChunks,
} from "../research-ingest";

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

/** Store-backed Payload stub. `find` is NOT optional scaffolding: upsertChunks
 * now reads back every row it claims to write, so a stub without storage would
 * make the read-back unexercised in exactly the tests that cover the writes.
 * `corrupt` simulates the #615 silent drop — the write resolves, the store keeps
 * something else. */
function makePayload(opts: { corrupt?: (data: any) => any } = {}) {
	const updateMany = vi.fn(async () => ({ modifiedCount: 1, matchedCount: 1 }));
	// biome-ignore lint/suspicious/noExplicitAny: minimal Payload stub
	const docs = new Map<string, any>();
	const keep = (id: string, data: any) =>
		docs.set(id, { id, ...(opts.corrupt ? opts.corrupt(data) : data) });
	let n = 0;
	return {
		create: vi.fn(async ({ data }: any) => {
			const id = `new${++n}`;
			keep(id, data);
			return { id };
		}),
		update: vi.fn(async ({ id, data }: any) => {
			keep(String(id), { ...(docs.get(String(id)) ?? {}), ...data });
			return {};
		}),
		find: vi.fn(async ({ where }: any) => ({
			docs: (where?.id?.in ?? [])
				.map((id: string) => docs.get(String(id)))
				.filter(Boolean),
		})),
		db: { collections: { "research-docs": { updateMany } } },
		_docs: docs,
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

/** Lessons class 20/25/32: the ingest counters describe the CALLS, not the
 * data. These assert the read-back turns a silently-dropped write into a
 * visible, counted failure. */
describe("upsertChunks — read-back", () => {
	beforeEach(() => vi.clearAllMocks());

	const withExisting = (c: ResearchChunk, prev: ExistingChunkRef) =>
		new Map([[c.parentDocId, new Map([[c.chunkIndex, prev]])]]);

	it("catches the #615 silent drop on a NEW chunk — update resolved, store kept nothing", async () => {
		// The store drops contentHash, exactly as Payload does for a key with no
		// schema field at that path.
		const payload = makePayload({
			corrupt: ({ contentHash, ...rest }) => rest,
		});
		const c = chunk({ content: "a genuinely new section body here" });
		const stats = await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [c],
			existing: new Map(),
		});
		expect(stats.new).toBe(1); // the call succeeded…
		expect(stats.errors).toBe(0);
		expect(stats.didNotPersist).toBe(1); // …but the data is not there
	});

	it("catches a dropped TITLE on the metadata-drift path — the class-25 row that never self-heals", async () => {
		// This is the path that matters most: content hash is unchanged, so a bad
		// title survives every future refresh if the fix silently fails.
		const payload = makePayload({
			corrupt: (d) => ({ ...d, title: "STALE TITLE" }),
		});
		const c = chunk({ content: "identical body", title: "Corrected Title" });
		const stats = await upsertChunks({
			payload,
			source: "cap",
			chunks: [c],
			existing: withExisting(c, {
				id: OID,
				contentHash: c.contentHash,
				title: "Old Title",
				publishedAt: undefined,
			}),
		});
		expect(stats.updated).toBe(1);
		expect(stats.didNotPersist).toBe(1);
	});

	it("passes when the metadata fix actually lands", async () => {
		const payload = makePayload();
		const c = chunk({ content: "identical body", title: "Corrected Title" });
		const stats = await upsertChunks({
			payload,
			source: "cap",
			chunks: [c],
			existing: withExisting(c, {
				id: OID,
				contentHash: c.contentHash,
				title: "Old Title",
				publishedAt: undefined,
			}),
		});
		expect(stats.updated).toBe(1);
		expect(stats.didNotPersist).toBe(0);
	});

	it("reports a row that vanished after the write", async () => {
		const payload = makePayload();
		payload.find = vi.fn(async () => ({ docs: [] }));
		const c = chunk({ content: "body that should have been stored" });
		const stats = await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [c],
			existing: new Map(),
		});
		expect(stats.didNotPersist).toBe(1);
	});

	it("a read-back that cannot run is an error, never a silent pass", async () => {
		const payload = makePayload();
		payload.find = vi.fn(async () => {
			throw new Error("connection lost");
		});
		const c = chunk({ content: "body of a section here" });
		const stats = await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [c],
			existing: new Map(),
		});
		expect(stats.errors).toBe(1);
		expect(stats.didNotPersist).toBe(0); // unverifiable ≠ verified-bad
	});

	it("counts a partial observedAt re-stamp instead of trusting the bulk op", async () => {
		const payload = makePayload();
		// Bulk op matched fewer rows than we asked it to re-stamp.
		payload.db.collections["research-docs"].updateMany = vi.fn(async () => ({
			matchedCount: 0,
			modifiedCount: 0,
		}));
		const c = chunk({ content: "unchanged body" });
		const stats = await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [c],
			existing: withExisting(c, {
				id: OID,
				contentHash: c.contentHash,
				title: c.title,
				publishedAt: undefined,
			}),
		});
		expect(stats.unchanged).toBe(1);
		expect(stats.didNotPersist).toBe(1);
	});

	it("reports a missing mongoose handle instead of silently skipping the re-stamp", async () => {
		const payload = makePayload();
		payload.db.collections = {}; // no handle → the old code did nothing, quietly
		const c = chunk({ content: "unchanged body" });
		const stats = await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [c],
			existing: withExisting(c, {
				id: OID,
				contentHash: c.contentHash,
				title: c.title,
				publishedAt: undefined,
			}),
		});
		expect(stats.didNotPersist).toBe(1);
	});

	it("does no read-back work when the run wrote nothing", async () => {
		const payload = makePayload();
		const c = chunk({ content: "unchanged body" });
		await upsertChunks({
			payload,
			source: "dev-docs",
			chunks: [c],
			existing: withExisting(c, {
				id: OID,
				contentHash: c.contentHash,
				title: c.title,
				publishedAt: undefined,
			}),
		});
		expect(payload.find).not.toHaveBeenCalled();
	});
});
