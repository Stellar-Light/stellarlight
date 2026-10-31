/**
 * No em dash (U+2014) or en dash (U+2013) in text the product serves or shows.
 *
 * The owner reads them as a sign of machine-written text (2026-10-23, parts A
 * and B). This is the guard that keeps them out: it counts a dash only where
 * it is served text, and fails on any line that is not in the short list of
 * dashes left on purpose (`scripts/no-dashes-allowed.json`: file, a snippet of
 * the line around the dash, and a kind).
 *
 * Served text is:
 *   - a string literal, template string, JSX text or JSX attribute string in a
 *     non-test `.ts`, `.tsx` or `.mts` file under `src/`, plus the tool text in
 *     `scout-mcp/src/index.ts` and the error text in `api-client/src/index.ts`
 *     (parsed with the TypeScript compiler, so a comment is never counted,
 *     even on the same line as code);
 *   - every line of the markdown under `public/skills/**` (served to agents);
 *   - every line of a JSON file under `src/` (imported and served as data).
 * A dash counts in literal form or as an escape or entity (a JavaScript
 * unicode escape, `&mdash;`, `&ndash;`, a numeric entity).
 *
 * Not counted: comments, test files, stored database text (an owner
 * decision), and scripts. Known gaps, served or published text this check
 * does not read: other markdown (`scout-mcp/README.md`, `api-client/README.md`,
 * the repository docs), JSON outside `src/` (`package.json` descriptions, which
 * are npm page text) and MDX. Output never carries a literal dash: they print as <EM> and
 * <EN>.
 *
 * Usage, from the repository root:
 *   pnpm exec tsx scripts/check-no-dashes.ts            # the table
 *   pnpm exec tsx scripts/check-no-dashes.ts --check    # exit 1 on any unlisted line
 *   pnpm exec tsx scripts/check-no-dashes.ts --no-allow # ignore the list
 *   pnpm exec tsx scripts/check-no-dashes.ts --lines    # every dash line, tagged
 *   [--root <dir>] [--label <text>] [--files]
 *
 * A listed entry that matches no dash is stale and also fails --check, so the
 * list cannot outlive the text it excuses.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name: string) =>
	args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
const flag = (name: string) => args.includes(name);
const ROOT = opt("--root") ?? process.cwd();

/** A dash in literal form, as a JavaScript escape (only an odd run of
 * backslashes before u escapes: a doubled one is the text backslash-u), or
 * as an entity: the named ones are case-sensitive in HTML (an upper-case
 * MDASH entity renders as written), and a browser reads a numeric one
 * without its semicolon too (review, 2026-10-31). */
const DASH =
	/[\u{2013}\u{2014}]|(?<!\\)(?:\\\\)*\\u(?:2013|2014|\{0*(?:2013|2014)\})|&(?:mdash|ndash);|&#(?:0*8211|0*8212)(?![0-9]);?|&#[xX]0*(?:2013|2014)(?![0-9a-fA-F]);?/gu;
const mask = (s: string) =>
	s.replace(/\u{2014}/gu, "<EM>").replace(/\u{2013}/gu, "<EN>");

const KINDS: Record<string, string> = {
	quote:
		"quoted verbatim from upstream (README, package or GitHub description, an event's own record)",
	prompt: "model-facing prompt or tool schema text, never served or shown",
	internal: "internal error or log text, never served or shown",
	functional: "a search pattern for the dash character, not served text",
};

interface Area {
	name: string;
	test: (rel: string) => boolean;
}
const HACK_LIBS = [
	"src/lib/vet-idea.ts",
	"src/lib/event-in-query.ts",
	"src/lib/build-rerank.ts",
	"src/lib/compact-view.ts",
];
const AREAS: Area[] = [
	{ name: "repo-knowledge", test: (r) => r === "src/lib/repo-knowledge.ts" },
	{ name: "frontend", test: (r) => r.startsWith("src/app/(frontend)/") },
	{ name: "components", test: (r) => r.startsWith("src/components/") },
	{ name: "integrations", test: (r) => r.startsWith("src/lib/integrations/") },
	{
		name: "quality-artifacts",
		test: (r) => r === "src/lib/quality-artifacts.ts",
	},
	{ name: "blocks", test: (r) => r.startsWith("src/blocks/") },
	{
		name: "api (not hackathons)",
		test: (r) =>
			r.startsWith("src/app/api/") && !r.startsWith("src/app/api/hackathons/"),
	},
	{
		name: "api/hackathons",
		test: (r) => r.startsWith("src/app/api/hackathons/"),
	},
	{
		name: "hackathon libs",
		test: (r) => r.startsWith("src/lib/hackathon-") || HACK_LIBS.includes(r),
	},
	{
		name: "spec, changelog, skill text",
		test: (r) =>
			[
				"src/lib/openapi-spec.ts",
				"src/lib/changelog.ts",
				"src/lib/stellar-scout-skill.ts",
			].includes(r),
	},
	{ name: "collections", test: (r) => r.startsWith("src/collections/") },
	{ name: "data", test: (r) => r.startsWith("src/data/") },
	{ name: "payload-types", test: (r) => r === "src/payload-types.ts" },
	{ name: "skills (markdown)", test: (r) => r.startsWith("public/skills/") },
	{ name: "scout-mcp tool text", test: (r) => r.startsWith("scout-mcp/") },
	{ name: "api-client error text", test: (r) => r.startsWith("api-client/") },
	{ name: "other src", test: (r) => r.startsWith("src/") },
];

const isTest = (rel: string) =>
	/(^|\/)__tests__\//.test(rel) ||
	/\.(test|spec)\.(ts|tsx|mts)$/.test(rel) ||
	/\.test\.json$/.test(rel);

function walk(dir: string, exts: RegExp, out: string[]) {
	if (!existsSync(dir)) return;
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === ".next") continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, exts, out);
		else if (exts.test(name)) out.push(p);
	}
}

interface Entry {
	file: string;
	snippet: string;
	kind: string;
}
const allowPath = join(HERE, "no-dashes-allowed.json");
const allow: Entry[] = flag("--no-allow")
	? []
	: JSON.parse(readFileSync(allowPath, "utf8"));
const matched = new Set<Entry>();

interface Hit {
	line: number; // 1-based
	kind: string | null; // allowlist kind, or null when unlisted
}

function lineIndex(text: string) {
	const lineStarts = [0];
	for (let i = 0; i < text.length; i++)
		if (text[i] === "\n") lineStarts.push(i + 1);
	const lineOf = (pos: number) => {
		let lo = 0;
		let hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lineStarts[mid] <= pos) lo = mid;
			else hi = mid - 1;
		}
		return lo;
	};
	return { lineStarts, lineOf };
}

function classify(
	rel: string,
	text: string,
	pos: number,
	idx: ReturnType<typeof lineIndex>,
): Hit {
	const li = idx.lineOf(pos);
	const lineEnd = text.indexOf("\n", idx.lineStarts[li]);
	const lineText = text.slice(
		idx.lineStarts[li],
		lineEnd === -1 ? text.length : lineEnd,
	);
	const col = pos - idx.lineStarts[li];
	let found: Entry | undefined;
	for (const u of allow) {
		if (u.file !== rel) continue;
		let at = lineText.indexOf(u.snippet);
		while (at !== -1) {
			if (col >= at && col < at + u.snippet.length) {
				matched.add(u);
				found ??= u;
			}
			at = lineText.indexOf(u.snippet, at + 1);
		}
	}
	return { line: li + 1, kind: found?.kind ?? null };
}

/** Dash hits in served text of one file (comments are skipped in code). */
function scan(rel: string, text: string): Hit[] {
	const idx = lineIndex(text);
	const spans: [number, number][] = [];
	if (rel.endsWith(".md") || rel.endsWith(".json")) {
		spans.push([0, text.length]);
	} else {
		const sf = ts.createSourceFile(
			rel,
			text,
			ts.ScriptTarget.Latest,
			false,
			rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
		);
		const visit = (n: ts.Node) => {
			switch (n.kind) {
				case ts.SyntaxKind.StringLiteral:
				case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
				case ts.SyntaxKind.TemplateHead:
				case ts.SyntaxKind.TemplateMiddle:
				case ts.SyntaxKind.TemplateTail:
					spans.push([n.getStart(sf), n.getEnd()]);
					break;
				case ts.SyntaxKind.JsxText:
					spans.push([n.getFullStart(), n.getEnd()]);
					break;
				default:
			}
			ts.forEachChild(n, visit);
		};
		visit(sf);
	}
	const hits: Hit[] = [];
	for (const [s, e] of spans)
		for (const m of text.slice(s, e).matchAll(DASH))
			hits.push(classify(rel, text, s + (m.index ?? 0), idx));
	return hits;
}

const files: string[] = [];
walk(join(ROOT, "src"), /\.(ts|tsx|mts)$/, files);
// JSON under src/ is served as imported data (the leaderboard and
// /api/analyze read src/data/electric-capital-stellar.json), read whole.
walk(join(ROOT, "src"), /\.json$/, files);
walk(join(ROOT, "public/skills"), /\.md$/, files);
for (const extra of ["scout-mcp/src/index.ts", "api-client/src/index.ts"]) {
	const p = join(ROOT, extra);
	if (existsSync(p)) files.push(p);
}

type Row = { lines: number; dashes: number; listed: number; unlisted: number };
const blank = (): Row => ({ lines: 0, dashes: 0, listed: 0, unlisted: 0 });
const byArea = new Map<string, Row>(AREAS.map((a) => [a.name, blank()]));
const tests = blank();
const perFile: { rel: string; area: string; row: Row }[] = [];
const dashLines: string[] = [];
const unlistedLines: string[] = [];
const byKind = new Map<string, number>();

for (const file of files.sort()) {
	const rel = relative(ROOT, file).split(sep).join("/");
	const text = readFileSync(file, "utf8");
	const hits = scan(rel, text);
	if (hits.length === 0) continue;
	const area = isTest(rel) ? undefined : AREAS.find((a) => a.test(rel));
	const row = blank();
	const lines = new Map<number, string | null>();
	for (const h of hits) {
		row.dashes++;
		if (area && h.kind) byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1);
		const prev = lines.get(h.line);
		lines.set(
			h.line,
			prev === undefined ? h.kind : prev === h.kind ? prev : null,
		);
	}
	for (const kind of lines.values()) {
		row.lines++;
		if (kind) row.listed++;
		else row.unlisted++;
	}
	const target = area ? byArea.get(area.name) : tests;
	if (!target) continue;
	for (const k of Object.keys(row) as (keyof Row)[]) target[k] += row[k];
	perFile.push({ rel, area: area?.name ?? "tests", row });
	if (area) {
		const src = text.split("\n");
		for (const [ln, kind] of lines) {
			const s = `${rel}:${ln}: [${kind ?? "UNLISTED"}] ${mask(src[ln - 1].trim()).slice(0, 260)}`;
			dashLines.push(s);
			if (!kind) unlistedLines.push(s);
		}
	}
}

const stale = allow.filter((e) => !matched.has(e));

if (flag("--check")) {
	if (unlistedLines.length === 0 && stale.length === 0) {
		console.log(
			`no-dashes: ok (${dashLines.length} listed line(s), 0 unlisted, 0 stale)`,
		);
		process.exit(0);
	}
	if (unlistedLines.length) {
		console.log(
			`no-dashes: ${unlistedLines.length} unlisted line(s) with an <EM> or <EN> in served text.`,
		);
		console.log(
			"Rewrite the sentence (a colon to introduce, commas or parentheses for an aside,",
		);
		console.log(
			'a semicolon or period between clauses, "to" or a hyphen in a range).',
		);
		console.log(
			"Text quoted verbatim from upstream goes in scripts/no-dashes-allowed.json with a kind.",
		);
		console.log(...unlistedLines.map((l) => `\n  ${l}`));
	}
	if (stale.length) {
		console.log(
			`\nno-dashes: ${stale.length} listed entr${stale.length === 1 ? "y matches" : "ies match"} no dash (stale); remove from scripts/no-dashes-allowed.json:`,
		);
		for (const e of stale) console.log(`  ${e.file}: ${mask(e.snippet)}`);
	}
	process.exit(1);
}

let sha = opt("--sha") ?? "unknown";
if (!opt("--sha")) {
	try {
		sha = execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], {
			encoding: "utf8",
		}).trim();
	} catch {}
}
const pad = (s: string | number, n: number) => String(s).padStart(n);
const out: string[] = [];
out.push(`dash audit: ${opt("--label") ?? "run"} (git ${sha})`);
out.push(
	"served text only (strings, templates, JSX text, skill markdown, JSON under src); comments and test files skipped",
);
out.push("");
out.push(
	`${"area".padEnd(30)}${pad("lines", 8)}${pad("dashes", 8)}${pad("listed", 8)}${pad("unlisted", 10)}`,
);
const sum = blank();
for (const a of AREAS) {
	const r = byArea.get(a.name) ?? blank();
	out.push(
		`${a.name.padEnd(30)}${pad(r.lines, 8)}${pad(r.dashes, 8)}${pad(r.listed, 8)}${pad(r.unlisted, 10)}`,
	);
	for (const k of Object.keys(sum) as (keyof Row)[]) sum[k] += r[k];
}
out.push(
	`${"TOTAL".padEnd(30)}${pad(sum.lines, 8)}${pad(sum.dashes, 8)}${pad(sum.listed, 8)}${pad(sum.unlisted, 10)}`,
);
out.push(
	`${"test files (not counted)".padEnd(30)}${pad(tests.lines, 8)}${pad(tests.dashes, 8)}`,
);
out.push("");
out.push("dashes left on purpose (listed), by kind:");
if (byKind.size === 0) out.push("  none");
for (const [k, n] of [...byKind].sort())
	out.push(`  ${k.padEnd(11)}${pad(n, 4)}  ${KINDS[k] ?? "?"}`);
out.push(
	`listed entries that match no dash (stale): ${stale.length} of ${allow.length}`,
);
if (flag("--files")) {
	out.push("");
	out.push("per file (lines, dashes):");
	for (const f of perFile
		.filter((f) => f.area !== "tests")
		.sort((x, y) => y.row.lines - x.row.lines || x.rel.localeCompare(y.rel)))
		out.push(`${pad(f.row.lines, 6)}${pad(f.row.dashes, 6)}  ${f.rel}`);
}
if (flag("--lines")) {
	out.push("");
	out.push("dash lines:");
	out.push(...dashLines);
}
if (stale.length) {
	out.push("");
	out.push("stale listed entries:");
	for (const e of stale) out.push(`  ${e.file}: ${mask(e.snippet)}`);
}
console.log(out.join("\n"));
