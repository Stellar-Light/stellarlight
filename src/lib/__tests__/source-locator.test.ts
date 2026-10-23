import { describe, expect, it } from "vitest";
import { isContentStopword } from "../repo-search";
import {
	candidateTerms,
	type IndexRow,
	isCandidate,
	parseQuery,
	rankRows,
	resolveRepo,
	rowKey,
	rowTerms,
	SOURCE_REPO_NAMES,
	subwords,
	verificationUrl,
} from "../source-locator";
import {
	blobSha,
	buildRows,
	extractLocators,
	fileTypeOf,
	isIndexablePath,
	MAX_LOCATORS_PER_FILE,
	tarFiles,
} from "../source-locator-extract";
import { SYNONYMS } from "../source-locator-synonyms";

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

	it("Rust: top-level `impl Trait for Type` blocks are locators, generic arguments dropped", () => {
		const src = [
			"#[contractimpl(contracttrait)]",
			"impl TokenInterface for Token {",
			"    fn transfer(env: Env) {}",
			"}",
			"impl<'a> From<&'a Address> for Val {",
			"}",
			"unsafe impl Send for Host {}",
			"impl<E: Env, T, U> FromVal<E, T> for U",
			"where",
			"    U: Clone,",
			"{",
			"}",
			"impl<F: Fn(u32) -> u32> Runner<F> for Vec<Option<F>> {}",
			"impl crate::testutils::Address for Address {}",
			"impl Storage {",
			"}",
			"    impl Indented for Skipped {}",
			"impl From<Bytes> for Val {}",
		].join("\n");
		expect(
			names("src/token.rs", src).filter((n) => n.includes("impl ")),
		).toEqual([
			"2:impl TokenInterface for Token",
			"5:impl From for Val",
			"7:impl Send for Host",
			"8:impl FromVal for U",
			"13:impl Runner for Vec",
			"14:impl crate::testutils::Address for Address",
		]);
		// The methods inside keep their own locators.
		expect(names("src/token.rs", src)).toContain("3:transfer");
	});

	it("impl locators never displace a file's other locators: the cap counts them apart", () => {
		const fns = Array.from(
			{ length: MAX_LOCATORS_PER_FILE + 5 },
			(_, i) => `pub fn f${i}() {}`,
		);
		const impls = Array.from(
			{ length: 3 },
			(_, i) => `impl Trait${i} for Thing {}`,
		);
		// impls first: before the fix they took three of the capped places
		const got = names("src/big.rs", [...impls, ...fns].join("\n"));
		const plain = got.filter((n) => !n.includes("impl "));
		expect(plain).toHaveLength(MAX_LOCATORS_PER_FILE);
		expect(plain.at(-1)).toBe(
			`${MAX_LOCATORS_PER_FILE + 3}:f${MAX_LOCATORS_PER_FILE - 1}`,
		);
		expect(got.filter((n) => n.includes("impl "))).toHaveLength(3);
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
		// Six letters or more may match inside a name, but never above a word match.
		expect(rankRows(q("network"), rows)[0].factors).toContain("word:1");
	});

	it("a plain word that is a whole part of a name is a word match, not a held identifier", () => {
		const rows = [
			row(
				"stellar/stellar-rpc",
				"cfg/config.go",
				"symbol",
				"DefaultGetFeeStatsQueueLimit",
			),
		];
		const [s] = rankRows(q("default"), rows);
		expect(s.factors).toContain("word:1");
		expect(s.factors).toContain("prefix:0");
	});

	it("an identifier of several parts held inside a longer name keeps the held tier", () => {
		const rows = [
			row(
				"stellar/stellar-rpc",
				"methods/get_events.go",
				"symbol",
				"NewGetEventsHandler",
			),
		];
		expect(rankRows(q("getEvents"), rows)[0].factors).toContain("prefix:1");
	});

	it("between equal matches, the name the query explains more fully ranks first", () => {
		const rows = [
			row(
				"stellar/stellar-rpc",
				"config/options.go",
				"symbol",
				"request-backlog-default-transactions-queue-limit",
				10,
			),
			row(
				"stellar/stellar-rpc",
				"config/options.go",
				"symbol",
				"default-transactions-limit",
				20,
			),
		];
		expect(rankRows(q("default transactions limit"), rows)[0].row.locator).toBe(
			"default-transactions-limit",
		);
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

const ask = (s: string) => parseQuery(s, isContentStopword);
const top = (s: string, rows: IndexRow[]) => {
	const p = ask(s);
	const cand = candidateTerms(p);
	return rankRows(
		p,
		rows.filter((r) => isCandidate(r, cand)),
	);
};
const at = (s: string, rows: IndexRow[], locator: string) =>
	top(s, rows).findIndex((x) => x.row.locator === locator) + 1;

describe("identifier candidates from q", () => {
	const SDK = "stellar/rs-soroban-sdk";
	it("adjacent words join into one identifier: 'token interface' reaches TokenInterface above a generic Token", () => {
		const rows = [
			row(
				"stellar/soroban-examples",
				"token/src/contract.rs",
				"symbol",
				"Token",
			),
			row(SDK, "soroban-sdk/src/token.rs", "symbol", "TokenInterface"),
		];
		const ranked = top("Where is the token interface defined?", rows);
		expect(ranked[0].row.locator).toBe("TokenInterface");
		expect(ranked[0].factors).toContain("join:1");
		expect(ranked[0].matchReason).toContain("symbol token interface");
	});

	it("case, separators, plurals and code abbreviations do not matter", () => {
		const rows = [
			row("stellar/js-stellar-sdk", "src/a.ts", "symbol", "Contract"),
			row(
				"stellar/rs-soroban-env",
				"src/b.rs",
				"symbol",
				"StellarAssetContract",
			),
			row("stellar/quickstart", "start", "symbol", "start_friendbot_service"),
			row("stellar/quickstart", "start", "symbol", "init_friendbot"),
		];
		expect(
			at(
				"Where is the Stellar Asset Contract implemented?",
				rows,
				"StellarAssetContract",
			),
		).toBe(1);
		expect(
			at("Where does quickstart initialize friendbot?", rows, "init_friendbot"),
		).toBe(1);
	});

	it("a joined phrase inside a longer name is held, and one run counts once", () => {
		const rows = [
			row("stellar/rs-soroban-env", "src/a.rs", "symbol", "multi_pairing"),
			row(
				"stellar/rs-soroban-env",
				"src/a.rs",
				"symbol",
				"bls12_381_multi_pairing_check",
			),
		];
		const [first] = top("multi pairing check", rows);
		expect(first.row.locator).toBe("bls12_381_multi_pairing_check");
		expect(first.factors).toContain("join:1");
	});

	it("a stopword ends a run: the words around it never join", () => {
		const rows = [
			row("stellar/stellar-core", "src/a.cpp", "symbol", "getOrCreate"),
		];
		const [first] = top("get or create", rows);
		expect(first.factors).toContain("join:0");
	});

	it("punctuation ends a run too", () => {
		expect(
			ask("the token interface trait (transfer, approve, burn)").joined.map(
				(j) => j.raw,
			),
		).toEqual(["token interface", "interface trait", "token interface trait"]);
	});

	it("a symbol holding only part of a run gets no join credit; a heading may", () => {
		const rows = [
			row(
				"stellar/stellar-cli",
				"src/fetch/fee.rs",
				"symbol",
				"INCLUSION_FEE_TITLE",
			),
			row(
				"stellar/stellar-cli",
				"docs/fees.md",
				"heading",
				"Inclusion fee and resource fee",
			),
		];
		const ranked = top("Where is the default inclusion fee set?", rows);
		const by = (loc: string) => ranked.find((x) => x.row.locator === loc);
		expect(by("INCLUSION_FEE_TITLE")?.factors).toContain("join:0");
		expect(by("Inclusion fee and resource fee")?.factors).toContain("join:1");
	});

	it("an identifier typed in q counts double: held in a name, it outranks two plain words", () => {
		const rows = [
			row(
				"stellar/stellar-rpc",
				"cmd/stellar-rpc/internal/methods/simulate_transaction.go",
				"symbol",
				"NewSimulateTransactionHandler",
			),
			row("stellar/rs-soroban-env", "src/fees.rs", "symbol", "charge_fees"),
		];
		const ranked = top(
			"Where is simulateTransaction implemented, and what fees does it charge?",
			rows,
		);
		expect(ranked[0].row.locator).toBe("NewSimulateTransactionHandler");
		expect(ranked[0].factors).toContain("ident:1");
	});

	it("kebab-case of three parts is typed too: calculate-asset-supply", () => {
		expect(ask("the calculate-asset-supply command").units[0].kind).toBe(
			"typed",
		);
		expect(ask("Ethereum-signed message").units[0].kind).toBe("word");
	});
});

describe("a repo named in q", () => {
	it("its pointers rank above an exact name elsewhere", () => {
		const rows = [
			row("stellar/js-stellar-sdk", "src/rpc/api.ts", "symbol", "Events"),
			row("stellar/stellar-rpc", "cmd/x/y.go", "symbol", "EventInfo"),
		];
		expect(at("events in stellar-rpc", rows, "EventInfo")).toBe(1);
	});

	it("is read by owner/name, by name, or by a clear alias", () => {
		expect(ask("the stellar/quickstart image").repos).toEqual([
			"stellar/quickstart",
		]);
		expect(ask("OpenZeppelin's Ownable trait").repos).toEqual([
			"OpenZeppelin/stellar-contracts",
		]);
		expect(ask("OpenZeppelin/stellar-contracts Ownable").repos).toEqual([
			"OpenZeppelin/stellar-contracts",
		]);
		// "stellar contracts" in prose names no repo
		expect(ask("how stellar contracts store data").repos).toEqual([]);
	});

	it("a bare common-word alias lifts by 3; owner/name and hyphenated aliases by 8", () => {
		const rows = [
			row("stellar/quickstart", "README.md", "heading", "Deploy"),
			row("stellar/stellar-cli", "src/deploy.rs", "symbol", "deploy"),
		];
		// "quickstart guide" is docs prose: the exact deploy symbol stays first
		expect(at("quickstart guide to deploy a contract", rows, "deploy")).toBe(1);
		expect(ask("quickstart guide").repoLift).toEqual({
			"stellar/quickstart": 3,
		});
		// the owner/name names the repo outright
		expect(at("stellar/quickstart deploy", rows, "Deploy")).toBe(1);
		expect(ask("stellar-rpc and stellar/quickstart").repoLift).toEqual({
			"stellar/stellar-rpc": 8,
			"stellar/quickstart": 8,
		});
	});
});

describe("OpenZeppelin/stellar-contracts in the allowlist", () => {
	it("resolves in any case, as owner/name or name", () => {
		expect(SOURCE_REPO_NAMES).toContain("OpenZeppelin/stellar-contracts");
		for (const v of [
			"OpenZeppelin/stellar-contracts",
			"openzeppelin/stellar-contracts",
			"stellar-contracts",
		])
			expect(resolveRepo(v), v).toBe("OpenZeppelin/stellar-contracts");
		expect(resolveRepo("STELLAR/QUICKSTART")).toBe("stellar/quickstart");
	});
});

describe("a stellar-cli command path typed in q", () => {
	const CLI = "stellar/stellar-cli";
	const C = "cmd/soroban-cli/src/commands";
	const rows = [
		row(CLI, `${C}/contract/invoke.rs`, "symbol", "Cmd", 41),
		row(CLI, `${C}/contract/invoke.rs`, "symbol", "run", 134),
		row(CLI, `${C}/contract/build.rs`, "symbol", "Cmd", 34),
		row(CLI, `${C}/contract/alias.rs`, "symbol", "Cmd", 9),
		row(CLI, `${C}/contract/alias/add.rs`, "symbol", "Cmd", 11),
		row(CLI, `${C}/contract/info/shared.rs`, "symbol", "Contract", 10),
		row(CLI, `${C}/contract/mod.rs`, "symbol", "Cmd", 22),
		row(
			"stellar/js-stellar-sdk",
			"src/base/contract.ts",
			"symbol",
			"Contract",
			1,
		),
		row(
			"stellar/rs-soroban-env",
			"src/e.rs",
			"symbol",
			"StellarAssetContract",
			30,
		),
	];
	const where = (s: string) =>
		top(s, rows).map(
			(x) => `${x.row.path.replace(`${C}/`, "")} ${x.row.locator}`,
		);

	it("reads the module that implements it, though its symbols share no word with q", () => {
		const p = ask("Where is the stellar contract invoke command implemented?");
		expect(p.command?.slice(0, 2)).toEqual(["contract", "invoke"]);
		expect(
			where("Where is the stellar contract invoke command implemented?").slice(
				0,
				2,
			),
		).toEqual(["contract/invoke.rs Cmd", "contract/invoke.rs run"]);
	});

	it("a command after an earlier mention of the binary still counts", () => {
		expect(
			ask("Where does the stellar CLI implement `stellar tx sign`?").command,
		).toEqual(["tx", "sign"]);
	});

	it("the old binary name counts, and a skipped word (build) still names the module", () => {
		expect(where("Which file implements `soroban contract build`?")[0]).toBe(
			"contract/build.rs Cmd",
		);
	});

	it("the deepest matching module wins: alias add before its parent", () => {
		const got = where("Where is `stellar contract alias add` implemented?");
		expect(got[0]).toBe("contract/alias/add.rs Cmd");
		expect(got.indexOf("contract/alias.rs Cmd")).toBeGreaterThan(0);
	});

	it("capitalized prose is no command, and the mod.rs dispatcher is not the command", () => {
		expect(ask("deploy its Stellar Asset Contract").command).toBeNull();
		expect(where("stellar contract invoke")).not.toContain(
			"contract/mod.rs Cmd",
		);
	});

	it("punctuation or a stopword ends the command; build still counts", () => {
		expect(ask("stellar contract invoke, then read the docs").command).toEqual([
			"contract",
			"invoke",
		]);
		expect(ask("run stellar keys generate in the shell").command).toEqual([
			"keys",
			"generate",
		]);
		expect(ask("soroban contract build in the CLI").command).toEqual([
			"contract",
			"build",
		]);
	});

	it("an alias naming the CLI starts a command; the alias and filler words are skipped", () => {
		expect(ask("stellar cli contract invoke").command).toEqual([
			"contract",
			"invoke",
		]);
		expect(
			ask("where does the stellar cli implement contract invoke").command,
		).toEqual(["contract", "invoke"]);
	});

	it("a command no module implements adds nothing, not even to the score's maximum", () => {
		const prose = [
			row("stellar/rs-soroban-sdk", "src/storage.rs", "symbol", "store_data"),
		];
		const p = ask("how stellar contracts store data");
		expect(p.command).toEqual(["contracts", "store", "data"]);
		const [read] = rankRows(p, prose);
		const [noCommand] = rankRows({ ...p, command: null }, prose);
		expect(read.score).toBe(noCommand.score);
		expect(read.factors).toContain("cmd:0");
	});
});

describe("synonym map: each entry reaches the name the code uses", () => {
	const ENV = "stellar/rs-soroban-env";
	const SDK = "stellar/rs-soroban-sdk";
	// One case per entry: a q with the builder's word, the symbol it should
	// reach, and a generic symbol that outranked it before the map.
	const CASES: Record<string, { q: string; want: IndexRow; rival: IndexRow }> =
		{
			passkey: {
				q: "verify a passkey signature",
				want: row(
					SDK,
					"soroban-sdk/src/crypto.rs",
					"symbol",
					"secp256r1_verify",
				),
				rival: row("stellar/stellar-core", "src/a.cpp", "symbol", "Signature"),
			},
			webauthn: {
				q: "WebAuthn signature check",
				want: row(
					SDK,
					"soroban-sdk/src/crypto.rs",
					"symbol",
					"secp256r1_verify",
				),
				rival: row(
					"stellar/stellar-core",
					"src/a.cpp",
					"symbol",
					"SignatureChecker",
				),
			},
			p256: {
				q: "p256 signature check",
				want: row(
					ENV,
					"src/crypto/mod.rs",
					"symbol",
					"secp256r1_verify_signature",
				),
				rival: row(
					"stellar/stellar-core",
					"src/a.cpp",
					"symbol",
					"SignatureChecker",
				),
			},
			ecdsa: {
				q: "ecdsa recover",
				want: row(
					SDK,
					"soroban-sdk/src/crypto.rs",
					"symbol",
					"secp256k1_recover",
				),
				rival: row("stellar/stellar-core", "src/a.cpp", "symbol", "recover"),
			},
			ethereum: {
				q: "Ethereum signature recovery",
				want: row(
					SDK,
					"soroban-sdk/src/crypto.rs",
					"symbol",
					"secp256k1_recover",
				),
				rival: row(
					"stellar/stellar-core",
					"src/a.cpp",
					"symbol",
					"SignatureChecker",
				),
			},
			keccak: {
				q: "keccak hash",
				want: row(SDK, "soroban-sdk/src/crypto.rs", "symbol", "keccak256"),
				rival: row("stellar/stellar-core", "src/a.cpp", "symbol", "Hash"),
			},
			sep41: {
				q: "the SEP-41 interface",
				want: row(SDK, "soroban-sdk/src/token.rs", "symbol", "TokenInterface"),
				rival: row("stellar/stellar-core", "src/a.cpp", "symbol", "Interface"),
			},
			sep0041: {
				q: "SEP-0041 token",
				want: row(SDK, "soroban-sdk/src/token.rs", "symbol", "TokenInterface"),
				rival: row("stellar/stellar-core", "src/a.cpp", "symbol", "Token"),
			},
			sac: {
				q: "the SAC contract",
				want: row(
					ENV,
					"src/builtin/contract.rs",
					"symbol",
					"StellarAssetContract",
				),
				rival: row("stellar/js-stellar-sdk", "src/b.ts", "symbol", "Contract"),
			},
			signature: {
				q: "verify an ed25519 signature",
				want: row(
					ENV,
					"soroban-env-host/src/host.rs",
					"symbol",
					"verify_sig_ed25519",
				),
				rival: row("stellar/js-stellar-sdk", "src/b.ts", "symbol", "Signature"),
			},
			bls: {
				q: "BLS pairing",
				want: row(
					SDK,
					"soroban-sdk/src/crypto.rs",
					"symbol",
					"bls12_381_pairing",
				),
				rival: row("stellar/stellar-core", "src/a.cpp", "symbol", "Pairing"),
			},
		};

	it("a synonym in identifier form does not saturate the score: q=sac", () => {
		const rows = [
			row(
				ENV,
				"soroban-env-host/src/builtin_contracts/stellar_asset_contract/contract.rs",
				"symbol",
				"StellarAssetContract",
			),
			row(
				SDK,
				"soroban-sdk/src/testutils.rs",
				"symbol",
				"StellarAssetContract",
			),
		];
		const [first, second] = top("sac", rows);
		expect(first.score).toBe(100);
		expect(second.score).toBeLessThan(first.score);
	});

	it("every entry has a case", () => {
		expect(Object.keys(CASES).sort()).toEqual([...SYNONYMS.keys()].sort());
	});

	for (const [term, c] of Object.entries(CASES))
		it(`${term} -> ${SYNONYMS.get(term)?.alts.join(", ")}`, () => {
			const ranked = top(c.q, [c.rival, c.want]);
			expect(
				ranked[0]?.row.locator,
				ranked.map((x) => x.matchReason).join(" | "),
			).toBe(c.want.locator);
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
