/**
 * The daily media file probe (scripts/check-media-files.ts): its verdict,
 * which rows it reads as pointing at a media record, one run's fold and the
 * two readers. Each failure the probe can meet is pinned here as a verdict or
 * as an explicit could-not-check; only then may it report a file as missing
 * (QUALITY.md, instrument tiers).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	foldMediaRun,
	getMediaStatus,
	MEDIA_SOURCES,
	type MediaDoc,
	type MediaRef,
	mediaFileVerdict,
	mediaRefsIn,
	readAllRows,
} from "../media-files";

describe("the served-file verdict", () => {
	it("takes its answer from the GET status alone", () => {
		expect(mediaFileVerdict(200)).toBe("hit");
		expect(mediaFileVerdict(404)).toBe("missing");
		expect(mediaFileVerdict.length).toBe(1);
	});

	it("gives no verdict for anything else", () => {
		for (const s of [301, 304, 401, 403, 429, 500, 502, 503, 504, null])
			expect(mediaFileVerdict(s)).toBe("unchecked");
	});
});

describe("which rows point at a media record", () => {
	const ids = new Set(["m1", "m2", "m3"]);

	it("reads an upload field, a group and rich text off one row", () => {
		const refs = mediaRefsIn(
			"blog",
			{
				id: "m1", // a row id that happens to equal a media id is not a ref
				slug: "post",
				featuredImage: "m1",
				content: {
					root: { children: [{ type: "upload", value: "m2" }, { text: "m9" }] },
				},
				meta: { image: "m3" },
				title: "m2 is only an id inside a relation, but a string is a string",
			},
			ids,
			["featuredImage"],
		);
		expect(refs.map((r) => `${r.ref} -> ${r.mediaId}`).sort()).toEqual([
			"blog/post content -> m2",
			"blog/post featuredImage -> m1",
			"blog/post meta -> m3",
		]);
	});

	it("keeps a pointer at a record the media list does not hold", () => {
		const refs = mediaRefsIn(
			"projects",
			{ id: "p1", slug: "huma", status: "Live", logo: "deleted-id" },
			ids,
			["logo"],
		);
		expect(refs).toEqual([
			{
				ref: "projects/huma logo",
				collection: "projects",
				slug: "huma",
				field: "logo",
				rowStatus: "Live",
				mediaId: "deleted-id",
			},
		]);
	});

	it("covers every upload field and every rich text collection", () => {
		// A new upload field, or rich text in a new collection, must join
		// MEDIA_SOURCES or the detector would not read it.
		const found: Record<string, string[]> = {};
		for (const dir of ["src/collections", "src/globals"])
			for (const f of readdirSync(dir).filter((n) => n.endsWith(".ts"))) {
				const src = readFileSync(join(dir, f), "utf8");
				const fields = [
					...src.matchAll(
						/name:\s*"(\w+)",\s*type:\s*"upload",\s*relationTo:\s*"media"/g,
					),
				].map((m) => m[1]);
				expect(
					(src.match(/relationTo:\s*"media"/g) ?? []).length,
					`${f}: a media relation this test's pattern does not read`,
				).toBe(fields.length);
				if (!fields.length && !/type:\s*"richText"/.test(src)) continue;
				const slug = src.match(/slug:\s*"([\w-]+)"/)?.[1] ?? f;
				found[slug] = fields;
			}
		expect(found).toEqual(
			Object.fromEntries(
				MEDIA_SOURCES.map((s) => [s.collection, s.uploadFields]),
			),
		);
	});
});

describe("one run's fold", () => {
	const doc = (id: string): MediaDoc => ({
		id,
		filename: `${id}.png`,
		url: `/api/media/file/${id}.png`,
		createdAt: "2026-08-03T19:20:50.630Z",
	});
	const ref = (slug: string, mediaId: string): MediaRef => ({
		ref: `projects/${slug} logo`,
		collection: "projects",
		slug,
		field: "logo",
		rowStatus: "Live",
		mediaId,
	});
	const docs = ["a", "b", "c", "d"].map(doc);

	it("separates a hit, a checked miss and a file it could not check", () => {
		const run = foldMediaRun({
			refs: [ref("one", "a"), ref("two", "b"), ref("three", "c")],
			docs,
			statusOf: new Map([
				["a", 200],
				["b", 404],
				["c", 503],
				["d", 404],
			]),
		});
		expect(run.blind).toBe(false);
		expect(run.missing.map((m) => [m.ref, m.reason, m.filename])).toEqual([
			["projects/two logo", "file-404", "b.png"],
		]);
		expect(run.unchecked.map((u) => u.ref)).toEqual(["projects/three logo"]);
		// d is missing and no row points at it: listed, not a finding
		expect(run.unreferencedMissing).toEqual(["d.png"]);
		expect(run.tally).toEqual({
			records: 4,
			hit: 1,
			missing: 2,
			unchecked: 1,
			refs: 3,
			refsMissing: 1,
			refsNewlyMissing: 1,
			refsUnchecked: 1,
			unreferencedMissing: 1,
		});
	});

	it("keeps the last run's finding for a file it could not check today", () => {
		const first = foldMediaRun({
			refs: [ref("one", "a"), ref("two", "b")],
			docs,
			statusOf: new Map([
				["a", 200],
				["b", 404],
				["c", 200],
				["d", 200],
			]),
		});
		const second = foldMediaRun({
			refs: [ref("one", "a"), ref("two", "b")],
			docs,
			statusOf: new Map([
				["a", 200],
				["b", null],
				["c", 200],
				["d", 200],
			]),
			prevMissing: first.missing,
		});
		expect(second.missing).toEqual([{ ...first.missing[0], carried: true }]);
		expect(second.unchecked).toEqual([]);
		// known since the last run: the lane goes red only on a new one
		expect(first.tally.refsNewlyMissing).toBe(1);
		expect(second.tally.refsNewlyMissing).toBe(0);
	});

	it("drops a carried finding once the row points at another record", () => {
		const prevMissing = foldMediaRun({
			refs: [ref("two", "b")],
			docs,
			statusOf: new Map([
				["a", 200],
				["b", 404],
			]),
		}).missing;
		const run = foldMediaRun({
			refs: [ref("two", "c")],
			docs,
			statusOf: new Map([
				["a", 200],
				["c", null],
			]),
			prevMissing,
		});
		expect(run.missing).toEqual([]);
		expect(run.unchecked.map((u) => u.mediaId)).toEqual(["c"]);
	});

	it("reports a pointer at a record that is gone", () => {
		const run = foldMediaRun({
			refs: [ref("one", "a"), ref("ghost", "zz")],
			docs,
			statusOf: new Map(docs.map((d) => [d.id, 200])),
		});
		expect(run.missing.map((m) => [m.ref, m.reason, m.filename])).toEqual([
			["projects/ghost logo", "no-media-record", null],
		]);
	});

	it("is blind when no file answered 200: the serving side lost its store", () => {
		const run = foldMediaRun({
			refs: [ref("one", "a")],
			docs,
			statusOf: new Map(docs.map((d) => [d.id, 404])),
		});
		expect(run.blind).toBe(true);
	});

	it("is blind when more than half the files gave no verdict", () => {
		const status = (n: number) =>
			new Map<string, number | null>(
				docs.map((d, i) => [d.id, i < n ? 503 : 200]),
			);
		expect(foldMediaRun({ refs: [], docs, statusOf: status(3) }).blind).toBe(
			true,
		);
		expect(foldMediaRun({ refs: [], docs, statusOf: status(2) }).blind).toBe(
			false,
		);
		// a file with no status recorded at all is unchecked, never a hit
		expect(
			foldMediaRun({ refs: [], docs, statusOf: new Map([["a", 200]]) }).tally
				.unchecked,
		).toBe(3);
	});
});

describe("the prober", () => {
	/** A fetch that answers each call with the next status (or throws). */
	const answers = (...seq: Array<number | "throw">) => {
		const calls: Array<{ url: string; method: string }> = [];
		const impl = (async (url: string, init?: RequestInit) => {
			calls.push({ url, method: init?.method ?? "GET" });
			const a = seq[calls.length - 1];
			if (a === "throw" || a === undefined) throw new Error("socket hang up");
			return new Response(a === 200 ? "bytes" : null, { status: a });
		}) as unknown as typeof fetch;
		return { impl, calls };
	};

	it("asks with GET, once, when the answer is a verdict", async () => {
		for (const status of [200, 404]) {
			const f = answers(status);
			expect(await getMediaStatus("https://x.invalid/a.png", f.impl, 0)).toBe(
				status,
			);
			expect(f.calls).toEqual([
				{ url: "https://x.invalid/a.png", method: "GET" },
			]);
		}
	});

	it("retries once when the first try gave no verdict", async () => {
		expect(await getMediaStatus("u", answers(503, 200).impl, 0)).toBe(200);
		expect(await getMediaStatus("u", answers("throw", 404).impl, 0)).toBe(404);
		// still no verdict: the status it got, or null for a thrown fetch
		expect(await getMediaStatus("u", answers(503, 502).impl, 0)).toBe(502);
		expect(await getMediaStatus("u", answers(429, "throw").impl, 0)).toBeNull();
		const f = answers("throw", "throw", 200);
		expect(await getMediaStatus("u", f.impl, 0)).toBeNull();
		expect(f.calls.length).toBe(2);
	});

	const pages = (...bodies: Array<object | number>) => {
		const urls: string[] = [];
		const impl = (async (url: string) => {
			urls.push(url);
			const b = bodies[urls.length - 1];
			if (typeof b === "number") return new Response(null, { status: b });
			return Response.json(b);
		}) as unknown as typeof fetch;
		return { impl, urls };
	};

	it("reads every page of a list", async () => {
		const f = pages(
			{ docs: [{ id: "1" }, { id: "2" }], hasNextPage: true, totalDocs: 3 },
			{ docs: [{ id: "3" }], hasNextPage: false, totalDocs: 3 },
		);
		const rows = await readAllRows(
			"https://x.invalid",
			"/api/projects?select[logo]=true",
			1,
			f.impl,
		);
		expect(rows?.map((r) => r.id)).toEqual(["1", "2", "3"]);
		expect(f.urls).toEqual([
			"https://x.invalid/api/projects?select[logo]=true&depth=1&limit=200&page=1",
			"https://x.invalid/api/projects?select[logo]=true&depth=1&limit=200&page=2",
		]);
	});

	it("answers null, never a short list, when a list did not answer in full", async () => {
		// a failed page
		expect(
			await readAllRows(
				"b",
				"/api/media",
				0,
				pages({ docs: [{}], hasNextPage: true, totalDocs: 2 }, 503).impl,
			),
		).toBeNull();
		// fewer rows than the total it reports
		expect(
			await readAllRows(
				"b",
				"/api/media",
				0,
				pages({ docs: [{}], hasNextPage: false, totalDocs: 2 }).impl,
			),
		).toBeNull();
		// an empty list that says it is empty is a list
		expect(
			await readAllRows(
				"b",
				"/api/media",
				0,
				pages({ docs: [], hasNextPage: false, totalDocs: 0 }).impl,
			),
		).toEqual([]);
	});
});
