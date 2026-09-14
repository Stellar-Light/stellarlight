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
