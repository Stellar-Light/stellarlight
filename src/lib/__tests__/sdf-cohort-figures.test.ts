// @vitest-environment node

/**
 * Every figure the cohort serves equals the facts register's figure. The
 * register is read twice: the copy sealed in the committed bundle, and the
 * register file as it stands now (COHORT_REGISTER_FILE). They must be equal,
 * so a bundle built from an older register fails, and each check runs on the
 * file's current text. The bundle is encrypted (this repository is public),
 * so this runs only where COHORT_DATA_KEY is set; with the key and no
 * register file the suite fails rather than check the sealed copy alone.
 *
 * Each check lists the computed numbers in the order the register's value
 * text states them, and they must be the text's leading numbers: the
 * headline figure, not any later match, so a superseded number fails.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	BANNED_IN_BUNDLE,
	type CohortRetention,
	cohortRetention,
	loadCohort,
	parseRegister,
	servedText,
} from "../sdf-cohort";

const pct = (n: number, d: number) => Math.round((100 * n) / d);
const obs = (
	rows: CohortRetention["operatingNow"]["byFirstAwardType"],
	g: string,
) => {
	const r = rows.find((x) => x.group === g);
	if (!r) throw new Error(`no group ${g}`);
	return [
		r.observable.operating,
		r.observable.projects,
		pct(r.observable.operating, r.observable.projects),
	];
};
/** "60 with 0, 51 with 1 to 9, ..., 23 with 100 or more" */
const bands = (b: CohortRetention["usage"]["all"]["bands"]) =>
	b.flatMap(({ band, projects }) => [
		projects,
		...(band.match(/\d+/g) ?? []).map(Number),
	]);

const CHECKS: Array<[fact: string, numbers: (r: CohortRetention) => number[]]> =
	[
		["Projects in the cohort", (r) => [r.cohort.projects]],
		[
			"SCF-funded in the cohort",
			(r) => [r.cohort.scfFunded, r.scf.launchKnown.projects],
		],
		[
			"SCF award kinds",
			(r) => {
				const out = r.cohort.scfFundedOutsideCohort;
				return [
					...Object.values(r.scf.byAwardKind),
					Object.values(out).reduce((a, n) => a + n, 0),
					out.Development ?? 0,
					out["Pre-Release"] ?? 0,
				];
			},
		],
		["Launch date basis, SCF", (r) => Object.values(r.scf.launchBasis)],
		["Launch older than first award", (r) => [r.scf.launchBeforeFirstAward]],
		[
			"Day-180 reading, SCF, SDF's plan definition",
			(r) => Object.values(r.scf.day180TwoSignals),
		],
		["Day-180 reading, SCF, ours", (r) => Object.values(r.scf.day180)],
		[
			"Launched on or after the first award",
			(r) => {
				const a = r.scf.launchedOnOrAfterFirstAward;
				return [
					a.projects,
					a.activeTwoSignals,
					a.withTwoSignalVerdict,
					pct(a.activeTwoSignals, a.withTwoSignalVerdict),
					a.activeAtDay180,
					a.withDay180Verdict,
					pct(a.activeAtDay180, a.withDay180Verdict),
				];
			},
		],
		[
			"Not SCF-funded, in the cohort",
			(r) => [
				r.notScf.projects,
				r.notScf.launchBasis.onChain,
				r.notScf.launchBasis.product,
				r.notScf.launchBasis.plannedOnly + r.notScf.launchBasis.none,
				r.notScf.day180TwoSignals.active,
				r.notScf.day180TwoSignals.oneSignalKind,
				r.notScf.day180TwoSignals.noActivitySeen,
				r.notScf.day180.activitySeen,
				r.notScf.day180.noActivitySeen,
			],
		],
		[
			"Confidence of each record",
			(r) => [
				...Object.values(r.scf.confidence),
				...Object.values(r.notScf.confidence),
			],
		],
		["Eligible SCF projects", (r) => [r.operatingNow.eligible]],
		[
			"Operating now on product evidence",
			(r) => {
				const o = r.operatingNow;
				return [
					o.operating,
					o.eligible,
					pct(o.operating, o.eligible),
					o.byEvidence["on-chain"],
					o.byEvidence.product,
					o.byEvidence.person,
					o.byEvidence.app,
				];
			},
		],
		[
			"On-chain operating, by distinct non-team callers",
			(r) => {
				const c = r.operatingNow.onChainByCallers;
				return [c.measured + c.notMeasured, ...bands(c.bands), c.notMeasured];
			},
		],
		[
			"Build against Legacy, observable only",
			(r) => [
				...obs(r.operatingNow.byFirstAwardType, "build"),
				...obs(r.operatingNow.byFirstAwardType, "legacy"),
			],
		],
		[
			"First award $150K or more, observable",
			(r) => obs(r.operatingNow.byFirstAwardSize, "$150K and over"),
		],
		[
			"SCF-funded with a readable signal",
			(r) => {
				const x = r.scf.readable;
				return [
					x.of,
					x.contractIds,
					x.asset,
					x.accounts,
					x.storeData,
					x.codeActive,
					x.nothingReadable,
				];
			},
		],
		[
			"Upper bound of an on-chain usage measure",
			(r) => [r.scf.readable.anyOnchainId, r.scf.readable.of],
		],
		[
			"Distinct non-team callers, 90 days",
			(r) => [
				r.usage.all.measured,
				r.usage.scf.measured,
				...bands(r.usage.all.bands),
				...r.usage.scf.bands.map((b) => b.projects),
				r.usage.eventsLatest60dAtLeast1000,
			],
		],
		[
			"Build awards with the mainnet tranche paid",
			(r) => [
				r.deliveryByRound.mainnetTranchePaid,
				r.deliveryByRound.awardsRead,
				r.deliveryByRound.scfProjects,
			],
		],
		[
			"Our rows with a Build award paid in full",
			(r) => [
				r.scf.buildFunded.mainnetTranchePaid,
				r.scf.buildFunded.projects,
				r.scf.buildFunded.mainnetPaidWithoutDatedLaunch,
			],
		],
		[
			"Launch known, SCF-funded in the cohort",
			(r) => [
				r.scf.launchKnown.projects,
				r.scf.launchKnown.of,
				r.scf.launchKnown.dated,
				r.scf.launchKnown.bySCFPaymentOnly,
			],
		],
		[
			"Funnel, SCF-funded",
			(r) => {
				const [funded, known, past, op] = r.funnel;
				const e = r.funnelPastDay180Evidence;
				return [
					funded.projects,
					known.projects,
					past.projects,
					180,
					op.of,
					op.projects,
					e["on-chain"] ?? 0,
					e.product ?? 0,
					e.person ?? 0,
					e.app ?? 0,
					op.of - op.projects,
					e.code ?? 0,
					e.none ?? 0,
					e["recorded inactive"] ?? 0,
					r.funnelNotRead,
				];
			},
		],
		[
			"Funnel by launch timing",
			(r) => {
				const [before, after] = r.funnelByLaunchTiming;
				return [
					30,
					before.operating,
					before.read,
					pct(before.operating, before.read),
					after.operating,
					after.read,
					pct(after.operating, after.read),
				];
			},
		],
		[
			"Retention after an SCF-confirmed launch",
			(r) => {
				const c = r.scfConfirmedRetention;
				const code = (k: string) =>
					Object.entries(c.noReadingByCode).find(([x]) =>
						x.startsWith(k),
					)?.[1] ?? 0;
				const [before, after] = c.byLaunchTiming;
				return [
					c.operatingNow,
					c.read,
					180,
					pct(c.operatingNow, c.read),
					c.codeOnly,
					c.noReading,
					code("no public code"),
					code("quiet"),
					code("silent"),
					c.recordedInactive,
					c.notRead,
					before.operating,
					before.read,
					after.operating,
					after.read,
				];
			},
		],
	];

/** The numbers in a register cell, in order ("10,270" is one number). */
const numbersIn = (text: string) =>
	(text.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, "")));

const bundle = process.env.COHORT_DATA_KEY ? loadCohort() : null;
const registerFile = process.env.COHORT_REGISTER_FILE;

describe.skipIf(!bundle)("cohort figures equal the facts register", () => {
	// describe bodies run while a skipped suite is collected: build nothing then
	if (!bundle) return;
	const b = bundle;
	const r = cohortRetention(b);
	const current = registerFile
		? parseRegister(readFileSync(registerFile, "utf8"))
		: null;

	it("reads the register file as it stands now (COHORT_REGISTER_FILE)", () => {
		expect(
			current,
			"set COHORT_REGISTER_FILE to the facts register the bundle was built from",
		).not.toBeNull();
		expect(
			b.register,
			"the bundle's register differs from the file: rebuild",
		).toEqual(current);
	});

	it.each(CHECKS)("%s", (fact, numbers) => {
		const row = (current ?? b.register).find((x) => x.fact === fact);
		expect(row, `register row '${fact}'`).toBeTruthy();
		const want = numbers(r);
		expect(want.every((n) => Number.isFinite(n))).toBe(true);
		expect(
			numbersIn(row?.value ?? "").slice(0, want.length),
			`${fact}: "${row?.value}"`,
		).toEqual(want);
	});

	it("the SCF-confirmed funnel stage is the same rule as the register's retention row", () => {
		const c = r.scfConfirmedRetention;
		expect(c.launchBasis.dated + c.launchBasis.scfPaidBy).toBe(
			c.launchAtLeast180DaysOld,
		);
		expect(c.read + c.notRead).toBe(c.launchAtLeast180DaysOld);
		expect(r.funnel[1].projects).toBe(r.scf.launchKnown.projects);
	});

	it("every register row served is a checked figure, or SCF's validation note", () => {
		const checked = new Set(CHECKS.map(([f]) => f));
		expect(
			b.register.map((x) => x.fact).filter((f) => !checked.has(f)),
		).toEqual(["Validation"]);
	});

	it("by-year columns sum to the year's projects", () => {
		for (const y of r.scfByFirstAwardYear) {
			expect(Object.values(y.day180).reduce((a, n) => a + n, 0)).toBe(
				y.projects,
			);
			expect(Object.values(y.day180TwoSignals).reduce((a, n) => a + n, 0)).toBe(
				y.projects,
			);
		}
	});

	it("serves no data about people, no local paths and no internal ids", () => {
		const text = servedText(b);
		for (const bad of BANNED_IN_BUNDLE) expect(text).not.toMatch(bad);
	});
});
