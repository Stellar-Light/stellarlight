import { describe, expect, it } from "vitest";
import {
	applyWaves,
	type Finding,
	findingId,
	isSyntheticQuery,
	STALE_DAYS,
	summarizeLedger,
	upsertFindings,
	type WaveManifest,
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
		// capture once — iso() calls Date.now() each time, so recomputing it in
		// the assertion races the constructor by ~1ms and flakes CI.
		const firstSeen = iso(10);
		const prior = [f({ id: "a", source: "s1", firstSeen })];
		const out = upsertFindings(
			prior,
			[f({ id: "a", source: "s1" })],
			["s1"],
			now,
		);
		expect(out).toHaveLength(1);
		expect(out[0].firstSeen).toBe(firstSeen); // preserved
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

	it("collapses two detected rows with the same id into ONE finding", () => {
		// a detector can emit the same probe on two endpoints (e.g. `strupey` as
		// both a projects-miss and a builders-miss) → identical findingId. Both
		// must collapse to one finding, never double the id in the ledger.
		const dup = f({ id: "engine-d-demand:strupey", source: "engine-d-demand" });
		const out = upsertFindings([], [dup, { ...dup }], ["engine-d-demand"], now);
		expect(out).toHaveLength(1);
	});

	it("heals a pre-existing duplicate id already in prior", () => {
		// an earlier buggy run persisted the id twice; a later run must collapse it
		// back to one (self-healing), whether or not the detector re-raises it.
		const p = f({ id: "e:strupey", source: "e", status: "open" });
		const out = upsertFindings(
			[p, { ...p }],
			[f({ id: "e:strupey", source: "e" })],
			["e"],
			now,
		);
		expect(out).toHaveLength(1);
	});
});

describe("isSyntheticQuery — noise, not demand", () => {
	it("flags synthetic/test/probe queries", () => {
		for (const q of [
			"test",
			"TEST",
			"zzzznonexistentquery12345",
			"zzzzznonexistentxyz123",
			"a",
			"asdf",
		])
			expect(isSyntheticQuery(q)).toBe(true);
	});
	it("keeps ambiguous-but-plausibly-real terms", () => {
		// person handles, token pairs, short project names — real demand, never dropped
		for (const q of ["strupey", "stxlm", "8004", "reflector", "kutana", "rice"])
			expect(isSyntheticQuery(q)).toBe(false);
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
		const fresh = f({
			id: "a",
			source: "s",
			severity: "high",
			firstSeen: iso(1),
		});
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

	it("counts in-wave (work in progress) separately from closed", () => {
		const s = summarizeLedger(
			[
				f({ id: "a", source: "s", status: "in-wave" }),
				f({ id: "b", source: "s", status: "open" }),
			],
			now,
		);
		expect(s.inWave).toBe(1);
		expect(s.open).toBe(2); // in-wave is still open (not yet verified)
		expect(s.closingRate).toBe(0); // nothing verified/cleared
	});
});

describe("applyWaves — waves close the loop (slice 3)", () => {
	const now = new Date().toISOString();
	const wave = (findings: WaveManifest["findings"]): WaveManifest => ({
		wave: "w1",
		date: "2026-07-22",
		lesson: "some-lesson",
		findings,
	});

	it("overlays in-wave / verified and stamps the wave + timestamps + lesson", () => {
		const prior = [f({ id: "a", source: "s", status: "open" })];
		const { findings } = applyWaves(
			prior,
			[wave([{ id: "a", status: "verified", note: "confirmed live" }])],
			new Set(),
			now,
		);
		expect(findings[0].status).toBe("verified");
		expect(findings[0].wave).toBe("w1");
		expect(findings[0].verifiedAt).toBe(now);
		expect(findings[0].fixedAt).toBe(now); // verified implies fixed
		expect(findings[0].lessonRef).toBe("some-lesson");
	});

	it("surfaces wave entries that reference unknown finding-ids (no silent drop)", () => {
		const { unmatched } = applyWaves(
			[f({ id: "a", source: "s" })],
			[wave([{ id: "ghost", status: "fixed" }])],
			new Set(),
			now,
		);
		expect(unmatched).toEqual(["ghost"]);
	});

	it("flags a VERIFIED finding a detector still reports — the fix didn't take", () => {
		const { suspectVerified } = applyWaves(
			[f({ id: "a", source: "s" })],
			[wave([{ id: "a", status: "verified" }])],
			new Set(["a"]), // detector STILL reports `a` this run
			now,
		);
		expect(suspectVerified).toEqual(["a"]);
	});

	it("does not mutate the input findings array", () => {
		const prior = [f({ id: "a", source: "s", status: "open" })];
		applyWaves(prior, [wave([{ id: "a", status: "fixed" }])], new Set(), now);
		expect(prior[0].status).toBe("open"); // original untouched
	});
});
