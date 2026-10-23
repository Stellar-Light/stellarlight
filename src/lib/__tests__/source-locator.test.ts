import { describe, expect, it } from "vitest";
import { isContentStopword } from "../repo-search";
import {
	type IndexRow,
	parseQuery,
	rankRows,
	rowKey,
	rowTerms,
	subwords,
	verificationUrl,
} from "../source-locator";
import {
	blobSha,
	buildRows,
	extractLocators,
	fileTypeOf,
	isIndexablePath,
	tarFiles,
} from "../source-locator-extract";

const names = (path: string, text: string) =>
	extractLocators(path, text).map((l) => `${l.line}:${l.locator}`);

describe("extraction, one rule per file type", () => {
	it("Rust: items, impl-level fns, clap flags and env vars; test modules skipped", () => {
		const src = [
			"pub struct Args {",
			"    /// RPC server endpoint",
			"    #[arg(",
			'        long = "rpc-url",',
			'        env = "STELLAR_RPC_URL",',
			"    )]",
			"    pub rpc_url: Option<String>,",
			"    #[arg(long, short = 's')]",
			"    /// doc",
			"    pub source_account: String,",
			"}",
			"impl Storage {",
			"    pub fn extend_ttl(&self) {}",
			"        fn nested_helper() {}",
			"}",
			"pub const MAX: u32 = 1;",
			"#[cfg(test)]",
			"mod test {",
			"    fn only_in_tests() {}",
			"}",
		].join("\n");
		expect(names("src/lib.rs", src)).toEqual([
			"1:Args",
			"7:--rpc-url",
			"3:STELLAR_RPC_URL",
			"10:--source-account",
			"13:extend_ttl",
			"16:MAX",
		]);
	});

	it("Go: funcs, methods, grouped decls, option names; a one-word Name only in an option table", () => {
		const src = [
			"func (cfg *Config) options() Options {",
			"\treturn Options{",
			"\t\t{",
			'\t\t\tName:         "default-transactions-limit",',
			"\t\t\tDefaultValue: uint(50),",
			"\t\t},",
			"\t\t{",
			'\t\t\tName:         "endpoint",',
			'\t\t\tUsage:        "the endpoint",',
			"\t\t},",
			"\t}",
			"}",
			"const (",
			"\tdefaultPort = 8000",
			")",
			"type Thing struct{}",
			'var x = Item{Name: "plain"}',
			"func NewHandler(a int) {}",
		].join("\n");
		expect(names("config/options.go", src)).toEqual([
			"1:options",
			"4:default-transactions-limit",
			"8:endpoint",
			"14:defaultPort",
			"16:Thing",
			"17:x",
			"18:NewHandler",
		]);
	});

	it("C++: column-0 definitions (return type on its own line too), types, defines, config keys; declarations skipped", () => {
		const src = [
			"#define MAX_PEERS 8",
			"class Config : public Base",
			"{",
			"    int getThing();",
			"};",
			"int64_t",
			"getMinBalance(Header const& h)",
			"{",
			"    if (x) {",
			"    }",
			"}",
			"void Config::load(std::string const& f)",
			"int64_t declaredOnly(int a);",
			'    {"PEER_PORT", [&]() { PEER_PORT = readInt(item); }},',
			"uint32_t const DEFAULT_PEER_PORT = 11625;",
		].join("\n");
		expect(names("src/main/Config.cpp", src)).toEqual([
			"1:MAX_PEERS",
			"2:Config",
			"7:getMinBalance",
			"12:Config::load",
			"14:PEER_PORT",
			"15:DEFAULT_PEER_PORT",
		]);
	});

	it("TS/JS: exported and top-level declarations, class members, never statements", () => {
		const src = [
			"export class Server {",
			"  public async prepareTransaction(tx: Tx) {",
			"    doSomething(tx);",
			"  }",
			"  signAndSend = async ({ force = false } = {}) => {",
			"  helper(1);",
			"  if (x) {",
			"}",
			"export function assembleTransaction(raw: Tx) {",
			"  notAMember(raw)",
			"}",
			"function internal() {}",
		].join("\n");
		expect(names("src/rpc/server.ts", src)).toEqual([
			"1:Server",
			"2:prepareTransaction",
			"5:signAndSend",
			"9:assembleTransaction",
			"12:internal",
		]);
	});

	it("Markdown: headings outside code fences, inline markup stripped", () => {
		const src = [
			"# Quickstart",
			"```bash",
			"# not a heading",
			"```",
			"### `--local` and [Ephemeral mode](#x)",
		].join("\n");
		expect(names("README.md", src)).toEqual([
			"1:Quickstart",
			"5:--local and Ephemeral mode",
		]);
	});

	it("shell (by shebang): VAR:= defaults, top-level VAR=, functions, case-arm flags", () => {
		const src = [
			"#! /usr/bin/env bash",
			'export STELLAR_HOME="/opt/stellar"',
			`: "$\{ENABLE_CORE_MANUAL_CLOSE:=false}"`,
			"function main() {",
			"  case $ARG in",
			"    --enable-core-manual-close)",
			"      ENABLE_CORE_MANUAL_CLOSE=true",
			"      ;;",
			"    --a|--b)",
			"  esac",
			"}",
		].join("\n");
		expect(fileTypeOf("start", src)).toBe("shell");
		expect(names("start", src)).toEqual([
			"2:STELLAR_HOME",
			"3:ENABLE_CORE_MANUAL_CLOSE",
			"4:main",
			"6:--enable-core-manual-close",
			"9:--a",
			"9:--b",
		]);
	});

	it(".cfg: uncommented top-level keys", () => {
		expect(
			names("docs/example.cfg", "# PEER_PORT=1\nPEER_PORT=11625\n"),
		).toEqual(["2:PEER_PORT"]);
	});

	it("skips tests, vendored and generated trees, changelogs, unknown types", () => {
		for (const p of [
			"lib/libsodium/src/a.c",
			"src/tests/x.rs",
			"src/foo_test.go",
			"src/a.test.ts",
			"CHANGELOG.md",
			"node_modules/x/index.js",
			".github/workflows/ci.md",
		])
			expect(isIndexablePath(p)).toBe(false);
		expect(isIndexablePath("cmd/soroban-cli/src/config/network.rs")).toBe(true);
		expect(fileTypeOf("Makefile", "all:")).toBeNull();
	});
});

/** A minimal ustar archive: one header block per file, data padded to 512. */
function tar(files: Array<{ name: string; body: string; pax?: string }>) {
	const blocks: Buffer[] = [];
	const header = (name: string, size: number, type: string) => {
		const h = Buffer.alloc(512);
		h.write(name.slice(0, 100), 0);
		h.write(`${size.toString(8).padStart(11, "0")}\0`, 124);
		h.write(type, 156);
		return h;
	};
	const pad = (b: Buffer) =>
		Buffer.concat([b, Buffer.alloc((512 - (b.length % 512)) % 512)]);
	for (const f of files) {
		if (f.pax) {
			const rec = ` path=${f.pax}\n`;
			const line = `${rec.length + String(rec.length).length}${rec}`;
			blocks.push(header("pax", line.length, "x"), pad(Buffer.from(line)));
		}
		const body = Buffer.from(f.body);
		blocks.push(header(f.name, body.length, "0"), pad(body));
	}
	return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

describe("tarball to rows", () => {
	it("blobSha is git's blob id", () => {
		// `printf 'hello\n' | git hash-object --stdin`
		expect(blobSha(Buffer.from("hello\n"))).toBe(
			"ce013625030ba8dba906f756967f9e9ca394464a",
		);
	});

	it("reads ustar and pax paths, strips the top directory, keeps names and hashes only", () => {
		const long = `repo-abc/${"d/".repeat(60)}deep.md`;
		const files = [
			...tarFiles(
				tar([
					{ name: "repo-abc/README.md", body: "# Title\n" },
					{ name: "x", body: "## Deep\n", pax: long },
				]),
			),
		];
		expect(files.map((f) => f.path)).toEqual([
			"README.md",
			long.slice("repo-abc/".length),
		]);
		const { rows } = buildRows("stellar/quickstart", "a".repeat(40), files);
		expect(rows[0]).toMatchObject({
			key: rowKey("stellar/quickstart", "README.md", "file", null),
			locatorKind: "file",
			locator: null,
			line: null,
			blobSha: blobSha(Buffer.from("# Title\n")),
		});
		expect(rows[1]).toMatchObject({
			locatorKind: "heading",
			locator: "Title",
			line: 1,
		});
		expect(JSON.stringify(rows)).not.toContain("# Title");
	});
});

const row = (
	repo: string,
	path: string,
	kind: IndexRow["locatorKind"],
	locator: string | null,
	line: number | null = null,
): IndexRow => ({
	key: rowKey(repo, path, kind, locator),
	repo,
	ref: "f".repeat(40),
	path,
	locatorKind: kind,
	locator,
	line,
	blobSha: "0".repeat(40),
	terms: rowTerms(kind, locator, path),
});

describe("ranking", () => {
	const q = (s: string) => parseQuery(s, isContentStopword);

	it("drops filler and stopwords, keeps identifiers, consumes a named repo", () => {
		const pq = q("Where is the --rpc-url flag defined in the stellar CLI?");
		expect(pq.repos).toEqual(["stellar/stellar-cli"]);
		expect(pq.units.map((u) => u.raw)).toEqual(["--rpc-url", "flag"]);
	});

	it("an exact symbol beats words, and separators and case do not matter", () => {
		const rows = [
			row(
				"stellar/quickstart",
				"start",
				"symbol",
				"ENABLE_CORE_MANUAL_CLOSE",
				47,
			),
			row("stellar/quickstart", "start", "symbol", "enable_core", 9),
			row("stellar/quickstart", "start", "file", null),
		];
		const ranked = rankRows(q("--enable-core-manual-close"), rows);
		expect(ranked[0].row.locator).toBe("ENABLE_CORE_MANUAL_CLOSE");
		expect(ranked[0].matchReason).toContain(
			"symbol --enable-core-manual-close",
		);
	});

	it("a word of five letters or fewer never matches inside a longer name", () => {
		const rows = [
			row("stellar/stellar-cli", "src/a.rs", "symbol", "networking"),
		];
		expect(rankRows(q("netwo"), rows)).toEqual([]);
		expect(rankRows(q("network"), rows)[0].factors).toContain("prefix:1");
	});

	it("a named repo lifts its pointers; a filter keeps one repo or kind", () => {
		const rows = [
			row(
				"stellar/js-stellar-sdk",
				"src/rpc/server.ts",
				"symbol",
				"getTransactions",
			),
			row(
				"stellar/stellar-rpc",
				"cmd/methods/get_transactions.go",
				"symbol",
				"NewGetTransactionsHandler",
			),
		];
		expect(rankRows(q("getTransactions"), rows)[0].row.repo).toBe(
			"stellar/js-stellar-sdk",
		);
		expect(rankRows(q("stellar-rpc getTransactions"), rows)[0].row.repo).toBe(
			"stellar/stellar-rpc",
		);
		expect(rankRows(q("getTransactions"), rows, { kind: "file" })).toEqual([]);
	});

	it("nothing matching is an empty list", () => {
		const rows = [row("stellar/quickstart", "start", "symbol", "main")];
		expect(rankRows(q("quantum llama sandwich"), rows)).toEqual([]);
	});

	it("object-prototype words are plain words", () => {
		expect(subwords("constructor toString")).toEqual([
			"constructor",
			"to",
			"string",
		]);
	});
});

describe("verificationUrl", () => {
	it("pins the commit and the line, encoding path segments", () => {
		expect(
			verificationUrl(
				"stellar/quickstart",
				"a".repeat(40),
				"dir with space/start",
				47,
			),
		).toBe(
			`https://github.com/stellar/quickstart/blob/${"a".repeat(40)}/dir%20with%20space/start#L47`,
		);
		expect(
			verificationUrl("stellar/quickstart", "b".repeat(40), "README.md", null),
		).toBe(
			`https://github.com/stellar/quickstart/blob/${"b".repeat(40)}/README.md`,
		);
	});
});
