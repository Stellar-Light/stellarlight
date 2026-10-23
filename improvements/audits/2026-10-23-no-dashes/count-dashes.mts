// Counts the lines that show an em dash (U+2014) or an en dash (U+2013) in
// text the product serves or shows: string literals, template strings, JSX
// text and JSX attribute strings, in literal or escaped form (JavaScript
// unicode escapes for the two characters, the entities &mdash; and &ndash;). Comments
// (line, block, JSDoc, JSX comments) are skipped: each file is parsed with
// the TypeScript compiler, so a dash after a code token on the same line
// counts only when it sits inside a string, a template or JSX text.
//
// Areas marked "part A" are the scope of the cleanup; the rest are counted
// for information, so the next part knows its size. Test files get their own
// row and are never counted in an area.
//
// A dash that is left on purpose is listed in upstream-text.json (next to
// this file): file, a snippet of the line around the dash, and a kind. The
// table reports it as "listed". The target is 0 unlisted lines in part A. A
// listed entry that matches no dash is reported as stale.
//
// Output never carries a literal dash: they print as <EM> and <EN>.
//
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-no-dashes/count-dashes.mts \
//     [--label <text>] [--root <dir>] [--sha <text>] [--no-allow] [--lines] [--files]
//   --root      count another tree (a checkout or an extract of src/), default cwd
//   --no-allow  ignore upstream-text.json (the count before any decision)
//   --lines  print every part A dash line, tagged with its kind or UNLISTED
//   --files  print the per-file counts
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
const label = opt("--label") ?? "run";

const DASH =
	/[\u{2013}\u{2014}]|\\u(?:2013|2014)|\\u\{0*(?:2013|2014)\}|&(?:mdash|ndash);|&#(?:0*8211|0*8212);|&#x0*(?:2013|2014);/giu;
const mask = (s: string) =>
	s.replace(/\u{2014}/gu, "<EM>").replace(/\u{2013}/gu, "<EN>");

const KINDS: Record<string, string> = {
	quote:
		"quoted from an upstream README, package description or GitHub description",
	prompt: "model-facing prompt or tool schema text, never served or shown",
	internal: "internal error or log text, never served or shown",
	functional: "a search pattern for the dash character, not served text",
};

interface Area {
	name: string;
	partA: boolean;
	test: (rel: string) => boolean;
}
const HACK_LIBS = [
	"src/lib/vet-idea.ts",
	"src/lib/event-in-query.ts",
	"src/lib/build-rerank.ts",
	"src/lib/compact-view.ts",
];
const AREAS: Area[] = [
	{
		name: "repo-knowledge",
		partA: true,
		test: (r) => r === "src/lib/repo-knowledge.ts",
	},
	{
		name: "frontend",
		partA: true,
		test: (r) => r.startsWith("src/app/(frontend)/"),
	},
	{
		name: "components",
		partA: true,
		test: (r) => r.startsWith("src/components/"),
	},
	{
		name: "integrations",
		partA: true,
		test: (r) => r.startsWith("src/lib/integrations/"),
	},
	{
		name: "quality-artifacts",
		partA: true,
		test: (r) => r === "src/lib/quality-artifacts.ts",
	},
	{
		name: "blocks",
		partA: true,
		test: (r) => r.startsWith("src/blocks/"),
	},
	{
		name: "api (not hackathons)",
		partA: true,
		test: (r) =>
			r.startsWith("src/app/api/") && !r.startsWith("src/app/api/hackathons/"),
	},
	{
		name: "api/hackathons",
		partA: false,
		test: (r) => r.startsWith("src/app/api/hackathons/"),
	},
	{
		name: "hackathon libs",
		partA: false,
		test: (r) => r.startsWith("src/lib/hackathon-") || HACK_LIBS.includes(r),
	},
	{
		name: "spec, changelog, skill text",
		partA: false,
		test: (r) =>
			[
				"src/lib/openapi-spec.ts",
				"src/lib/changelog.ts",
				"src/lib/stellar-scout-skill.ts",
			].includes(r),
	},
	{
		name: "collections",
		partA: false,
		test: (r) => r.startsWith("src/collections/"),
	},
	{ name: "data", partA: false, test: (r) => r.startsWith("src/data/") },
	{
		name: "payload-types",
		partA: false,
		test: (r) => r === "src/payload-types.ts",
	},
	{ name: "other src", partA: false, test: (r) => r.startsWith("src/") },
];

const isTest = (rel: string) =>
	/(^|\/)__tests__\//.test(rel) || /\.(test|spec)\.(ts|tsx)$/.test(rel);

function walk(dir: string, out: string[]) {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === ".next") continue;
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
	}
}

interface Entry {
	file: string;
	snippet: string;
	kind: string;
}
const allowPath = join(HERE, "upstream-text.json");
const allow: Entry[] =
	existsSync(allowPath) && !flag("--no-allow")
		? JSON.parse(readFileSync(allowPath, "utf8"))
		: [];
const matched = new Set<Entry>();

interface Hit {
	line: number; // 1-based
	kind: string | null; // allowlist kind, or null when unlisted
}

/** Dash hits in served text of one file (comments are skipped). */
function scan(rel: string, text: string): Hit[] {
	const kind = rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
	const sf = ts.createSourceFile(
		rel,
		text,
		ts.ScriptTarget.Latest,
		false,
		kind,
	);
	const spans: [number, number][] = [];
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
	const hits: Hit[] = [];
	for (const [s, e] of spans) {
		const raw = text.slice(s, e);
		for (const m of raw.matchAll(DASH)) {
			const pos = s + (m.index ?? 0);
			const li = lineOf(pos);
			const lineEnd = text.indexOf("\n", lineStarts[li]);
			const lineText = text.slice(
				lineStarts[li],
				lineEnd === -1 ? text.length : lineEnd,
			);
			const col = pos - lineStarts[li];
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
			hits.push({ line: li + 1, kind: found?.kind ?? null });
		}
	}
	return hits;
}

const all: string[] = [];
walk(join(ROOT, "src"), all);

type Row = {
	lines: number;
	occurrences: number;
	listedLines: number;
	unlistedLines: number;
};
const blank = (): Row => ({
	lines: 0,
	occurrences: 0,
	listedLines: 0,
	unlistedLines: 0,
});
const byArea = new Map<string, Row>(AREAS.map((a) => [a.name, blank()]));
const tests = blank();
const perFile: { rel: string; area: string; row: Row }[] = [];
const dashLines: string[] = [];
const byKind = new Map<string, number>(); // part A dashes left on purpose

for (const file of all.sort()) {
	const rel = relative(ROOT, file).split(sep).join("/");
	const text = readFileSync(file, "utf8");
	const hits = scan(rel, text);
	if (hits.length === 0) continue;
	const area = isTest(rel) ? undefined : AREAS.find((a) => a.test(rel));
	const row = blank();
	const lines = new Map<number, string | null | "mixed">(); // line -> kind
	for (const h of hits) {
		row.occurrences++;
		if (area?.partA && h.kind)
			byKind.set(h.kind, (byKind.get(h.kind) ?? 0) + 1);
		const prev = lines.get(h.line);
		lines.set(
			h.line,
			prev === undefined ? h.kind : prev === h.kind ? prev : null,
		);
	}
	for (const kind of lines.values()) {
		row.lines++;
		if (kind) row.listedLines++;
		else row.unlistedLines++;
	}
	const target = area ? byArea.get(area.name) : tests;
	if (!target) continue;
	for (const k of Object.keys(row) as (keyof Row)[]) target[k] += row[k];
	perFile.push({ rel, area: area?.name ?? "tests", row });
	if (flag("--lines") && area?.partA) {
		const src = text.split("\n");
		for (const [ln, kind] of lines)
			dashLines.push(
				`${rel}:${ln}: [${kind ?? "UNLISTED"}] ${mask(src[ln - 1].trim()).slice(0, 260)}`,
			);
	}
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
out.push(`dash audit: ${label} (git ${sha})`);
out.push(
	"served text only (strings, templates, JSX text); comments and test files skipped",
);
out.push("");
out.push(
	`${"area".padEnd(30)}${pad("lines", 8)}${pad("dashes", 8)}${pad("listed", 8)}${pad("unlisted", 10)}`,
);
const sum = blank();
for (const a of AREAS.filter((x) => x.partA)) {
	const r = byArea.get(a.name) ?? blank();
	out.push(
		`${a.name.padEnd(30)}${pad(r.lines, 8)}${pad(r.occurrences, 8)}${pad(r.listedLines, 8)}${pad(r.unlistedLines, 10)}`,
	);
	for (const k of Object.keys(sum) as (keyof Row)[]) sum[k] += r[k];
}
out.push(
	`${"PART A TOTAL".padEnd(30)}${pad(sum.lines, 8)}${pad(sum.occurrences, 8)}${pad(sum.listedLines, 8)}${pad(sum.unlistedLines, 10)}`,
);
out.push("");
out.push("part A dashes left on purpose (listed), by kind:");
if (byKind.size === 0) out.push("  none");
for (const [k, n] of [...byKind].sort())
	out.push(`  ${k.padEnd(11)}${pad(n, 4)}  ${KINDS[k] ?? "?"}`);
const stale = allow.filter((e) => !matched.has(e));
out.push(
	`listed entries that match no dash (stale): ${stale.length} of ${allow.length}`,
);
out.push("");
out.push("not in part A (information only):");
for (const a of AREAS.filter((x) => !x.partA)) {
	const r = byArea.get(a.name) ?? blank();
	out.push(`${a.name.padEnd(30)}${pad(r.lines, 8)}${pad(r.occurrences, 8)}`);
}
out.push(
	`${"test files (all areas)".padEnd(30)}${pad(tests.lines, 8)}${pad(tests.occurrences, 8)}`,
);
if (flag("--files")) {
	out.push("");
	out.push("per file, part A (lines, dashes):");
	for (const f of perFile
		.filter((f) => AREAS.find((a) => a.name === f.area)?.partA)
		.sort((x, y) => y.row.lines - x.row.lines || x.rel.localeCompare(y.rel)))
		out.push(`${pad(f.row.lines, 6)}${pad(f.row.occurrences, 6)}  ${f.rel}`);
	out.push("");
	out.push("per file, not in part A (lines, dashes), top 25:");
	for (const f of perFile
		.filter(
			(f) => f.area !== "tests" && !AREAS.find((a) => a.name === f.area)?.partA,
		)
		.sort((x, y) => y.row.lines - x.row.lines || x.rel.localeCompare(y.rel))
		.slice(0, 25))
		out.push(`${pad(f.row.lines, 6)}${pad(f.row.occurrences, 6)}  ${f.rel}`);
}
if (flag("--lines")) {
	out.push("");
	out.push("part A dash lines:");
	out.push(...dashLines);
}
if (stale.length) {
	out.push("");
	out.push("stale listed entries:");
	for (const e of stale) out.push(`  ${e.file}: ${mask(e.snippet)}`);
}
console.log(out.join("\n"));
