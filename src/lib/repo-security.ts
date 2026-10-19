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
 *
 * Every function here takes text an attacker wrote, so none may throw or
 * backtrack: a repo that could stall the sweep would shield every repo after
 * it.
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

/** JSON with comments and trailing commas (VS Code's settings and tasks),
 * a leading byte-order mark dropped. null when it still does not parse. */
export function parseJsonc(text: string): unknown {
	let out = "";
	const src = text.replace(/^\uFEFF/, "");
	for (let i = 0, inString = false; i < src.length; i++) {
		const c = src[i];
		if (inString) {
			out += c;
			if (c === "\\") out += src[++i] ?? "";
			else if (c === '"') inString = false;
		} else if (c === '"') {
			inString = true;
			out += c;
		} else if (c === "/" && src[i + 1] === "/") {
			while (i < src.length && src[i] !== "\n") i++;
			out += "\n";
		} else if (c === "/" && src[i + 1] === "*") {
			const end = src.indexOf("*/", i + 2);
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

const INTERPRETER = /^(node|nodejs|node\.exe|bun)$/i;
const FONT_TOKEN = /\.(?:woff2?|ttf|otf|eot|llf)$/i;
/** node flags whose value is a module it loads, code it runs, or (the
 * rest) any other value: none of these values is the script. */
const MODULE_FLAGS = new Set([
	"-r",
	"--require",
	"--import",
	"--loader",
	"--experimental-loader",
]);
const CODE_FLAGS = new Set(["-e", "--eval", "-p", "--print"]);
const VALUE_FLAGS = new Set([
	"-C",
	"--conditions",
	"--input-type",
	"--title",
	"--env-file",
	"--env-file-if-exists",
	"--watch-path",
	"--disable-warning",
	"--test-reporter",
	"--test-reporter-destination",
]);

/** Whether code names a font file (require("./x.woff2")). Split, not
 * searched, so a long value costs one pass. */
const codeNamesFont = (code: string) =>
	code.split(/[^\w./-]+/).some((p) => FONT_TOKEN.test(p));

/** A command line's segments, split at && || ; | & ( ) and newlines that
 * sit outside quotes. */
function segments(line: string): string[] {
	const out: string[] = [];
	let cur = "";
	let quote = "";
	for (const c of line) {
		if (quote) {
			cur += c;
			if (c === quote) quote = "";
		} else if (c === '"' || c === "'") {
			quote = c;
			cur += c;
		} else if (";|&()\n".includes(c)) {
			out.push(cur);
			cur = "";
		} else cur += c;
	}
	out.push(cur);
	return out;
}

function tokens(line: string): string[] {
	return (line.match(/"[^"]*"|'[^']*'|[^\s"']+/g) ?? []).map((t) =>
		t.replace(/^["']|["']$/g, ""),
	);
}

/** Whether a command line runs a font file with node: as the script, as a
 * module it preloads, from stdin, or named in code given to -e. A font
 * passed as an argument to a script (a font tool) is not run. Linear in the
 * line's length, whatever is in it.
 * ponytail: a node flag outside the sets above that takes its value after a
 * space reads that value as the script; the fake-font branch of shouldHold
 * still sees the font. */
export function runsFont(line: string, depth = 0): boolean {
	for (const segment of segments(line)) {
		const t = tokens(segment);
		const at = t.findIndex((x) =>
			INTERPRETER.test(x.split(/[\\/]/).pop() ?? ""),
		);
		if (at < 0) continue;
		for (let i = at + 1; i < t.length; i++) {
			const x = t[i];
			if (x.startsWith("<")) {
				if (FONT_TOKEN.test(x === "<" ? (t[++i] ?? "") : x.slice(1)))
					return true;
				continue;
			}
			// Output redirects (>/dev/null, 2>) are not the script.
			if (/^\d?>/.test(x)) continue;
			if (x.startsWith("-")) {
				const eq = x.indexOf("=");
				const flag = eq > 0 ? x.slice(0, eq) : x;
				const takes =
					MODULE_FLAGS.has(flag) ||
					CODE_FLAGS.has(flag) ||
					VALUE_FLAGS.has(flag);
				const value = eq > 0 ? x.slice(eq + 1) : takes ? (t[++i] ?? "") : "";
				if (MODULE_FLAGS.has(flag) && FONT_TOKEN.test(value)) return true;
				if (CODE_FLAGS.has(flag) && codeNamesFont(value)) return true;
				continue;
			}
			// The first other token is the script; what follows is its own
			// arguments, not node's.
			if (FONT_TOKEN.test(x)) return true;
			break;
		}
	}
	// A shell running a quoted command: sh -c "node ./x.woff2".
	if (depth < 2)
		for (const m of line.matchAll(/"([^"]*)"|'([^']*)'/g))
			if (runsFont(m[1] ?? m[2] ?? "", depth + 1)) return true;
	return false;
}

type Task = Record<string, unknown> & { runOptions?: { runOn?: unknown } };

const isObject = (x: unknown): x is Record<string, unknown> =>
	!!x && typeof x === "object" && !Array.isArray(x);

function tasksOf(text: string): Task[] | null {
	const parsed = parseJsonc(text);
	if (!isObject(parsed) || !Array.isArray(parsed.tasks)) return null;
	return parsed.tasks.filter(isObject) as Task[];
}

/** VS Code's string forms: a string, an array of strings joined with
 * spaces, or either one under `value`. */
function commandText(x: unknown): string {
	if (typeof x === "string") return x;
	if (Array.isArray(x)) return x.map(commandText).join(" ");
	if (isObject(x)) return commandText(x.value);
	return "";
}

/** The command line a task runs, per platform: command, then args. */
function commandLines(task: Task): string[] {
	return [task, task.windows, task.osx, task.linux]
		.filter(isObject)
		.map((t) =>
			[
				commandText(t.command),
				...(Array.isArray(t.args) ? t.args : []).map(commandText),
			].join(" "),
		);
}

/** A VS Code task set to run on folder open. */
export function hasAutorunTask(text: string): boolean {
	const tasks = tasksOf(text);
	if (!tasks) return /"runOn"\s*:\s*"folderOpen"/.test(text);
	return tasks.some(
		(t) => isObject(t.runOptions) && t.runOptions.runOn === "folderOpen",
	);
}

/** A task, any task, whose command runs a font file. */
export function taskRunsFont(text: string): boolean {
	const tasks = tasksOf(text);
	if (!tasks) return runsFont(text);
	return tasks.some((t) => commandLines(t).some((c) => runsFont(c)));
}

/** The workspace setting that runs such tasks without asking. */
export function enablesAutomaticTasks(text: string): boolean {
	const parsed = parseJsonc(text);
	if (!isObject(parsed))
		return /"task\.allowAutomaticTasks"\s*:\s*(true|"on")/.test(text);
	const v = parsed["task.allowAutomaticTasks"];
	return v === true || v === "on";
}

function scriptsOf(text: string): Record<string, unknown> {
	try {
		const scripts = JSON.parse(text.replace(/^\uFEFF/, ""))?.scripts;
		return isObject(scripts) ? scripts : {};
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
		if (typeof command === "string" && runsFont(command)) return script;
	return null;
}

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u32 = (b: Uint8Array, o: number) =>
	(u16(b, o) * 65536 + u16(b, o + 2)) >>> 0;
const u32le = (b: Uint8Array, o: number) =>
	(b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const SFNT = new Set([0x00010000, 0x4f54544f, 0x74727565, 0x74797031]); // 1.0, OTTO, true, typ1
const TTCF = 0x74746366;

/** Whether a file's first bytes are a font's header, whatever its extension
 * says. Beyond the magic number, each format carries fields no script's
 * text can hold where a font holds them (a NUL byte, or the file's own
 * size), so a file that starts like a font and runs as code fails here.
 * `size`: the file's length, when known. */
export function isRealFont(bytes: Uint8Array, size?: number): boolean {
	if (bytes.length < 12) return false;
	const tag = u32(bytes, 0);
	// TrueType, OpenType, Apple: a table count no script text can spell.
	if (SFNT.has(tag)) {
		const tables = u16(bytes, 4);
		return tables > 0 && tables < 100;
	}
	// A TrueType collection: version 1 or 2.
	if (tag === TTCF) return [0x00010000, 0x00020000].includes(u32(bytes, 4));
	// WOFF and WOFF2: the wrapped font's flavor, and the file's length.
	if (tag === 0x774f4646 || tag === 0x774f4632) {
		const flavor = u32(bytes, 4);
		const length = u32(bytes, 8);
		return (
			(SFNT.has(flavor) || flavor === TTCF) &&
			(size === undefined ? length < 64_000_000 : length === size)
		);
	}
	// EOT: magic number 0x504C ("LP") at offset 34, and its own size first.
	return (
		bytes.length > 36 &&
		bytes[34] === 0x4c &&
		bytes[35] === 0x50 &&
		(size === undefined || u32le(bytes, 0) === size)
	);
}

/** A Git LFS pointer: the font lives in LFS storage, not in these bytes. */
function isLfsPointer(bytes: Uint8Array): boolean {
	return String.fromCharCode(...bytes.slice(0, 40)).startsWith(
		"version https://git-lfs.github.com/spec/",
	);
}

/** A repo path as served: plain path characters only, and short. The note
 * an agent relays names no path at all; these sit in `indicators`. */
function safePath(path: string): string {
	return /^[\w.@+/-]{1,120}$/.test(path)
		? path
		: "(a path with unusual characters)";
}

/** Every indicator in the files read. `text` for JSON files, `bytes` (and
 * the file's `size`, when known) for font files; a file missing its content
 * is skipped, never guessed, and an empty one carries nothing. */
export function detectIndicators(
	files: Array<{
		path: string;
		text?: string;
		bytes?: Uint8Array;
		size?: number;
	}>,
): Indicator[] {
	const out: Indicator[] = [];
	const add = (kind: IndicatorKind, path: string, detail: string) =>
		out.push({ kind, path: safePath(path), detail });
	for (const f of files) {
		const text = f.text?.replace(/^\uFEFF/, "");
		if (f.path === ".vscode/tasks.json" && text) {
			if (taskRunsFont(text))
				add("runs-font", f.path, "a task runs a font file as a program");
			if (hasAutorunTask(text))
				add(
					"autorun-task",
					f.path,
					"a task runs automatically when the folder is opened",
				);
		}
		if (
			f.path === ".vscode/settings.json" &&
			text &&
			enablesAutomaticTasks(text)
		)
			add("auto-tasks-enabled", f.path, "task.allowAutomaticTasks is on");
		if (/(^|\/)package\.json$/.test(f.path) && text) {
			if (scriptRunsFont(text))
				add("runs-font", f.path, "a script runs a font file as a program");
			const hook = hiddenInstallHook(text);
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
			!isRealFont(f.bytes, f.size)
		)
			add("fake-font", f.path, "a font file whose bytes are not a font");
	}
	return out;
}

/** Hold on the payload: a task or script that runs a font file, or a fake
 * font beside an autorun task or install hook that could start it. A
 * folder-open task, an install hook or the setting alone is common in
 * honest repos, so each is reported beside the payload but never holds.
 * ponytail: the second branch pairs any fake font with any trigger in the
 * repo, so a broken font download beside a watch task would hold; the dry
 * run lists every hold for review. */
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

/** The warning served with a held repo: all of it Scout's words, none the
 * repo's (the files found are in `indicators`). */
export function holdNote(hold: SecurityHold): string {
	const when = hold.checkedAt
		? `when checked on ${hold.checkedAt.slice(0, 10)}`
		: "when last checked";
	return `This repo's default branch carried malware ${when}. Do not open it in VS Code or Cursor and do not run npm install in it. Scout leaves it out of its repo search and listings until a check finds the payload gone.`;
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
