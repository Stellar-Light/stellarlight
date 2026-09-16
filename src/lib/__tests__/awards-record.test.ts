// @vitest-environment node

/**
 * One ballot per voter, and the FIRST one counts — which makes `history[0]`
 * the single most load-bearing value in the round. Nothing on chain remembers
 * it (a manageData overwrite destroys the value it replaces), so if the write
 * path ever puts the wrong ballot at the front of that trail, the round
 * silently counts the wrong thing and there is no second source to catch it.
 *
 * These pin the two ways that could happen.
 */
import type { Payload } from "payload";
import { describe, expect, it } from "vitest";
import { firstBallotSelections, writeBallotRecord } from "../awards/record";

type Write = { op: string; data: Record<string, unknown> };

function fakePayload(existing: Record<string, unknown> | null) {
	const writes: Write[] = [];
	const payload = {
		find: async () => ({ docs: existing ? [existing] : [] }),
		update: async ({ data }: { data: Record<string, unknown> }) => {
			writes.push({ op: "update", data });
		},
		create: async ({ data }: { data: Record<string, unknown> }) => {
			writes.push({ op: "create", data });
		},
	} as unknown as Payload;
	return { payload, writes };
}

const params = {
	roundId: "r1",
	address: "GA1",
	selections: { impact: ["beans"] },
	txHash: "hash2",
	at: "2026-10-02T00:00:00.000Z",
};

describe("writeBallotRecord", () => {
	it("starts the trail on a first ballot", async () => {
		const { payload, writes } = fakePayload(null);
		expect(await writeBallotRecord(payload, params)).toBe("created");
		expect(writes[0].op).toBe("create");
		expect(writes[0].data.history).toEqual([
			{ txHash: "hash2", selections: { impact: ["beans"] }, at: params.at },
		]);
		expect(writes[0].data.firstSubmittedAt).toBe(params.at);
	});

	it("appends without disturbing history[0]", async () => {
		const { payload, writes } = fakePayload({
			id: 1,
			submissions: 1,
			selections: { impact: ["decaf"] },
			history: [
				{
					txHash: "hash1",
					selections: { impact: ["decaf"] },
					at: "2026-10-01T00:00:00.000Z",
				},
			],
		});
		expect(await writeBallotRecord(payload, params)).toBe("updated");
		const history = writes[0].data.history as Array<{
			selections: unknown;
		}>;
		expect(history).toHaveLength(2);
		expect(firstBallotSelections({ history })).toEqual({ impact: ["decaf"] });
	});

	it("seeds the trail from a row that predates it, rather than promoting the new ballot", async () => {
		// The regression this exists for: appending to an empty trail would make
		// the INCOMING ballot history[0], i.e. would quietly make a revote "the
		// first ballot" and change who the round counts.
		const { payload, writes } = fakePayload({
			id: 1,
			submissions: 1,
			txHash: "hash1",
			selections: { impact: ["decaf"] }, // the real first ballot
			firstSubmittedAt: "2026-10-01T00:00:00.000Z",
			history: [],
		});
		await writeBallotRecord(payload, params);
		const history = writes[0].data.history as Array<{
			txHash: string | null;
			selections: unknown;
			at: string | null;
		}>;
		expect(history).toHaveLength(2);
		expect(history[0]).toEqual({
			txHash: "hash1",
			selections: { impact: ["decaf"] },
			at: "2026-10-01T00:00:00.000Z",
		});
		expect(firstBallotSelections({ history })).toEqual({ impact: ["decaf"] });
	});
});
