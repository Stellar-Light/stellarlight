// @vitest-environment node
/**
 * refresh-token-integrations.yml: a run whose plan was cut short is never a
 * green one. Run 45443354264 exited 0 with its log stopping inside the
 * per-token lines, no `plan:` line printed; the Idempotence step parses the
 * same output after an execute. Each step's own shell runs here against a
 * stub pnpm that prints a given output and exits 0.
 */
import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const steps = (
	yaml.load(
		readFileSync(
			join(process.cwd(), ".github/workflows/refresh-token-integrations.yml"),
			"utf8",
		),
	) as { jobs: { refresh: { steps: Array<{ name?: string; run?: string }> } } }
).jobs.refresh.steps;

/** Run one step's shell the way `shell: bash` does, the script stubbed. */
function runStep(name: string, printed: string): number | null {
	const run = steps.find((s) => s.name === name)?.run;
	if (!run) throw new Error(`no step ${name}`);
	const dir = mkdtempSync(join(tmpdir(), "token-integrations-"));
	const bin = join(dir, "bin");
	mkdirSync(bin);
	writeFileSync(join(dir, "printed.txt"), printed);
	writeFileSync(join(bin, "pnpm"), `#!/bin/sh\ncat "${dir}/printed.txt"\n`);
	chmodSync(join(bin, "pnpm"), 0o755);
	const script = join(dir, "step.sh");
	// expressions are the runner's: the dry-run form has none
	writeFileSync(script, run.replace(/\$\{\{[^}]*\}\}/g, ""));
	return spawnSync(
		"bash",
		["--noprofile", "--norc", "-eo", "pipefail", script],
		{
			cwd: dir,
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
				CACHE_DIR: join(dir, "cache"),
				GITHUB_STEP_SUMMARY: join(dir, "summary.md"),
			},
			encoding: "utf8",
		},
	).status;
}

const WHOLE = [
	"edges 26518, rows 1248, tokens 488, projects 94",
	"  BLND CD25MNVT...: projects integrated 3 [blend,lobstr,soroswap]",
	"plan: create 0, update 0, end 0, keep (not judged) 11, unchanged 1248",
	"replan: writes=0",
	"",
].join("\n");
const CUT = WHOLE.split("\n").slice(0, 2).join("\n");

describe("a plan cut short fails the run", () => {
	it("the refresh step passes a whole plan and fails one cut short", () => {
		expect(runStep("Refresh (dry run unless writing)", WHOLE)).toBe(0);
		expect(runStep("Refresh (dry run unless writing)", CUT)).not.toBe(0);
	});

	it("the idempotence step never parses a plan without its plan: line", () => {
		expect(runStep("Idempotence", WHOLE)).toBe(0);
		expect(runStep("Idempotence", CUT)).not.toBe(0);
		expect(runStep("Idempotence", WHOLE.replace(/^plan: .*\n/m, ""))).not.toBe(
			0,
		);
		expect(
			runStep("Idempotence", WHOLE.replace("writes=0", "writes=3")),
		).not.toBe(0);
	});
});
