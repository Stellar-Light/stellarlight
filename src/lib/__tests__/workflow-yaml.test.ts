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

	// Second instance of the same class, 2026-08-30. consumption-guard.yml — the
	// lane whose whole job is to fail a build when machinery goes unconsumed —
	// installed pnpm with `npm i -g pnpm`, which resolves to LATEST. It was
	// correct the day it was written; upstream shipped pnpm 11, engines.pnpm is
	// "^9 || ^10", and the guard died at the install step before running once.
	//
	// The failure needs no edit of ours to arrive, which is what makes it worth a
	// test rather than a review note: the repo's other 50+ workflows all pin the
	// major through pnpm/action-setup, so the correct pattern was already here to
	// copy and the broken one was a local invention.
	it.each(FILES)("%s — pins pnpm rather than taking latest", (file) => {
		// Comment lines are dropped first. check-consumption.ts shipped with this
		// exact bug — it searched raw source and found the field name in its OWN
		// comment, so it reported a consumer that did not exist. A checker that
		// reads prose as code is a checker that passes for the wrong reason, and
		// here it would fail for one: the fixed workflow explains what it stopped
		// doing, and naming the broken command is how the note earns its place.
		const src = readFileSync(join(DIR, file), "utf8")
			.split("\n")
			.filter((l) => !/^\s*#/.test(l))
			.join("\n");
		if (!/\bpnpm\b/.test(src)) return;
		expect(src, `${file} installs whatever pnpm is newest today`).not.toMatch(
			/npm\s+(i|install)\s+-g\s+pnpm/,
		);
	});
});
