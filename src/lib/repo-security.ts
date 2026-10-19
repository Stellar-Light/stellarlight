/**
 * Malware indicators in a repository, read from its files as text and bytes,
 * never run. Pure, so the sweep lane and the tests share one rule.
 *
 * The first campaign this catches (2026-10-18, Stellar Wave repos, matching
 * the "Contagious Interview" technique): a VS Code task that runs when the
 * folder opens, the setting that lets it run without asking, an install hook
 * that runs a hidden script, and a "font" file that is really obfuscated
 * JavaScript. A repo with any indicator is held: kept out of everything Scout
 * surfaces, served with a warning when asked for by name, and released when
 * a later check finds none.
 */

export const INDICATOR_KINDS = [
	"autorun-task",
	"auto-tasks-enabled",
	"install-hook",
	"fake-font",
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

export const FONT_EXT = /\.(woff2?|ttf|otf|eot|llf)$/i;

/** Test fixtures: a project testing its own font guard keeps deliberately
 * invalid fonts there (SaboLabs/soroban-devkit, 2026-10-18). */
const FIXTURE_PATH = /(^|\/)(tests?|__tests__|fixtures?|spec|testdata)\//i;

/** A VS Code task set to run on folder open. */
export function hasAutorunTask(text: string): boolean {
	return /"runOn"\s*:\s*"folderOpen"/.test(text);
}

/** The workspace setting that runs such tasks without asking. */
export function enablesAutomaticTasks(text: string): boolean {
	return /"task\.allowAutomaticTasks"\s*:\s*(true|"on")/.test(text);
}

/** An install-time script that runs node on a file kept outside the code:
 * dist/, public/, assets/, fonts/ or .vscode/, or any setup.js. */
export function hiddenInstallHook(
	text: string,
): { script: string; command: string } | null {
	let scripts: Record<string, unknown> = {};
	try {
		scripts = JSON.parse(text)?.scripts ?? {};
	} catch {
		return null;
	}
	for (const script of ["preinstall", "install", "postinstall", "prepare"]) {
		const command = scripts[script];
		if (typeof command !== "string") continue;
		if (
			/\bnode\s+(\.\/)?(dist|public|assets|fonts|\.vscode)\//i.test(command) ||
			/\bnode\s+\S*setup\.js\b/i.test(command)
		)
			return { script, command };
	}
	return null;
}

/** Whether a file with a font extension starts like the font it claims to
 * be. .llf is no font format at all. */
export function isRealFont(path: string, bytes: Uint8Array): boolean {
	const ext = path.toLowerCase().split(".").pop();
	const ascii = (from: number, n: number) =>
		String.fromCharCode(...bytes.slice(from, from + n));
	switch (ext) {
		case "woff2":
			return ascii(0, 4) === "wOF2";
		case "woff":
			return ascii(0, 4) === "wOFF";
		case "otf":
			return ascii(0, 4) === "OTTO";
		case "ttf":
			return (
				(bytes[0] === 0 &&
					bytes[1] === 1 &&
					bytes[2] === 0 &&
					bytes[3] === 0) ||
				ascii(0, 4) === "true" ||
				ascii(0, 4) === "ttcf"
			);
		case "eot":
			// EOT carries the magic number 0x504C ("LP") at offset 34.
			return bytes.length > 36 && bytes[34] === 0x4c && bytes[35] === 0x50;
		default:
			return false;
	}
}

/** Every indicator in the files read. `text` for JSON files, `bytes` for
 * font files; a file missing its content is skipped, never guessed, and an
 * empty one carries nothing. */
export function detectIndicators(
	files: Array<{ path: string; text?: string; bytes?: Uint8Array }>,
): Indicator[] {
	const out: Indicator[] = [];
	for (const f of files) {
		if (f.path === ".vscode/tasks.json" && f.text && hasAutorunTask(f.text))
			out.push({
				kind: "autorun-task",
				path: f.path,
				detail: "a task runs automatically when the folder is opened",
			});
		if (
			f.path === ".vscode/settings.json" &&
			f.text &&
			enablesAutomaticTasks(f.text)
		)
			out.push({
				kind: "auto-tasks-enabled",
				path: f.path,
				detail: "task.allowAutomaticTasks is on",
			});
		if (/(^|\/)package\.json$/.test(f.path) && f.text) {
			const hook = hiddenInstallHook(f.text);
			if (hook)
				out.push({
					kind: "install-hook",
					path: f.path,
					detail: `${hook.script} runs "${hook.command}"`,
				});
		}
		if (
			FONT_EXT.test(f.path) &&
			!FIXTURE_PATH.test(f.path) &&
			f.bytes?.length &&
			!isRealFont(f.path, f.bytes)
		)
			out.push({
				kind: "fake-font",
				path: f.path,
				detail: "a font file whose bytes are not a font",
			});
	}
	return out;
}

/** Hold on a way to run (an autorun task, a hidden install hook) or a
 * staged payload (a fake font). The setting alone runs nothing, so it is
 * reported beside them but never holds a repo by itself. */
export function shouldHold(indicators: Indicator[]): boolean {
	return indicators.some((i) => i.kind !== "auto-tasks-enabled");
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
	return `This repo's default branch carried malware indicators ${when} (${where}). Do not open it in VS Code or Cursor and do not run npm install in it. Scout keeps it out of every recommendation until a check finds the files gone.`;
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
