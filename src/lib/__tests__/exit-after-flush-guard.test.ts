// @vitest-environment node
/**
 * process.exit drops whatever stdout and stderr still hold for a pipe whose
 * reader is slower than the writer. Under GitHub Actions a dry run printed
 * part of its plan, no summary, and still exited 0 (import-curated-builds
 * 2026-11-07, refresh-token-integrations 2026-11-24), so a step that read
 * the plan read a cut log. A script exits through exitAfterFlush
 * (scripts/lib/exit-after-flush.ts), which waits for both streams.
 *
 * What it flags, in scripts/**\/*.ts:
 *  1. process.exit(...) whose argument is anything but a nonzero number
 *     literal: process.exit(), process.exit(0), process.exit(code). Only
 *     an exit that can report success can pass a cut log off as green; a
 *     literal nonzero exit fails the step. A file listed in ALLOWED keeps
 *     exactly its count, with a reason, so a stale entry fails too.
 *  2. exitAfterFlush(...) that the script can run past. It returns, unlike
 *     process.exit, so a dry run would fall through into its writes. It is
 *     accepted only returned, or last, in a function whose end ends the
 *     script (see exitSites). Aliases, renamed and namespace imports count
 *     as the same call; passing it as a value is flagged.
 *
 * What it cannot see: process.exit reached by another name; a flush
 * reached through a function called from another file.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/** file -> [bare exits it keeps, exactly, and why]. */
const ALLOWED: Record<string, [number, string]> = {
	"scripts/lib/exit-after-flush.ts": [
		1,
		"the helper's own exit, after the flush",
	],
	"scripts/lanes/repair-lane.ts": [
		4,
		"module-level subcommands: each prints one status line and exits; the result is the file it wrote",
	],
	"scripts/lanes/task-lane.ts": [
		5,
		"module-level subcommands: each prints one line (task-for's is read by the workflow) and exits",
	],
	"scripts/scan/depth-eval.ts": [
		1,
		"skipForBudget is a never-returning exit called mid-run (from preflightBudget); its notice is a short stderr write",
	],
	"scripts/check-no-dashes.ts": [
		1,
		"module level: --check prints its one ok line and exits",
	],
	"scripts/check-scripts-types.ts": [
		1,
		"module level: --update prints one line after writing the baseline file",
	],
	"scripts/eval/scf-rounds-guard.ts": [
		1,
		"module level: no report to read, one line, before any other output",
	],
	"scripts/data/award-voters-from-scf.ts": [
		1,
		"module level, local only: a few stderr lines, then a hint to pass --round",
	],
	"scripts/ingest-ec-developer-report.ts": [
		1,
		"module level: the offline id self-check prints a dozen lines and exits",
	],
	"scripts/ingest-soroban-security.ts": [
		1,
		"module level: the offline --test self-check prints two lines and exits",
	],
};

const isExit = (n: ts.Node): n is ts.CallExpression =>
	ts.isCallExpression(n) && n.expression.getText() === "process.exit";
const failsOnly = (c: ts.CallExpression) =>
	c.arguments.length === 1 &&
	ts.isNumericLiteral(c.arguments[0]) &&
	Number(c.arguments[0].text) !== 0;

const strip = (e: ts.Expression): ts.Expression =>
	ts.isParenthesizedExpression(e) ||
	ts.isAwaitExpression(e) ||
	ts.isVoidExpression(e) ||
	ts.isAsExpression(e) ||
	ts.isNonNullExpression(e)
		? strip(e.expression)
		: e;
const isFn = (
	n: ts.Node,
): n is ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration =>
	ts.isArrowFunction(n) ||
	ts.isFunctionExpression(n) ||
	ts.isFunctionDeclaration(n);
/** The last statement a block or module runs (declarations run first). */
const lastRun = (sts: readonly ts.Statement[]) =>
	sts
		.filter(
			(s) =>
				!ts.isFunctionDeclaration(s) &&
				!ts.isTypeAliasDeclaration(s) &&
				!ts.isInterfaceDeclaration(s) &&
				!ts.isImportDeclaration(s) &&
				!ts.isExportDeclaration(s) &&
				!ts.isEmptyStatement(s),
		)
		.at(-1);
/** The expressions that finish `st` when it is the last statement run. A
 * try with a finally is never last: the finally runs after it. */
const tails = (st: ts.Statement | undefined): ts.Expression[] =>
	!st
		? []
		: ts.isExpressionStatement(st)
			? [st.expression]
			: ts.isReturnStatement(st)
				? st.expression
					? [st.expression]
					: []
				: ts.isIfStatement(st)
					? [...tails(st.thenStatement), ...tails(st.elseStatement)]
					: ts.isBlock(st)
						? tails(lastRun(st.statements))
						: ts.isTryStatement(st) && !st.finallyBlock
							? [...tails(st.tryBlock), ...tails(st.catchClause?.block)]
							: [];

/** Lines of the bare exits (1) and the flushes the script can run past (2).
 *
 * A flush ends the script only when it is returned, or is the last thing
 * run, in a function whose own end ends the script: a callback of the
 * module's last `x().then/.catch/.finally` chain, an IIFE that is the
 * module's last statement, or a module-level function whose only call is
 * one of those or is itself returned or last in such a function. */
function exitSites(fileName: string, text: string) {
	const src = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
	const line = (n: ts.Node) =>
		src.getLineAndCharacterOfPosition(n.getStart()).line + 1;
	const all: ts.Node[] = [];
	const collect = (n: ts.Node) => {
		all.push(n);
		ts.forEachChild(n, collect);
	};
	collect(src);

	// Every name exitAfterFlush is reached by: the import (also renamed), a
	// namespace import (ns.exitAfterFlush) and const aliases of either.
	const names = new Set(["exitAfterFlush"]);
	for (const n of all)
		if (
			ts.isImportSpecifier(n) &&
			(n.propertyName ?? n.name).text === "exitAfterFlush"
		)
			names.add(n.name.text);
	const isFlush = (e: ts.Expression): boolean => {
		const x = strip(e);
		return ts.isIdentifier(x)
			? names.has(x.text)
			: ts.isPropertyAccessExpression(x) && x.name.text === "exitAfterFlush";
	};
	for (let grew = true; grew; ) {
		grew = false;
		for (const n of all)
			if (
				ts.isVariableDeclaration(n) &&
				ts.isIdentifier(n.name) &&
				!names.has(n.name.text) &&
				n.initializer &&
				isFlush(n.initializer)
			) {
				names.add(n.name.text);
				grew = true;
			}
	}

	// Module-level functions by name, and how often each name is called.
	const decls = new Map<string, ts.Node>();
	for (const st of src.statements) {
		if (ts.isFunctionDeclaration(st) && st.name) decls.set(st.name.text, st);
		if (ts.isVariableStatement(st))
			for (const d of st.declarationList.declarations)
				if (
					ts.isIdentifier(d.name) &&
					d.initializer &&
					isFn(strip(d.initializer))
				)
					decls.set(d.name.text, strip(d.initializer));
	}
	const calls = new Map<string, number>();
	for (const n of all)
		if (ts.isCallExpression(n) && ts.isIdentifier(n.expression))
			calls.set(n.expression.text, (calls.get(n.expression.text) ?? 0) + 1);

	const ends = new Set<ts.Node>(); // expressions after which the script ends
	const entered = new Set<ts.Node>();
	const end = (e: ts.Expression) => {
		const x = strip(e);
		if (ends.has(x)) return;
		ends.add(x);
		if (!ts.isCallExpression(x)) return;
		const callee = strip(x.expression);
		if (
			ts.isPropertyAccessExpression(callee) &&
			["then", "catch", "finally"].includes(callee.name.text)
		) {
			end(callee.expression);
			for (const a of x.arguments) enter(strip(a));
		} else if (isFn(callee)) enter(callee);
		else if (ts.isIdentifier(callee) && calls.get(callee.text) === 1) {
			const f = decls.get(callee.text);
			if (f) enter(f);
		}
	};
	const enter = (f: ts.Node) => {
		if (!isFn(f) || !f.body || entered.has(f)) return;
		entered.add(f);
		if (!ts.isBlock(f.body)) return end(f.body);
		for (const e of tails(lastRun(f.body.statements))) end(e);
		// A return ends the function wherever it sits (`x(); return;` too),
		// except under a try whose finally runs after it.
		const returns = (n: ts.Node) => {
			if (isFn(n) || ts.isFunctionLike(n)) return;
			if (ts.isTryStatement(n) && n.finallyBlock) return;
			if (ts.isReturnStatement(n)) {
				if (n.expression) end(n.expression);
				else if (ts.isBlock(n.parent)) {
					const sts = n.parent.statements;
					const prev = sts[sts.indexOf(n) - 1];
					if (prev && ts.isExpressionStatement(prev)) end(prev.expression);
				}
			}
			ts.forEachChild(n, returns);
		};
		ts.forEachChild(f.body, returns);
	};
	for (const e of tails(lastRun(src.statements))) end(e);

	const bare: number[] = [];
	const fallThrough: number[] = [];
	for (const n of all) {
		if (isExit(n) && !failsOnly(n)) bare.push(line(n));
		if (ts.isCallExpression(n) && isFlush(n.expression) && !ends.has(n))
			fallThrough.push(line(n));
		// passed as a value (`.then(exitAfterFlush)`), it runs where no one looks
		if (
			ts.isIdentifier(n) &&
			names.has(n.text) &&
			!(ts.isCallExpression(n.parent) && n.parent.expression === n) &&
			!(
				ts.isVariableDeclaration(n.parent) &&
				(n.parent.name === n || n.parent.initializer === n)
			) &&
			!ts.isImportSpecifier(n.parent) &&
			!(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) &&
			!ts.isFunctionDeclaration(n.parent)
		)
			fallThrough.push(line(n));
	}
	return { bare, fallThrough };
}

describe("exitSites", () => {
	it("flags an exit that can report success, not one that always fails", () => {
		const { bare } = exitSites(
			"x.ts",
			[
				"main().then(() => process.exit(0));",
				"main().then((c) => process.exit(c));",
				"process.exit(process.exitCode ?? 0);",
				"process.exit();",
				"main().catch(() => process.exit(1));",
				"if (!key) process.exit(2);",
			].join("\n"),
		);
		expect(bare).toEqual([1, 2, 3, 4]);
	});
	it("flags a flush a dry run would fall through, not a final or returned one", () => {
		const { fallThrough } = exitSites(
			"x.ts",
			`async function main() {
				if (!EXECUTE) {
					exitAfterFlush(0);
				}
				await write();
				if (done) return exitAfterFlush(0);
				exitAfterFlush(process.exitCode ?? 0);
			}
			main().then(() => exitAfterFlush(0));`,
		);
		expect(fallThrough).toEqual([3]);
	});

	// The shapes scripts/ ends in today.
	const ENDS: Record<string, string> = {
		"a returned dry-run gate and a last exit in main": `
			async function main() {
				if (!EXECUTE) return exitAfterFlush(process.exitCode ?? 0);
				await write();
				exitAfterFlush(process.exitCode ?? 0);
			}
			main().catch((e) => {
				console.error(e);
				process.exit(1);
			});`,
		"a .then/.catch chain, an exit then a bare return": `
			main()
				.then(() => exitAfterFlush(process.exitCode ?? 0))
				.catch((e) => {
					if (e instanceof Broken) {
						exitAfterFlush(2);
						return;
					}
					exitAfterFlush(1);
				});`,
		"main behind an argv check, ending in the helpers it returns or ends on": `
			async function verify() {
				await read();
				exitAfterFlush(0);
			}
			async function voters() {
				if (!EXECUTE) return exitAfterFlush(0);
				await write();
			}
			const nominees = async () => {
				await write();
				exitAfterFlush(0);
			};
			async function main() {
				if (VERIFY) return verify();
				if (KIND === "voters") await voters();
				else await nominees();
			}
			if (process.argv[1]?.includes("x")) main();`,
		"an IIFE that is the module's last statement": `
			(async () => {
				await run();
				exitAfterFlush(failures ? 1 : 0);
			})();`,
		"the module's last statement": `
			console.log("done");
			exitAfterFlush(failures ? 1 : 0);
			export {};`,
	};
	it.each(Object.entries(ENDS))("accepts %s", (_, code) => {
		expect(exitSites("x.ts", code).fallThrough).toEqual([]);
	});

	// Dry-run gates the first version of this guard let through: in each the
	// exit returns and the writes after it still run.
	const FALLS_THROUGH: Record<string, string> = {
		"inside rows.forEach, then writes": `
			async function main() {
				rows.forEach((r) => exitAfterFlush(r.ok ? 0 : 1));
				await write();
			}
			main();`,
		"inside a .then callback within main, then writes": `
			async function main() {
				check().then((bad) => {
					if (bad) return exitAfterFlush(1);
				});
				await write();
			}
			main();`,
		"in a setTimeout callback, then writes": `
			async function main() {
				if (!EXECUTE) setTimeout(() => exitAfterFlush(0));
				await write();
			}
			main();`,
		"in an async IIFE followed by module code": `
			(async () => {
				exitAfterFlush(0);
			})();
			await write();`,
		"returned from a usage() helper whose caller goes on": `
			function usage() {
				console.error("usage: x <file>");
				return exitAfterFlush(2);
			}
			async function main() {
				if (!arg) usage();
				await write();
			}
			main();`,
		"inside a try whose finally writes": `
			async function main() {
				try {
					exitAfterFlush(0);
				} finally {
					await write();
				}
			}
			main();`,
		"returned inside xs.map(async ...)": `
			async function main() {
				await Promise.all(
					xs.map(async (x) => {
						if (!x) return exitAfterFlush(0);
						await write(x);
					}),
				);
			}
			main();`,
		"through an alias": `
			const bail = exitAfterFlush;
			async function main() {
				if (!EXECUTE) bail(0);
				await write();
			}
			main();`,
		"through a renamed import": `
			import { exitAfterFlush as done } from "./lib/exit-after-flush";
			async function main() {
				if (!EXECUTE) done(0);
				await write();
			}
			main();`,
		"passed as a value": `
			async function main() {
				rows.forEach(exitAfterFlush);
				await write();
			}
			main();`,
		"through a namespace import": `
			import * as f from "./lib/exit-after-flush";
			async function main() {
				if (!EXECUTE) f.exitAfterFlush(0);
				await write();
			}
			main();`,
	};
	it.each(Object.entries(FALLS_THROUGH))("flags an exit %s", (_, code) => {
		expect(exitSites("x.ts", code).fallThrough).not.toEqual([]);
	});
});

// vitest runs from the repository root
const ROOT = process.cwd();
const scripts = (dir: string): string[] =>
	readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory()
			? scripts(path)
			: name.endsWith(".ts")
				? [path]
				: [];
	});

describe("scripts/ exit only after stdout and stderr flush", () => {
	const files = scripts(join(ROOT, "scripts")).map((path) => ({
		file: relative(ROOT, path).split(sep).join("/"),
		...exitSites(path, readFileSync(path, "utf8")),
	}));

	it("reads the scripts (not vacuously green)", () => {
		expect(files.length).toBeGreaterThan(200);
		expect(files.some((f) => f.bare.length)).toBe(true);
	});

	it("a listed file keeps exactly its count of bare exits; no other file has one", () => {
		const found = new Map(files.map((f) => [f.file, f.bare.length]));
		const wrong = [...new Set([...found.keys(), ...Object.keys(ALLOWED)])]
			.filter((f) => (found.get(f) ?? 0) !== (ALLOWED[f]?.[0] ?? 0))
			.map(
				(f) =>
					`${f}: ${found.get(f) ?? 0} bare, ${ALLOWED[f]?.[0] ?? 0} listed`,
			);
		expect(wrong).toEqual([]);
	});

	it("no exitAfterFlush the script can run past", () => {
		const bad = files
			.filter((f) => f.fallThrough.length)
			.map((f) => `${f.file}:${f.fallThrough.join(",")}`);
		expect(bad).toEqual([]);
	});
});
