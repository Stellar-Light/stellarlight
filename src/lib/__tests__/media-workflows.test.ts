/**
 * The two media lanes' workflows.
 *
 * media-files.yml: the job that installs dependencies holds no secret and
 * can push nothing; the one job that can push installs and runs nothing from
 * the repo, and commits the single file the probe hands it.
 *
 * repair-missing-logos.yml: dispatch only, dry run by default, a plan step
 * with no secret before any write, the secrets on the execute step alone, and
 * a re-plan after it. A scheduled run has no `inputs`, so a lane that could
 * be scheduled must not rest its dry-run default on one: this one has no
 * schedule at all.
 */
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";
import { MEDIA_STORE_ENV } from "../media-files";

// biome-ignore lint/suspicious/noExplicitAny: workflow YAML
type Any = any;
const read = (f: string): Any =>
	load(readFileSync(`.github/workflows/${f}`, "utf8"));
const text = (x: unknown) => JSON.stringify(x);
const secretsIn = (x: unknown) =>
	[
		...new Set(
			[...text(x).matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]),
		),
	].sort();

describe("media-files.yml", () => {
	const wf = read("media-files.yml");
	const probe: Any = wf.jobs.probe;
	const record: Any = wf.jobs.record;

	it("runs daily and on dispatch, with no input to rest on", () => {
		expect(wf.on.schedule).toEqual([{ cron: "17 5 * * *" }]);
		expect(wf.on.workflow_dispatch).toBeNull();
		expect(text(wf)).not.toMatch(/inputs\./);
	});

	it("gives the probe job no secret, no write permission and no credentials", () => {
		expect(wf.permissions).toEqual({ contents: "read" });
		expect(probe.permissions).toBeUndefined();
		expect(secretsIn(probe)).toEqual([]);
		const checkout = probe.steps.find((s: Any) =>
			String(s.uses ?? "").startsWith("actions/checkout"),
		);
		expect(checkout.with["persist-credentials"]).toBe(false);
		expect(text(probe)).not.toMatch(/git push|git commit/);
	});

	it("probes into the runner's temp directory and reads the last artifact", () => {
		const step = probe.steps.find((s: Any) => s.name === "Probe");
		expect(step.run).toBe(
			'pnpm exec tsx scripts/check-media-files.ts --prev improvements/audits/media-files-latest.json --out "$RUNNER_TEMP/media-files-latest.json"',
		);
		// the red step is the declared signal, so a finding is not a broken lane
		expect(readFileSync(".github/workflows/media-files.yml", "utf8")).toContain(
			"# workflow-health: signal-steps: ^Probe$",
		);
		const upload = probe.steps.find((s: Any) =>
			String(s.uses ?? "").startsWith("actions/upload-artifact"),
		);
		expect(upload.with.path).toBe("${{ runner.temp }}/media-files-latest.json");
		expect(upload.if).toBe("always() && steps.kept.outputs.wrote == 'true'");
		expect(probe.outputs.wrote).toBe("${{ steps.kept.outputs.wrote }}");
	});

	it("the commit job may push but installs and runs nothing from the repo", () => {
		expect(record.permissions).toEqual({ contents: "write" });
		expect(record.needs).toBe("probe");
		expect(record.if).toBe(
			"always() && github.ref == 'refs/heads/main' && needs.probe.outputs.wrote == 'true'",
		);
		const uses = record.steps
			.map((s: Any) => s.uses)
			.filter(Boolean)
			.map((u: string) => u.split("@")[0]);
		expect(uses).toEqual(["actions/checkout", "actions/download-artifact"]);
		const runs = record.steps.map((s: Any) => s.run ?? "").join("\n");
		expect(runs).not.toMatch(/\b(pnpm|npm|npx|yarn|tsx|node)\b/);
		expect(runs).toContain(
			"git add improvements/audits/media-files-latest.json",
		);
		expect(runs).toContain(
			"git pull --rebase --autostash -X theirs origin main || git rebase --abort",
		);
		expect(secretsIn(record)).toEqual([]);
	});

	it("writes the file the improvement ledger reads", () => {
		const ledger = readFileSync("scripts/improvement-ledger.ts", "utf8");
		expect(ledger).toMatch(
			/source: "media-files",\s*file: "media-files-latest\.json",\s*dir: AUDITS,/,
		);
		expect(ledger).toMatch(
			/REPO_REDIRECTS_SPEC,\s*MEDIA_FILES_SPEC,\s*\]\) \{/,
		);
		// the committed artifact carries the keys that spec reads
		const artifact = JSON.parse(
			readFileSync("improvements/audits/media-files-latest.json", "utf8"),
		);
		expect(Date.parse(artifact.generatedAt)).toBeGreaterThan(0);
		expect(Array.isArray(artifact.missing)).toBe(true);
		for (const m of artifact.missing) expect(typeof m.ref).toBe("string");
	});
});

describe("repair-missing-logos.yml", () => {
	const wf = read("repair-missing-logos.yml");
	const job: Any = wf.jobs.repair;
	const step = (name: string): Any =>
		job.steps.find((s: Any) => s.name === name);
	const order = job.steps.map((s: Any) => s.name).filter(Boolean);

	it("is dispatch only, and a dry run unless execute is ticked", () => {
		expect(Object.keys(wf.on)).toEqual(["workflow_dispatch"]);
		expect(wf.on.workflow_dispatch.inputs.execute).toMatchObject({
			type: "boolean",
			default: false,
		});
		expect(wf.permissions).toEqual({ contents: "read" });
		expect(text(job)).not.toMatch(/git push|git commit/);
	});

	it("plans with no secret before the execute, and re-plans after it", () => {
		expect(order).toEqual([
			"Plan (dry run)",
			"Refuse an execute off main",
			"Execute",
			"Re-plan",
		]);
		for (const name of ["Plan (dry run)", "Re-plan"]) {
			expect(secretsIn(step(name))).toEqual([]);
			expect(step(name).run).not.toContain("--execute");
		}
		expect(step("Plan (dry run)").if).toBeUndefined();
		expect(step("Re-plan").if).toBe(
			"${{ !cancelled() && inputs.execute && github.ref == 'refs/heads/main' }}",
		);
		// tee hides a red without pipefail (check-writer-conformance C2)
		expect(step("Re-plan").shell).toBe("bash");
		expect(step("Re-plan").run).toContain("set -o pipefail");
		expect(step("Re-plan").run).toContain("repair\\(s\\) planned");
	});

	it("holds the database and the file store on the execute step alone", () => {
		// Only main's code may write: a dispatch on another branch would run
		// that branch's script with the production secrets.
		expect(step("Execute").if).toBe(
			"${{ inputs.execute && github.ref == 'refs/heads/main' }}",
		);
		const refuse = step("Refuse an execute off main");
		expect(refuse.if).toBe(
			"${{ inputs.execute && github.ref != 'refs/heads/main' }}",
		);
		expect(refuse.run).toContain("exit 1");
		expect(secretsIn(refuse)).toEqual([]);
		expect(step("Execute").run).toContain("--execute");
		expect(secretsIn(step("Execute"))).toEqual(
			["DATABASE_URI", "PAYLOAD_SECRET", ...MEDIA_STORE_ENV].sort(),
		);
		expect(secretsIn(wf)).toEqual(secretsIn(step("Execute")));
	});

	it("passes the slug through the environment, not into the script text", () => {
		expect(job.env).toEqual({ ONLY: "${{ inputs.only }}" });
		for (const s of job.steps)
			expect(String(s.run ?? "")).not.toContain("${{ inputs.");
	});

	it("is on the roster of lanes that can write", () => {
		const lanes = JSON.parse(
			readFileSync("improvements/lanes/lanes.json", "utf8"),
		).lanes as Array<Record<string, unknown>>;
		expect(
			lanes.find((l) => l.workflow === "repair-missing-logos.yml"),
		).toMatchObject({
			id: "repair-missing-logos",
			cadence: "dispatch",
			executeInput: "execute",
		});
	});
});
