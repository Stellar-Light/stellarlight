import { describe, expect, it } from "vitest";
import {
	isLaunched,
	isObservedActive,
	lifecycleMetrics,
	type SnapshotRow,
	scfEra,
} from "../lifecycle-metrics";

const row = (over: Partial<SnapshotRow>): SnapshotRow => ({
	slug: "p",
	status: "Live",
	basis: "site-liveness",
	asOf: null,
	wasLive: null,
	lastActivity: null,
	scf: false,
	scfRounds: [],
	network: null,
	networkBasis: null,
	category: null,
	repos: 0,
	listed: null,
	...over,
});

describe("launched and alive definitions", () => {
	it("launched = live now, or inactive that was live; development is not launched", () => {
		expect(isLaunched(row({ status: "Live" }))).toBe(true);
		expect(isLaunched(row({ status: "Inactive", wasLive: true }))).toBe(true);
		expect(isLaunched(row({ status: "Inactive", wasLive: false }))).toBe(false);
		expect(isLaunched(row({ status: "Development" }))).toBe(false);
	});
	it("observed active = a commit within 180 days, or mainnet seen on chain", () => {
		const d = "2026-10-02";
		expect(isObservedActive(row({ lastActivity: "2026-05-01" }), d)).toBe(true);
		expect(isObservedActive(row({ lastActivity: "2026-01-01" }), d)).toBe(
			false,
		);
		expect(
			isObservedActive(
				row({ network: "mainnet", networkBasis: "onchain-activity" }),
				d,
			),
		).toBe(true);
		expect(isObservedActive(row({}), d)).toBe(false);
	});
	it("scf eras", () => {
		expect(scfEra(3)).toBe("rounds 1-15");
		expect(scfEra(30)).toBe("rounds 16-30");
		expect(scfEra(44)).toBe("rounds 31-45");
		expect(scfEra(undefined)).toBe("round unknown");
	});
});

describe("lifecycleMetrics", () => {
	const day0 = {
		date: "2026-10-02",
		projects: [
			row({
				slug: "a",
				scf: true,
				scfRounds: [20],
				basis: "repo-activity",
				lastActivity: "2026-09-01",
			}),
			row({ slug: "b", scf: true, scfRounds: [40], basis: "site-liveness" }),
			row({
				slug: "c",
				status: "Inactive",
				wasLive: true,
				scf: true,
				scfRounds: [5],
			}),
			row({ slug: "d", status: "Development", listed: "2026-03-01" }),
			row({
				slug: "e",
				network: "mainnet",
				networkBasis: "onchain-activity",
				listed: "2025-06-01",
			}),
			row({ slug: "f", scf: true, status: "Development" }),
		],
	};
	it("counts groups and cohorts from the latest snapshot", () => {
		const r = lifecycleMetrics([day0]);
		expect(r.groups.all).toEqual({
			listed: 6,
			launched: 4,
			markedLive: 3,
			liveOnStrongEvidence: 1,
			observedActive: 2,
			noActivityData: 2,
		});
		expect(r.groups.scf.listed).toBe(4);
		expect(r.groups.nonScf.launched).toBe(1);
		expect(r.cohorts.scfByFirstRound.map((c) => c.cohort)).toEqual([
			"rounds 1-15",
			"rounds 16-30",
			"rounds 31-45",
			"round unknown",
		]);
		expect(r.cohorts.nonScfByListedYear.map((c) => c.cohort)).toEqual([
			"2025",
			"2026",
		]);
		expect(r.survival.availableFrom).toBe("2027-03-31");
		expect(r.survival.readings).toEqual([]);
	});
	it("tracks changes since the first snapshot and survival after the window", () => {
		const day180 = {
			date: "2027-03-31",
			projects: [
				row({
					slug: "a",
					scf: true,
					scfRounds: [20],
					basis: "repo-activity",
					lastActivity: "2027-03-01",
				}),
				row({
					slug: "b",
					status: "Inactive",
					wasLive: true,
					scf: true,
					scfRounds: [40],
				}),
				row({ slug: "c", status: "Live", scf: true, scfRounds: [5] }),
				row({ slug: "d", status: "Live", listed: "2026-03-01" }),
			],
		};
		const r = lifecycleMetrics([day180, day0]);
		expect(r.latestSnapshot).toBe("2027-03-31");
		expect(r.changes.newlyInactive).toEqual(["b"]);
		expect(r.changes.revived).toEqual(["c"]);
		expect(r.changes.newlyLaunched).toEqual(["d"]);
		const live = r.survival.readings.find(
			(x) => x.group === "all" && x.definition === "markedLive",
		);
		// a, b, e live at day 0; a still live; b went inactive; e left the directory
		expect(live).toMatchObject({ aliveAtStart: 3, stillAlive: 1, days: 180 });
	});
});
