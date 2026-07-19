import { describe, expect, it } from "vitest";
import {
	findPeopleByName,
	normalizeSection,
	searchPeople,
	sectionsAvailable,
} from "../sdf-people";

describe("SDF people index — searchPeople", () => {
	it("resolves a full-name lookup to the right person with role + provenance", () => {
		const { people, total } = searchPeople("justin rice");
		expect(total).toBe(1);
		expect(people[0]).toMatchObject({
			name: "Justin Rice",
			role: "VP of Ecosystem",
			section: "Leadership",
			org: "Stellar Development Foundation",
		});
		// Provenance rides every row.
		expect(people[0].sourceUrl).toMatch(/stellar\.org\/foundation\/team/);
		expect(people[0].observedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("matches on role and on org, not just name", () => {
		expect(
			searchPeople("ecosystem").people.some((p) => p.name === "Justin Rice"),
		).toBe(true);
		expect(
			searchPeople("openai").people.some((p) => p.name === "Sam Altman"),
		).toBe(true);
	});

	it("ANDs tokens — every token must appear somewhere in name/role/org", () => {
		expect(searchPeople("chief scientist").people.map((p) => p.name)).toContain(
			"David Mazières",
		);
		expect(searchPeople("justin openai").total).toBe(0);
	});

	it("filters by section (with aliases)", () => {
		const board = searchPeople(null, { section: "board" });
		expect(board.total).toBeGreaterThan(0);
		expect(board.people.every((p) => p.section === "Board of directors")).toBe(
			true,
		);
		// A leadership-only person is absent from the board slice.
		expect(board.people.some((p) => p.name === "Justin Rice")).toBe(false);
	});

	it("browse (no query) returns the whole roster in order, leadership first", () => {
		const all = searchPeople(null);
		expect(all.total).toBeGreaterThanOrEqual(12);
		expect(all.people[0].section).toBe("Leadership");
	});

	it("returns empty (not throw) for a non-roster name", () => {
		expect(searchPeople("satoshi nakamoto").total).toBe(0);
	});
});

describe("SDF people index — findPeopleByName (builders cross-link)", () => {
	it("matches on name tokens only, not skill words", () => {
		expect(findPeopleByName("tomer weller").map((p) => p.name)).toEqual([
			"Tomer Weller",
		]);
		// A skill word is not a name — must not pull anyone in.
		expect(findPeopleByName("payments")).toEqual([]);
	});

	it("dedupes a person listed under more than one section", () => {
		// Jed McCaleb appears under both Leadership and Board of directors.
		const jed = findPeopleByName("jed mccaleb");
		expect(jed).toHaveLength(1);
		expect(jed[0].name).toBe("Jed McCaleb");
	});
});

describe("SDF people index — section helpers", () => {
	it("normalizes section aliases", () => {
		expect(normalizeSection("board")).toBe("Board of directors");
		expect(normalizeSection("Advisors")).toBe("Advisors");
		expect(normalizeSection("nonsense")).toBeNull();
	});

	it("reports the sections that exist", () => {
		expect(sectionsAvailable()).toContain("Leadership");
	});
});
