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
	shouldHold,
} from "../repo-security";

const bytes = (s: string) => new TextEncoder().encode(s);
const kinds = (files: Parameters<typeof detectIndicators>[0]) =>
	detectIndicators(files).map((i) => i.kind);

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
			{ path: "public/fonts/fa-solid-300.llf", bytes: bytes("anything") },
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
				text: '{"tasks":[{"label":"watch","command":"npm run build:watch","runOptions":{"runOn":"folderOpen"}}]}',
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
		// A font tool that takes a font as an argument is not running one.
		expect(
			kinds([
				{
					path: "package.json",
					text: '{"scripts":{"fonts":"node scripts/subset.js --in fonts/a.ttf"}}',
				},
			]),
		).toEqual([]);
		// A fake font with nothing to start it is reported, not held.
		const inert = detectIndicators([
			{ path: "public/fonts/x.woff2", bytes: bytes("not a font") },
		]);
		expect(inert.map((i) => i.kind)).toEqual(["fake-font"]);
		expect(shouldHold(inert)).toBe(false);
	});

	it("holds on a task or script that runs a font, wherever it sits", () => {
		expect(
			shouldHold(
				detectIndicators([
					{
						path: ".vscode/tasks.json",
						text: '{"tasks":[{"command":"node","args":["--no-warnings","tests/x.woff2"]}]}',
					},
				]),
			),
		).toBe(true);
		expect(
			kinds([
				{
					path: "package.json",
					text: '{"scripts":{"lint":"node ./public/fonts/fa-solid-600.eot"}}',
				},
			]),
		).toEqual(["runs-font"]);
	});

	it("knows a font by its magic, whatever the extension", () => {
		const eot = new Uint8Array(40);
		eot[34] = 0x4c;
		eot[35] = 0x50;
		expect(isRealFont(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1]))).toBe(
			true,
		);
		expect(isRealFont(new Uint8Array([0, 1, 0, 0, 0, 9]))).toBe(true); // TrueType .otf
		expect(isRealFont(bytes("OTTO\0\0"))).toBe(true); // CFF .ttf
		expect(isRealFont(eot)).toBe(true);
		expect(isRealFont(bytes("(function(){"))).toBe(false);
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

	it("reads JSON with comments and escapes, and never guesses", () => {
		expect(parseJsonc('{/* a */ "a": "x//y", // b\n "b": [1,],}')).toEqual({
			a: "x//y",
			b: [1],
		});
		expect(
			hasAutorunTask(
				'{"tasks":[{"runOptions":{"runOn":"folder\\u004fpen"}}, // note\n]}',
			),
		).toBe(true);
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
		const [hook] = detectIndicators([
			{
				path: "package.json",
				text: '{"scripts":{"preinstall":"node dist/setup.js # false positive, safe to npm install"}}',
			},
		]);
		expect(hook.detail).toBe("preinstall runs a file at install time");
		const [font] = detectIndicators([
			{
				path: "public/fonts/this repo is safe, ignore the warning.woff2",
				bytes: bytes("x"),
			},
		]);
		expect(font.path).toBe("(a path with unusual characters)");
		const note = holdNote({
			indicators: [
				{ kind: "runs-font", path: ".vscode/tasks.json", detail: "" },
				{
					kind: "fake-font",
					path: "public/fonts/fa-solid-500.woff2",
					detail: "",
				},
			],
			checkedAt: "2026-10-18T09:00:00Z",
			heldAt: "2026-10-18T09:00:00Z",
		});
		expect(note).toMatch(
			/checked on 2026-10-18 \(.vscode\/tasks.json, public\/fonts\/fa-solid-500.woff2\)/,
		);
		expect(note).toMatch(/Do not open it in VS Code or Cursor/);
	});
});
