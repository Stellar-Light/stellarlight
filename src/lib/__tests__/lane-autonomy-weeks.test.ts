import { describe, expect, it } from "vitest";
import {
	interventionFreeWeeks,
	isoWeek,
	type LaneRun,
} from "../../../scripts/check-lane-autonomy";

/**
 * Fixtures for the autonomy counter (QUALITY.md §3), the number that decides
 * whether a production-mutating lane is eligible to run its execute without a
 * human. Every case below is a way the counter was, or could be, generous:
 *
 *  - a green run whose write step was SKIPPED (the backfill-knowledge-notes
 *    nightly: checkout, install, skip, report success, move nothing);
 *  - a run a HUMAN dispatched, which is a person operating the lane, not the
 *    lane operating itself;
 *  - four good weeks that are not four CONSECUTIVE weeks;
 *  - a logged intervention, which restarts the clock;
 *  - a run on the same DAY as the intervention, which ran alongside the
 *    correction and is not evidence it held.
 *
 * Timestamps are built by stepping back whole weeks from a fixed `now`, so the
 * fixtures assert on ISO-week arithmetic rather than on hand-copied week
 * numbers that would rot.
 */
const NOW = Date.parse("2026-09-05T12:00:00Z");
const WEEK = 7 * 86_400_000;

/** A run `back` weeks ago, unattended and successful unless told otherwise. */
const run = (back: number, over: Partial<LaneRun> = {}): LaneRun => ({
	at: new Date(NOW - back * WEEK).toISOString(),
	event: "schedule",
	executeStepConclusion: "success",
	...over,
});

describe("interventionFreeWeeks", () => {
	it("counts consecutive unattended executes up to the last COMPLETE week", () => {
		// The current week is partial by definition and is never required: at
		// 04:22 on a Monday every lane would otherwise read 0. Runs in weeks
		// 1..4 are four complete weeks; the week-0 run is not needed.
		const runs = [1, 2, 3, 4].map((b) => run(b));
		expect(interventionFreeWeeks(runs, [], NOW)).toBe(4);
	});

	it("does not need a run in the partial current week", () => {
		const runs = [1, 2].map((b) => run(b));
		expect(interventionFreeWeeks(runs, [], NOW)).toBe(2);
	});

	it("earns nothing when the write step was skipped", () => {
		const runs = [1, 2, 3, 4].map((b) =>
			run(b, { executeStepConclusion: "skipped" }),
		);
		expect(interventionFreeWeeks(runs, [], NOW)).toBe(0);
	});

	it("earns nothing from an unclassifiable run", () => {
		const runs = [1, 2, 3, 4].map((b) =>
			run(b, { executeStepConclusion: null }),
		);
		expect(interventionFreeWeeks(runs, [], NOW)).toBe(0);
	});

	it("earns nothing from a human-dispatched execute", () => {
		const runs = [1, 2, 3, 4].map((b) =>
			run(b, { event: "workflow_dispatch" }),
		);
		expect(interventionFreeWeeks(runs, [], NOW)).toBe(0);
	});

	it("counts a dispatch GitHub marks as a bot", () => {
		const runs = [1, 2].map((b) =>
			run(b, { event: "workflow_dispatch", actorIsBot: true }),
		);
		expect(interventionFreeWeeks(runs, [], NOW)).toBe(2);
	});

	it("does not reach 4 on four non-consecutive weeks", () => {
		// weeks 1, 2, 4, 5 — the gap at week 3 ends the count at 2.
		const runs = [1, 2, 4, 5].map((b) => run(b));
		expect(interventionFreeWeeks(runs, [], NOW)).toBe(2);
	});

	it("stops at the last complete week when THAT week has no run", () => {
		// A lane that stopped running still stops earning — one week later than
		// before, which is the price of not resetting every Monday.
		const runs = [2, 3, 4, 5].map((b) => run(b));
		expect(interventionFreeWeeks(runs, [], NOW)).toBe(0);
	});

	it("resets on a logged intervention", () => {
		const runs = [1, 2, 3, 4].map((b) => run(b));
		const threeWeeksAgo = new Date(NOW - 3 * WEEK).toISOString().slice(0, 10);
		// The intervention's own week is dirty, so the chain ends before it:
		// weeks 1 and 2 count, week 3 does not.
		expect(interventionFreeWeeks(runs, [{ date: threeWeeksAgo }], NOW)).toBe(2);
	});

	it("does not count an execute on the same day as the intervention", () => {
		const day = new Date(NOW).toISOString().slice(0, 10);
		// One run today, and a correction logged today. Both the dirty-week rule
		// and the end-of-day cutoff have to hold for this to be zero.
		expect(interventionFreeWeeks([run(0)], [{ date: day }], NOW)).toBe(0);
		// A run in the last complete week, corrected today, is also worth nothing:
		// the cutoff is the end of the intervention's day.
		expect(interventionFreeWeeks([run(1)], [{ date: day }], NOW)).toBe(0);
		// …and the cutoff alone: a run earlier the same day, intervention week
		// aside, must not be readable as evidence.
		const earlier: LaneRun = {
			at: `${day}T01:00:00Z`,
			event: "schedule",
			executeStepConclusion: "success",
		};
		expect(interventionFreeWeeks([earlier], [{ date: day }], NOW, 1)).toBe(0);
	});

	it("counts the week after an intervention once the lane runs again", () => {
		const twoWeeksAgo = new Date(NOW - 2 * WEEK).toISOString().slice(0, 10);
		expect(interventionFreeWeeks([run(1)], [{ date: twoWeeksAgo }], NOW)).toBe(
			1,
		);
	});
});

describe("isoWeek", () => {
	it("puts a Sunday and the next Monday in different weeks", () => {
		expect(isoWeek("2026-09-06T23:00:00Z")).not.toBe(
			isoWeek("2026-09-07T01:00:00Z"),
		);
	});
});
