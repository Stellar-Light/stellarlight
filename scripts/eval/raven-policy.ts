/**
 * Raven's exposure policy, read from its source files with the TypeScript
 * parser instead of a pattern over the text: comments are not text to it, and
 * each declaration must exist once and be a plain literal (a string, a regex,
 * an array, an object of arrays, a new Map or Set over an array). Anything
 * else throws with the file and the name, so a policy that was not fully read
 * never passes as the whole policy. Shared by the gate replica
 * (scripts/eval/raven-gate-replica.ts) and the catalog drift guard
 * (scripts/check-raven-drift.ts).
 */
import ts from "typescript";

export function policyReader(file: string, text: string) {
	const source = ts.createSourceFile(
		file,
		text,
		ts.ScriptTarget.Latest,
		true,
		file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
	);
	function fail(name: string, why: string): never {
		throw new Error(
			`${file}: ${name} ${why}; Raven's source layout changed, update scripts/eval/raven-policy.ts`,
		);
	}
	const init = (name: string): ts.Expression => {
		const found = source.statements
			.filter(ts.isVariableStatement)
			.flatMap((s) => [...s.declarationList.declarations])
			.filter((d) => ts.isIdentifier(d.name) && d.name.text === name);
		if (found.length > 1) fail(name, "is declared more than once");
		let e = found[0]?.initializer;
		if (!e) return fail(name, "is not declared with a value");
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
