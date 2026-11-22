/**
 * Media records without files (2026-11-13): 400 of 1,232 media records
 * answered 404 and 137 project rows served one as their logo. The records
 * were written by processes that held the database and no file store, so
 * Payload fell back to the local disk. These tests hold what stops it: an
 * upload with no store is refused before anything is written, and every
 * writer checks for the store and is handed its secrets.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Media } from "../../collections/Media";
import {
	assertMediaStore,
	MEDIA_STORE_ENV,
	mediaStoreConfigured,
	requireMediaStore,
} from "../media-files";

const STORE = {
	R2_ACCESS_KEY_ID: "k",
	R2_SECRET_ACCESS_KEY: "s",
	R2_BUCKET: "b",
	R2_ENDPOINT: "https://example.invalid",
};

/** Runs `fn` with the four store variables set to `env`, then restores. */
function withEnv<T>(env: Record<string, string | undefined>, fn: () => T): T {
	const before = MEDIA_STORE_ENV.map((k) => [k, process.env[k]] as const);
	for (const k of MEDIA_STORE_ENV) {
		if (env[k] === undefined) delete process.env[k];
		else process.env[k] = env[k];
	}
	try {
		return fn();
	} finally {
		for (const [k, v] of before) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	}
}

// biome-ignore lint/suspicious/noExplicitAny: a hook's argument, in part
const hook = (a: any) => (requireMediaStore as any)(a);
describe("the file store guard", () => {
	it("is configured only when all four variables are set", () => {
		expect(mediaStoreConfigured(STORE)).toBe(true);
		for (const k of MEDIA_STORE_ENV) {
			expect(mediaStoreConfigured({ ...STORE, [k]: undefined })).toBe(false);
			// A secret a workflow names and the repo does not hold arrives as
			// an empty string: the seven SCF runs' logs print exactly that.
			expect(mediaStoreConfigured({ ...STORE, [k]: "" })).toBe(false);
		}
	});

	it("names the unset variables and never a value", () => {
		expect(() => assertMediaStore(STORE)).not.toThrow();
		const e = (() => {
			try {
				assertMediaStore({ ...STORE, R2_BUCKET: "", R2_ENDPOINT: undefined });
			} catch (err) {
				return String(err);
			}
			return "";
		})();
		expect(e).toContain("R2_BUCKET, R2_ENDPOINT not set");
		expect(e).not.toContain("https://example.invalid");
		expect(e).not.toContain("R2_ACCESS_KEY_ID");
	});

	it("refuses a create, and an update that carries a file, with no store", () => {
		withEnv({}, () => {
			expect(() => hook({ operation: "create", args: {}, req: {} })).toThrow(
				/Media upload refused/,
			);
			expect(() =>
				hook({ operation: "update", args: {}, req: { file: { name: "x" } } }),
			).toThrow(/Media upload refused/);
			// an alt text edit moves no file
			expect(() =>
				hook({ operation: "update", args: {}, req: {} }),
			).not.toThrow();
			expect(() =>
				hook({ operation: "read", args: {}, req: {} }),
			).not.toThrow();
		});
	});

	it("passes the operation's args through when the store is set", () => {
		withEnv(STORE, () => {
			const args = { data: { alt: "x" } };
			expect(hook({ operation: "create", args, req: {} })).toBe(args);
		});
	});

	it("is the Media collection's first hook", () => {
		expect(Media.hooks?.beforeOperation?.[0]).toBe(requireMediaStore);
	});

	it("runs before Payload writes the file or the record", () => {
		// The claim "a refusal leaves no file and no record" rests on the order
		// inside Payload's own create operation. Pin it, so an upgrade that
		// moves the hook fails here.
		const src = readFileSync(
			"node_modules/payload/dist/collections/operations/create.js",
			"utf8",
		);
		const at = (s: string) => {
			const i = src.indexOf(s);
			expect(i, `payload create.js no longer contains ${s}`).toBeGreaterThan(
				-1,
			);
			return i;
		};
		const hookAt = at("hooks.beforeOperation");
		expect(hookAt).toBeLessThan(at("await generateFileData("));
		expect(hookAt).toBeLessThan(at("await uploadFiles("));
		expect(hookAt).toBeLessThan(at("payload.db.create("));
	});

	it("loads the S3 adapter on the same condition", () => {
		const config = readFileSync("src/payload.config.ts", "utf8");
		expect(config).toMatch(
			/\.\.\.\(mediaStoreConfigured\(\)\s*\?\s*\[\s*s3Storage\(/,
		);
	});
});

describe("every writer of media records", () => {
	const ROOTS = [
		"scripts",
		"src/app",
		"src/lib",
		"src/jobs",
		"src/collections",
	];
	const walk = (dir: string): string[] =>
		readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
			e.name === "__tests__" || e.name === "node_modules"
				? []
				: e.isDirectory()
					? walk(join(dir, e.name))
					: /\.(ts|tsx|mjs|js)$/.test(e.name)
						? [join(dir, e.name)]
						: [],
		);
	const CREATES = /\.create\(\{\s*collection:\s*["']media["']/;
	const writers = ROOTS.flatMap(walk).filter((f) =>
		CREATES.test(readFileSync(f, "utf8")),
	);

	it("is found by the scan", () => {
		expect(writers.sort()).toEqual([
			"scripts/data/curate-projects.ts",
			"scripts/data/repair-missing-logos.ts",
			"scripts/enrich-entities.ts",
			"scripts/enrich-from-scf.ts",
			"scripts/fetch-project-logos.ts",
			"scripts/import-airtable.ts",
			"scripts/reupload-images-to-r2.ts",
			"src/app/api/import/airtable-csv/route.ts",
		]);
	});

	it("checks for the store itself, so a run stops before its first write", () => {
		// The collection hook already refuses each upload. Five of these
		// writers catch an upload error and carry on, so without their own
		// check a run with no store would log an error per row and exit 0.
		// The import route answers with its error list and has no process to
		// stop.
		for (const f of writers) {
			if (f.startsWith("src/app/")) continue;
			expect(
				/\b(assertMediaStore|mediaStoreConfigured)\(/.test(
					readFileSync(f, "utf8"),
				),
				`${f} creates media records and never checks for the file store`,
			).toBe(true);
		}
	});

	it("gets the store secrets in every workflow that runs one", () => {
		const dir = ".github/workflows";
		const scripts = writers.filter((f) => f.startsWith("scripts/"));
		for (const wf of readdirSync(dir)) {
			const text = readFileSync(join(dir, wf), "utf8");
			if (!scripts.some((s) => text.includes(`tsx ${s}`))) continue;
			for (const k of MEDIA_STORE_ENV)
				expect(text, `${wf} runs a media writer without ${k}`).toContain(
					`secrets.${k}`,
				);
		}
	});
});
