/**
 * A dispatch input written into a `run:` script as `${{ inputs.x }}` is
 * pasted into the script before the shell reads it, so a free-text input is
 * shell text: `a/b; curl ...` runs. Passed through `env:` and used as a
 * quoted variable, it stays one argument. Boolean and choice inputs are
 * checked by GitHub against true/false or the listed options, so they are
 * left out; number and string inputs are checked.
 *
 * Found 2026-11-13: four workflows wrote their `only` input into the run
 * script, and enrich-builder-repos.yml a fifth. They pass it through env now.
 */
import { readdirSync, readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

// biome-ignore lint/suspicious/noExplicitAny: workflow YAML
type Any = any;
const DIR = ".github/workflows";

/** Named debt on 2026-11-13: inputs still written into a run script. The
 *  list only shrinks; a fixed entry must be removed (the second test). */
const DEBT = new Set<string>([
	"basis-from-product.yml:limit",
	"check-links.yml:dry_run",
	"consumer-report.yml:consumer",
	"consumer-report.yml:days",
	"curator-wallet-availability.yml:limit",
	"db-space.yml:prune_days",
	"gone-repos.yml:limit",
	"ingest-ec-taxonomy.yml:limit",
	"ingest-ec-taxonomy.yml:skip",
	"repair-lane.yml:budget_usd",
	"repair-lane.yml:model",
	"repair-lane.yml:row",
	"scan-repo-code.yml:extra",
	"scan-repo-code.yml:lang",
	"scan-repo-code.yml:limit",
	"seed-blog-posts.yml:remove",
	"task-lane.yml:budget_usd",
	"task-lane.yml:model",
	"verification-packets.yml:limit",
	"verification-packets.yml:offset",
	"weak-basis-liveness.yml:limit",
]);

function interpolated(): string[] {
	const found = new Set<string>();
	for (const f of readdirSync(DIR).filter((x) => /\.ya?ml$/.test(x))) {
		const wf: Any = load(readFileSync(`${DIR}/${f}`, "utf8"));
		const on: Any = wf?.on ?? {};
		const inputs: Any = {
			...(on.workflow_dispatch?.inputs ?? {}),
			...(on.workflow_call?.inputs ?? {}),
		};
		for (const job of Object.values<Any>(wf?.jobs ?? {}))
			for (const step of job.steps ?? []) {
				if (typeof step.run !== "string") continue;
				for (const [, expr] of step.run.matchAll(/\$\{\{(.*?)\}\}/gs))
					for (const [, name] of expr.matchAll(/inputs\.([\w-]+)/g)) {
						const type = inputs[name]?.type ?? "string";
						if (type !== "boolean" && type !== "choice")
							found.add(`${f}:${name}`);
					}
			}
	}
	return [...found].sort();
}

describe("workflow inputs reach run scripts through env", () => {
	const found = interpolated();

	it("no free-text input is written into a run script", () => {
		expect(found.filter((k) => !DEBT.has(k))).toEqual([]);
	});

	it("the debt list names only interpolations that still exist", () => {
		expect([...DEBT].filter((k) => !found.includes(k))).toEqual([]);
	});
});
