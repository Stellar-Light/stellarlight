import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";

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
const getEvent = async () => {
	const { GET } = await import("../route");
	const res = await GET(
		new NextRequest("https://x.test/api/hackathons/stellar-hacks-zk"),
		{ params: Promise.resolve({ slug: "stellar-hacks-zk" }) },
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
		expect(body.hackathon.stats).toMatchObject({
			hiddenWinners: null,
			winnersNote: null,
		});
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
		// The old ids named six rows each; neither is reused for one winner.
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

	it("a failed hidden-winner read says nothing, not none", async () => {
		hiddenRows = new Error("db down");
		const body = await getEvent();
		expect(body.hackathon.stats).toMatchObject({
			hiddenWinners: null,
			winnersNote: null,
		});
		expect(body.submissions).toHaveLength(2);
	});
});
