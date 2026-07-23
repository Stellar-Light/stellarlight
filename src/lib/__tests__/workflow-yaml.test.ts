import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

// Why this exists: #264 ("repair 6 broken workflows") added `with: {version: 10}`
// to three pnpm/action-setup steps that ALREADY had a block-form `with:`. The
// result was a duplicate mapping key — which GitHub Actions rejects outright
// ("This run likely failed because of a workflow file issue", 0s, no logs).
// embed-projects, dedup-projects and sync-lumenloop were dead for 21 days;
// sync-lumenloop is a daily cron, so the lumenloop directory sync it exists to
// automate silently never ran once — 50/50 runs failed.
//
// The reason it shipped: that PR said "all workflow YAML validated", and it had
// been — with a loader that accepts duplicate keys (python yaml.safe_load, and
// js-yaml under `json: true`). A parse that tolerates the defect can't detect it.
// js-yaml's DEFAULT throws on duplicates, which is exactly the Actions rule, so
// this test is the validation that PR believed it was doing.
const DIR = join(process.cwd(), ".github/workflows");
const FILES = readdirSync(DIR).filter((f) => /\.ya?ml$/.test(f));

describe("GitHub Actions workflow files", () => {
	it("finds workflows to check (guards against a silently-empty sweep)", () => {
		expect(FILES.length).toBeGreaterThan(50);
	});

	it.each(FILES)("%s — parses with no duplicate keys", (file) => {
		const src = readFileSync(join(DIR, file), "utf8");
		// Default schema: duplicate mapping keys throw, matching Actions' parser.
		expect(() => yaml.load(src, { filename: file })).not.toThrow();
	});
});
