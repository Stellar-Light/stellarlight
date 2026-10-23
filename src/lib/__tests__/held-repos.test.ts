import { describe, expect, it } from "vitest";
import {
	BUILD_HOLD,
	heldSecurity,
	repoKeyOf,
	withholdHeldRepo,
} from "../held-repos";

describe("held repos on hackathon builds", () => {
	it("keys a repo by owner/name from a link or a name", () => {
		expect(repoKeyOf("https://github.com/Some-Team/Infected-App")).toBe(
			"some-team/infected-app",
		);
		expect(repoKeyOf("https://github.com/a/b.git#readme")).toBe("a/b");
		expect(repoKeyOf("https://github.com/a/b/tree/main/x")).toBe("a/b");
		expect(repoKeyOf("Ledger-Lenz/Ledgerlens-data")).toBe(
			"ledger-lenz/ledgerlens-data",
		);
		// An org page or another host names no repo.
		expect(repoKeyOf("https://github.com/zkcross-network")).toBeNull();
		expect(repoKeyOf("https://gitlab.com/a/b")).toBeNull();
		expect(repoKeyOf(null)).toBeNull();
	});

	it("withholds a held repo's link and says why", () => {
		const held = new Set(["some-team/infected-app"]);
		const doc = withholdHeldRepo(
			{
				name: "Example Build",
				githubUrl: "https://github.com/Some-Team/Infected-App",
				repoFullName: "Some-Team/Infected-App",
				repoCurrentFullName: "other-team/infected-app",
			},
			held,
		);
		expect(doc.githubUrl).toBeNull();
		expect(doc.repoFullName).toBeNull();
		expect(doc.repoCurrentFullName).toBeNull();
		expect(doc.security).toEqual(BUILD_HOLD);
		expect(heldSecurity(doc)).toEqual({ security: BUILD_HOLD });
		// A row the lane marked held is withheld even when the list is empty
		// (an unreadable list).
		expect(
			withholdHeldRepo(
				{ githubUrl: "https://github.com/x/y", securityHeld: true },
				new Set(),
			).githubUrl,
		).toBeNull();
	});

	it("leaves every other build as it was", () => {
		const doc = { githubUrl: "https://github.com/stellar/js-stellar-sdk" };
		expect(withholdHeldRepo(doc, new Set(["some-team/infected-app"]))).toEqual({
			githubUrl: "https://github.com/stellar/js-stellar-sdk",
		});
		expect(heldSecurity(doc)).toEqual({});
		expect(heldSecurity({ security: { held: false } })).toEqual({});
	});
});

describe("the HackathonBuilds read hook", async () => {
	const { HackathonBuilds } = await import("@/collections/HackathonBuilds");
	const hook = HackathonBuilds.hooks?.afterRead?.[0];
	const lookups: string[] = [];
	// One held repo in the index, none on build rows.
	const payload = {
		find: async ({
			collection,
			context,
		}: {
			collection: string;
			context?: { includeSecurityHeld?: boolean };
		}) => {
			lookups.push(`${collection}:${context?.includeSecurityHeld}`);
			return {
				docs:
					collection === "repos"
						? [{ fullName: "Some-Team/Infected-App" }]
						: [],
			};
		},
	};
	const read = (req: Record<string, unknown>) =>
		// biome-ignore lint/suspicious/noExplicitAny: a stand-in for Payload's hook args
		(hook as any)({
			doc: {
				name: "Example Build",
				githubUrl: "https://github.com/Some-Team/Infected-App",
				repoFullName: "Some-Team/Infected-App",
			},
			req: { payload, context: {}, ...req },
		});

	it("withholds a held repo's link on an ordinary read", async () => {
		const doc = await read({});
		expect(doc.githubUrl).toBeNull();
		expect(doc.repoFullName).toBeNull();
		expect(doc.security).toEqual(BUILD_HOLD);
		// The lookup opts in, so it cannot wait on this hook.
		expect(lookups).toEqual(["repos:true", "hackathon-builds:true"]);
	});

	it("serves the real link to an admin and to a read that opts in", async () => {
		expect((await read({ user: { collection: "users" } })).githubUrl).toBe(
			"https://github.com/Some-Team/Infected-App",
		);
		expect(
			(await read({ context: { includeSecurityHeld: true } })).githubUrl,
		).toBe("https://github.com/Some-Team/Infected-App");
	});
});
