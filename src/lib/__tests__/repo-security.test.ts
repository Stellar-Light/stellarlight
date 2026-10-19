import { describe, expect, it } from "vitest";
import {
	checkVerdict,
	detectIndicators,
	hiddenInstallHook,
	holdNote,
	isRealFont,
	isSecurityRelevant,
	shouldHold,
} from "../repo-security";

const bytes = (s: string) => new TextEncoder().encode(s);

// The 2026-10-18 Stellar Wave campaign, as found on the repos' default branches.
describe("malware indicators", () => {
	it("finds each indicator of the campaign", () => {
		const found = detectIndicators([
			{
				path: ".vscode/tasks.json",
				text: '{"tasks":[{"label":"eslint-check","runOptions":{"runOn": "folderOpen"}}]}',
			},
			{
				path: ".vscode/settings.json",
				text: '{"task.allowAutomaticTasks": true}',
			},
			{
				path: "frontend/app/package.json",
				text: '{"scripts":{"preinstall":"node dist/setup.js"}}',
			},
			{
				path: "public/fonts/fa-solid-500.woff2",
				bytes: bytes("(function(){var _0x"),
			},
			{ path: "public/fonts/fa-solid-300.llf", bytes: bytes("anything") },
		]);
		expect(found.map((i) => i.kind)).toEqual([
			"autorun-task",
			"auto-tasks-enabled",
			"install-hook",
			"fake-font",
			"fake-font",
		]);
	});

	it("passes real fonts, ordinary tasks, settings and install scripts", () => {
		const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0]);
		const eot = new Uint8Array(40);
		eot[34] = 0x4c;
		eot[35] = 0x50;
		expect(isRealFont("fonts/inter.woff2", woff2)).toBe(true);
		expect(isRealFont("fonts/fa-solid-900.eot", eot)).toBe(true);
		expect(
			detectIndicators([
				{ path: ".vscode/tasks.json", text: '{"tasks":[{"label":"build"}]}' },
				{ path: ".vscode/settings.json", text: '{"editor.tabSize": 2}' },
				{
					path: "package.json",
					text: '{"scripts":{"preinstall":"npx only-allow pnpm"}}',
				},
				{ path: "fonts/inter.woff2", bytes: woff2 },
			]),
		).toEqual([]);
	});

	it("never guesses: a file without content, or unparsable JSON, is skipped", () => {
		expect(detectIndicators([{ path: "public/fonts/x.woff2" }])).toEqual([]);
		expect(hiddenInstallHook("not json")).toBeNull();
		expect(
			hiddenInstallHook('{"scripts":{"postinstall":"node ./assets/run.js"}}'),
		).toEqual({
			script: "postinstall",
			command: "node ./assets/run.js",
		});
	});

	it("reads only the files that can carry an indicator", () => {
		expect(isSecurityRelevant(".vscode/tasks.json")).toBe(true);
		expect(isSecurityRelevant("a/b/package.json")).toBe(true);
		expect(isSecurityRelevant("public/fonts/fa-solid-500.woff2")).toBe(true);
		expect(isSecurityRelevant("src/lib.rs")).toBe(false);
		expect(isSecurityRelevant("package.json.bak")).toBe(false);
	});

	it("says where and what not to do", () => {
		const note = holdNote({
			indicators: [
				{ kind: "autorun-task", path: ".vscode/tasks.json", detail: "" },
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

	it("leaves test fixtures alone, and the setting alone never holds", () => {
		const fixtures = detectIndicators([
			{
				path: "tests/guard/fixtures/fonts/invalid/not-a-font.woff2",
				bytes: bytes("not a font"),
			},
		]);
		expect(fixtures).toEqual([]);
		expect(
			isSecurityRelevant("tests/guard/fixtures/fonts/invalid/empty.woff2"),
		).toBe(false);
		expect(
			detectIndicators([
				{ path: "public/fonts/empty.woff2", bytes: new Uint8Array(0) },
			]),
		).toEqual([]);
		const settingOnly = detectIndicators([
			{
				path: ".vscode/settings.json",
				text: '{"task.allowAutomaticTasks": true}',
			},
		]);
		expect(settingOnly.map((i) => i.kind)).toEqual(["auto-tasks-enabled"]);
		expect(shouldHold(settingOnly)).toBe(false);
		// "off" is the safe value the warning recommends.
		expect(
			detectIndicators([
				{
					path: ".vscode/settings.json",
					text: '{"task.allowAutomaticTasks": "off"}',
				},
			]),
		).toEqual([]);
		expect(
			shouldHold([
				{ kind: "autorun-task", path: ".vscode/tasks.json", detail: "" },
			]),
		).toBe(true);
	});

	it("holds on what was read, and never clears past a failed read", () => {
		const autorun = [
			{ kind: "autorun-task" as const, path: ".vscode/tasks.json", detail: "" },
		];
		const settingOnly = [
			{
				kind: "auto-tasks-enabled" as const,
				path: ".vscode/settings.json",
				detail: "",
			},
		];
		expect(checkVerdict(autorun, ["could not read the tree"])).toBe("hold");
		expect(checkVerdict([], ["could not read the tree"])).toBe(
			"could-not-check",
		);
		expect(checkVerdict(settingOnly, ["could not read package.json"])).toBe(
			"could-not-check",
		);
		expect(checkVerdict(settingOnly, [])).toBe("clear");
		expect(checkVerdict([], [])).toBe("clear");
	});
});
