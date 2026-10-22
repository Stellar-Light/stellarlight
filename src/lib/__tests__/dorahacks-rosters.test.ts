import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type DoraHacksHackathon,
	fetchHackathonSubmissions,
	fetchLatestHackathonWinners,
	readEventRosters,
} from "@/lib/integrations/dorahacks";

afterEach(() => vi.unstubAllGlobals());

const event = (id: number, uname: string): DoraHacksHackathon => ({
	id,
	uname,
	title: uname,
	start_time: 1,
	end_time: id,
	bonus_price: 0,
	hackers_count: 0,
	winner_announced: true,
	status: 2,
	source: "dorahacks",
});
const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
/** Each event's roster lists buidls <id>1 and <id>2; `winners` answers the
 * winner-assignments read per event. */
function stubDoraHacks(winners: Record<string, () => Response>) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			const u = new URL(url);
			if (u.pathname.endsWith("/hackathon-winner-assignments"))
				return winners[u.searchParams.get("hackathon") ?? ""]();
			const id = /\/hackathons\/(\d+)\/buidls/.exec(u.pathname)?.[1];
			return json({
				count: 2,
				next: null,
				results: [1, 2].map((n) => ({
					buidl: { id: Number(`${id}${n}`), name: `b${id}${n}` },
				})),
			});
		}),
	);
}
/** buidl <id>1 placed first. */
const placed = (id: number) => () =>
	json({
		award_list: [
			{
				title: "Prize",
				prizes: [{ name: "1st Place", buidls: [id * 10 + 1] }],
			},
		],
	});

describe("the winner-assignments read", () => {
	it("a non-OK answer skips the event: its winners are never read as unplaced", async () => {
		stubDoraHacks({ a: () => json({}, 429), b: placed(2) });
		const { read, failed } = await readEventRosters([
			event(1, "a"),
			event(2, "b"),
		]);
		// The event the sync would have written with every winner unplaced is
		// not read at all, so its stored rows stay as they are.
		expect(failed).toEqual([
			{ uname: "a", error: "DoraHacks winners for a: HTTP 429" },
		]);
		expect(
			read.map(({ event: e, subs }) => [
				e.uname,
				subs.map((s) => [s.id, s.isWinner, s.hackathonPlacement]),
			]),
		).toEqual([
			[
				"b",
				[
					["dorahacks-buidl-21", true, "1st Place"],
					["dorahacks-buidl-22", false, null],
				],
			],
		]);
	});

	it("a 404, a 503 or a body that is not JSON fails the read too", async () => {
		for (const answer of [
			() => json({}, 404),
			() => json({}, 503),
			() => new Response("<html>Human Verification</html>", { status: 200 }),
		]) {
			stubDoraHacks({ a: answer });
			await expect(fetchHackathonSubmissions(event(1, "a"))).rejects.toThrow();
		}
	});

	it("an answer that lists no prizes is a roster with no winners", async () => {
		stubDoraHacks({ a: () => json({ award_list: [] }) });
		const subs = await fetchHackathonSubmissions(event(1, "a"));
		expect(subs.map((s) => s.isWinner)).toEqual([false, false]);
	});

	it("the recent-winners highlight tries the next event when one cannot be read", async () => {
		stubDoraHacks({ newer: () => json({}, 429), older: placed(1) });
		const latest = await fetchLatestHackathonWinners([
			event(2, "newer"),
			event(1, "older"),
		]);
		expect(latest?.hackathonUname).toBe("older");
		expect(latest?.winners.map((w) => w.projectName)).toEqual(["b11"]);
	});
});
