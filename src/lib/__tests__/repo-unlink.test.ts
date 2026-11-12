/**
 * A repo row keeps its projectSlug after the project that claimed it drops
 * the claim: enrich-repos upserted only the rows projects claim, so nothing
 * ever cleared the others. Live case 2026-11-12: curation removed MoneyGram's
 * link to SDF's archived demo wallet, and stellar/moneygram-access-wallet-mvp
 * still carried projectSlug moneygram, so the MoneyGram page served it.
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRepoInfo, fetchRepoInfoBatch, listOwnerRepos } from "../github";
import {
	ANSWERED_FETCH_ERRORS,
	applyRepoUnlinks,
	planRepoUnlinks,
	UNLINK_CAP,
	UNLINK_VERIFIED_FIELDS,
	type UnlinkRow,
	type UnlinkWrite,
	writesUnlinks,
} from "../repo-unlink";

const mvp: UnlinkRow = {
	id: "r1",
	fullName: "stellar/moneygram-access-wallet-mvp",
	projectSlug: "moneygram",
	source: "project-link",
};

const base = {
	rows: [mvp],
	claimedIds: new Set<string>(),
	claimedNames: new Set<string>(),
	orgClaimants: new Map<string, Set<string>>(),
	targeted: false,
	failures: [] as string[],
};

describe("planRepoUnlinks", () => {
	it("unlinks a project-link row no project claims", () => {
		const plan = planRepoUnlinks(base);
		expect(plan.unlinks).toEqual([
			{ id: "r1", fullName: mvp.fullName, from: "moneygram" },
		]);
		expect(plan.abstain).toBeNull();
	});

	it("never unlinks a builder-owned or ec-taxonomy row", () => {
		const plan = planRepoUnlinks({
			...base,
			rows: [
				{ ...mvp, id: "b", source: "builder-owned" },
				{ ...mvp, id: "e", source: "ec-taxonomy" },
				{ ...mvp, id: "n", source: null },
			],
		});
		expect(plan.unlinks).toEqual([]);
	});

	it("leaves a row with no projectSlug alone", () => {
		expect(
			planRepoUnlinks({ ...base, rows: [{ ...mvp, projectSlug: null }] })
				.unlinks,
		).toEqual([]);
	});

	it("unlinks nothing when any read failed (partial claim set)", () => {
		const plan = planRepoUnlinks({
			...base,
			failures: ["org listing paltalabs: GitHub API rate limit exceeded"],
		});
		expect(plan.unlinks).toEqual([]);
		expect(plan.abstain).toMatch(/partial/);
		expect(plan.overCap).toBe(false);
	});

	it("unlinks nothing on a targeted run (--only)", () => {
		const plan = planRepoUnlinks({ ...base, targeted: true });
		expect(plan.unlinks).toEqual([]);
		expect(plan.abstain).toBe("targeted run");
	});

	it("counts a claim under another case as a claim", () => {
		expect(
			planRepoUnlinks({
				...base,
				claimedNames: new Set(["Stellar/MoneyGram-Access-Wallet-MVP"]),
			}).unlinks,
		).toEqual([]);
	});

	it("counts the canonical row of a claimed old name as claimed", () => {
		// The project lists paychant/celo-merchant; GitHub answers
		// gabrieladeniji/celo-merchant, and the run either found that row by
		// id or recorded the canonical name.
		const row: UnlinkRow = {
			id: "c1",
			fullName: "gabrieladeniji/celo-merchant",
			projectSlug: "paychant",
			source: "project-link",
		};
		expect(
			planRepoUnlinks({
				...base,
				rows: [row],
				claimedNames: new Set(["paychant/celo-merchant"]),
			}).unlinks,
		).toHaveLength(1);
		expect(
			planRepoUnlinks({
				...base,
				rows: [row],
				claimedNames: new Set([
					"paychant/celo-merchant",
					"gabrieladeniji/celo-merchant",
				]),
			}).unlinks,
		).toEqual([]);
		expect(
			planRepoUnlinks({ ...base, rows: [row], claimedIds: new Set(["c1"]) })
				.unlinks,
		).toEqual([]);
	});

	it("keeps a row its project can still claim through an expanded org", () => {
		const sdf: UnlinkRow = {
			id: "s1",
			fullName: "stellar/old-archived-thing",
			projectSlug: "stellar-development-foundation",
			source: "project-link",
		};
		const plan = planRepoUnlinks({
			...base,
			rows: [mvp, sdf],
			orgClaimants: new Map([
				["stellar", new Set(["stellar-development-foundation", "freighter"])],
			]),
		});
		// SDF still links github.com/stellar; MoneyGram links nothing there.
		expect(plan.unlinks.map((u) => u.fullName)).toEqual([mvp.fullName]);
	});

	it("unlinks nothing and flags the run when the total passes the cap", () => {
		const rows = Array.from({ length: UNLINK_CAP + 1 }, (_, i) => ({
			...mvp,
			id: `x${i}`,
			fullName: `gone-org/repo-${i}`,
		}));
		const over = planRepoUnlinks({ ...base, rows });
		expect(over.unlinks).toEqual([]);
		expect(over.overCap).toBe(true);
		expect(over.abstain).toMatch(/over the cap/);
		const at = planRepoUnlinks({ ...base, rows: rows.slice(0, UNLINK_CAP) });
		expect(at.unlinks).toHaveLength(UNLINK_CAP);
		expect(at.overCap).toBe(false);
	});
});

// The partial-claim-set guard needs a failed org listing to look like a
// failure. listOwnerRepos returned [] for both, so a rate-limited org read as
// an org with no repos.
describe("listOwnerRepos", () => {
	afterEach(() => vi.unstubAllGlobals());
	const reply = (body: unknown, status = 200) =>
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(body), { status })),
		);

	it("throws when GitHub could not be read", async () => {
		reply({ errors: [{ type: "RATE_LIMITED", message: "rate limit" }] });
		await expect(listOwnerRepos("paltalabs")).rejects.toThrow(/rate limit/);
		reply({ message: "Bad credentials" }, 401);
		await expect(listOwnerRepos("paltalabs")).rejects.toThrow(
			/Bad credentials/,
		);
	});

	it("answers [] only when GitHub says the owner does not exist", async () => {
		reply({ data: { repositoryOwner: null } });
		await expect(listOwnerRepos("no-such-owner")).resolves.toEqual([]);
	});

	it("lists the owner's unarchived repos", async () => {
		reply({
			data: {
				repositoryOwner: {
					repositories: {
						nodes: [
							{ name: "a", isArchived: false, repositoryTopics: { nodes: [] } },
							{ name: "b", isArchived: true },
						],
					},
				},
			},
		});
		expect((await listOwnerRepos("o")).map((r) => r.name)).toEqual(["a"]);
	});
});

// The unlink record is the writer's own note, not a served fact: every reader
// but an admin or an internal script (enrich-repos' read-back) loses it.
describe("the Repos read hook", async () => {
	const { Repos } = await import("@/collections/Repos");
	const hook = Repos.hooks?.afterRead?.[0] as unknown as (args: unknown) => {
		projectUnlink?: unknown;
	};
	const record = { from: "moneygram", at: "2026-11-16T08:00:00.000Z" };
	const read = (context: Record<string, unknown>) =>
		hook({ doc: { projectUnlink: record }, req: { user: null, context } });

	it("strips projectUnlink from a public read", () => {
		expect(read({}).projectUnlink).toBeUndefined();
	});

	it("keeps it for an internal read, so the write can be read back", () => {
		expect(read({ internal: true }).projectUnlink).toEqual(record);
	});
});

// Dry run first: the plan prints on every run, and only a manual execute that
// also passes --unlink writes it. Scheduled and chained runs execute, so they
// must never pass the flag.
describe("unlink is written only on an opt-in execute", () => {
	const plan = [{ id: "r1", fullName: mvp.fullName, from: "moneygram" }];
	const at = "2026-11-16T08:00:00.000Z";

	it("needs both --execute and --unlink", () => {
		expect(writesUnlinks(["tsx", "enrich-repos.ts", "--execute"])).toBe(false);
		expect(writesUnlinks(["tsx", "enrich-repos.ts", "--unlink"])).toBe(false);
		expect(writesUnlinks(["tsx", "enrich-repos.ts"])).toBe(false);
		expect(
			writesUnlinks(["tsx", "enrich-repos.ts", "--execute", "--unlink"]),
		).toBe(true);
	});

	it("an execute without --unlink prints the plan and writes nothing", async () => {
		const update = vi.fn(async () => undefined);
		const lines: string[] = [];
		const out = await applyRepoUnlinks(plan, {
			write: writesUnlinks(["tsx", "enrich-repos.ts", "--execute"]),
			at,
			update,
			log: (l) => lines.push(l),
		});
		expect(update).not.toHaveBeenCalled();
		expect(out.written.size).toBe(0);
		expect(lines).toEqual([
			"unlink stellar/moneygram-access-wallet-mvp from moneygram (no project claims it; 2026-11-16)",
			"unlink total: 1 (not written: a manual execute with --unlink writes them)",
		]);
	});

	it("an opted-in execute writes the unlink with its reason and date", async () => {
		const sent: Array<[string, UnlinkWrite]> = [];
		const out = await applyRepoUnlinks(plan, {
			write: true,
			at,
			update: async (id, data) => {
				sent.push([id, data]);
			},
			log: () => {},
		});
		// scfAwarded and hackathonWinner are the project's, copied onto the
		// row and served as stored by searchRepos: they go with the link.
		const data = {
			projectSlug: null,
			projectName: null,
			scfAwarded: false,
			hackathonWinner: false,
			projectUnlink: { from: "moneygram", at, reason: "no project claims it" },
		};
		expect(sent).toEqual([["r1", data]]);
		expect(out.written.get("r1")).toEqual({ fullName: mvp.fullName, data });
	});

	it("drops the note citing the project's audits and keeps every other note", async () => {
		const curated = { id: "n1", note: "what it is", source: "curated" };
		const internal = {
			id: "n2",
			note: "triage",
			source: "curated",
			visibility: "internal",
		};
		const audit = {
			id: "n3",
			note: "3 security audit reports on record for the owning project",
			source: "derived:audit",
		};
		const usage = {
			id: "n4",
			note: "Live on mainnet",
			source: "derived:usage",
		};
		const [row] = planRepoUnlinks({
			...base,
			rows: [{ ...mvp, knowledgeNotes: [curated, internal, audit, usage] }],
		}).unlinks;
		const sent: UnlinkWrite[] = [];
		await applyRepoUnlinks([row], {
			write: true,
			at,
			update: async (_id, data) => {
				sent.push(data);
			},
			log: () => {},
		});
		expect(sent[0].knowledgeNotes).toEqual([curated, internal, usage]);
		// Every field the unlink writes is one enrich-repos reads back.
		for (const k of Object.keys(sent[0]))
			expect(UNLINK_VERIFIED_FIELDS).toContain(k);
		// A row with no audit note keeps its notes untouched.
		const sentPlain: UnlinkWrite[] = [];
		await applyRepoUnlinks([{ ...row, knowledgeNotes: [curated] }], {
			write: true,
			at,
			update: async (_id, data) => {
				sentPlain.push(data);
			},
			log: () => {},
		});
		expect("knowledgeNotes" in sentPlain[0]).toBe(false);
	});

	it("a failed write is reported, not counted as written", async () => {
		const out = await applyRepoUnlinks(plan, {
			write: true,
			at,
			update: async () => {
				throw new Error("validation");
			},
			log: () => {},
		});
		expect(out.written.size).toBe(0);
		expect(out.failed).toEqual([`${mvp.fullName}: validation`]);
	});

	it("the workflow passes --unlink only on a manual dispatch with execute", () => {
		const yml = readFileSync(".github/workflows/enrich-repos.yml", "utf8");
		const passes = yml.split("\n").filter((l) => l.includes("'--unlink'"));
		expect(passes).toHaveLength(1);
		expect(passes[0]).toContain(
			"github.event_name == 'workflow_dispatch' && inputs.execute && inputs.unlink && '--unlink'",
		);
	});
});

// A read that failed must not read as GitHub's answer: "Repository not found"
// counts as answered (ANSWERED_FETCH_ERRORS), so a partial GraphQL response
// mapped to it would let a renamed repo's canonical row unlink while claimed.
describe("a partial GitHub response is not a not-found answer", () => {
	afterEach(() => vi.unstubAllGlobals());
	const reply = (body: unknown) =>
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
		);
	const pairs = [
		{ owner: "a", name: "silent" },
		{ owner: "a", name: "gone" },
		{ owner: "a", name: "flaky" },
		{ owner: "a", name: "mute" },
	];

	it("only an alias GitHub marks NOT_FOUND reads as not found", async () => {
		reply({
			data: { r0: null, r1: null, r2: null, r3: null },
			errors: [
				{ path: ["r1"], type: "NOT_FOUND", message: "Could not resolve" },
				{ path: ["r2"], type: "SERVICE_UNAVAILABLE", message: "timeout" },
				// An error with no message used to fall back to "not found".
				{ path: ["r3"], type: "INTERNAL" },
			],
		});
		const out = await fetchRepoInfoBatch(pairs);
		// No error for r0: the slot stays empty and the per-repo fetch decides.
		expect(out[0]).toBeUndefined();
		expect(out[1]).toEqual({ error: "Repository not found" });
		const flaky = out[2] as { error: string };
		expect(ANSWERED_FETCH_ERRORS.has(flaky.error)).toBe(false);
		expect(flaky.error).toMatch(/timeout/);
		const mute = out[3] as { error: string };
		expect(ANSWERED_FETCH_ERRORS.has(mute.error)).toBe(false);
	});

	it("the per-repo fetch does not read a missing repository as not found", async () => {
		reply({ data: { repository: null } });
		const err = await fetchRepoInfo("a", "silent").then(
			() => null,
			(e: Error) => e.message,
		);
		expect(err).not.toBeNull();
		expect(ANSWERED_FETCH_ERRORS.has(err as string)).toBe(false);
	});
});

// The unlink record must not be filterable or readable through public REST
// or GraphQL: Payload's own field access and query validation over the real
// collection config, as the HackathonBuilds test does for its moved-repo field.
describe("projectUnlink is read and queried only by an admin or an internal script", async () => {
	const {
		afterReadTraverseFields,
		sanitizeConfig,
		validateQueryPaths,
		// biome-ignore lint/suspicious/noExplicitAny: Payload internals, untyped here
	} = (await import("payload")) as any;
	const { Repos } = await import("@/collections/Repos");
	const config = await sanitizeConfig({
		collections: [Repos],
		secret: "test",
		// biome-ignore lint/suspicious/noExplicitAny: no database is touched
		db: { defaultIDType: "text", init: () => ({}) } as any,
	});
	const collection = config.collections.find(
		(c: { slug: string }) => c.slug === "repos",
	);
	const reqOf = (over: Record<string, unknown>) => ({
		payload: { config, collections: { repos: { config: collection } } },
		user: null,
		context: {},
		...over,
	});
	const readAs = async (
		over: Record<string, unknown>,
		overrideAccess = false,
	) => {
		const doc: Record<string, unknown> = {
			id: "x",
			fullName: "stellar/moneygram-access-wallet-mvp",
			projectUnlink: { from: "moneygram", at: "2026-11-16T08:00:00.000Z" },
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
			overrideAccess,
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
		return doc;
	};
	const whereAs = (path: string, over: Record<string, unknown>) =>
		validateQueryPaths({
			collectionConfig: collection,
			overrideAccess: false,
			req: reqOf(over),
			where: { [path]: { equals: "moneygram" } },
		}).then(
			() => "allowed",
			(e: Error) => e.name,
		);

	it("a public read does not return it and a public where is refused", async () => {
		expect("projectUnlink" in (await readAs({}))).toBe(false);
		expect(await whereAs("projectUnlink.from", {})).toBe("QueryError");
		expect(await whereAs("projectSlug", {})).toBe("allowed");
	});

	it("enrich-repos' read-back (internal, overrideAccess) and an admin see it", async () => {
		const internal = { context: { internal: true } };
		const admin = { user: { collection: "users" } };
		expect((await readAs(internal, true)).projectUnlink).toBeDefined();
		expect((await readAs(internal)).projectUnlink).toBeDefined();
		expect((await readAs(admin)).projectUnlink).toBeDefined();
		expect(await whereAs("projectUnlink.from", admin)).toBe("allowed");
	});
});
