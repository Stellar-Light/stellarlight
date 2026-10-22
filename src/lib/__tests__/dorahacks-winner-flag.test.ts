import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAllDoraHacksHackathons } from "@/lib/integrations/dorahacks";

afterEach(() => vi.unstubAllGlobals());

describe("DoraHacks' winner_announced flag", () => {
	it("keeps 'not announced' apart from a listing that does not carry the flag", async () => {
		const row = (id: number, uname: string, flag: object) => ({
			id,
			uname,
			title: uname,
			timeline_start: 1,
			timeline_end: 2,
			...flag,
		});
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async (url: string) =>
					new Response(
						JSON.stringify({
							results: url.includes("owner_id=3096")
								? [
										row(1, "announced", { winner_announced: true }),
										row(2, "not-announced", { winner_announced: false }),
										row(3, "no-flag", {}),
									]
								: [],
						}),
						{ headers: { "content-type": "application/json" } },
					),
			),
		);
		const flag = new Map(
			(await fetchAllDoraHacksHackathons()).map((h) => [
				h.uname,
				h.winner_announced,
			]),
		);
		// A missing flag was read as false, and the event page would say
		// DoraHacks reports its winners not announced.
		expect(
			["announced", "not-announced", "no-flag"].map((u) => flag.get(u)),
		).toEqual([true, false, null]);
	});
});
