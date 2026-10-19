/**
 * Malware indicators in a repository, read from its files as text and bytes,
 * never run. Pure, so the sweep lane and the tests share one rule.
 *
 * The first campaign this catches (2026-10-18, Stellar Wave repos, matching
 * the "Contagious Interview" technique): a VS Code task that runs when the
 * folder opens, the setting that lets it run without asking, an install hook
 * that runs a hidden script, and a "font" file that is really obfuscated
 * JavaScript, run by the task as a program.
 *
 * Each of those but the last is common in honest repos on its own (watch
 * tasks run on folder open, built packages run `node dist/...` on install),
 * so a repo is held only on the payload: a task or script that runs a font
 * file, or a fake font beside an autorun task or install hook. A held repo
 * is kept out of the repo index's reads, served with a warning when asked
 * for by name, and released when a later check finds the payload gone.
 */

export const INDICATOR_KINDS = [
	"runs-font",
	"fake-font",
	"autorun-task",
	"install-hook",
	"auto-tasks-enabled",
] as const;
export type IndicatorKind = (typeof INDICATOR_KINDS)[number];

export interface Indicator {
	kind: IndicatorKind;
	path: string;
	detail: string;
}

/** What a hold looks like on a stored repo and in what Scout serves. */
export interface SecurityHold {
	indicators: Indicator[];
	/** When the check that found them ran. */
	checkedAt: string;
	/** When the repo was first held for these indicators. */
	heldAt: string;
}

export const FONT_EXT = /\.(woff2?|ttf|otf|eot|llf)$/i;

/** Test fixtures: a project testing its own font guard keeps deliberately
 * invalid fonts there (SaboLabs/soroban-devkit, 2026-10-18). */
const FIXTURE_PATH = /(^|\/)(tests?|__tests__|fixtures?|spec|testdata)\//i;

/** node, any flags, then a font file as the script to run. No font is a
 * program, so this is the payload being started. */
const RUNS_FONT =
	/\bnode(?:\.exe)?(?:\s+-{1,2}[\w-]+(?:=\S+)?)*\s+["']?[^\s"'&|;()]+\.(?:woff2?|ttf|otf|eot|llf)\b/i;

/** npm runs these on install, unasked. */
const LIFECYCLE = [
	"preinstall",
	"install",
	"postinstall",
	"prepublish",
	"preprepare",
	"prepare",
	"postprepare",
	"dependencies",
];

/** A file to read: tasks and settings in .vscode/, package.json at any
 * depth, and anything with a font extension outside test fixtures.
 * Everything else is ignored. */
export function isSecurityRelevant(path: string): boolean {
	return (
		path === ".vscode/tasks.json" ||
		path === ".vscode/settings.json" ||
		/(^|\/)package\.json$/.test(path) ||
		(FONT_EXT.test(path) && !FIXTURE_PATH.test(path))
	);
}

/** JSON with comments and trailing commas (VS Code's settings and tasks).
 * null when it still does not parse. */
export function parseJsonc(text: string): unknown {
	let out = "";
	for (let i = 0, inString = false; i < text.length; i++) {
		const c = text[i];
		if (inString) {
			out += c;
			if (c === "\\") out += text[++i] ?? "";
			else if (c === '"') inString = false;
		} else if (c === '"') {
			inString = true;
			out += c;
		} else if (c === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i++;
			out += "\n";
		} else if (c === "/" && text[i + 1] === "*") {
			const end = text.indexOf("*/", i + 2);
			if (end < 0) break;
			i = end + 1;
		} else out += c;
	}
	try {
		return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
	} catch {
		return null;
	}
}

type Task = Record<string, unknown> & {
	runOptions?: { runOn?: unknown };
};

function tasksOf(text: string): Task[] | null {
	const parsed = parseJsonc(text) as { tasks?: unknown } | null;
	return Array.isArray(parsed?.tasks) ? (parsed.tasks as Task[]) : null;
}

/** The command line a task runs, per platform: command, then args. */
function commandLines(task: Task): string[] {
	const arg = (a: unknown) =>
		typeof a === "string"
			? a
			: typeof (a as { value?: unknown })?.value === "string"
				? String((a as { value: string }).value)
				: "";
	return [task, task.windows, task.osx, task.linux]
		.filter((t): t is Task => !!t && typeof t === "object")
		.map((t) =>
			[t.command, ...(Array.isArray(t.args) ? t.args : [])].map(arg).join(" "),
		);
}

/** A VS Code task set to run on folder open. */
export function hasAutorunTask(text: string): boolean {
	const tasks = tasksOf(text);
	if (!tasks) return /"runOn"\s*:\s*"folderOpen"/.test(text);
	return tasks.some((t) => t?.runOptions?.runOn === "folderOpen");
}

/** A task, any task, whose command runs a font file. */
export function taskRunsFont(text: string): boolean {
	const tasks = tasksOf(text);
	if (!tasks) return RUNS_FONT.test(text);
	return tasks.some((t) => commandLines(t).some((c) => RUNS_FONT.test(c)));
}

/** The workspace setting that runs such tasks without asking. */
export function enablesAutomaticTasks(text: string): boolean {
	const parsed = parseJsonc(text) as Record<string, unknown> | null;
	if (!parsed)
		return /"task\.allowAutomaticTasks"\s*:\s*(true|"on")/.test(text);
	const v = parsed["task.allowAutomaticTasks"];
	return v === true || v === "on";
}

function scriptsOf(text: string): Record<string, unknown> {
	try {
		const scripts = JSON.parse(text)?.scripts;
		return scripts && typeof scripts === "object" ? scripts : {};
	} catch {
		return {};
	}
}

/** An install-time script that runs node on a file kept outside the code:
 * dist/, public/, assets/, fonts/ or .vscode/, or any setup.js. Honest
 * built packages do this too, so alone it never holds a repo. */
export function hiddenInstallHook(text: string): { script: string } | null {
	const scripts = scriptsOf(text);
	for (const script of LIFECYCLE) {
		const command = scripts[script];
		if (typeof command !== "string") continue;
		if (
			/\bnode\s+(\.\/)?(dist|public|assets|fonts|\.vscode)\//i.test(command) ||
			/\bnode\s+\S*setup\.js\b/i.test(command)
		)
			return { script };
	}
	return null;
}

/** A package.json script, any script, that runs a font file. */
export function scriptRunsFont(text: string): string | null {
	for (const [script, command] of Object.entries(scriptsOf(text)))
		if (typeof command === "string" && RUNS_FONT.test(command)) return script;
	return null;
}

/** Whether a file's first bytes are any font format's magic number,
 * whatever its extension says (.otf files with TrueType outlines and
 * misnamed woff files are still fonts). */
export function isRealFont(bytes: Uint8Array): boolean {
	const head = String.fromCharCode(...bytes.slice(0, 4));
	return (
		["wOFF", "wOF2", "OTTO", "true", "typ1", "ttcf"].includes(head) ||
		(bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) ||
		// EOT carries the magic number 0x504C ("LP") at offset 34.
		(bytes.length > 36 && bytes[34] === 0x4c && bytes[35] === 0x50)
	);
}

/** A Git LFS pointer: the font lives in LFS storage, not in these bytes. */
function isLfsPointer(bytes: Uint8Array): boolean {
	return String.fromCharCode(...bytes.slice(0, 40)).startsWith(
		"version https://git-lfs.github.com/spec/",
	);
}

/** A repo path as served: plain path characters only, so a file name
 * cannot carry words into the warning an agent relays. */
function safePath(path: string): string {
	return /^[\w.@+/-]{1,200}$/.test(path)
		? path
		: "(a path with unusual characters)";
}

/** Every indicator in the files read. `text` for JSON files, `bytes` for
 * font files; a file missing its content is skipped, never guessed, and an
 * empty one carries nothing. */
export function detectIndicators(
	files: Array<{ path: string; text?: string; bytes?: Uint8Array }>,
): Indicator[] {
	const out: Indicator[] = [];
	const add = (kind: IndicatorKind, path: string, detail: string) =>
		out.push({ kind, path: safePath(path), detail });
	for (const f of files) {
		if (f.path === ".vscode/tasks.json" && f.text) {
			if (taskRunsFont(f.text))
				add("runs-font", f.path, "a task runs a font file as a program");
			if (hasAutorunTask(f.text))
				add(
					"autorun-task",
					f.path,
					"a task runs automatically when the folder is opened",
				);
		}
		if (
			f.path === ".vscode/settings.json" &&
			f.text &&
			enablesAutomaticTasks(f.text)
		)
			add("auto-tasks-enabled", f.path, "task.allowAutomaticTasks is on");
		if (/(^|\/)package\.json$/.test(f.path) && f.text) {
			const runs = scriptRunsFont(f.text);
			if (runs)
				add(
					"runs-font",
					f.path,
					`the ${safePath(runs)} script runs a font file as a program`,
				);
			const hook = hiddenInstallHook(f.text);
			if (hook)
				add(
					"install-hook",
					f.path,
					`${hook.script} runs a file at install time`,
				);
		}
		if (
			FONT_EXT.test(f.path) &&
			!FIXTURE_PATH.test(f.path) &&
			f.bytes?.length &&
			!isLfsPointer(f.bytes) &&
			!isRealFont(f.bytes)
		)
			add("fake-font", f.path, "a font file whose bytes are not a font");
	}
	return out;
}

/** Hold on the payload: a task or script that runs a font file, or a fake
 * font beside an autorun task or install hook that could start it. A
 * folder-open task, an install hook or the setting alone is common in
 * honest repos, so each is reported beside the payload but never holds. */
export function shouldHold(indicators: Indicator[]): boolean {
	const has = (k: IndicatorKind) => indicators.some((i) => i.kind === k);
	return (
		has("runs-font") ||
		(has("fake-font") && (has("autorun-task") || has("install-hook")))
	);
}

/** What one check's reads support. What was read is evidence enough to
 * hold; clearing a repo needs every read, so a failed one never releases. */
export function checkVerdict(
	indicators: Indicator[],
	gaps: string[],
): "hold" | "clear" | "could-not-check" {
	if (shouldHold(indicators)) return "hold";
	return gaps.length ? "could-not-check" : "clear";
}

/** The warning served with a held repo. */
export function holdNote(hold: SecurityHold): string {
	const where = [...new Set(hold.indicators.map((i) => i.path))].join(", ");
	const when = hold.checkedAt
		? `when checked on ${hold.checkedAt.slice(0, 10)}`
		: "when last checked";
	return `This repo's default branch carried malware ${when} (${where}). Do not open it in VS Code or Cursor and do not run npm install in it. Scout leaves it out of its repo search and listings until a check finds the payload gone.`;
}

/** What trust and explain serve for a repo: its hold, or null when none is
 * on record (not a claim that the repo is safe). */
export function securityOf(doc: {
	securityHeld?: unknown;
	securityHold?: unknown;
}): (SecurityHold & { held: true; note: string }) | null {
	if (doc.securityHeld !== true) return null;
	const h = (doc.securityHold ?? {}) as Partial<SecurityHold>;
	const hold: SecurityHold = {
		indicators: Array.isArray(h.indicators) ? h.indicators : [],
		checkedAt: typeof h.checkedAt === "string" ? h.checkedAt : "",
		heldAt: typeof h.heldAt === "string" ? h.heldAt : "",
	};
	return { held: true, ...hold, note: holdNote(hold) };
}
