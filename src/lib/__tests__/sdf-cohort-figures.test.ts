// @vitest-environment node

/**
 * Every figure the cohort serves equals the facts register's figure, read
 * from the committed bundle. The register's rows travel inside the bundle,
 * which is encrypted (this repository is public), so this runs only where
 * COHORT_DATA_KEY is set; without it the suite is skipped and says so.
 *
 * Each check lists the computed numbers in the order the register's value
 * text states them; the text must contain them in that order.
 */
import { describe, expect, it } from "vitest";
import {
	type CohortRetention,
	cohortRetention,
	loadCohort,
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

const CHECKS: Array<[fact: string, numbers: (r: CohortRetention) => number[]]> =
	[
		["Projects in the cohort", (r) => [r.cohort.projects]],
		["SCF-funded and launched", (r) => [r.cohort.scfFunded]],
		["Launch date basis, SCF", (r) => Object.values(r.scf.launchBasis)],
		["Launch older than first award", (r) => [r.scf.launchBeforeFirstAward]],
		["Day-180 reading, SCF", (r) => Object.values(r.scf.day180)],
		[
			"Launched on or after the first award",
			(r) => {
				const a = r.scf.launchedOnOrAfterFirstAward;
				return [
					a.projects,
					a.withDay180Verdict,
					a.activeAtDay180,
					pct(a.activeAtDay180, a.withDay180Verdict),
				];
			},
		],
		[
			"Not SCF, launched",
			(r) => [
				r.notScf.projects,
				r.notScf.launchBasis.onChain,
				r.notScf.launchBasis.product,
				r.notScf.launchBasis.plannedOnly + r.notScf.launchBasis.none,
				r.notScf.day180.activitySeen,
				r.notScf.day180.noActivitySeen,
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
			"Launch known, SCF launched",
			(r) => [
				r.scf.launchKnown.projects,
				r.scf.launchKnown.of,
				r.scf.launchKnown.dated,
				r.scf.launchKnown.bySCFPaymentOnly,
			],
		],
		[
			"Retention after an SCF-confirmed launch",
			(r) => {
				const c = r.scfConfirmedRetention;
				return [
					c.operatingNow,
					c.launchAtLeast180DaysOld,
					pct(c.operatingNow, c.launchAtLeast180DaysOld),
					c.codeOnly,
					c.noReading,
					c.recordedInactive,
				];
			},
		],
	];

/** The numbers in a register cell, in order ("10,270" is one number). */
const numbersIn = (text: string) =>
	(text.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, "")));

function inOrder(want: number[], have: number[]) {
	let i = 0;
	for (const n of have) if (n === want[i]) i++;
	return i === want.length;
}

const bundle = process.env.COHORT_DATA_KEY ? loadCohort() : null;

describe.skipIf(!bundle)("cohort figures equal the facts register", () => {
	// describe bodies run while a skipped suite is collected: build nothing then
	if (!bundle) return;
	const b = bundle;
	const r = cohortRetention(b);

	it.each(CHECKS)("%s", (fact, numbers) => {
		const row = b.register.find((x) => x.fact === fact);
		expect(row, `register row '${fact}'`).toBeTruthy();
		const want = numbers(r);
		expect(want.every((n) => Number.isFinite(n))).toBe(true);
		expect(
			inOrder(want, numbersIn(row?.value ?? "")),
			`${fact}: computed ${want.join(", ")} not in "${row?.value}"`,
		).toBe(true);
	});

	it("the SCF-confirmed funnel stage is the same rule as the register's retention row", () => {
		// The funnel's past-day-180 and operating-now stages restricted to
		// launches SCF confirmed must be the register's retention figures.
		const c = r.scfConfirmedRetention;
		expect(c.launchBasis.dated + c.launchBasis.scfPaidBy).toBe(
			c.launchAtLeast180DaysOld,
		);
		expect(r.funnel[1].projects).toBe(r.scf.launchKnown.projects);
	});

	it("every register row served is a checked figure, or SCF's validation note", () => {
		const checked = new Set(CHECKS.map(([f]) => f));
		expect(
			b.register.map((x) => x.fact).filter((f) => !checked.has(f)),
		).toEqual(["Validation"]);
	});

	it("serves no data about people and no local paths", () => {
		const text = JSON.stringify(b);
		expect(text).not.toMatch(/, developer |gh_contributors|ghContributors/);
		expect(text).not.toMatch(/\/Users\/|\/home\/|~\//);
	});
});
