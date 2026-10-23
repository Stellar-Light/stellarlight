// @vitest-environment node
/**
 * scripts/build-source-locators.ts driven end to end against in-memory
 * stand-ins for its two mongoose models and a stubbed fetch: no database,
 * no network. Covers the plan and execute paths a dry run in CI never
 * reaches, and the data-safety refusals (a tarball with no indexable file,
 * a plan that deletes most of a repo's index, a first fill on a schedule).
 */
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;
const calls: string[] = [];
const matchOne = (d: Doc, filter: Filter) =>
	Object.entries(filter).every(([k, v]) =>
		v && typeof v === "object" && "$in" in v
			? (v as { $in: unknown[] }).$in.includes(d[k])
			: d[k] === v,
	);
function model(store: Map<string, Doc>, keyField: string) {
	return {
		find: (filter: Filter) => ({
			lean: async () => [...store.values()].filter((d) => matchOne(d, filter)),
		}),
		findOne: (filter: Filter) => ({
			lean: async () =>
				[...store.values()].find((d) => matchOne(d, filter)) ?? null,
		}),
		countDocuments: async (filter: Filter = {}) =>
			[...store.values()].filter((d) => matchOne(d, filter)).length,
		createIndexes: async () => {},
		bulkWrite: async (
			ops: Array<{ updateOne: { filter: Filter; update: { $set: Doc } } }>,
		) => {
			calls.push("bulkWrite");
			for (const { updateOne: u } of ops) {
				const k = String(u.filter[keyField]);
				store.set(k, { ...(store.get(k) ?? {}), ...u.update.$set });
			}
		},
		deleteMany: async (filter: { key: { $in: string[] } }) => {
			calls.push("deleteMany");
			for (const k of filter.key.$in) store.delete(k);
		},
		updateOne: async (filter: Filter, update: { $set: Doc }) => {
			calls.push("updateOne");
			const k = String(filter[keyField]);
			store.set(k, { ...(store.get(k) ?? {}), ...update.$set });
		},
	};
}
const rows = new Map<string, Doc>();
const repos = new Map<string, Doc>();
vi.mock("payload", () => ({
	getPayload: async () => ({
		db: {
			collections: {
				"source-locators": model(rows, "key"),
				"source-locator-repos": model(repos, "repo"),
			},
		},
	}),
}));
vi.mock("../../payload.config", () => ({ default: {} }));
vi.mock("../../../scripts/load-env", () => ({}));

function tar(files: Array<{ name: string; body: string }>) {
	const blocks: Buffer[] = [];
	const header = (name: string, size: number) => {
		const h = Buffer.alloc(512);
		h.write(name.slice(0, 100), 0);
		h.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
		h.write("0", 156);
		return h;
	};
	for (const f of files) {
		const body = Buffer.from(f.body);
		blocks.push(
			header(f.name, body.length),
			Buffer.concat([body, Buffer.alloc((512 - (body.length % 512)) % 512)]),
		);
	}
	return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}
const headings = (n: number) =>
	Array.from({ length: n }, (_, i) => `## Section ${i}\n`).join("");
const TREE = [
	{
		name: "quickstart-x/start",
		body:
			'#!/bin/bash\n: "$' +
			'{ENABLE_CORE_MANUAL_CLOSE:=false}"\nfunction main() {\n}\n',
	},
	{ name: "quickstart-x/README.md", body: `# Quickstart\n${headings(120)}` },
];
const SHA_A = "a".repeat(40);
let tarball: () => { ok: boolean; status: number; body: Buffer };
vi.stubGlobal("fetch", async (url: string) => {
	if (url.startsWith("https://api.github.com/"))
		return { ok: true, status: 200, text: async () => SHA_A };
	const r = tarball();
	return {
		ok: r.ok,
		status: r.status,
		arrayBuffer: async () =>
			r.body.buffer.slice(
				r.body.byteOffset,
				r.body.byteOffset + r.body.byteLength,
			),
	};
});

const realExit = process.exit;
async function run(...args: string[]) {
	calls.length = 0;
	const out: string[] = [];
	process.argv = [
		"node",
		"build-source-locators.ts",
		"--repo",
		"quickstart",
		...args,
	];
	process.env.DATABASE_URI = "mongodb://in-memory";
	process.exitCode = 0;
	const exited = new Promise<void>((resolve) => {
		process.exit = (() => resolve()) as typeof process.exit;
	});
	const log = vi.spyOn(console, "log").mockImplementation((...a) => {
		out.push(a.join(" "));
	});
	const err = vi.spyOn(console, "error").mockImplementation((...a) => {
		out.push(`ERR ${a.join(" ")}`);
	});
	vi.resetModules();
	await import("../../../scripts/build-source-locators");
	await exited;
	log.mockRestore();
	err.mockRestore();
	const code = process.exitCode;
	process.exitCode = 0;
	return { code, out: out.join("\n"), writes: [...calls] };
}
const serve = (files: Array<{ name: string; body: string }>) => () => ({
	ok: true,
	status: 200,
	body: gzipSync(tar(files)),
});

beforeEach(() => {
	rows.clear();
	repos.clear();
	tarball = serve(TREE);
});
afterEach(() => {
	process.exit = realExit;
	process.exitCode = 0;
});

describe("build-source-locators", () => {
	it("first fill writes and stamps state; a second execute and --replan plan 0", async () => {
		const dry = await run();
		expect(dry.out).toMatch(
			/plan: writes=(\d+) \(create \1, update 0, delete 0\)/,
		);
		expect(dry.writes).toEqual([]);
		const ex = await run("--execute");
		expect(ex.code).toBe(0);
		expect(repos.get("stellar/quickstart")).toMatchObject({
			ref: SHA_A,
			pointers: rows.size,
		});
		expect((await run("--execute")).out).toContain("plan: writes=0");
		expect((await run("--replan")).code).toBe(0);
	});

	it("a tarball with no indexable file (empty archive) is unreadable: nothing written, state kept, exit 1", async () => {
		await run("--execute");
		const before = new Map(rows);
		const state = { ...repos.get("stellar/quickstart") };
		tarball = () => ({
			ok: true,
			status: 200,
			body: gzipSync(Buffer.alloc(1024)),
		});
		for (const args of [[], ["--execute"], ["--execute", "--scheduled"]]) {
			const r = await run(...args);
			expect(r.code, args.join(" ")).toBe(1);
			expect(r.out).toContain("no indexable file");
			expect(r.writes).toEqual([]);
		}
		expect(rows).toEqual(before);
		expect(repos.get("stellar/quickstart")).toEqual(state);
	});

	it("a tarball whose entries lack the top directory (flat names) is refused the same way", async () => {
		await run("--execute");
		const before = new Map(rows);
		tarball = serve(
			TREE.map((f) => ({ ...f, name: f.name.replace("quickstart-x/", "") })),
		);
		const r = await run("--execute");
		expect(r.code).toBe(1);
		expect(r.writes).toEqual([]);
		expect(rows).toEqual(before);
	});

	it("a plan deleting more than max(50, half the stored rows) is refused without --allow-shrink", async () => {
		await run("--execute");
		const stored = rows.size;
		const before = new Map(rows);
		tarball = serve([
			TREE[0],
			{ name: "quickstart-x/README.md", body: "# Quickstart\n" },
		]);
		const r = await run("--execute");
		expect(r.code).toBe(1);
		expect(r.out).toMatch(/delete 120\b/);
		expect(r.out).toContain("--allow-shrink");
		expect(r.writes).toEqual([]);
		expect(rows).toEqual(before);
		const allowed = await run("--execute", "--allow-shrink");
		expect(allowed.code).toBe(0);
		expect(rows.size).toBe(stored - 120);
		expect(repos.get("stellar/quickstart")?.pointers).toBe(stored - 120);
	});

	it("a small shrink under the cap goes through", async () => {
		await run("--execute");
		tarball = serve([
			TREE[0],
			{
				name: "quickstart-x/README.md",
				body: `# Quickstart\n${headings(100)}`,
			},
		]);
		const r = await run("--execute");
		expect(r.code).toBe(0);
		expect(r.out).toMatch(/delete 20\b/);
	});

	it("--scheduled writes a repo only once that repo has its own state row", async () => {
		repos.set("stellar/soroban-examples", {
			repo: "stellar/soroban-examples",
			ref: SHA_A,
			builtAt: new Date(),
			pointers: 1,
		});
		const r = await run("--execute", "--scheduled");
		expect(r.code).toBe(0);
		expect(r.out).toContain("no state row yet");
		expect(r.writes).toEqual([]);
		expect(rows.size).toBe(0);
		await run("--execute");
		tarball = serve([
			...TREE,
			{ name: "quickstart-x/NEW.md", body: "# New\n" },
		]);
		const s = await run("--execute", "--scheduled");
		expect(s.code).toBe(0);
		expect(s.writes).toContain("bulkWrite");
	});

	it("a failed tarball fetch writes nothing and exits 1", async () => {
		await run("--execute");
		const before = new Map(rows);
		tarball = () => ({ ok: false, status: 500, body: Buffer.alloc(0) });
		const r = await run("--execute");
		expect(r.code).toBe(1);
		expect(r.writes).toEqual([]);
		expect(rows).toEqual(before);
	});
});
