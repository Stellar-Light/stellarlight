import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type DoraHacksHackathon,
	fetchHackathonSubmissions,
	fetchLatestHackathonWinners,
	prizeCategories,
	prizeLabels,
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

describe("an award several placements share is a category, not a prize", () => {
	const row = (
		award: string | null,
		hackathonPlacement: string | null,
		slug = "zk",
	) => ({ award, hackathonPlacement, hackathon: { slug } });
	// Stellar Hacks: Real-World ZK as DoraHacks lists it: one award, five
	// placements, each with its own amount.
	const zk = [
		row("$10,000 XLM Prize", "1st Place - $5,000 in XLM"),
		row("$10,000 XLM Prize", "2nd Place - $2,000 in XLM"),
		row("$10,000 XLM Prize", "3rd Place - $1,250 in XLM"),
		row("$10,000 XLM Prize", "4th Place - $1,000 in XLM"),
		row("$10,000 XLM Prize", "5th Place - $750 in XLM"),
		row(null, null),
	];

	it("serves the award's title as the category of every winner placed in it", () => {
		const categories = prizeCategories(zk);
		expect(zk.map((r) => prizeLabels(categories, r))).toEqual([
			...Array(5).fill({ award: null, awardCategory: "$10,000 XLM Prize" }),
			{ award: null, awardCategory: null },
		]);
	});

	it("keeps an award that is each winner's own prize as the award", () => {
		const rows = [
			// One award per winner, the place in its title (ZK Gaming).
			row("1st Place - $5,000", "Winners", "gaming"),
			row("2nd Place - $2,000", "Winners", "gaming"),
			// One prize given to several winners, each its own (Chile).
			row("Featured Video Pitch $50", "Winners", "chile"),
			row("Featured Video Pitch $50", "Winners", "chile"),
			row("Featured Video Pitch $100", "Winners", "chile"),
			// Two co-winners of one track prize (LATAM).
			row("Track 2 Winner", "Winners", "latam"),
			row("Track 2 Winner", "Winners", "latam"),
			// The only winner its award holds.
			row("Best UX Award", "1st Place", "solo"),
		];
		const categories = prizeCategories(rows);
		expect(categories.size).toBe(0);
		expect(rows.map((r) => prizeLabels(categories, r).award)).toEqual(
			rows.map((r) => r.award),
		);
		expect(
			rows.every((r) => prizeLabels(categories, r).awardCategory === null),
		).toBe(true);
	});

	it("reads each event apart, and a placement's case and outer spaces as the same placement", () => {
		const rows = [
			row("Hackathon Winners", "1st Place", "a"),
			row("Hackathon Winners", "2nd Place", "b"),
			row("Track Winner", "Winners ", "c"),
			row("Track Winner", "winners", "c"),
		];
		expect(prizeCategories(rows).size).toBe(0);
	});

	it("reads rows of one event that carry no event", () => {
		const roster = zk.map(({ award, hackathonPlacement }) => ({
			award,
			hackathonPlacement,
		}));
		const categories = prizeCategories(roster);
		expect(prizeLabels(categories, roster[2])).toEqual({
			award: null,
			awardCategory: "$10,000 XLM Prize",
		});
	});
});
