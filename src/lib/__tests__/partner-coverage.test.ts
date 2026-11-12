import { describe, expect, it } from "vitest";
import {
	applyOverrides,
	type Baseline,
	compareToBaseline,
	EvalBroken,
	type Fixture,
	type Get,
	noVerdict,
	type Partner,
	type PartnerResult,
	pacedReader,
	type QuestionResult,
	scorePartner,
	scoreQuestion,
	stableRun,
	summarize,
	toBaseline,
} from "../partner-coverage";

const ANN = "https://stellar.org/press/acme-oracle-is-live-on-stellar";

const partner = (o: Partial<Partner> = {}): Partner => ({
	name: "Acme Oracle",
	category: "oracle",
	weight: 2,
	source: {
		url: ANN,
		date: "2026-10-01",
		owner: "sdf",
		status: "live",
		says: "Acme Oracle is live on Stellar mainnet.",
	},
	aliases: ["acme oracle", "acme"],
	queries: ["Acme Oracle"],
	domains: ["acme.io"],
	expectedSlug: "acme-oracle",
	expectedTypes: ["Oracle"],
	expectedNetwork: { network: "mainnet", source: ANN },
	...o,
});

const row = (o: Record<string, unknown> = {}) => ({
	slug: "acme-oracle",
	name: "Acme Oracle",
	types: ["Oracle"],
	status: "Live",
	links: { website: "https://www.acme.io/" },
	deployment: { network: "mainnet" },
	...o,
});

/** Routes keyed "<path> <q>[ type=<t>]". A key mapped to null is a read that
 * failed after retries; an absent key answers empty. */
const fakeGet =
	(routes: Record<string, unknown>): Get =>
	async (path, params) => {
		const key = `${path} ${params.q ?? ""}${params.type ? ` type=${params.type}` : ""}`;
		if (key in routes) return routes[key];
		if (path === "/api/projects/search") return { projects: [] };
		if (path === "/api/projects/resolve") return { found: false };
		if (path === "/api/research") return { results: [] };
		return null;
	};

const found = (slug = "acme-oracle") => ({
	found: true,
	subject: { slug },
	current: { slug },
});

describe("scorePartner", () => {
	it("scores a found, correct row as well covered", async () => {
		const r = await scorePartner(
			partner(),
			fakeGet({
				"/api/projects/search Acme Oracle": {
					projects: [row({ slug: "other", name: "Other" }), row()],
				},
				"/api/projects/resolve Acme Oracle": found(),
			}),
			5,
		);
		expect(r.cls).toBe("well");
		expect(r.row?.rank).toBe(2);
		expect(r.checks).toEqual({
			rank: "pass",
			types: "pass",
			status: "pass",
			website: "pass",
			network: "pass",
			resolve: "pass",
		});
	});

	it("an unknown network is a depth gap, not a wrong row; a contradicted one is wrong", async () => {
		const unknown = await scorePartner(
			partner(),
			fakeGet({
				"/api/projects/search Acme Oracle": {
					projects: [row({ deployment: { network: "unknown" } })],
				},
			}),
			5,
		);
		expect(unknown.cls).toBe("well");
		expect(unknown.checks.network).toBe("unknown");
		expect(unknown.checks.resolve).toBe("fail");
		const contradicted = await scorePartner(
			partner(),
			fakeGet({
				"/api/projects/search Acme Oracle": {
					projects: [row({ deployment: { network: "testnet" } })],
				},
			}),
			5,
		);
		expect(contradicted.cls).toBe("wrong");
		expect(contradicted.checks.network).toBe("fail");
	});

	it("flags a row typed or statused against the source as wrong", async () => {
		const r = await scorePartner(
			partner(),
			fakeGet({
				"/api/projects/search Acme Oracle": {
					projects: [row({ types: ["SDK"], status: "Development" })],
				},
			}),
			5,
		);
		expect(r.cls).toBe("wrong");
		expect(r.checks.types).toBe("fail");
		expect(r.checks.status).toBe("fail");
	});

	it("a row with the partner's name under another slug is a wrong slug, not a find", async () => {
		const r = await scorePartner(
			partner(),
			fakeGet({
				"/api/projects/search Acme Oracle": {
					projects: [row({ slug: "acme-oracle-relayer", name: "Acme" })],
				},
				"/api/projects/resolve Acme Oracle": found("acme-oracle-relayer"),
			}),
			5,
		);
		expect(r.cls).toBe("wrong");
		expect(r.checks.rank).toBe("fail");
		expect(r.checks.resolve).toBe("fail");
		expect(r.problems.join(" ")).toMatch(/acme-oracle-relayer/);
	});

	it("records a partner with no row and no research trace as missing", async () => {
		const r = await scorePartner(
			partner({ expectedSlug: null }),
			fakeGet({
				"/api/projects/search Acme Oracle": {
					projects: [row({ slug: "zeta", name: "Zeta", links: {} })],
				},
				"/api/research Acme Oracle stellar": {
					results: [{ url: "https://x.org/a", title: "Zeta", content: "zeta" }],
				},
			}),
			5,
		);
		expect(r.cls).toBe("missing");
		expect(r.checks.resolve).toBe("n/a");
	});

	it("detects research-only coverage by announcement URL or a naming document", async () => {
		const byUrl = await scorePartner(
			partner({ expectedSlug: null }),
			fakeGet({
				"/api/research Acme Oracle stellar": {
					results: [{ url: `${ANN}/`, title: "Press", content: "" }],
				},
			}),
			5,
		);
		expect(byUrl.cls).toBe("research-only");
		expect(byUrl.research?.announcement).toBe(true);
		const byName = await scorePartner(
			partner({ expectedSlug: null }),
			fakeGet({
				"/api/research Acme Oracle stellar": {
					results: [
						{
							url: "https://x.org/b",
							title: "Roundup",
							content: "Acme ships feeds",
						},
					],
				},
			}),
			5,
		);
		expect(byName.cls).toBe("research-only");
		// The override for incidental words: only the announcement counts.
		const ignored = await scorePartner(
			partner({ expectedSlug: null, researchMentions: false }),
			fakeGet({
				"/api/research Acme Oracle stellar": {
					results: [
						{
							url: "https://x.org/b",
							title: "Roundup",
							content: "Acme ships feeds",
						},
					],
				},
			}),
			5,
		);
		expect(ignored.cls).toBe("missing");
	});

	it("a research mention of a common word counts only beside a declared context word", async () => {
		const p = partner({
			name: "Copper",
			aliases: ["copper"],
			queries: ["Copper"],
			expectedSlug: null,
			researchContext: ["custod"],
		});
		const commodity = await scorePartner(
			p,
			fakeGet({
				"/api/research Copper stellar": {
					results: [
						{
							url: "https://x.org/c",
							title: "Trade finance",
							content:
								"deals so far: zinc concentrate, copper concentrate, coal",
						},
					],
				},
			}),
			5,
		);
		expect(commodity.cls).toBe("missing");
		const custody = await scorePartner(
			p,
			fakeGet({
				"/api/research Copper stellar": {
					results: [
						{
							url: "https://x.org/d",
							title: "Roundup",
							content: "YLDS is now on Copper institutional custody",
						},
					],
				},
			}),
			5,
		);
		expect(custody.cls).toBe("research-only");
	});

	it("a read that failed after retries is could-not-check, never a miss", async () => {
		const search = await scorePartner(
			partner(),
			fakeGet({ "/api/projects/search Acme Oracle": null }),
			5,
		);
		expect(search.cls).toBe("could-not-check");
		const noSlug = await scorePartner(
			partner({ expectedSlug: null }),
			fakeGet({ "/api/projects/search Acme Oracle": null }),
			5,
		);
		expect(noSlug.checks.resolve).toBe("n/a");
		const research = await scorePartner(
			partner({ expectedSlug: null }),
			fakeGet({ "/api/research Acme Oracle stellar": null }),
			5,
		);
		expect(research.cls).toBe("could-not-check");
		const resolve = await scorePartner(
			partner(),
			fakeGet({
				"/api/projects/search Acme Oracle": { projects: [row()] },
				"/api/projects/resolve Acme Oracle": null,
			}),
			5,
		);
		expect(resolve.cls).toBe("well");
		expect(resolve.checks.resolve).toBe("could-not-check");
	});
});

describe("scoreQuestion", () => {
	const ps = new Map(
		[
			partner(),
			partner({
				alsoSlugs: ["beta-labs"],
				name: "Beta",
				aliases: ["beta"],
				expectedSlug: "beta",
				domains: ["beta.io"],
			}),
			partner({
				name: "Gamma",
				aliases: ["gamma"],
				expectedSlug: null,
				domains: ["gamma.io"],
			}),
		].map((p) => [p.name, p]),
	);
	it("scores recall@k with and without the type filter, and keeps unreadable variants out", async () => {
		const q = {
			id: "q1",
			question: "Which oracles?",
			type: "Oracle",
			expected: ["Acme Oracle", "Beta", "Gamma"],
		};
		const r = await scoreQuestion(
			q,
			ps,
			fakeGet({
				"/api/projects/search Which oracles?": {
					projects: [
						row({ slug: "beta", name: "Beta" }),
						row({ slug: "x", name: "X", links: {} }),
					],
					meta: { counts: { total: 2 } },
				},
				"/api/projects/search Which oracles? type=Oracle": null,
			}),
			10,
		);
		const [plain, typed] = r.variants;
		expect(plain.state).toBe("read");
		expect(plain.found).toEqual({ Beta: 1 });
		expect(plain.recall).toBeCloseTo(1 / 3);
		expect(typed.state).toBe("could-not-check");
		expect(typed.recall).toBeNull();
		const s = summarize([], [r]);
		expect(s.unreadable).toEqual({ units: 1, total: 2, share: 0.5 });
	});

	it("credits a partner with no slug yet when a row with its name or domain appears", async () => {
		const r = await scoreQuestion(
			{ id: "q2", question: "Gamma?", type: null, expected: ["Gamma"] },
			ps,
			fakeGet({
				"/api/projects/search Gamma?": {
					projects: [
						row({
							slug: "g",
							name: "G Labs",
							links: { website: "https://app.gamma.io" },
						}),
					],
				},
			}),
			10,
		);
		expect(r.variants).toHaveLength(1);
		expect(r.variants[0].found).toEqual({ Gamma: 1 });
	});

	it("credits a reviewed second row of a partner, once", async () => {
		const r = await scoreQuestion(
			{ id: "q3", question: "Beta?", type: null, expected: ["Beta"] },
			ps,
			fakeGet({
				"/api/projects/search Beta?": {
					projects: [
						row({ slug: "beta-labs", name: "Beta Labs" }),
						row({ slug: "beta", name: "Beta" }),
					],
				},
			}),
			10,
		);
		expect(r.variants[0].found).toEqual({ Beta: 1 });
	});
});

describe("ratchet", () => {
	const pr = (name: string, o: Partial<PartnerResult> = {}): PartnerResult => ({
		name,
		category: "oracle",
		weight: 1,
		expectedSlug: name.toLowerCase(),
		cls: "well",
		checks: {
			rank: "pass",
			types: "pass",
			status: "pass",
			website: "pass",
			network: "pass",
			resolve: "pass",
		},
		row: null,
		resolvedVia: null,
		problems: [],
		research: null,
		...o,
	});
	const qr = (
		found: Record<string, number>,
		expected = ["A", "B", "C"],
		k = 10,
	): QuestionResult => ({
		id: "q1",
		question: "Which?",
		type: null,
		expected,
		k,
		variants: [
			{
				variant: "q",
				state: "read",
				found,
				recall: Object.keys(found).length / expected.length,
				total: null,
			},
		],
	});
	const base = (): Baseline =>
		toBaseline([pr("A"), pr("B")], [qr({ A: 1, B: 2 })], {
			generatedAt: "2026-11-11T00:00:00Z",
			apiVersion: "1.9.128",
		});

	it("is quiet when nothing moved", () => {
		const c = compareToBaseline(
			[pr("A"), pr("B")],
			[qr({ A: 1, B: 2 })],
			base(),
		);
		expect(c).toEqual({
			regressions: [],
			improvements: [],
			changes: [],
			stale: [],
			unbaselined: [],
			notCompared: [],
			unreadableWithRow: [],
		});
	});

	it("research-only and missing are one tier: a move between them is reported, not failed", () => {
		const b = toBaseline(
			[
				pr("A", {
					cls: "research-only",
					checks: { ...pr("A").checks, rank: "fail" },
				}),
				pr("B"),
			],
			[qr({ A: 1, B: 2 })],
			{ generatedAt: "x", apiVersion: "y" },
		);
		const c = compareToBaseline(
			[
				pr("A", {
					cls: "missing",
					checks: { ...pr("A").checks, rank: "fail" },
				}),
				pr("B"),
			],
			[qr({ A: 1, B: 2 })],
			b,
		);
		expect(c.regressions).toEqual([]);
		expect(c.changes).toEqual(["A: research-only -> missing"]);
	});

	it("a rank slide inside k is a regression; a climb is an improvement", () => {
		const at = (name: string, rank: number) =>
			pr(name, {
				row: {
					slug: name.toLowerCase(),
					name,
					rank,
					query: name,
					types: [],
					status: "Live",
					website: null,
					network: null,
				},
			});
		const b = toBaseline([at("A", 1), at("B", 3)], [qr({ A: 1, B: 2 })], {
			generatedAt: "x",
			apiVersion: "y",
		});
		const c = compareToBaseline(
			[at("A", 3), at("B", 2)],
			[qr({ A: 1, B: 2 })],
			b,
		);
		expect(c.regressions).toEqual(["A: rank 1 -> 3 for its own name"]);
		expect(c.improvements).toEqual(["B: rank 3 -> 2 for its own name"]);
	});

	it("a network that goes from unknown to contradicted regresses on any class", () => {
		const unknown = { ...pr("A").checks, network: "unknown" as const };
		const b = toBaseline(
			[pr("A", { cls: "wrong", checks: unknown }), pr("B")],
			[qr({ A: 1, B: 2 })],
			{ generatedAt: "x", apiVersion: "y" },
		);
		const c = compareToBaseline(
			[
				pr("A", { cls: "wrong", checks: { ...unknown, network: "fail" } }),
				pr("B"),
			],
			[qr({ A: 1, B: 2 })],
			b,
		);
		expect(c.regressions).toEqual(["A: network unknown -> fail"]);
	});

	it("an unreadable resolve is not compared, counts as unreadable, and blocks a verdict on a well partner", () => {
		const a = pr("A", {
			checks: { ...pr("A").checks, resolve: "could-not-check" },
		});
		const c = compareToBaseline([a, pr("B")], [qr({ A: 1, B: 2 })], base());
		expect(c.regressions).toEqual([]);
		expect(c.notCompared).toEqual(["A: resolve"]);
		expect(c.unreadableWithRow).toEqual(["A: resolve"]);
		const s = summarize([a, pr("B")], [qr({ A: 1, B: 2 })]);
		expect(s.unreadable).toEqual({ units: 1, total: 5, share: 0.2 });
		const gone = compareToBaseline(
			[pr("A", { cls: "could-not-check" }), pr("B")],
			[qr({ A: 1, B: 2 })],
			base(),
		);
		expect(gone.unreadableWithRow).toEqual(["A"]);
	});

	it("an unreadable partner the baseline holds as a wrong row also blocks a verdict", () => {
		const b = toBaseline(
			[
				pr("A", { cls: "wrong", checks: { ...pr("A").checks, types: "fail" } }),
				pr("B"),
			],
			[qr({ A: 1, B: 2 })],
			{ generatedAt: "x", apiVersion: "y" },
		);
		const c = compareToBaseline(
			[pr("A", { cls: "could-not-check" }), pr("B")],
			[qr({ A: 1, B: 2 })],
			b,
		);
		expect(c.unreadableWithRow).toEqual(["A"]);
		// No row in the baseline: unreadable is budgeted, not a blocked verdict.
		const rowless = toBaseline(
			[
				pr("A", {
					cls: "missing",
					checks: { ...pr("A").checks, rank: "fail" },
				}),
				pr("B"),
			],
			[qr({ A: 1, B: 2 })],
			{ generatedAt: "x", apiVersion: "y" },
		);
		expect(
			compareToBaseline(
				[pr("A", { cls: "could-not-check" }), pr("B")],
				[qr({ A: 1, B: 2 })],
				rowless,
			).unreadableWithRow,
		).toEqual([]);
	});

	it("when a question expects more partners than k, only a drop in the count regresses", () => {
		const twelve = "ABCDEFGHIJKL".split("");
		const top = (names: string) =>
			Object.fromEntries(names.split("").map((n, i) => [n, i + 1]));
		const b = toBaseline([pr("A"), pr("B")], [qr(top("ABCDEFGHIJ"), twelve)], {
			generatedAt: "x",
			apiVersion: "y",
		});
		const swap = compareToBaseline(
			[pr("A"), pr("B")],
			[qr(top("ABCDEFGHIK"), twelve)],
			b,
		);
		expect(swap.regressions).toEqual([]);
		expect(swap.changes).toEqual([
			"q1 (q): recall 83% -> 83%, lost J, gained K",
		]);
		const drop = compareToBaseline(
			[pr("A"), pr("B")],
			[qr(top("ABCDEFGHI"), twelve)],
			b,
		);
		expect(drop.regressions).toEqual(["q1 (q): recall 83% -> 75%, lost J"]);
	});

	it("a baseline variant the fixture no longer asks is stale", () => {
		const typed: QuestionResult = {
			...qr({ A: 1, B: 2 }),
			type: "Oracle",
			variants: [
				...qr({ A: 1, B: 2 }).variants,
				{ ...qr({ A: 1, B: 2 }).variants[0], variant: "q+type" },
			],
		};
		const b = toBaseline([pr("A"), pr("B")], [typed], {
			generatedAt: "x",
			apiVersion: "y",
		});
		const c = compareToBaseline([pr("A"), pr("B")], [qr({ A: 1, B: 2 })], b);
		expect(c.stale).toEqual(["question q1 (q+type)"]);
	});

	it("lists a partner whose class worsens, a lost check, and a question whose recall drops", () => {
		const c = compareToBaseline(
			[
				pr("A", { cls: "wrong", checks: { ...pr("A").checks, types: "fail" } }),
				pr("B", { checks: { ...pr("B").checks, network: "unknown" } }),
			],
			[qr({ A: 1 })],
			base(),
		);
		expect(c.regressions).toHaveLength(4);
		expect(c.regressions.join("\n")).toMatch(/A: well -> wrong/);
		expect(c.regressions.join("\n")).toMatch(/A: types pass -> fail/);
		expect(c.regressions.join("\n")).toMatch(/B: network pass -> unknown/);
		expect(c.regressions.join("\n")).toMatch(/q1 \(q\).*lost B/);
	});

	it("a swap that keeps the total still loses a partner, so it is a regression", () => {
		const c = compareToBaseline(
			[pr("A"), pr("B")],
			[qr({ A: 1, C: 2 })],
			base(),
		);
		expect(c.regressions).toEqual([
			"q1 (q): recall 67% -> 67%, lost B, gained C",
		]);
	});

	it("prints improvements without failing", () => {
		const b = toBaseline(
			[
				pr("A", {
					cls: "missing",
					checks: { ...pr("A").checks, rank: "fail" },
				}),
				pr("B"),
			],
			[qr({ A: 1 })],
			{
				generatedAt: "x",
				apiVersion: "y",
			},
		);
		const c = compareToBaseline([pr("A"), pr("B")], [qr({ A: 1, B: 2 })], b);
		expect(c.regressions).toEqual([]);
		expect(c.improvements.join("\n")).toMatch(/A: missing -> well/);
		expect(c.improvements.join("\n")).toMatch(/q1 \(q\).*gained B/);
	});

	it("does not compare a partner or question it could not check", () => {
		const c = compareToBaseline(
			[pr("A", { cls: "could-not-check" }), pr("B")],
			[
				{
					...qr({}),
					variants: [
						{
							variant: "q",
							state: "could-not-check",
							found: {},
							recall: null,
							total: null,
						},
					],
				},
			],
			base(),
		);
		expect(c.regressions).toEqual([]);
		expect(c.notCompared).toEqual(["A", "q1 (q)"]);
	});

	it("fails on a stale baseline entry and on a partner the baseline lacks", () => {
		const c = compareToBaseline(
			[pr("A"), pr("D")],
			[qr({ A: 1, B: 2 })],
			base(),
		);
		expect(c.stale).toEqual(["partner B"]);
		expect(c.unbaselined).toEqual(["partner D"]);
	});
});

describe("applyOverrides", () => {
	const fx = (overrides: Fixture["overrides"]): Fixture => ({
		k: { partner: 5, question: 10 },
		categories: { oracle: "Oracles" },
		partners: [partner()],
		questions: [
			{ id: "q1", question: "?", type: null, expected: ["Acme Oracle"] },
		],
		overrides,
	});
	it("applies a reviewed override and refuses one without a reason or a partner", () => {
		const [p] = applyOverrides(
			fx({
				"Acme Oracle": {
					reason: "product site",
					domainsAdd: ["acme.app"],
					expectedTypes: ["Oracle", "SDK"],
				},
			}),
		);
		expect(p.domains).toEqual(["acme.io", "acme.app"]);
		expect(p.expectedTypes).toEqual(["Oracle", "SDK"]);
		expect(() => applyOverrides(fx({ Nobody: { reason: "x" } }))).toThrow(
			/Nobody/,
		);
		expect(() => applyOverrides(fx({ "Acme Oracle": { reason: "" } }))).toThrow(
			/reason/,
		);
		expect(() =>
			applyOverrides({
				...fx({}),
				questions: [
					{ id: "q1", question: "?", type: null, expected: ["Ghost"] },
				],
			}),
		).toThrow(/Ghost/);
	});

	it("refuses an unknown override key and an empty expected list", () => {
		expect(() =>
			applyOverrides(
				fx({ "Acme Oracle": { reason: "typo", expectedTypo: ["x"] } as never }),
			),
		).toThrow(/expectedTypo/);
		expect(() =>
			applyOverrides({
				...fx({}),
				questions: [{ id: "q9", question: "?", type: null, expected: [] }],
			}),
		).toThrow(/q9/);
	});
});

describe("run verdict", () => {
	it("scores again once when the API version moves mid-run", async () => {
		const versions = ["1.9.129", "1.9.130", "1.9.130", "1.9.130"];
		let runs = 0;
		const r = await stableRun(
			async () => versions.shift() ?? null,
			async () => ++runs,
		);
		expect(r).toEqual({
			result: 2,
			start: "1.9.130",
			end: "1.9.130",
			moved: false,
			attempts: 2,
		});
	});

	it("reports a move that repeats on the second run", async () => {
		const versions = ["1", "2", "2", "3"];
		const r = await stableRun(
			async () => versions.shift() ?? null,
			async () => "scored",
		);
		expect(r.moved).toBe(true);
		expect(r.attempts).toBe(2);
		const unread = await stableRun(
			async () => null,
			async () => "scored",
		);
		expect(unread.moved).toBe(true);
	});

	it("names the reason there is no verdict, or none", () => {
		const cmp = { unreadableWithRow: [] as string[] };
		const ok = { start: "1", end: "1", share: 0, max: 0.1, cmp };
		expect(noVerdict(ok)).toBeNull();
		expect(noVerdict({ ...ok, end: "2" })).toMatch(/API version moved/);
		expect(noVerdict({ ...ok, start: null, end: null })).toMatch(/API version/);
		expect(noVerdict({ ...ok, share: 0.2 })).toMatch(/20% unreadable/);
		expect(noVerdict({ ...ok, cmp: { unreadableWithRow: ["A"] } })).toMatch(
			/A/,
		);
		expect(noVerdict({ ...ok, cmp: null })).toBeNull();
	});
});

describe("pacedReader", () => {
	const res = (
		status: number,
		body: unknown = {},
		headers: Record<string, string> = {},
	) =>
		({
			ok: status >= 200 && status < 300,
			status,
			headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
			json: async () => body,
		}) as unknown as Response;
	const rig = (responses: Response[]) => {
		let t = 0;
		const starts: number[] = [];
		const waits: number[] = [];
		const agents: string[] = [];
		const reader = pacedReader({
			base: "https://scout.test",
			userAgent: "stellarlight-test/1",
			gapMs: 1000,
			attempts: 3,
			now: () => t,
			sleep: async (ms) => {
				waits.push(ms);
				t += ms;
			},
			fetch: (async (_url: string, init?: RequestInit) => {
				starts.push(t);
				agents.push(
					String((init?.headers as Record<string, string>)["User-Agent"]),
				);
				const r = responses.shift();
				if (!r) throw new Error("no response left");
				return r;
			}) as typeof fetch,
		});
		return { reader, starts, waits, agents };
	};

	it("paces requests and sends the user agent", async () => {
		const { reader, starts, agents } = rig([
			res(200, { a: 1 }),
			res(200, { b: 2 }),
		]);
		expect(await reader.get("/api/x", { q: "a" })).toEqual({ a: 1 });
		expect(await reader.get("/api/x", { q: "b" })).toEqual({ b: 2 });
		expect(starts).toEqual([0, 1000]);
		expect(agents).toEqual(["stellarlight-test/1", "stellarlight-test/1"]);
	});

	it("waits as Retry-After says on a 429, then reads", async () => {
		const { reader, waits } = rig([
			res(429, {}, { "retry-after": "7" }),
			res(200, { ok: true }),
		]);
		expect(await reader.get("/api/x", {})).toEqual({ ok: true });
		expect(waits).toContain(7000);
		expect(reader.stats).toEqual({ requests: 2, failed: 0 });
	});

	it("retries a 5xx and returns null (could not check) after the last attempt", async () => {
		const { reader, waits } = rig([res(503), res(502), res(500)]);
		expect(await reader.get("/api/x", {})).toBeNull();
		expect(waits).toEqual([5000, 10000]);
		expect(reader.stats).toEqual({ requests: 3, failed: 1 });
	});

	it("a 4xx other than 429 means the eval is broken, not that production is unreadable", async () => {
		const { reader } = rig([res(400, { error: "Unknown query param" })]);
		await expect(reader.get("/api/x", { bad: 1 })).rejects.toBeInstanceOf(
			EvalBroken,
		);
	});
});
