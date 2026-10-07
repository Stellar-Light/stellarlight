/**
 * Attribution invariants for builder profiles.
 *
 * Three real bugs in two days, all the same shape: a number or a label under a
 * person's name that was actually someone else's. This pins the rule so it
 * can't quietly come back:
 *
 *   - a repo's commits90d is EVERYONE's work; it only counts under a person
 *     when they own the repo (0xdevcollins showed "318 commits, 90d" against
 *     35 real, because boundlessfi/boundless was summed into his headline)
 *   - a repo they contribute to counts through myCommits12m — their share
 *   - a project is "built" only via owned repos or an org that IS them;
 *     anything else is "contributes to" (blessedux read "builds SDF")
 *
 * The fixtures are the real cases, with a fake Payload so nothing touches Mongo.
 */
import { describe, expect, it } from "vitest";
import { type BuilderLike, builderCodeActivity } from "./builder-code";

type Doc = Record<string, unknown>;

// Minimal Payload stand-in: answers `find` from canned collections.
function fakePayload(collections: { repos: Doc[]; projects: Doc[] }) {
	return {
		find: async ({ collection }: { collection: "repos" | "projects" }) => ({
			docs: collections[collection],
		}),
	} as any;
}

const repo = (
	fullName: string,
	opts: {
		commits90d?: number;
		stars?: number;
		projectSlug?: string | null;
		lastCommitAt?: string;
		lang?: string;
	} = {},
): Doc => ({
	owner: fullName.split("/")[0],
	fullName,
	url: `https://github.com/${fullName}`,
	projectSlug: opts.projectSlug ?? null,
	stars: opts.stars ?? 0,
	lastCommitAt: opts.lastCommitAt ?? "2026-08-01T00:00:00.000Z",
	activitySignals: { commits90d: opts.commits90d ?? 0 },
	primaryLanguage: opts.lang ?? "TypeScript",
});

describe("builderCodeActivity attribution", () => {
	it("does not credit a contributor with the whole repo's 90-day commits", async () => {
		// 0xdevcollins: owns one small repo, contributed 412 commits/12mo to
		// boundlessfi/boundless which itself has 35 commits/90d by everyone.
		const builders: BuilderLike[] = [
			{
				github_username: "0xdevcollins",
				contributions: [{ fullName: "boundlessfi/boundless", commits12m: 412 }],
			},
		];
		const payload = fakePayload({
			repos: [
				repo("0xdevcollins/klyra", { commits90d: 12 }),
				repo("boundlessfi/boundless", {
					commits90d: 35,
					projectSlug: "boundless",
				}),
			],
			projects: [{ slug: "boundless", name: "Boundless", github: {} }],
		});

		const out = await builderCodeActivity(payload, builders);
		const me = out.get("0xdevcollins");
		expect(me).toBeDefined();

		// headline = own repos only
		expect(me!.commits90d).toBe(12);
		// their share of others' repos, separately
		expect(me!.contributedCommits12m).toBe(412);
		// and never the org's total under their name
		expect(me!.commits90d).toBeLessThan(35 + 12);

		// the repo row keeps both numbers so the table can show them side by side
		const bl = me!.repos.find((r) => r.fullName === "boundlessfi/boundless");
		expect(bl?.via).toBe("contributor");
		expect(bl?.commits90d).toBe(35);
		expect(bl?.myCommits12m).toBe(412);
	});

	it("contributing to an org's repo is 'contributes to', never 'builds'", async () => {
		// blessedux: commits to stellar/js-stellar-sdk; SDF is not their project.
		const builders: BuilderLike[] = [
			{
				github_username: "blessedux",
				contributions: [{ fullName: "stellar/js-stellar-sdk", commits12m: 9 }],
			},
		];
		const payload = fakePayload({
			repos: [
				repo("stellar/js-stellar-sdk", {
					commits90d: 45,
					projectSlug: "stellar-development-foundation",
				}),
			],
			projects: [
				{
					slug: "stellar-development-foundation",
					name: "Stellar Development Foundation",
					github: { orgLogin: "stellar" },
				},
			],
		});

		const me = (await builderCodeActivity(payload, builders)).get("blessedux");
		expect(me?.projects.size).toBe(0);
		expect([...(me?.contributesTo.keys() ?? [])]).toEqual([
			"stellar-development-foundation",
		]);
		expect(me?.commits90d).toBe(0);
		expect(me?.contributedCommits12m).toBe(9);
	});

	it("owning the repo, or being the project's org, is what makes it 'builds'", async () => {
		const builders: BuilderLike[] = [{ github_username: "fazzatti" }];
		const payload = fakePayload({
			repos: [
				repo("fazzatti/stellar-plus", {
					commits90d: 20,
					stars: 30,
					projectSlug: "stellar-plus",
				}),
			],
			projects: [
				{ slug: "stellar-plus", name: "Stellar Plus", github: {} },
				// a project whose GitHub org IS this login
				{
					slug: "cheesecake",
					name: "Cheesecake",
					github: { orgLogin: "fazzatti" },
				},
			],
		});

		const me = (await builderCodeActivity(payload, builders)).get("fazzatti");
		expect(me?.commits90d).toBe(20);
		expect(me?.stars).toBe(30);
		expect(new Set(me?.projects.keys())).toEqual(
			new Set(["stellar-plus", "cheesecake"]),
		);
		expect(me?.contributesTo.size).toBe(0);
	});

	it("matches owner and contributor repos case-insensitively but never crosses people", async () => {
		const builders: BuilderLike[] = [
			{ github_username: "Alice" },
			{
				github_username: "bob",
				contributions: [{ fullName: "Alice/Thing", commits12m: 3 }],
			},
		];
		const payload = fakePayload({
			repos: [repo("Alice/Thing", { commits90d: 50 })],
			projects: [],
		});
		const out = await builderCodeActivity(payload, builders);
		// the repo is Alice's: her headline, not Bob's
		expect(out.get("alice")?.commits90d).toBe(50);
		expect(out.get("bob")?.commits90d ?? 0).toBe(0);
	});
});
