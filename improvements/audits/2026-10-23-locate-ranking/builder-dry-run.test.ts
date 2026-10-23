// @vitest-environment node
/**
 * The builder's own dry run (scripts/build-source-locators.ts, no --execute)
 * over local tarballs at the pinned refs, against an index built by the base
 * extraction: proves the impl locators and the new repo plan creates only,
 * with no update and no delete of an existing row.
 *
 *   git show origin/main:src/lib/source-locator.ts > <base>/source-locator.ts
 *   git show origin/main:src/lib/source-locator-extract.ts > <base>/source-locator-extract.ts
 *   BASE_LIB=<base> TARBALLS=<dir of owner_repo.tar.gz> pnpm exec vitest run \
 *     --config improvements/audits/2026-10-23-locate-ranking/vitest.dry-run.config.mts
 *
 * Skips when BASE_LIB or TARBALLS is unset. No network, no database.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it, vi } from "vitest";
import { buildRows, tarFiles } from "../../../src/lib/source-locator-extract";

const REFS: Record<string, string> = {
	"stellar/stellar-core": "05c6328c13b595c52b6ad1ecd1e69cd9b2a582d4",
	"stellar/rs-soroban-sdk": "8e5b425dce5fa1dcd5a3fe1d3f3fcd18431586dd",
	"stellar/rs-soroban-env": "0c99950e96128beba3319aa96b116646ce974e69",
	"stellar/js-stellar-sdk": "0f2fd40ba6db761390e3e5e4eb5c432234696a61",
	"stellar/stellar-rpc": "ec4171d970ac812d9f4317b3cce2c315baa31320",
	"stellar/quickstart": "0ff76e336a438370ba900db7f437dcbe5b90dda7",
	"stellar/stellar-cli": "4ff88b7ea11dd3c847bb711b80258517148e1529",
	"stellar/soroban-examples": "03d42aa6b973dcf3a453a99d0c6a6e8d25a196e2",
	"OpenZeppelin/stellar-contracts": "ddc327eb92d63709436da3a8455f641c2d5476c5",
};
const BASE_LIB = process.env.BASE_LIB;
const TARBALLS = process.env.TARBALLS;

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;
const matchOne = (d: Doc, f: Filter) =>
	Object.entries(f).every(([k, v]) =>
		v && typeof v === "object" && "$in" in v
			? (v as { $in: unknown[] }).$in.includes(d[k])
			: d[k] === v,
	);
const writes: string[] = [];
function model(store: Map<string, Doc>) {
	return {
		find: (f: Filter) => ({
			lean: async () => [...store.values()].filter((d) => matchOne(d, f)),
		}),
		findOne: (f: Filter) => ({
			lean: async () => [...store.values()].find((d) => matchOne(d, f)) ?? null,
		}),
		countDocuments: async (f: Filter = {}) =>
			[...store.values()].filter((d) => matchOne(d, f)).length,
		createIndexes: async () => {},
		bulkWrite: async () => writes.push("bulkWrite"),
		deleteMany: async () => writes.push("deleteMany"),
		updateOne: async () => writes.push("updateOne"),
	};
}
const rows = new Map<string, Doc>();
const repos = new Map<string, Doc>();
vi.mock("payload", () => ({
	getPayload: async () => ({
		db: {
			collections: {
				"source-locators": model(rows),
				"source-locator-repos": model(repos),
			},
		},
	}),
}));
vi.mock("../../../src/payload.config", () => ({ default: {} }));
vi.mock("../../../scripts/load-env", () => ({}));

const tarPath = (repo: string) =>
	join(TARBALLS ?? "", `${repo.replace("/", "_")}.tar.gz`);
vi.stubGlobal("fetch", async (url: string) => {
	const repo = Object.keys(REFS).find((r) => url.includes(`/${r}/`));
	if (!repo) throw new Error(`unexpected fetch ${url}`);
	if (url.startsWith("https://api.github.com/"))
		return { ok: true, status: 200, text: async () => REFS[repo] };
	const body = readFileSync(tarPath(repo));
	return {
		ok: true,
		status: 200,
		arrayBuffer: async () =>
			body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
	};
});

const realExit = process.exit;
afterAll(() => {
	process.exit = realExit;
});

describe.skipIf(!BASE_LIB || !TARBALLS)(
	"builder dry run over pinned tarballs",
	() => {
		it("plans creates only: impl locators in the eight repos, every row of the new repo", async () => {
			const base = await import(
				join(BASE_LIB ?? "", "source-locator-extract.ts")
			);
			const oldKeys = new Map<string, Set<string>>();
			for (const [repo, ref] of Object.entries(REFS)) {
				if (repo.startsWith("OpenZeppelin/")) continue; // not in the base allowlist
				const built = base.buildRows(
					repo,
					ref,
					base.tarFiles(gunzipSync(readFileSync(tarPath(repo)))),
				);
				oldKeys.set(
					repo,
					new Set(built.rows.map((r: { key: string }) => r.key)),
				);
				for (const r of built.rows) rows.set(r.key, r);
				repos.set(repo, {
					repo,
					ref,
					builtAt: new Date(),
					pointers: built.rows.length,
				});
			}
			const out: string[] = [];
			process.argv = ["node", "build-source-locators.ts"];
			process.env.DATABASE_URI = "mongodb://in-memory";
			const exited = new Promise<void>((resolve) => {
				process.exit = (() => resolve()) as typeof process.exit;
			});
			const log = vi.spyOn(console, "log").mockImplementation((...a) => {
				out.push(a.join(" "));
			});
			const err = vi.spyOn(console, "error").mockImplementation((...a) => {
				out.push(`ERR ${a.join(" ")}`);
			});
			await import("../../../scripts/build-source-locators");
			await exited;
			log.mockRestore();
			err.mockRestore();
			console.log(out.join("\n"));
			expect(writes).toEqual([]);
			expect(out.join("\n")).not.toContain("ERR");

			// The builder's plan lines, per repo, in allowlist order.
			const plans = out.filter((l) => l.trim().startsWith("plan:"));
			expect(plans).toHaveLength(Object.keys(REFS).length);
			for (const [i, repo] of Object.keys(REFS).entries()) {
				const m = plans[i].match(
					/writes=(\d+) \(create (\d+), update (\d+), delete (\d+)\); stored (\d+)/,
				);
				expect(m, repo).not.toBeNull();
				const [, , create, update, del, stored] = (m ?? []).map(Number);
				expect(update, `${repo} updates`).toBe(0);
				expect(del, `${repo} deletes`).toBe(0);
				// Recompute the creates with this tree's extraction: each is new, and
				// in the eight indexed repos each is an impl locator.
				const now = buildRows(
					repo,
					REFS[repo],
					tarFiles(gunzipSync(readFileSync(tarPath(repo)))),
				);
				const created = now.rows.filter((r) => !oldKeys.get(repo)?.has(r.key));
				expect(created).toHaveLength(create);
				if (oldKeys.has(repo)) {
					expect(stored).toBe(oldKeys.get(repo)?.size);
					expect(
						created.every(
							(r) =>
								r.locatorKind === "symbol" && r.locator?.startsWith("impl "),
						),
						repo,
					).toBe(true);
					expect(now.rows.length - created.length, repo).toBe(stored);
				} else expect(stored, repo).toBe(0);
			}
		}, 120_000);
	},
);
