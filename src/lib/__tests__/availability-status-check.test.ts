/** sls-121 (2026-11-23): a Live label must not read as plainly Live when the
 * row's own availabilityCheck, newer than the label's observation, found no
 * product. Rows shaped after the live ones read on 2026-11-23. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_COMPACT } from "../compact-view";
import { factConfidence } from "../fact-confidence";
import { spec } from "../openapi-spec";
import { STATUS_CHECK_SELECT, statusChecksFor } from "../status-checks";
import { liveVerdict } from "../verify-claim";

const NOW = new Date("2026-11-23T12:00:00.000Z");

const check = (over: object = {}) => ({
	result: "none-found",
	checkedAt: "2026-11-11",
	sources: ["https://elsa.care/", "https://elsa.care/about"],
	note: "elsa.care links no app; it says its 2021 consumer remittance app became Borderless, a B2B payments API, in 2023",
	...over,
});
const elsa = {
	slug: "elsa",
	status: "Live",
	statusBasis: "site-liveness",
	statusAsOf: "2026-08-17T03:02:29.060Z",
	types: ["Wallet", "Payments"],
	availability: null,
	availabilityCheck: check(),
};
const avail = (r: ReturnType<typeof statusChecksFor>) =>
	r.statusChecks?.find((c) => c.check === "availability-check");
const halfOf = (basis: string, asOf: string) =>
	Math.round((factConfidence(basis, asOf, NOW)?.score ?? 0) * 50) / 100;

describe("availability-check: the row's own check read against its label", () => {
	it("elsa: none-found after a site-liveness stamp caveats Live and halves confidence", () => {
		const out = statusChecksFor(elsa, NOW);
		expect(avail(out)).toMatchObject({
			result: "hit",
			asOf: "2026-11-11",
			sourceUrl: "https://elsa.care/",
		});
		expect(out.statusCaveat).toMatch(/^Live on record, but a check of /);
		expect(out.statusCaveat).toMatch(/found no product, /);
		expect(out.statusCaveat).toMatch(
			/rests on no reading of the product \(basis site-liveness\)/,
		);
		expect(out.statusCaveat).toMatch(/became Borderless/);
		expect(out.statusConfidence?.score).toBe(
			halfOf("site-liveness", elsa.statusAsOf),
		);
	});

	it("spatium: a label carried over from a seed list records no observation", () => {
		const out = statusChecksFor(
			{
				...elsa,
				statusBasis: "source-inherited",
				statusAsOf: "2026-08-19T07:29:37.806Z",
			},
			NOW,
		);
		expect(avail(out)?.result).toBe("hit");
		expect(out.statusCaveat).toMatch(/basis source-inherited/);
	});

	it("ben-wallet: an unverified stamp dated after the check is no newer observation", () => {
		const out = statusChecksFor(
			{
				...elsa,
				statusBasis: "unverified",
				statusAsOf: "2026-11-12T00:00:00.000Z",
			},
			NOW,
		);
		expect(avail(out)?.result).toBe("hit");
		expect(out.statusCaveat).toMatch(
			/rests on no reading of the product \(basis unverified\)/,
		);
	});

	it("a check before a product observation is clear and changes nothing", () => {
		for (const statusBasis of ["human-verified", "onchain-activity"])
			for (const statusAsOf of [
				"2026-11-12T00:00:00.000Z",
				"2026-11-11T09:00:00.000Z",
			]) {
				const row = { ...elsa, statusBasis, statusAsOf };
				const out = statusChecksFor(row, NOW);
				const at = `${statusBasis} ${statusAsOf}`;
				expect(avail(out)?.result, at).toBe("clear");
				expect(out.statusCaveat, at).toBeNull();
				expect(out.statusConfidence, at).toEqual(
					factConfidence(statusBasis, statusAsOf, NOW),
				);
			}
	});

	it("the daily liveness re-stamp, or any basis that reads no product, never clears the check", () => {
		// upgrade-status-basis runs daily and writes site-liveness with
		// statusAsOf = the last day the page answered: after the check.
		for (const statusBasis of [
			"site-liveness",
			"product-integration",
			"operator-announcement",
			"repo-activity",
			"package-release",
			"source-inherited",
			"unverified",
			null,
		]) {
			const row = { ...elsa, statusBasis, statusAsOf: "2026-11-22T06:00:00Z" };
			const out = statusChecksFor(row, NOW);
			expect(avail(out)?.result, String(statusBasis)).toBe("hit");
			expect(out.statusCaveat, String(statusBasis)).toMatch(
				/rests on no reading of the product/,
			);
		}
	});

	it("checkedAt is free text: a timestamp is read by its day, a non-date decides nothing", () => {
		const verified = {
			...elsa,
			statusBasis: "human-verified",
			statusAsOf: "2026-11-11T00:00:00.000Z",
		};
		const stamped = statusChecksFor(
			{
				...verified,
				availabilityCheck: check({ checkedAt: "2026-11-11T18:30:00Z" }),
			},
			NOW,
		);
		expect(avail(stamped)).toMatchObject({
			result: "clear",
			asOf: "2026-11-11",
		});
		for (const checkedAt of ["", "soon", "11/11/2026"]) {
			const out = statusChecksFor(
				{ ...elsa, availabilityCheck: check({ checkedAt }) },
				NOW,
			);
			expect(avail(out), checkedAt).toMatchObject({
				result: "could-not-check",
				asOf: null,
			});
			expect(avail(out)?.detail, checkedAt).not.toMatch(/on {2}|on found/);
			expect(out.statusCaveat, checkedAt).toBeNull();
		}
	});

	it("an undated earned label is older than any check", () => {
		const out = statusChecksFor(
			{ ...elsa, statusBasis: "human-verified", statusAsOf: null },
			NOW,
		);
		expect(avail(out)?.result).toBe("hit");
		expect(out.statusCaveat).toMatch(/label is undated/);
	});

	it("reads a statusAsOf handed as a Date, as the semantic rows hand it", () => {
		const out = statusChecksFor(
			{
				...elsa,
				statusBasis: "human-verified",
				statusAsOf: new Date("2026-11-12T00:00:00.000Z"),
			},
			NOW,
		);
		expect(avail(out)?.result).toBe("clear");
	});

	it("a check that could not read a source decides nothing", () => {
		const out = statusChecksFor(
			{ ...elsa, availabilityCheck: check({ result: "could-not-check" }) },
			NOW,
		);
		expect(avail(out)?.result).toBe("could-not-check");
		expect(out.statusCaveat).toBeNull();
		expect(out.statusConfidence).toEqual(
			factConfidence("site-liveness", elsa.statusAsOf, NOW),
		);
	});

	it("a row with availability rows serves no check, so none runs", () => {
		const row = {
			...elsa,
			availability: [
				{ platform: "ios", state: "available", checkedAt: "2026-11-11" },
			],
		};
		expect(Object.keys(statusChecksFor(row, NOW))).toEqual([
			"statusConfidence",
		]);
		const plain = { ...elsa, availabilityCheck: null };
		expect(Object.keys(statusChecksFor(plain, NOW))).toEqual([
			"statusConfidence",
		]);
	});

	it("a hit on a row that is not Live adds no caveat", () => {
		const out = statusChecksFor({ ...elsa, status: "Development" }, NOW);
		expect(avail(out)?.result).toBe("hit");
		expect(out.statusCaveat).toBeNull();
	});

	it("served text carries no em or en dashes", () => {
		const texts = [
			{ ...elsa },
			{ ...elsa, statusBasis: "unverified" },
			{ ...elsa, statusBasis: "human-verified", statusAsOf: "2026-11-12" },
			{ ...elsa, availabilityCheck: check({ result: "could-not-check" }) },
		].flatMap((r) => {
			const o = statusChecksFor(r, NOW);
			return [
				o.statusCaveat ?? "",
				...(o.statusChecks ?? []).map((c) => c.detail),
			];
		});
		for (const t of texts) expect(t).not.toMatch(/[\u2013\u2014]/);
	});
});

describe("every serving path carries the availability check", () => {
	const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

	it("verifyClaim type=live relays the caveat and cites the check", () => {
		const r = liveVerdict({
			...elsa,
			name: "Elsa",
			statusSourceUrl: "https://elsa.care/",
		});
		expect(r.verdict).toBe("supported");
		expect(r.statement).toMatch(/\. But a check of the operator's sources/);
		expect(r.evidence).toContainEqual({
			kind: "status-check",
			note: expect.stringMatching(/found no product/),
			source: "https://elsa.care/",
			asOf: "2026-11-11",
		});
		expect(r.confidence?.score).toBeLessThan(
			factConfidence("site-liveness", elsa.statusAsOf)?.score ?? 0,
		);
	});

	it("verify and resolve select every field the checks read; the project page renders the caveat", () => {
		expect(STATUS_CHECK_SELECT).toMatchObject({
			availability: true,
			availabilityCheck: true,
			statusAsOf: true,
			statusBasis: true,
			llamaSlugs: true,
		});
		const verify = src("src/app/api/verify/route.ts");
		expect(verify).toMatch(/\.\.\.STATUS_CHECK_SELECT/);
		expect(verify).toMatch(/availabilityCheck: full\?\.availabilityCheck/);
		const resolve = src("src/app/api/projects/resolve/route.ts");
		expect(resolve).toMatch(/select: STATUS_CHECK_SELECT/);
		expect(resolve).toMatch(/evidence\.statusCaveat =\s+statusChecksFor\(/);
		const page = src("src/app/(frontend)/project/[slug]/page.tsx");
		expect(page).toMatch(/statusChecksFor\(project\)\.statusCaveat/);
		expect(page).toMatch(/\{statusCaveat\}/);
	});

	it("compact rows keep statusCaveat, and the spec declares the check and resolve's caveat", () => {
		expect(PROJECT_COMPACT.keep).toHaveProperty("statusCaveat", true);
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const s: any = spec;
		const row = s.components.schemas.Project.properties;
		expect(row.statusChecks.items.properties.check.enum).toContain(
			"availability-check",
		);
		expect(row.statusChecks.description).toMatch(/availability-check/);
		const ev =
			s.paths["/api/projects/resolve"].get.responses["200"].content[
				"application/json"
			].schema.properties.evidence.properties;
		expect(ev.statusCaveat).toMatchObject({ type: "string", nullable: true });
	});
});
