/**
 * repoKindOf — one served label from scattered signals. First match wins in
 * the documented order, and kindBasis names the signal that decided so a
 * consumer can weigh the label (nameLooksTemplate is the one heuristic).
 */
import { describe, expect, it } from "vitest";
import { nameLooksTemplate, REPO_KINDS, repoKindOf } from "../repo-grade";

// every signal lit at once — each case below turns off the ones above it
const all = {
	isArchived: true,
	isFork: true,
	judgedHackathon: "Stellar Hacks 2025",
	name: "acme/soroban-hello-world",
	isDeployableContract: true,
	projectSlug: "blend",
};

describe("repoKindOf precedence (first match wins)", () => {
	it("archived — the owner's own verdict — beats everything", () => {
		expect(repoKindOf(all)).toEqual({
			kind: "archived",
			kindBasis: "isArchived",
		});
	});

	it("fork beats a judged hackathon submission", () => {
		expect(repoKindOf({ ...all, isArchived: false })).toEqual({
			kind: "fork",
			kindBasis: "isFork",
		});
	});

	it("the name heuristic beats a judged hackathon submission", () => {
		expect(
			repoKindOf({ judgedHackathon: "meridian-2026", name: "hello-world" }),
		).toEqual({ kind: "template-or-tutorial", kindBasis: "nameLooksTemplate" });
		// an empty string is no hackathon
		expect(repoKindOf({ judgedHackathon: "", name: "wallet" }).kind).toBe(
			"code",
		);
	});

	it("a judged hackathon entry that became a listed product is an application", () => {
		expect(
			repoKindOf({ judgedHackathon: "meridian-2026", projectSlug: "wallet-x" }),
		).toEqual({ kind: "application", kindBasis: "projectSlug" });
		expect(
			repoKindOf({
				judgedHackathon: "meridian-2026",
				isDeployableContract: true,
			}),
		).toEqual({ kind: "contract", kindBasis: "isDeployableContract" });
		expect(repoKindOf({ judgedHackathon: "meridian-2026" })).toEqual({
			kind: "hackathon",
			kindBasis: "judgedHackathon",
		});
	});

	it("a template-looking name beats a deployable contract", () => {
		expect(
			repoKindOf({
				...all,
				isArchived: false,
				isFork: false,
				judgedHackathon: null,
			}),
		).toEqual({ kind: "template-or-tutorial", kindBasis: "nameLooksTemplate" });
	});

	it("a served deployable contract beats the project link", () => {
		expect(
			repoKindOf({
				name: "blend/blend-contracts",
				isDeployableContract: true,
				projectSlug: "blend",
			}),
		).toEqual({ kind: "contract", kindBasis: "isDeployableContract" });
	});

	it("a directory-linked repo is an application", () => {
		expect(
			repoKindOf({ name: "blend/blend-ui", projectSlug: "blend" }),
		).toEqual({ kind: "application", kindBasis: "projectSlug" });
	});

	it("falls through to code with basis none (absent signals never guess)", () => {
		expect(repoKindOf({ name: "wallet" })).toEqual({
			kind: "code",
			kindBasis: "none",
		});
		expect(repoKindOf({})).toEqual({ kind: "code", kindBasis: "none" });
		// unscanned rows serve no codeVerified flag — null is not a contract
		expect(
			repoKindOf({ name: "wallet", isDeployableContract: null }).kind,
		).toBe("code");
	});

	it("REPO_KINDS is the closed set the spec enumerates, in precedence order", () => {
		expect(REPO_KINDS).toEqual([
			"archived",
			"fork",
			"template-or-tutorial",
			"contract",
			"application",
			"hackathon",
			"code",
		]);
	});
});

describe("nameLooksTemplate", () => {
	it("tests only the segment after the last slash — an owner never counts", () => {
		expect(nameLooksTemplate("example-org/wallet")).toBe(false);
		expect(nameLooksTemplate("acme/soroban-hello-world")).toBe(true);
		expect(nameLooksTemplate("Soroban-Template")).toBe(true);
		expect(nameLooksTemplate("dapp-starter")).toBe(true);
		expect(nameLooksTemplate("stellar/quickstart")).toBe(true);
		expect(nameLooksTemplate(null)).toBe(false);
		expect(nameLooksTemplate(undefined)).toBe(false);
	});
});
