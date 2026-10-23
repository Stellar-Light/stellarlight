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

describe("where a build's repo moved: read only by an admin or the lanes", async () => {
	// Payload's own field read access and query validation, over the real
	// collection config. The collection's REST read is public and honours
	// select and where, and the read hook leaves a doc with no githubUrl or
	// repoFullName alone, so the field itself must be unreadable.
	const {
		afterReadTraverseFields,
		sanitizeConfig,
		validateQueryPaths,
		// biome-ignore lint/suspicious/noExplicitAny: Payload internals, untyped here
	} = (await import("payload")) as any;
	const { HackathonBuilds } = await import("@/collections/HackathonBuilds");
	const config = await sanitizeConfig({
		collections: [HackathonBuilds],
		secret: "test",
		// biome-ignore lint/suspicious/noExplicitAny: no database is touched
		db: { defaultIDType: "text", init: () => ({}) } as any,
	});
	const collection = config.collections.find(
		(c: { slug: string }) => c.slug === "hackathon-builds",
	);
	const reqOf = (over: Record<string, unknown>) => ({
		payload: {
			config,
			collections: { "hackathon-builds": { config: collection } },
		},
		user: null,
		context: {},
		...over,
	});
	const readAs = async (over: Record<string, unknown>) => {
		const doc = {
			id: "x",
			name: "Example Build",
			repoCurrentFullName: "other-team/infected-app",
			securityHeld: true,
		};
		const fieldPromises: Promise<void>[] = [];
		const populationPromises: Promise<void>[] = [];
		const req = reqOf(over);
		afterReadTraverseFields({
			collection,
			context: req.context,
			currentDepth: 1,
			depth: 0,
			doc,
			draft: false,
			fallbackLocale: null,
			fieldPromises,
			fields: collection.fields,
			findMany: true,
			flattenLocales: true,
			global: null,
			locale: null,
			overrideAccess: false,
			parentIndexPath: "",
			parentPath: "",
			parentSchemaPath: "",
			populationPromises,
			req,
			showHiddenFields: false,
			siblingDoc: doc,
		});
		while (fieldPromises.length || populationPromises.length) {
			await Promise.all(fieldPromises.splice(0));
			await Promise.all(populationPromises.splice(0));
		}
		return doc as Record<string, unknown>;
	};
	const whereAs = (path: string, over: Record<string, unknown>) =>
		validateQueryPaths({
			collectionConfig: collection,
			overrideAccess: false,
			req: reqOf(over),
			where: { [path]: { equals: "other-team/infected-app" } },
		}).then(
			() => "allowed",
			(e: Error) => e.name,
		);

	it("a public read does not return it, even on a held row the read hook passes by", async () => {
		const doc = await readAs({});
		expect("repoCurrentFullName" in doc).toBe(false);
		expect(doc.name).toBe("Example Build");
	});

	it("a public where on it is refused, not used as a filter", async () => {
		expect(await whereAs("repoCurrentFullName", {})).toBe("QueryError");
		// The same query on a public field still runs, and the admin-read
		// embedding is refused the same way (the harness sees field access).
		expect(await whereAs("name", {})).toBe("allowed");
		expect(await whereAs("embedding", {})).toBe("QueryError");
	});

	it("the lanes' reads (includeSecurityHeld) and an admin still read and query it", async () => {
		const lane = { context: { includeSecurityHeld: true } };
		const admin = { user: { collection: "users" } };
		expect((await readAs(lane)).repoCurrentFullName).toBe(
			"other-team/infected-app",
		);
		expect((await readAs(admin)).repoCurrentFullName).toBe(
			"other-team/infected-app",
		);
		expect(await whereAs("repoCurrentFullName", lane)).toBe("allowed");
		expect(await whereAs("repoCurrentFullName", admin)).toBe("allowed");
	});
});
