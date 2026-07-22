/**
 * Route-export guard — a Next.js App Router `route.ts` may export ONLY HTTP
 * method handlers and route-segment config. Any other VALUE export (a helper
 * function, a plain const, a class, a default) makes `next build` fail with
 *   "Route <file> does not match the required types of a Next.js Route."
 *
 * That failure is invisible to the two checks that DO run at PR time: `tsc
 * --noEmit` type-checks fine and `vitest` runs fine — the route-type contract
 * is enforced only by `next build`, which happens on Vercel AFTER merge. So a
 * PR can be green, merge, and silently freeze production deploys for everyone
 * (the 2026-07-21 incident: an exported `isHandleQuery` / `codeDerivedBuilderRow`
 * in api/builders/route.ts, exported so a test could import them, blocked ~4
 * merged PRs from deploying until the helpers were moved to a lib).
 *
 * This guard reproduces `next build`'s route-export rule statically, at PR
 * time, so the class can't reach main again. Exports of TYPES/interfaces are
 * allowed — they're erased before runtime and don't break the build; the fix
 * for a flagged value export is to move it (and any test import) to a `lib/`
 * module and import it back into the route.
 *
 *   pnpm exec tsx scripts/eval/route-exports-check.ts
 *
 * No DB / network / build needed — pure source parse. Wired into
 * .github/workflows/contract-gate.yml (the "contract" PR check).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

// The complete set of names Next.js App Router accepts as exports from a
// route handler file: the HTTP method handlers plus the route-segment config
// options. Anything else is a build-breaking export.
// https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
const ALLOWED_EXPORTS = new Set([
	// HTTP method handlers
	"GET",
	"HEAD",
	"POST",
	"PUT",
	"DELETE",
	"PATCH",
	"OPTIONS",
	// Route Segment Config
	"dynamic",
	"dynamicParams",
	"revalidate",
	"fetchCache",
	"runtime",
	"preferredRegion",
	"maxDuration",
	"generateStaticParams",
]);

const APP_DIR = join(process.cwd(), "src", "app");

interface Violation {
	file: string;
	line: number;
	name: string;
	kind: string;
}

/** Every `route.ts` / `route.tsx` under src/app. */
function findRouteFiles(dir: string): string[] {
	const out: string[] = [];
	let entries: string[];
	try {
		entries = readdirSync(dir);
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...findRouteFiles(full));
		} else if (entry === "route.ts" || entry === "route.tsx") {
			out.push(full);
		}
	}
	return out;
}

function hasExportModifier(node: ts.Node): boolean {
	return (
		ts.canHaveModifiers(node) &&
		(ts.getModifiers(node) ?? []).some(
			(m) => m.kind === ts.SyntaxKind.ExportKeyword,
		)
	);
}

function isAmbient(node: ts.Node): boolean {
	return (
		ts.canHaveModifiers(node) &&
		(ts.getModifiers(node) ?? []).some(
			(m) => m.kind === ts.SyntaxKind.DeclareKeyword,
		)
	);
}

function checkFile(file: string): Violation[] {
	const src = readFileSync(file, "utf8");
	const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true);
	const violations: Violation[] = [];
	const flag = (node: ts.Node, name: string, kind: string) => {
		if (ALLOWED_EXPORTS.has(name)) return;
		const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
		violations.push({ file, line: line + 1, name, kind });
	};

	for (const stmt of sf.statements) {
		// `export function foo() {}` / `export async function GET() {}`
		if (
			ts.isFunctionDeclaration(stmt) &&
			hasExportModifier(stmt) &&
			stmt.name
		) {
			flag(stmt, stmt.name.text, "function");
		}
		// `export const X = ...`, `export let X`, `export var X`
		else if (ts.isVariableStatement(stmt) && hasExportModifier(stmt)) {
			for (const decl of stmt.declarationList.declarations) {
				if (ts.isIdentifier(decl.name)) {
					flag(stmt, decl.name.text, "const");
				} else {
					// A destructuring export can never be an allowed handler name.
					flag(
						stmt,
						sf.text.slice(decl.name.pos, decl.name.end).trim(),
						"const",
					);
				}
			}
		}
		// `export class Foo {}` — no allowed class export exists
		else if (ts.isClassDeclaration(stmt) && hasExportModifier(stmt)) {
			flag(stmt, stmt.name?.text ?? "(anonymous)", "class");
		}
		// `export default X` / `export = X` — route files must not default-export
		else if (ts.isExportAssignment(stmt)) {
			const { line } = sf.getLineAndCharacterOfPosition(stmt.getStart(sf));
			violations.push({
				file,
				line: line + 1,
				name: stmt.isExportEquals ? "export =" : "default",
				kind: "default-export",
			});
		}
		// `export { a, b as GET, type C }` — re-exported VALUE bindings count;
		// type-only specifiers are erased and safe.
		else if (
			ts.isExportDeclaration(stmt) &&
			stmt.exportClause &&
			ts.isNamedExports(stmt.exportClause)
		) {
			if (stmt.isTypeOnly) continue; // `export type { ... }`
			// Bare `export * from` has no exportClause and is skipped above.
			if (isAmbient(stmt)) continue;
			for (const spec of stmt.exportClause.elements) {
				if (spec.isTypeOnly) continue; // `export { type Foo }`
				// The name as EXPORTED (after `as`) is what Next validates.
				flag(spec, spec.name.text, "re-export");
			}
		}
	}
	return violations;
}

const routeFiles = findRouteFiles(APP_DIR);
const allViolations: Violation[] = [];
for (const f of routeFiles) allViolations.push(...checkFile(f));

const rel = (p: string) => p.replace(`${process.cwd()}/`, "");

if (allViolations.length > 0) {
	console.error(
		`\n✗ route-export guard: ${allViolations.length} disallowed export(s) from route handler file(s).\n`,
	);
	console.error(
		"  A Next.js route.ts may export ONLY: GET/HEAD/POST/PUT/DELETE/PATCH/OPTIONS\n" +
			"  and route-segment config (dynamic, revalidate, runtime, maxDuration, …).\n" +
			"  Anything else breaks `next build` on Vercel AFTER merge (tsc/vitest miss it).\n" +
			"  Fix: move the helper/const/type into a src/lib/*.ts module and import it\n" +
			"  back into the route (update any test import to point at the lib).\n",
	);
	for (const v of allViolations) {
		console.error(
			`  ✗ ${rel(v.file)}:${v.line}  exports ${v.kind} \`${v.name}\``,
		);
	}
	console.error("");
	process.exit(1);
}

console.log(
	`✓ route-export guard: ${routeFiles.length} route file(s) export only handlers + route config.`,
);
