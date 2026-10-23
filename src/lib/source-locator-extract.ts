/**
 * Locator extraction for the source-locator index (locateSource). Pure: a
 * tarball's bytes, or a path and its text, in; pointers out. The builder
 * (scripts/build-source-locators.ts) does the network and database IO;
 * nothing here stores a file body. A locator is a NAME (a symbol,
 * a heading, a flag, a config key) and the line it sits on, never content.
 *
 * One rule per file type, the same for every repo:
 *   Rust        fn (top level and impl level), struct, enum, trait, type,
 *               union, const, static, macro_rules!, clap --flags and env vars
 *   Go          func and methods, type, const and var (grouped too), config
 *               option names (Name:/TomlKey: kebab strings) and flag names
 *   C and C++   column-0 function definitions, class/struct/enum, #define,
 *               ALL_CAPS constants, {"CONFIG_KEY", ...} table entries
 *   TS and JS   exported and top-level declarations, class members
 *   Markdown    ATX headings outside code fences
 *   shell       ${VAR:=default} defaults, top-level VAR=, functions,
 *               case-arm --flags (by extension or a sh/bash shebang)
 *   .cfg/.ini   top-level KEY= lines
 * Test files, vendored and generated trees, changelogs and files over
 * MAX_FILE_BYTES are skipped (isIndexablePath, extractLocators).
 */

import { createHash } from "node:crypto";
import {
	type IndexRow,
	type PointerKind,
	rowKey,
	rowTerms,
} from "./source-locator";

export type LocatorKind = "symbol" | "heading";

export interface ExtractedLocator {
	kind: LocatorKind;
	locator: string;
	/** 1-based line the locator sits on. */
	line: number;
}

export type FileType =
	| "rust"
	| "go"
	| "cpp"
	| "ts"
	| "markdown"
	| "shell"
	| "config";

export const MAX_FILE_BYTES = 512 * 1024;
/** A file yielding more than this is generated or a table; the first ones are kept. */
export const MAX_LOCATORS_PER_FILE = 400;
const MAX_LOCATOR_CHARS = 120;

const SKIP_DIRS = new Set([
	"node_modules",
	"vendor",
	"third_party",
	"third-party",
	"target",
	"dist",
	"build",
	"lib", // stellar-core vendors its dependencies here; JS build output elsewhere
	"test",
	"tests",
	"__tests__",
	"testdata",
	"test_snapshots",
	"testutils",
	"fixtures",
	"snapshots",
	"generated",
]);

const EXT_TYPES: Record<string, FileType> = {
	rs: "rust",
	go: "go",
	c: "cpp",
	cc: "cpp",
	cpp: "cpp",
	cxx: "cpp",
	h: "cpp",
	hh: "cpp",
	hpp: "cpp",
	ts: "ts",
	tsx: "ts",
	mts: "ts",
	js: "ts",
	mjs: "ts",
	cjs: "ts",
	jsx: "ts",
	md: "markdown",
	mdx: "markdown",
	sh: "shell",
	bash: "shell",
	cfg: "config",
	ini: "config",
};

/** Whether a repo-relative path is in scope at all (before reading it). */
export function isIndexablePath(path: string): boolean {
	const parts = path.split("/");
	const base = parts[parts.length - 1];
	if (parts.slice(0, -1).some((d) => SKIP_DIRS.has(d) || d.startsWith(".")))
		return false;
	if (base.startsWith(".")) return false;
	if (/^(changelog|news|history)(\.|$)/i.test(base)) return false;
	if (
		/(_test\.go|\.test\.[cm]?[jt]sx?|\.spec\.[cm]?[jt]sx?|\.d\.ts|\.min\.js|\.pb\.go|_generated\.\w+)$/.test(
			base,
		)
	)
		return false;
	if (base === "test.rs" || base === "tests.rs") return false;
	return true;
}

/** The file type, from the extension or (extensionless) a shell shebang. */
export function fileTypeOf(path: string, head = ""): FileType | null {
	const base = path.split("/").pop() ?? "";
	const dot = base.lastIndexOf(".");
	if (dot > 0) return EXT_TYPES[base.slice(dot + 1).toLowerCase()] ?? null;
	return /^#!.*\b(ba|z|da)?sh\b/.test(head) ? "shell" : null;
}

/** Locators in one file, first occurrence of each (kind, locator) only. */
export function extractLocators(
	path: string,
	text: string,
): ExtractedLocator[] {
	const type = fileTypeOf(path, text.slice(0, 120));
	if (!type || text.length > MAX_FILE_BYTES || text.includes("\u0000"))
		return [];
	const lines = text.split(/\r?\n/);
	const raw = EXTRACTORS[type](lines);
	const seen = new Set<string>();
	const out: ExtractedLocator[] = [];
	for (const l of raw) {
		const locator = l.locator.trim().slice(0, MAX_LOCATOR_CHARS);
		if (!locator) continue;
		const key = `${l.kind}\u0000${locator}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ ...l, locator });
		if (out.length >= MAX_LOCATORS_PER_FILE) break;
	}
	return out;
}

type Extractor = (lines: string[]) => ExtractedLocator[];
const sym = (locator: string, i: number): ExtractedLocator => ({
	kind: "symbol",
	locator,
	line: i + 1,
});

const RUST_FN =
	/^(?: {4})?(?:pub(?:\([^)]*\))?\s+)?(?:(?:const|async|unsafe|extern\s+"[^"]*")\s+)*fn\s+([A-Za-z_]\w*)/;
const RUST_ITEM =
	/^(?:pub(?:\([^)]*\))?\s+)?(?:unsafe\s+)?(?:struct|enum|trait|type|union)\s+([A-Za-z_]\w*)/;
const RUST_CONST =
	/^(?: {4})?(?:pub(?:\([^)]*\))?\s+)?(?:const|static)\s+(?:mut\s+)?([A-Za-z_]\w*)\s*:/;
const RUST_MACRO = /^macro_rules!\s+([A-Za-z_]\w*)/;
const RUST_FIELD = /^\s*(?:pub(?:\([^)]*\))?\s+)?([a-z_][a-z0-9_]*)\s*:/;

function rust(lines: string[]): ExtractedLocator[] {
	const out: ExtractedLocator[] = [];
	let skipTestMod = false;
	for (let i = 0; i < lines.length; i++) {
		const s = lines[i];
		if (skipTestMod) {
			if (s.startsWith("}")) skipTestMod = false;
			continue;
		}
		if (
			/^#\[cfg\(test\)\]/.test(s) &&
			/^(pub\s+)?mod\s+\w+\s*\{/.test(lines[i + 1] ?? "")
		) {
			skipTestMod = true;
			i++;
			continue;
		}
		const m =
			s.match(RUST_FN) ??
			s.match(RUST_ITEM) ??
			s.match(RUST_CONST) ??
			s.match(RUST_MACRO);
		if (m) {
			out.push(sym(m[1], i));
			continue;
		}
		// clap: #[arg(...)] / #[clap(...)] carrying `long`, then the field.
		if (/^\s*#\[(arg|clap)\(/.test(s)) {
			let attr = s;
			let j = i;
			while (!/\)\]\s*$/.test(attr) && j < i + 30 && j + 1 < lines.length)
				attr += ` ${lines[++j]}`;
			if (!/\blong\b/.test(attr)) continue;
			let k = j + 1;
			while (
				k < lines.length &&
				k < j + 40 &&
				/^\s*(\/\/|#\[|$)/.test(lines[k])
			)
				k++;
			const field = lines[k]?.match(RUST_FIELD)?.[1];
			const long =
				attr.match(/\blong\s*=\s*"([^"]+)"/)?.[1] ?? field?.replace(/_/g, "-");
			if (long) out.push(sym(`--${long}`, k < lines.length ? k : i));
			const env = attr.match(/\benv\s*=\s*"([A-Z][A-Z0-9_]*)"/)?.[1];
			if (env) out.push(sym(env, i));
		}
	}
	return out;
}

const GO_FUNC = /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*[[(]/;
const GO_DECL = /^(?:type|const|var)\s+([A-Za-z_]\w*)\b/;
const GO_OPTION =
	/^\s+(?:Name|TomlKey):\s+[^"\n]*"([a-z][a-z0-9]*(?:-[a-z0-9]+)+)"/;
// A one-word option name counts only inside an option table entry (a Usage
// or DefaultValue key follows), since Name: "x" is common in any struct literal.
const GO_OPTION_WORD = /^\s+Name:\s+"([a-z][a-z0-9]*)"/;
const GO_FLAG =
	/\.(?:String|Bool|Int|Int64|Uint|Uint32|Uint64|Duration|Float64|StringSlice|StringArray)(?:Var)?P?\((?:&[\w.]+,\s*)?"([a-z][a-z0-9-]*)"/;

function go(lines: string[]): ExtractedLocator[] {
	const out: ExtractedLocator[] = [];
	let group = false;
	for (let i = 0; i < lines.length; i++) {
		const s = lines[i];
		if (/^(?:type|const|var)\s*\($/.test(s)) {
			group = true;
			continue;
		}
		if (group) {
			if (s.startsWith(")")) group = false;
			else {
				const g = s.match(/^\t([A-Za-z_]\w*)\b/);
				if (g && g[1] !== "_") out.push(sym(g[1], i));
			}
			continue;
		}
		const m = s.match(GO_FUNC) ?? s.match(GO_DECL);
		if (m) {
			out.push(sym(m[1], i));
			continue;
		}
		const o = s.match(GO_OPTION) ?? s.match(GO_FLAG);
		if (o) {
			out.push(sym(o[1], i));
			continue;
		}
		const w = s.match(GO_OPTION_WORD);
		if (
			w &&
			lines
				.slice(i + 1, i + 6)
				.some((l) => /^\s+(?:Usage|DefaultValue):/.test(l))
		)
			out.push(sym(w[1], i));
	}
	return out;
}

const CPP_KEYWORDS = new Set([
	"if",
	"for",
	"while",
	"switch",
	"return",
	"else",
	"do",
	"case",
	"sizeof",
	"namespace",
	"using",
	"typedef",
	"template",
	"static_assert",
	"catch",
	"defined",
	"decltype",
	"alignof",
	"delete",
	"new",
	"throw",
]);
const CPP_FN = /^(?:[\w:<>,*&~\s]+?[\s*&]+)?((?:\w+::)*~?[A-Za-z_]\w*)\s*\(/;
const CPP_TYPE =
	/^(?:template\s*<[^>]*>\s*)?(?:class|struct|union|enum(?:\s+class|\s+struct)?)\s+(?:\w+\s+)?([A-Za-z_]\w*)\s*(?:final\s*)?(?::|\{|$)/;
const CPP_DEFINE = /^#\s*define\s+([A-Za-z_]\w*)/;
const CPP_CONST =
	/^(?:static\s+|inline\s+|extern\s+)*(?:constexpr\s+|const\s+)?[\w:<>]+\s+(?:const\s+)?([A-Z][A-Z0-9_]{2,})\s*(?:=|\{|;)/;
const CPP_CONFIG_KEY = /^\s*\{\s*"([A-Z][A-Z0-9_]{2,})"\s*,/;

function cpp(lines: string[]): ExtractedLocator[] {
	const out: ExtractedLocator[] = [];
	let inBlockComment = false;
	for (let i = 0; i < lines.length; i++) {
		const s = lines[i];
		if (inBlockComment) {
			if (s.includes("*/")) inBlockComment = false;
			continue;
		}
		if (/^\s*\/\*/.test(s) && !s.includes("*/")) {
			inBlockComment = true;
			continue;
		}
		const key = s.match(CPP_CONFIG_KEY);
		if (key) {
			out.push(sym(key[1], i));
			continue;
		}
		if (!s || /^\s/.test(s) || s.startsWith("//") || s.startsWith("/*"))
			continue;
		const d = s.match(CPP_DEFINE);
		if (d) {
			out.push(sym(d[1], i));
			continue;
		}
		if (s.startsWith("#")) continue;
		const t = s.match(CPP_TYPE);
		if (t && !/;\s*$/.test(s)) {
			out.push(sym(t[1], i));
			continue;
		}
		const c = s.match(CPP_CONST);
		if (c && !s.includes("(")) {
			out.push(sym(c[1], i));
			continue;
		}
		const f = s.match(CPP_FN);
		if (
			f &&
			!/;\s*$/.test(s) &&
			!CPP_KEYWORDS.has(f[1]) &&
			!CPP_KEYWORDS.has(s.split(/[\s(]/)[0])
		)
			out.push(sym(f[1], i));
	}
	return out;
}

const TS_EXPORT =
	/^export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|const|let|var|namespace)\s+([A-Za-z_$][\w$]*)/;
const TS_TOP =
	/^(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/;
const TS_CLASS_START =
	/^(?:export\s+)?(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?class\b/;
const TS_METHOD =
	/^(?: {2}| {4}|\t)(?:(?:public|private|protected|static|async|readonly|override|abstract|get|set)\s+)*\*?(#?[A-Za-z_$][\w$]*)\s*(?:<[^()]*>)?\s*\(/;
const TS_ARROW =
	/^(?: {2}| {4}|\t)(?:(?:public|private|protected|static|readonly|override)\s+)*([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|[A-Za-z_$][\w$]*\s*=>)/;
const TS_KEYWORDS = new Set([
	"if",
	"for",
	"while",
	"switch",
	"catch",
	"return",
	"function",
	"super",
	"await",
	"typeof",
	"new",
	"throw",
	"else",
	"do",
	"try",
	"with",
	"void",
	"delete",
	"yield",
]);

function ts(lines: string[]): ExtractedLocator[] {
	const out: ExtractedLocator[] = [];
	let inClass = false;
	for (let i = 0; i < lines.length; i++) {
		const s = lines[i];
		const top = s.match(TS_EXPORT) ?? s.match(TS_TOP);
		if (top) {
			out.push(sym(top[1], i));
			inClass = TS_CLASS_START.test(s) && !/\}\s*;?\s*$/.test(s);
			continue;
		}
		if (inClass) {
			if (s.startsWith("}")) {
				inClass = false;
				continue;
			}
			if (/;\s*$/.test(s)) continue;
			const m = s.match(TS_METHOD) ?? s.match(TS_ARROW);
			if (m && !TS_KEYWORDS.has(m[1])) out.push(sym(m[1], i));
		}
	}
	return out;
}

function markdown(lines: string[]): ExtractedLocator[] {
	const out: ExtractedLocator[] = [];
	let fence: string | null = null;
	for (let i = 0; i < lines.length; i++) {
		const s = lines[i];
		const f = s.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (f) {
			if (!fence) fence = f[1][0];
			else if (f[1][0] === fence) fence = null;
			continue;
		}
		if (fence) continue;
		const h = s.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
		if (!h) continue;
		const text = h[1]
			.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/<[^>]+>/g, "")
			.replace(/[`*]|(^|\s)_+|_+(\s|$)/g, "$1$2")
			.replace(/\s+/g, " ")
			.trim();
		if (text) out.push({ kind: "heading", locator: text, line: i + 1 });
	}
	return out;
}

function shell(lines: string[]): ExtractedLocator[] {
	const out: ExtractedLocator[] = [];
	for (let i = 0; i < lines.length; i++) {
		const s = lines[i];
		const d =
			s.match(/^\s*:\s+"?\$\{([A-Za-z_]\w*):?[=-]/) ??
			s.match(
				/^(?:export\s+|readonly\s+|declare\s+(?:-\w+\s+)?)?([A-Z_][A-Z0-9_]*)=/,
			) ??
			s.match(/^(?:function\s+)?([A-Za-z_][\w-]*)\s*\(\)/) ??
			s.match(/^function\s+([A-Za-z_][\w-]*)/);
		if (d) {
			out.push(sym(d[1], i));
			continue;
		}
		const arm = s.match(
			/^\s*((?:--[A-Za-z0-9][\w-]*\s*\|\s*)*--[A-Za-z0-9][\w-]*)\s*\)/,
		);
		if (arm)
			for (const flag of arm[1].split("|")) out.push(sym(flag.trim(), i));
	}
	return out;
}

function config(lines: string[]): ExtractedLocator[] {
	const out: ExtractedLocator[] = [];
	for (let i = 0; i < lines.length; i++) {
		const m = lines[i].match(/^([A-Z][A-Z0-9_]+)\s*=/);
		if (m) out.push(sym(m[1], i));
	}
	return out;
}

const EXTRACTORS: Record<FileType, Extractor> = {
	rust,
	go,
	cpp,
	ts,
	markdown,
	shell,
	config,
};

// ── Tarball reading and row building (pure; the builder does the IO) ─────

/** Regular files in a ustar/pax tarball, top-level directory stripped. */
export function* tarFiles(
	buf: Buffer,
): Generator<{ path: string; data: Buffer }> {
	let off = 0;
	let longName: string | null = null;
	let paxPath: string | null = null;
	const str = (h: Buffer, a: number, b: number) =>
		h.subarray(a, b).toString("utf8").split("\0")[0];
	while (off + 512 <= buf.length) {
		const h = buf.subarray(off, off + 512);
		if (h.every((b) => b === 0)) break;
		const size = Number.parseInt(str(h, 124, 136).trim() || "0", 8);
		const type = String.fromCharCode(h[156] || 48);
		const data = buf.subarray(off + 512, off + 512 + size);
		off += 512 + Math.ceil(size / 512) * 512;
		if (type === "x") {
			paxPath = paxRecords(data).path ?? null;
			continue;
		}
		if (type === "L") {
			longName = data.toString("utf8").split("\0")[0];
			continue;
		}
		const prefix = str(h, 345, 500);
		const plain = str(h, 0, 100);
		const name = paxPath ?? longName ?? (prefix ? `${prefix}/${plain}` : plain);
		paxPath = null;
		longName = null;
		if (type !== "0" && type !== "\0") continue;
		const slash = name.indexOf("/");
		if (slash > 0) yield { path: name.slice(slash + 1), data };
	}
}

function paxRecords(data: Buffer): Record<string, string> {
	const out: Record<string, string> = {};
	let i = 0;
	while (i < data.length) {
		const sp = data.indexOf(0x20, i);
		if (sp < 0) break;
		const len = Number.parseInt(data.subarray(i, sp).toString(), 10);
		if (!len) break;
		const rec = data.subarray(sp + 1, i + len - 1).toString("utf8");
		const eq = rec.indexOf("=");
		if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
		i += len;
	}
	return out;
}

/** git's blob id: sha1("blob <size>\0" + bytes), the id GitHub serves for the file. */
export function blobSha(data: Buffer): string {
	return createHash("sha1")
		.update(`blob ${data.length}\0`)
		.update(data)
		.digest("hex");
}

/** Every pointer for one repo at one commit: a file pointer per indexed file, then its locators. */
export function buildRows(
	repo: string,
	ref: string,
	files: Iterable<{ path: string; data: Buffer }>,
): { files: number; rows: IndexRow[] } {
	const rows: IndexRow[] = [];
	let indexed = 0;
	for (const { path, data } of files) {
		if (data.length > MAX_FILE_BYTES || !isIndexablePath(path)) continue;
		if (!fileTypeOf(path, data.subarray(0, 120).toString("utf8"))) continue;
		indexed++;
		const sha = blobSha(data);
		const push = (
			kind: PointerKind,
			locator: string | null,
			line: number | null,
		) =>
			rows.push({
				key: rowKey(repo, path, kind, locator),
				repo,
				ref,
				path,
				locatorKind: kind,
				locator,
				line,
				blobSha: sha,
				terms: rowTerms(kind, locator, path),
			});
		push("file", null, null);
		for (const l of extractLocators(path, data.toString("utf8")))
			push(l.kind, l.locator, l.line);
	}
	return { files: indexed, rows };
}
