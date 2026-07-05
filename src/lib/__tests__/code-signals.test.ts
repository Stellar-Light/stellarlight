import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	type Blob,
	codeProofTier,
	computeCodeSignals,
	computeFarmScore,
	detectStellarProof,
	type ScanInput,
} from "../code-signals";
import { isAllowlisted, isProtected } from "../repo-allowlist";
import { versionStatusOf } from "../soroban-versions";

// Deterministic clock so staleness math is stable.
const NOW = Date.parse("2026-07-04T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

/** Build a ScanInput from a map of path→text (present + readable by default). */
function scanOf(
	files: Record<string, string | null>,
	opts: Partial<ScanInput> = {},
): ScanInput {
	const blobs: Blob[] = Object.entries(files).map(([path, text]) => ({
		path,
		present: true,
		text,
		truncated: text === null ? true : false,
	}));
	const tree = Object.keys(files).map((path) => ({ path, type: "blob" as const }));
	return { fullName: "test/repo", blobs, tree, treeComplete: true, ...opts };
}

const CARGO_SDK = `[package]\nname = "token"\n[dependencies]\nsoroban-sdk = "22.0.3"\n[lib]\ncrate-type = ["cdylib"]\n`;
const LIB_RS = `#![no_std]\nuse soroban_sdk::{contract, contractimpl, Env, Address};\n#[contract]\npub struct Token;\n#[contractimpl]\nimpl Token {\n  pub fn transfer(env: Env, from: Address) { from.require_auth(); env.storage().persistent().set(&1, &2); env.events().publish((), ()); }\n}\n`;

describe("versionStatusOf — the constant that must never be wrong", () => {
	it("maps a current major to current", () => {
		expect(versionStatusOf("26.0.0")).toBe("current");
	});
	it("maps a recent supported major to supported", () => {
		expect(versionStatusOf("22.0.3")).toBe("supported");
	});
	it("maps a very old major to deprecated", () => {
		expect(versionStatusOf("1.0.0")).toBe("deprecated");
	});
	it("NEVER calls a pre-release/rc deprecated — returns unknown", () => {
		expect(versionStatusOf("22.0.0-rc.3")).toBe("unknown");
	});
	it("returns unknown for git/path/workspace/unpinned deps", () => {
		expect(versionStatusOf("*")).toBe("unknown");
		expect(versionStatusOf("workspace")).toBe("unknown");
		expect(versionStatusOf("git+https://github.com/stellar/rs-soroban-sdk")).toBe("unknown");
		expect(versionStatusOf("../local-sdk")).toBe("unknown");
		expect(versionStatusOf(null)).toBe("unknown");
	});
	it("treats a newer-than-table major as current, never deprecated", () => {
		expect(versionStatusOf("99.0.0")).toBe("current");
	});
});

describe("stellarProof — keep genuine Stellar/multichain, drop junk", () => {
	it("FIXTURE #1: workspace-inherited soroban-sdk → cargo-sdk (KEEP)", () => {
		// member crate inherits, root declares the real dep under [workspace.dependencies]
		const s = scanOf({
			"contracts/token/Cargo.toml": "[dependencies]\nsoroban-sdk.workspace = true\n",
			"Cargo.toml": '[workspace]\nmembers = ["contracts/*"]\n[workspace.dependencies]\nsoroban-sdk = "22.0.3"\n',
		});
		const r = detectStellarProof(s);
		expect(r.proof).toBe("cargo-sdk");
		expect(r.outcome).toBe("ok");
		expect(r.facts.sorobanSdkVersion).toBe("22.0.3");
	});

	it("FIXTURE #2: contract at monorepo depth 3 → cargo-sdk (KEEP)", () => {
		const s = scanOf({
			"packages/contracts/token/Cargo.toml": CARGO_SDK,
			"packages/contracts/token/src/lib.rs": LIB_RS,
		});
		const r = detectStellarProof(s);
		expect(r.proof).toBe("cargo-sdk");
		expect(r.facts.contractMacroCount).toBeGreaterThanOrEqual(2);
		expect(r.facts.isDeployableContract).toBe(true);
		expect(r.facts.hasAuthPatterns).toBe(true);
	});

	it("FIXTURE #3: contract entry not named lib.rs (contract.rs) still detected", () => {
		const s = scanOf({ "src/contract.rs": LIB_RS });
		expect(detectStellarProof(s).proof).toBe("contract-macros");
	});

	it("FIXTURE #5: js-sdk frontend (no lib.rs) → js-sdk (KEEP)", () => {
		const s = scanOf({
			"package.json": JSON.stringify({ dependencies: { "@stellar/stellar-sdk": "^12.0.0", react: "^18" } }),
		});
		expect(detectStellarProof(s).proof).toBe("js-sdk");
	});

	it("matches @stellar deps under devDependencies/resolutions too", () => {
		const s = scanOf({ "package.json": JSON.stringify({ devDependencies: { "js-stellar-sdk": "1.0.0" } }) });
		expect(detectStellarProof(s).proof).toBe("js-sdk");
	});

	it("FIXTURE #7: rc version → cargo-sdk with versionStatus unknown (no tier drop)", () => {
		const s = scanOf({ "Cargo.toml": '[dependencies]\nsoroban-sdk = "22.0.0-rc.3"\n' });
		const r = detectStellarProof(s);
		expect(r.proof).toBe("cargo-sdk");
		expect(r.facts.versionStatus).toBe("unknown");
	});

	it("FIXTURE #8: genuine junk (no Stellar signal, tree complete) → none/ok", () => {
		const s = scanOf({ "package.json": JSON.stringify({ dependencies: { ethers: "^6", "@solana/web3.js": "^1" } }) });
		const r = detectStellarProof(s);
		expect(r.proof).toBe("none");
		expect(r.outcome).toBe("ok");
	});

	// ── lang-sdk: non-JS/Rust Stellar SDKs (verified against real manifests) ──
	it("Swift Package.swift w/ stellar-ios-mac-sdk → lang-sdk (KEEP; was wrongly none)", () => {
		const s = scanOf({
			"Package.swift": 'dependencies: [\n  .package(url: "https://github.com/Soneso/stellar-ios-mac-sdk", .upToNextMajor(from: "3.6.0")),\n]',
		});
		expect(detectStellarProof(s).proof).toBe("lang-sdk");
	});

	it("Swift CocoaPods Podfile w/ pod 'stellar-ios-mac-sdk' → lang-sdk (KEEP; lobstr Vault-iOS class)", () => {
		const s = scanOf({ Podfile: "# The Soneso stellar SDK for iOS\n  pod 'stellar-ios-mac-sdk', '3.0.3'\n  pod 'lottie-ios'\n" });
		expect(detectStellarProof(s).proof).toBe("lang-sdk");
	});

	it("Kotlin build.gradle.kts w/ network.lightsail:stellar-sdk → lang-sdk (KEEP)", () => {
		const s = scanOf({ "build.gradle.kts": 'implementation("network.lightsail:stellar-sdk:3.0.0")' });
		expect(detectStellarProof(s).proof).toBe("lang-sdk");
	});

	it("Flutter pubspec.yaml w/ stellar_flutter_sdk → lang-sdk (KEEP)", () => {
		const s = scanOf({ "pubspec.yaml": "dependencies:\n  stellar_flutter_sdk: ^1.8.0\n  flutter:\n" });
		expect(detectStellarProof(s).proof).toBe("lang-sdk");
	});

	it("Go go.mod requiring github.com/stellar/go → lang-sdk (KEEP)", () => {
		const s = scanOf({ "go.mod": "module example.com/app\n\nrequire github.com/stellar/go v0.0.0-20240101\n" });
		expect(detectStellarProof(s).proof).toBe("lang-sdk");
	});

	it("Python requirements.txt w/ stellar-sdk → lang-sdk (KEEP)", () => {
		const s = scanOf({ "requirements.txt": "requests==2.31.0\nstellar-sdk==8.0.0\n" });
		expect(detectStellarProof(s).proof).toBe("lang-sdk");
	});

	it("cargo-sdk still wins over a lang manifest (Rust contract w/ a go.mod tool)", () => {
		const s = scanOf({ "Cargo.toml": CARGO_SDK, "tools/go.mod": "require github.com/stellar/go v0.0.0" });
		expect(detectStellarProof(s).proof).toBe("cargo-sdk");
	});

	it("NEGATIVE: Package.swift with NO stellar dep → none (no over-match)", () => {
		const s = scanOf({ "Package.swift": 'dependencies: [\n  .package(url: "https://github.com/apple/swift-argument-parser", from: "1.0.0"),\n]' });
		expect(detectStellarProof(s).proof).toBe("none");
	});

	it("NEGATIVE: build.gradle with an unrelated dep → none", () => {
		const s = scanOf({ "build.gradle": 'implementation("com.squareup.okhttp3:okhttp:4.12.0")' });
		expect(detectStellarProof(s).proof).toBe("none");
	});

	// ── The over-filter guards: ambiguity must NEVER produce a confident `none` ──

	it("FIXTURE #10: oversize/binary Cargo.toml (text null) → outcome error, not none-judgment", () => {
		const s = scanOf({ "Cargo.toml": null }); // truncated=true → unreadable
		const r = detectStellarProof(s);
		expect(r.outcome).toBe("error");
		expect(r.scanNote).toBe("blob-unreadable");
	});

	it("submodule on a contract path → outcome incomplete, never none", () => {
		const s: ScanInput = {
			fullName: "test/repo",
			blobs: [],
			tree: [{ path: "contracts", type: "commit" }],
			treeComplete: true,
		};
		const r = detectStellarProof(s);
		expect(r.outcome).toBe("incomplete");
		expect(r.scanNote).toBe("submodule-contracts");
	});

	it("no proof + tree NOT fully enumerated → outcome incomplete (deeper contract may exist)", () => {
		const s = scanOf({ "README.md": "hello" }, { treeComplete: false });
		expect(detectStellarProof(s).outcome).toBe("incomplete");
	});

	it("weak textual mention with no code → weak-mention", () => {
		const s = scanOf({ "README.md": "we plan to build on Stellar" }, { weakMention: true });
		expect(detectStellarProof(s).proof).toBe("weak-mention");
	});
});

describe("farmScore — real code caps to 0 (H8/P5)", () => {
	it("ANY positive proof forces farmScore 0, even with farm fingerprints", () => {
		const facts = detectStellarProof(scanOf({ "package.json": JSON.stringify({ dependencies: { "stellar-sdk": "1" } }) })).facts;
		const r = computeFarmScore({
			proof: "js-sdk",
			facts,
			commitCount: 1,
			repoContributorCount: 12,
			diskUsageKb: 50,
			nameLooksTemplate: true,
		});
		expect(r.score).toBe(0);
		expect(r.flags).toEqual([]);
	});

	it("FIXTURE #4: squash-merged real contract (5 commits) → farmScore 0", () => {
		const facts = detectStellarProof(scanOf({ "Cargo.toml": CARGO_SDK, "src/lib.rs": LIB_RS })).facts;
		const r = computeFarmScore({ proof: "cargo-sdk", facts, commitCount: 5, repoContributorCount: 1 });
		expect(r.score).toBe(0);
	});

	it("flags a genuine junk scaffold (no proof, template name, single commit, inflated authors)", () => {
		const facts = detectStellarProof(scanOf({ "README.md": "x" })).facts;
		const r = computeFarmScore({
			proof: "none",
			facts,
			forkOfTemplate: true,
			commitCount: 1,
			repoContributorCount: 10,
			diskUsageKb: 20,
			nameLooksTemplate: true,
		});
		expect(r.score).toBeGreaterThanOrEqual(2);
	});
});

describe("codeProofTier — over-filter-safe, two-key, never-demote-on-doubt", () => {
	const base = { protection: { fullName: "acme/thing" }, now: NOW };

	it("never demotes on a non-ok scan (error/incomplete → no change)", () => {
		expect(codeProofTier({ ...base, proof: "none", outcome: "error", farmScore: 5, codeDepth: 0, isArchived: false })).toBeNull();
		expect(codeProofTier({ ...base, proof: "none", outcome: "incomplete", farmScore: 5, codeDepth: 0 })).toBeNull();
	});

	it("FIXTURE #6: a protected (canonical) repo is NEVER archived, even with proof none", () => {
		const r = codeProofTier({
			proof: "none",
			outcome: "ok",
			farmScore: 5,
			codeDepth: 0,
			isArchived: false,
			lastCommitAt: daysAgo(2000),
			stars: 0,
			protection: { fullName: "stellar/soroban-examples" },
			now: NOW,
		});
		expect(r).not.toBeNull();
		expect(r?.tier).not.toBe("archive");
	});

	it("scfAwarded / curated repos are protected from archive", () => {
		const r = codeProofTier({
			proof: "none",
			outcome: "ok",
			farmScore: 3,
			codeDepth: 0,
			protection: { fullName: "someorg/repo", scfAwarded: true },
			now: NOW,
		});
		expect(r?.tier).not.toBe("archive");
	});

	it("TWO-KEY: none + stale + low-star with NO farm fingerprint → community+unverified, NOT archive", () => {
		const r = codeProofTier({
			...base,
			proof: "none",
			outcome: "ok",
			farmScore: 0,
			codeDepth: 0,
			isArchived: false,
			lastCommitAt: daysAgo(2000),
			stars: 0,
		});
		expect(r?.tier).toBe("community");
		expect(r?.unverifiedStellar).toBe(true);
	});

	it("archives genuine junk: none + farm>=1", () => {
		const r = codeProofTier({ ...base, proof: "none", outcome: "ok", farmScore: 1, codeDepth: 0, isArchived: false });
		expect(r?.tier).toBe("archive");
	});

	it("archives on GitHub ground truth (isArchived)", () => {
		const r = codeProofTier({ ...base, proof: "cargo-sdk", outcome: "ok", farmScore: 0, codeDepth: 0.9, isArchived: true });
		expect(r?.tier).toBe("archive");
	});

	it("promotes a code-verified deployable contract to quality at 0 stars", () => {
		const r = codeProofTier({
			...base,
			proof: "cargo-sdk",
			outcome: "ok",
			farmScore: 0,
			codeDepth: 0.85,
			isArchived: false,
			lastCommitAt: daysAgo(10),
			stars: 0,
		});
		expect(r?.tier).toBe("quality");
	});
});

describe("computeCodeSignals — end-to-end on a real deployable contract", () => {
	it("a full Soroban token repo scores deep + quality-eligible", () => {
		const sig = computeCodeSignals(scanOf({ "Cargo.toml": CARGO_SDK, "src/lib.rs": LIB_RS }), { commitCount: 30 });
		expect(sig.stellarProof).toBe("cargo-sdk");
		expect(sig.outcome).toBe("ok");
		expect(sig.codeDepth).toBeGreaterThanOrEqual(0.6);
		expect(sig.farmScore).toBe(0);
	});
});

describe("allowlist", () => {
	it("protects canonical Stellar orgs and named repos", () => {
		expect(isAllowlisted("stellar/anything")).toBe(true);
		expect(isAllowlisted("soroswap/core")).toBe(true);
		expect(isAllowlisted("randomuser/random-repo")).toBe(false);
	});
	it("isProtected honors per-doc curation signals", () => {
		expect(isProtected({ fullName: "x/y", scfAwarded: true })).toBe(true);
		expect(isProtected({ fullName: "x/y", projectSlug: "acme" })).toBe(true);
		expect(isProtected({ fullName: "x/y" })).toBe(false);
	});
});

// ── H1 (zero-delete) guard for the shipped code-signal parser ────────────────
// The ingest/backfill audit-stamp guards live with the EC-ingest PR; here we
// only assert the module we ship never deletes (the never-delete safety spine).
describe("SAFETY: code-signals performs no deletes", () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const signalsSrc = readFileSync(join(here, "../code-signals.ts"), "utf8");

	it("H1: no payload.delete / deleteMany anywhere in the parser", () => {
		expect(signalsSrc).not.toMatch(/\.delete\s*\(/);
		expect(signalsSrc).not.toMatch(/deleteMany/);
	});
});
