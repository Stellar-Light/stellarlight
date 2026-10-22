import { describe, expect, it, vi } from "vitest";
import {
	vectorBuildScores,
	winnersOnlyFilter,
} from "@/lib/hackathon-build-semantic";

// The raw collection behind $vectorSearch: keeps the pipeline it was sent
// and answers with `rows`, best first.
let pipeline: Array<{ $vectorSearch?: { filter?: unknown } }> = [];
let rows: Array<{
	buildId: string;
	hackathonSlug: string;
	isWinner: boolean;
	score: number;
}> = [];
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		db: {
			connection: {
				db: {
					collection: () => ({
						aggregate: (p: typeof pipeline) => {
							pipeline = p;
							return { toArray: async () => rows };
						},
						findOne: async () => null,
					}),
				},
			},
		},
	})),
}));
const filterSent = () => pipeline[0]?.$vectorSearch?.filter;

describe("winners-only search by meaning", () => {
	it("lets the events the overlay names through the winners filter", () => {
		expect(winnersOnlyFilter([])).toEqual({ isWinner: true });
		expect(winnersOnlyFilter(["alebrije2026"])).toEqual({
			$or: [{ isWinner: true }, { hackathonSlug: { $in: ["alebrije2026"] } }],
		});
	});

	it("keeps DoraHacks' winners and the overlay's named winners, never the event's other rows", async () => {
		rows = [
			// Hack+ Alebrije: Nomilar is not named; GIBBOR is
			// (src/data/winner-overlay.ts).
			{
				buildId: "dorahacks-buidl-41339",
				hackathonSlug: "alebrije2026",
				isWinner: false,
				score: 0.9,
			},
			{
				buildId: "dorahacks-buidl-41502",
				hackathonSlug: "alebrije2026",
				isWinner: false,
				score: 0.85,
			},
			{
				buildId: "dorahacks-buidl-42585",
				hackathonSlug: "stellar-agents-x402-stripe-mpp",
				isWinner: true,
				score: 0.8,
			},
		];
		const winners = await vectorBuildScores([0.1, 0.2], {
			winnersOnly: true,
			limit: 300,
		});
		expect(filterSent()).toEqual({
			hiddenUpstream: { $ne: true },
			$or: [{ isWinner: true }, { hackathonSlug: { $in: ["alebrije2026"] } }],
		});
		expect([...(winners ?? new Map()).keys()]).toEqual([
			"dorahacks-buidl-41502",
			"dorahacks-buidl-42585",
		]);
		// Without winnersOnly the filter and the rows are as before.
		const all = await vectorBuildScores([0.1, 0.2], { limit: 300 });
		expect(filterSent()).toEqual({ hiddenUpstream: { $ne: true } });
		expect(all?.size).toBe(3);
	});
});
