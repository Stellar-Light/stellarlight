import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURATED_BUILDS } from "@/data/curated-builds";
import { CURATED_WINNERS_NOTES } from "@/data/curated-hackathons";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import { BUILD_HOLD } from "@/lib/held-repos";
import type { DoraHacksHackathon } from "@/lib/integrations/dorahacks";
import { spec } from "@/lib/openapi-spec";
import type { HackathonBuild } from "@/payload-types";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../../../../scripts/contract/served-shape";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
const storedEvent = {
	id: "e1",
	slug: "stellar-hacks-zk",
	title: "Stellar Hacks: Real-World ZK",
	description: "# Brief\nBuild with ZK.\n\n# Prizes\n- 1st Place: $5,000",
	repoRequired: true,
	videoRequired: true,
	submissionQuestions: ["Is your repo public?"],
	requirementsSection: "1. An open-source repo.",
	judgingSection: null,
	detailReadAt: "2026-10-05T18:00:00.000Z",
	firstSeenAt: "2026-10-05T18:00:00.000Z",
	lastSeenAt: "2026-10-05T18:00:00.000Z",
};
// Winning rows their teams hid on DoraHacks (sls-092); an Error fails the read.
let hiddenRows:
	| Array<{ buildId: string; placement: string | null; award?: string }>
	| Error = [];
let buildsQuery: { where?: unknown; select?: unknown } | null = null;
// Directory projects the curated roster links; read for their SCF record.
let projectDocs: Array<{ slug: string; scf?: { awarded?: boolean | null } }> =
	[];
let projectsQuery: { where?: unknown; select?: unknown } | null = null;
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(
			async (args: {
				collection: string;
				where?: unknown;
				select?: unknown;
			}) => {
				if (args.collection === "hackathon-builds") {
					buildsQuery = args;
					if (hiddenRows instanceof Error) throw hiddenRows;
					return { docs: hiddenRows };
				}
				if (args.collection === "projects") {
					projectsQuery = args;
					return { docs: projectDocs };
				}
				return {
					docs: args.collection === "hackathon-events" ? [storedEvent] : [],
				};
			},
		),
	})),
}));
const getEvent = async (slug = "stellar-hacks-zk") => {
	const { GET } = await import("../route");
	const res = await GET(
		new NextRequest(`https://x.test/api/hackathons/${slug}`),
		{ params: Promise.resolve({ slug }) },
	);
	return res.json();
};
const live = vi.fn(async () => []);
const doraEvent = {
	id: 2198,
	uname: "stellar-hacks-zk",
	title: "Stellar Hacks: Real-World ZK",
	start_time: 1_750_000_000,
	end_time: 1_760_000_000,
	bonus_price: 10_000,
	hackers_count: 300,
	status: 2,
};
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => [doraEvent]),
	fetchHackathonSubmissions: live,
}));
const build = (id: string, over: Partial<IndexedBuild> = {}): IndexedBuild => ({
	id,
	name: id,
	description: `${id} summary`,
	githubUrl: null,
	demoUrl: null,
	videoUrl: null,
	track: null,
	hackathonPlacement: null,
	award: null,
	isWinner: false,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id}`,
	source: "dorahacks",
	hackathon: {
		title: "Stellar Hacks: Real-World ZK",
		slug: "stellar-hacks-zk",
		endedAt: "2025-10-09",
	},
	haystack: id,
	...over,
});
// Hack+ Alebrije: DoraHacks assigned no winners; BAF's newsletter names
// two of its stored submissions (src/data/winner-overlay.ts).
const BAF =
	"https://bafs-newsletter.beehiiv.com/p/b-news-from-mexico-city-to-lima-this-month-s-web3-route";
const ALEBRIJE_EVENT = {
	...doraEvent,
	id: 2405,
	uname: "alebrije2026",
	title: "Hack+ Alebrije | CDMX 2026",
	winner_announced: false,
} as DoraHacksHackathon;
/** A stored Alebrije row as the DoraHacks sync writes it: unplaced. */
const alebrije = (buildId: string, name: string): HackathonBuild => ({
	id: buildId,
	buildId,
	name,
	hackathonSlug: "alebrije2026",
	hackathonTitle: "Hack+ Alebrije | CDMX 2026",
	endedAt: "2026-03-22",
	placement: null,
	isWinner: false,
	url: `https://dorahacks.io/buidl/${buildId.replace(/\D/g, "")}`,
	firstSeenAt: "2026-10-05T00:00:00.000Z",
	lastSeenAt: "2026-10-22T00:00:00.000Z",
	updatedAt: "2026-10-22T00:00:00.000Z",
	createdAt: "2026-10-05T00:00:00.000Z",
});
/** A curated event's winners as the curated-builds lane stores them
 * (scripts/import-curated-builds.ts) and the index reads them. */
const storedCurated = async (slug: string): Promise<IndexedBuild[]> => {
	const { indexedFromStored } = await import("@/lib/hackathon-builds");
	return CURATED_BUILDS.filter((b) => b.hackathonSlug === slug).map((b) =>
		indexedFromStored({
			id: b.id,
			buildId: b.id,
			name: b.name,
			vision: b.description,
			hackathonSlug: slug,
			hackathonTitle: slug,
			endedAt: "2026-07-24",
			url: b.url,
			isWinner: b.isWinner,
			track: b.track,
			placement: b.placement,
			githubUrl: b.githubUrl,
			demoUrl: b.demoUrl,
			firstSeenAt: "2026-10-22T00:00:00.000Z",
			lastSeenAt: "2026-10-22T00:00:00.000Z",
			updatedAt: "2026-10-22T00:00:00.000Z",
			createdAt: "2026-10-22T00:00:00.000Z",
		}),
	);
};
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => [
		build("w", {
			isWinner: true,
			hackathonPlacement: "1st Place",
			stack: ["soroban-sdk"],
		}),
		build("x", { stack: [] }),
		build("other", { hackathon: { title: "O", slug: "other", endedAt: null } }),
	]),
}));

describe("GET /api/hackathons/{slug} for a DoraHacks event", () => {
	beforeEach(() => {
		live.mockClear();
		hiddenRows = [];
		buildsQuery = null;
		projectDocs = [];
		projectsQuery = null;
	});

	it("serves the stored submissions, page, rules and profile without a live roster read", async () => {
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest("https://x.test/api/hackathons/stellar-hacks-zk"),
			{
				params: Promise.resolve({ slug: "stellar-hacks-zk" }),
			},
		);
		const body = await res.json();
		expect(res.status).toBe(200);
		expect(live).not.toHaveBeenCalled();
		expect(body.submissions.map((s: { id: string }) => s.id)).toEqual([
			"w",
			"x",
		]);
		// The submission shape this endpoint always served: no stored-only facts.
		expect("stack" in body.submissions[0]).toBe(false);
		expect(body.hackathon.description).toMatch(/Build with ZK/);
		expect(body.hackathon.rules).toMatchObject({
			repoRequired: true,
			requirements: "1. An open-source repo.",
			judgingCriteria: null,
		});
		expect(body.hackathon.profile).toMatchObject({
			submissions: 2,
			winners: 1,
		});
		expect(body.hackathon.profile.package.known).toBe(2);
		expect(body.meta.note).toMatch(/stored copy/);
		expect(body.hackathon.stats).toMatchObject({
			hiddenWinners: [],
			winnersNote: null,
		});
	});

	it("names a winner its team hid upstream instead of leaving a gap", async () => {
		// "Winner" carries no rank; the award does, as for served winners.
		hiddenRows = [{ buildId: "h1", placement: "Winner", award: "2nd Place" }];
		const body = await getEvent();
		// This event's winners, hidden upstream; never the submission itself.
		expect(buildsQuery?.where).toEqual({
			and: [
				{ hackathonSlug: { equals: "stellar-hacks-zk" } },
				{ isWinner: { equals: true } },
				{ hiddenUpstream: { equals: true } },
			],
		});
		expect(buildsQuery?.select).toEqual({
			buildId: true,
			placement: true,
			award: true,
		});
		expect(body.hackathon.stats.hiddenWinners).toEqual([
			{ placement: "Winner", award: "2nd Place", placementRank: 2 },
		]);
		expect(body.hackathon.stats.winnersNote).toBe(
			"One winning submission is not served here: its team hid or deleted it on DoraHacks (Winner, 2nd Place).",
		);
	});

	it("a row flagged hidden that this page still serves is not called missing", async () => {
		// The cached index can still hold a submission the sync just flagged.
		hiddenRows = [{ buildId: "w", placement: "1st Place" }];
		const body = await getEvent();
		expect(body.hackathon.stats).toMatchObject({
			hiddenWinners: [],
			winnersNote: null,
		});
	});

	it("with no stored roster the record cannot say none are hidden", async () => {
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce([]);
		const body = await getEvent();
		expect(body.hackathon.stats.hiddenWinners).toBeNull();
		// No roster at all (the live read returned none): its 0 winners is
		// not a count either.
		expect(body.hackathon.stats.winnersNote).toMatch(
			/^Winners could not be checked/,
		);
	});

	it("a curated event has no DoraHacks roster to hide from", async () => {
		const { fetchAllDoraHacksHackathons } = await import(
			"@/lib/integrations/dorahacks"
		);
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
			{ ...doraEvent, source: "curated" } as Awaited<
				ReturnType<typeof fetchAllDoraHacksHackathons>
			>[number],
		]);
		hiddenRows = [{ buildId: "h1", placement: "2nd Place" }];
		const body = await getEvent();
		expect(body.hackathon.stats).toMatchObject({
			hiddenWinners: null,
			winnersNote: null,
		});
	});

	it("winner rows carry what the winner won and became; submissions keep their shape", async () => {
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		const after = { lastCommitAt: "2026-03-01T00:00:00.000Z", archived: false };
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce([
			build("w3", {
				isWinner: true,
				hackathonPlacement: "3rd Place - $1,250 in XLM",
				award: "$10,000 XLM Prize",
				project: {
					slug: "acme",
					name: "Acme",
					status: "Live",
					scfAwarded: true,
				},
				activity: after,
			}),
			build("x", { activity: after }),
		]);
		const body = await getEvent();
		// award is the category pool; prizeUsd is what this placement won.
		expect(body.winners[0]).toMatchObject({
			id: "w3",
			award: "$10,000 XLM Prize",
			prizeUsd: 1250,
			project: { slug: "acme", status: "Live", scfAwarded: true },
			afterEvent: "commits 90+ days after",
			lastCommitAt: "2026-03-01T00:00:00.000Z",
		});
		for (const s of body.submissions)
			for (const k of ["prizeUsd", "project", "afterEvent", "lastCommitAt"])
				expect(k in s).toBe(false);
	});

	it("the curated roster gives each winner its own id, its project and its SCF record", async () => {
		const { fetchAllDoraHacksHackathons } = await import(
			"@/lib/integrations/dorahacks"
		);
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
			{
				...doraEvent,
				uname: "stellar-builder-summit-2026",
				title: "Stellar Builder Summit 2026",
				source: "curated",
			} as Awaited<ReturnType<typeof fetchAllDoraHacksHackathons>>[number],
		]);
		projectDocs = [
			{ slug: "trustless-work", scf: { awarded: true } },
			{ slug: "acta", scf: { awarded: false } },
			{ slug: "stellar-memory", scf: { awarded: null } },
		];
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest(
				"https://x.test/api/hackathons/stellar-builder-summit-2026",
			),
			{ params: Promise.resolve({ slug: "stellar-builder-summit-2026" }) },
		);
		const ws = (await res.json()).winners as Array<{
			id: string;
			slug: string | null;
			scfAwarded: boolean | null;
			prizeUsd?: number | null;
		}>;
		expect(ws).toHaveLength(12);
		// `rank` is the place within a track: twelve winners had two ids.
		expect(new Set(ws.map((w) => w.id)).size).toBe(12);
		// Production's rank-based ids, -1 and -2, named six rows each;
		// neither is reused for a single winner.
		for (const old of ["-1", "-2"])
			expect(ws.map((w) => w.id)).not.toContain(
				`winner-stellar-builder-summit-2026${old}`,
			);
		expect(ws.map((w) => w.id)).toContain(
			"winner-stellar-builder-summit-2026-quietbook",
		);
		expect(ws.every((w) => typeof w.prizeUsd === "number")).toBe(true);
		expect(projectsQuery?.select).toEqual({ slug: true, scf: true });
		const scfOf = (slug: string) =>
			ws.filter((w) => w.slug === slug).map((w) => w.scfAwarded);
		// It said false for every winner; Trustless Work holds an award.
		expect(scfOf("trustless-work")).toEqual([true, true]);
		expect(scfOf("acta")).toEqual([false]);
		// A linked project with no record here is unknown, not unfunded,
		// and so is a project on record whose SCF field is empty.
		expect(scfOf("quietbook")).toEqual([null]);
		expect(scfOf("stellar-memory")).toEqual([null]);
	});

	it("an ended DoraHacks event with no winner says what DoraHacks' flag reports, never 'none won'", async () => {
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		const { fetchAllDoraHacksHackathons } = await import(
			"@/lib/integrations/dorahacks"
		);
		const note = async (over: Partial<DoraHacksHackathon>) => {
			vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce([
				build("x"),
				build("y"),
			]);
			vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
				{ ...doraEvent, ...over } as Awaited<
					ReturnType<typeof fetchAllDoraHacksHackathons>
				>[number],
			]);
			const body = await getEvent();
			expect(body.hackathon.stats.winners).toBe(0);
			expect(body.winners).toEqual([]);
			return body.hackathon.stats.winnersNote;
		};
		expect(await note({ winner_announced: false })).toMatch(
			/^Not announced upstream: DoraHacks lists this event's winners as not announced \(winner_announced false in its event listing, .*\).* This is not a claim that no one won/,
		);
		expect(await note({ winner_announced: true })).toMatch(
			/^DoraHacks lists this event's winners as announced \(winner_announced true\), but no submission served here carries a prize, so its winners are not recorded here/,
		);
		// A listing without the flag could not say: nothing, not "not announced".
		expect(await note({ winner_announced: null })).toBeNull();
		expect(await note({})).toBeNull();
		// An event still running has no winners yet.
		expect(
			await note({
				winner_announced: false,
				end_time: Math.floor(Date.now() / 1000) + 86_400,
			}),
		).toBeNull();
	});

	it("with no stored copy and a failed live roster, the winners could not be checked", async () => {
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		const { fetchAllDoraHacksHackathons } = await import(
			"@/lib/integrations/dorahacks"
		);
		const outage = async (over: Partial<DoraHacksHackathon>) => {
			vi.mocked(getHackathonBuildsIndex).mockRejectedValueOnce(
				new Error("store down"),
			);
			// The live read now throws when DoraHacks' winner list cannot be read.
			live.mockRejectedValueOnce(
				new Error("DoraHacks winners for stellar-hacks-zk: HTTP 429"),
			);
			vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
				{ ...doraEvent, ...over } as Awaited<
					ReturnType<typeof fetchAllDoraHacksHackathons>
				>[number],
			]);
			const { GET } = await import("../route");
			const res = await GET(
				new NextRequest("https://x.test/api/hackathons/stellar-hacks-zk"),
				{ params: Promise.resolve({ slug: "stellar-hacks-zk" }) },
			);
			expect(res.status).toBe(200);
			const body = await res.json();
			expect(body.winners).toEqual([]);
			expect(body.hackathon.stats.totalSubmissions).toBeNull();
			return body.hackathon.stats.winnersNote as string | null;
		};
		// An outage is not "not recorded": nothing could be checked.
		for (const flag of [true, null])
			expect(await outage({ winner_announced: flag })).toMatch(
				/^Winners could not be checked: no submission of this event could be read .*so this 0 is not a count/,
			);
		// Not announced still stands on DoraHacks' own flag, without claiming
		// a roster was read.
		const notAnnounced = await outage({ winner_announced: false });
		expect(notAnnounced).toMatch(/^Not announced upstream/);
		expect(notAnnounced).not.toMatch(/no submission served here/);
	});

	it("winners named off DoraHacks carry the page that names them, and the note says who is not served", async () => {
		const { getHackathonBuildsIndex, indexedFromStored } = await import(
			"@/lib/hackathon-builds"
		);
		const { fetchAllDoraHacksHackathons } = await import(
			"@/lib/integrations/dorahacks"
		);
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce(
			[
				alebrije("dorahacks-buidl-41339", "Nomilar"),
				alebrije("dorahacks-buidl-41505", "MañanaSeguro"),
				alebrije("dorahacks-buidl-41502", "GIBBOR"),
			].map((d) => indexedFromStored(d)),
		);
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
			ALEBRIJE_EVENT,
		]);
		const body = await getEvent("alebrije2026");
		expect(
			body.winners.map((w: Record<string, unknown>) => [
				w.name,
				w.hackathonPlacement,
				w.placementRank,
				w.winnerSource,
				w.url,
			]),
		).toEqual([
			["MañanaSeguro", "Winner", null, BAF, "https://dorahacks.io/buidl/41505"],
			["GIBBOR", "Winner", null, BAF, "https://dorahacks.io/buidl/41502"],
		]);
		// No places: the order is not a ranking.
		expect(body.winnersRanked).toBe(false);
		expect(body.hackathon.stats.winners).toBe(2);
		expect(body.hackathon.stats.winnersNote).toMatch(
			/^Winners named by BAF's newsletter \(2026-05-04\), not by DoraHacks, which assigned none when checked on 2026-10-22: .*Seyf is not served/,
		);
		expect(body.hackathon.profile.winners).toBe(2);
		// The submissions list keeps its shape; the source is on winner rows.
		for (const s of body.submissions) expect("winnerSource" in s).toBe(false);
		expect(
			body.submissions
				.filter((s: { isWinner: boolean }) => s.isWinner)
				.map((s: { name: string }) => s.name),
		).toEqual(["MañanaSeguro", "GIBBOR"]);
	});

	it("an event off DoraHacks says why its winners are missing, from its dated note", async () => {
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		const { fetchAllDoraHacksHackathons } = await import(
			"@/lib/integrations/dorahacks"
		);
		const curated = (uname: string) =>
			({
				...doraEvent,
				uname,
				source: "curated",
				winner_announced: false,
			}) as Awaited<ReturnType<typeof fetchAllDoraHacksHackathons>>[number];
		// No winner published: the note, not a bare 0.
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
			curated("stellar-journey-to-mastery-2026"),
		]);
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce([]);
		const journey = await getEvent("stellar-journey-to-mastery-2026");
		expect(journey.hackathon.stats.winners).toBe(0);
		expect(journey.hackathon.stats.winnersNote).toBe(
			CURATED_WINNERS_NOTES["stellar-journey-to-mastery-2026"],
		);
		// One track's winner stored: it is served, and the note says the
		// event is partial.
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
			curated("apac-stellar-hackathon-2026"),
		]);
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce(
			await storedCurated("apac-stellar-hackathon-2026"),
		);
		const apac = await getEvent("apac-stellar-hackathon-2026");
		expect(
			apac.winners.map((w: Record<string, unknown>) => [
				w.name,
				w.track,
				w.placementRank,
			]),
		).toEqual([["Olio", "Payment & Consumer Application", 1]]);
		expect(apac.hackathon.stats.winnersNote).toMatch(
			/^Winners published for one track only/,
		);
	});

	it("ranks a Champion first and its runners-up after it", async () => {
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		const { fetchAllDoraHacksHackathons } = await import(
			"@/lib/integrations/dorahacks"
		);
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
			{
				...doraEvent,
				uname: "build-on-stellar-philippines-2026",
				source: "curated",
				winner_announced: true,
			} as Awaited<ReturnType<typeof fetchAllDoraHacksHackathons>>[number],
		]);
		// As the curated-builds lane stores them, reversed so the order is the
		// ranking's, not the file's.
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce(
			(await storedCurated("build-on-stellar-philippines-2026")).reverse(),
		);
		const body = await getEvent("build-on-stellar-philippines-2026");
		expect(
			body.winners.map((w: Record<string, unknown>) => [
				w.name,
				w.hackathonPlacement,
				w.placementRank,
			]),
		).toEqual([
			["AbotPera", "Champion", 1],
			["PinkRaft", "1st Runner-Up", 2],
			["Axial", "2nd Runner-Up", 3],
			// A special award has no place; unranked rows keep their order.
			["TyFi", "Best Use of Stellar", null],
			["Sobre", "Best Use of Stellar", null],
		]);
		expect(body.winnersRanked).toBe(true);
		// Every winner the source names is served: nothing to add.
		expect(body.hackathon.stats.winnersNote).toBeNull();
	});

	it("a failed hidden-winner read says nothing, not none", async () => {
		hiddenRows = new Error("db down");
		const body = await getEvent();
		expect(body.hackathon.stats).toMatchObject({
			hiddenWinners: null,
			winnersNote: null,
		});
		expect(body.submissions).toHaveLength(2);
	});

	it("declares every served field and null outside the open maps: winners, stats, rules, profile", async () => {
		// hackathon, submissions[] and tracks[] are open maps
		// (additionalProperties: true): a key the spec does not name passes
		// there unjudged. Their declared children (stats, rules, profile,
		// description) are judged like any other field.
		const undeclared = (body: unknown) =>
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/{slug}"),
				body,
			);
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		const { fetchAllDoraHacksHackathons } = await import(
			"@/lib/integrations/dorahacks"
		);
		// A stored winner with a held repo, a project and repo activity;
		// voteCount is null on every stored row (DoraHacks stopped serving it).
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce([
			build("w", {
				isWinner: true,
				hackathonPlacement: "1st Place - $5,000 in XLM",
				security: BUILD_HOLD,
				project: {
					slug: "acme",
					name: "Acme",
					basis: "repo",
					status: "Live",
					scfAwarded: true,
					factsReadAt: "2026-10-05T00:00:00.000Z",
				},
				activity: { lastCommitAt: null, archived: false },
			}),
			build("x"),
		]);
		hiddenRows = [{ buildId: "h1", placement: "2nd Place" }];
		const stored = await getEvent();
		expect(stored.winners[0].voteCount).toBeNull();
		expect(stored.winners[0].security).toEqual(BUILD_HOLD);
		expect(stored.hackathon.stats.outcomes.unknown).toBe(2);

		// The curated roster: who built it, and the directory row's fields.
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
			{
				...doraEvent,
				uname: "stellar-builder-summit-2026",
				source: "curated",
			} as Awaited<ReturnType<typeof fetchAllDoraHacksHackathons>>[number],
		]);
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce([]);
		const { GET } = await import("../route");
		const roster = await (
			await GET(
				new NextRequest(
					"https://x.test/api/hackathons/stellar-builder-summit-2026",
				),
				{ params: Promise.resolve({ slug: "stellar-builder-summit-2026" }) },
			)
		).json();
		expect(roster.winners[0]).toHaveProperty("builder");
		expect(roster.hackathon.stats.outcomes).toBeNull();

		// Winners named off DoraHacks: their source, and the event's note
		// (a hidden winner's note would come first).
		hiddenRows = [];
		const { indexedFromStored } = await import("@/lib/hackathon-builds");
		vi.mocked(fetchAllDoraHacksHackathons).mockResolvedValueOnce([
			ALEBRIJE_EVENT,
		]);
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce([
			indexedFromStored(alebrije("dorahacks-buidl-41502", "GIBBOR")),
		]);
		const overlay = await getEvent("alebrije2026");
		expect(overlay.winners[0].winnerSource).toBe(BAF);
		expect(overlay.hackathon.stats.winnersNote).toMatch(/^Winners named/);
		expect({
			stored: undeclared(stored),
			roster: undeclared(roster),
			overlay: undeclared(overlay),
		}).toEqual({ stored: [], roster: [], overlay: [] });
	});
});

describe("an unknown slug", () => {
	it("404s with a way forward in the error text itself and the closest known slugs", async () => {
		const { GET } = await import("../route");
		const slug = "stellar-hacks-quantum-2031";
		const res = await GET(
			new NextRequest(`https://x.test/api/hackathons/${slug}`),
			{ params: Promise.resolve({ slug }) },
		);
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.error).toContain(`hackathon not found: ${slug}`);
		expect(body.error).toContain("/api/hackathons?q=");
		expect(body.error).toContain("stellar-hacks-zk");
		expect(body.closestSlugs).toEqual(["stellar-hacks-zk"]);
		const schema = (
			spec.paths["/api/hackathons/{slug}"] as {
				get: {
					responses: Record<
						string,
						{ content: Record<string, { schema: unknown }> }
					>;
				};
			}
		).get.responses["404"].content["application/json"].schema;
		expect(undeclaredInServed(spec, schema, body)).toEqual([]);
	});
});

describe("rules: what a null section means", () => {
	it("says in the spec that a null judgingCriteria is a read page with no judging section", () => {
		type Node = { properties: Record<string, Node>; description?: string };
		const detail = (spec.components.schemas as unknown as Record<string, Node>)
			.HackathonDetailResponse;
		const rules = detail.properties.hackathon.properties.rules.properties;
		expect(rules.judgingCriteria.description).toMatch(
			/null = the page was read .* no judging section/,
		);
		expect(rules.requirements.description).toMatch(
			/null = the page was read .* no requirements section/,
		);
	});
});
