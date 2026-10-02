import { describe, expect, it } from "vitest";
import { instanceMemo } from "../instance-memo";

const tick = () => new Promise((r) => setTimeout(r, 5));

describe("instanceMemo", () => {
	it("shares one in-flight build between concurrent callers", async () => {
		let builds = 0;
		const get = instanceMemo(1000, async () => {
			builds++;
			await tick();
			return builds;
		});
		const [a, b, c] = await Promise.all([get(), get(), get()]);
		expect([a, b, c]).toEqual([1, 1, 1]);
		expect(builds).toBe(1);
	});
	it("rebuilds after the ttl", async () => {
		let builds = 0;
		const get = instanceMemo(1, async () => ++builds);
		expect(await get()).toBe(1);
		await tick();
		expect(await get()).toBe(2);
	});
	it("drops a rejected build so the next caller retries", async () => {
		let builds = 0;
		const get = instanceMemo(1000, async () => {
			builds++;
			if (builds === 1) throw new Error("transient");
			return builds;
		});
		await expect(get()).rejects.toThrow("transient");
		await tick();
		expect(await get()).toBe(2);
	});
});
