// @vitest-environment node
import type { CollectionConfig, GlobalConfig, PayloadRequest } from "payload";
import { describe, expect, it, vi } from "vitest";

// Read the config as written, before Payload fills every rule a collection
// leaves out with its own default: "any logged-in user", which includes every
// partner, because partner-accounts is an auth collection too.
vi.mock("payload", async (importOriginal) => ({
	...(await importOriginal<typeof import("payload")>()),
	buildConfig: (c: unknown) => c,
}));

const config = (await import("@/payload.config")).default as unknown as {
	collections: CollectionConfig[];
	globals?: GlobalConfig[];
};

type Rule = (args: unknown) => unknown;
const partner = {
	collection: "partner-accounts",
	id: "partner-1",
	slug: "acme",
};
const admin = { collection: "users", id: "admin-1" };
const call = (fn: unknown, user: unknown) =>
	(fn as Rule)({
		req: { user } as unknown as PayloadRequest,
		id: "someone-else",
		data: {},
	});
const WRITES = ["create", "update", "delete"] as const;
const ruleOf = (c: CollectionConfig, op: string) =>
	(c.access as Record<string, unknown> | undefined)?.[op];

describe("collection access rules", () => {
	it("every collection states create, update and delete itself", () => {
		const missing = config.collections.flatMap((c) =>
			WRITES.filter((op) => typeof ruleOf(c, op) !== "function").map(
				(op) => `${c.slug}.${op}`,
			),
		);
		expect(missing).toEqual([]);
	});

	it("auth collections state read and unlock; versioned ones state readVersions", () => {
		const missing = config.collections.flatMap((c) =>
			[
				...(c.auth ? ["read", "unlock"] : []),
				...(c.versions ? ["readVersions"] : []),
			]
				.filter((op) => typeof ruleOf(c, op) !== "function")
				.map((op) => `${c.slug}.${op}`),
		);
		expect(missing).toEqual([]);
	});

	it("a partner session never gets a write, an unlock or version history", async () => {
		const granted: string[] = [];
		for (const c of config.collections)
			for (const op of [...WRITES, "unlock", "readVersions"]) {
				const fn = ruleOf(c, op);
				if (typeof fn === "function" && (await call(fn, partner)))
					granted.push(`${c.slug}.${op}`);
			}
		expect(granted).toEqual([]);
	});

	it("a partner reads no more than an anonymous visitor, except rows scoped to it", async () => {
		const wider: string[] = [];
		for (const c of config.collections) {
			const fn = ruleOf(c, "read");
			if (typeof fn !== "function") continue;
			const anonymous = await call(fn, null);
			const asPartner = await call(fn, partner);
			const scoped = typeof asPartner === "object" && asPartner !== null;
			if (asPartner && !anonymous && !scoped) wider.push(c.slug);
		}
		expect(wider).toEqual([]);
	});

	it("an admin passes every write the collections leave open to people", async () => {
		// Writes that are system-only by design (`() => false`, written through
		// the local API) deny admins too; everything else must admit one.
		const denied: string[] = [];
		for (const c of config.collections)
			for (const op of WRITES) {
				const fn = ruleOf(c, op);
				if (typeof fn !== "function" || String(fn).includes("=> false"))
					continue;
				if (!(await call(fn, admin))) denied.push(`${c.slug}.${op}`);
			}
		expect(denied).toEqual([]);
	});

	it("globals: every update is admin-only", async () => {
		const loose: string[] = [];
		for (const g of config.globals ?? []) {
			const fn = (g.access as Record<string, unknown> | undefined)?.update;
			if (typeof fn !== "function" || (await call(fn, partner)))
				loose.push(g.slug);
		}
		expect(loose).toEqual([]);
	});
});

describe("repos keep internal notes from every reader but an admin", () => {
	const repos = config.collections.find((c) => c.slug === "repos");
	const hook = repos?.hooks?.afterRead?.[0] as unknown as Rule;
	const doc = () => ({
		knowledgeNotes: [
			{ note: "public", visibility: "public" },
			{ note: "triage memory", visibility: "internal" },
		],
		triageTags: ["dead-hackathon-project"],
	});
	const read = (user: unknown) =>
		hook({ doc: doc(), req: { user, context: {} } }) as {
			knowledgeNotes: Array<{ note: string }>;
			triageTags?: string[];
		};

	it("strips them for a partner session", () => {
		const out = read(partner);
		expect(out.knowledgeNotes.map((n) => n.note)).toEqual(["public"]);
		expect(out.triageTags).toBeUndefined();
	});

	it("shows them to an admin", () => {
		const out = read(admin);
		expect(out.knowledgeNotes).toHaveLength(2);
		expect(out.triageTags).toEqual(["dead-hackathon-project"]);
	});
});
