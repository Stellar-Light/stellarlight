/**
 * degradedRead — a failed backend read says so instead of serving a quiet
 * empty page (the 2026-09-14 class: 200 + 0 rows under load).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	DEGRADED_READ_PREFIX,
	degradedRead,
	degradedWarning,
	isDegraded,
	scopedWarning,
	withPartial,
	withReadDeadline,
	withReadTimeout,
} from "../degraded-read";

describe("degradedRead", () => {
	afterEach(() => vi.useRealTimers());

	it("success: hands back the value and no warning", async () => {
		const r = await degradedRead("t", async () => [1, 2], [], 1000);
		expect(r).toEqual({ value: [1, 2], warning: null });
	});

	it("error: hands back the fallback and names op + class, never the message", async () => {
		const boom = new Error("connect ECONNREFUSED cluster0-shard.mongodb.net");
		boom.name = "MongoServerSelectionError";
		const r = await degradedRead(
			"repos candidate fetch",
			async () => {
				throw boom;
			},
			{ docs: [] },
			1000,
		);
		expect(r.value).toEqual({ docs: [] });
		expect(r.warning).toBe(
			"backend read failed: repos candidate fetch — results may be incomplete (MongoServerSelectionError)",
		);
		expect(r.warning).not.toContain("mongodb.net");
	});

	it("error: a synchronous throw inside read() is the same failure", async () => {
		const r = await degradedRead(
			"x",
			() => {
				throw new TypeError("bad shape");
			},
			null,
			1000,
		);
		expect(r.value).toBeNull();
		expect(r.warning).toContain("(TypeError)");
	});

	it("timeout: a read that never settles yields the fallback + a timeout class", async () => {
		vi.useFakeTimers();
		const p = degradedRead(
			"builders roster",
			() => new Promise(() => {}),
			0,
			50,
		);
		await vi.advanceTimersByTimeAsync(50);
		expect(await p).toEqual({
			value: 0,
			warning:
				"backend read failed: builders roster — results may be incomplete (timeout after 50ms)",
		});
	});

	it("timeout: a read that rejects AFTER the timeout is not an unhandled rejection", async () => {
		vi.useFakeTimers();
		let rejectLate: (e: Error) => void = () => {};
		const late = new Promise<never>((_, rej) => {
			rejectLate = rej;
		});
		const p = degradedRead("late", () => late, "fb", 10);
		await vi.advanceTimersByTimeAsync(10);
		expect((await p).value).toBe("fb");
		// vitest fails the file on an unhandled rejection; this must stay quiet
		rejectLate(new Error("late failure"));
		await vi.advanceTimersByTimeAsync(1);
	});

	it("success clears its timer (a fast read leaves nothing pending)", async () => {
		vi.useFakeTimers();
		await degradedRead("fast", async () => 1, 0, 5000);
		expect(vi.getTimerCount()).toBe(0);
	});
});

describe("withReadTimeout", () => {
	afterEach(() => vi.useRealTimers());

	it("passes a settled read through and clears its timer", async () => {
		vi.useFakeTimers();
		expect(await withReadTimeout(Promise.resolve("ok"), 5000)).toBe("ok");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects with the timeout class a catch can name", async () => {
		vi.useFakeTimers();
		const p = withReadTimeout(new Promise<never>(() => {}), 30).catch(
			(e: unknown) => degradedWarning("audits rollup", e),
		);
		await vi.advanceTimersByTimeAsync(30);
		expect(await p).toBe(
			"backend read failed: audits rollup — results may be incomplete (timeout after 30ms)",
		);
	});
});

describe("degradedWarning / isDegraded", () => {
	it("every line carries the prefix the eval keys on", () => {
		for (const cause of [new Error("x"), "no database handle", 42, undefined])
			expect(
				degradedWarning("op", cause).startsWith(DEGRADED_READ_PREFIX),
			).toBe(true);
	});

	it("a string cause is the class; an unknown value is not pretended to be one", () => {
		expect(degradedWarning("db", "no database handle")).toBe(
			"backend read failed: db — results may be incomplete (no database handle)",
		);
		expect(degradedWarning("db", 42)).toContain("(unknown error)");
	});

	it("isDegraded ignores the unknown-param disclosure that shares the channel", () => {
		expect(isDegraded(["Unknown parameter(s) ignored: foo."])).toBe(false);
		expect(isDegraded([])).toBe(false);
		expect(
			isDegraded([
				"Unknown parameter(s) ignored: foo.",
				degradedWarning("x", new Error("y")),
			]),
		).toBe(true);
	});
});

describe("withReadDeadline (2026-10-03: fail early enough to retry)", () => {
	afterEach(() => vi.useRealTimers());

	it("caps a read at what the request budget has left", async () => {
		vi.useFakeTimers();
		const p = withReadDeadline(1_000, () =>
			degradedRead("repos search", () => new Promise(() => {}), null, 4_000),
		);
		await vi.advanceTimersByTimeAsync(1_000);
		expect((await p).warning).toContain("(timeout after 1000ms)");
	});

	it("sequential reads share the budget, with a floor once it is spent", async () => {
		vi.useFakeTimers();
		const never = () => new Promise(() => {});
		const p = withReadDeadline(1_000, async () => {
			const a = await degradedRead("first", never, null, 4_000);
			const b = await degradedRead("second", never, null, 4_000);
			return [a.warning, b.warning];
		});
		await vi.advanceTimersByTimeAsync(1_200);
		const [a, b] = await p;
		expect(a).toContain("(timeout after 1000ms)");
		expect(b).toContain("(timeout after 200ms)");
	});
});

describe("withPartial", () => {
	it("a complete page says so outright, even beside other warnings", () => {
		expect(withPartial({})).toMatchObject({ partial: false, failedReads: [] });
		expect(
			withPartial({ warnings: ["Unknown query parameter(s) ignored: foo"] }),
		).toMatchObject({ partial: false, failedReads: [] });
	});

	it("names every failed read with its class, in order", () => {
		const e = new Error("connection 4 to cluster0.example.net closed");
		e.name = "MongoServerSelectionError";
		const m = withPartial({
			warnings: [
				"Unknown query parameter(s) ignored: foo",
				degradedWarning("repos search", e),
				degradedWarning(
					"research source=sep",
					"503 index read failed; its rows are missing from this page",
				),
			],
		});
		expect(m.partial).toBe(true);
		expect(m.failedReads).toEqual([
			{ read: "repos search", cause: "MongoServerSelectionError" },
			{
				read: "research source=sep",
				cause: "503 index read failed; its rows are missing from this page",
			},
		]);
	});

	// A merged multi-source page prefixed each source's lines with
	// "source=X: ", which hid that source's failed reads from this parser.
	it("a scoped failed read still counts on a merged page", () => {
		const m = withPartial({
			warnings: [
				scopedWarning(
					"source=release",
					degradedWarning("research exact-identifier lookup", "timeout"),
				),
				scopedWarning("source=cap", "limit 40 was clamped to 25"),
			],
		});
		expect(m.partial).toBe(true);
		expect(m.failedReads).toEqual([
			{
				read: "source=release research exact-identifier lookup",
				cause: "timeout",
			},
		]);
		expect(m.warnings[1]).toBe("source=cap: limit 40 was clamped to 25");
	});

	it("a partial page cannot state its total (sls-089)", () => {
		const lost = withPartial({
			warnings: [degradedWarning("projects candidate fetch", "timeout")],
			counts: { returned: 0, total: 0 },
		});
		expect(lost.counts).toEqual({
			returned: 0,
			total: null,
			totalBasis: "partial-read",
		});
		// The controls: a complete empty search keeps its confirmed zero, and an
		// unread-parameter warning is not a failed read.
		for (const warnings of [[], ["Unknown query parameter(s) ignored: foo"]]) {
			expect(
				withPartial({ warnings, counts: { returned: 0, total: 0 } }).counts,
			).toEqual({ returned: 0, total: 0 });
		}
	});

	it("only a read that feeds the count nulls it", () => {
		const page = (read: string) => ({
			warnings: [degradedWarning(read, "timeout")],
			counts: { returned: 20, total: 303 },
		});
		const rowsOnly = (read: string) => !/anchor profiles/.test(read);
		// An enrichment read failed: the page is partial, its total still known.
		const decorated = withPartial(page("projects anchor profiles"), rowsOnly);
		expect(decorated.partial).toBe(true);
		expect(decorated.counts).toEqual({ returned: 20, total: 303 });
		// The candidate read failed: the total is unknown.
		expect(
			withPartial(page("projects candidate fetch"), rowsOnly).counts,
		).toEqual({ returned: 20, total: null, totalBasis: "partial-read" });
		// A total that is already null keeps its own basis.
		expect(
			withPartial({
				warnings: [degradedWarning("research exact-identifier lookup", "x")],
				counts: {
					returned: 5,
					total: null,
					totalBasis: "unbounded-similarity-ranking",
				},
			}).counts,
		).toEqual({
			returned: 5,
			total: null,
			totalBasis: "unbounded-similarity-ranking",
		});
	});
});
