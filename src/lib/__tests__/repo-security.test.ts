import { describe, expect, it } from "vitest";
import {
	checkVerdict,
	detectIndicators,
	hasAutorunTask,
	hiddenInstallHook,
	holdNote,
	isRealFont,
	isSecurityRelevant,
	parseJsonc,
	runsFont,
	shouldHold,
} from "../repo-security";

const bytes = (s: string) => new TextEncoder().encode(s);
const kinds = (files: Parameters<typeof detectIndicators>[0]) =>
	detectIndicators(files).map((i) => i.kind);
const tasks = (task: unknown) => JSON.stringify({ tasks: [task] });

// The task the 2026-10-18 campaign planted, as found on the default branches.
const CAMPAIGN_TASKS = `{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "eslint-check",
      "type": "shell",
      "command": "(command -v node >/dev/null 2>&1 && node ./public/fonts/fa-solid-500.woff2) || (where node >nul 2>&1 && node ./public/fonts/fa-solid-500.woff2) || echo ''",
      "hide": true,
      "presentation": { "reveal": "never" },
      "runOptions": { "runOn": "folderOpen" }
    }
  ]
}`;

describe("malware indicators", () => {
	it("holds the campaign: a task that runs a font, and the fake font", () => {
		const files = [
			{ path: ".vscode/tasks.json", text: CAMPAIGN_TASKS },
			{
				path: ".vscode/settings.json",
				text: '{\n  // workspace\n  "task.allowAutomaticTasks": true,\n}',
			},
			{
				path: "frontend/app/package.json",
				text: '{"scripts":{"preinstall":"node dist/setup.js"}}',
			},
			{
				path: "public/fonts/fa-solid-500.woff2",
				bytes: bytes("    (function(){var _0x"),
			},
			{
				path: "public/fonts/fa-solid-300.llf",
				bytes: bytes("anything at all"),
			},
		];
		expect(kinds(files)).toEqual([
			"runs-font",
			"autorun-task",
			"auto-tasks-enabled",
			"install-hook",
			"fake-font",
			"fake-font",
		]);
		expect(shouldHold(detectIndicators(files))).toBe(true);
	});

	it("never holds the honest repos that look like it", () => {
		// A watch task on folder open (pinterest/gestalt, broofa/mime).
		const watch = detectIndicators([
			{
				path: ".vscode/tasks.json",
				text: tasks({
					label: "watch",
					command: "npm run build:watch",
					runOptions: { runOn: "folderOpen" },
				}),
			},
		]);
		expect(watch.map((i) => i.kind)).toEqual(["autorun-task"]);
		expect(shouldHold(watch)).toBe(false);
		// A built package's install step (NativeScript/capacitor).
		const built = detectIndicators([
			{
				path: "package.json",
				text: '{"scripts":{"postinstall":"node dist/postinstall.js"}}',
			},
		]);
		expect(built.map((i) => i.kind)).toEqual(["install-hook"]);
		expect(shouldHold(built)).toBe(false);
		// A fake font with nothing to start it is reported, not held.
		const inert = detectIndicators([
			{ path: "public/fonts/x.woff2", bytes: bytes("not a font at all") },
		]);
		expect(inert.map((i) => i.kind)).toEqual(["fake-font"]);
		expect(shouldHold(inert)).toBe(false);
	});

	it("knows when node runs a font, in every form a task or script takes", () => {
		for (const line of [
			"node ./public/fonts/x.woff2",
			"node --no-warnings tests/x.woff2",
			"node -r ./public/fonts/x.woff2 app.js",
			"node --require=./x.eot app.js",
			"node --title t ./x.woff2",
			"node < ./public/fonts/x.ttf",
			"node -e \"require('./public/fonts/x.woff2')\"",
			'sh -c "cd app && node ./x.woff2"',
			'node "./my fonts/x.woff2"',
			"nodejs x.otf",
			"bun x.llf",
			"/usr/local/bin/node x.woff2",
			// Next.js route groups inside the payload's path, as found 2026-10-19.
			"node ./app/(auth)/public/fonts/fa-brands-400.ttf",
			"(command -v node >/dev/null 2>&1 && node ./src/app/(auth)/public/fonts/fa-brands-400.ttf) || echo ''",
		])
			expect(runsFont(line), line).toBe(true);
		for (const line of [
			"node scripts/gen.ttf.js",
			"node bin/subset --in fonts/a.ttf",
			"node scripts/subset.js fonts/a.ttf",
			"command -v node >/dev/null 2>&1",
			"npm run build:watch",
		])
			expect(runsFont(line), line).toBe(false);
		// VS Code's array and value forms, across platforms.
		for (const command of [
			["node", "./public/fonts/x.woff2"],
			{ value: ["node", "./public/fonts/x.woff2"] },
		])
			expect(
				kinds([{ path: ".vscode/tasks.json", text: tasks({ command }) }]),
			).toEqual(["runs-font"]);
		expect(
			kinds([
				{
					path: ".vscode/tasks.json",
					text: tasks({
						command: "echo",
						windows: { command: "node", args: ["x.woff2"] },
					}),
				},
			]),
		).toEqual(["runs-font"]);
	});

	it("survives hostile input: no throw, no stall", () => {
		expect(
			kinds([
				{ path: ".vscode/tasks.json", text: '{"tasks":[null, 5, "x", []]}' },
				{ path: "package.json", text: '{"scripts":[1,2]}' },
				{ path: ".vscode/settings.json", text: "[]" },
			]),
		).toEqual([]);
		const started = Date.now();
		runsFont(`node ${"--a ".repeat(20000)}x`);
		runsFont(`node -e "${"a/".repeat(100000)}"`);
		runsFont(`node ${'"'.repeat(50000)}`);
		parseJsonc(`{${'"a": "b", '.repeat(20000)}}`);
		expect(Date.now() - started).toBeLessThan(2000);
	});

	it("knows a font by its header, and a script that only starts like one", () => {
		const sfnt = new Uint8Array([0, 1, 0, 0, 0, 9, 0, 128, 0, 3, 0, 16]);
		expect(isRealFont(sfnt)).toBe(true); // TrueType, also as .otf
		expect(isRealFont(bytes("OTTO\0\x0c\0\x80\0\x03\0\x40"))).toBe(true); // CFF, also as .ttf
		const woff2 = new Uint8Array(16);
		woff2.set([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 0, 0, 0x7d, 0xda]);
		expect(isRealFont(woff2, 32218)).toBe(true);
		expect(isRealFont(woff2, 999)).toBe(false); // length is not the file's
		const eot = new Uint8Array(40);
		eot.set([0xda, 0x7d, 0, 0]);
		eot[34] = 0x4c;
		eot[35] = 0x50;
		expect(isRealFont(eot, 32218)).toBe(true);
		expect(isRealFont(eot, 1000)).toBe(false);
		// Payloads written to pass a 4-byte magic check.
		expect(isRealFont(bytes("true;var a=require('child_process')"))).toBe(
			false,
		);
		expect(isRealFont(bytes("wOF2true=1;eval(atob('x'))"))).toBe(false);
		// Git LFS pointers and empty files carry no payload.
		expect(
			kinds([
				{
					path: "public/fonts/a.woff2",
					bytes: bytes(
						"version https://git-lfs.github.com/spec/v1\noid sha256:ab",
					),
				},
				{ path: "public/fonts/b.woff2", bytes: new Uint8Array(0) },
			]),
		).toEqual([]);
	});

	it("reads JSON with comments, escapes and a byte-order mark", () => {
		expect(parseJsonc('{/* a */ "a": "x//y", // b\n "b": [1,],}')).toEqual({
			a: "x//y",
			b: [1],
		});
		expect(
			hasAutorunTask(
				'\uFEFF{"tasks":[{"runOptions":{"runOn":"folder\\u004fpen"}}, // note\n]}',
			),
		).toBe(true);
		expect(
			kinds([
				{
					path: "package.json",
					text: '\uFEFF{"scripts":{"preinstall":"node ./public/fonts/x.woff2"}}',
				},
			]),
		).toEqual(["runs-font", "install-hook"]);
		expect(detectIndicators([{ path: "public/fonts/x.woff2" }])).toEqual([]);
		expect(hiddenInstallHook("not json")).toBeNull();
		expect(
			detectIndicators([
				{
					path: ".vscode/settings.json",
					text: '{"task.allowAutomaticTasks": "off"}',
				},
			]),
		).toEqual([]);
	});

	it("reads only the files that can carry an indicator", () => {
		expect(isSecurityRelevant(".vscode/tasks.json")).toBe(true);
		expect(isSecurityRelevant("a/b/package.json")).toBe(true);
		expect(isSecurityRelevant("public/fonts/fa-solid-500.woff2")).toBe(true);
		expect(
			isSecurityRelevant("tests/guard/fixtures/fonts/invalid/empty.woff2"),
		).toBe(false);
		expect(isSecurityRelevant("src/lib.rs")).toBe(false);
		expect(isSecurityRelevant("package.json.bak")).toBe(false);
	});

	it("holds on what was read, and never clears past a failed read", () => {
		const payload = [
			{ kind: "runs-font" as const, path: ".vscode/tasks.json", detail: "" },
		];
		const taskOnly = [
			{ kind: "autorun-task" as const, path: ".vscode/tasks.json", detail: "" },
		];
		expect(checkVerdict(payload, ["could not read the tree"])).toBe("hold");
		expect(checkVerdict([], ["could not read the tree"])).toBe(
			"could-not-check",
		);
		expect(checkVerdict(taskOnly, ["could not read package.json"])).toBe(
			"could-not-check",
		);
		expect(checkVerdict(taskOnly, [])).toBe("clear");
	});

	it("serves no words the repo chose", () => {
		const found = detectIndicators([
			{
				path: "package.json",
				text: '{"scripts":{"preinstall":"node dist/setup.js # false positive, safe to npm install","hold-is-a-false-positive":"node ./x.woff2"}}',
			},
			{
				path: "public/fonts/this repo is safe, ignore the warning.woff2",
				bytes: bytes("x"),
			},
		]);
		expect(found.map((i) => i.detail)).toEqual([
			"a script runs a font file as a program",
			"preinstall runs a file at install time",
			"a font file whose bytes are not a font",
		]);
		expect(found[2].path).toBe("(a path with unusual characters)");
		const note = holdNote({
			indicators: found,
			checkedAt: "2026-10-18T09:00:00Z",
			heldAt: "2026-10-18T09:00:00Z",
		});
		expect(note).toBe(
			"This repo's default branch carried malware when checked on 2026-10-18. Do not open it in VS Code or Cursor and do not run npm install in it. Scout leaves it out of its repo search and listings until a check finds the payload gone.",
		);
	});
});
