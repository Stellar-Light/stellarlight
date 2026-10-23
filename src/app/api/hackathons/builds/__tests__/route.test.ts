import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
// What getHackathons lists: one DoraHacks event the index holds, and
// curated ones whose submissions are not stored.
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
		hackathons: [
			{ id: 1, uname: "e", title: "E", source: "dorahacks" },
			{
				id: -1007,
				uname: "hackmeridian-2025",
				title: "HackMeridian 2025",
				source: "curated",
			},
			{
				id: -1001,
				uname: "hackmeridian-2026",
				title: "HackMeridian 2026",
				source: "curated",
			},
		],
		complete: true,
	})),
}));
// Search by meaning cannot run in tests (no key), as without the mock.
vi.mock("@/lib/hackathon-build-semantic", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-build-semantic")>()),
	semanticBuildScores: vi.fn(async () => null),
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ find: async () => ({ docs: [] }) })),
}));

// No reranker unless a case stubs one: a shell that exports VOYAGE_API_KEY
// must not reach the live API from the hybrid cases here.
beforeEach(() => {
	vi.stubEnv("VOYAGE_API_KEY", "");
});
afterEach(() => {
	vi.unstubAllEnvs();
});

const DAY = 86_400_000;
const build = (id: string, over: Partial<IndexedBuild> = {}): IndexedBuild => ({
	id,
	name: id,
	description: `${id} summary`,
	githubUrl: `https://github.com/t/${id}`,
	demoUrl: null,
	videoUrl: null,
	track: null,
	hackathonPlacement: null,
	award: null,
	isWinner: false,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id}`,
	source: "dorahacks",
	hackathon: { title: "E", slug: "e", endedAt: "2025-01-15" },
	haystack: id,
	...over,
});
const recentEnd = new Date(Date.now() - 10 * DAY).toISOString().slice(0, 10);
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => [
		build("kept", {
			activity: { lastCommitAt: "2025-06-01T00:00:00.000Z", archived: false },
		}),
		build("quiet", {
			activity: { lastCommitAt: "2025-01-20T00:00:00.000Z", archived: false },
		}),
		build("gone", { repoMissing: true }),
		build("unread"),
		build("noend", {
			hackathon: { title: "N", slug: "n", endedAt: null },
			activity: { lastCommitAt: "2025-06-01T00:00:00.000Z", archived: false },
		}),
		build("baddate", {
			hackathon: { title: "B", slug: "b", endedAt: "TBA" },
			activity: { lastCommitAt: "2025-06-01T00:00:00.000Z", archived: false },
		}),
		build("recent", {
			hackathon: { title: "R", slug: "r", endedAt: recentEnd },
			activity: { lastCommitAt: null, archived: false },
		}),
		build("titled", {
			hackathon: {
				title: "Stellar Hacks: Agents",
				slug: "stellar-agents-x402-stripe-mpp",
				endedAt: "2026-04-13",
			},
		}),
		build("tukar", {
			isWinner: true,
			hackathonPlacement: "1st Place",
			stack: ["passkey-kit", "@stellar/stellar-sdk"],
		}),
		// One submission entered in two events: one result, two entries.
		build("twin"),
		build("twin", { hackathon: { title: "R", slug: "r", endedAt: recentEnd } }),
	]),
}));

describe("GET /api/hackathons/builds matches declared packages", () => {
	// The 2026-10-22 battery: q=passkey&winnersOnly=1 found no winner, though
	// Tukar's repo declares passkey-kit.
	it("finds a winner by a package its repo declares", async () => {
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest(
				"https://x.test/api/hackathons/builds?q=passkey&winnersOnly=1&mode=keyword",
			),
		);
		expect(res.status).toBe(200);
		const rows = (await res.json()).builds as Array<Record<string, unknown>>;
		expect(rows.map((r) => [r.id, r.matchedTerms])).toEqual([
			["tukar", ["passkey"]],
		]);
	});
});

describe("GET /api/hackathons/builds when q's words are in no build", () => {
	const get = async (q: string, mode = "keyword") => {
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest(
				`https://x.test/api/hackathons/builds?q=${encodeURIComponent(q)}&mode=${mode}`,
			),
		);
		return res.json();
	};
	const withIndex = async (rows: IndexedBuild[]) => {
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce(rows);
	};

	// The 2026-10-22 battery: q=quantum llama sandwich listed a build named
	// for "quantum" and one with "llama" inside its name. With most of q in no
	// build, a name no longer lists a build alone (rule L, 2026-10-23).
	it("lists no build by its name alone when most of q's words are in no build", async () => {
		const llama = await get("tukar llama sandwich");
		expect(llama.meta.counts).toMatchObject({ matched: 0, withheldByName: 1 });
		// Nothing listed: say which words matched no submission, and that a
		// build matched by name and was held back (review, 2026-10-23).
		expect(llama.meta.warnings).toEqual([
			"2 of the 3 words searched in q (llama, sandwich) occur as a whole word in no submission in the index, and no build is listed; 1 build matched by name for tukar is not listed, because most of the words searched in q occur in no submission; if one of them is misspelled, correct it",
		]);
		const nread = await get("tukar nread sandwich");
		expect(nread.meta.counts).toMatchObject({ matched: 0, withheldByName: 2 });
		// unread is one edit from nread but starts with another letter: no
		// spelling is named.
		expect(nread.meta.warnings).toEqual([
			"2 of the 3 words searched in q (nread, sandwich) occur as a whole word in no submission in the index, and no build is listed; 2 builds matched by name for tukar, or inside a longer word for nread, are not listed, because most of the words searched in q occur in no submission; if one of them is misspelled, correct it",
		]);
		expect((await get("tukar twin")).meta.counts.withheldByName).toBe(0);
	});

	it("says a real name match was held back, never that nothing matched", async () => {
		await withIndex([
			build("donations", {
				name: "Donation Management",
				haystack: "donation management: track gifts",
			}),
		]);
		const tithe = await get("church tithe donations app");
		expect(tithe.meta.counts).toMatchObject({ matched: 0, withheldByName: 1 });
		expect(tithe.meta.warnings).toEqual([
			"2 of the 3 words searched in q (church, tithe) occur as a whole word in no submission in the index, and no build is listed; 1 build matched by name for donations is not listed, because most of the words searched in q occur in no submission; if one of them is misspelled, correct it",
		]);
		await withIndex([
			build("ide", {
				name: "Stellar-IDE",
				haystack: "stellar-ide: an ide for soroban contracts",
			}),
		]);
		const ide = await get("Sorobix IDE plugin");
		expect(ide.meta.counts).toMatchObject({ matched: 0, withheldByName: 1 });
		expect(ide.meta.warnings?.[0]).toContain(
			"; 1 build matched by name for ide is not listed, because most of the words searched in q occur in no submission",
		);
	});

	// Re-check 2026-10-23: meaning mode never lists a build by its name, so
	// none is withheld there and the line does not say so.
	// Re-check 2026-10-23: tracker, matched in the description only, was
	// called found inside a longer word of the name.
	it("names only the words a held build matched in its name", async () => {
		await withIndex([
			build("donations", {
				name: "Donation Management",
				haystack: "donation management: gifts tracker",
			}),
		]);
		const body = await get("church tithe zakat donations tracker");
		expect(body.meta.counts).toMatchObject({ matched: 0, withheldByName: 1 });
		expect(body.meta.warnings).toEqual([
			"3 of the 5 words searched in q (church, tithe, zakat) occur as a whole word in no submission in the index, and no build is listed; 1 build matched by name for donations is not listed, because most of the words searched in q occur in no submission; if one of them is misspelled, correct it",
		]);
	});

	it("withholds nothing in meaning mode", async () => {
		await withIndex([
			build("donations", {
				name: "Donation Management",
				haystack: "donation management: track gifts",
			}),
		]);
		const { semanticBuildScores } = await import(
			"@/lib/hackathon-build-semantic"
		);
		vi.mocked(semanticBuildScores).mockResolvedValueOnce(new Map());
		const body = await get("church tithe donations app", "meaning");
		expect(body.meta.mode.served).toBe("meaning");
		expect(body.meta.counts).toMatchObject({ matched: 0, withheldByName: 0 });
		expect(body.meta.warnings).toEqual([
			"2 of the 3 words searched in q (church, tithe) occur as a whole word in no submission in the index, and no build is listed; if one of them is misspelled, correct it",
		]);
	});

	it("still lists a name match when at most half of q's words are in no build, and names the missing one", async () => {
		const body = await get("tukar twin sandwich");
		expect(
			(body.builds as Array<{ id: string }>).map((r) => r.id).sort(),
		).toEqual(["tukar", "twin"]);
		expect(body.meta.warnings).toEqual([
			"1 of the 3 words searched in q (sandwich) occurs as a whole word in no submission in the index, so a build listed by its words alone, with no similarity, matches only the other words of q; where its matchedTerms names it, it was found inside a longer word",
		]);
	});

	it("lists builds on the words some submission uses and names the rest", async () => {
		await withIndex([
			build("zkvault", { haystack: "zkvault: zero knowledge proofs" }),
			build("other", { haystack: "other: a payments app" }),
		]);
		const body = await get("zero knowledge pogo stick");
		expect(
			(body.builds as Array<Record<string, unknown>>).map((r) => [
				r.id,
				r.matchedTerms,
			]),
		).toEqual([["zkvault", ["zero", "knowledge"]]]);
		expect(body.meta.warnings).toEqual([
			"2 of the 4 words searched in q (pogo, stick) occur as a whole word in no submission in the index, so a build listed by its words alone, with no similarity, matches only the other words of q; where its matchedTerms names one of them, it was found inside a longer word",
		]);
	});

	it("says nothing when every word of q is used", async () => {
		expect((await get("tukar twin")).meta.warnings).toBeUndefined();
	});

	// Hybrid is the default: blockchain sourdough starter listed 99 builds by
	// meaning with no line.
	it("says what builds found by meaning are, alone or beside builds listed by words", async () => {
		const { semanticBuildScores } = await import(
			"@/lib/hackathon-build-semantic"
		);
		vi.mocked(semanticBuildScores).mockResolvedValueOnce(
			new Map([["tukar", 0.8]]),
		);
		const meaning = await get("tukar llama sandwich", "hybrid");
		expect(
			(meaning.builds as Array<Record<string, unknown>>).map((r) => [
				r.id,
				r.similarity,
				r.matchedTerms ?? null,
			]),
		).toEqual([["tukar", 0.8, null]]);
		expect(meaning.meta.warnings).toEqual([
			"2 of the 3 words searched in q (llama, sandwich) occur as a whole word in no submission in the index: every build listed was found by meaning (similarity, no matchedTerms) and is close to q as a whole, not to those words",
		]);
		vi.mocked(semanticBuildScores).mockResolvedValueOnce(
			new Map([["kept", 0.8]]),
		);
		const both = await get("tukar twin sandwich", "hybrid");
		expect(
			(both.builds as Array<{ id: string }>).map((r) => r.id).sort(),
		).toEqual(["kept", "tukar", "twin"]);
		expect(both.meta.warnings).toEqual([
			"1 of the 3 words searched in q (sandwich) occurs as a whole word in no submission in the index: a build listed by its words matches only the other words of q (where its matchedTerms names it, it was found inside a longer word), and a build with similarity is close to q as a whole, not to that word",
		]);
	});

	it("names a related form submissions use, and only a real one", async () => {
		await withIndex([
			build("cashout", { haystack: "cashout: cash for remittances" }),
			build("steady", { haystack: "steady: reliable remittances" }),
		]);
		const cash = await get("cashing remittances");
		expect(cash.meta.warnings).toEqual([
			"1 of the 2 words searched in q (cashing) occurs as a whole word in no submission in the index, so a build listed by its words alone, with no similarity, matches only the other words of q; where its matchedTerms names it, it was found inside a longer word; a related form is used: cash for cashing",
		]);
		await withIndex([
			build("steady", { haystack: "steady: reliable remittances" }),
		]);
		const relief = await get("relief remittances");
		expect(relief.meta.warnings?.[0]).not.toMatch(/related form/);
		expect(relief.meta.warnings?.[0]).toMatch(/\(relief\)/);
	});

	it("suggests a spelling only when one used word is that close", async () => {
		await withIndex([
			build("remit", { haystack: "remit: remittance app for families" }),
		]);
		const typo = await get("remitance app");
		expect(typo.meta.counts.matched).toBe(0);
		expect(typo.meta.warnings).toEqual([
			"the word searched in q (remitance) occurs as a whole word in no submission in the index, and no build is listed; if it is misspelled, correct it (remittance is a used word one edit from remitance)",
		]);
		// Two used words one edit away: neither is named.
		await withIndex([build("decks", { haystack: "decks: cards and cords" })]);
		const two = await get("curds");
		expect(two.meta.warnings).toEqual([
			"the word searched in q (curds) occurs as a whole word in no submission in the index, and no build is listed; if it is misspelled, correct it",
		]);
		// A swap counts as one edit; sleep is not a typo of sleepy.
		await withIndex([build("swap", { haystack: "swap: exchange and sleep" })]);
		const swap = await get("exchnage sleepy");
		expect(swap.meta.warnings).toEqual([
			"none of the 2 words searched in q (exchnage, sleepy) occurs as a whole word in any submission in the index, and no build is listed; if one of them is misspelled, correct it (exchange is a used word one edit from exchnage)",
		]);
	});

	// Review 2026-10-23: "agents," and "café" were reported in no submission
	// while matchedTerms named them, so the line fired with both clauses false.
	it("reads a word with a trailing comma or an accent as the build's own", async () => {
		await withIndex([
			build("agentpay", {
				haystack: "agentpay: ai agents, payments, a café",
			}),
		]);
		const body = await get("AI agents, payments, café");
		expect(
			(body.builds as Array<Record<string, unknown>>).map((r) => [
				r.id,
				r.matchedTerms,
			]),
		).toEqual([["agentpay", ["ai", "agents,", "payments,", "café"]]]);
		expect(body.meta.warnings).toBeUndefined();
	});

	it("words the line for a one-word q and for a q none of whose words is used", async () => {
		const one = await get("nread");
		expect((one.builds as Array<{ id: string }>).map((r) => r.id)).toEqual([
			"unread",
		]);
		expect(one.meta.warnings).toEqual([
			"the word searched in q (nread) occurs as a whole word in no submission in the index: a build listed by its words alone, with no similarity, holds it only inside a longer word and is not evidence that this idea was built",
		]);
		const none = await get("nread ukar");
		expect(
			(none.builds as Array<{ id: string }>).map((r) => r.id).sort(),
		).toEqual(["tukar", "unread"]);
		expect(none.meta.warnings).toEqual([
			"none of the 2 words searched in q (nread, ukar) occurs as a whole word in any submission in the index: a build listed by its words alone, with no similarity, holds them only inside longer words and is not evidence that this idea was built",
		]);
	});
});

describe("GET /api/hackathons/builds hackathon filter", () => {
	const get = async (qs: string) => {
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest(`https://x.test/api/hackathons/builds?${qs}`),
		);
		return { status: res.status, body: await res.json() };
	};

	it("takes an event's exact title as its slug", async () => {
		const { status, body } = await get("hackathon=Stellar%20Hacks:%20Agents");
		expect(status).toBe(200);
		expect(body.meta.filters.hackathon).toEqual([
			"stellar-agents-x402-stripe-mpp",
		]);
		expect(body.meta.counts.matched).toBe(1);
	});

	it("answers a value that names no listed event with 400 and the valid slugs", async () => {
		const { status, body } = await get("hackathon=Stellar%20Hacks:%20Agent,e");
		expect(status).toBe(400);
		expect(body.error).toBe(
			"hackathon value(s) name no event getHackathons lists: 'Stellar Hacks: Agent'.",
		);
		expect(body.validHackathons).toEqual([
			"b",
			"e",
			"n",
			"r",
			"stellar-agents-x402-stripe-mpp",
		]);
	});

	it("answers a listed event with no stored submissions with 0 matched and a warning", async () => {
		const { status, body } = await get("hackathon=hackmeridian-2025");
		expect(status).toBe(200);
		expect(body.meta.counts.matched).toBe(0);
		expect(body.meta.filters.hackathon).toEqual(["hackmeridian-2025"]);
		expect(body.meta.warnings).toEqual([
			"no submissions are stored for hackmeridian-2025; 0 matched from it is not evidence that nothing was built",
		]);
	});

	it("says a value could not be checked when the listing cannot be read", async () => {
		const { getPayloadSafe } = await import("@/lib/payload-client");
		vi.mocked(getPayloadSafe).mockResolvedValueOnce(null);
		const { status, body } = await get("hackathon=nope");
		expect(status).toBe(200);
		expect(body.meta.counts.matched).toBe(0);
		expect(body.meta.warnings?.[0]).toMatch(
			/^could not check hackathon 'nope'/,
		);
	});
});

describe("GET /api/hackathons/builds rows say what the repo did after the event", () => {
	it("serves analyze's activity value and the last commit, absent when unknown", async () => {
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest("https://x.test/api/hackathons/builds?limit=10"),
		);
		expect(res.status).toBe(200);
		const rows = new Map(
			((await res.json()).builds as Array<Record<string, unknown>>).map((r) => [
				r.id,
				r,
			]),
		);
		expect(rows.get("kept")).toMatchObject({
			afterEvent: "commits 90+ days after",
			lastCommitAt: "2025-06-01T00:00:00.000Z",
		});
		expect(rows.get("quiet")?.afterEvent).toBe("no commits 90+ days after");
		expect(rows.get("gone")?.afterEvent).toBe("repo not found");
		// Repo never read: unknown, so neither field is served.
		expect("afterEvent" in (rows.get("unread") ?? {})).toBe(false);
		expect("lastCommitAt" in (rows.get("unread") ?? {})).toBe(false);
		// Read, but with no usable end date there is no mark to measure from.
		expect("afterEvent" in (rows.get("noend") ?? {})).toBe(false);
		expect("afterEvent" in (rows.get("baddate") ?? {})).toBe(false);
		expect(rows.get("noend")?.lastCommitAt).toBe("2025-06-01T00:00:00.000Z");
		// A repo not found has no activity to read.
		expect("lastCommitAt" in (rows.get("gone") ?? {})).toBe(false);
		// Read, but the event ended too recently to say the team stopped.
		expect("afterEvent" in (rows.get("recent") ?? {})).toBe(false);
		expect(rows.get("recent")?.lastCommitAt).toBeNull();
	});
});

describe("GET /api/hackathons/builds counts both units", () => {
	it("serves event entries beside unique submissions, the unit analyze counts", async () => {
		const { GET } = await import("../route");
		const read = async (qs: string) =>
			(
				await (
					await GET(
						new NextRequest(`https://x.test/api/hackathons/builds?${qs}`),
					)
				).json()
			).meta.counts;
		expect(await read("q=twin&mode=keyword")).toMatchObject({
			matched: 1,
			entries: 2,
		});
		// Every fixture, the passkey winner (tukar) included.
		expect(await read("limit=50")).toMatchObject({ matched: 10, entries: 11 });
		// entries uses the route's own matching: a declared package counts in both.
		expect(await read("q=passkey&mode=keyword")).toMatchObject({
			matched: 1,
			entries: 1,
		});
		expect(await read("hackathon=r")).toMatchObject({ matched: 2, entries: 2 });
	});
});

describe("GET /api/hackathons/builds reads an event named in q as the filter", () => {
	// Two curated winners with no repo text, as the HackMeridian 2025 rows
	// are, a build elsewhere whose text names the event, and one whose text
	// holds the rest of q.
	const winner = (
		id: string,
		track: string,
		over: Partial<IndexedBuild> = {},
	) =>
		build(id, {
			hackathon: {
				title: "HackMeridian 2025",
				slug: "hackmeridian-2025",
				endedAt: "2025-09-16",
			},
			description: null,
			githubUrl: null,
			isWinner: true,
			track,
			haystack: `${id.replace(/-/g, " ")} ${track.toLowerCase()}`,
			...over,
		});
	const index = () => [
		winner("lance", "Composability", { hackathonPlacement: "1st Place" }),
		winner("simple-fund", "Open Innovation", {
			hackathonPlacement: "1st Place",
		}),
		build("payroll", {
			description: "Payroll we started at HackMeridian 2025",
			haystack: "payroll we started at hackmeridian 2025",
		}),
		build("fund-elsewhere", { haystack: "a simple fund for savings" }),
	];
	const get = async (qs: string) => {
		const { getHackathonBuildsIndex } = await import("@/lib/hackathon-builds");
		vi.mocked(getHackathonBuildsIndex).mockResolvedValueOnce(index());
		const { GET } = await import("../route");
		const res = await GET(
			new NextRequest(`https://x.test/api/hackathons/builds?${qs}`),
		);
		return { status: res.status, body: await res.json() };
	};
	const ids = (body: { builds: Array<{ id: string }> }) =>
		body.builds.map((b) => b.id);
	const INFERRED =
		"q holds the event name 'HackMeridian 2025', so hackathon=hackmeridian-2025 was applied and the name removed from q (meta.inferredFilter); to search q's words as text in every event instead, send hackathon= with no value";

	// Live 1.9.95: q=HackMeridian 2025 served 5 builds, none from the event.
	it("applies the event and serves its builds when q is only its name", async () => {
		const { status, body } = await get("q=HackMeridian%202025&limit=20");
		expect(status).toBe(200);
		expect(body.meta.inferredFilter).toEqual({
			hackathon: "hackmeridian-2025",
			matched: "HackMeridian 2025",
		});
		expect(body.meta.filters).toMatchObject({
			q: null,
			hackathon: ["hackmeridian-2025"],
		});
		// Served as a filter-only request is: no text query, winners first.
		expect(body.meta.matchMode).toBe("all");
		expect(
			(body.builds as Array<Record<string, unknown>>).map((b) => [
				b.id,
				b.hackathonSlug,
				b.track,
			]),
		).toEqual([
			["lance", "hackmeridian-2025", "Composability"],
			["simple-fund", "hackmeridian-2025", "Open Innovation"],
		]);
		expect(body.meta.warnings).toEqual([INFERRED]);
	});

	it("reads words that ask for the event's entries as nothing left to search", async () => {
		const { logApiHit } = await import("@/lib/api-usage");
		const { body } = await get("q=HackMeridian%202025%20winners");
		expect(body.meta.inferredFilter?.hackathon).toBe("hackmeridian-2025");
		expect(body.meta.filters.q).toBeNull();
		expect(ids(body)).toEqual(["lance", "simple-fund"]);
		// The usage log keeps the q the caller sent.
		expect(vi.mocked(logApiHit)).toHaveBeenLastCalledWith(
			expect.objectContaining({ query: "HackMeridian 2025 winners" }),
		);
	});

	it("searches the rest of q inside the event", async () => {
		const { body } = await get(
			"q=HackMeridian%202025%20simple%20fund&mode=keyword",
		);
		expect(body.meta.inferredFilter?.matched).toBe("HackMeridian 2025");
		expect(body.meta.filters).toMatchObject({
			q: "simple fund",
			hackathon: ["hackmeridian-2025"],
		});
		expect(ids(body)).toEqual(["simple-fund"]);
	});

	it("infers nothing from a name start several events share, and says which", async () => {
		const { body } = await get("q=hackmeridian&mode=keyword");
		expect(body.meta.inferredFilter).toBeUndefined();
		expect(body.meta.filters.hackathon).toBeNull();
		expect(body.meta.warnings?.[0]).toBe(
			"q holds 'hackmeridian', the start of the names of 2 events (hackmeridian-2025, hackmeridian-2026); nothing was inferred and q was searched as text; to search one of them, send hackathon=<slug>",
		);
	});

	it("lets an explicit hackathon win and says when q names another event", async () => {
		const { body } = await get("q=HackMeridian%202025&hackathon=e");
		expect(body.meta.inferredFilter).toBeUndefined();
		expect(body.meta.filters).toMatchObject({
			q: "hackmeridian 2025",
			hackathon: ["e"],
		});
		expect(body.meta.warnings?.[0]).toBe(
			"q names the event 'HackMeridian 2025' (hackmeridian-2025), which hackathon= does not select; nothing was inferred and q was searched as text inside the selected events",
		);
		// The same event, by its slug or its exact title: nothing to say.
		for (const sent of ["hackmeridian-2025", "e,HackMeridian%202025"]) {
			const same = await get(`q=HackMeridian%202025&hackathon=${sent}`);
			expect(same.body.meta.inferredFilter).toBeUndefined();
			expect(
				(same.body.meta.warnings ?? []).filter((w: string) =>
					w.startsWith("q names"),
				),
			).toEqual([]);
		}
	});

	it("searches q as text in every event when hackathon is sent empty", async () => {
		const { body } = await get("q=HackMeridian%202025&hackathon=&mode=keyword");
		expect(body.meta.inferredFilter).toBeUndefined();
		expect(body.meta.warnings).toBeUndefined();
		expect(body.meta.filters).toMatchObject({
			q: "hackmeridian 2025",
			hackathon: null,
		});
		expect(ids(body)).toEqual(["payroll"]);
	});

	it("serves an inferred event with no stored submissions as its filter does", async () => {
		const { status, body } = await get("q=HackMeridian%202026");
		expect(status).toBe(200);
		expect(body.meta.inferredFilter).toEqual({
			hackathon: "hackmeridian-2026",
			matched: "HackMeridian 2026",
		});
		expect(body.meta.counts.matched).toBe(0);
		expect(body.meta.warnings).toEqual([
			"q holds the event name 'HackMeridian 2026', so hackathon=hackmeridian-2026 was applied and the name removed from q (meta.inferredFilter); to search q's words as text in every event instead, send hackathon= with no value",
			"no submissions are stored for hackmeridian-2026; 0 matched from it is not evidence that nothing was built",
		]);
	});
});

// 2026-10-23: in hybrid mode the top 50 are reordered by a reranker that
// reads q with each build's name and summary; meta.reranked says whether it
// ran, and today's order serves when it could not.
describe("GET /api/hackathons/builds reranks hybrid results", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});
	const get = async (q: string, mode: string) => {
		const { semanticBuildScores } = await import(
			"@/lib/hackathon-build-semantic"
		);
		// Queued only where it is read: a keyword request leaves it for the
		// next case.
		if (mode === "hybrid")
			vi.mocked(semanticBuildScores).mockResolvedValueOnce(
				new Map([
					["kept", 0.8],
					["quiet", 0.7],
				]),
			);
		const { GET } = await import("../route");
		return (
			await GET(
				new NextRequest(
					`https://x.test/api/hackathons/builds?q=${encodeURIComponent(q)}&mode=${mode}`,
				),
			)
		).json();
	};
	const reranker = (fail = false) => {
		vi.stubEnv("VOYAGE_API_KEY", "test");
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init: RequestInit) => {
				if (fail) throw new Error("network");
				const { documents } = JSON.parse(String(init.body)) as {
					documents: string[];
				};
				return {
					ok: true,
					status: 200,
					json: async () => ({
						data: documents.map((d, index) => ({
							index,
							relevance_score: d.startsWith("quiet.") ? 0.9 : 0.1,
						})),
					}),
				};
			}),
		);
	};
	const ids = (body: { builds: { id: string }[] }) =>
		body.builds.map((b) => b.id);

	it("serves the hybrid order and says the reranker did not run when it fails", async () => {
		reranker(true);
		const body = await get("kept quiet", "hybrid");
		expect(ids(body)).toEqual(["kept", "quiet"]);
		expect(body.meta.reranked).toBe(false);
		expect(body.meta.warnings).toContain(
			"the reranker could not run this request (failed or slower than 2 s), so rows are in hybrid order",
		);
	});

	it("orders the top by the reranker and says it ran", async () => {
		reranker();
		// Its own q: the reranker caches what it scored, and the failure case
		// above must not find this answer in any order.
		const body = await get("quiet kept", "hybrid");
		expect(ids(body)).toEqual(["quiet", "kept"]);
		expect(body.meta.reranked).toBe(true);
		expect(body.meta.warnings).toBeUndefined();
	});

	it("leaves meta.reranked out in keyword mode", async () => {
		reranker();
		const body = await get("kept quiet", "keyword");
		expect(body.meta.reranked).toBeUndefined();
		expect(fetch).not.toHaveBeenCalled();
	});
});
