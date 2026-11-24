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

/** True when a step that reads a `replan: writes=` value into a variable
 * fails, or names the source could-not-check, when that line is missing:
 * `if ! grep -q` on the line itself, or `[ -z "$v" ]` on a variable that
 * holds the read. A read through awk does not count: the sum prints 0 for
 * no line at all. */
function replanLineRequired(run: string): boolean {
	const reads = [...run.matchAll(/(\w+)=\$\(([^\n]*replan: writes=[^\n]*)\)/g)];
	if (!reads.length) return true;
	if (/if ! grep -qE? '\^replan: writes=/.test(run)) return true;
	return reads.some(
		([, v, cmd]) => !cmd.includes("awk") && run.includes(`[ -z "$${v}" ]`),
	);
}

describe("replanLineRequired", () => {
	const SUM =
		"n=$(grep -oE '^replan: writes=[0-9]+' replan.log | cut -d= -f2 | awk '{ t += $1 } END { print t + 0 }')";
	it("accepts a grep -q on the line, or -z on the variable that holds it", () => {
		expect(
			replanLineRequired(
				`if ! grep -qE '^replan: writes=[0-9]+' replan.log; then exit 1; fi\n${SUM}`,
			),
		).toBe(true);
		expect(
			replanLineRequired(
				`line=$(grep -E '^replan: writes=' "replan-$s.log" | tr '\\n' ' ')\nif [ -z "$line" ]; then continue; fi\n${SUM}`,
			),
		).toBe(true);
		expect(
			replanLineRequired(
				"n=$(grep -oE '^replan: writes=[0-9]+$' replan.log | cut -d= -f2)\nif [ -z \"$n\" ]; then exit 1; fi",
			),
		).toBe(true);
	});
	it("rejects -z on an unrelated variable, or on an awk sum that prints 0", () => {
		expect(
			replanLineRequired(
				`if [ -z "$IN_LIMIT" ]; then args+=(--all); fi\n${SUM}`,
			),
		).toBe(false);
		expect(replanLineRequired(`${SUM}\nif [ -z "$n" ]; then exit 1; fi`)).toBe(
			false,
		);
	});
});

describe("GitHub Actions workflow files", () => {
	it("finds workflows to check (guards against a silently-empty sweep)", () => {
		expect(FILES.length).toBeGreaterThan(50);
	});

	// Third instance of the class, 2026-11-23: refresh-token-integrations.yml set
	// `CACHE_DIR: ${{ runner.temp }}/...` in its job-level env. The `runner`
	// context exists only inside steps, so GitHub rejected the file outright
	// (the dispatch API answered 422 "Unrecognized named-value: 'runner'") and
	// its weekly schedule could never have run. YAML parses fine; only the
	// context rule catches it.
	it.each(FILES)("%s — no runner context in workflow- or job-level env", (file) => {
		// biome-ignore lint/suspicious/noExplicitAny: workflow YAML
		const doc = yaml.load(readFileSync(join(DIR, file), "utf8")) as any;
		const bad: string[] = [];
		const scan = (env: unknown, where: string) => {
			if (!env || typeof env !== "object") return;
			for (const [k, v] of Object.entries(env as Record<string, unknown>))
				if (typeof v === "string" && /\$\{\{[^}]*\brunner\./.test(v)) bad.push(`${where}.env.${k}`);
		};
		scan(doc?.env, "workflow");
		for (const [id, job] of Object.entries((doc?.jobs ?? {}) as Record<string, { env?: unknown }>))
			scan(job?.env, `jobs.${id}`);
		expect(bad).toEqual([]);
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

	// A step that reads a script's `replan: writes=N` line must fail, or name
	// the source could-not-check, when the line is missing. process.exit on a
	// slow pipe can cut a log before its last line and still exit 0
	// (2026-11-24); `awk '{ t += $1 } END { print t + 0 }'` then reads the
	// missing line as 0 writes, and the idempotence gate passes.
	it.each(FILES)("%s: a missing replan line is never read as 0", (file) => {
		// biome-ignore lint/suspicious/noExplicitAny: workflow YAML
		const doc = yaml.load(readFileSync(join(DIR, file), "utf8")) as any;
		const bad: string[] = [];
		for (const [id, job] of Object.entries(
			(doc?.jobs ?? {}) as Record<
				string,
				{ steps?: { name?: string; run?: string }[] }
			>,
		))
			for (const step of job?.steps ?? []) {
				const run = (step.run ?? "")
					.split("\n")
					.filter((l) => !/^\s*#/.test(l))
					.join("\n");
				if (!replanLineRequired(run))
					bad.push(`jobs.${id}: ${step.name ?? "(unnamed step)"}`);
			}
		expect(bad).toEqual([]);
	});
});
