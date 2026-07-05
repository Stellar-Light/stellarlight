/**
 * Code-Truth Ledger — pure, offline Soroban/Stellar code-signal parsers.
 *
 * NO network, NO DB, NO LLM. Given the raw text of a repo's key files (fetched
 * elsewhere via aliased GraphQL blobs) plus a tree listing, derive:
 *   - `stellarProof`  — the RELEVANCE gate (is this genuinely Stellar/multichain)
 *   - `codeFacts`     — the DEPTH facts (sdk version, contract macros, auth, …)
 *   - `farmScore`     — the anti-farm signal (with hard real-code caps)
 *   - `codeProofTier` — the code-proof-gated, two-key, over-filter-SAFE tier
 *
 * Every function biases toward KEEP-WHEN-UNCERTAIN. The dangerous error here is
 * a false negative (wrongly calling a real repo junk), so ambiguity never
 * produces `none`/`archive` — it produces `pending`/`community`. See
 * scratchpad/code-truth-safety-spec.md for the binding invariants this encodes.
 */

import { isProtected, type ProtectionSignals } from "./repo-allowlist";
import { versionStatusOf, type VersionStatus } from "./soroban-versions";

// ── Inputs ───────────────────────────────────────────────────────────────────

/** One fetched blob. `text` null while `present` true ⇒ unreadable (P1). */
export interface Blob {
	path: string; // repo-relative, e.g. "contracts/token/Cargo.toml"
	present: boolean; // the path exists in the tree
	text: string | null; // decoded UTF-8 text, or null if truncated/binary/oversize
	truncated?: boolean;
	binary?: boolean;
}

/** A tree entry from the GraphQL tree probe. `type:"commit"` = submodule (P2). */
export interface TreeEntry {
	path: string;
	type: "blob" | "tree" | "commit";
}

export interface ScanInput {
	fullName: string;
	blobs: Blob[]; // Cargo.toml(s), lib.rs / *.rs, package.json, stellar.toml
	tree: TreeEntry[]; // enumerated tree (may be partial — see treeComplete)
	treeComplete: boolean; // false ⇒ we did NOT fully enumerate (depth/count cap hit)
	hasGitmodules?: boolean; // a .gitmodules file exists at root
	// weak textual signal from cheap fields (README/topics/description)
	weakMention?: boolean; // literal stellar/soroban mention anywhere cheap
}

// ── Outputs ──────────────────────────────────────────────────────────────────

export type StellarProof =
	| "cargo-sdk"
	| "contract-macros"
	| "js-sdk"
	| "lang-sdk" // non-JS/Rust Stellar SDK dep: Swift/Kotlin/Flutter/Go/Python
	| "stellar-toml"
	| "weak-mention"
	| "none";

/** Why we could not conclude — drives the SAFE (keep) vs archivable distinction. */
export type ScanOutcome = "ok" | "error" | "incomplete";

export interface CodeFacts {
	sorobanSdkVersion: string | null; // raw requirement string, sourced fact
	versionStatus: VersionStatus;
	contractMacroCount: number; // #[contract]/#[contractimpl] occurrences
	hasAuthPatterns: boolean; // require_auth[_for_args]
	hasStoragePatterns: boolean; // env.storage().{instance,persistent,temporary}
	hasEvents: boolean; // env.events().publish
	isDeployableContract: boolean; // Cargo [lib] crate-type includes cdylib
	usesNoStd: boolean; // #![no_std]
	stellarJsDep: string | null; // matched @stellar/* dep name@version
}

export interface CodeSignals {
	stellarProof: StellarProof;
	outcome: ScanOutcome; // ok | error(unreadable) | incomplete(tree/submodule)
	scanNote?: string; // e.g. "submodule-contracts", "blob-unreadable"
	facts: CodeFacts;
	codeDepth: number; // 0..1
	farmScore: number; // 0..N
	farmFlags: string[]; // reasons, so explain can say WHY it declined
}

// ── Regexes (conservative; multichain-inclusive) ─────────────────────────────

// soroban-sdk as a Cargo dependency: bare "soroban-sdk = ...", table form
// [dependencies.soroban-sdk], or workspace inheritance "soroban-sdk.workspace".
const RE_CARGO_SOROBAN =
	/(^|\n)\s*soroban[-_]sdk\s*(=|\.|\{|\bworkspace\b)|\[[^\]]*dependencies\.soroban[-_]sdk\]/i;
// Extract a version requirement for soroban-sdk (bare or table "version = ").
const RE_CARGO_SOROBAN_VER =
	/soroban[-_]sdk\s*=\s*["']([^"']+)["']|soroban[-_]sdk\s*=\s*\{[^}]*\bversion\s*=\s*["']([^"']+)["']/i;
const RE_CARGO_SOROBAN_WORKSPACE = /soroban[-_]sdk\b[^\n]*\bworkspace\s*=\s*true/i;
// In a workspace root Cargo.toml, the dep lives under [workspace.dependencies].
const RE_WORKSPACE_DEP_SOROBAN =
	/\[workspace\.dependencies\][\s\S]*?soroban[-_]sdk\s*=\s*(?:["']([^"']+)["']|\{[^}]*\bversion\s*=\s*["']([^"']+)["'])/i;

const RE_CONTRACT_MACRO = /#\[\s*contract(?:impl|type|client|error|args)?\s*\]/g;
const RE_SOROBAN_USE = /\buse\s+soroban_sdk\b|\bsoroban_sdk\s*::/;
const RE_AUTH = /\brequire_auth(?:_for_args)?\s*\(/;
const RE_STORAGE = /\benv\s*\.\s*storage\s*\(\s*\)\s*\.\s*(instance|persistent|temporary)\b|\bstorage\(\)\.(instance|persistent|temporary)\b/;
const RE_EVENTS = /\benv\s*\.\s*events\s*\(\s*\)\s*\.\s*publish\b|\bevents\(\)\.publish\b/;
const RE_NOSTD = /#!\s*\[\s*no_std\s*\]/;
const RE_CDYLIB = /crate[-_]type\s*=\s*\[[^\]]*["']cdylib["']/i;

// JS/TS Stellar SDKs (dep name → the package that proves Stellar use).
const JS_SDK_DEPS = [
	"@stellar/stellar-sdk",
	"stellar-sdk",
	"js-stellar-sdk",
	"@stellar/stellar-base",
	"@stellar/freighter-api",
	"soroban-client",
	"@creit.tech/stellar-wallets-kit",
	"@stellar/wallet-sdk",
	"@stellar/typescript-wallet-sdk",
];

// Non-JS/Rust Stellar SDKs. A native mobile/backend app that depends on a
// Stellar SDK (Swift/Kotlin/Flutter/Go/Python) is a genuine Stellar repo — it
// just carries no Soroban contract, so codeDepth stays shallow but it must NOT
// read as `none` (e.g. lobstr Vault-Android, soneso stellar-swift-wallet-sdk).
// Patterns match the DEPENDENCY declaration, not incidental "stellar" mentions.
// Verified against real manifests before adding (Package.swift → stellar-ios-mac-sdk,
// build.gradle.kts → network.lightsail:stellar-sdk, go.mod → github.com/stellar/…).
const LANG_SDK_MARKERS: { lang: string; file: (name: string) => boolean; re: RegExp }[] = [
	// Rust STELLAR INFRA (no soroban-sdk, so it never reaches cargo-sdk): the
	// XDR/strkey/baselib/env/client crates and packages that ARE those crates
	// (stellar/rs-stellar-xdr, rs-stellar-archivist, rs-soroban-client,
	// xycloo/rs-ingest). Without this, canonical stellar-org tooling read as
	// proof=none — false "confidently not Stellar" on core infrastructure.
	// Verified against the real Cargo.tomls before adding.
	{
		lang: "rust-infra",
		file: (n) => n === "cargo.toml",
		re: /\[dependencies\.(stellar|soroban)-[a-z0-9_-]+\]|^\s*(stellar-(xdr|strkey|baselib|quorum[a-z0-9_-]*)|soroban-(client|env|spec|rpc)[a-z0-9_-]*)\s*=|^\s*name\s*=\s*"(stellar|soroban)-[a-z0-9_-]+"/im,
	},
	{ lang: "swift", file: (n) => n === "package.swift", re: /stellar[-_]?(ios|mac|wallet|swift|base)[-_]?(sdk|mac)?|stellarsdk|\.package\(\s*url:\s*["'][^"']*\/stellar/i },
	{ lang: "swift", file: (n) => n === "podfile", re: /pod\s+["'][^"']*stellar|stellar-ios-mac-sdk/i },
	{ lang: "kotlin", file: (n) => n === "build.gradle" || n === "build.gradle.kts", re: /network\.lightsail:stellar|[\w.]+:(kotlin|java)-stellar-sdk|["'][\w.]+:stellar-sdk:/i },
	{ lang: "dart", file: (n) => n === "pubspec.yaml", re: /stellar_flutter_sdk|stellar_[a-z]+_sdk/i },
	{ lang: "go", file: (n) => n === "go.mod", re: /github\.com\/stellar\//i },
	{ lang: "python", file: (n) => n === "requirements.txt" || n === "pyproject.toml" || n === "setup.py" || n === "setup.cfg", re: /\bstellar[-_]sdk\b|py-stellar-base|\bstellar_base\b/i },
];

// stellar.toml is only a proof if it has real SEP-1 content, not an empty file.
const RE_STELLAR_TOML = /\bNETWORK_PASSPHRASE\b|\[\[\s*CURRENCIES\s*\]\]|\bSIGNING_KEY\b|\bTRANSFER_SERVER\b|\bWEB_AUTH_ENDPOINT\b/i;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** A blob whose path exists but text is null = unreadable (oversize/binary). */
function isUnreadable(b: Blob): boolean {
	return b.present && (b.truncated === true || b.binary === true || b.text == null);
}

const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);

function readable(blobs: Blob[], predicate: (path: string) => boolean): Blob[] {
	return blobs.filter((b) => predicate(b.path) && b.present && b.text != null);
}

// ── stellarProof + code facts ────────────────────────────────────────────────

interface ProofResult {
	proof: StellarProof;
	facts: CodeFacts;
	outcome: ScanOutcome;
	scanNote?: string;
}

const EMPTY_FACTS: CodeFacts = {
	sorobanSdkVersion: null,
	versionStatus: "unknown",
	contractMacroCount: 0,
	hasAuthPatterns: false,
	hasStoragePatterns: false,
	hasEvents: false,
	isDeployableContract: false,
	usesNoStd: false,
	stellarJsDep: null,
};

/**
 * Derive stellarProof + code facts from fetched files.
 *
 * SAFETY (over-filter guards, safety-spec §8):
 *  - P1: any proof-file path present-but-unreadable ⇒ outcome "error" (never
 *        conclude `none` from an unreadable Cargo.toml/lib.rs/package.json).
 *  - P2: a submodule on a contract path (or a .gitmodules) ⇒ outcome
 *        "incomplete" (proof may be inside the submodule we didn't fetch).
 *  - P3: if the tree was not fully enumerated ⇒ outcome "incomplete" when no
 *        positive proof was found (a deeper contract may exist).
 *  A `none` is only ever emitted with outcome "ok" AND a fully-enumerated tree.
 */
export function detectStellarProof(input: ScanInput): ProofResult {
	const facts: CodeFacts = { ...EMPTY_FACTS };

	// Guard P1: unreadable proof file ⇒ do not conclude. Retry later.
	const proofPaths = (p: string) => {
		const b = basename(p).toLowerCase();
		return b === "cargo.toml" || b.endsWith(".rs") || b === "package.json" || b === "stellar.toml" || LANG_SDK_MARKERS.some((m) => m.file(b));
	};
	const unreadable = input.blobs.find((b) => proofPaths(b.path) && isUnreadable(b));
	if (unreadable) {
		return { proof: "none", facts, outcome: "error", scanNote: "blob-unreadable" };
	}

	// Guard P2: submodule on a contract path ⇒ incomplete (proof may be nested).
	const submoduleOnContractPath = input.tree.some(
		(e) => e.type === "commit" && /(^|\/)(contracts?|crates|packages)(\/|$)/i.test(e.path),
	);
	if (submoduleOnContractPath || input.hasGitmodules) {
		// Still scan what we have; if we find a positive proof, great — otherwise
		// we must NOT say `none`.
		const partial = scanFiles(input, facts);
		if (partial.proof !== "none") return { ...partial, outcome: "ok" };
		return { proof: "none", facts: partial.facts, outcome: "incomplete", scanNote: "submodule-contracts" };
	}

	const scanned = scanFiles(input, facts);

	// Guard P3: no positive proof but the tree wasn't fully enumerated ⇒
	// incomplete (a contract may live deeper than we walked).
	if (scanned.proof === "none" && !input.treeComplete) {
		return { proof: "none", facts: scanned.facts, outcome: "incomplete", scanNote: "tree-incomplete" };
	}
	return { ...scanned, outcome: "ok" };
}

/** The actual signal extraction over readable blobs (no outcome decisions). */
function scanFiles(input: ScanInput, facts: CodeFacts): { proof: StellarProof; facts: CodeFacts } {
	const cargoBlobs = readable(input.blobs, (p) => basename(p).toLowerCase() === "cargo.toml");
	const rsBlobs = readable(input.blobs, (p) => p.toLowerCase().endsWith(".rs"));
	const pkgBlobs = readable(input.blobs, (p) => basename(p).toLowerCase() === "package.json");
	const tomlBlobs = readable(input.blobs, (p) => basename(p).toLowerCase() === "stellar.toml");

	// ---- Rust / Soroban ----
	let cargoHasSoroban = false;
	let workspaceInherited = false;
	for (const b of cargoBlobs) {
		const t = b.text as string;
		if (RE_CARGO_SOROBAN.test(t)) {
			cargoHasSoroban = true;
			// version: prefer a concrete requirement; workspace-inherited handled below
			const m = t.match(RE_CARGO_SOROBAN_VER);
			if (m && (m[1] || m[2]) && !facts.sorobanSdkVersion) {
				facts.sorobanSdkVersion = m[1] || m[2];
			}
			if (RE_CARGO_SOROBAN_WORKSPACE.test(t)) workspaceInherited = true;
		}
		// A workspace ROOT Cargo.toml may carry the real dep under
		// [workspace.dependencies] — resolves the workspace-inheritance case (P0 fixture #1).
		const wm = t.match(RE_WORKSPACE_DEP_SOROBAN);
		if (wm) {
			cargoHasSoroban = true;
			if (!facts.sorobanSdkVersion && (wm[1] || wm[2])) facts.sorobanSdkVersion = wm[1] || wm[2];
		}
	}
	// Whether the version is workspace-inherited or not, if we saw the dep it counts.
	void workspaceInherited;

	// Contract macros / soroban_sdk usage across all .rs files (any depth).
	let macroCount = 0;
	let sorobanUse = false;
	for (const b of rsBlobs) {
		const t = b.text as string;
		const matches = t.match(RE_CONTRACT_MACRO);
		if (matches) macroCount += matches.length;
		if (RE_SOROBAN_USE.test(t)) sorobanUse = true;
		if (!facts.hasAuthPatterns && RE_AUTH.test(t)) facts.hasAuthPatterns = true;
		if (!facts.hasStoragePatterns && RE_STORAGE.test(t)) facts.hasStoragePatterns = true;
		if (!facts.hasEvents && RE_EVENTS.test(t)) facts.hasEvents = true;
		if (!facts.usesNoStd && RE_NOSTD.test(t)) facts.usesNoStd = true;
	}
	facts.contractMacroCount = macroCount;
	if (cargoBlobs.some((b) => RE_CDYLIB.test(b.text as string))) facts.isDeployableContract = true;
	facts.versionStatus = versionStatusOf(facts.sorobanSdkVersion);

	// ---- JS / TS Stellar SDK ----
	let jsDep: string | null = null;
	for (const b of pkgBlobs) {
		let json: unknown;
		try {
			json = JSON.parse(b.text as string);
		} catch {
			continue; // malformed package.json — treat as no-signal here, not a hard error
		}
		const maps = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "resolutions"];
		const obj = json as Record<string, Record<string, string> | undefined>;
		for (const map of maps) {
			const deps = obj[map];
			if (!deps) continue;
			for (const dep of JS_SDK_DEPS) {
				if (deps[dep]) {
					jsDep = `${dep}@${deps[dep]}`;
					break;
				}
			}
			if (jsDep) break;
		}
		if (jsDep) break;
	}
	facts.stellarJsDep = jsDep;

	// ---- Other-language Stellar SDK (Swift/Kotlin/Flutter/Go/Python) ----
	let langDep: string | null = null;
	if (!jsDep) {
		for (const b of input.blobs) {
			if (!b.present || b.text == null) continue;
			const name = basename(b.path).toLowerCase();
			const hit = LANG_SDK_MARKERS.find((m) => m.file(name) && m.re.test(b.text as string));
			if (hit) {
				langDep = `${hit.lang}:${name}`;
				break;
			}
		}
	}
	if (langDep && !facts.stellarJsDep) facts.stellarJsDep = langDep;

	// ---- stellar.toml (SEP-1) ----
	const hasStellarToml = tomlBlobs.some((b) => RE_STELLAR_TOML.test(b.text as string));

	// ---- Priority ordering (strongest → weakest) ----
	if (cargoHasSoroban) return { proof: "cargo-sdk", facts };
	if (macroCount > 0 || sorobanUse) return { proof: "contract-macros", facts };
	if (jsDep) return { proof: "js-sdk", facts };
	if (langDep) return { proof: "lang-sdk", facts };
	if (hasStellarToml) return { proof: "stellar-toml", facts };
	if (input.weakMention) return { proof: "weak-mention", facts };
	return { proof: "none", facts };
}

// ── codeDepth ────────────────────────────────────────────────────────────────

/** 0..1 depth score. A real deployable contract on a current sdk reaches ~1.0 at 0 stars. */
export function computeCodeDepth(proof: StellarProof, facts: CodeFacts): number {
	const strongRust = proof === "cargo-sdk" || proof === "contract-macros";
	if (!strongRust) {
		// js-sdk / stellar-toml proofs are real but shallow → capped at 0.5.
		if (proof === "js-sdk" || proof === "lang-sdk" || proof === "stellar-toml") return 0.35;
		return 0; // weak-mention / none
	}
	let d = 0.4; // has soroban proof
	if (facts.isDeployableContract) d += 0.25;
	d += 0.2 * Math.min(1, facts.contractMacroCount / 6);
	if (facts.versionStatus === "current") d += 0.15;
	// small credit for real contract mechanics
	if (facts.hasAuthPatterns || facts.hasStoragePatterns || facts.hasEvents) d += 0.05;
	return Math.max(0, Math.min(1, d));
}

// ── farmScore (additive, with hard real-code caps) ───────────────────────────

export interface FarmInput {
	proof: StellarProof;
	facts: CodeFacts;
	isFork?: boolean;
	forkOfTemplate?: boolean; // fork whose parent is a known scaffold/template
	commitCount?: number | null;
	repoContributorCount?: number | null; // REPO-scoped author count (P5), NOT org mentionableUsers
	diskUsageKb?: number | null;
	nameLooksTemplate?: boolean; // e.g. "soroban-hello-world", "*-template", "*-boilerplate"
}

/**
 * Additive farm score with hard safety caps (safety-spec H8 + P5):
 *  - ANY positive Stellar proof (cargo-sdk/contract-macros/js-sdk/stellar-toml)
 *    forces farmScore = 0. Real Stellar code is never farm.
 *  - contributorInflation uses the REPO-scoped author count, never org-wide.
 * Designed additive so Raph's contributor-graph verdict folds in as one more
 * flag next week.
 */
export function computeFarmScore(input: FarmInput): { score: number; flags: string[] } {
	// H8/P5: any real proof ⇒ not farm.
	if (input.proof === "cargo-sdk" || input.proof === "contract-macros" || input.proof === "js-sdk" || input.proof === "lang-sdk" || input.proof === "stellar-toml") {
		return { score: 0, flags: [] };
	}
	const flags: string[] = [];
	if (input.forkOfTemplate && (input.commitCount ?? 99) <= 3) flags.push("isTrivialFork");
	if ((input.commitCount ?? 99) <= 2) flags.push("lowCommitCount");
	// contributorInflation: many REPO authors but tiny code + few commits (the farm fingerprint).
	if (
		(input.repoContributorCount ?? 0) >= 8 &&
		(input.diskUsageKb ?? Infinity) < 200 &&
		(input.commitCount ?? 99) < 10
	) {
		flags.push("contributorInflation");
	}
	// scaffoldClone: a Rust/contract shell that implements nothing.
	if (
		input.nameLooksTemplate &&
		input.facts.contractMacroCount === 0 &&
		!input.facts.hasAuthPatterns &&
		!input.facts.hasStoragePatterns &&
		!input.facts.hasEvents
	) {
		flags.push("scaffoldClone");
	}
	return { score: flags.length, flags };
}

// ── codeProofTier — the over-filter-SAFE, two-key tier decision ──────────────

export interface TierInput {
	proof: StellarProof;
	outcome: ScanOutcome;
	farmScore: number;
	codeDepth: number;
	isArchived?: boolean | null; // GitHub-archived = ground truth
	lastCommitAt?: string | Date | null;
	stars?: number | null;
	repoScoreLabel?: string | null;
	protection: ProtectionSignals;
	now?: number; // injectable clock for tests
}

const STALE_MS = 730 * 86_400_000;

/**
 * The code-proof-gated tier decision. Replaces the old single-key
 * `isArchived || (stale && stars<3) → archive`. Over-filter-safe by construction:
 *
 *  - PROTECTED repos (allowlist / scfAwarded / curated) can NEVER be archived.
 *  - A non-"ok" outcome (error/incomplete) NEVER archives — returns null so the
 *    caller leaves the existing tier untouched (never-demote-on-doubt, H2/P3).
 *  - TWO-KEY (H4/P4): archive requires `isArchived` (GitHub ground truth) OR
 *    `farmScore>=2` OR (`none` AND farmScore>=1). A bare `none`, or `none`+stale
 *    with NO farm fingerprint, is `community`+unverified — never archived.
 *  - `weak-mention` / `none`(alive) → community + unverifiedStellar (soft, not
 *    surfaced), never archive.
 *
 * Returns `null` to mean "make NO tier change" (the safe default under doubt).
 */
export function codeProofTier(
	input: TierInput,
): { tier: "quality" | "community" | "archive"; unverifiedStellar: boolean; reason: string[] } | null {
	// Doubt ⇒ no change (never demote on error/incomplete scan).
	if (input.outcome !== "ok") return null;

	// Protected ⇒ never archive/soft-filter; at most promote to quality.
	if (isProtected(input.protection)) {
		if (input.proof === "cargo-sdk" || input.proof === "contract-macros") {
			if (input.codeDepth >= 0.6) return { tier: "quality", unverifiedStellar: false, reason: ["protected", "code-depth"] };
		}
		return { tier: "community", unverifiedStellar: false, reason: ["protected"] };
	}

	const now = input.now ?? Date.now();
	const stale = !input.lastCommitAt || now - new Date(input.lastCommitAt).getTime() > STALE_MS;
	const lowStar = (input.stars ?? 0) < 3;
	const reason: string[] = [];

	// ---- archive (two-key) ----
	if (input.isArchived) return { tier: "archive", unverifiedStellar: false, reason: ["github-archived"] };
	if (input.farmScore >= 2) return { tier: "archive", unverifiedStellar: false, reason: [`farm:${input.farmScore}`] };
	if (input.proof === "none" && input.farmScore >= 1) {
		return { tier: "archive", unverifiedStellar: false, reason: ["none", `farm:${input.farmScore}`] };
	}
	// none + stale + low-star with NO farm fingerprint is NOT enough (P4): a
	// finished/parked but legit contract must not be archived on staleness alone.
	// (It stays community + unverified, sinks softly, but remains a reference.)

	// ---- quality (code-proven) ----
	if ((input.proof === "cargo-sdk" || input.proof === "contract-macros") && input.codeDepth >= 0.6) {
		reason.push("code-depth");
		return { tier: "quality", unverifiedStellar: false, reason };
	}

	// ---- community, with soft unverified flag for weak/none ----
	const unverified = input.proof === "none" || input.proof === "weak-mention";
	if (unverified) reason.push(input.proof);
	if (stale) reason.push("stale");
	if (lowStar) reason.push("low-star");
	return { tier: "community", unverifiedStellar: unverified, reason };
}

/** Assemble the full CodeSignals record from a scan input (pure orchestrator). */
export function computeCodeSignals(input: ScanInput, farm: Omit<FarmInput, "proof" | "facts">): CodeSignals {
	const { proof, facts, outcome, scanNote } = detectStellarProof(input);
	const codeDepth = computeCodeDepth(proof, facts);
	const { score: farmScore, flags: farmFlags } = computeFarmScore({ proof, facts, ...farm });
	return { stellarProof: proof, outcome, scanNote, facts, codeDepth, farmScore, farmFlags };
}
