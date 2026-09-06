import { describe, expect, it } from "vitest";
import { parseGithubIdentity } from "../github-identity";

describe("parseGithubIdentity", () => {
	it("keeps a bare login unchanged", () => {
		expect(parseGithubIdentity("hyperdexnetwork")).toEqual({
			orgLogin: "hyperdexnetwork",
			repo: null,
		});
	});

	it("reads the owner and repo out of a submission URL", () => {
		// droppay's stored value — the whole class of Draft rows from intake.
		expect(
			parseGithubIdentity("https://github.com/kratikavyas/DropPay"),
		).toEqual({
			orgLogin: "kratikavyas",
			repo: { owner: "kratikavyas", name: "DropPay" },
		});
	});

	it("reads a bare owner/repo pair", () => {
		expect(parseGithubIdentity("krit-k7/MediVault")).toEqual({
			orgLogin: "krit-k7",
			repo: { owner: "krit-k7", name: "MediVault" },
		});
	});

	it("takes the owner from a deep URL and does not invent a repo from /tree", () => {
		expect(
			parseGithubIdentity(
				"https://github.com/debdeepadutta/stellarpay/tree/main",
			),
		).toEqual({
			orgLogin: "debdeepadutta",
			repo: { owner: "debdeepadutta", name: "stellarpay" },
		});
	});

	it("returns nothing for another forge — an absent login, not a broken one", () => {
		for (const v of [
			"gitlab.com",
			"bitbucket.org",
			"docs.google.com",
			"dev-api-new.skopadev.com",
		])
			expect(parseGithubIdentity(v)).toEqual({ orgLogin: null, repo: null });
	});

	it("trims whitespace and rejects comma-joined junk", () => {
		expect(parseGithubIdentity("efekrbas ")).toEqual({
			orgLogin: "efekrbas",
			repo: null,
		});
		expect(parseGithubIdentity("anclap, https:")).toEqual({
			orgLogin: null,
			repo: null,
		});
	});

	it("rejects GitHub's own paths and non-strings", () => {
		expect(parseGithubIdentity("https://github.com/orgs/stellar")).toEqual({
			orgLogin: null,
			repo: null,
		});
		expect(parseGithubIdentity(undefined)).toEqual({
			orgLogin: null,
			repo: null,
		});
		expect(parseGithubIdentity("")).toEqual({ orgLogin: null, repo: null });
	});

	it("strips a .git suffix and handles an ssh remote", () => {
		expect(
			parseGithubIdentity("git@github.com:stellar/quickstart.git"),
		).toEqual({
			orgLogin: "stellar",
			repo: { owner: "stellar", name: "quickstart" },
		});
	});
});
