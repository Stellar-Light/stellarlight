// @vitest-environment node

/**
 * The Mongo adapter exits the process when it cannot connect. On a serverless
 * function that is a dead instance and a bare 500 for every route on it. The
 * client traps that exit into a rejection so the retry and the 503 paths run.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const getPayload = vi.fn();
vi.mock("payload", () => ({
	getPayload: (...a: unknown[]) => getPayload(...a),
}));
vi.mock("@/payload.config", () => ({ default: Promise.resolve({}) }));

const { getPayloadSafe } = await import("../payload-client");

afterEach(() => getPayload.mockReset());

describe("getPayloadSafe", () => {
	it("turns the adapter's process.exit(1) into null, twice, and restores exit", async () => {
		const realExit = process.exit;
		getPayload.mockImplementation(async () => {
			process.exit(1); // what @payloadcms/db-mongodb does on a failed connect
		});
		await expect(getPayloadSafe()).resolves.toBeNull();
		expect(getPayload).toHaveBeenCalledTimes(2);
		expect(process.exit).toBe(realExit);
	});

	it("returns the instance when the retry succeeds", async () => {
		getPayload
			.mockImplementationOnce(async () => {
				process.exit(1);
			})
			.mockResolvedValueOnce({ ok: "payload" });
		await expect(getPayloadSafe()).resolves.toEqual({ ok: "payload" });
	});
});
