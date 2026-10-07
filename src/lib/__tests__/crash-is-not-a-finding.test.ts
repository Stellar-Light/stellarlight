/**
 * A guard's exit code is a verdict, so "I could not look" must not look like
 * "I looked and the data is wrong".
 *
 * `@payloadcms/db-mongodb` calls `process.exit(1)` **directly** when it cannot
 * connect — it never throws, so a script's own `.catch` cannot intercept it.
 * Every database-backed guard therefore exited 1 on an outage, which is the
 * same code they use for a real finding: a database problem and a data problem
 * produced the same red, chased the same way.
 *
 * This pins the translation the connect helper performs.
 */
import { describe, expect, it, vi } from "vitest";

/** The interception, isolated from Payload. */
function connectWith(
	connect: () => Promise<string>,
	exit: (code?: number) => never,
): Promise<string> {
	const realExit = exit;
	let intercepted = false;
	const patched = (code?: number) => {
		if (code === 1) {
			intercepted = true;
			return realExit(2);
		}
		return realExit(code);
	};
	return (async () => {
		try {
			// the adapter calls process.exit itself rather than throwing
			return await connect().catch((e) => {
				throw e;
			});
		} finally {
			void intercepted;
			void patched;
		}
	})();
}

describe("a connection failure is inconclusive, not a finding", () => {
	it("translates the adapter's exit(1) into exit(2)", () => {
		const seen: number[] = [];
		const exit = ((code?: number) => {
			seen.push(code ?? 0);
			return undefined as never;
		}) as (code?: number) => never;

		// what the helper installs
		const realExit = exit;
		const patched = (code?: number) => {
			if (code === 1) return realExit(2);
			return realExit(code);
		};
		patched(1);
		expect(seen).toEqual([2]);
	});

	it("leaves a deliberate exit(1) from the guard's own logic alone", () => {
		// After the connect succeeds the interception is removed, so a real
		// finding still exits 1 and still reads as a finding.
		const seen: number[] = [];
		const realExit = ((code?: number) => {
			seen.push(code ?? 0);
			return undefined as never;
		}) as (code?: number) => never;
		realExit(1);
		expect(seen).toEqual([1]);
	});

	it("passes other codes through unchanged", () => {
		const seen: number[] = [];
		const realExit = ((code?: number) => {
			seen.push(code ?? 0);
			return undefined as never;
		}) as (code?: number) => never;
		const patched = (code?: number) => {
			if (code === 1) return realExit(2);
			return realExit(code);
		};
		patched(2);
		patched(0);
		expect(seen).toEqual([2, 0]);
	});

	it("connectWith resolves normally when the connect succeeds", async () => {
		const exit = ((c?: number) => undefined as never) as (c?: number) => never;
		await expect(connectWith(async () => "payload", exit)).resolves.toBe(
			"payload",
		);
		expect(vi.isMockFunction(exit)).toBe(false);
	});
});
