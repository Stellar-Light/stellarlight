/**
 * The feed mapper derives github.orgLogin and github.repos from links.github.
 * It used to strip only a leading "github.com/" and split the rest, so a GitLab
 * or Google Docs link produced owner "gitlab.com" or "docs.google.com", and a
 * trailing space stayed in the repo name. The daily sync wrote those back after
 * every weekly curate run cleaned them (2026-10-03).
 */
import { describe, expect, it } from "vitest";
import { mapLumenloopEntry } from "../utils/lumenloop-mapper";

const map = (github: string[]) =>
	mapLumenloopEntry({ title: "Example", links: { github } }, "example").project
		.github;

describe("lumenloop mapper: GitHub identity", () => {
	it("ignores GitLab and other non-GitHub hosts", () => {
		expect(map(["https://gitlab.com/dolphinze/disbursements"])).toBeUndefined();
		expect(
			map(["https://docs.google.com/document/d/abc/edit"]),
		).toBeUndefined();
		expect(map(["https://dev-api-new.skopadev.com/api/docs"])).toBeUndefined();
	});

	it("keeps GitHub repos and trims a trailing space", () => {
		expect(
			map(["https://github.com/horizontalsystems/stellarkit.swift "]),
		).toEqual({
			orgLogin: "horizontalsystems",
			repos: [{ owner: "horizontalsystems", name: "stellarkit.swift" }],
		});
	});

	it("takes only the GitHub links from a mixed list", () => {
		expect(
			map([
				"https://gitlab.com/rivool-finance/stellar-contracts",
				"github.com/stellar-registry/contracts.git",
			]),
		).toEqual({
			orgLogin: "stellar-registry",
			repos: [{ owner: "stellar-registry", name: "contracts" }],
		});
	});

	it("sets nothing for an org-only link (no repo to name)", () => {
		expect(map(["https://github.com/stellar"])).toBeUndefined();
	});
});
