/**
 * A fixed `limit:` truncates in silence: GET /api/builders read 300 of 401
 * profiles and still said "full set" (#1915). This guard finds every Payload
 * find in src/app and src/lib with a literal numeric limit of 2 or more and
 * fails unless the call site is listed in fixed-limit-allowed.json with a
 * one-line reason. A read that must be whole goes through findWholeSet
 * (src/lib/whole-set.ts) instead, which says when a set was cut.
 *
 * What it sees: a call `<anything>.find({ ... })` whose first argument is an
 * object literal (also through `as`, `satisfies` and parentheses) holding a
 * `collection` and a `limit` written as a number.
 *
 * What it cannot see: a limit held in a name or computed (`limit: PAGE`,
 * `limit: q ? 600 : 200`); an argument object built elsewhere and passed by
 * name; a spread that supplies the collection; a find called by another
 * name; raw driver reads through payload.db; array caps such as
 * `.slice(0, N)`; `limit: 1`, left out on purpose (one row by key); and any
 * file outside src/app and src/lib.
 *
 * An entry keys on file, collection and limit with a count, so a second find
 * with the same three in that file still fails until it is listed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import allowed from "./fixed-limit-allowed.json";

type Site = { collection: string; limit: number; line: number };

const unwrap = (e: ts.Expression): ts.Expression =>
	ts.isAsExpression(e) ||
	ts.isSatisfiesExpression(e) ||
	ts.isParenthesizedExpression(e)
		? unwrap(e.expression)
		: e;

/** Payload finds with a literal numeric limit of 2 or more, in one file. */
function cappedFinds(fileName: string, text: string): Site[] {
	const src = ts.createSourceFile(
		fileName,
		text,
		ts.ScriptTarget.Latest,
		true,
		fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
	);
	const out: Site[] = [];
	const visit = (n: ts.Node) => {
		if (
			ts.isCallExpression(n) &&
			ts.isPropertyAccessExpression(n.expression) &&
			n.expression.name.text === "find" &&
			n.arguments[0]
		) {
			const arg = unwrap(n.arguments[0]);
			if (ts.isObjectLiteralExpression(arg)) {
				const prop = (key: string) =>
					arg.properties.find(
						(p): p is ts.PropertyAssignment =>
							ts.isPropertyAssignment(p) &&
							(ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) &&
							p.name.text === key,
					);
				const collection = prop("collection");
				const limit = prop("limit");
				if (collection && limit && ts.isNumericLiteral(limit.initializer)) {
					const value = Number(limit.initializer.text.replace(/_/g, ""));
					if (value >= 2)
						out.push({
							collection: ts.isStringLiteral(collection.initializer)
								? collection.initializer.text
								: collection.initializer.getText(src),
							limit: value,
							line:
								src.getLineAndCharacterOfPosition(limit.getStart()).line + 1,
						});
				}
			}
		}
		ts.forEachChild(n, visit);
	};
	visit(src);
	return out;
}

describe("cappedFinds", () => {
	const sites = (code: string) =>
		cappedFinds("x.ts", code).map(({ collection, limit }) => ({
			collection,
			limit,
		}));
	it("sees a literal limit, also through a cast, a wrapper and separators", () => {
		expect(
			sites(`
				payload.find({ collection: "repos", where, limit: 300 });
				await withReadTimeout(p.find({ collection: "audits", limit: 10_000 } as any), 4);
			`),
		).toEqual([
			{ collection: "repos", limit: 300 },
			{ collection: "audits", limit: 10000 },
		]);
	});
	it("leaves out limit 0 and 1, computed limits and non-Payload finds", () => {
		expect(
			sites(`
				payload.find({ collection: "a", limit: 0 });
				payload.find({ collection: "b", limit: 1 });
				payload.find({ collection: "c", limit: PAGE });
				payload.find({ collection: "d", limit: q ? 600 : 200 });
				rows.find((r) => r.limit === 5);
				rateLimit({ limit: 60, windowMs: 1000 });
				findWholeSet(payload, { collection: "e", limit: 300 });
			`),
		).toEqual([]);
	});
});

// vitest runs from the repository root
const ROOT = process.cwd();
const SKIP = /(^|[/\\])__tests__([/\\]|$)|\.test\.tsx?$|\.d\.ts$/;
function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory())
			return name === "node_modules" || SKIP.test(path)
				? []
				: sourceFiles(path);
		return /\.tsx?$/.test(name) && !SKIP.test(path) ? [path] : [];
	});
}

type Entry = {
	file: string;
	collection: string;
	limit: number;
	count: number;
	reason: string;
};
const key = (e: { file: string; collection: string; limit: number }) =>
	`${e.file} ${e.collection} ${e.limit}`;

describe("every Payload find with a fixed limit is listed with a reason", () => {
	const found = new Map<string, { count: number; lines: number[] }>();
	for (const dir of ["src/app", "src/lib"])
		for (const path of sourceFiles(join(ROOT, dir))) {
			const file = relative(ROOT, path).split(sep).join("/");
			for (const s of cappedFinds(path, readFileSync(path, "utf8"))) {
				const k = key({ file, ...s });
				const f = found.get(k) ?? { count: 0, lines: [] };
				f.count++;
				f.lines.push(s.line);
				found.set(k, f);
			}
		}
	const list = allowed as Entry[];

	it("lists every site, with its count", () => {
		const listed = new Map(list.map((e) => [key(e), e.count]));
		const unlisted = [...found]
			.filter(([k, f]) => listed.get(k) !== f.count)
			.map(
				([k, f]) =>
					`${k} (lines ${f.lines.join(", ")}; listed ${listed.get(k) ?? 0})`,
			);
		expect(unlisted).toEqual([]);
	});

	it("has no stale entry and gives every entry a reason", () => {
		expect(list.filter((e) => !found.has(key(e))).map(key)).toEqual([]);
		expect(list.filter((e) => e.reason.trim().length < 10).map(key)).toEqual(
			[],
		);
	});
});
