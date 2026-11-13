import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRepoInfoBatch } from "../github";
import { isKindMapped, kindOf } from "../improvement-ledger";
import {
	annotation,
	carryForward,
	HOLLOW_MAX_COMMITS,
	judgeRedirect,
	ledgerMode,
	type RedirectRow,
	redirectSummary,
} from "../repo-takeover";

/** [claimed, where GitHub redirects it, detected language, default-branch
 * commits, target created], read from GitHub's GraphQL API on 2026-11-12. */
type Row = [string, string, string | null, number | null, string];
/** The refusal's reason, null when followed, or the could-not-judge reason
 * marked as such. */
const judge = ([claimed, to, lang, commits, created]: Row) => {
	const v = judgeRedirect(claimed, {
		nameWithOwner: to,
		primaryLanguage: lang,
		commitCount: commits,
		createdAt: `${created}T00:00:00Z`,
	});
	if (v.verdict === "follow") return null;
	return v.verdict === "refuse" ? v.reason : `could-not-judge: ${v.reason}`;
};

// The three paths that now lead to one person's accounts.
const TAKEN: Row[] = [
	["scalemote/flow", "Moon-Launch/flow", null, 2, "2024-10-23"],
	[
		"yk-labs-dev/soroban-cli-gui",
		"web3-antivirus/soroban-cli-gui",
		null,
		2,
		"2025-10-11",
	],
	["orbit-cdp/hermes", "Moon-Launch/hermes", null, 1, "2026-02-07"],
];

// Every other rename enrich-repos followed in the 2026-11-12 run.
const HONEST: Row[] = [
	["arbach/stelien", "MavenArchive/stelien", "Rust", 16, "2023-07-13"],
	[
		"daccred/attest.so",
		"daccred/attestprotocol",
		"TypeScript",
		1126,
		"2024-07-16",
	],
	["eigerco/nebula", "equilibriumco/nebula", "Rust", 261, "2023-07-04"],
	["eigerco/quasar", "equilibriumco/quasar", "Rust", 36, "2023-09-11"],
	[
		"gaudiatech/pyved-engine",
		"pyved-solution/pyved-engine",
		"Python",
		752,
		"2021-09-14",
	],
	[
		"grants-projects/ea_kazi_backend_ic",
		"BIoTLabs/EA_KAZI_backend_ic",
		"Rust",
		7,
		"2023-04-18",
	],
	["hot-dao/hot-connector", "hot-dao/kit", "TypeScript", 150, "2025-11-20"],
	[
		"hunnykumar/swiftex",
		"SwiftExWallet/SwiftEx",
		"JavaScript",
		245,
		"2024-10-15",
	],
	[
		"hyperledger/solang",
		"hyperledger-solang/solang",
		"Rust",
		2422,
		"2018-12-29",
	],
	[
		"icon-project/sodax-sdks",
		"gosodax/sodax-sdks",
		"TypeScript",
		821,
		"2026-05-03",
	],
	[
		"joaquinsoza/stellar-tools",
		"yripper/stellar-tools",
		"TypeScript",
		104,
		"2024-04-04",
	],
	[
		"linkioafrica/link-usdc-app",
		"LINK-GLOBAL/link-usdc-app",
		"TypeScript",
		33,
		"2026-01-30",
	],
	[
		"mugglepay/MugglePay",
		"MugglePay/MugglePay",
		"JavaScript",
		107,
		"2020-01-05",
	],
	[
		"paychant/celo-merchant",
		"gabrieladeniji/celo-merchant",
		"Vue",
		5,
		"2020-11-13",
	],
	[
		"paychant/celo-web-wallet",
		"gabrieladeniji/celo-web-wallet",
		"JavaScript",
		32,
		"2020-10-07",
	],
	[
		"potlock/grantpicks-stellar",
		"PotLock/grantpicks",
		"TypeScript",
		622,
		"2024-05-12",
	],
	[
		"salazarsebas/teji",
		"salazarsebas/stellar-agentgate",
		"TypeScript",
		43,
		"2026-08-05",
	],
	[
		"slideloft/swplug-plugin",
		"flarcos/swplug-plugin",
		"JavaScript",
		7,
		"2019-06-02",
	],
	["techlibs/bwb-stellar", "BWB-Labs/bwb-stellar", "Rust", 143, "2026-06-03"],
	["tenk-dao/smart-deploy", "TENK-DAO/smartdeploy", "Rust", 53, "2023-04-07"],
	[
		"theahaco/scaffold-stellar",
		"stellar-scaffold/cli",
		"Rust",
		307,
		"2025-04-17",
	],
	[
		"usepaykit/stellar-tools",
		"payrouteshq/stellartools",
		"TypeScript",
		1137,
		"2025-11-01",
	],
	["zkbricks/mpc-zexe", "zkbricks/lib-sanctum", "Rust", 86, "2024-01-10"],
];

// The honest moves closest to a takeover's shape, from the same day's
// sweep of project claims and hackathon build links: each fails one of the
// two tests a takeover meets.
const LOOK_ALIKES: Row[] = [
	// No detected language, but 26 commits of history.
	[
		"theahaco/attest-contract",
		"stellar-registry/actions",
		null,
		26,
		"2026-03-06",
	],
	// Two commits, created and last pushed the same day, but code.
	[
		"leojay-net/Stellar-Agent-Flow",
		"Pridex-Org/Stellar-Agent-Flow",
		"TypeScript",
		2,
		"2026-04-13",
	],
	// One commit, but code.
	[
		"rtorres-star/CasaTlacuatzinContract",
		"rtorresrocio/CasaTlacuatzinContract",
		"Rust",
		1,
		"2025-10-29",
	],
	[
		"AqilaRifti/ZKHiderSeeker",
		"AqilaTheBuilder/ZKHiderSeeker",
		"TypeScript",
		1,
		"2026-02-23",
	],
	// An org moved to a new login: the same repo, all its history.
	[
		"xBull-Corp/Guess-the-xBull",
		"xBullCorp/Guess-the-xBull",
		"Rust",
		13,
		"2026-02-20",
	],
];

describe("judgeRedirect", () => {
	it.each(TAKEN)("refuses %s -> %s", (...row) => {
		expect(judge(row as Row)).toMatch(
			/^\S+ now redirects to \S+, a repo under another owner with no code/,
		);
	});

	it.each(HONEST)("follows %s -> %s", (...row) => {
		expect(judge(row as Row)).toBeNull();
	});

	it.each(LOOK_ALIKES)("follows the look-alike %s -> %s", (...row) => {
		expect(judge(row as Row)).toBeNull();
	});

	it("says what was found, in its own words", () => {
		expect(judge(TAKEN[0])).toBe(
			"scalemote/flow now redirects to Moon-Launch/flow, a repo under another owner with no code and 2 commits, created 2024-10-23",
		);
		expect(judge(TAKEN[2])).toContain("and 1 commit, created");
	});

	it("follows a change of letter case, even to an empty repo", () => {
		expect(
			judge([
				"mugglepay/MugglePay",
				"MugglePay/MugglePay",
				null,
				1,
				"2020-01-05",
			]),
		).toBeNull();
		expect(judge(["Foo/bar", "foo/Bar", null, null, "2026-01-01"])).toBeNull();
	});

	it("follows a rename inside one owner, even to an empty repo", () => {
		expect(
			judge(["hot-dao/hot-connector", "hot-dao/kit", null, 1, "2025-11-20"]),
		).toBeNull();
	});

	it("follows an org-to-org transfer that kept its history", () => {
		expect(
			judge([
				"hyperledger/solang",
				"hyperledger-solang/solang",
				null,
				2422,
				"2018-12-29",
			]),
		).toBeNull();
	});

	it("refuses a move to another owner's empty repo (no branch)", () => {
		expect(judge(["a/x", "b/x", null, 0, "2026-01-01"])).toContain("0 commits");
	});

	it("draws the line at HOLLOW_MAX_COMMITS", () => {
		expect(
			judge(["a/x", "b/x", null, HOLLOW_MAX_COMMITS, "2026-01-01"]),
		).not.toBeNull();
		expect(
			judge(["a/x", "b/x", null, HOLLOW_MAX_COMMITS + 1, "2026-01-01"]),
		).toBeNull();
	});

	it("has nothing to judge without a redirect target", () => {
		expect(
			judgeRedirect("a/x", {
				nameWithOwner: null,
				primaryLanguage: null,
				commitCount: 0,
			}),
		).toEqual({ verdict: "follow" });
	});
});

describe("a field GitHub did not answer is never read as absent", () => {
	const target = {
		nameWithOwner: "stellar-registry/actions",
		primaryLanguage: null,
		createdAt: "2026-03-06T00:00:00Z",
	};
	it("an unread commit count is could-not-judge, never 0 commits", () => {
		const v = judgeRedirect("theahaco/attest-contract", {
			...target,
			commitCount: null,
		});
		expect(v).toEqual({
			verdict: "could-not-judge",
			reason:
				"theahaco/attest-contract redirects to stellar-registry/actions, under another owner, and GitHub's answer left out its commit count",
		});
	});
	it("an unread language is could-not-judge too", () => {
		const v = judgeRedirect("theahaco/attest-contract", {
			...target,
			commitCount: 1,
			unread: ["primaryLanguage"],
		});
		expect(v.verdict).toBe("could-not-judge");
		expect(v.verdict !== "follow" && v.reason).toContain("its language");
	});
	it("a language GitHub read is code, whatever else it left out", () => {
		expect(
			judgeRedirect("a/x", {
				nameWithOwner: "b/x",
				primaryLanguage: "Rust",
				commitCount: null,
				unread: ["defaultBranchRef"],
			}),
		).toEqual({ verdict: "follow" });
	});
});

describe("a batched read keeps a field-level error as unread", () => {
	afterEach(() => vi.unstubAllGlobals());
	/** A repo node as GitHub returns it in a batch, around the fields under
	 * test. */
	const node = (nameWithOwner: string, extra: Record<string, unknown>) => ({
		url: `https://github.com/${nameWithOwner}`,
		nameWithOwner,
		primaryLanguage: null,
		createdAt: "2026-03-06T00:00:00Z",
		...extra,
	});
	it("an errored branch reads as not read; a repo with no branch as 0 commits", async () => {
		vi.stubGlobal(
			"fetch",
			async () =>
				new Response(
					JSON.stringify({
						data: {
							// The history errored: GitHub nulls the branch and says why.
							r0: node("stellar-registry/actions", { defaultBranchRef: null }),
							// An empty repo: no branch, and no error.
							r1: node("b/empty", { defaultBranchRef: null }),
							// The commit target errored under a branch that answered.
							r2: node("b/partial", {
								defaultBranchRef: { target: null },
							}),
						},
						errors: [
							{
								path: ["r0", "defaultBranchRef"],
								message: "Something went wrong while executing your query.",
							},
							{
								path: ["r2", "defaultBranchRef", "target"],
								message: "timeout",
							},
						],
					}),
					{ status: 200 },
				),
		);
		const out = await fetchRepoInfoBatch([
			{ owner: "theahaco", name: "attest-contract" },
			{ owner: "a", name: "empty" },
			{ owner: "a", name: "partial" },
		]);
		const info = out.map((o) => (o && "info" in o ? o.info : null));
		expect(info.map((i) => i?.commitCount)).toEqual([null, 0, null]);
		expect(info[0]?.unread).toEqual(["defaultBranchRef"]);
		const verdicts = ["theahaco/attest-contract", "a/empty", "a/partial"].map(
			(claimed, i) => {
				const t = info[i];
				return t ? judgeRedirect(claimed, t).verdict : "missing";
			},
		);
		expect(verdicts).toEqual(["could-not-judge", "refuse", "could-not-judge"]);
	});
});

describe("refusals reach a consumer", () => {
	const ROWS: RedirectRow[] = [
		{
			verdict: "refuse",
			claimed: "scalemote/flow",
			to: "Moon-Launch/flow",
			project: "planet-pay",
			reason:
				"scalemote/flow now redirects to Moon-Launch/flow, a repo under another owner with no code and 2 commits, created 2024-10-23",
		},
		{
			verdict: "could-not-judge",
			claimed: "theahaco/attest-contract",
			to: "stellar-registry/actions",
			project: "stellar-registry",
			reason:
				"theahaco/attest-contract redirects to stellar-registry/actions, under another owner, and GitHub's answer left out its commit count",
		},
		{
			verdict: "denied",
			claimed: "web3-antivirus/FADA",
			to: "web3-antivirus/FADA",
			project: "web3-antivirus",
			reason: "web3-antivirus/FADA is on the denied list",
		},
	];
	it("each finding maps to a ledger kind; a denied row is no finding", () => {
		expect(ROWS.map(ledgerMode)).toEqual([
			"redirect-taken",
			"redirect-unjudged",
			null,
		]);
		expect(isKindMapped("repo-redirects", "redirect-taken")).toBe(true);
		expect(isKindMapped("repo-redirects", "redirect-unjudged")).toBe(true);
		expect(kindOf("repo-redirects", "redirect-taken")).toBe("world");
		expect(kindOf("repo-redirects", "redirect-unjudged")).toBe("instrument");
	});
	it("annotates refusals and unjudged rows, not denied ones", () => {
		expect(ROWS.map(annotation)).toEqual([
			`::warning title=Repo redirect refused::${ROWS[0].reason} (claimed by planet-pay)`,
			`::notice title=Repo redirect not judged::${ROWS[1].reason} (claimed by stellar-registry)`,
			null,
		]);
	});
	it("the job summary lists every row and says how to override", () => {
		const md = redirectSummary(ROWS);
		for (const r of ROWS) expect(md).toContain(r.reason);
		expect(md).toContain(
			"claim the new path directly (GITHUB_REPOS_SET or GITHUB_LINK_FIX)",
		);
		expect(redirectSummary([])).toBe("");
	});
});

describe("carryForward: a claim not read is not a claim repaired", () => {
	const refusal = (claimed: string, extra: Partial<RedirectRow> = {}) => ({
		verdict: "refuse" as const,
		claimed,
		to: "x/y",
		project: "p",
		reason: `${claimed} now redirects to x/y`,
		...extra,
	});
	const previous = {
		generatedAt: "2026-11-12T00:00:00.000Z",
		rows: [
			refusal("a/one"),
			refusal("org/two"),
			refusal("a/three"),
			refusal("a/four"),
			refusal("a/five", { carriedFrom: "2026-11-05T00:00:00.000Z" }),
			{ ...refusal("a/six"), verdict: "denied" },
		],
	};
	const unjudged: RedirectRow = {
		verdict: "could-not-judge",
		claimed: "A/Three",
		to: "x/y",
		project: "p",
		reason: "not judged",
	};
	it("keeps refusals for unread claims, org listings that failed and claims not judged", () => {
		const rows = carryForward(
			[unjudged, refusal("a/four", { reason: "decided again" })],
			previous,
			new Set(["a/one", "org/", "a/five", "a/six"]),
		);
		// A/Three's could-not-judge row gives way to its carried refusal.
		expect(rows.map((r) => [r.claimed, r.carriedFrom ?? null])).toEqual([
			["a/four", null],
			["a/one", "2026-11-12T00:00:00.000Z"],
			["org/two", "2026-11-12T00:00:00.000Z"],
			["a/three", "2026-11-12T00:00:00.000Z"],
			// Carried twice: the first run that lost it is kept.
			["a/five", "2026-11-05T00:00:00.000Z"],
		]);
	});
	it("carries nothing from a missing or malformed artifact", () => {
		expect(carryForward([], null, new Set(["a/one"]))).toEqual([]);
		expect(carryForward([], { rows: "x" }, new Set(["a/one"]))).toEqual([]);
	});
});

describe("an unjudged claim refused before stays one refusal", () => {
	const prior: RedirectRow = {
		verdict: "refuse",
		claimed: "scalemote/flow",
		to: "Moon-Launch/flow",
		project: "planet-pay",
		reason: "scalemote/flow now redirects to Moon-Launch/flow",
	};
	const unjudged: RedirectRow = {
		...prior,
		verdict: "could-not-judge",
		reason: "scalemote/flow redirects to Moon-Launch/flow, not judged",
	};
	const other: RedirectRow = { ...prior, claimed: "a/b", reason: "a/b" };
	it.each([
		["unjudged first", [unjudged, other]],
		["unjudged last", [other, unjudged]],
	])("%s: the refusal is the claim's only row", (_, rows) => {
		const out = carryForward(
			rows as RedirectRow[],
			{ generatedAt: "2026-11-12T00:00:00.000Z", rows: [prior] },
			new Set(),
		);
		const mine = out.filter((r) => r.claimed === "scalemote/flow");
		expect(mine).toHaveLength(1);
		expect(mine[0].verdict).toBe("refuse");
		expect(ledgerMode(mine[0])).toBe("redirect-taken");
	});
});
