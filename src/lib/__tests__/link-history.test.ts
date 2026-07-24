/**
 * nextLinkHistory — the escalation that lets `blocked` stay honest.
 *
 * check-links used to file every 5xx as an `error`, i.e. a broken link, on the
 * first run. Class 32 says one unverifiable probe proves nothing — but the
 * reason we couldn't simply reclassify 5xx as "blocked" is that `blocked`
 * never surfaced anywhere, so a permanently sick origin would leave the
 * dashboard forever. These tests pin BOTH halves of the fix:
 *   1. a transient no-verdict run is not a failure and does not escalate;
 *   2. a persistent one does, after UNVERIFIABLE_RUNS_TO_ESCALATE runs.
 */
import { describe, expect, it } from "vitest";
import {
	type LinkHistory,
	type LinkStatus,
	nextLinkHistory,
	UNVERIFIABLE_RUNS_TO_ESCALATE,
} from "../link-history";

const T0 = new Date("2026-07-20T00:00:00.000Z");
const day = (n: number) => new Date(T0.getTime() + n * 86_400_000);

/** Replay a sequence of daily run outcomes, one per day, from a clean slate. */
function replay(statuses: LinkStatus[]) {
	let prev: LinkHistory | undefined;
	let out = nextLinkHistory(undefined, "ok", T0);
	statuses.forEach((status, i) => {
		out = nextLinkHistory(prev, status, day(i + 1));
		prev = { status, ...out };
	});
	return out;
}

describe("unverifiable streak", () => {
	it("does not escalate a one-off no-verdict run", () => {
		const h = replay(["blocked"]);
		expect(h.consecutiveUnverifiable).toBe(1);
		expect(h.needsReview).toBe(false);
		// and it is NOT counted as a failure
		expect(h.consecutiveFailures).toBe(0);
	});

	it("escalates once the streak reaches the threshold", () => {
		const below = replay(
			Array(UNVERIFIABLE_RUNS_TO_ESCALATE - 1).fill("blocked"),
		);
		expect(below.needsReview).toBe(false);

		const at = replay(Array(UNVERIFIABLE_RUNS_TO_ESCALATE).fill("blocked"));
		expect(at.consecutiveUnverifiable).toBe(UNVERIFIABLE_RUNS_TO_ESCALATE);
		expect(at.needsReview).toBe(true);
		// still never a "failure" — the two histories stay independent
		expect(at.consecutiveFailures).toBe(0);
	});

	it("keeps firstUnverifiableAt pinned to the START of the streak", () => {
		const h = replay(["blocked", "blocked", "blocked"]);
		expect(h.firstUnverifiableAt).toBe(day(1).toISOString());
	});

	it("clears the streak and the flag as soon as a run reaches a verdict", () => {
		for (const verdict of ["ok", "redirect", "error"] as const) {
			const h = replay(["blocked", "blocked", "blocked", "blocked", verdict]);
			expect(h.consecutiveUnverifiable).toBe(0);
			expect(h.needsReview).toBe(false);
			expect(h.firstUnverifiableAt).toBeNull();
		}
	});

	it("restarts the streak after a recovery — no carry-over", () => {
		const h = replay(["blocked", "blocked", "ok", "blocked"]);
		expect(h.consecutiveUnverifiable).toBe(1);
		expect(h.needsReview).toBe(false);
		expect(h.firstUnverifiableAt).toBe(day(4).toISOString());
	});
});

describe("failure streak (proven-broken, unchanged behaviour)", () => {
	it("counts an error on the first run", () => {
		const h = replay(["error"]);
		expect(h.consecutiveFailures).toBe(1);
		expect(h.firstFailedAt).toBe(day(1).toISOString());
	});

	it("accumulates across consecutive errors and pins firstFailedAt", () => {
		const h = replay(["error", "error", "error"]);
		expect(h.consecutiveFailures).toBe(3);
		expect(h.firstFailedAt).toBe(day(1).toISOString());
	});

	it("resets on recovery and records lastSuccessAt", () => {
		const h = replay(["error", "error", "ok"]);
		expect(h.consecutiveFailures).toBe(0);
		expect(h.firstFailedAt).toBeNull();
		expect(h.lastSuccessAt).toBe(day(3).toISOString());
	});

	it("a no-verdict run does not extend an existing failure streak", () => {
		// The regression this whole change is about: a 503 landing on a URL that
		// was genuinely 404ing must not read as "still broken, day 3".
		const h = replay(["error", "error", "blocked"]);
		expect(h.consecutiveFailures).toBe(0);
		expect(h.consecutiveUnverifiable).toBe(1);
	});

	it("remembers lastSuccessAt through later bad runs", () => {
		const h = replay(["ok", "blocked", "error"]);
		expect(h.lastSuccessAt).toBe(day(1).toISOString());
	});
});
