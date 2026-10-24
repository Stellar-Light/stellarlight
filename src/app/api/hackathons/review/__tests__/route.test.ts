import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import { spec } from "@/lib/openapi-spec";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../../../../scripts/contract/served-shape";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
const stored = {
	id: "x",
	buildId: "dorahacks-buidl-42585",
	name: "TollPay",
	vision: "Stripe for MCP servers.",
	description: "x".repeat(900),
	hackathonSlug: "agents",
	hackathonTitle: "Stellar Hacks: Agents",
	endedAt: "2026-04-13",
	placement: "5th Place",
	isWinner: true,
	url: "https://dorahacks.io/buidl/42585",
	githubUrl: "https://github.com/team/toll",
	repoFullName: "team/toll",
	linkCheckedAt: "2026-10-05T00:00:00Z",
	projectSlug: "tollpay",
	projectName: "TollPay",
	projectLinkBasis: "repo",
	stack: ["@x402/stellar"],
	stackReadAt: "2026-10-05T00:00:00Z",
	categories: [{ type: "Payments", score: 0.8 }],
	categoriesAt: "2026-10-05T00:00:00Z",
	detailReadAt: "2026-10-05T00:00:00Z",
	firstSeenAt: "2026-10-05T00:00:00Z",
	lastSeenAt: "2026-10-05T00:00:00Z",
	updatedAt: "2026-10-05T00:00:00Z",
	createdAt: "2026-10-05T00:00:00Z",
};
// The event's stored winners, when the submission carries award text.
let winners: Array<{
	hackathonSlug: string;
	placement: string;
	award: string;
}> = [];
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(
			async ({
				collection,
				where,
			}: {
				collection: string;
				where?: { and?: Array<Record<string, unknown>> };
			}) =>
				collection === "projects"
					? {
							docs: [
								{ slug: "tollpay", status: "Live", scf: { awarded: true } },
							],
						}
					: where?.and?.[0]?.hackathonSlug
						? { docs: winners }
						: { docs: [stored] },
		),
	})),
}));
const index: IndexedBuild[] = [];
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => index),
}));
vi.mock("@/lib/hackathon-build-semantic", () => ({
	similarToBuild: vi.fn(
		async () =>
			new Map([
				["dorahacks-buidl-9", 0.9], // the same repo, entered in another event
				["dorahacks-buidl-7", 0.83],
			]),
	),
	semanticBuildScores: vi.fn(async () => null),
}));
vi.mock("@/lib/scf-pitch", () => ({
	buildScfPitch: vi.fn(async (_p: unknown, idea: string) => ({
		idea,
		angles: [],
	})),
}));
vi.mock("@/lib/scf-rounds", () => ({
	fetchScfRounds: vi.fn(async () => ({
		currentRound: 46,
		currentPhase: "Submission",
		lastConcludedRound: 44,
		roundsInProgress: [
			{ round: 46, phase: "Submission", submissionDeadline: "2026-11-02" },
		],
		submissionWindow: { opens: null, closes: "2026-11-02" },
		fetchedAt: "2026-10-23T12:00:00Z",
	})),
}));
vi.mock("@/lib/held-repos", async (orig) => ({
	...(await orig<typeof import("@/lib/held-repos")>()),
	heldRepoNames: vi.fn(async () => new Set(["team/held"])),
}));

const build = (id: string, over: Partial<IndexedBuild> = {}): IndexedBuild => ({
	id,
	name: id,
	description: null,
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
		title: "Stellar Hacks: Agents",
		slug: "agents",
		endedAt: "2026-04-13",
	},
	haystack: id,
	...over,
});
index.push(
	build("dorahacks-buidl-42585", {
		githubUrl: "https://github.com/team/toll",
		isWinner: true,
		categories: [{ type: "Payments", score: 0.8 }],
	}),
	build("dorahacks-buidl-7", {
		name: "RenderGate",
		isWinner: true,
		categories: [{ type: "Payments", score: 0.8 }],
	}),
	build("dorahacks-buidl-8", { categories: [{ type: "DEX", score: 0.7 }] }),
	build("dorahacks-buidl-9", {
		name: "TollPay again",
		githubUrl: "https://github.com/team/toll",
		hackathon: { title: "Older", slug: "older", endedAt: "2025-01-01" },
	}),
);

const get = async (qs: string) => {
	const { GET } = await import("../route");
	const res = await GET(
		new NextRequest(`https://x.test/api/hackathons/review?${qs}`),
	);
	return { status: res.status, body: await res.json() };
};

describe("GET /api/hackathons/review", () => {
	it("reviews a submission from its repo link", async () => {
		const { status, body } = await get("link=github.com/team/toll");
		expect(status).toBe(200);
		const r = body.review;
		expect(r.resolvedBy).toBe("repo");
		expect(r.submission.project).toMatchObject({
			slug: "tollpay",
			status: "Live",
			scfAwarded: true,
		});
		expect(r.checks.find((c: { id: string }) => c.id === "scf").ok).toBe(true);
		expect(r.similar).toMatchObject({
			checked: true,
			builds: [{ name: "RenderGate", similarity: 0.83 }],
		});
		expect(r.categoryContext).toEqual({
			type: "Payments",
			submissions: 2,
			winners: 2,
			shareOfSubmissions: 0.667,
		});
		expect(r.pitch.idea).toBe("TollPay. Stripe for MCP servers.");
	});

	it("declares every served field and null of the review; the pitch is mocked here", async () => {
		// review.pitch is the scfPitch report, served as built: the real one
		// is checked against this schema in scf-pitch.test.ts.
		const { body } = await get("link=github.com/team/toll");
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/review"),
				body,
			),
		).toEqual([]);
	});

	it("answers 400 without a link and 404 for one it does not hold", async () => {
		expect((await get("")).status).toBe(400);
		expect((await get("link=github.com/nobody/nothing")).status).toBe(404);
		expect((await get("link=x&extra=1")).status).toBe(400);
	});
});

describe("a submission with no confident category", () => {
	it("says why categoryContext is null: uncertain, or not categorized yet", async () => {
		const saved = { ...stored };
		const s = stored as Record<string, unknown>;
		try {
			s.categories = [];
			const uncertain = (await get("link=github.com/team/toll")).body;
			expect(uncertain.review.categoryContext).toBeNull();
			expect(uncertain.review.categoryNote).toMatch(/uncertain, not missing/);
			expect(
				undeclaredInServed(
					spec,
					responseSchema(spec, "/api/hackathons/review"),
					uncertain,
				),
			).toEqual([]);

			delete s.categories;
			s.categoriesAt = null;
			const unread = (await get("link=github.com/team/toll")).body;
			expect(unread.review.categoryContext).toBeNull();
			expect(unread.review.categoryNote).toMatch(/not categorized yet/);
		} finally {
			Object.assign(stored, saved);
		}
		const typed = (await get("link=github.com/team/toll")).body;
		expect(typed.review.categoryNote).toBeNull();
	});
});

describe("how crowded a category is, across every stored submission", () => {
	it("leaves out an event whose stored rows are its winners only", async () => {
		// A curated winner in the same category: its event's other
		// submissions are not stored, so it must not move the share.
		index.push(
			build("curated-hackmeridian-2025-lance", {
				name: "Lance",
				isWinner: true,
				hackathonPlacement: "1st Place",
				categories: [{ type: "Payments", score: 0.8 }],
				hackathon: {
					title: "HackMeridian 2025",
					slug: "hackmeridian-2025",
					endedAt: "2025-09-16",
				},
			}),
		);
		try {
			const { body } = await get("link=github.com/team/toll");
			expect(body.review.categoryContext).toEqual({
				type: "Payments",
				submissions: 2,
				winners: 2,
				shareOfSubmissions: 0.667,
			});
		} finally {
			index.pop();
		}
	});
});

// ── hackathon=<slug>: the event's judging criteria against the repo ─────────

const GH_META = (full: string, over: Record<string, unknown> = {}) => ({
	full_name: full,
	html_url: `https://github.com/${full}`,
	private: false,
	archived: false,
	default_branch: "main",
	homepage: null,
	created_at: "2026-10-01T00:00:00Z",
	...over,
});
const gh = (
	body: unknown,
	status = 200,
	headers: Record<string, string> = {},
) =>
	new Response(typeof body === "string" ? body : JSON.stringify(body), {
		status,
		headers: { "x-ratelimit-remaining": "4000", ...headers },
	});
/** A scripted GitHub: team/app is a small Soroban dapp, team/private is not
 * public, anything else answers 404. */
const github = async (input: string) => {
	const url = String(input);
	if (url.endsWith("/repos/team/app")) return gh(GH_META("Team/App"));
	if (url.endsWith("/repos/team/toll")) return gh(GH_META("team/toll"));
	if (url.endsWith("/repos/team/private"))
		return gh(GH_META("Team/Private", { private: true }));
	if (url.includes("/git/trees/c0ffee?recursive=1"))
		return gh({
			truncated: false,
			tree: [
				{ path: "README.md", type: "blob" },
				{ path: "package.json", type: "blob" },
				{ path: "contracts/hello/src/test.rs", type: "blob" },
			],
		});
	if (url.includes("/commits?per_page=1"))
		return gh([
			{
				sha: "c0ffee",
				commit: { committer: { date: "2026-10-23T09:00:00Z" } },
			},
		]);
	if (url.includes("/releases?per_page=1")) return gh([]);
	if (url.endsWith("/c0ffee/README.md"))
		return gh("# App\n- Live demo: https://app.example.net\n");
	if (url.endsWith("/c0ffee/package.json"))
		return gh(
			JSON.stringify({ dependencies: { "@stellar/stellar-sdk": "^14.2.0" } }),
		);
	return gh({}, 404);
};

describe("GET /api/hackathons/review?hackathon=<slug>", () => {
	beforeEach(async () => {
		const { resetLiveReadForTests } = await import("@/lib/repo-live-read");
		resetLiveReadForTests();
		vi.stubGlobal("fetch", vi.fn(github));
	});
	afterEach(() => vi.unstubAllGlobals());

	it("reviews a repo it never stored from the live read, every criterion with evidence or a reason", async () => {
		const { status, body } = await get(
			"link=github.com/team/app&hackathon=hackmeridian-2026",
		);
		expect(status).toBe(200);
		const r = body.review;
		expect(r).toMatchObject({ link: "github.com/team/app", stored: false });
		expect(r.submission).toBeUndefined();
		expect(r.repo).toMatchObject({
			fullName: "Team/App",
			commit: "c0ffee",
			unread: [],
		});
		expect(r.judging.hackathon.slug).toBe("hackmeridian-2026");
		const criteria = r.judging.categories.flatMap(
			(c: { criteria: unknown[] }) => c.criteria,
		) as Array<{
			criterion: string;
			checkable: boolean;
			reason: string | null;
			evidence: Array<{
				id: string;
				state: string;
				values: string[] | null;
			}> | null;
		}>;
		expect(criteria).toHaveLength(8);
		expect(
			criteria.filter((c) => !c.checkable).map((c) => c.criterion),
		).toEqual([
			"problem clarity",
			"milestones against goals set at pre-event intake",
			"ecosystem impact",
		]);
		for (const c of criteria)
			c.checkable
				? expect(c.evidence?.length).toBeGreaterThan(0)
				: expect([c.evidence, typeof c.reason]).toEqual([null, "string"]);
		const stellar = criteria.find((c) => c.criterion === "Stellar integration");
		expect(stellar?.evidence?.[0]).toMatchObject({
			id: "stellarPackages",
			state: "found",
			values: ["@stellar/stellar-sdk"],
		});
		const scf = criteria.find((c) => c.criterion === "SCF eligibility");
		expect(scf?.evidence?.[0]).toMatchObject({
			id: "scfRound",
			state: "found",
			values: ["Round 46: Submission, deadline 2026-11-02"],
		});
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/review"),
				body,
			),
		).toEqual([]);
	});

	it("adds the judging block to a stored submission and keeps every stored field", async () => {
		// Stored facts carry their read time; one clock for both requests.
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-10-23T12:00:00Z"),
		});
		const plain = (await get("link=github.com/team/toll")).body;
		const { status, body } = await get(
			"link=github.com/team/toll&hackathon=hackmeridian-2026",
		);
		vi.useRealTimers();
		expect(status).toBe(200);
		const { stored, repo, judging, ...rest } = body.review;
		expect(stored).toBe(true);
		expect(rest).toEqual(plain.review);
		expect(repo.fullName).toBe("team/toll");
		expect(
			judging.categories.map((c: { category: string }) => c.category),
		).toEqual(["Genesis", "Scale"]);
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/review"),
				body,
			),
		).toEqual([]);
	});

	it("serves a stored submission without hackathon exactly as before", async () => {
		const { body } = await get("link=github.com/team/toll");
		expect(Object.keys(body)).toEqual(["meta", "review"]);
		expect(Object.keys(body.review)).toEqual([
			"link",
			"resolvedBy",
			"otherSubmissionsOfRepo",
			"submission",
			"checks",
			"similar",
			"categoryContext",
			"categoryNote",
			"pitch",
		]);
		expect(body.meta.note).toBe(
			"Evidence, not a verdict. Each check is a fact about the submission (ok null = could not be checked, never a no). similar = the stored submissions closest in meaning to it. pitch = the SCF pitch view over its summary: live round, funded peers, competitors, maturity, prior art and the vertical's supply gap.",
		);
		// No live read without hackathon.
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
	});

	it("answers 404 for a repo that is missing or not public, and 400 for an event without criteria", async () => {
		for (const link of ["github.com/team/private", "github.com/team/none"]) {
			const { status, body } = await get(
				`link=${link}&hackathon=hackmeridian-2026`,
			);
			expect(status).toBe(404);
			expect(body.error).toMatch(/No public GitHub repo/);
		}
		const bad = await get(
			"link=github.com/team/app&hackathon=stellar-hacks-agents",
		);
		expect(bad.status).toBe(400);
		expect(bad.body.validHackathons).toEqual(["hackmeridian-2026"]);
		expect((await get("link=github.com/team/app&hackathon=")).status).toBe(400);
		// Without hackathon an unstored repo is still a 404, now naming the parameter.
		const plain = await get("link=github.com/team/app");
		expect(plain.status).toBe(404);
		expect(plain.body.advisory).toMatch(/hackathon=<slug>/);
	});

	it("never reads a repo held for malware", async () => {
		const { status, body } = await get(
			"link=github.com/team/held&hackathon=hackmeridian-2026",
		);
		expect(status).toBe(200);
		expect(body.review.security.held).toBe(true);
		// The caller's link is echoed, so the note never says it is withheld.
		expect(body.review.security.note).toMatch(/Scout does not read it/);
		expect(body.review.security.note).not.toMatch(/withheld/);
		expect(body.review.repo).toBeNull();
		expect(vi.mocked(fetch)).not.toHaveBeenCalled();
		const states = body.review.judging.categories
			.flatMap(
				(c: {
					criteria: Array<{
						evidence: Array<{ id: string; state: string }> | null;
					}>;
				}) => c.criteria,
			)
			.flatMap(
				(c: { evidence: Array<{ id: string; state: string }> | null }) =>
					c.evidence ?? [],
			)
			.filter((e: { id: string }) => e.id !== "scfRound")
			.map((e: { state: string }) => e.state);
		expect(new Set(states)).toEqual(new Set(["could-not-check"]));
	});
});

describe("a submission placed in an award its event's other placements share", () => {
	it("serves the award's title as awardCategory, read from the event's stored winners", async () => {
		// Stellar Hacks: Agents: five placements in one award, "10K Prize Pool".
		const s = stored as Record<string, unknown>;
		try {
			s.award = "10K Prize Pool";
			winners = [
				{
					hackathonSlug: "agents",
					placement: "5th Place",
					award: "10K Prize Pool",
				},
				{
					hackathonSlug: "agents",
					placement: "3rd Place",
					award: "10K Prize Pool",
				},
			];
			const { body } = await get("link=github.com/team/toll");
			const sub = body.review.submission;
			expect([sub.placement, sub.award, sub.awardCategory]).toEqual([
				"5th Place",
				null,
				"10K Prize Pool",
			]);
			expect(sub.entries[0]).toMatchObject({
				award: null,
				awardCategory: "10K Prize Pool",
			});
			expect(
				undeclaredInServed(
					spec,
					responseSchema(spec, "/api/hackathons/review"),
					body,
				),
			).toEqual([]);
		} finally {
			delete s.award;
			winners = [];
		}
	});
});
