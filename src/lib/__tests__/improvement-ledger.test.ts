import { describe, expect, it } from "vitest";
import {
	applyWaves,
	EVIDENCE_GRACE_DAYS,
	type Finding,
	findingId,
	hasFreshEvidence,
	isSyntheticQuery,
	rankFindings,
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

	it("counts open vs closed; the rate counts only EVIDENCE closures", () => {
		const findings = [
			f({ id: "a", source: "s", status: "open" }),
			f({ id: "b", source: "s", status: "verified" }),
			f({ id: "c", source: "s", status: "cleared" }), // silence, no clearedBy
		];
		const s = summarizeLedger(findings, now);
		expect(s.total).toBe(3);
		expect(s.open).toBe(1);
		expect(s.closed).toBe(2); // `closed` still means "not open"
		// …but only the verified one is a closure on evidence. The silence-close
		// is carried apart, never folded in.
		expect(s.closingRate).toBeCloseTo(0.33, 2);
		expect(s.silenceShare).toBeCloseTo(0.33, 2);
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

	it("splits closed exactly: verified + clearedByReprobe + clearedOnSilence", () => {
		const s = summarizeLedger(
			[
				f({ id: "a", source: "s", status: "verified" }),
				f({
					id: "b",
					source: "s",
					status: "cleared",
					clearedBy: "stale-sweep: re-probed live and passing",
				}),
				f({ id: "c", source: "s", status: "cleared" }), // silence, no clearedBy
				f({ id: "d", source: "s", status: "open" }),
			],
			now,
		);
		expect(s.clearedByReprobe).toBe(1);
		expect(s.clearedOnSilence).toBe(1);
		// the invariant: the three closed buckets partition closed, nothing
		// double-counted or dropped
		expect(s.verified + s.clearedByReprobe + s.clearedOnSilence).toBe(s.closed);
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

describe("evidence freshness — 'not re-checked' is not 'still broken'", () => {
	it("treats a missing stamp as NOT fresh — absence of proof is not proof", () => {
		const now = Date.now();
		expect(hasFreshEvidence(f({ id: "a", source: "s" }), now)).toBe(false);
		expect(
			hasFreshEvidence(f({ id: "b", source: "s", evidenceAt: "junk" }), now),
		).toBe(false);
		expect(
			hasFreshEvidence(f({ id: "c", source: "s", evidenceAt: iso(1) }), now),
		).toBe(true);
		expect(
			hasFreshEvidence(
				f({ id: "d", source: "s", evidenceAt: iso(EVIDENCE_GRACE_DAYS + 1) }),
				now,
			),
		).toBe(false);
	});

	it("ranks a confirmed finding above an unconfirmed one of equal severity", () => {
		// The regression this guards: ranking was severity → oldest-first, so a
		// dead detector's findings aged forever and floated to the top of the
		// backlog — presented as most urgent precisely because nobody had looked.
		const now = Date.now();
		const stale = f({
			id: "stale",
			source: "quiet-detector",
			severity: "high",
			firstSeen: iso(40), // older — would have won under the old rule
			evidenceAt: iso(30),
		});
		const confirmed = f({
			id: "confirmed",
			source: "live-detector",
			severity: "high",
			firstSeen: iso(2),
			evidenceAt: iso(1),
		});
		const ranked = rankFindings([stale, confirmed], now);
		expect(ranked[0].id).toBe("confirmed");
		// but the unconfirmed one is DEMOTED, never dropped — only a detector clears
		expect(ranked.map((r) => r.id)).toContain("stale");
	});

	it("still prefers the older finding when both are confirmed", () => {
		const now = Date.now();
		const older = f({
			id: "older",
			source: "s",
			firstSeen: iso(20),
			evidenceAt: iso(1),
		});
		const newer = f({
			id: "newer",
			source: "s",
			firstSeen: iso(3),
			evidenceAt: iso(1),
		});
		expect(rankFindings([newer, older], now)[0].id).toBe("older");
	});

	it("names quiet detectors and counts unconfirmed findings", () => {
		const now = Date.now();
		const s = summarizeLedger(
			[
				f({ id: "1", source: "live", evidenceAt: iso(1) }),
				f({ id: "2", source: "quiet", evidenceAt: iso(30) }),
				f({ id: "3", source: "quiet", evidenceAt: iso(30) }),
				f({ id: "4", source: "unstamped" }),
			],
			now,
		);
		expect(s.unverifiedOpen).toBe(3);
		const names = s.quietSources.map((q) => q.source);
		expect(names).toContain("quiet");
		expect(names).toContain("unstamped");
		expect(names).not.toContain("live");
		expect(s.quietSources.find((q) => q.source === "quiet")?.open).toBe(2);
		// never stamped → unknown age, reported as null rather than guessed at
		expect(s.quietSources.find((q) => q.source === "unstamped")?.days).toBe(
			null,
		);
	});

	it("does not accuse a detector that has nothing open to re-confirm", () => {
		// Silence only means something when there's an outstanding claim to recheck.
		const now = Date.now();
		const s = summarizeLedger(
			[f({ id: "1", source: "done", status: "verified", evidenceAt: iso(90) })],
			now,
		);
		expect(s.quietSources).toHaveLength(0);
		expect(s.unverifiedOpen).toBe(0);
	});

	it("advances evidenceAt when a detector genuinely re-runs", () => {
		const prior = [f({ id: "s:x", source: "s", evidenceAt: iso(30) })];
		const detected = [f({ id: "s:x", source: "s", evidenceAt: iso(0) })];
		const out = upsertFindings(prior, detected, ["s"], iso(0));
		expect(hasFreshEvidence(out[0], Date.now())).toBe(true);
	});

	// The other half of auto-clear, and the half that was missing. Silence
	// closed a finding and noise did not reopen it, so "closed" meant "nobody
	// asked recently" in both directions. Measured on real data before the fix:
	// 191 of 406 cleared findings had been re-raised while still counted closed.
	it("REOPENS an auto-cleared finding the detector raises again", () => {
		const prior = [
			f({
				id: "s:x",
				source: "s",
				status: "cleared",
				clearedAt: iso(3),
				clearedBy: "stale-sweep: re-probed live and passing",
			}),
		];
		// `iso(0)` is Date.now() — calling it twice returns two different strings
		// a millisecond apart. Passing one call as the input and comparing against
		// a SECOND call is a coin flip that lands heads on a fast machine: it
		// passed locally and failed on the CI runner. Capture it once.
		const now = iso(0);
		const out = upsertFindings(
			prior,
			[f({ id: "s:x", source: "s" })],
			["s"],
			now,
		);
		expect(out[0]?.status).toBe("open");
		expect(out[0]?.reopenedAt).toBe(now);
		// the old clearance is not evidence about the new state
		expect(out[0]?.clearedAt).toBeUndefined();
		expect(out[0]?.clearedBy).toBeUndefined();
	});

	// A closed row's stamps must describe its CURRENT status: no reopenedAt
	// left over from the failure, and evidenceAt dating the run that closed it
	// — not the failing run that opened it (seen live on the usdc-swap row:
	// re-cleared with evidenceAt still pointing at the failure artifact).
	it("re-clearing a reopened finding drops reopenedAt and re-dates evidenceAt", () => {
		const cleared = f({
			id: "s:x",
			source: "s",
			status: "cleared",
			clearedAt: iso(3),
		});
		const reopenNow = iso(0);
		// the detector re-raises it → reopened, stamped with the failure's evidence
		const reopened = upsertFindings(
			[cleared],
			[f({ id: "s:x", source: "s", evidenceAt: reopenNow })],
			["s"],
			reopenNow,
		);
		expect(reopened[0]?.status).toBe("open");
		expect(reopened[0]?.reopenedAt).toBe(reopenNow);
		// next run the detector is quiet again → auto-cleared
		const clearNow = new Date(Date.now() + 1000).toISOString();
		const recleared = upsertFindings(reopened, [], ["s"], clearNow);
		expect(recleared[0]?.status).toBe("cleared");
		expect(recleared[0]?.reopenedAt).toBeUndefined();
		expect(recleared[0]?.evidenceAt).toBe(clearNow); // dates the quiet run, not the failure
	});

	it("leaves WORK IN PROGRESS alone — in-wave and fixed are not auto-changed", () => {
		// A detector still reporting these is expected: nobody has claimed the
		// fix landed yet. Only `verified` makes that claim.
		for (const status of ["fixed", "in-wave"] as const) {
			const prior = [f({ id: "s:x", source: "s", status })];
			const out = upsertFindings(
				prior,
				[f({ id: "s:x", source: "s" })],
				["s"],
				iso(0),
			);
			expect(out[0]?.status).toBe(status);
			expect(out[0]?.regressedFromVerified).toBeUndefined();
		}
	});

	// Before 2026-09-05 `verified` was in the loop above: a detector raising a
	// verified finding again changed nothing on the row, and the only trace was
	// applyWaves\' `suspectVerified` console warning — not in the ledger, not in
	// the summary, not on the board. A fix a human asserted had landed and that
	// regressed is the strongest signal here; it must not be the quietest.
	it("REOPENS a verified finding a detector raises again, and flags the regression", () => {
		const now = new Date().toISOString();
		const prior = [
			f({
				id: "s:x",
				source: "s",
				status: "verified",
				verifiedAt: iso(9),
				wave: "w1",
			}),
		];
		const out = upsertFindings(
			prior,
			[f({ id: "s:x", source: "s" })],
			["s"],
			now,
		);
		expect(out[0]?.status).toBe("open");
		expect(out[0]?.regressedFromVerified).toBe(true);
		expect(out[0]?.reopenedAt).toBe(now);
		expect(
			summarizeLedger(out, Date.now()).recurrence.regressedFromVerified,
		).toBe(1);

		// A wave puts `verified` back every run (all 7 live verified rows carry
		// one), so the stamp must NOT be re-cut each night — that would churn the
		// committed ledger daily and lose when the regression actually started.
		const later = new Date(Date.now() + 86_400_000).toISOString();
		const again = upsertFindings(
			[{ ...out[0], status: "verified" as const }],
			[f({ id: "s:x", source: "s" })],
			["s"],
			later,
		);
		expect(again[0]?.reopenedAt).toBe(now);
		expect(again[0]?.regressedFromVerified).toBe(true);
	});
});

describe("closure honesty — the metrics that can actually move", () => {
	const now = Date.now();

	it("an EMPTY ledger scores 0, not 1 — a vacuous denominator is not a pass", () => {
		const s = summarizeLedger([], now);
		expect(s.total).toBe(0);
		expect(s.closingRate).toBe(0);
		expect(s.silenceShare).toBe(0);
		expect(s.recurrence.recurredAfterSilence.lifetime.ratePct).toBe(0);
	});

	it("a re-probed close counts, a silence-close does not", () => {
		const s = summarizeLedger(
			[
				f({ id: "a", source: "s", status: "verified" }),
				f({
					id: "b",
					source: "s",
					status: "cleared",
					clearedBy: "stale-sweep: re-probed live and passing",
				}),
				f({ id: "c", source: "s", status: "cleared" }),
				f({ id: "d", source: "s", status: "cleared" }),
			],
			now,
		);
		// 2 of 4 closed on evidence, 2 of 4 on silence. The two halves are
		// published side by side and sum to the closed share.
		expect(s.closingRate).toBe(0.5);
		expect(s.silenceShare).toBe(0.5);
	});

	it("recurredAfterSilence needs a silence-close BEFORE the new finding appeared", () => {
		const silenceClose = f({
			id: "s:old",
			source: "s",
			surface: "directory",
			failureMode: "missing-field",
			status: "cleared",
			firstSeen: iso(40),
			clearedAt: iso(20),
		});
		const after = f({
			id: "s:new",
			source: "s",
			surface: "directory",
			failureMode: "missing-field",
			firstSeen: iso(5), // AFTER the silence-close → came back in kind
		});
		const before = f({
			id: "s:concurrent",
			source: "s",
			surface: "directory",
			failureMode: "missing-field",
			firstSeen: iso(25), // BEFORE it → same pair, but not a recurrence
		});
		const otherPair = f({
			id: "s:other",
			source: "s",
			surface: "retrieval", // same failureMode, different surface
			failureMode: "missing-field",
			firstSeen: iso(5),
		});
		const r = summarizeLedger([silenceClose, after, before, otherPair], now)
			.recurrence.recurredAfterSilence;
		expect(r.lifetime.recurred).toBe(1); // only `after`
		expect(r.lifetime.newFindings).toBe(4);
		// the 30d window drops the two rows first seen outside it
		expect(r.last30d.newFindings).toBe(3);
		expect(r.last30d.recurred).toBe(1);
	});

	it("a RE-PROBED close is not silence — its pair recurring is not counted", () => {
		const r = summarizeLedger(
			[
				f({
					id: "s:old",
					source: "s",
					failureMode: "recall-miss",
					status: "cleared",
					firstSeen: iso(40),
					clearedAt: iso(20),
					clearedBy: "stale-sweep: re-probed live and passing",
				}),
				f({
					id: "s:new",
					source: "s",
					failureMode: "recall-miss",
					firstSeen: iso(5),
				}),
			],
			now,
		).recurrence.recurredAfterSilence;
		// The pair WAS re-checked and passed. Something regressed later, which is
		// a different story from "we closed it without ever looking".
		expect(r.lifetime.recurred).toBe(0);
	});

	it("counts exact-id reopens as a lower bound on recurrence", () => {
		const s = summarizeLedger(
			[
				f({ id: "a", source: "s", status: "open", reopenedAt: iso(2) }),
				f({ id: "b", source: "s", status: "cleared" }),
				f({ id: "c", source: "s", status: "verified" }),
				f({ id: "d", source: "s", status: "open" }),
			],
			now,
		);
		expect(s.recurrence.reopened).toBe(1);
		// denominator = everything ever closed we can still see: b, c, and a
		// (which a reopen pulled back out). `d` was never closed.
		expect(s.recurrence.reopenedShareOfClosures).toBeCloseTo(0.33, 2);
	});

	it("a silence-closed finding the same detector raises again REOPENS", () => {
		const now = new Date().toISOString();
		const prior = [
			f({
				id: "s:x",
				source: "s",
				status: "cleared",
				clearedAt: iso(3), // no clearedBy → closed on silence
			}),
		];
		const out = upsertFindings(
			prior,
			[f({ id: "s:x", source: "s" })],
			["s"],
			now,
		);
		expect(out[0]?.status).toBe("open");
		expect(out[0]?.reopenedAt).toBe(now);
		expect(out[0]?.clearedAt).toBeUndefined();
		// and it is no longer in either closed bucket
		const s = summarizeLedger(out, Date.now());
		expect(s.clearedOnSilence).toBe(0);
		expect(s.closingRate).toBe(0);
		expect(s.recurrence.reopened).toBe(1);
	});
});
