// @vitest-environment node
/**
 * scripts/build-source-locators.ts driven end to end against in-memory
 * stand-ins for its two mongoose models and a stubbed fetch: no database,
 * no network. Covers the plan and execute paths a dry run in CI never
 * reaches, and the data-safety refusals (a tarball with no indexable file,
 * a plan that deletes most of a repo's index, a first fill on a schedule).
 */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import yaml from "js-yaml";
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
		expect(dry.out).toMatch(/writes planned: \d+$/m);
		expect(dry.writes).toEqual([]);
		const ex = await run("--execute");
		expect(ex.code).toBe(0);
		expect(ex.out).toContain(`writes planned: ${rows.size}`);
		expect(repos.get("stellar/quickstart")).toMatchObject({
			ref: SHA_A,
			pointers: rows.size,
		});
		expect((await run("--execute")).out).toContain("plan: writes=0");
		expect((await run("--replan")).code).toBe(0);
	});

	it("trait-impl locators added to an indexed tree plan as creates only: no stored row changes", async () => {
		const rust = {
			name: "quickstart-x/src/lib.rs",
			body: "pub struct Token;\nimpl TokenInterface for Token {\n    fn transfer() {}\n}\n",
		};
		tarball = serve([...TREE, rust]);
		await run("--execute");
		// The index as an extraction without impl locators stored it.
		const implKeys = [...rows.keys()].filter((k) =>
			k.includes("|symbol|impl "),
		);
		expect(implKeys).toEqual([
			"stellar/quickstart|src/lib.rs|symbol|impl TokenInterface for Token",
		]);
		for (const k of implKeys) rows.delete(k);
		const before = new Map(rows);
		const r = await run("--execute");
		expect(r.out).toContain("plan: writes=1 (create 1, update 0, delete 0)");
		for (const [k, doc] of before) expect(rows.get(k), k).toEqual(doc);
		expect((await run("--replan")).out).toContain("replan: writes=0");
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
		// The summary counts what was not refused, and names what was.
		expect(r.out).toContain(
			"writes planned: 0; refused, nothing written: stellar/quickstart (122 planned)",
		);
		expect(r.out).not.toContain("replan: writes");
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

	it("--replan reports its own count and exits 1 when a stored row drifted", async () => {
		await run("--execute");
		const clean = await run("--replan");
		expect(clean.out).toContain("replan: writes=0");
		expect(clean.out).not.toContain("writes planned");
		const [key, doc] = [...rows.entries()][0];
		rows.set(key, { ...doc, blobSha: "f".repeat(40) });
		const drifted = await run("--replan");
		expect(drifted.code).toBe(1);
		expect(drifted.out).toContain("replan: writes=1");
		expect(drifted.writes).toEqual([]);
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

/** The workflow's own run scripts, executed by bash with a stand-in pnpm that prints its arguments. */
describe("build-source-locators.yml forwards exactly the intended flags", () => {
	type Step = { name?: string; env?: Record<string, string>; run?: string };
	const wf = yaml.load(
		readFileSync(
			join(process.cwd(), ".github/workflows/build-source-locators.yml"),
			"utf8",
		),
	) as { jobs: { build: { steps: Step[] } } };
	const step = (name: string) => {
		const s = wf.jobs.build.steps.find((x) => x.name === name);
		if (!s?.run) throw new Error(`no run step named ${name}`);
		return s as Step & { run: string };
	};
	const bin = mkdtempSync(join(tmpdir(), "fake-pnpm-"));
	writeFileSync(join(bin, "pnpm"), '#!/bin/bash\nprintf "%s\\n" "$@"\n');
	chmodSync(join(bin, "pnpm"), 0o755);
	const argsOf = (name: string, env: Record<string, string>) =>
		execFileSync("bash", ["-e", "-c", step(name).run], {
			// Only PATH and the step's own env: nothing else from this process leaks in.
			env: { NODE_ENV: "test", PATH: `${bin}:${process.env.PATH}`, ...env },
			encoding: "utf8",
		})
			.split("\n")
			.filter(Boolean)
			// pnpm exec tsx scripts/build-source-locators.ts <flags>
			.slice(3);
	const dispatch = (over: Record<string, string>) => ({
		EVENT: "workflow_dispatch",
		EXECUTE: "false",
		ALLOW_SHRINK: "false",
		REPO: "",
		...over,
	});

	it("reads the event and every input through env, never inline", () => {
		/** A workflow expression, `${{ e }}`, built so no string literal holds one. */
		const gh = (e: string) => `$${"{{"} ${e} }}`;
		for (const name of ["Build the index", "Idempotence"]) {
			expect(step(name).run).not.toContain(`$${"{{"}`);
			expect(step(name).env).toMatchObject({
				EVENT: gh("github.event_name"),
				REPO: gh("inputs.repo"),
			});
		}
		expect(step("Build the index").env).toMatchObject({
			EXECUTE: gh("inputs.execute"),
			ALLOW_SHRINK: gh("inputs.allow_shrink"),
		});
	});

	it("the schedule runs --execute --scheduled, never --allow-shrink or --repo", () => {
		expect(
			argsOf("Build the index", {
				EVENT: "schedule",
				EXECUTE: "",
				ALLOW_SHRINK: "true",
				REPO: "quickstart",
			}),
		).toEqual(["--execute", "--scheduled"]);
		expect(
			argsOf("Idempotence", { EVENT: "schedule", REPO: "quickstart" }),
		).toEqual(["--replan"]);
	});

	it("a dry dispatch never forwards --allow-shrink, so its plan shows every refusal", () => {
		expect(
			argsOf("Build the index", dispatch({ ALLOW_SHRINK: "true" })),
		).toEqual([]);
	});

	it("an execute dispatch forwards --allow-shrink and one repo, the repo as a single argument", () => {
		expect(
			argsOf(
				"Build the index",
				dispatch({ EXECUTE: "true", ALLOW_SHRINK: "true", REPO: "quickstart" }),
			),
		).toEqual(["--execute", "--allow-shrink", "--repo", "quickstart"]);
		expect(
			argsOf("Build the index", dispatch({ REPO: "quickstart; echo pwned" })),
		).toEqual(["--repo", "quickstart; echo pwned"]);
		expect(argsOf("Idempotence", dispatch({ REPO: "quickstart" }))).toEqual([
			"--replan",
			"--repo",
			"quickstart",
		]);
	});
});
