/**
 * Raven's exposure policy, read from its source files with the TypeScript
 * parser instead of a pattern over the text: comments are not text to it, and
 * each declaration must exist once, be const, never be changed later in the
 * file, and be a plain literal (a string, a regex, an array, an object of
 * arrays, a new Map or Set over an array). A file that does not parse, or a
 * declaration that breaks any of these, throws with the file and the name, so
 * a policy that was not fully read never passes as the whole policy. Shared by
 * the gate replica (scripts/eval/raven-gate-replica.ts) and the catalog drift
 * guard (scripts/check-raven-drift.ts).
 */
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import ts from "typescript";

export const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");

/** True only when moduleUrl is the script node was started with. */
export function isEntry(moduleUrl: string): boolean {
	try {
		return (
			moduleUrl === pathToFileURL(realpathSync(process.argv[1] ?? "")).href
		);
	} catch {
		return false;
	}
}

/** Methods that change a Map, Set or array in place. */
const MUTATORS = new Set([
	"set",
	"add",
	"delete",
	"clear",
	"push",
	"pop",
	"shift",
	"unshift",
	"splice",
	"sort",
	"reverse",
	"fill",
	"copyWithin",
]);

export function policyReader(file: string, text: string) {
	function fail(name: string, why: string): never {
		throw new Error(
			`${file}: ${name} ${why}; Raven's source layout changed, update scripts/eval/raven-policy.ts`,
		);
	}
	// A truncated file still parses to a tree, one literal shorter.
	const { diagnostics = [] } = ts.transpileModule(text, {
		fileName: file,
		reportDiagnostics: true,
	});
	if (diagnostics.length)
		throw new Error(
			`${file}: does not parse (${ts.flattenDiagnosticMessageText(diagnostics[0]?.messageText ?? "", " ")}); Raven's source layout changed, update scripts/eval/raven-policy.ts`,
		);
	const source = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
	);
	const member = (e: ts.Node) =>
		ts.isPropertyAccessExpression(e)
			? e.name.text
			: ts.isElementAccessExpression(e) &&
					ts.isStringLiteralLike(e.argumentExpression)
				? e.argumentExpression.text
				: "";
	/** How the file changes `name` after declaring it, if it does. */
	const change = (name: string): string | null => {
		let found: string | null = null;
		const visit = (node: ts.Node): void => {
			if (found) return;
			if (ts.isIdentifier(node) && node.text === name) {
				let top: ts.Node = node;
				while (
					(ts.isPropertyAccessExpression(top.parent) ||
						ts.isElementAccessExpression(top.parent)) &&
					top.parent.expression === top
				)
					top = top.parent;
				const p = top.parent;
				if (
					ts.isBinaryExpression(p) &&
					p.left === top &&
					p.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
					p.operatorToken.kind <= ts.SyntaxKind.LastAssignment
				)
					found = "is assigned to";
				else if (ts.isDeleteExpression(p)) found = "has a member deleted";
				else if (
					(ts.isPrefixUnaryExpression(p) || ts.isPostfixUnaryExpression(p)) &&
					(p.operator === ts.SyntaxKind.PlusPlusToken ||
						p.operator === ts.SyntaxKind.MinusMinusToken)
				)
					found = "is incremented";
				else if (
					ts.isCallExpression(p) &&
					p.expression === top &&
					top !== node &&
					MUTATORS.has(member(top))
				)
					found = `is changed by .${member(top)}()`;
				else if (
					ts.isCallExpression(p) &&
					p.arguments[0] === top &&
					ts.isPropertyAccessExpression(p.expression) &&
					ts.isIdentifier(p.expression.expression) &&
					["Object", "Reflect"].includes(p.expression.expression.text) &&
					[
						"assign",
						"defineProperty",
						"defineProperties",
						"deleteProperty",
						"set",
						"setPrototypeOf",
					].includes(p.expression.name.text)
				)
					found = `is changed by ${p.expression.expression.text}.${p.expression.name.text}()`;
			}
			ts.forEachChild(node, visit);
		};
		visit(source);
		return found;
	};
	const init = (name: string): ts.Expression => {
		const found = source.statements
			.filter(ts.isVariableStatement)
			.flatMap((s) =>
				s.declarationList.declarations
					.filter((d) => ts.isIdentifier(d.name) && d.name.text === name)
					.map((d) => ({
						d,
						isConst: !!(s.declarationList.flags & ts.NodeFlags.Const),
					})),
			);
		if (found.length > 1) fail(name, "is declared more than once");
		let e = found[0]?.d.initializer;
		if (!e) return fail(name, "is not declared with a value");
		if (!found[0]?.isConst) fail(name, "is not declared const");
		const changed = change(name);
		if (changed) fail(name, changed);
		while (
			ts.isParenthesizedExpression(e) ||
			ts.isAsExpression(e) ||
			ts.isSatisfiesExpression(e)
		)
			e = e.expression;
		return e;
	};
	const str = (name: string, e: ts.Node | undefined): string =>
		e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e))
			? e.text
			: fail(name, "holds a value that is not a string literal");
	const items = (name: string, e: ts.Node | undefined): ts.Expression[] =>
		e && ts.isArrayLiteralExpression(e) && !e.elements.some(ts.isSpreadElement)
			? [...e.elements]
			: fail(name, "holds a value that is not an array literal");
	const built = (name: string, ctor: "Map" | "Set"): ts.Expression[] => {
		const e = init(name);
		if (
			!ts.isNewExpression(e) ||
			!ts.isIdentifier(e.expression) ||
			e.expression.text !== ctor ||
			(e.arguments?.length ?? 0) > 1
		)
			return fail(name, `is not a new ${ctor}(...) over a literal`);
		const arg = e.arguments?.[0];
		return arg ? items(name, arg) : [];
	};
	return {
		map: (name: string) =>
			new Map(
				built(name, "Map").map((pair) => {
					const kv = items(name, pair);
					if (kv.length !== 2)
						fail(name, "holds an entry that is not a [key, value] pair");
					return [str(name, kv[0]), str(name, kv[1])] as const;
				}),
			),
		set: (name: string) => new Set(built(name, "Set").map((s) => str(name, s))),
		record: (name: string) => {
			const e = init(name);
			if (!ts.isObjectLiteralExpression(e))
				return fail(name, "is not an object literal");
			const out: Record<string, string[]> = {};
			for (const p of e.properties) {
				if (
					!ts.isPropertyAssignment(p) ||
					!(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
				)
					return fail(name, "holds a property that is not key: [strings]");
				out[p.name.text] = items(name, p.initializer).map((s) => str(name, s));
			}
			return out;
		},
		regex: (name: string) => {
			const e = init(name);
			if (!ts.isRegularExpressionLiteral(e))
				return fail(name, "is not a regex literal");
			const end = e.text.lastIndexOf("/");
			return new RegExp(e.text.slice(1, end), e.text.slice(end + 1));
		},
	};
}

/** src/policy/scout-exposure.ts: Raven's reviewed Scout exclusions. */
export function scoutExposure(text: string) {
	const read = policyReader("src/policy/scout-exposure.ts", text);
	return {
		excluded: read.map("EXCLUDED_SCOUT_OPERATIONS"),
		optionalExcluded: read.map("OPTIONAL_EXCLUDED_SCOUT_OPERATIONS"),
		absentPaths: read.set("SCOUT_PATHS_ABSENT_FROM_SPEC"),
	};
}
