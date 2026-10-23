import { describe, expect, it } from "vitest";
import { CURATED_BUILDS } from "@/data/curated-builds";
import {
	CURATED_HACKATHONS,
	CURATED_WINNERS_NOTES,
} from "@/data/curated-hackathons";
import {
	eventCoverage,
	eventProfile,
	incompleteRows,
	winnersOnlyEvents,
	winnersOnlyWarning,
} from "@/lib/hackathon-analytics";
import { parseBuildFilters } from "@/lib/hackathon-build-query";
import { type IndexedBuild, indexedFromStored } from "@/lib/hackathon-builds";
import { spec } from "@/lib/openapi-spec";

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

	it("every curated row is a winner, so each curated event is winners-only", () => {
		// A curated row that is not a winner would make its event read as full;
		// add a coverage value for a curated listing before importing one.
		expect(CURATED_BUILDS.every((b) => b.isWinner)).toBe(true);
		for (const slug of new Set(CURATED_BUILDS.map((b) => b.hackathonSlug)))
			expect(eventCoverage(curated(slug)), slug).toBe("winners-only");
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

	it("names one value, with no null in the enum, everywhere coverage is served", () => {
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
			expect(c?.enum).toEqual(["winners-only"]);
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
});
