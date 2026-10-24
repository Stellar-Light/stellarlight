import { describe, expect, it } from "vitest";
import {
	buildJudging,
	CRITERION_EVIDENCE,
	JUDGED_EVENTS,
	type JudgingEvidence,
	repoEvidence,
	scfEvidence,
} from "../hackathon-judging";
import type { LiveRead, LiveRepoFacts } from "../repo-live-read";

const facts = (over: Partial<LiveRepoFacts> = {}): LiveRepoFacts => ({
	fullName: "Team/App",
	url: "https://github.com/Team/App",
	defaultBranch: "main",
	commit: "abc1234def5678",
	archived: false,
	createdAt: "2026-10-01T00:00:00Z",
	website: null,
	empty: false,
	tree: { complete: true, tests: [], testCount: 0, ci: [] },
	manifests: {
		read: 1,
		unread: 0,
		packages: [],
		otherSdk: null,
		sorobanSdk: null,
		stellarJsDep: null,
		cargoRead: 0,
		cargoUnread: 0,
		contractCrates: [],
	},
	readme: {
		path: "README.md",
		chars: 400,
		truncated: false,
		contractIds: [],
		demoLinks: [],
		otherLinks: [],
	},
	commits: { count: 3, lastAt: "2026-10-22T09:00:00Z" },
	releases: { count: 0, latestTag: null, latestAt: null },
	...over,
});
const read = (f: LiveRepoFacts, unread: string[] = []): LiveRead => ({
	state: "read",
	readAt: "2026-10-23T12:00:00Z",
	readMs: 800,
	unread: unread as never,
	unreadWhy: Object.fromEntries(
		unread.map((p) => [p, `Reason for ${p}.`]),
	) as never,
	facts: f,
});
const event = JUDGED_EVENTS.find((h) => h.uname === "hackmeridian-2026");
if (!event) throw new Error("hackmeridian-2026 has no criteria");

describe("each judged criterion maps to evidence or to a reason", () => {
	it("covers every criterion of every judged event", () => {
		for (const h of JUDGED_EVENTS)
			for (const c of h.judging?.criteria ?? [])
				for (const name of c.criteria)
					expect(CRITERION_EVIDENCE[name.toLowerCase()], name).toBeDefined();
	});

	it("serves HackMeridian 2026's criteria in its record's words, three of them not checkable", () => {
		const j = buildJudging(
			event,
			repoEvidence(read(facts())),
			scfEvidence(null),
		);
		expect(j.hackathon).toEqual({
			slug: "hackmeridian-2026",
			title: "HackMeridian 2026",
		});
		expect(j.source).toBe("https://hackmeridian.com");
		const shape = j.categories.map((c) => [
			c.category,
			c.criteria.map((x) => [
				x.criterion,
				x.checkable,
				x.evidence?.map((e) => e.id) ?? x.reason?.slice(0, 20),
			]),
		]);
		expect(shape).toEqual([
			[
				"Genesis",
				[
					["problem clarity", false, "Judged from the pitc"],
					[
						"MVP quality",
						true,
						[
							"testFiles",
							"ciConfig",
							"releases",
							"contractIds",
							"website",
							"demoLinks",
						],
					],
					[
						"Stellar integration",
						true,
						["stellarPackages", "contractCrates", "contractIds"],
					],
					["continued development potential", true, ["lastCommit"]],
				],
			],
			[
				"Scale",
				[
					[
						"milestones against goals set at pre-event intake",
						false,
						"The goals are set wi",
					],
					["SCF eligibility", true, ["scfRound"]],
					[
						"production readiness",
						true,
						[
							"testFiles",
							"ciConfig",
							"releases",
							"contractCrates",
							"contractIds",
							"website",
							"demoLinks",
						],
					],
					["ecosystem impact", false, "A judgment on the pi"],
				],
			],
		]);
		for (const c of j.categories)
			for (const x of c.criteria)
				if (!x.checkable) expect(x.evidence).toBeNull();
	});
});

const byId = (e: Record<string, JudgingEvidence>, id: string) => e[id];

describe("repo evidence never claims a missing thing it did not read", () => {
	it("says could-not-check for every item when the repo was not read", () => {
		for (const src of [
			{ state: "missing", readAt: "x", readMs: 1 },
			{
				state: "unread",
				readAt: "x",
				readMs: 1,
				reason: "GitHub did not answer.",
			},
			{ state: "none", reason: "No GitHub repo is linked." },
		] as const) {
			const e = repoEvidence(src);
			for (const item of Object.values(e)) {
				expect(item.state, item.id).toBe("could-not-check");
				expect(item.values).toBeNull();
			}
		}
	});

	it("says could-not-check for the items a part that did not answer holds", () => {
		const e = repoEvidence(
			read(
				facts({
					tree: null,
					manifests: null,
					readme: undefined,
					releases: null,
				}),
				["tree", "manifests", "readme", "releases"],
			),
		);
		for (const id of [
			"testFiles",
			"ciConfig",
			"stellarPackages",
			"contractCrates",
			"contractIds",
			"demoLinks",
			"releases",
		])
			expect(byId(e, id).state, id).toBe("could-not-check");
		expect(byId(e, "lastCommit").state).toBe("found");
		// Each item gives the reason of the part it rests on (review round 1,
		// finding 9: one note blamed GitHub for every part).
		expect(byId(e, "testFiles").finding).toBe("Reason for tree.");
		expect(byId(e, "stellarPackages").finding).toBe("Reason for manifests.");
		expect(byId(e, "contractIds").finding).toBe("Reason for readme.");
		expect(byId(e, "releases").finding).toBe("Reason for releases.");
	});

	// Review round 1, finding 2: over a cut-short listing a README missing
	// from the part listed served "no README", so its items read not-found.
	it("reads the README items could-not-check over a listing cut short without it", () => {
		const why =
			"GitHub cut the tree listing short and the README was not in the part listed, so whether the repo has one is not known.";
		const e = repoEvidence({
			...read(
				facts({
					tree: { complete: false, tests: [], testCount: 0, ci: [] },
					readme: undefined,
				}),
				["readme"],
			),
			unreadWhy: { readme: why },
		} as LiveRead);
		for (const id of ["contractIds", "demoLinks"]) {
			expect(byId(e, id).state, id).toBe("could-not-check");
			expect(byId(e, id).finding, id).toMatch(/cut the tree listing short/);
		}
	});

	// Review round 1, finding 5: the website counted as a demo whatever it
	// points at (a library's docs site was served as a demo found).
	it("reports the website as the website, never as a demo", () => {
		const e = repoEvidence(
			read(facts({ website: "https://example.github.io/some-sdk/" })),
		);
		expect(byId(e, "website")).toMatchObject({
			state: "found",
			values: ["https://example.github.io/some-sdk/"],
		});
		expect(byId(e, "website").finding).toMatch(/what it shows is not checked/);
		expect(byId(e, "demoLinks").state).toBe("not-found");
		expect(byId(e, "demoLinks").finding).not.toMatch(/some-sdk/);
		// Re-check 2: links inside HTML comments are not read, so the scope
		// names them.
		expect(byId(e, "demoLinks").finding).toMatch(
			/links nothing outside code hosts, docs, explorers, badges, chats, local addresses and HTML comments\./,
		);
	});

	it("does not call a short or partly read tree or README empty", () => {
		const e = repoEvidence(
			read(
				facts({
					tree: { complete: false, tests: [], testCount: 0, ci: [] },
					manifests: {
						...(facts().manifests as NonNullable<LiveRepoFacts["manifests"]>),
						unread: 3,
					},
					readme: {
						path: "README.md",
						chars: 100_000,
						truncated: true,
						contractIds: [],
						demoLinks: [],
						otherLinks: [],
					},
				}),
			),
		);
		for (const id of [
			"testFiles",
			"ciConfig",
			"stellarPackages",
			"contractIds",
			"demoLinks",
		])
			expect(byId(e, id).state, id).toBe("could-not-check");
	});

	it("does not call an unlabelled README link no demo", () => {
		const e = repoEvidence(
			read(
				facts({
					readme: {
						path: "README.md",
						chars: 900,
						truncated: false,
						contractIds: [],
						demoLinks: [],
						otherLinks: ["https://vault.example.net/dashboard"],
					},
				}),
			),
		);
		expect(byId(e, "demoLinks").state).toBe("could-not-check");
		expect(byId(e, "demoLinks").finding).toMatch(/vault\.example\.net/);
		// Review round 1: a wallet's README labels its localhost pages
		// "playground" (the reviewer's set), and READMEs label a live app
		// "Livedemo" or "Live at" (the sixth set), which Scout's label words
		// do not read. So the sentence speaks of Scout's reading and its scope,
		// never of every label the README uses.
		expect(byId(e, "demoLinks").finding).toMatch(
			/^Scout reads no demo or live-app label on README\.md's 1 link\(s\) outside code hosts, docs, explorers, badges, chats, local addresses and HTML comments/,
		);
		expect(byId(e, "demoLinks").finding).not.toMatch(/^No link/);
	});

	it("states what it found with the values and counts it cites", () => {
		const e = repoEvidence(
			read(
				facts({
					website: "https://app.example.net/",
					tree: {
						complete: true,
						tests: ["contracts/hello/src/test.rs"],
						testCount: 1,
						ci: [".github/workflows/ci.yml"],
					},
					manifests: {
						read: 2,
						unread: 0,
						packages: ["@stellar/stellar-sdk", "soroban-sdk"],
						otherSdk: "python:requirements.txt",
						sorobanSdk: "23.0.1",
						stellarJsDep: "@stellar/stellar-sdk@^14.2.0",
						cargoRead: 1,
						cargoUnread: 0,
						contractCrates: ["contracts/hello"],
					},
					readme: {
						path: "README.md",
						chars: 900,
						truncated: false,
						contractIds: [
							"CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
						],
						demoLinks: ["https://app.example.net", "https://youtu.be/x"],
						otherLinks: [],
					},
					releases: {
						count: 2,
						latestTag: "v0.2.0",
						latestAt: "2026-10-20T00:00:00Z",
					},
				}),
			),
		);
		expect(byId(e, "stellarPackages")).toMatchObject({
			state: "found",
			values: [
				"@stellar/stellar-sdk",
				"soroban-sdk",
				"python:requirements.txt",
			],
		});
		expect(byId(e, "stellarPackages").finding).toMatch(
			/soroban-sdk 23\.0\.1, @stellar\/stellar-sdk@\^14\.2\.0/,
		);
		expect(byId(e, "contractCrates").values).toEqual(["contracts/hello"]);
		expect(byId(e, "testFiles")).toMatchObject({ state: "found", count: 1 });
		expect(byId(e, "ciConfig").values).toEqual([".github/workflows/ci.yml"]);
		expect(byId(e, "releases")).toMatchObject({ values: ["v0.2.0"], count: 2 });
		expect(byId(e, "contractIds").finding).toMatch(
			/does not check them on chain/,
		);
		expect(byId(e, "website").values).toEqual(["https://app.example.net/"]);
		// Demo links are the README's labelled links only.
		expect(byId(e, "demoLinks").values).toEqual([
			"https://app.example.net",
			"https://youtu.be/x",
		]);
		// Sixth set: a README also called a link "the demonstration", in words
		// Scout does not read, so the count is of the links Scout read.
		expect(byId(e, "demoLinks").finding).toMatch(
			/^In README\.md, Scout reads 2 link\(s\) as labelled a demo or live app .*A link labelled in other words is not listed\./,
		);
		// Each item read from the repo's files names the commit it was read at.
		for (const id of [
			"testFiles",
			"ciConfig",
			"stellarPackages",
			"contractCrates",
			"contractIds",
			"demoLinks",
		])
			expect(byId(e, id).finding, id).toMatch(/at commit abc1234\b/);
		expect(byId(e, "lastCommit")).toMatchObject({
			values: ["2026-10-22T09:00:00Z"],
			count: 3,
		});
	});

	// Held-out run 1 (improvements/rounds/2026-10-23-judging-review.md):
	// a held-out repo read 12 of 38 manifests and served counts 1 and
	// 9 as if they were the repo's totals.
	it("never serves a count over a partial read, and says what was not read", () => {
		const e = repoEvidence(
			read(
				facts({
					tree: {
						complete: false,
						tests: ["src/a.test.ts"],
						testCount: 1,
						ci: [".github/workflows/ci.yml"],
					},
					manifests: {
						read: 12,
						unread: 26,
						packages: ["soroban-sdk"],
						otherSdk: null,
						sorobanSdk: "21.7.7",
						stellarJsDep: null,
						cargoRead: 10,
						cargoUnread: 17,
						contractCrates: ["contracts/amm", "contracts/factory"],
					},
					readme: {
						path: "README.md",
						chars: 100_000,
						truncated: true,
						contractIds: [
							"CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
						],
						demoLinks: ["https://app.example.net"],
						otherLinks: [],
					},
				}),
				["manifests"],
			),
		);
		for (const id of [
			"stellarPackages",
			"contractCrates",
			"contractIds",
			"ciConfig",
			"demoLinks",
		]) {
			expect(byId(e, id).state, id).toBe("found");
			expect(byId(e, id).count, id).toBeNull();
		}
		expect(byId(e, "stellarPackages").finding).toMatch(
			/The 12 of 38 manifests read declare 1 .*The 26 not read may declare more/,
		);
		expect(byId(e, "contractCrates").finding).toMatch(
			/In the 10 of 27 Cargo\.toml files read, 2 .*The 17 not read may hold more/,
		);
		expect(byId(e, "contractIds").finding).toMatch(/at least 1 contract id/);
		expect(byId(e, "ciConfig").finding).toMatch(/^At least 1 CI config/);
		// Test files are a floor by definition: the count stays, said as one.
		expect(byId(e, "testFiles")).toMatchObject({ count: 1 });
		expect(byId(e, "testFiles").finding).toMatch(/^At least 1 file/);
	});

	it("says not-found, scoped to what was read, when a full read holds none", () => {
		const e = repoEvidence(read(facts()));
		for (const id of [
			"testFiles",
			"ciConfig",
			"releases",
			"stellarPackages",
			"contractCrates",
			"contractIds",
			"website",
			"demoLinks",
		]) {
			expect(byId(e, id).state, id).toBe("not-found");
			expect(byId(e, id).values, id).toEqual([]);
		}
		expect(byId(e, "stellarPackages").finding).toMatch(
			/off that list is not seen/,
		);
		expect(byId(e, "testFiles").finding).toMatch(/inside source files/);
	});

	it("reads an empty repo as empty, item by item", () => {
		const e = repoEvidence(
			read(
				facts({
					empty: true,
					tree: { complete: true, tests: [], testCount: 0, ci: [] },
					readme: null,
					commits: { count: 0, lastAt: null },
				}),
			),
		);
		for (const item of Object.values(e)) {
			expect(item.state, item.id).toBe("not-found");
			// The website field is the repo's own setting, commits or none.
			if (item.id !== "website") expect(item.finding, item.id).toMatch(/empty/);
		}
		expect(byId(e, "website").finding).toMatch(/sets no website/);
	});
});

describe("SCF eligibility evidence", () => {
	const state = (
		rounds: Array<{
			round: number;
			phase: string;
			submissionDeadline: string | null;
		}>,
	) => ({
		currentRound: rounds[0]?.round ?? null,
		currentPhase: rounds[0]?.phase ?? null,
		lastConcludedRound: 44,
		roundsInProgress: rounds,
		submissionWindow: { opens: null, closes: null },
		fetchedAt: "2026-10-23T12:00:00Z",
	});

	it("names the open round, or says none is open, or could not check", () => {
		expect(
			scfEvidence(
				state([
					{ round: 46, phase: "Submission", submissionDeadline: "2026-11-02" },
				]),
			),
		).toMatchObject({
			state: "found",
			values: ["Round 46: Submission, deadline 2026-11-02"],
			count: 1,
		});
		expect(
			scfEvidence(
				state([{ round: 45, phase: "Panel Review", submissionDeadline: null }]),
			),
		).toMatchObject({ state: "not-found", values: [] });
		expect(scfEvidence(null)).toMatchObject({
			state: "could-not-check",
			values: null,
		});
		expect(scfEvidence(null).finding).toMatch(/scf-prescreen-checker/);
	});
});

describe("served text", () => {
	it("has no em or en dash", () => {
		const all = [
			...Object.values(CRITERION_EVIDENCE).map((r) =>
				"reason" in r ? r.reason : "",
			),
			...Object.values(repoEvidence(read(facts()))).map((e) => e.finding),
			...Object.values(
				repoEvidence({ state: "missing", readAt: "x", readMs: 1 }),
			).map((e) => e.finding),
			scfEvidence(null).finding,
		];
		for (const s of all) expect(s).not.toMatch(/[\u2013\u2014]/);
	});
});
