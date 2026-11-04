import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CURATED_BUILDS, HACKPROOF_BUILDS } from "@/data/curated-builds";
import {
	CURATED_COVERAGE_NOTES,
	CURATED_HACKATHONS,
	CURATED_WINNERS_NOTES,
} from "@/data/curated-hackathons";
import { curatedFacts } from "@/lib/curated-import";
import {
	COVERAGE_VALUES,
	coverageEvents,
	eventCoverage,
	eventProfile,
	incompleteEvents,
	incompleteRows,
	partialLeftOutWarning,
	partialNote,
	partialWarning,
	winnersOnlyEvents,
	winnersOnlyWarning,
} from "@/lib/hackathon-analytics";
import { ENTRY_BASES } from "@/lib/hackathon-build-links";
import { parseBuildFilters } from "@/lib/hackathon-build-query";
import { type IndexedBuild, indexedFromStored } from "@/lib/hackathon-builds";
import { spec } from "@/lib/openapi-spec";
import type { HackathonBuild } from "@/payload-types";

const synced = (id: string, event: string, isWinner = false): IndexedBuild => ({
	id: `dorahacks-buidl-${id}`,
	name: id,
	description: null,
	githubUrl: null,
	demoUrl: null,
	videoUrl: null,
	track: null,
	hackathonPlacement: isWinner ? "1st Place" : null,
	award: null,
	isWinner,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id}`,
	source: "dorahacks",
	hackathon: { title: event, slug: event, endedAt: "2026-04-13" },
	haystack: id,
});

/** The curated rows as the import stores them and the index reads them. */
const curated = (slug?: string): IndexedBuild[] =>
	CURATED_BUILDS.filter((b) => !slug || b.hackathonSlug === slug).map((b) =>
		indexedFromStored({
			id: b.id,
			buildId: b.id,
			name: b.name,
			vision: b.description,
			hackathonSlug: b.hackathonSlug,
			hackathonTitle: b.hackathonSlug,
			endedAt: "2025-09-16",
			url: b.url,
			isWinner: b.isWinner,
			track: b.track,
			placement: b.placement,
			githubUrl: b.githubUrl,
			demoUrl: b.demoUrl,
			firstSeenAt: "2026-10-23T00:00:00.000Z",
			lastSeenAt: "2026-10-23T00:00:00.000Z",
			updatedAt: "2026-10-23T00:00:00.000Z",
			createdAt: "2026-10-23T00:00:00.000Z",
		}),
	);

/** HackMeridian 2026's rows as the import writes them (curatedFacts) and
 * the index reads them. */
const hackproof = (): IndexedBuild[] => {
	const ev = CURATED_HACKATHONS.find((h) => h.uname === "hackmeridian-2026");
	if (!ev) throw new Error("hackmeridian-2026 is not curated");
	return HACKPROOF_BUILDS.map((b) =>
		indexedFromStored({
			...(curatedFacts(b, ev) as unknown as HackathonBuild),
			id: b.id,
			firstSeenAt: "2026-11-04T00:00:00.000Z",
			lastSeenAt: "2026-11-04T00:00:00.000Z",
			updatedAt: "2026-11-04T00:00:00.000Z",
			createdAt: "2026-11-04T00:00:00.000Z",
		}),
	);
};

describe("an event's coverage, from its stored rows", () => {
	it("is winners-only when every row is a curated winner, full when the sync stored the rows, null when none are stored", () => {
		expect(eventCoverage(curated("hackmeridian-2025"))).toBe("winners-only");
		expect(eventCoverage([synced("1", "zk"), synced("2", "zk", true)])).toBe(
			"full",
		);
		// A synced event whose only stored row won is still the sync's listing.
		expect(eventCoverage([synced("3", "zk", true)])).toBe("full");
		expect(eventCoverage([])).toBeNull();
		// A synced row beside curated winners: the sync's listing is the field.
		expect(
			eventCoverage([...curated("hackmeridian-2025"), synced("4", "zk")]),
		).toBe("full");
	});

	it("every hand-curated row is a winner, so each such event is winners-only; HackProof's list is partial", () => {
		expect(CURATED_BUILDS.every((b) => b.isWinner)).toBe(true);
		for (const slug of new Set(CURATED_BUILDS.map((b) => b.hackathonSlug)))
			expect(eventCoverage(curated(slug)), slug).toBe("winners-only");
		// A curated row that is not a winner makes its event partial, never full.
		expect(HACKPROOF_BUILDS.some((b) => !b.isWinner)).toBe(true);
		expect(eventCoverage(hackproof())).toBe("partial");
	});

	it("names each winners-only event in an index with its winners", () => {
		const index = [...curated(), synced("1", "zk"), synced("2", "zk", true)];
		expect([...winnersOnlyEvents(index)]).toEqual([
			["hackmeridian-2025", 6],
			["build-on-stellar-philippines-2026", 5],
			["apac-stellar-hackathon-2026", 1],
		]);
	});
});

describe("no ratio over incomplete rows", () => {
	it("says why an event's rows are incomplete: winners only, or winners published in part", () => {
		expect(incompleteRows("hackmeridian-2025", "winners-only")).toBe(
			"only its winners are stored (coverage winners-only)",
		);
		// APAC: winners only, and one track's winners published.
		expect(incompleteRows("apac-stellar-hackathon-2026", "winners-only")).toBe(
			"only its winners are stored (coverage winners-only), and its winners are published only in part (getHackathon stats.winnersNote)",
		);
		expect(incompleteRows("apac-stellar-hackathon-2026", null)).toBe(
			"its winners are published only in part (getHackathon stats.winnersNote)",
		);
		expect(incompleteRows("stellar-hacks-zk", "full")).toBeNull();
		expect(incompleteRows("stellar-hacks-zk", null)).toBeNull();
		// A note that says not announced gives that reason, not "in part".
		expect(incompleteRows("stellar-builders-camp-jaipur-2026", null)).toBe(
			"its winners are not announced upstream (getHackathon stats.winnersNote)",
		);
		expect(incompleteRows("stellar-journey-to-mastery-2026", null)).toBe(
			"its winners are not announced upstream (getHackathon stats.winnersNote)",
		);
	});

	it("a winners note is kept only for curated events, so any rows it covers are curated winners", () => {
		// Their rows can then only be winners-only: the import writes curated
		// events only, and every curated row is a winner. Analyze leaves out
		// winners-only rows by that rule alone.
		const curatedEvents = new Set(CURATED_HACKATHONS.map((h) => h.uname));
		for (const slug of Object.keys(CURATED_WINNERS_NOTES))
			expect(curatedEvents.has(slug), slug).toBe(true);
	});
});

describe("the event profile", () => {
	it("says it describes the winners only and serves no submission count on a winners-only event", () => {
		const p = eventProfile(curated("hackmeridian-2025"));
		expect(p.coverage).toBe("winners-only");
		expect(p.submissions).toBeNull();
		expect(p.winners).toBe(6);
		// The facets stay: they describe the six winners.
		expect(p.category.builds).toBe(6);
	});

	it("serves no share over a winners-only event's rows, only their counts", () => {
		const categorized = curated("build-on-stellar-philippines-2026").map(
			(b, i) => ({
				...b,
				categories: [{ type: i < 3 ? "Payments" : "DeFi", score: 0.8 }],
			}),
		);
		const p = eventProfile(categorized);
		expect(p.category).toEqual({
			builds: 5,
			known: 5,
			unknown: 0,
			values: [
				{ value: "Payments", builds: 3, winners: 3, share: null },
				{ value: "DeFi", builds: 2, winners: 2, share: null },
			],
		});
	});

	it("is unchanged on a full event: same keys, same order, no coverage", () => {
		const p = eventProfile([synced("1", "zk"), synced("2", "zk", true)]);
		expect(Object.keys(p)).toEqual([
			"submissions",
			"winners",
			"category",
			"library",
			"package",
			"activity",
			"project",
			"projectStatus",
			"scf",
		]);
		expect(p).toMatchObject({ submissions: 2, winners: 1 });
	});
});

describe("a hackathon filter naming a winners-only event", () => {
	const index = [...curated(), synced("1", "zk"), synced("2", "zk", true)];
	const listed = async () => ({ events: [], complete: true });
	const parse = (qs: string) =>
		parseBuildFilters(new URLSearchParams(qs), "keyword", index, listed);

	it("warns that its rows are its winners, not its field", async () => {
		const r = await parse("hackathon=hackmeridian-2025");
		if ("error" in r) throw new Error("unexpected 400");
		expect(r.warnings).toEqual([
			"only the winners of hackmeridian-2025 are stored (6 rows, coverage winners-only); its other submissions are not, so its rows are its winners, not its field, whose size and mix are unknown, and no share is computed over them",
		]);
	});

	it("names several in one line, and says nothing for a full event", async () => {
		const r = await parse(
			"hackathon=zk,build-on-stellar-philippines-2026,apac-stellar-hackathon-2026",
		);
		if ("error" in r) throw new Error("unexpected 400");
		expect(r.warnings).toEqual([
			winnersOnlyWarning([
				["build-on-stellar-philippines-2026", 5],
				["apac-stellar-hackathon-2026", 1],
			]),
		]);
		expect(r.warnings[0]).toBe(
			"only the winners of build-on-stellar-philippines-2026 (5) and apac-stellar-hackathon-2026 (1) are stored (coverage winners-only); their other submissions are not, so their rows are their winners, not their fields, whose size and mix are unknown, and no share is computed over them",
		);
		const full = await parse("hackathon=zk");
		if ("error" in full) throw new Error("unexpected 400");
		expect(full.warnings).toEqual([]);
	});
});

describe("the spec declares coverage and the nulls it brings", () => {
	type Node = {
		properties?: Record<string, Node>;
		items?: Node;
		enum?: unknown[];
		nullable?: boolean;
	};
	const paths = spec.paths as unknown as Record<
		string,
		{
			get: {
				responses: Record<
					string,
					{ content: Record<string, { schema: Node }> }
				>;
			};
		}
	>;
	const body = (path: string) =>
		paths[path].get.responses["200"].content["application/json"].schema;
	const detail = (spec.components.schemas as unknown as Record<string, Node>)
		.HackathonDetailResponse;

	it("names its values, with no null in the enum, everywhere coverage is served", () => {
		const row = body("/api/hackathons/compare").properties?.hackathons?.items;
		const group = body("/api/hackathons/analyze").properties?.groups?.items;
		const event = detail.properties?.hackathon;
		for (const c of [
			row?.properties?.coverage,
			row?.properties?.profile?.properties?.coverage,
			group?.properties?.coverage,
			event?.properties?.coverage,
			event?.properties?.profile?.properties?.coverage,
		]) {
			expect(c?.enum).toEqual(["winners-only", "partial"]);
			expect(c?.enum).toEqual([...COVERAGE_VALUES]);
			expect(c?.enum).not.toContain(null);
		}
	});

	it("declares nullable every count a winners-only event serves as null", () => {
		const row = body("/api/hackathons/compare").properties?.hackathons?.items;
		const event = detail.properties?.hackathon;
		for (const n of [
			row?.properties?.submissionCount,
			row?.properties?.profile?.properties?.submissions,
			event?.properties?.profile?.properties?.submissions,
			event?.properties?.stats?.properties?.totalSubmissions,
			event?.properties?.stats?.properties?.outcomes,
			event?.properties?.tracks?.items?.properties?.submissionCount,
			detail.properties?.tracks?.items?.properties?.submissionCount,
			row?.properties?.prizePerWinnerUSD,
		])
			expect(n?.nullable).toBe(true);
	});

	it("declares the row notes that say why a ratio is null", () => {
		const row = body("/api/hackathons/compare").properties?.hackathons?.items;
		expect(row?.properties?.notes?.items).toMatchObject({ type: "string" });
	});

	// Review: all-event q=lance gave builds entries 60 against analyze's 59,
	// while both texts said the two are equal but for declared packages.
	it("says where builds' entries and analyze's total differ: declared packages and left-out rows", () => {
		const entries = (
			body("/api/hackathons/builds").properties?.meta?.properties?.counts
				?.properties?.entries as { description?: string } | undefined
		)?.description;
		expect(entries).toMatch(/declared package/);
		expect(entries).toMatch(/winners-only event's rows/);
		const ref = readFileSync(
			join(process.cwd(), "public/skills/references/api-reference.md"),
			"utf8",
		);
		const units = ref.slice(ref.indexOf("**Units:**")).split("\n")[0];
		expect(units).toMatch(/declared package/);
		expect(units).toMatch(/winners-only event's rows/);
	});

	it("says across every event that the left-out events are not listed", () => {
		const warnings = (
			body("/api/hackathons/analyze").properties?.meta?.properties?.warnings as
				| { description?: string }
				| undefined
		)?.description;
		expect(warnings).toMatch(
			/facet=event and by=event do not list those events/,
		);
	});
});

// Owner decision 2026-11-04: a list from a source other than the organizer
// (HackProof's, for HackMeridian 2026) is coverage partial: counts served,
// shares null, left out of cross-event counts with one warning line.
describe("a partial list: counted, never shared out, never mixed into other events", () => {
	it("is partial when every row is curated and one is not a winner", () => {
		expect(eventCoverage(hackproof())).toBe("partial");
		// Its six placements alone would be winners-only.
		expect(eventCoverage(hackproof().filter((b) => b.isWinner))).toBe(
			"winners-only",
		);
		// A DoraHacks row among them makes the listing the sync's.
		expect(
			eventCoverage([...hackproof(), synced("1", "hackmeridian-2026")]),
		).toBe("full");
		expect([
			...coverageEvents([...hackproof(), synced("1", "zk")], "partial"),
		]).toEqual([["hackmeridian-2026", 97]]);
	});

	it("its profile counts the 97 rows and the 6 placements, with no submission count and no share", () => {
		const rows = hackproof().map((b, i) => ({
			...b,
			categories: [{ type: i % 2 ? "Payments" : "DeFi", score: 0.8 }],
		}));
		const p = eventProfile(rows);
		expect(p.coverage).toBe("partial");
		expect(p.submissions).toBeNull();
		expect(p.winners).toBe(6);
		expect(p.category).toMatchObject({ builds: 97, known: 97, unknown: 0 });
		expect(p.category.values.map((v) => [v.value, v.builds, v.share])).toEqual([
			["DeFi", 49, null],
			["Payments", 48, null],
		]);
		// Not read yet: the sync lane derives these, so they are unknown, never none.
		expect(p.project).toMatchObject({ builds: 97, known: 0, unknown: 97 });
		expect(p.package).toMatchObject({ known: 0, unknown: 97 });
	});

	it("no ratio over it: the coverage and the secondhand placements say why", () => {
		expect(incompleteRows("hackmeridian-2026", "partial")).toBe(
			"its stored rows are a partial list from a source other than the organizer (coverage partial), and its placements are secondhand, named by no organizer page (getHackathon stats.winnersNote)",
		);
		// Stored or not yet, the event never enters a rate.
		expect(incompleteRows("hackmeridian-2026", null)).toBe(
			"its placements are secondhand, named by no organizer page (getHackathon stats.winnersNote)",
		);
		expect([
			...incompleteEvents([
				...hackproof(),
				synced("1", "zk"),
				synced("2", "zk", true),
			]),
		]).toEqual(["hackmeridian-2026"]);
	});

	it("a hackathon filter naming it says its rows are not its field", async () => {
		const index = [...hackproof(), ...curated(), synced("1", "zk")];
		const listed = async () => ({ events: [], complete: true });
		const r = await parseBuildFilters(
			new URLSearchParams("hackathon=hackmeridian-2026,hackmeridian-2025"),
			"keyword",
			index,
			listed,
		);
		if ("error" in r) throw new Error("unexpected 400");
		expect(r.warnings).toEqual([
			winnersOnlyWarning([["hackmeridian-2025", 6]]),
			"the stored rows of hackmeridian-2026 are a partial list from a source other than the organizer (97 rows, coverage partial), not its field, whose size and mix are unknown: its rows are counted and no share is computed over them",
		]);
		expect(
			partialWarning([
				["a", 2],
				["b", 1],
			]),
		).toBe(
			"the stored rows of a (2) and b (1) are partial lists from sources other than the organizers (coverage partial), not their fields, whose size and mix are unknown: their rows are counted and no share is computed over them",
		);
		expect(partialLeftOutWarning([["hackmeridian-2026", 97]])).toBe(
			"left out of every count and share: the 97 rows of hackmeridian-2026, a partial list from a source other than the organizer (coverage partial); the rest covers events whose full listing is stored",
		);
	});

	it("getHackathon's coverage note gives the rows and the nulls, then the dated note on the list's source", () => {
		expect(partialNote(97)).toBe(
			"Not this event's list of submissions: the 97 rows stored here are a partial list from a source other than the organizer, each with an entryBasis that says why it is stored. The size and mix of the field are unknown, so totalSubmissions, each track's submissionCount and outcomes are null, and profile counts these rows with every share null.",
		);
		const note = CURATED_COVERAGE_NOTES["hackmeridian-2026"];
		expect(note).toMatch(
			/HackProof \(https:\/\/github\.com\/devodii\/hackproof, MIT licensed, commit ea7e1982\)/,
		);
		expect(note).toMatch(/checked \d{4}-\d{2}-\d{2}/);
		expect(note).not.toMatch(/[\u2013\u2014]/);
		// Each basis it names is one the rows carry.
		for (const b of ENTRY_BASES) expect(note).toContain(b);
	});
});

describe("the spec says what each basis means, and never more", () => {
	type Node = {
		properties?: Record<string, Node>;
		items?: Node;
		enum?: unknown[];
		description?: string;
	};
	const paths = spec.paths as unknown as Record<
		string,
		{
			get: {
				responses: Record<
					string,
					{ content: Record<string, { schema: Node }> }
				>;
			};
		}
	>;
	const body = (path: string) =>
		paths[path].get.responses["200"].content["application/json"].schema;
	const detail = (spec.components.schemas as unknown as Record<string, Node>)
		.HackathonDetailResponse;

	it("serves entryBasis from ENTRY_BASES wherever a stored row is served, with the same text", () => {
		const row = body("/api/hackathons/builds").properties?.builds?.items
			?.properties;
		const one = body("/api/hackathons/builds/{id}").properties?.build
			?.properties;
		const winner = detail.properties?.winners?.items?.properties;
		const sub = detail.properties?.submissions?.items?.properties;
		const all = [row, one, winner, sub].map((p) => p?.entryBasis);
		for (const b of all) {
			expect(b?.enum).toEqual([...ENTRY_BASES]);
			expect(b?.description).toBe(all[0]?.description);
		}
		const text = all[0]?.description ?? "";
		// Each basis, in its own words: the team's claim, or the list's placement.
		expect(text).toMatch(
			/repo-names-event: Scout's own read of the repo's text/,
		);
		expect(text).toMatch(/the team's own claim/);
		expect(text).toMatch(
			/placement-listed: the list the row comes from names a placement/,
		);
		expect(text).toMatch(
			/never a record that the organizer received it as an entry/,
		);
		for (const p of [row, one, winner, sub]) {
			expect(p?.contracts?.description).toMatch(
				/A floor, not every contract the team deployed/,
			);
			expect(p?.contracts?.description).toMatch(
				/could not be checked is left out, never served as absent/,
			);
		}
		expect(row?.winnerSource?.description).toMatch(/a secondhand source/);
	});
});
