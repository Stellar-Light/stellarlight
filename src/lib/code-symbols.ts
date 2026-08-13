/**
 * Code-symbol extraction — pure, offline, same idiom as code-signals.ts.
 *
 * The gap this closes (gist "honest gap 3", structure ≠ semantics): the index
 * knew a repo HAS a deployable contract with auth+storage, but not WHAT it
 * implements — "find a Soroban escrow implementation" matched on README luck.
 * The scanner already fetches a repo's actual Rust sources; this extracts the
 * public API surface (fn/struct/enum/trait names) so search can match code
 * CONTENT: `release_escrow`, `EscrowContract`, `claim_milestone` are stronger
 * evidence a repo implements escrow than any description sentence.
 *
 * Precision rules:
 *  - `pub` items only — the deliberate API surface, not internals;
 *  - generic Rust/Soroban plumbing names are dropped (new/default/from/...),
 *    they'd make every contract match every query;
 *  - .rs sources only (Cargo.toml/tests are skipped — test fns aren't the API);
 *  - deduped case-insensitively, capped, in file order (the fetch unit sorts
 *    sources biggest-first, so the cap keeps symbols from the real logic).
 */

import { stripCommentsAndStrings } from "./code-depth";

export interface SymbolBlob {
	path: string;
	text: string | null;
}

/** Universal Rust/trait plumbing — present in nearly every crate, zero
 * discriminating signal for "what does this implement". */
const NOISE = new Set([
	"new",
	"default",
	"from",
	"into",
	"try_from",
	"try_into",
	"clone",
	"fmt",
	"eq",
	"ne",
	"cmp",
	"hash",
	"drop",
	"deref",
	"next",
	"len",
	"is_empty",
	"as_ref",
	"as_mut",
	"borrow",
	"to_string",
	"get",
	"set",
	"init",
	"main",
	"error",
	"contract",
	"client",
	"test",
]);

const MAX_SYMBOLS = 60;

// pub fn / pub(crate) fn / pub async fn NAME(  — and pub struct/enum/trait NAME
// finding 7: the visibility group is bounded + newline-free — the unbounded
// [^)]* backtracked quadratically on adversarial 'pub (' floods (12.5s per
// regex on a 400KB blob). pub(crate)/pub(super)/pub(in path) all fit in 64.
const FN_RE =
	/\bpub(?:\s*\([^)\n]{0,64}\))?\s+(?:async\s+)?fn\s+([a-z_][a-z0-9_]*)/g;
const TYPE_RE =
	/\bpub(?:\s*\([^)\n]{0,64}\))?\s+(?:struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)/g;

const isTestPath = (p: string) =>
	/(^|\/)(tests?|testing|test[-_]?utils?|fixtures?|mocks?|benches)\//i.test(
		p,
	) ||
	/_tests?(\/|\.rs$)/i.test(p) ||
	/(^|\/)tests?\.rs$/i.test(p);

/** Extract the public code-symbol surface from a repo's fetched sources. */
export function extractCodeSymbols(blobs: SymbolBlob[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const add = (name: string) => {
		const key = name.toLowerCase();
		if (name.length < 4 || NOISE.has(key) || seen.has(key)) return;
		seen.add(key);
		if (out.length < MAX_SYMBOLS) out.push(name);
	};
	for (const b of blobs) {
		if (out.length >= MAX_SYMBOLS) break;
		if (!b.text || !b.path.toLowerCase().endsWith(".rs") || isTestPath(b.path))
			continue;
		for (const m of b.text.matchAll(FN_RE)) add(m[1]);
		for (const m of b.text.matchAll(TYPE_RE)) add(m[1]);
	}
	return out;
}

/** Search-normalized form of a symbol list: snake_case and camelCase split
 * into words so word-boundary matching works ("escrow" ⇢ "release_escrow" /
 * "EscrowContract"). Regex \b treats `_` as a word char, so without this a
 * symbol hit could never fire. */
export function symbolsHaystack(symbols: unknown): string {
	if (!Array.isArray(symbols)) return "";
	const list = symbols.filter((s): s is string => typeof s === "string");
	const split = list
		.join(" ")
		.replace(/_/g, " ")
		// F2 (audit: groth16/secp256r1/ed25519/scval unfindable): split camelCase
		// INCLUDING digit→Upper boundaries (Groth16Verifier → groth16 verifier)…
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.toLowerCase();
	// …and ALSO keep each symbol's raw concatenated lowercase form, so a
	// one-token query for the whole identifier (scval, ed25519) boundary-matches
	// even when the split form breaks it apart (ScVal → "sc val" + "scval").
	const raw = list.map((s) => s.replace(/_/g, "").toLowerCase()).join(" ");
	return `${split} ${raw}`;
}

// ── Contract interface truth (repo-intel slice 4) ──────────────────────────
// Symbols say WHAT a contract implements; the interface says HOW TO CALL IT.
// For each `#[contractimpl]` impl block we capture the full pub fn SIGNATURES
// (name, args, return type) — the deployed contract's actual ABI, prefixed
// with the impl's contract name so multi-contract repos (soroban-examples)
// stay legible. The leading host-injected `env: Env` param is stripped, same
// as the SDK's own contractspec — what remains is what a CALLER passes.

const MAX_IFACE_FNS = 48;
const MAX_SIG_LEN = 200;

// Group 1 = trait name when the impl is `impl Trait for Struct` (FxDAO
// idiom), group 2 = the contract type. Trait-impl methods CANNOT be `pub`
// in Rust — the macro exports all of them; inherent impls export only
// `pub fn`. The signature matcher mirrors exactly that rule.
const IMPL_RE =
	/#\s*\[\s*contractimpl\s*\]\s*(?:pub\s+)?impl(?:\s*<[^>\n]{0,80}>)?\s+(?:([A-Za-z_][A-Za-z0-9_]*)\s+for\s+)?([A-Za-z_][A-Za-z0-9_]*)/g;
const SIG_RE =
	/\b(pub\s+)?fn\s+([a-z_][a-z0-9_]*)\s*(?:<[^>\n]{0,80}>)?\s*(\([^)]{0,600}\))\s*(->\s*[^;{]{1,160})?\{/g;

/** Signature surface of every #[contractimpl] block across a repo's fetched
 * Rust sources. Entries look like `Swap.swap(a: Address, amount: i128) -> i128`.
 * Fns whose args the bounded regex can't capture (nested-paren tuple args) are
 * SKIPPED, never truncated mid-type — missing beats lying. */
export function extractContractInterface(blobs: SymbolBlob[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const b of blobs) {
		if (out.length >= MAX_IFACE_FNS) break;
		if (!b.text || !b.path.toLowerCase().endsWith(".rs") || isTestPath(b.path))
			continue;
		if (!/#\s*\[\s*contractimpl\s*\]/.test(b.text)) continue;
		const clean = stripCommentsAndStrings(b.text);
		for (const im of clean.matchAll(IMPL_RE)) {
			const isTraitImpl = !!im[1];
			const contract = im[2];
			// Brace-match the impl block so signatures never leak in from a
			// neighbouring non-contract impl in the same file.
			const open = clean.indexOf("{", im.index + im[0].length);
			if (open < 0) continue;
			let depth = 1;
			let i = open + 1;
			while (i < clean.length && depth > 0) {
				if (clean[i] === "{") depth++;
				else if (clean[i] === "}") depth--;
				i++;
			}
			const block = clean.slice(open + 1, i - 1);
			for (const m of block.matchAll(SIG_RE)) {
				// bare fn is the exported surface ONLY in trait impls; in
				// inherent impls the macro exports pub fns alone — a bare fn
				// there is a private helper and must not enter the ABI.
				if (!m[1] && !isTraitImpl) continue;
				const name = m[2];
				const key = `${contract}.${name}`.toLowerCase();
				if (seen.has(key)) continue;
				seen.add(key);
				const args = m[3]
					.replace(/\s+/g, " ")
					.replace(/^\(\s*_?e(?:nv)?\s*:\s*&?\s*Env\s*(?:,\s*|(?=\)))/, "(")
					.replace(/,?\s*\)$/, ")");
				const ret = m[4] ? ` ${m[4].replace(/\s+/g, " ").trim()}` : "";
				let sig = `${contract}.${name}${args}${ret === " -> ()" ? "" : ret}`;
				if (sig.length > MAX_SIG_LEN) sig = `${sig.slice(0, MAX_SIG_LEN)}…`;
				out.push(sig);
				if (out.length >= MAX_IFACE_FNS) break;
			}
			if (out.length >= MAX_IFACE_FNS) break;
		}
	}
	return out;
}

// ── JS/TS (gist gap 1, phase 1: facts, not scores) ─────────────────────────
// The ~1,900 non-Rust repos carry no code-content signal at all. Phase 1
// extracts (a) the exported symbol surface and (b) WHICH Stellar SDK
// capabilities the code actually invokes — "real wallet integration vs
// boilerplate" is legible from whether tx-building/signing/SEP flows appear.
// Scoring stays flat (0.3) until a JS answer key is mined; these are facts.
// All regexes bounded + newline-free in variable parts (finding-7 lesson).

const JS_EXPORT_RES = [
	// export function foo / export async function foo / export class Foo
	/\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][A-Za-z0-9_$]{2,60})/g,
	// export const foo = / export let foo =
	/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]{2,60})\s*=/g,
	// module.exports.foo = / exports.foo =
	/\b(?:module\.)?exports\.([A-Za-z_$][A-Za-z0-9_$]{2,60})\s*=/g,
];

const JS_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;

/** Exported-symbol surface for JS/TS sources — same contract as the Rust
 * extractor: pub(lic) API only, noise filtered, deduped, capped. */
export function extractJsSymbols(blobs: SymbolBlob[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const add = (name: string) => {
		const key = name.toLowerCase();
		if (name.length < 4 || NOISE.has(key) || seen.has(key)) return;
		seen.add(key);
		if (out.length < MAX_SYMBOLS) out.push(name);
	};
	for (const b of blobs) {
		if (out.length >= MAX_SYMBOLS) break;
		if (!b.text || !JS_EXT.test(b.path) || isTestPath(b.path)) continue;
		for (const re of JS_EXPORT_RES) {
			for (const m of b.text.matchAll(re)) add(m[1]);
		}
	}
	return out;
}

/** Stellar SDK capability tags — WHAT the dapp actually does with the SDK.
 * Each tag fires on concrete call/import patterns, not vibes; the tag set is
 * closed (documented enum) so consumers can filter on it. */
const SDK_CAPABILITY_PATTERNS: Array<[tag: string, re: RegExp]> = [
	[
		"tx-building",
		/\bTransactionBuilder\b|\.addOperation\(|\bOperation\.(payment|invokeHostFunction|createAccount|changeTrust)\b/,
	],
	[
		"signing",
		/\bsignTransaction\b|\.sign\(\s*[A-Za-z_$]|\bKeypair\.fromSecret\b|\bsignAndSend\b|\bsignMessage\b|\bsignAuthEntry\b/,
	],
	[
		"soroban-rpc",
		/\bSorobanRpc\b|\brpc\.Server\b|\bsimulateTransaction\b|\bprepareTransaction\b|\bsendTransaction\b|soroban-rpc|\bSorobanDataBuilder\b/,
	],
	[
		"contract-invoke",
		/\bnew Contract\(|\bContract\(|[Cc]ontract\.call\(|\binvokeHostFunction\b|\bassembleTransaction\b|\bfuncArgsToScVals\b|\bnativeToScVal\b|\bscValToNative\b|\bAssembledTransaction\b|\bContractClient\b|\bContractSpec\b/,
	],
	[
		"horizon",
		/\bHorizon\.Server\b|horizon\.stellar\.org|\bserver\.loadAccount\b|\bserver\.submitTransaction\b|\bTransactionBuilder\.fromXDR\b|\bStrKey\./,
	],
	["sep10-auth", /\bWebAuth\b|sep-?10|\bchallenge\s*transaction/i],
	["sep24-ramp", /sep-?24|\binteractive\s*deposit|\bTransferServerService\b/i],
	[
		"wallet-kit",
		/stellar-wallets-kit|@stellar\/wallet-sdk|\bfreighter(-api)?\b|albedo/i,
	],
	// EXPORTS the standard wallet-API surface (freighter-api/xbull/rabet shape).
	// Templates CONSUME these functions (import them); only an actual wallet
	// provides them. Blind-spot fix (2026-07-10, lobstr-browser-extension).
	[
		"wallet-provider",
		/\bexport\s+(?:const|async\s+function|function)\s+(?:getPublicKey|signTransaction|signMessage|signAuthEntry|requestAccess)\b/,
	],
	["passkey", /passkey-kit|\bPasskeyKit\b|webauthn/i],
	// Agent-payments era (2026-08-11, from real idioms: rozo-mpprouter's x402
	// resource-server + the @stellar/mpp charge client). Import paths and
	// concrete identifiers only — a prose mention of "x402" in a comment is
	// not an implementation.
	[
		"x402",
		/@x402\/|\bX-PAYMENT\b|X402[A-Z][a-z]|[a-z]X402\b|x402[-_][a-z]/,
	],
	[
		"mpp",
		/@stellar\/mpp|\bmpp\/(?:charge|session)\b|\bMpp(?:Charge|Session|Client)\b/,
	],
	["fee-bump", /\bfeeBump\b|\bTransactionBuilder\.buildFeeBumpTransaction\b/i],
];

/** The closed capability tag set, for filter validation + spec enums. */
export const SDK_CAPABILITY_TAGS: readonly string[] = SDK_CAPABILITY_PATTERNS.map(
	([tag]) => tag,
).sort();

/**
 * Language-frontier capability idioms (2026-08-13 Raven-lens gap: official
 * Python/Go SDKs and the Kotlin anchor-platform served zero capabilities —
 * the detector was JS-only). Same CLOSED tag set; per-language patterns
 * fire only in files that pass a stellar-context gate, so a generic
 * `TransactionBuilder` in some other chain's Java SDK can never cross-fire.
 */
const PY_EXT = /\.py$/i;
const PY_CONTEXT = /stellar_sdk|from stellar_sdk|import stellar_sdk/;
const PY_CAPABILITY_PATTERNS: Array<[tag: string, re: RegExp]> = [
	["tx-building", /\bTransactionBuilder\b|\.append_[a-z_]*op\(/],
	["signing", /\bKeypair\.from_secret\b|\.sign\(/],
	["soroban-rpc", /\bSorobanServer\b|\bsimulate_transaction\b|\bsend_transaction\b/],
	["horizon", /\bServer\(|\bsubmit_transaction\b|horizon\.stellar\.org/],
	["contract-invoke", /\binvoke_contract_function\b|\bContractClient\b|\bscval\b|\bInvokeHostFunction\b/],
	["sep10-auth", /\bbuild_challenge_transaction\b|\bread_challenge_transaction\b|sep-?10|\bWebAuth\b/i],
	["sep24-ramp", /sep-?24|\binteractive\s*deposit|TransferServer/i],
	["fee-bump", /fee_bump|FeeBumpTransaction/i],
];
const GO_EXT = /\.go$/i;
const GO_CONTEXT = /github\.com\/stellar\/go|stellar\/go\/(txnbuild|clients|keypair)/;
const GO_CAPABILITY_PATTERNS: Array<[tag: string, re: RegExp]> = [
	["tx-building", /\btxnbuild\./],
	["signing", /\bkeypair\.(Parse|MustParse|Random)\b|\.Sign\(/],
	["horizon", /\bhorizonclient\.|\bSubmitTransaction\b/],
	["soroban-rpc", /soroban[a-z]*rpc|\bSimulateTransaction\b/i],
	["contract-invoke", /\bInvokeHostFunction\b/],
	["sep10-auth", /sep-?10|\bChallengeTransaction\b|\bReadChallengeTx\b|\bwebauth\b/i],
	["sep24-ramp", /sep-?24|interactive\s*deposit/i],
	["fee-bump", /\bFeeBumpTransaction\b/],
];
const JVM_EXT = /\.(kt|java)$/i;
const JVM_CONTEXT = /org\.stellar\.(sdk|anchor)|stellar\.sdk/;
const JVM_CAPABILITY_PATTERNS: Array<[tag: string, re: RegExp]> = [
	["tx-building", /\bTransactionBuilder\b/],
	["signing", /\bKeyPair\.fromSecretSeed\b|\.sign\(/],
	["soroban-rpc", /\bSorobanServer\b|\bsimulateTransaction\b/],
	["horizon", /\bServer\(|horizon\.stellar\.org|\bsubmitTransaction\b/],
	["contract-invoke", /\bInvokeHostFunctionOperation\b|\bContractClient\b/],
	["sep10-auth", /\bSep10Challenge\b|\bSep10\b|sep-?10/i],
	["sep24-ramp", /\bSep24\b|sep-?24|interactive\s*(deposit|withdraw)/i],
	["fee-bump", /\bFeeBumpTransaction\b/],
];
const LANG_FAMILIES: Array<
	[ext: RegExp, context: RegExp, patterns: Array<[string, RegExp]>]
> = [
	[PY_EXT, PY_CONTEXT, PY_CAPABILITY_PATTERNS],
	[GO_EXT, GO_CONTEXT, GO_CAPABILITY_PATTERNS],
	[JVM_EXT, JVM_CONTEXT, JVM_CAPABILITY_PATTERNS],
];

export function detectSdkCapabilities(blobs: SymbolBlob[]): string[] {
	const tags = new Set<string>();
	for (const b of blobs) {
		if (!b.text) continue;
		if (JS_EXT.test(b.path)) {
			for (const [tag, re] of SDK_CAPABILITY_PATTERNS) {
				if (!tags.has(tag) && re.test(b.text)) tags.add(tag);
			}
			continue;
		}
		for (const [ext, context, patterns] of LANG_FAMILIES) {
			if (!ext.test(b.path)) continue;
			if (!context.test(b.text)) break; // right language, no stellar context
			for (const [tag, re] of patterns) {
				if (!tags.has(tag) && re.test(b.text)) tags.add(tag);
			}
			break;
		}
	}
	return [...tags].sort();
}
