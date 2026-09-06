import { describe, expect, it } from "vitest";
import { parseGithubIdentity, parseGithubRepoRef } from "../github-identity";

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

describe("parseGithubRepoRef", () => {
	it("passes a clean entry through", () => {
		expect(parseGithubRepoRef("stellar", "quickstart")).toEqual({
			owner: "stellar",
			name: "quickstart",
		});
	});

	it("trims a second URL glued to the repo name", () => {
		// All five live examples of this shape.
		expect(parseGithubRepoRef("team-convexity", "chatspy; https:")?.name).toBe(
			"chatspy",
		);
		expect(
			parseGithubRepoRef("diadata-org", "soroban-oracle-feeders ; https:")
				?.name,
		).toBe("soroban-oracle-feeders");
		expect(
			parseGithubRepoRef("bp-ventures", "django-polaris-bpv  https:")?.name,
		).toBe("django-polaris-bpv");
		expect(
			parseGithubRepoRef(
				"Raum-Network",
				"raum-chrysalis-stellarcontract, https:",
			)?.name,
		).toBe("raum-chrysalis-stellarcontract");
		expect(
			parseGithubRepoRef("horizontalsystems", "stellarkit.swift ")?.name,
		).toBe("stellarkit.swift");
	});

	it("drops an entry whose owner is another forge's host", () => {
		expect(parseGithubRepoRef("gitlab.com", "tales")).toBeNull();
		expect(
			parseGithubRepoRef("bitbucket.org", "vestigiadesarrollo"),
		).toBeNull();
		expect(parseGithubRepoRef("docs.google.com", "document")).toBeNull();
		expect(parseGithubRepoRef("dev-api-new.skopadev.com", "api")).toBeNull();
	});

	it("never infers an owner from a value that is not a login", () => {
		// "Omkar Nanavare" is a person's display name; the same row carries the
		// real login OmcarSN, which survives. "anclap, https:" is two values in
		// one field. Trimming either to its first word invents an account.
		expect(parseGithubRepoRef("Omkar Nanavare", "TrustChain")).toBeNull();
		expect(parseGithubRepoRef("anclap, https:", "github.com")).toBeNull();
		expect(parseGithubRepoRef("gitlab.com", "anything")).toBeNull();
	});

	it("drops a hostname sitting in the repo-name column", () => {
		expect(parseGithubRepoRef("anclap", "github.com")).toBeNull();
		// a real name that merely contains a dot is fine
		expect(parseGithubRepoRef("horizontalsystems", "stellarkit.swift")).toEqual(
			{
				owner: "horizontalsystems",
				name: "stellarkit.swift",
			},
		);
	});

	it("rejects non-strings and empty parts", () => {
		expect(parseGithubRepoRef(undefined, "x")).toBeNull();
		expect(parseGithubRepoRef("owner", "")).toBeNull();
		expect(parseGithubRepoRef("", "name")).toBeNull();
	});
});
