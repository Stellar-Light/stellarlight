import { describe, expect, it } from "vitest";
import {
	type Finding,
	findingId,
	STALE_DAYS,
	summarizeLedger,
	upsertFindings,
} from "../improvement-ledger";

const iso = (daysAgo: number) =>
	new Date(Date.now() - daysAgo * 86_400_000).toISOString();

function f(over: Partial<Finding> & { id: string; source: string }): Finding {
	return {
		surface: "retrieval",
		probe: over.id,
		failureMode: "x",
		severity: "medium",
		firstSeen: iso(0),
		lastSeen: iso(0),
		status: "open",
		...over,
	};
}

describe("findingId — stable, readable dedupe key", () => {
	it("is deterministic and source-scoped", () => {
		expect(findingId("golden-eval", "is idOS live?")).toBe(
			"golden-eval:is-idos-live",
		);
		// same probe, different detector → different id (never collide)
		expect(findingId("engine-a-recall", "is idOS live?")).not.toBe(
			findingId("golden-eval", "is idOS live?"),
		);
	});
});

describe("upsertFindings — the lifecycle", () => {
	const now = new Date().toISOString();

	it("adds a genuinely new finding as open, stamped now", () => {
		const out = upsertFindings([], [f({ id: "a", source: "s1" })], ["s1"], now);
		expect(out).toHaveLength(1);
		expect(out[0].status).toBe("open");
		expect(out[0].firstSeen).toBe(now);
	});

	it("keeps a still-present finding and bumps lastSeen (preserves firstSeen)", () => {
		const prior = [f({ id: "a", source: "s1", firstSeen: iso(10) })];
		const out = upsertFindings(prior, [f({ id: "a", source: "s1" })], ["s1"], now);
		expect(out).toHaveLength(1);
		expect(out[0].firstSeen).toBe(iso(10)); // preserved
		expect(out[0].lastSeen).toBe(now); // bumped
	});

	it("auto-clears a prior open finding its detector stopped reporting", () => {
		const prior = [f({ id: "a", source: "s1", status: "open" })];
		// s1 ran this round but did NOT re-raise `a` → soft-fixed
		const out = upsertFindings(prior, [], ["s1"], now);
		expect(out[0].status).toBe("cleared");
		expect(out[0].clearedAt).toBe(now);
	});

	it("NEVER auto-clears a manual status (in-wave/fixed/verified)", () => {
		const prior = [f({ id: "a", source: "s1", status: "in-wave" })];
		const out = upsertFindings(prior, [], ["s1"], now);
		expect(out[0].status).toBe("in-wave"); // untouched
	});

	it("does NOT clear findings from a detector that didn't run this round", () => {
		const prior = [f({ id: "a", source: "s2", status: "open" })];
		// only s1 ran; s2's open finding must stay open (we have no signal on it)
		const out = upsertFindings(prior, [], ["s1"], now);
		expect(out[0].status).toBe("open");
	});
});

describe("summarizeLedger — the /quality numbers", () => {
	const now = Date.now();

	it("counts open vs closed and the closing rate", () => {
		const findings = [
			f({ id: "a", source: "s", status: "open" }),
			f({ id: "b", source: "s", status: "verified" }),
			f({ id: "c", source: "s", status: "cleared" }),
		];
		const s = summarizeLedger(findings, now);
		expect(s.total).toBe(3);
		expect(s.open).toBe(1);
		expect(s.closed).toBe(2);
		expect(s.closingRate).toBeCloseTo(0.67, 1);
	});

	it("flags a HIGH-severity finding neglected past STALE_DAYS (the red line)", () => {
		const fresh = f({ id: "a", source: "s", severity: "high", firstSeen: iso(1) });
		const stale = f({
			id: "b",
			source: "s",
			severity: "high",
			firstSeen: iso(STALE_DAYS + 5),
		});
		const s = summarizeLedger([fresh, stale], now);
		expect(s.highOpen).toBe(2);
		expect(s.staleHighOpen).toBe(1); // only the >30d one
	});

	it("breaks open findings down per surface, weakest first", () => {
		const findings = [
			f({ id: "1", source: "s", surface: "retrieval" }),
			f({ id: "2", source: "s", surface: "retrieval" }),
			f({ id: "3", source: "s", surface: "scf" }),
		];
		const s = summarizeLedger(findings, now);
		expect(s.bySurface[0]).toEqual({ surface: "retrieval", open: 2, total: 2 });
		expect(s.bySurface.find((x) => x.surface === "scf")?.open).toBe(1);
	});
});
