/**
 * Event pages replay (lane EP). Runs the real GET handler of
 * /api/hackathons/{slug} over inputs rebuilt from a capture.mjs capture and
 * writes every response (status, content type, cache header, Retry-After
 * and the body's bytes), one JSON line per request, to REPLAY_OUT. Run it on
 * the base tree and on this branch with the same capture, then `cmp` the
 * two files: the route's body moved to src/lib/hackathon-detail.ts and must
 * serve the same bytes.
 *
 * Inputs, from each captured event: its listing row (the curated file's own
 * row for a curated event), its served submissions as the stored index (a
 * winner's project, winner source and last commit kept), its rules and page
 * as the stored event, its hidden winners, and the curated roster's SCF
 * records. Then the branches a capture cannot reach: a `hackathons`
 * collection row (with projects, and the curated roster behind one), a live
 * roster read, failed reads, a store outage and a thrown read.
 *
 *   REPLAY_LIVE=<capture.json> REPLAY_OUT=<out.jsonl> pnpm exec vitest run \
 *     --config improvements/audits/2026-10-23-event-pages/vitest.replay.config.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CURATED_HACKATHONS } from "@/data/curated-hackathons";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import type {
	DoraHacksHackathon,
	DoraHacksSubmission,
} from "@/lib/integrations/dorahacks";

type Served = Record<string, unknown> & { id: string; name: string };
type Detail = {
	hackathon: {
		name: string;
		slug: string;
		description: string | null;
		endDate: string | null;
		organizer: { id: string; name: string } | null;
		source: string;
		stats: {
			upstreamSubmissions: number | null;
			hiddenWinners: Array<{
				placement: string | null;
				award: string | null;
			}> | null;
			winnersNote: string | null;
		};
		rules?: Record<string, unknown>;
	};
	meta: { note?: string };
	winners: Served[];
	submissions: Served[];
};
type ListingRow = {
	id: string;
	slug: string;
	name: string;
	startDate: string;
	endDate: string;
	organizer: { id: string; name: string } | null;
	prizePoolUSD?: number;
	hackersCount?: number;
	source: string;
};

const live = JSON.parse(readFileSync(process.env.REPLAY_LIVE ?? "", "utf8"));
const NOW = new Date(live.endedAt as string);
const details: Record<string, Detail> = Object.fromEntries(
	Object.entries(
		live.details as Record<string, { status: number; body: Detail }>,
	).map(([slug, r]) => [slug, r.body]),
);
const at = (date: string) => Math.floor(Date.parse(`${date}T12:00:00Z`) / 1000);

// The listing as fetchAllDoraHacksHackathons serves it.
const listing: DoraHacksHackathon[] = (
	live.listing.hackathons as ListingRow[]
).map((row) => {
	const curated = CURATED_HACKATHONS.find((h) => h.uname === row.slug);
	if (curated)
		return {
			...curated,
			status: curated.end_time <= NOW.getTime() / 1000 ? 2 : 1,
		};
	const note = details[row.slug]?.hackathon.stats.winnersNote ?? "";
	return {
		id: Number(row.id.replace("dorahacks-", "")),
		title: row.name,
		uname: row.slug,
		start_time: at(row.startDate),
		end_time: at(row.endDate),
		bonus_price: row.prizePoolUSD ?? 0,
		hackers_count: row.hackersCount ?? 0,
		winner_announced: note.startsWith("Not announced upstream")
			? false
			: note.startsWith("DoraHacks lists this event's winners as announced")
				? true
				: details[row.slug]?.winners.length
					? true
					: null,
		status: at(row.endDate) <= NOW.getTime() / 1000 ? 2 : 1,
		organization: row.organizer
			? {
					id: Number(row.organizer.id.replace("dorahacks-org-", "")),
					name: row.organizer.name,
				}
			: undefined,
		source: "dorahacks" as const,
	};
});

// Every served submission of a stored roster, as the index holds it.
const fromStore = (d: Detail) =>
	/stored copy/.test(d.meta.note ?? "") && d.submissions.length > 0;
const index: IndexedBuild[] = Object.values(details).flatMap((d) =>
	fromStore(d)
		? d.submissions.map((s) => {
				const w = d.winners.find((x) => x.id === s.id);
				return {
					...(s as unknown as DoraHacksSubmission),
					source: "dorahacks" as const,
					hackathon: {
						title: d.hackathon.name,
						slug: d.hackathon.slug,
						endedAt: d.hackathon.endDate,
					},
					haystack: s.name.toLowerCase(),
					...(w && "project" in w
						? { project: w.project as IndexedBuild["project"] }
						: {}),
					...(w && typeof w.winnerSource === "string"
						? { winnerSource: w.winnerSource }
						: {}),
					...(w && "lastCommitAt" in w
						? {
								activity: {
									lastCommitAt: (w.lastCommitAt as string | null) ?? null,
									archived: false,
								},
							}
						: {}),
				};
			})
		: [],
);

const storedEvents = Object.values(details).flatMap((d) =>
	d.hackathon.rules && "readAt" in d.hackathon.rules
		? [
				{
					id: `e-${d.hackathon.slug}`,
					slug: d.hackathon.slug,
					title: d.hackathon.name,
					description: d.hackathon.description,
					repoRequired: d.hackathon.rules.repoRequired,
					videoRequired: d.hackathon.rules.videoRequired,
					submissionQuestions: d.hackathon.rules.submissionQuestions,
					requirementsSection: d.hackathon.rules.requirements,
					judgingSection: d.hackathon.rules.judgingCriteria,
					detailReadAt: d.hackathon.rules.readAt,
					upstreamSubmissions: d.hackathon.stats.upstreamSubmissions,
				},
			]
		: [],
);

const hiddenRows = Object.values(details).flatMap((d) =>
	(d.hackathon.stats.hiddenWinners ?? []).map((h, i) => ({
		buildId: `hidden-${d.hackathon.slug}-${i}`,
		hackathonSlug: d.hackathon.slug,
		placement: h.placement,
		award: h.award,
	})),
);

// The curated roster's directory projects and their SCF records.
const rosterProjects = Object.values(details).flatMap((d) =>
	d.winners.flatMap((w) =>
		typeof w.slug === "string"
			? [
					{
						slug: w.slug,
						...(w.scfAwarded === null
							? {}
							: { scf: { awarded: w.scfAwarded } }),
					},
				]
			: [],
	),
);

// A `hackathons` collection row with its projects, and one in front of the
// curated roster: no production row exists, so these are made up.
const COLLECTION = [
	{
		id: "h-db",
		name: "Collection Hack 2026",
		slug: "collection-hack-2026",
		description: "An event held in the hackathons collection.",
		startDate: "2026-03-01T00:00:00.000Z",
		endDate: "2026-03-03T00:00:00.000Z",
		status: "completed",
		externalUrl: "https://example.com/collection-hack",
		organizer: { id: "o1", name: "Collection Org", slug: "collection-org" },
	},
	{
		id: "h-roster",
		name: "Stellar Builder Summit 2026",
		slug: "stellar-builder-summit-2026",
		status: "completed",
		organizer: "o2",
	},
];
const COLLECTION_PROJECTS = [
	{
		id: "p1",
		name: "Alpha",
		slug: "alpha",
		category: "DeFi",
		shortDescription: "Lending.",
		hackathonStatus: "Built",
		hackathonPlacement: "1st",
		hackathonPrize: 5000,
		hackathonPrizeTrack: "Main",
		scf: { awarded: true },
	},
	{
		id: "p2",
		name: "Beta",
		slug: "beta",
		category: "Payments",
		hackathonStatus: "In Progress",
		hackathonPlacement: "honorable-mention",
		hackathonPrizeTrack: "Main",
	},
	{ id: "p3", name: "Gamma", slug: "gamma", category: "Wallets" },
	{
		id: "p4",
		name: "Delta",
		slug: "delta",
		category: "Tools",
		hackathonStatus: "Abandoned",
		hackathonPrizeTrack: "Side",
	},
];

// Per-request switches for the failure branches.
const fail = {
	payload: false,
	collection: false,
	listing: false,
	index: false,
	events: false,
	hidden: false,
	liveRoster: null as null | "rows" | "throw",
	rosterFromCollection: false,
};
const reset = () => {
	for (const k of Object.keys(fail) as Array<keyof typeof fail>)
		(fail as Record<string, unknown>)[k] = k === "liveRoster" ? null : false;
};

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () =>
		fail.payload
			? null
			: {
					find: async (args: {
						collection: string;
						where?: Record<string, unknown>;
					}) => {
						const where = JSON.stringify(args.where ?? {});
						const slugOf = (w: Record<string, unknown> | undefined) =>
							((w?.slug as { equals?: string })?.equals ?? "") as string;
						if (args.collection === "hackathons") {
							if (fail.collection) throw new Error("collection read failed");
							const slug = slugOf(args.where);
							return {
								docs: COLLECTION.filter(
									(h) =>
										h.slug === slug &&
										(h.id !== "h-roster" || fail.rosterFromCollection),
								),
							};
						}
						if (args.collection === "projects") {
							if (where.includes('"hackathon"'))
								return {
									docs: where.includes("h-db") ? COLLECTION_PROJECTS : [],
								};
							const wanted = (args.where?.slug as { in?: string[] } | undefined)
								?.in;
							return {
								docs: rosterProjects.filter((p) => wanted?.includes(p.slug)),
							};
						}
						if (args.collection === "hackathon-events") {
							if (fail.events) throw new Error("events read failed");
							const slug = slugOf(args.where);
							return { docs: storedEvents.filter((e) => e.slug === slug) };
						}
						if (args.collection === "hackathon-builds") {
							if (fail.hidden) throw new Error("hidden read failed");
							const m = /"hackathonSlug":\{"equals":"([^"]+)"/.exec(where);
							return {
								docs: hiddenRows.filter((h) => h.hackathonSlug === m?.[1]),
							};
						}
						return { docs: [] };
					},
				},
	),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => {
		if (fail.listing) throw new Error("listing read failed");
		return listing;
	}),
	fetchHackathonSubmissions: vi.fn(async (h: { uname: string }) => {
		if (fail.liveRoster === "throw")
			throw new Error(`DoraHacks winners for ${h.uname}: HTTP 429`);
		if (fail.liveRoster === "rows")
			return (details[h.uname]?.submissions ?? []).map((s) => ({
				...s,
				source: "dorahacks",
			}));
		return [];
	}),
}));
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => {
		if (fail.index) throw new Error("index read failed");
		return index;
	}),
}));

async function call(name: string, slug: string) {
	const { GET } = await import("@/app/api/hackathons/[slug]/route");
	const res = await GET(
		new NextRequest(
			`https://x.test/api/hackathons/${encodeURIComponent(slug)}`,
		),
		{ params: Promise.resolve({ slug }) },
	);
	return JSON.stringify({
		name,
		slug,
		status: res.status,
		contentType: res.headers.get("content-type"),
		cacheControl: res.headers.get("cache-control"),
		retryAfter: res.headers.get("retry-after"),
		body: await res.text(),
	});
}

const scenarios: Array<[string, string, Partial<typeof fail>]> = [
	...Object.keys(details).map(
		(slug): [string, string, Partial<typeof fail>] => [
			`event ${slug}`,
			slug,
			{},
		],
	),
	["unknown, near one", "hackmeridian-2024", {}],
	["unknown, typo", "stellar-hacks-blnd", {}],
	["unknown, common words only", "stellar-defi-summit-2024", {}],
	["unknown, spaces and case", "ZK Gaming", {}],
	["collection row", "collection-hack-2026", {}],
	[
		"collection row, roster behind it",
		"stellar-builder-summit-2026",
		{ rosterFromCollection: true },
	],
	[
		"index down, live roster rows",
		"stellar-hacks-blend",
		{ index: true, liveRoster: "rows" },
	],
	[
		"index down, live roster throws",
		"stellar-hacks-zk",
		{ index: true, liveRoster: "throw" },
	],
	[
		"index down, curated roster",
		"stellar-builder-summit-2026",
		{ index: true },
	],
	["index down, winners-only event", "hackmeridian-2025", { index: true }],
	["stored event read fails", "stellar-hacks-zk", { events: true }],
	["hidden winners read fails", "buildonstellarchile", { hidden: true }],
	["store outage", "stellar-hacks-zk", { payload: true }],
	["listing read throws", "stellar-hacks-zk", { listing: true }],
	["collection read throws", "hackmeridian-2026", { collection: true }],
];

describe("event pages replay", () => {
	beforeAll(() => {
		vi.useFakeTimers({ now: NOW, toFake: ["Date"] });
		vi.spyOn(console, "error").mockImplementation(() => {});
	});
	afterAll(() => {
		vi.useRealTimers();
	});

	it(`every scenario (${scenarios.length} requests)`, async () => {
		const lines: string[] = [];
		for (const [name, slug, switches] of scenarios) {
			reset();
			Object.assign(fail, switches);
			lines.push(await call(name, slug));
		}
		writeFileSync(process.env.REPLAY_OUT ?? "", `${lines.join("\n")}\n`);
		expect(lines).toHaveLength(scenarios.length);
	});
});
