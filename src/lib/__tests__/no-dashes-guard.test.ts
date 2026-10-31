/**
 * The served-text dash check (scripts/check-no-dashes.ts), run as CI runs it
 * over a fixture tree: what it must flag, and what it must not (review,
 * 2026-10-31).
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const EM = String.fromCharCode(0x2014);
const EN = String.fromCharCode(0x2013);
const BS = "\\";

function run(files: Record<string, string>): { code: number; out: string } {
	const root = mkdtempSync(join(tmpdir(), "no-dashes-"));
	for (const [rel, text] of Object.entries(files)) {
		mkdirSync(join(root, rel, ".."), { recursive: true });
		writeFileSync(join(root, rel), text);
	}
	try {
		const out = execFileSync(
			"pnpm",
			[
				"exec",
				"tsx",
				"scripts/check-no-dashes.ts",
				"--root",
				root,
				"--no-allow",
				"--check",
			],
			{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
		);
		return { code: 0, out };
	} catch (e) {
		const err = e as { status: number; stdout: string };
		return { code: err.status, out: err.stdout };
	}
}

describe("no-dashes check", () => {
	it("flags a numeric entity without its semicolon and a dash in served JSON, and nothing else", () => {
		const { code, out } = run({
			"src/a.ts": 'export const a = "x &#8212 y";\n',
			"src/b.ts": 'export const b = "&MDASH; renders as written";\n',
			"src/c.ts": `export const c = "the text ${BS}${BS}u2014 is no dash";\n`,
			"src/d.test.mts": `export const d = "a ${EM} b";\n`,
			"src/fixtures/e.json": `{ "k": "a ${EM} b" }\n`,
			"src/f.json": `{ "k": "a ${EN} b" }\n`,
		});
		expect(code).toBe(1);
		const flagged = [...out.matchAll(/^\s+(src\/[^:]+):\d+:/gm)].map(
			(m) => m[1],
		);
		expect(flagged.sort()).toEqual(["src/a.ts", "src/f.json"]);
	}, 60_000);

	it("passes a clean tree", () => {
		expect(run({ "src/a.ts": 'export const a = "a - b, c: d";\n' }).code).toBe(
			0,
		);
	}, 60_000);
});
