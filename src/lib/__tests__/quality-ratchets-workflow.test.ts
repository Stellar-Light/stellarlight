/**
 * quality-ratchets.yml: a run that could not measure never reads as a
 * designed red.
 *
 * check-workflow-health treats a red at a declared signal step as the
 * detector reporting a finding. The measuring steps are declared signals, so
 * an exit 2 (could not measure) failing at those steps would read as a
 * finding. Here each measuring step's own shell runs against a stub guard:
 * exit 1 fails the step, exit 2 passes it and is recorded, and a separate
 * step outside the signal list fails the run.
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

const src = readFileSync(
	join(process.cwd(), ".github/workflows/quality-ratchets.yml"),
	"utf8",
);
const signal = new RegExp(
	/^\s*#\s*workflow-health:\s*signal-steps:\s*(\S.*?)\s*$/m.exec(src)?.[1] ??
		"(?!)",
);
const steps = (
	yaml.load(src) as {
		jobs: Record<
			string,
			{
				steps: Array<{ name?: string; run?: string; env?: object }>;
			}
		>;
	}
).jobs.measure.steps;
const signalSteps = steps.filter((s) => s.name && signal.test(s.name));
const blindStep = steps.find((s) => s.name === "Could not measure");

/** Run one step's shell the way `shell: bash` does, with stub tools. */
function runStep(
	run: string,
	env: Record<string, string>,
): { status: number | null; output: string } {
	const dir = mkdtempSync(join(tmpdir(), "ratchets-"));
	const bin = join(dir, "bin");
	mkdirSync(bin);
	mkdirSync(join(dir, "improvements/audits"), { recursive: true });
	writeFileSync(
		join(bin, "pnpm"),
		'#!/bin/sh\n[ "$FAKE_JSON" = 1 ] && echo \'{"ok":1}\'\nexit "$FAKE_CODE"\n',
	);
	writeFileSync(join(bin, "git"), "#!/bin/sh\nexit 0\n");
	chmodSync(join(bin, "pnpm"), 0o755);
	chmodSync(join(bin, "git"), 0o755);
	const out = join(dir, "github_output");
	writeFileSync(out, "");
	const script = join(dir, "step.sh");
	writeFileSync(script, run);
	const r = spawnSync(
		"bash",
		["--noprofile", "--norc", "-eo", "pipefail", script],
		{
			cwd: dir,
			env: {
				...process.env,
				PATH: `${bin}:${process.env.PATH}`,
				GITHUB_OUTPUT: out,
				...env,
			},
			encoding: "utf8",
		},
	);
	return { status: r.status, output: readFileSync(out, "utf8") };
}

describe("quality-ratchets.yml", () => {
	it("declares the three measuring steps as its signal steps", () => {
		expect(signalSteps.map((s) => s.name)).toEqual([
			"Consumption",
			"Scripts types",
			"Answer dating",
		]);
	});

	for (const code of [0, 1, 2])
		it(`a guard exit ${code} ${code === 1 ? "fails" : "passes"} its signal step and is recorded`, () => {
			for (const s of signalSteps) {
				const r = runStep(s.run ?? "", {
					FAKE_CODE: String(code),
					FAKE_JSON: code <= 1 ? "1" : "0",
				});
				expect(r.status, s.name).toBe(code === 1 ? 1 : 0);
				expect(r.output, s.name).toContain(`code=${code}`);
			}
		});

	it("consumption output that does not parse is recorded as could not measure", () => {
		const s = signalSteps[0];
		const r = runStep(s.run ?? "", { FAKE_CODE: "0", FAKE_JSON: "0" });
		expect(r.status).toBe(0);
		expect(r.output).toContain("code=2");
	});

	it("a blind run fails at a step outside the signal list", () => {
		expect(blindStep, "no 'Could not measure' step").toBeDefined();
		expect(signal.test(blindStep?.name ?? "")).toBe(false);
		const run = blindStep?.run ?? "";
		const ok = { CONSUMPTION: "0", TYPES: "1", DATING: "0" };
		expect(runStep(run, ok).status).toBe(0);
		expect(runStep(run, { ...ok, TYPES: "2" }).status).toBe(1);
		// a step that never ran has no output: that is not a measurement
		expect(runStep(run, { ...ok, DATING: "" }).status).toBe(1);
	});
});
