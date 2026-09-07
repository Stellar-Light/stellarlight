/**
 * A broken link means two different things, and they were counted as one.
 *
 * On a LIVE row it is a defect: either our citation is wrong, or the product
 * died and we have not noticed. Both need a person.
 *
 * On a row we already call Inactive or Draft it is CORROBORATION — the site is
 * gone because the project is, which is exactly what the row already says.
 * apay.io is the case that prompted this: a 404 filed as a \`broken-link\`
 * finding, on a row that has read "Product dead (human-confirmed 2026-07-11)"
 * since July. Nothing was wrong; the check was agreeing with us.
 *
 * One live citer is enough to make a shared URL a defect: a dead row pointing
 * at the same link does not excuse it.
 */
import { describe, expect, it } from "vitest";

const RETIRED = new Set(["Inactive", "Draft"]);

/** The classification check-links applies. */
const onlyOnRetired = (
	targets: Array<{ collection: string; recordStatus?: string | null }>,
) => {
	const citers = targets.filter((t) => t.collection === "projects");
	return (
		citers.length > 0 &&
		citers.every((t) => RETIRED.has(String(t.recordStatus)))
	);
};

describe("a dead link on a dead project is not a defect", () => {
	it("classes a link cited only by an Inactive row as corroboration", () => {
		expect(
			onlyOnRetired([{ collection: "projects", recordStatus: "Inactive" }]),
		).toBe(true);
	});

	it("classes a link on a Live row as a defect", () => {
		expect(
			onlyOnRetired([{ collection: "projects", recordStatus: "Live" }]),
		).toBe(false);
	});

	it("one live citer makes a shared URL a defect", () => {
		expect(
			onlyOnRetired([
				{ collection: "projects", recordStatus: "Inactive" },
				{ collection: "projects", recordStatus: "Live" },
			]),
		).toBe(false);
	});

	it("a link cited by no project at all is never excused", () => {
		// Builders and partners have their own lifecycle; absence of a project
		// citer must not silently downgrade the finding.
		expect(
			onlyOnRetired([{ collection: "builders", recordStatus: undefined }]),
		).toBe(false);
	});

	it("an unknown status is not treated as retired", () => {
		expect(
			onlyOnRetired([{ collection: "projects", recordStatus: null }]),
		).toBe(false);
	});
});
