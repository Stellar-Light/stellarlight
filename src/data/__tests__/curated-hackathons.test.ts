import { describe, expect, it } from "vitest";
import { CURATED_BUILDS } from "../curated-builds";
import {
	CURATED_HACKATHONS,
	CURATED_WINNERS_NOTES,
	curatedTimestamp,
	shiftsUtcDate,
	TS_DATE_SHIFTS,
} from "../curated-hackathons";
import { LATEST_WINNERS } from "../recent-hackathon-winners";

describe("curated winners notes", () => {
	it("say why a curated event's winners are missing, dated, for curated events only", () => {
		const events = new Set(CURATED_HACKATHONS.map((h) => h.uname));
		expect(Object.keys(CURATED_WINNERS_NOTES).sort()).toEqual([
			"apac-stellar-hackathon-2026",
			"hackmeridian-2026",
			"stellar-builders-camp-jaipur-2026",
			"stellar-journey-to-mastery-2026",
		]);
		for (const [slug, note] of Object.entries(CURATED_WINNERS_NOTES)) {
			expect(events.has(slug), slug).toBe(true);
			expect(note, slug).toMatch(/checked \d{4}-\d{2}-\d{2}/);
			// Not announced is never "none won".
			expect(note, slug).toMatch(/not a claim/);
			expect(note, slug).not.toMatch(/[\u2013\u2014]/);
		}
		expect(CURATED_WINNERS_NOTES["apac-stellar-hackathon-2026"]).toMatch(
			/^Winners published for one track only: .*Olio 1st in Payment & Consumer Application/,
		);
	});

	it("an event noted as not announced serves no winner", () => {
		const won = new Set([
			...CURATED_BUILDS.filter((b) => b.isWinner).map((b) => b.hackathonSlug),
			LATEST_WINNERS.hackathonUname,
		]);
		const unannounced = Object.entries(CURATED_WINNERS_NOTES).filter(([, n]) =>
			n.startsWith("Not announced upstream"),
		);
		expect(unannounced.map(([slug]) => slug).sort()).toEqual([
			"hackmeridian-2026",
			"stellar-builders-camp-jaipur-2026",
			"stellar-journey-to-mastery-2026",
		]);
		for (const [slug] of unannounced) expect(won.has(slug), slug).toBe(false);
	});
});

describe("curated hackathons", () => {
	it("serves every date as written: no timestamp crosses a UTC date", () => {
		expect(CURATED_HACKATHONS.length).toBeGreaterThan(0);
		expect(TS_DATE_SHIFTS).toEqual([]);
	});

	it("records a shifted timestamp written through the rows' helper", () => {
		const before = TS_DATE_SHIFTS.length;
		try {
			curatedTimestamp("2026-08-21T00:00:00+05:30");
			expect(TS_DATE_SHIFTS.slice(before)).toEqual([
				"2026-08-21T00:00:00+05:30",
			]);
		} finally {
			// Never leave the shared list dirty for the "empty" test.
			TS_DATE_SHIFTS.splice(before);
		}
	});

	it("detects a timestamp whose UTC date is not the date written", () => {
		// Local midnight east of UTC, and late evening west of it, roll over.
		expect(shiftsUtcDate("2026-08-21T00:00:00+05:30")).toBe(true);
		expect(shiftsUtcDate("2026-08-06T23:59:00-03:00")).toBe(true);
		expect(shiftsUtcDate("2026-08-21T15:00:00+05:30")).toBe(false);
		expect(shiftsUtcDate("2026-10-25T09:00:00+00:00")).toBe(false);
	});

	it("keeps HackMeridian 2026 on the organizer's figures, not 2024's", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === "hackmeridian-2026");
		expect(h?.bonus_price).toBe(30000);
		const iso = (s?: number) => new Date((s ?? 0) * 1000).toISOString();
		expect(iso(h?.start_time)).toBe("2026-10-25T09:00:00.000Z");
		expect(iso(h?.end_time)).toBe("2026-10-26T12:00:00.000Z");
		expect(h?.description).toMatch(/Genesis/);
		expect(h?.description).toMatch(/Scale/);
		expect(h?.description).toMatch(/\$30,000/);
		expect(h?.description).toMatch(/calls it 28 hours; its schedule gives 27/);
		// The archived 2024 session's figures.
		expect(h?.description).not.toMatch(/36 hours|\$50,000/);
	});

	it("says HackMeridian 2025's days are derived, and stores them at midday", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === "hackmeridian-2025");
		expect(h?.description).toMatch(/15 to 16 September dates here are derived/);
		const iso = (s?: number) => new Date((s ?? 0) * 1000).toISOString();
		// Midday Rio time on each derived day.
		expect(iso(h?.start_time)).toBe("2025-09-15T15:00:00.000Z");
		expect(iso(h?.end_time)).toBe("2025-09-16T15:00:00.000Z");
	});
});

describe("tracks and judging a curated record declares", () => {
	// Case, a hyphen and the final period aside.
	const plain = (s: string) =>
		s.toLowerCase().replace(/-/g, " ").replace(/\.$/, "");
	/** Whether the record's description states this track as declared: the
	 * name and its description side by side in one clause, the description
	 * right after the name ("Genesis takes ..."), in brackets after it
	 * ("Stellar Unlocked (new uses ..."), or right before it ("belt-progression
	 * builder track"). Containment alone passed swapped descriptions. */
	const backed = (
		description: string,
		t: { name: string; description: string },
	) => {
		const text = plain(description);
		const [name, said] = [plain(t.name), plain(t.description)];
		return [`${name} ${said}`, `${name} (${said}`, `${said} ${name}`].some(
			(clause) => text.includes(clause),
		);
	};

	it("come from the record's own description, with no new claim", () => {
		const declaring = CURATED_HACKATHONS.filter((h) => h.tracks || h.judging);
		expect(declaring.map((h) => h.uname).sort()).toEqual([
			"hackmeridian-2026",
			"stellar-journey-to-mastery-2026",
		]);
		for (const h of declaring) {
			for (const t of h.tracks ?? []) {
				expect(backed(h.description ?? "", t), `${h.uname}: ${t.name}`).toBe(
					true,
				);
				expect(t.description, t.name).not.toMatch(/[\u2013\u2014]/);
			}
			if (h.judging) {
				// Verbatim, not a paraphrase.
				expect(h.description).toContain(h.judging.text);
				expect(h.judging.source).toMatch(/^https:\/\//);
				expect(h.judging.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			}
		}
	});

	// Review: containment alone passed Genesis and Scale with their
	// descriptions swapped, and Scale described as "Stellar".
	it("rejects a description from another track's clause, or a word lifted from elsewhere", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === "hackmeridian-2026");
		const [genesis, scale] = h?.tracks ?? [];
		const text = h?.description ?? "";
		expect(backed(text, { ...genesis, description: scale.description })).toBe(
			false,
		);
		expect(backed(text, { ...scale, description: genesis.description })).toBe(
			false,
		);
		expect(backed(text, { name: "Scale", description: "Stellar" })).toBe(false);
	});

	/** "<category> on <a>, <b> and <c>", ended by ; or . in the sentence: the
	 * category and its list in one clause, nothing cut short or added. */
	const clauseHeld = (
		text: string,
		c: { category: string; criteria: string[] },
	) => {
		const list =
			c.criteria.length < 2
				? c.criteria.join("")
				: `${c.criteria.slice(0, -1).join(", ")} and ${c.criteria.at(-1)}`;
		const clause = `${c.category} on ${list}`;
		return text.includes(`${clause};`) || text.includes(`${clause}.`);
	};

	/** No entry holds a list separator, so "a, b and c" maps to its entries
	 * one way only. */
	const splitsCleanly = (c: { criteria: string[] }) =>
		c.criteria.every((name) => !/, | and /.test(name));

	it("hold each category's judging criteria to one clause of the judging sentence", () => {
		const judged = CURATED_HACKATHONS.filter((h) => h.judging?.criteria);
		expect(judged.map((h) => h.uname)).toEqual(["hackmeridian-2026"]);
		for (const h of judged) {
			const categories = (h.tracks ?? [])
				.filter((t) => t.kind === "category")
				.map((t) => t.name);
			for (const c of h.judging?.criteria ?? []) {
				expect(clauseHeld(h.judging?.text ?? "", c), c.category).toBe(true);
				// One criterion per entry, so the clause splits one way only.
				expect(splitsCleanly(c), c.category).toBe(true);
				// A judged category is one the record declares.
				expect(categories, c.category).toContain(c.category);
				for (const name of c.criteria)
					expect(name).not.toMatch(/[\u2013\u2014]/);
			}
		}
		const h = judged[0];
		expect(h.judging?.criteria?.map((c) => c.category)).toEqual([
			"Genesis",
			"Scale",
		]);
	});

	// Review round 1, finding 7: the clause alone accepts criteria merged into
	// one entry, which only a count pin caught; the rule catches it for any
	// event.
	it("rejects criteria merged into one entry, which the clause alone accepts", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === "hackmeridian-2026");
		const text = h?.judging?.text ?? "";
		const [genesis] = h?.judging?.criteria ?? [];
		const merged = {
			...genesis,
			criteria: [
				`${genesis.criteria[0]}, ${genesis.criteria[1]}`,
				...genesis.criteria.slice(2),
			],
		};
		expect(clauseHeld(text, merged)).toBe(true);
		expect(splitsCleanly(merged)).toBe(false);
		const joined = {
			...genesis,
			criteria: [
				...genesis.criteria.slice(0, 2),
				`${genesis.criteria[2]} and ${genesis.criteria[3]}`,
			],
		};
		expect(splitsCleanly(joined)).toBe(false);
	});

	it("rejects criteria moved between categories, reordered, cut short or invented", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === "hackmeridian-2026");
		const text = h?.judging?.text ?? "";
		const [genesis, scale] = h?.judging?.criteria ?? [];
		expect(clauseHeld(text, { ...genesis, criteria: scale.criteria })).toBe(
			false,
		);
		expect(
			clauseHeld(text, {
				...genesis,
				criteria: [...genesis.criteria].reverse(),
			}),
		).toBe(false);
		expect(
			clauseHeld(text, { ...genesis, criteria: [...genesis.criteria, "team"] }),
		).toBe(false);
		expect(
			clauseHeld(text, { ...genesis, criteria: genesis.criteria.slice(0, 3) }),
		).toBe(false);
		// The last criterion cut short still sits inside the sentence.
		const cut = [...genesis.criteria.slice(0, 3), "continued development"];
		expect(clauseHeld(text, { ...genesis, criteria: cut })).toBe(false);
	});

	it("names HackMeridian 2026's two categories and two thematic tracks", () => {
		const h = CURATED_HACKATHONS.find((x) => x.uname === "hackmeridian-2026");
		expect(h?.tracks?.map((t) => [t.kind, t.name])).toEqual([
			["category", "Genesis"],
			["category", "Scale"],
			["track", "Stellar Unlocked"],
			["track", "Stellar Composed"],
		]);
	});
});
