import { describe, expect, it, vi } from "vitest";
import {
	fetchRepoActivity,
	fetchRepoContributors,
	type Gh,
} from "../../../scripts/scan/fetch-repo-code";
import {
	type ContributorBuildRow,
	contributorBuildsByLogin,
	humanLogins,
	isHumanContributor,
} from "../hackathon-build-contributors";

describe("isHumanContributor: the bot and agent rule", () => {
	it("keeps people, including logins that only contain bot or ai", () => {
		for (const login of [
			"josuebrenes",
			"Robotron2",
			"bamiebot-maker",
			"codeX-james",
			"Helton-AI",
			"agentina",
		])
			expect(isHumanContributor(login, "User")).toBe(true);
	});

	it("drops GitHub App and bot accounts, AI coding agents and bot or agent named accounts", () => {
		expect(isHumanContributor("dependabot[bot]", "Bot")).toBe(false);
		expect(isHumanContributor("Copilot", "Bot")).toBe(false);
		// A [bot] login is dropped even when the type is missing.
		expect(isHumanContributor("lovable-dev[bot]")).toBe(false);
		// Agents GitHub lists as plain User accounts.
		for (const login of [
			"claude",
			"codex",
			"cursoragent",
			"copilot",
			"v0",
			"openhands-agent",
			"replit-agent",
			"emergent-agent-e1",
			"rhoggs-bot-test-account",
			"ebuks-bot",
		])
			expect(isHumanContributor(login, "User")).toBe(false);
	});

	it("lowercases, keeps first-seen order, drops repeats and unlinked authors", () => {
		expect(
			humanLogins([
				{ login: "Alice", type: "User" },
				null,
				{ login: "claude", type: "User" },
				{ login: "bob", type: "User" },
				{ login: "alice", type: "User" },
				{ login: null },
			]),
		).toEqual(["alice", "bob"]);
	});
});

const json = (status: number, body: unknown) =>
	status === 204
		? new Response(null, { status })
		: new Response(JSON.stringify(body), { status });
const user = (login: string, type = "User") => ({ login, type });

describe("fetchRepoContributors", () => {
	it("reads every page of the contributors API, humans only", async () => {
		const first = Array.from({ length: 100 }, (_, i) => user(`p${i}`));
		const gh = vi.fn(async (url: string) =>
			url.endsWith("&page=1")
				? json(200, first)
				: json(200, [user("Late"), user("dependabot[bot]", "Bot")]),
		);
		const got = await fetchRepoContributors(gh as Gh, "a/b");
		expect(got.state).toBe("read");
		expect(got.state === "read" && got.logins.length).toBe(101);
		expect(got.state === "read" && got.logins.at(-1)).toBe("late");
		expect(gh).toHaveBeenCalledTimes(2);
	});

	it("says read-empty for an empty repo, missing on 404, and concludes nothing otherwise", async () => {
		expect(
			await fetchRepoContributors(async () => json(204, null), "a/b"),
		).toEqual({ state: "read", logins: [] });
		expect(
			await fetchRepoContributors(async () => json(404, {}), "a/b"),
		).toEqual({ state: "missing" });
		expect(
			(await fetchRepoContributors(async () => json(403, {}), "a/b")).state,
		).toBe("error");
	});

	it("reads a fork as the authors of the commits its parent does not hold", async () => {
		const gh = vi.fn(async (url: string) => {
			// The fork's own contributors list would name the parent's authors.
			if (url.includes("/contributors"))
				return json(200, [user("leighmcculloch"), user("JoseCToscano")]);
			expect(url).toContain(
				"/repos/josectoscano/stellar-cli/compare/stellar:main...main",
			);
			return json(200, {
				total_commits: 2,
				commits: [{ author: user("JoseCToscano") }, { author: null }],
			});
		});
		expect(
			await fetchRepoContributors(gh as Gh, "josectoscano/stellar-cli", {
				parent: "stellar/stellar-cli",
				parentBranch: "main",
				branch: "main",
			}),
		).toEqual({ state: "read", logins: ["josectoscano"] });
	});

	it("never reads a fork it cannot compare: a gone parent, a 404 or too many commits", async () => {
		const fork = { parent: "x/y", parentBranch: "main", branch: "main" };
		expect(
			(
				await fetchRepoContributors(async () => json(200, []), "a/b", {
					...fork,
					parent: null,
				})
			).state,
		).toBe("error");
		// A 404 on compare can be the parent's branch: not "missing".
		expect(
			(await fetchRepoContributors(async () => json(404, {}), "a/b", fork))
				.state,
		).toBe("error");
		const page = Array.from({ length: 100 }, () => ({ author: user("a") }));
		expect(
			(
				await fetchRepoContributors(
					async () => json(200, { total_commits: 900, commits: page }),
					"a/b",
					fork,
				)
			).state,
		).toBe("error");
	});
});

describe("fetchRepoActivity: fork facts", () => {
	it("names a fork's parent and both default branches, and nothing on a non-fork", async () => {
		const post = vi.fn(async () =>
			json(200, {
				data: {
					r0: {
						nameWithOwner: "JoseCToscano/stellar-cli",
						isArchived: false,
						isFork: true,
						parent: {
							nameWithOwner: "stellar/stellar-cli",
							defaultBranchRef: { name: "main" },
						},
						defaultBranchRef: { name: "dev", target: null },
					},
					r1: {
						isArchived: false,
						isFork: false,
						parent: null,
						defaultBranchRef: null,
					},
				},
			}),
		);
		const got = await fetchRepoActivity(
			"t",
			["josectoscano/stellar-cli", "a/b"],
			post as unknown as typeof fetch,
		);
		const fork = got.get("josectoscano/stellar-cli");
		expect(fork?.state === "read" && fork.fork).toEqual({
			parent: "stellar/stellar-cli",
			parentBranch: "main",
			branch: "dev",
		});
		expect(got.get("a/b")).toEqual({
			state: "read",
			lastCommitAt: null,
			archived: false,
		});
	});
});

const row = (
	over: Partial<ContributorBuildRow> & { buildId: string },
): ContributorBuildRow => ({
	name: "Build",
	hackathonTitle: "HackMeridian 2026",
	hackathonSlug: "hackmeridian-2026",
	endedAt: "2026-10-26T12:00:00.000Z",
	url: "https://example.org/build",
	contributors: ["josuebrenes", "ana"],
	contributorsReadAt: "2026-11-24T00:00:00.000Z",
	...over,
});

describe("contributorBuildsByLogin", () => {
	it("gives each login its builds, newest event first, with the basis and the read", () => {
		const got = contributorBuildsByLogin(
			[
				row({
					buildId: "dorahacks-buidl-1",
					name: "Old",
					hackathonSlug: "stellarhack",
					hackathonTitle: "Stellar Hack",
					endedAt: "2025-05-01",
					placement: "1st Place",
					isWinner: true,
				}),
				row({ buildId: "curated-hackmeridian-2026-nomad", name: "Nomad" }),
			],
			["JosueBrenes", "nobody"],
		);
		expect(got.get("nobody")).toBeUndefined();
		expect(got.get("josuebrenes")).toEqual([
			{
				id: "curated-hackmeridian-2026-nomad",
				name: "Nomad",
				hackathon: "HackMeridian 2026",
				hackathonSlug: "hackmeridian-2026",
				endedAt: "2026-10-26T12:00:00.000Z",
				placement: null,
				isWinner: false,
				url: "https://example.org/build",
				basis: "contributor",
				contributorCount: 2,
				contributorsReadAt: "2026-11-24T00:00:00.000Z",
			},
			expect.objectContaining({
				id: "dorahacks-buidl-1",
				placement: "1st Place",
				isWinner: true,
			}),
		]);
	});

	it("counts a row only once its contributors were read", () => {
		expect(
			contributorBuildsByLogin(
				[row({ buildId: "dorahacks-buidl-2", contributorsReadAt: null })],
				["ana"],
			).size,
		).toBe(0);
	});

	it("keys builds as the index does: a resubmission is one, two events are two, two curated repos are two", () => {
		const got = contributorBuildsByLogin(
			[
				row({ buildId: "dorahacks-buidl-3", name: "Pay" }),
				row({ buildId: "dorahacks-buidl-4", name: "pay ", isWinner: true }),
				row({
					buildId: "dorahacks-buidl-3",
					name: "Pay",
					hackathonSlug: "other",
					endedAt: "2026-01-01",
				}),
				row({ buildId: "curated-hackmeridian-2026-nomad-vault", name: "V" }),
				row({ buildId: "curated-hackmeridian-2026-nomad-vault-2", name: "V" }),
			],
			["ana"],
		);
		const ids = got.get("ana")?.map((b) => `${b.hackathonSlug}:${b.id}`);
		expect(ids?.sort()).toEqual([
			"hackmeridian-2026:curated-hackmeridian-2026-nomad-vault",
			"hackmeridian-2026:curated-hackmeridian-2026-nomad-vault-2",
			// the placed entry of the resubmission wins its key
			"hackmeridian-2026:dorahacks-buidl-4",
			"other:dorahacks-buidl-3",
		]);
	});
});
