import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Guard for the env-loading class fixed 2026-07-26.
 *
 * `src/payload.config.ts` reads `process.env.PAYLOAD_SECRET` inside
 * `buildConfig({...})`, which runs at MODULE EVALUATION. ESM hoists imports
 * above the module body, so a `loadEnv()` call anywhere in a script's body —
 * before or after the import list, it makes no difference — runs after the
 * config has already captured an empty secret. 40 scripts died on
 * "missing secret key" locally and worked in CI only because CI injects env
 * vars directly, which is what kept the breakage invisible.
 *
 * The fix is `import "./load-env"` — hoisted, so it runs before the sibling
 * imports that need it. This test stops the old form coming back, in either of
 * its disguises: a direct dotenv call, or no env loading at all.
 */
const SCRIPTS = join(process.cwd(), "scripts");

function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const p = join(dir, entry);
		if (statSync(p).isDirectory()) out.push(...walk(p));
		else if (p.endsWith(".ts")) out.push(p);
	}
	return out;
}

describe("scripts/ env loading", () => {
	const files = walk(SCRIPTS).filter((p) => !p.endsWith("load-env.ts"));

	it("finds the scripts to check (guard is not vacuously passing)", () => {
		// A guard that silently checks nothing looks exactly like one that works.
		expect(files.length).toBeGreaterThan(50);
	});

	it("no script loads dotenv itself — that ordering is the bug", () => {
		const offenders = files.filter((p) => {
			const s = readFileSync(p, "utf-8");
			// Ignore usage docs in header comments; only real code counts.
			return /^\s*import\s+.*from\s+"dotenv"|^\s*import\s+"dotenv\/config"/m.test(
				s,
			);
		});
		expect(offenders.map((p) => p.replace(`${SCRIPTS}/`, ""))).toEqual([]);
	});

	it("every script that reaches Payload imports load-env first", () => {
		const offenders: string[] = [];
		for (const p of files) {
			const s = readFileSync(p, "utf-8");
			if (!s.includes("payload.config")) continue;
			if (!/import\s+"\.{1,2}\/(\.\.\/)*load-env"/.test(s)) {
				offenders.push(p.replace(`${SCRIPTS}/`, ""));
				continue;
			}
			// It must be the FIRST import: anything importing payload.config above
			// it would evaluate the config before the env exists.
			const imports = s
				.split("\n")
				.map((l, i) => ({ l, i }))
				.filter(({ l }) => /^import\s/.test(l));
			if (imports.length && !/load-env"/.test(imports[0].l))
				offenders.push(
					`${p.replace(`${SCRIPTS}/`, "")} (not the first import)`,
				);
		}
		expect(offenders).toEqual([]);
	});
});
