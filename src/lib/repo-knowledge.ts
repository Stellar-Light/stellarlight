/**
 * Per-repo knowledge notes (repo-intel slice 3) — dated FACTS with sources,
 * never LLM summaries (the audit-corpus SURFACE-don't-summarize doctrine).
 *
 * Two sources, merged by enrich on every pass (so curation is self-healing —
 * the map below is the truth and reapplies weekly):
 *   curated  — hand-verified facts about what a repo IS that no signal can
 *              derive (doc maps, packaging, companion repos). Promote-only
 *              discipline: only add what you verified, date it.
 *   derived:audit — the repo's owning project has verified security-audit
 *              reports in our registry (EXACT projectSlug join, never fuzzy).
 */

export interface KnowledgeNote {
	note: string;
	/** "curated" | "derived:audit" — where this fact came from. */
	source: string;
	/** When the fact was verified/derived (YYYY-MM-DD). */
	asOf: string;
	/**
	 * "public" (default when absent) serves on every surface. "internal"
	 * NEVER leaves the DB — it's triage memory for the long tail (most of
	 * the ~12k EC-taxonomy repos don't merit deep indexing; an internal
	 * note records the judgment — junk/farm/irrelevant/dupe-of — so
	 * curators and wave-prioritization remember WHY without publishing
	 * verdicts about someone's repo). Serve-side filters enforce this.
	 */
	visibility?: "public" | "internal";
	/**
	 * Hand-authored natural-language trigger phrases (sls-080 round 2: the
	 * upstream monitor asks "…highest supported protocol version…" — no
	 * code-shaped identifier, so the identifier path can never fire for it).
	 * A trigger fires when EVERY one of its words appears as a whole word in
	 * the question. Authoring discipline: ≥2 words, distinctive of THIS fact
	 * — never a phrase some other question about the repo would contain.
	 */
	triggers?: string[];
}

/**
 * Curated per-repo facts, keyed by lowercase fullName. DISCIPLINE: every entry
 * verified against the repo's own docs/registry pages on the asOf date.
 */
export const REPO_KNOWLEDGE_NOTES: Record<string, KnowledgeNote[]> = {
	// ── P5 batch 5 (2026-09-01): 46 repos / 49 notes, next tier by repoScore —
	// DeFi/infra contract suites (OpenZeppelin stellar-contracts + relayer,
	// Soroswap, Phoenix, Blend V2, Rozo, DOB, SEP-41, Perun), SDKs and
	// registries (Blend SDK, Blux, hd-wallet, Creit-Tech JSR packages, HOT,
	// Allbridge, Lightecho, StellarGuard, FxDAO, Mercury), eight ARCHIVED
	// repos dated only by GitHub's own banner, three renames resolved by a
	// redirecting fetch (stellar-expert, bluxcc/react, stellar-deprecated/
	// horizon), and SDF misc (dev-skill, ledger-data-indexer, account-tools,
	// x402-stellar, sep45-reference). Every fact verified live on the asOf
	// date; no rename or archive DATE is claimed anywhere. Kept out on
	// purpose: axelarnetwork/axelar-amplifier-stellar (crates.io carries no
	// repository field for its crates — indirect link, same bar as batch 4).
	// ~60 further candidates yielded nothing durable and are named in the
	// batch notes — headline: Templar-Protocol/contracts has no Stellar or
	// Soroban code at all.
	"openzeppelin/stellar-contracts": [
		{
			note: "Published as seven crates on crates.io, all at 0.7.2 (2026-06-09), each registry entry linking back to this repo: stellar-tokens, stellar-access, stellar-accounts, stellar-contract-utils, stellar-fee-abstraction, stellar-governance, stellar-macros (README 'Published Crates'). Latest stable tag v0.7.2; v0.8.0-rc.3 (2026-06-16) is a prerelease. Docs: https://docs.openzeppelin.com/stellar-contracts",
			triggers: [
				"openzeppelin stellar crates",
				"openzeppelin soroban crate names",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: 'README opens with \'[!Warning] This is experimental software and is provided on an "as is" and "as available" basis\'; the workspace at HEAD pins soroban-sdk 27.0.2 (2026-09-01) and ships audit reports under audits/. https://github.com/OpenZeppelin/stellar-contracts',
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"openzeppelin/openzeppelin-relayer": [
		{
			note: "Docker image openzeppelin/openzeppelin-relayer (Docker Hub, registered 2025-04-04): tags v1.8.0 / 1.8.0 / latest pushed 2026-08-19, matching GitHub release v1.8.0 (2026-08-19) and Cargo.toml 1.8.0; not on crates.io. README 'Supported networks': Solana, EVM, Stellar, with an examples/stellar-gcp-kms-signer sample; AGPL-3.0. https://hub.docker.com/r/openzeppelin/openzeppelin-relayer",
			triggers: [
				"openzeppelin relayer docker",
				"openzeppelin relayer stellar support",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"soroswap/core": [
		{
			note: "README: Soroswap is live on Mainnet — SoroswapFactory CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2, SoroswapRouter CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH, deployer GAYPUMZFDKUEUJ4LPTHVXVG2GD5B6AV5GGLYDMSZXCSI4QILQKSY25JI; the OtterSec audit is in-repo at audits/2024-02-22_soroswap_ottersec_audit.pdf (fetches 200). https://github.com/soroswap/core",
			triggers: [
				"soroswap router address",
				"soroswap factory address",
				"soroswap audit report",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "The npm packages are built from sibling repos, not this one: @soroswap/sdk 0.5.0 (2026-08-11; repository soroswap/sdk) and soroswap-router-sdk 1.4.6 (2024-10-08), whose repository field names soroswap/soroswap-router-sdk — a path that returns 404 on GitHub as of 2026-09-01. Docs: https://docs.soroswap.finance/",
			triggers: ["soroswap sdk npm", "soroswap router sdk package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"phoenix-protocol-group/phoenix-contracts": [
		{
			note: "Latest release v2.0.0 (2025-06-07; tags run v0.8.0 → v1.0.0 → v1.1.0 → v2.0.0). The workspace at HEAD is version 2.0.0 and pins soroban-sdk 22.0.7 (2026-09-01); contracts live under contracts/*, shared crates under packages/*. No GitHub security advisories published. https://github.com/Phoenix-Protocol-Group/phoenix-contracts/releases",
			triggers: ["phoenix dex contracts release", "phoenix contracts version"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blend-capital/blend-contracts-v2": [
		{
			note: "Blend V2 (pool, backstop, pool-factory). Release v2.0.0 with per-contract tags v2.0.0_pool_cli22.0.1, v2.0.0_backstop_cli22.0.1, v2.0.0_pool-factory_cli22.0.1 (newest 2025-04-14). Workspace pins soroban-sdk 22.0.7, blend-contract-sdk 1.22.0, sep-40-oracle 1.2.0 and sep-41-token 1.2.0 (2026-09-01). https://github.com/blend-capital/blend-contracts-v2/releases",
			triggers: ["blend v2 contracts release", "blend v2 soroban sdk version"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Audit PDFs ship in-repo under audits/ (README 'Audits'): 'Code4rena x Blend V2 audit report', 'Script3 - Certora - Blend v2 - Security Assessment Draft v3 Report - April 2025' and 'Script3 - Certora - Blend v2 - Formal Verification Draft v2 Report - June 2025'. https://github.com/blend-capital/blend-contracts-v2/tree/main/audits",
			triggers: ["blend v2 audit", "blend v2 certora"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blend-capital/blend-sdk-js": [
		{
			note: "npm name is @blend-capital/blend-sdk — 3.3.0 (2026-06-19; 52 versions since 2023-10-24; repository field points here; GitHub release v3.3.0 the same day). README install: npm install @blend-capital/blend-sdk. https://www.npmjs.com/package/@blend-capital/blend-sdk",
			triggers: ["blend sdk npm", "blend javascript sdk package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-expert/stellar-expert-explorer": [
		{
			note: "Current home of the explorer source: github.com/orbitlens/stellar-expert-explorer returns HTTP 301 to this path (2026-09-01). Hosted at https://stellar.expert with a public OpenAPI description at https://stellar.expert/openapi (README 'Links'); no GitHub releases or tags; root package ui.stellar.expert is private. https://github.com/stellar-expert/stellar-expert-explorer",
			triggers: [
				"stellar expert source code",
				"stellar expert openapi",
				"orbitlens stellar expert",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"bluxcc/react": [
		{
			note: "npm @bluxcc/react — 0.3.2 (2026-09-01; 55 versions since 2025-02-03). Its npm repository field still names github.com/bluxcc/blux, which now returns HTTP 301 to bluxcc/react (2026-09-01) — this repo is the current home of that path. README install: npm i @bluxcc/react; docs https://docs.blux.cc/. https://www.npmjs.com/package/@bluxcc/react",
			triggers: ["blux react package", "bluxcc blux repo moved"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"chatch/stellar-hd-wallet": [
		{
			note: "npm stellar-hd-wallet — 1.0.2 (2025-04-27; 13 versions since 2017-12-25; GitHub release v1.0.2 same day; repository field points here). SEP-0005 key derivation for Stellar; README says every SEP-0005 test case is exercised in its tests. A Deno/browser port that drops the Node-only deps is @creit-tech/stellar-sep-0005 on JSR. https://www.npmjs.com/package/stellar-hd-wallet",
			triggers: ["stellar hd wallet npm", "mnemonic key derivation javascript"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"creit-tech/stellar-sep-0005-js": [
		{
			note: "Published on JSR, not npm: @creit-tech/stellar-sep-0005 — 0.2.0 (2025-08-17; JSR links the package to this repo). README: a SEP-0005 key-derivation port of chatch/stellar-hd-wallet, written because that library uses Node-only features; install `npx jsr add @creit-tech/stellar-sep-0005` or `deno add jsr:@creit-tech/stellar-sep-0005`. https://jsr.io/@creit-tech/stellar-sep-0005",
			triggers: ["sep 0005 deno", "creit sep 0005 jsr"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"creit-tech/stellar-sep-0040-js": [
		{
			note: "Published on JSR, not npm: @creit-tech/stellar-sep-0040 — 0.1.0 (2025-11-05; JSR links the package to this repo). README: a small client for calling SEP-0040 oracle methods; install `npx jsr add @creit-tech/stellar-sep-0040` or `deno add jsr:@creit-tech/stellar-sep-0040`. https://jsr.io/@creit-tech/stellar-sep-0040",
			triggers: ["sep 0040 oracle client javascript", "sep 40 jsr package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/js-soroban-client": [
		{
			note: "ARCHIVED — GitHub's banner reads 'archived by the owner on Mar 11, 2025' (read 2026-09-01). README 'Deprecation Notice': deprecated in favor of stellar/js-stellar-sdk, migration guide at https://gist.github.com/Shaptic/5ce4f16d9cce7118f391fbde398c2f30; npm soroban-client is deprecated and frozen at 1.0.1 (2024-01-03; 33 versions since 2022-10-11). https://github.com/stellar/js-soroban-client",
			triggers: [
				"soroban client deprecated",
				"migrate from soroban-client",
				"soroban client archived",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/django-polaris": [
		{
			note: "ARCHIVED — GitHub's banner reads 'archived by the owner on May 23, 2025' (read 2026-09-01). PyPI django-polaris is frozen at 2.6.0 (2025-02-13; 75 releases; GitHub release v2.6.0 same day); README.rst: SDF's extendable Django app for SEP implementations; docs still served at https://django-polaris.readthedocs.io/en/stable. https://pypi.org/project/django-polaris/",
			triggers: [
				"django polaris archived",
				"polaris still maintained",
				"django polaris pypi",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-deprecated/horizon": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jan 22, 2020'; github.com/stellar/horizon returns HTTP 301 here (2026-09-01). README: 'This repository has moved to the go monorepo' (stellar/go/tree/master/services/horizon) — and stellar/go is itself archived, with Horizon now developed in stellar/stellar-horizon. https://github.com/stellar-deprecated/horizon",
			triggers: ["old horizon repo", "stellar horizon repository moved"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-deprecated/horizon-importer": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Nov 16, 2019' (read 2026-09-01). README: 'This project is not in active development anymore. Please use https://github.com/stellar/horizon' — a path that now redirects to stellar-deprecated/horizon (itself archived; Horizon lives in stellar/stellar-horizon). https://github.com/stellar-deprecated/horizon-importer",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-deprecated/bridge-server": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Sep 12, 2019' (read 2026-09-01). README describes two Go apps: bridge (builds, submits and monitors Stellar transactions) and compliance (helper for the pre-SEP compliance protocol); the README names no successor. https://github.com/stellar-deprecated/bridge-server",
			triggers: ["bridge server archived", "stellar bridge server compliance"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/sep-smart-wallet": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jan 30, 2026' (read 2026-09-01). README: a passkey-based smart wallet exercising SEP-10c (alpha) and SEP-24, under a '[!WARNING] … for demonstration purposes only and has not been audited. Do not use it to store, protect, or secure assets' notice. https://github.com/stellar/sep-smart-wallet",
			triggers: ["sep-10c smart wallet demo", "sep smart wallet archived"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/amm-reference-ui": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on May 1, 2025' (read 2026-09-01). README: a reference implementation for setting up a UI for AMMs, explicitly 'not a recommendation or prescribed way to set up a UI'. https://github.com/stellar/amm-reference-ui",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/recoverysigner-demo-client": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Mar 26, 2025' (read 2026-09-01). README: a limited-feature demo client for a SEP-30 recoverysigner server (registration and recovery of an account), plain HTML/JS with no build step. https://github.com/stellar/recoverysigner-demo-client",
			triggers: ["sep-30 demo client", "recoverysigner demo"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-dev-skill": [
		{
			note: "SDF's Agent-Skills package; latest release v1.2.0 (2026-06-29, the only tag). README 'Installing': Claude Code `/plugin marketplace add stellar/stellar-dev-skill` + `/plugin install stellar-dev@stellar-dev`; Codex via git clone into ~/.codex/skills; or `npx skills add https://github.com/stellar/stellar-dev-skill`. README says it was AI-generated, under manual review. https://skills.stellar.org/",
			triggers: ["stellar dev skill install", "stellar skill claude code"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-ledger-data-indexer": [
		{
			note: "Go module github.com/stellar/stellar-ledger-data-indexer (go 1.25); Docker image stellar/stellar-ledger-data-indexer on Docker Hub (registered 2026-01-16; `latest` pushed 2026-08-28; README's quick start runs it via docker run). No GitHub releases or tags as of 2026-09-01. https://hub.docker.com/r/stellar/stellar-ledger-data-indexer",
			triggers: [
				"ledger data indexer docker",
				"stellar ledger data indexer image",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-account-tools": [
		{
			note: "Live app at https://stellar.github.io/stellar-account-tools/ (README 'Live app'; HTTP 200 on 2026-09-01). README: an SDF-built web app for managing Stellar accounts whose headline tool is 'Emergency SDP Host Access Revocation' — revoking a Stellar Disbursement Platform host's access to your distribution account. No releases; package version 0.0.0. https://github.com/stellar/stellar-account-tools",
			triggers: ["revoke sdp host access", "stellar account tools app"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/x402-stellar": [
		{
			note: "Publishes no package as of 2026-09-01: root package.json is private with no version; no tags or releases. Holds examples/facilitator (Stellar facilitator service) and examples/simple-paywall plus a Dockerfile (README; Node 22+, pnpm 10+). The npm package named x402-stellar (0.2.0, 2025-12-05) belongs to a different repo, mertkaradayi/stellar-x402. https://github.com/stellar/x402-stellar",
			triggers: [
				"x402 stellar npm package",
				"stellar x402 facilitator example",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/sep45-reference": [
		{
			note: "Reference implementation of SEP-45, web authentication for contract accounts (README links https://stellar.org/protocol/sep-45). TypeScript + Rust per GitHub's language stats; single release v0.1.3 (2026-01-14); no package.json or Cargo.toml at the repo root, so no npm/crates identity. https://github.com/stellar/sep45-reference/releases",
			triggers: [
				"sep-45 reference implementation",
				"sep 45 contract account auth",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"withobsrvr/stellarbeat": [
		{
			note: "README title: 'OBSRVR Radar (formerly Stellarbeat)' — a monitoring and analytics platform for the Stellar network's validators and organizations; the root package is named radar (private, 0.1.0). No releases or tags as of 2026-09-01. https://github.com/withObsrvr/stellarbeat",
			triggers: ["stellarbeat renamed", "obsrvr radar stellarbeat"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"hot-dao/kit": [
		{
			note: "npm @hot-labs/kit — 1.6.4 (2026-02-20; 85 versions since 2025-12-07; no repository field on npm; the repo's package.json is 1.6.5). README: a multi-chain connector implementing NEAR Intents for NEAR, EVM, Solana, TON, Stellar and Cosmos; install `yarn add @hot-labs/kit react react-dom`; docs https://hot-labs.gitbook.io/hot-protocol/hot-kit. https://www.npmjs.com/package/@hot-labs/kit",
			triggers: ["hot kit stellar", "near intents stellar connector"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"hot-dao/hot-sdk-js": [
		{
			note: "npm @hot-wallet/sdk — 1.0.11 (2025-02-20; 46 versions since 2024-07-26; no repository field on npm; no GitHub releases). README has a 'Stellar Connect' section (stellar:getAddress / signTransaction / signAuthEntry / signMessage requests) described as compatible with Creit-Tech/Stellar-Wallets-Kit. https://www.npmjs.com/package/@hot-wallet/sdk",
			triggers: ["hot wallet stellar sdk", "hot wallet wallets kit module"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"allbridge-io/allbridge-core-js-sdk": [
		{
			note: "npm @allbridge/bridge-core-sdk — 3.34.0 (2026-08-31; 308 versions since 2022-10-07). Its repository field names allbridge-public/allbridge-core-js-sdk; that copy and this one share the identical HEAD 20b0d81c54169c3c5d8e366ef6f6ee56f60ee542 (2026-09-01) and neither redirects. README links Stellar docs at documentation/browser/stellar.md. https://www.npmjs.com/package/@allbridge/bridge-core-sdk",
			triggers: ["allbridge core sdk npm", "allbridge sdk stellar"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"allbridge-io/allbridge-core-rest-api": [
		{
			note: "Docker image allbridge/io.allbridge.rest-api (Docker Hub, registered 2024-03-01): newest version tag 3.32.0 (2026-06-26) while `latest` was last pushed 2026-01-30 with 3.29.1 — pin a version. README's network list includes 'Stellar (STLR) & Soroban (SRB)', configured with STLR_NODE_URL plus SRB_NODE_URL (both required). https://hub.docker.com/r/allbridge/io.allbridge.rest-api",
			triggers: ["allbridge rest api docker", "allbridge rest api stellar"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"allbridge-io/local-signer-mcp": [
		{
			note: "Shipped as the Docker image allbridge/local-signer-mcp (Docker Hub, registered 2026-04-22, last pushed 2026-04-25; README links it); package.json is private, so not on npm. README: a local MCP layer that signs and optionally broadcasts fully formed transactions; 'Soroban / Stellar' is a supported chain (env LOCAL_SIGNER_SRB_PRIVATE_KEY etc.). https://github.com/allbridge-io/local-signer-mcp",
			triggers: [
				"allbridge local signer mcp",
				"mcp transaction signer stellar docker",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"bp-ventures/lightecho-stellar-oracle": [
		{
			note: "PyPI lightecho-stellar-oracle — 2.0.0 (2024-08-15; 41 releases; PyPI homepage points to oracle-sdk/python in this repo). README lists the PRODUCTION SEP-40 oracle contract for base XLM as CDOR3QD27WAAF4TK4MO33TGQXR6RPNANNVLOY277W2XVV6ZVJ6X6X42T and dates the production pilot launch to March 5 2024; a Python CLI lives at oracle-onchain/sep40/cli. https://pypi.org/project/lightecho-stellar-oracle/",
			triggers: ["lightecho oracle contract address", "lightecho python sdk"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"rozoai/rozo-intents-contracts": [
		{
			note: "README 'Audits' table cites a Hacken audit of V2 (March 2026) at https://hacken.io/audits/rozo/sca-rozo-sdf-audit-mar2026/ and its deployment table gives the Stellar Mainnet contract CAC5SKP5FJT2ZZ7YLV4UCOM6Z5SQCCVPZWHLLLVQNQG2RWWOOSP3IYRL. Single GitHub release, tag v1.0.0_v1_stellar_payment_payment_pkg0.1.0_cli22.8.1 (2026-02-13). https://github.com/RozoAI/rozo-intents-contracts",
			triggers: ["rozo intents audit", "rozo stellar mainnet contract"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"dobprotocol/stellar-distribution-contracts": [
		{
			note: "README's 'Status: Audited - Safe for Production' rests on in-repo reviews headed 'Auditor: Internal Review' (docs/SECURITY_REVIEW.md v1.2.1, docs/SECURITY_REVIEW_V2.md v2.0.0, both January 2026); no third-party auditor is named. README 'Mainnet' table: Splitter WASM hash 67848b7ab5a32ea5b0410d16393b5d4e79f68266571272a3aff4edf5ec67483c. https://github.com/Dobprotocol/stellar-distribution-contracts",
			triggers: [
				"dob protocol splitter audit",
				"stellar distribution contracts audited",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"script3/sep-41-token": [
		{
			note: "crates.io sep-41-token — 1.4.0 (2026-01-26; 9 versions since 2023-10-20; release v1.4.0 same day): SEP-0041 trait, client and mock contract (members sep-41, mock-sep-41). Its repository field (sep-41/Cargo.toml) names script3/sep-40-oracle, so crates.io links it to that sibling repo. Companion crates: sep-40-oracle 1.4.0, soroban-fixed-point-math 1.5.0. https://crates.io/crates/sep-41-token",
			triggers: ["sep-41 token crate", "sep 41 trait rust"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-fox/redshift": [
		{
			note: "README 'SECURITY WARNING': 'The domain stellarfox.net is no longer affiliated with this project or its original creators.' npm @stellar-fox/redshift is frozen at 1.0.2 (2018-12-21; 14 versions since 2018-07-25) while the in-repo library/package.json is 1.1.0 (unpublished); implements BIP39/BIP32/BIP44 and SEP-0005. https://github.com/stellar-fox/redshift",
			triggers: [
				"stellarfox domain warning",
				"redshift stellar mnemonic library",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellarguard/stellar-uri": [
		{
			note: "npm @stellarguard/stellar-uri — 3.0.1 (2021-05-29; 16 versions since 2018-10-25; repository field points here; repo not archived as of 2026-09-01). TypeScript implementation of SEP-0007 web+stellar: URIs for browser or Node; README notes TransactionStellarUri can replace transaction parts addressed by SEP-0011 txrep path. https://www.npmjs.com/package/@stellarguard/stellar-uri",
			triggers: ["sep-0007 uri javascript", "web stellar uri library"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellarguard/txrep": [
		{
			note: "npm @stellarguard/txrep — 2.0.0 (2020-05-18; 10 versions since 2019-11-30; repository field points here; repo not archived as of 2026-09-01). TypeScript implementation of SEP-0011 txrep, the human-readable Stellar transaction representation. https://www.npmjs.com/package/@stellarguard/txrep",
			triggers: ["sep-0011 txrep javascript", "txrep library npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"tupui/stellar-stratum": [
		{
			note: "Hosted at https://stellar-stratum.xyz (README; HTTP 200 on 2026-09-01): a multi-signature wallet dApp for Stellar accounts with custom thresholds, switchable between mainnet and testnet. Root package stellar-stratum 0.1.0 is private; no releases. https://github.com/tupui/stellar-stratum",
			triggers: ["stellar stratum multisig", "stratum wallet dapp"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"paltalabs/mercury-client": [
		{
			note: "Not the SDK: README titles it 'Mercury Sandbox', a Node/Axios sample that subscribes an address and runs 7 Soroban transactions against Mercury (mercurydata.app). The npm package mercury-sdk (1.0.0, 2024-11-11; 31 versions since 2023-11-29) is built from paltalabs/mercury-sdk, whose GitHub banner reads 'archived by the owner on Sep 3, 2025'. https://github.com/paltalabs/mercury-client",
			triggers: ["mercury sdk npm", "mercury sdk archived"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"perun-network/perun-soroban-contract": [
		{
			note: "Soroban payment-channel contract for go-perun's Stellar backend; README: it must be used with the companion perun-network/perun-stellar-backend (exists, HEAD verified 2026-09-01). Latest GitHub release v0.7.0 (2025-04-08) while Cargo.toml still says version 0.2.0; not on crates.io; pins soroban-sdk 20.5.0. https://github.com/perun-network/perun-soroban-contract",
			triggers: ["perun stellar backend", "perun payment channel soroban"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"fxdao/fxdao-sdk-js": [
		{
			note: "npm @fxdao/fxdao-sdk-js — 0.9.3 (2025-09-03; 8 versions since 2024-01-12; the npm repository field points here). The README is a bare title, so the npm page is the only documentation surface. https://www.npmjs.com/package/@fxdao/fxdao-sdk-js",
			triggers: ["fxdao sdk npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-scaffold/ui": [
		{
			note: "README: the frontend half of Stellar Scaffold, 'under active development'; the entry point is the companion github.com/stellar-scaffold/cli (exists, HEAD verified 2026-09-01). Root workspace @stellar-scaffold/ui is private; its only GitHub release is a CI artifact tag, main_contracts_guess_the_number_guess-the-number_pkg0.0.2_cli27.0.0 (2026-08-05). https://github.com/stellar-scaffold/ui",
			triggers: ["stellar scaffold ui", "stellar scaffold cli repo"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"payrouteshq/stellartools": [
		{
			note: "Hosted at https://stellartools.dev with docs at https://docs.stellartools.dev (README; both HTTP 200 on 2026-09-01). README: 'An OSS payment infrastructure built on the Stellar blockchain, by Payroutes' (payroutes.sh), listed in the Vercel OSS Program. Root package stellartools 0.1.0 is private; not on npm. https://github.com/payrouteshq/stellartools",
			triggers: ["stellartools payroutes", "stellar tools dev site"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"kalepail/soroban-passkey": [
		{
			note: "SoroPass — README: demo at https://passkey.sorobanbyexample.org/ (HTTP 200 on 2026-09-01) and write-up at https://kalepail.com/blockchain/the-passkey-powered-future-of-web3; a pnpm app with no releases or tags; repo not archived. https://github.com/kalepail/soroban-passkey",
			triggers: ["soropass demo", "soroban passkey demo"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"suncewallet/sunce": [
		{
			note: "Desktop and mobile Stellar wallet (Mac, Windows, Linux, Android, iOS per README) distributed as binaries on GitHub Releases (README 'Download'). Latest stable release v1.10.0 (2026-05-24); newest tag v1.11.0-beta1 (2026-06-05, prerelease). https://github.com/SunceWallet/sunce/releases",
			triggers: ["sunce wallet download", "sunce wallet release"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/basic-payment-app": [
		{
			note: "BasicPay — companion code for the SDF Example Application Tutorial; README links https://developers.stellar.org/docs/building-apps/example-application-tutorial/overview (301 to /docs/build/apps/example-application-tutorial/overview, 200 on 2026-09-01). README '[!CAUTION]': educational, not for production or Mainnet. Private package (bpa 0.0.1), no releases. https://github.com/stellar/basic-payment-app",
			triggers: ["basicpay tutorial", "example application tutorial code"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// ── P5 batch 4 (2026-09-01): 40 repos / 42 notes, next tier by repoScore —
	// SDKs across languages (KMP, iOS/macOS, Flutter, Java Android SPI, PHP
	// anchor, Swift wallet, web/android kits), XDR/RPC crates, SDF infra images
	// and apt packages, protocol/docs repos, wallets, and archived/renamed
	// paths (kotlin-wallet-sdk, wallet-backend-client, kalepail/*,
	// devasignhq/soroban-contract). Every fact verified live on the asOf date
	// against the registry / API / README the note cites; no rename or
	// archive DATE is claimed anywhere. Kept out on purpose: our own
	// stellar-light/stellar-pay (self-curation is an owner call) and
	// xycloo/rs-zephyr-toolkit (crates.io carries no repository field for
	// zephyr-sdk — the registry↔repo link is indirect). ~43 further
	// candidates yielded nothing durable and are absent by name in the
	// batch notes.
	"soneso/kmp-stellar-sdk": [
		{
			note: 'Kotlin Multiplatform SDK on Maven Central as com.soneso.stellar:stellar-sdk — 1.12.0 (GitHub release v1.12.0, 2026-08-26; the Maven entry links back to this repo; Apache-2.0). README install: implementation("com.soneso.stellar:stellar-sdk:1.12.0"), Gradle 9.0+. https://central.sonatype.com/artifact/com.soneso.stellar/stellar-sdk',
			triggers: ["kotlin multiplatform sdk maven", "kmp sdk maven coordinates"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"soneso/stellar-ios-mac-sdk": [
		{
			note: 'Install is Swift Package Manager only per README (product name stellarsdk): .package(name: "stellarsdk", url: "git@github.com:Soneso/stellar-ios-mac-sdk.git", from: "3.10.0"); requires iOS 15+, macOS 12+, Xcode 16+ (Swift 6 toolchain; Swift 5 or 6 language mode). Latest release 3.10.0 (2026-08-25), after 3.9.0 and 3.8.1. https://github.com/Soneso/stellar-ios-mac-sdk/releases',
			triggers: ["ios sdk swift package", "stellarsdk swift package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"soneso/stellar_flutter_sdk": [
		{
			note: "pub.dev package stellar_flutter_sdk — 3.6.0 (2026-08-24; 118 versions since 0.7.8 on 2020-06-23; the pub.dev homepage points at this repo; MIT). Requires Dart SDK >=3.8.0 <4.0.0 and Flutter >=3.32.0; iOS deployment target 15.0+ (smart-account passkey calls need iOS 16 at runtime, else return not-supported). https://pub.dev/packages/stellar_flutter_sdk",
			triggers: ["flutter sdk pub package", "flutter sdk dart version"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/kotlin-wallet-sdk": [
		{
			note: "ARCHIVED (GitHub API archived:true, 2026-09-01) and deprecated — README banner: 'This SDK is deprecated and no longer maintained… There is no direct Kotlin/Java successor.' Maven Central org.stellar:wallet-sdk is frozen at 3.0.0 (GitHub release 2026-04-28) with the same DEPRECATED notice; README sends JVM users to the lower-level Java SDK (implement SEP-1/10/12/24/30 yourself) and wallet-SDK users to TypeScript, Flutter (Soneso/stellar_wallet_flutter_sdk) or Swift. https://github.com/stellar/kotlin-wallet-sdk",
			triggers: [
				"kotlin wallet sdk deprecated",
				"kotlin wallet sdk archived",
				"kotlin wallet sdk successor",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/wallet-backend-client": [
		{
			note: "ARCHIVED (GitHub API archived:true, 2026-09-01) and never published: the README's `npm install @stellar/wallet-backend-client` does not resolve — registry.npmjs.org returns Not found for that name (2026-09-01). README also declares the repo 'not currently under active development' and out of scope for Stellar's HackerOne program. https://github.com/stellar/wallet-backend-client",
			triggers: ["wallet backend client npm", "wallet backend client archived"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"lightsail-network/java-stellar-sdk-android-spi": [
		{
			note: "Android companion of lightsail-network/java-stellar-sdk: Maven Central network.lightsail:stellar-sdk-android-spi — 5.0.0 (published 2026-09-01, same day as the SDK's 5.0.0; Apache-2.0; the Maven entry links back to this repo). Versions track the SDK (tags 4.0.0, 4.0.1, 5.0.0). https://central.sonatype.com/artifact/network.lightsail/stellar-sdk-android-spi",
			triggers: ["android spi maven", "java sdk android spi"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"argo-navis-dev/php-anchor-sdk": [
		{
			note: "Packagist name argonavis/php-anchor-sdk (from composer.json) — 0.10.0 (2025-11-09; 11 versions since 0.1.0 on 2023-12-25; Packagist source points at this repo; Apache-2.0). Latest GitHub release 0.10.0 (2025-11-09); repo last pushed 2026-03-29. https://packagist.org/packages/argonavis/php-anchor-sdk",
			triggers: ["php anchor sdk composer", "php anchor sdk packagist"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/js-xdr": [
		{
			note: "npm name is @stellar/js-xdr — 5.0.0 (2026-08-20; scoped package first published 2023-11-20). The old unscoped js-xdr is deprecated on npm ('This package has moved to @stellar/js-xdr!') and frozen at 3.1.2 (2024-07-18). It is a runtime XDR codec, not a generator: the SDK's bindings are produced by tools/xdrgen/generate.mjs in stellar/js-stellar-sdk. https://www.npmjs.com/package/@stellar/js-xdr",
			triggers: ["js xdr deprecated", "xdr npm package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/rs-stellar-xdr": [
		{
			note: "crates.io name stellar-xdr — 28.0.0 (2026-07-30; first published 2022-07-29; 41 versions; ~2.15M downloads; crate repository field points here). Support policy (README): only the most recent major gets bug fixes and features; critical security backports to older majors are best-effort. CLI build: `cargo install --locked stellar-xdr --version ... --features cli`. https://crates.io/crates/stellar-xdr",
			triggers: ["stellar xdr crate", "rust xdr crate"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Security advisory (as of 2026-09-01 — re-check the live feed, this is dated): CVE-2026-29795 / GHSA-x57h-xx53-v53w, medium, published 2026-03-04 — StringM::from_str bypasses max length validation; affects stellar-xdr <= 25.0.0, patched in 25.0.1. https://github.com/stellar/rs-stellar-xdr/security/advisories/GHSA-x57h-xx53-v53w",
			triggers: ["stellar xdr advisory", "stellar xdr cve"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/rs-stellar-rpc-client": [
		{
			note: "crates.io name stellar-rpc-client (first published 2024-03-05; 30 versions; ~225k downloads; repository field points here). On 2026-09-01 the newest upload is pre-release 28.0.0-rc.1 (2026-08-25) while max stable is 27.0.0 — matching the latest non-prerelease GitHub release v27.0.0 (2026-06-17). README is a 4-line stub pointing at developers.stellar.org/docs. https://crates.io/crates/stellar-rpc-client",
			triggers: ["stellar rpc client crate", "rust rpc client crate"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/xdrgen": [
		{
			note: "README notice (2026-09-01): 'Generators are no longer maintained in this repository' — the Python, Java and Rust generators moved out next to the XDR libraries they generate (PRs #221, #226); C#, Elixir and Ruby generators were deleted and survive only at commit 2efacde612445d97e0548131ed699e8130bdeb7b; the Go generator still lives here. New generators should use xdrgen as a library. RubyGems xdrgen is frozen at 0.1.1 (2021-08-20; 3 versions since 2020-01-23). https://github.com/stellar/xdrgen#readme",
			triggers: ["xdrgen generators moved", "xdrgen gem"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-xdr": [
		{
			note: "Canonical .x XDR definitions; one GitHub release per protocol — v28.0 (2026-08-27), v27.0, v26.0. Branch model (README): all changes land on main; curr = current protocol, next = definitions that only take effect at the next protocol boundary, wrapped in per-feature #ifdef flags (e.g. CAP73_SAC_CREATE_ACCOUNTS); 'when in doubt just make the changes only in the next branch'. https://github.com/stellar/stellar-xdr#making-modifications",
			triggers: ["xdr curr next", "xdr next branch"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-cli-docker": [
		{
			note: 'Source of Docker Hub image docker.io/stellar/stellar-cli (~39.8k pulls, 2026-09-01): version tags plus pinned-toolchain manifest tags like 28.0.0-rust1.98.0-slim-trixie with -amd64/-arm64 per-arch variants and a -0 build suffix; :latest updated 2026-08-26; GitHub release v28.0.0-0 (2026-08-26). Doubles as a SEP-58 reproducible-build image: `docker run --rm -v "$PWD:/source" docker.io/stellar/stellar-cli:latest contract build --locked`. https://hub.docker.com/r/stellar/stellar-cli/tags',
			triggers: [
				"stellar cli docker image",
				"stellar cli docker tag",
				"sep 58 image",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-galexie": [
		{
			note: "Split out of the stellar/go monorepo (see the go-stellar-sdk note); releases are tagged galexie-vX — galexie-v28.0.1 (2026-08-27), galexie-v28.0.0 (2026-08-14). Docker Hub image stellar/stellar-galexie (tags 28.0.1, 28.0.0, latest; ~3.5k pulls, 2026-09-01). The README's docs link developers.stellar.org/docs/data/galexie now redirects to /docs/data/indexers/build-your-own/galexie. https://hub.docker.com/r/stellar/stellar-galexie/tags",
			triggers: ["galexie docker image", "galexie release"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-etl": [
		{
			note: "Runs from Docker Hub image stellar/stellar-etl (README: `docker pull stellar/stellar-etl:latest`; ~138.6k pulls). Hub tags are commit SHAs and :latest was last updated 2026-03-10 although the repo was pushed 2026-08-27 — pin by SHA or build from source (Go 1.23+; captive-core needs stellar-core v20.0.0+). GitHub releases run to v2.8.23 (2026-06-23). https://hub.docker.com/r/stellar/stellar-etl/tags",
			triggers: ["stellar etl docker", "stellar etl image"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-anchor-tests": [
		{
			note: "npm package is @stellar/anchor-tests (the monorepo's @stellar/anchor-tests workspace) — 0.6.22 (2026-06-05; 46 versions since 2021-06-11; repository points here). The README's hosted UI anchor-tests.stellar.org did NOT resolve on 2026-09-01 (DNS NXDOMAIN, checked twice; stellar-demo-wallet's README links it too) — run the CLI/UI locally. https://www.npmjs.com/package/@stellar/anchor-tests",
			triggers: [
				"anchor tests npm",
				"anchor tests hosted",
				"anchor validator site",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-protocol": [
		{
			note: "Home of CAPs and SEPs: accepted CAPs live in core/ as cap-XXXX.md (process in core/README.md), accepted SEPs in ecosystem/ as sep-XXXX.md (process in ecosystem/README.md), media under contents/{cap|sep}-XXXX/, templates cap-template.md and sep-template.md at the root; default branch master, e.g. https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md. No releases or tags — cite by path + commit. https://github.com/stellar/stellar-protocol#repository-structure",
			triggers: [
				"where are seps",
				"cap sep repository",
				"sep markdown location",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-docs": [
		{
			note: "Source of developers.stellar.org (Docusaurus; Node 24+, pnpm). Agent-facing bundles are live: https://developers.stellar.org/llms.txt is a hand-curated static/llms.txt (docusaurus.config.ts sets generateLLMsTxt:false — 'keep our curated static/llms.txt untouched'; ~15 KB) and llms-full.txt is generated by docusaurus-plugin-llms (~4.4 MB on 2026-09-01) — point AI tools there instead of crawling the MDX. https://github.com/stellar/stellar-docs/blob/main/docusaurus.config.ts",
			triggers: ["stellar docs llms", "developer docs llms", "docs llms txt"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/packages": [
		{
			note: "SDF's Debian/Ubuntu repo: https://apt.stellar.org (key A136B5A6 at https://apt.stellar.org/SDF.asc; `deb https://apt.stellar.org $(lsb_release -cs) stable` or testing; Ubuntu LTS only). Verified 2026-09-01: noble stable carries stellar-core 28.0.1-3508.947aad841.noble, stellar-horizon 28.0.1-561, stellar-rpc, stellar-archivist(-rs), stellar-core-postgres/-prometheus-exporter/-utils; jammy adds stellar-soroban-rpc. The README's 'Ubuntu 16.04' line is stale. https://github.com/stellar/packages/blob/master/docs/adding-the-sdf-stable-repository-to-your-system.md",
			triggers: [
				"apt stellar core",
				"debian package stellar core",
				"ubuntu package horizon",
				"apt stellar org",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"chatch/stellarexplorer": [
		{
			note: "Hosted at https://steexp.com (public), https://testnet.steexp.com and https://futurenet.steexp.com (README; steexp.com answered 200 on 2026-09-01). Releases are tagged vX.Y.Z-app — latest v3.1.3-app (2026-07-06). The npm package `stellarexplorer` (1.0.8, 2018-08-13) is deprecated by its author as 'not a library to be shared but a site' — do not install it. https://github.com/chatch/stellarexplorer/releases",
			triggers: ["steexp source code", "stellarexplorer npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"rabetofficial/rabet-extension": [
		{
			note: "Browser-extension wallet (GPL-3.0; site rabet.io). Latest GitHub release V1.8.0 (2025-12-23; package.json version 1.8.0); repo last pushed 2025-12-23. The repo's homepage field is the Chrome Web Store listing https://chrome.google.com/webstore/detail/rabet/hgmoaheomcjnaheggkfafnjilfcefbmo. https://github.com/rabetofficial/rabet-extension/releases",
			triggers: [
				"rabet latest version",
				"rabet chrome web store",
				"rabet extension release",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"lobstrco/vault-android": [
		{
			note: "Android source of LOBSTR Vault (multisig signer app; GPL-3.0; Kotlin). No GitHub releases or tags — builds ship through the stores the README links: Google Play id com.lobstr.stellar.vault (https://play.google.com/store/apps/details?id=com.lobstr.stellar.vault) and App Store id1452248529 (https://itunes.apple.com/app/lobstr-vault/id1452248529). Repo last pushed 2026-07-15. https://github.com/Lobstrco/vault-android",
			triggers: [
				"lobstr vault play store",
				"lobstr vault app store",
				"lobstr vault source",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"daccred/attestprotocol": [
		{
			note: "npm packages @attestprotocol/sdk, @attestprotocol/stellar-sdk and @attestprotocol/cli — all 2.0.2, last published 2025-11-09; their repository field names github.com/daccred/attest.so, which the GitHub API resolves to daccred/attestprotocol (renamed). The monorepo's packages/ already carry unpublished 2.0.3 / 3.0.0, so npm lags the repo. https://www.npmjs.com/package/@attestprotocol/stellar-sdk",
			triggers: ["attest protocol npm", "attestprotocol package"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Deployed Stellar contract IDs per README (2026-09-01): mainnet Protocol v2 (current) CAMZUXDEMJ4BDEA2FCTXPRQW3VPEJLFOV5IB3NKKJB2G4CV7ANHNSF2N, v1 (legacy) CBUUI7WKGOTPCLXBPCHTKB5GNATWM4WAH4KMADY6GFCXOCNVF5OCW2WI; testnet v2 CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD, v1 CBFE5YSUHCRYEYEOLNN2RJAWMQ2PW525KTJ6TPWPNS5XLIREZQ3NA4KP. https://github.com/daccred/attestprotocol#readme",
			triggers: [
				"attestprotocol contract id",
				"attest protocol contract address",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"kalepail/passkey-kit": [
		{
			note: "ARCHIVED (GitHub API archived:true; last push 2026-07-31; 496 stars) — README: 'This repository has moved… Development of passkey-kit now happens at stellar/passkey-kit… all tags were carried over.' Resolve every passkey-kit question to stellar/passkey-kit; npm passkey-kit's repository field already points there. https://github.com/stellar/passkey-kit",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"kalepail/smart-account-kit": [
		{
			note: "ARCHIVED (GitHub API archived:true; last push 2026-07-31) — README: 'This repository has moved. Development continues at github.com/stellar/smart-account-kit… no further commits, releases, issues, or pull requests will be accepted.' Resolve to stellar/smart-account-kit (npm smart-account-kit). https://github.com/stellar/smart-account-kit",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blend-capital/blend-contract-sdk": [
		{
			note: "Companion of blend-capital/blend-contracts: crates.io blend-contract-sdk (WASM exports of the Blend contracts for use with soroban-sdk) — 2.25.0 (2026-01-26; 11 versions since 0.1.0 on 2024-04-09; ~27k downloads; crate repository points here; MIT). Latest GitHub release v2.25.0 (2026-01-26). https://crates.io/crates/blend-contract-sdk",
			triggers: ["blend contract sdk crate", "blend sdk crates"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"devasignhq/soroban-contract": [
		{
			note: "RENAMED: github.com/devasignhq/soroban-contract redirects to devasignhq/bounty-escrow (GitHub API resolves the old path, 2026-09-01; the README's license badge still names soroban-contract). Bounty-escrow Soroban contract; single release v1.0.0 (2026-06-05); README deploy flow targets testnet. https://github.com/devasignhq/bounty-escrow",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-design-system": [
		{
			note: "npm @stellar/design-system — 4.0.2 (2026-07-28; 76 versions since 2020-12-09; repository points here). Releases are cut by publishing a GitHub release whose tag matches the npm version (v4.0.2 latest); README documents the bump → tag → release workflow. https://www.npmjs.com/package/@stellar/design-system",
			triggers: ["design system npm", "stellar design system package"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"trezor/trezor-firmware": [
		{
			note: "Stellar support lives in two places in the monorepo (2026-09-01): Trezor Core at core/src/apps/stellar (README: all operations except Inflation; files incl. sign_tx.py and sign_soroban_authorization.py, which handles the StellarSignSorobanAuthorization message) and legacy firmware at legacy/firmware/stellar.c (no Soroban code). No Stellar-specific releases — firmware tags cover the whole repo. https://github.com/trezor/trezor-firmware/tree/main/core/src/apps/stellar",
			triggers: ["trezor soroban", "trezor stellar support"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/wallet-backend": [
		{
			note: "No GitHub releases or tags (2026-09-01). Docker Hub image stellar/wallet-backend exists but is stale: only `testing` / testing-2025-05-13-fde7cfa tags, last updated 2025-05-13, while the repo was pushed 2026-09-01 — build from source or use the README's docker compose quickstart (`docker compose up db stellar-rpc-testnet api-testnet ingest-testnet`). https://hub.docker.com/r/stellar/wallet-backend/tags",
			triggers: ["wallet backend docker image"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-disbursement-platform-frontend": [
		{
			note: "Companion UI of stellar/stellar-disbursement-platform-backend; releases follow the SDP version — 7.0.0 (2026-08-19), 6.6.0, 6.5.0. Docker Hub image stellar/stellar-disbursement-platform-frontend (~16.2k pulls; last updated 2026-09-01). Docs: developers.stellar.org/docs/platforms/stellar-disbursement-platform. https://hub.docker.com/r/stellar/stellar-disbursement-platform-frontend",
			triggers: [
				"sdp frontend docker",
				"disbursement platform frontend release",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/soroban-examples": [
		{
			note: "Release tags track the soroban-sdk major they build against: v23.0.0 (2025-09-08, 'Update examples to use SDK v23'), v22.0.1 (2024-12-09), v22.0.0, v21.6.0 — no v24+ tag as of 2026-09-01 although the repo is still pushed (2026-08-30). Contracts build to target/wasm32v1-none/release/*.wasm with the Stellar CLI. https://github.com/stellar/soroban-examples/releases",
			triggers: ["soroban examples sdk version", "soroban examples release"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"bluxcc/core": [
		{
			note: "npm @bluxcc/core — 0.3.2 (2026-09-01; 47 versions since 2025-09-23; repository points here). Licensed BUSL on npm (README section 'License & Usage Restrictions'); install `npm i @bluxcc/core`; site blux.cc. https://www.npmjs.com/package/@bluxcc/core",
			triggers: ["blux npm package", "blux core license"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-broker/client": [
		{
			note: "npm @stellar-broker/client — 0.7.0 (2026-07-16; 22 versions since 2024-08-15; repository points here; MIT); companion contract repo stellar-broker/router-contract; service site stellar.broker. https://www.npmjs.com/package/@stellar-broker/client",
			triggers: ["stellarbroker client npm", "stellar broker npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"rahul-soshte/rs-soroban-client": [
		{
			note: 'Community (non-SDF) Rust client for Stellar RPC: crates.io soroban-client — 0.5.9 (2026-08-26; 46 versions since 0.1.0 on 2023-06-25; ~68.6k downloads; crate repository points here; Apache-2.0). README dependency line: soroban-client = "0.5.9". Not the same as SDF\'s stellar-rpc-client crate. https://crates.io/crates/soroban-client',
			triggers: ["soroban client crate", "soroban client rust"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"ericmt-98/micopay-mvp": [
		{
			note: "Same repo as ericmt-98/micopay-protocol: github.com/ericmt-98/micopay-mvp redirects to Micopay/micopay-protocol (GitHub API, 2026-09-01) — treat both old paths as one project and cite the Micopay org. https://github.com/Micopay/micopay-protocol",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"soneso/stellar-swift-wallet-sdk": [
		{
			note: "Swift wallet SDK layered on Soneso/stellar-ios-mac-sdk (adding it via Xcode's Add Package Dependencies pulls both stellar-wallet-sdk and stellarsdk; `import stellar_wallet_sdk`). Latest release 0.9.4 (2026-08-25); still pre-1.0. README lists SEP-1/6/7/9/10/12/24/30 support. https://github.com/Soneso/stellar-swift-wallet-sdk/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"horizontalsystems/stellar-web-sdk": [
		{
			note: "npm stellar-web-sdk — 0.1.2 (2026-08-12; 3 versions, all 2026-08-12; repository points here; MIT). README install: `npm install stellar-web-sdk @stellar/stellar-sdk` (peer dependency on @stellar/stellar-sdk). No GitHub releases or tags. https://www.npmjs.com/package/stellar-web-sdk",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"horizontalsystems/stellar-kit-android": [
		{
			note: "Not on Maven Central — distributed via JitPack as com.github.horizontalsystems:stellar-kit-android:<version> where <version> is the first 7 characters of a commit hash (README; JitPack's build list confirms hash builds). No GitHub releases or tags; Android 8.0+/Kotlin 2.0+; the client used by Unstoppable Wallet (horizontalsystems/unstoppable-wallet-android). https://github.com/horizontalsystems/stellar-kit-android#installation",
			triggers: ["stellarkit android jitpack", "stellar kit android install"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"reflector-network/reflector-subscription-contract": [
		{
			note: "Companion of reflector-network/reflector-contract (Soroban contract for Reflector subscriptions management; crate name reflector-subscriptions, NOT published to crates.io). Latest release v1.0.2 (2024-11-19; tag v1.0.2_reflector-subscriptions_cli22.0.0); repo last pushed 2025-10-20. https://github.com/reflector-network/reflector-subscription-contract/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// ── P5 batch 3 (2026-09-01): 25 repos / 34 notes, next tier by repoScore
	// (SDKs, tooling, core infra, widely-used contracts first) — every fact
	// verified live on the asOf date against the registry / API / README the
	// note cites. Six repos here are the CURRENT home of a renamed or moved
	// path (soroban-tools, soroban-cli, soroban-rpc, kalepail/passkey-kit,
	// stellar/java-stellar-sdk, ericmt-98/micopay-protocol): each redirect was
	// resolved through the GitHub API, not assumed. Rename DATES are not
	// stated anywhere we read, so no note claims one. 13 further candidates
	// (hackathon demos with only tags, plus the allbridge-io / allbridge-public
	// same-named pair) yielded nothing durable and are deliberately absent.
	"stellar/js-stellar-base": [
		{
			note: "DEPRECATED on npm: every version of @stellar/stellar-base (24 versions, last 15.0.0 on 2026-03-30) carries the deprecation 'This package is now rolled into @stellar/stellar-sdk'; the README (2026-09) says future updates incl. protocol releases ship only in @stellar/stellar-sdk, which re-exports this package's full API — switch the dependency. https://www.npmjs.com/package/@stellar/stellar-base",
			triggers: ["stellar base deprecated", "stellar base still maintained"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Repo is NOT archived (still pushed 2026-08-31) but its last tagged release is v15.0.0 (2026-03-30); the SDK absorbed it at @stellar/stellar-sdk v16.0.0 (see the stellar/js-stellar-sdk note) — resolve base-library questions to stellar/js-stellar-sdk. https://github.com/stellar/js-stellar-base/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/typescript-wallet-sdk": [
		{
			note: "Monorepo publishing THREE npm packages, all at 4.0.1 (2026-08-21): @stellar/typescript-wallet-sdk (first published 2023-05-18), @stellar/typescript-wallet-sdk-km (key manager, 2024-03-26) and @stellar/typescript-wallet-sdk-soroban (2024-05-20); names verified in the repo's @stellar/*/package.json (the npm entries carry no repository field). https://www.npmjs.com/package/@stellar/typescript-wallet-sdk",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "v4.0.0 (2026-08-13) is a breaking major: @stellar/stellar-sdk 15.0.1 → 16.2.0 and the Node minimum raised 20 → 22 (engines node>=22); every pre-4.0.0 version is marked deprecated on npm ('Versions below 4.0.0 are no longer maintained. Please upgrade to v4.0.0+'). https://github.com/stellar/typescript-wallet-sdk/releases/tag/v4.0.0",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"lightsail-network/java-stellar-sdk": [
		{
			note: "Moved out of the stellar org: github.com/stellar/java-stellar-sdk redirects here (GitHub API resolves the old path to lightsail-network/java-stellar-sdk, 2026-09-01). Maven Central coordinates network.lightsail:stellar-sdk — 34 versions from 0.43.1 (2024-03-31) to 5.0.0 (2026-09-01); Javadoc at javadoc.io/doc/network.lightsail/stellar-sdk. https://central.sonatype.com/artifact/network.lightsail/stellar-sdk",
			triggers: ["java stellar sdk moved", "java sdk maven coordinates"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "5.0.0 (2026-09-01) is the Protocol 28 major with a breaking auth default: CAP-71 ADDRESS_V2 credentials on build and simulate (opt-outs: credentialsType SOROBAN_CREDENTIALS_ADDRESS, useUpgradedAuth=false); adds CAP-85 external executable refs. Android needs companion lightsail-network/java-stellar-sdk-android-spi (also 5.0.0). https://github.com/lightsail-network/java-stellar-sdk/releases/tag/5.0.0",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-cli": [
		{
			note: "Two old GitHub paths redirect here — stellar/soroban-tools and stellar/soroban-cli both resolve to stellar/stellar-cli (GitHub API, 2026-09-01). On crates.io it ships as BOTH stellar-cli (28.0.0, 2026-08-26; first published 2023-10-26) and legacy-named soroban-cli (same 28.0.0; since 2022-07-28, ~174k downloads), both with repository = this repo. https://crates.io/crates/stellar-cli",
			triggers: ["soroban cli renamed", "soroban tools renamed"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Install paths per README: install.sh (`curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh`; --install-deps adds the Rust toolchain + wasm32v1-none target), Homebrew `brew install stellar-cli` (formula at 28.0.0), or `cargo install --locked stellar-cli`; latest release v28.0.0 (2026-08-26). https://github.com/stellar/stellar-cli/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-rpc": [
		{
			note: "Renamed from stellar/soroban-rpc — the old GitHub path redirects here (API resolves it to stellar/stellar-rpc, 2026-09-01); the Docker Hub image moved too: stellar/stellar-rpc (updated 2026-08-27) is current while stellar/soroban-rpc is frozen at 2025-01-31. Latest release v28.0.1 (2026-08-27); v28.0.0 2026-08-17, v27.0.0 2026-06-11. https://github.com/stellar/stellar-rpc/releases",
			triggers: ["soroban rpc renamed", "soroban rpc docker image"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/quickstart": [
		{
			note: "Docker Hub image stellar/quickstart (~1.11M pulls, 2026-09-01); no GitHub releases — floating tags latest (mainnet-stable), testing (RCs, mainnet+testnet), futurenet, nightly, nightly-next, plus an immutable per-commit tag v<version>-b<build>.<attempt>-<tag>. README marks it development-only, not for production. https://github.com/stellar/quickstart#tags",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Bundles stellar-core, stellar-rpc, stellar-horizon, friendbot, Lab and galexie behind one port (Horizon :8000/, RPC /rpc, Lab /lab, Friendbot /friendbot); run via `stellar container start` (stellar-cli), `docker run -p 8000:8000 stellar/quickstart --local`, or as a GitHub Action `uses: stellar/quickstart@main` (action.yml in repo root). https://github.com/stellar/quickstart",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/stellar-core": [
		{
			note: "Release train (2026-09-01): v28.0.1 2026-09-01, v28.0.0 2026-08-13, v27.1.0 2026-06-25, v27.0.0 2026-06-05, v26.1.0 2026-05-15; Docker Hub image stellar/stellar-core (~1.22M pulls). https://github.com/stellar/stellar-core/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Two repository security advisories (as of 2026-09-01; re-check the live feed): GHSA-mgx8-frjx-x33m / CVE-2024-32985, medium, 2024-05-09 — remote P2P crash, fixed in v20.4.0; GHSA-3p8h-7v82-ffvq, low, 2025-01-29 — memo mutability with Soroban auth signatures (auth entries not bound to the tx memo), fixed in 22.0.0. https://github.com/stellar/stellar-core/security/advisories",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/rs-soroban-env": [
		{
			note: "Ships on crates.io as soroban-env-host and soroban-env-common (both 28.0.2, 2026-08-17; first published 2022-07-28; ~1.67M downloads each), repository = this repo. Recent tags: v28.0.0 2026-07-31, v27.0.1 and v26.1.4 2026-07-20. https://crates.io/crates/soroban-env-host",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "One repository advisory (as of 2026-09-01): GHSA-pm4j-7r4q-ccg8, low, 2026-03-06 — the muxed-address<->ScVal conversion flag could stick after a failed storage-key conversion, causing spurious contract failures (transaction rolls back; no state corruption); soroban-env-host <26.0.0 affected, fixed in 26.0.0. https://github.com/stellar/rs-soroban-env/security/advisories/GHSA-pm4j-7r4q-ccg8",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/passkey-kit": [
		{
			note: "Moved from kalepail/passkey-kit (496 stars there; archived; README 'This repository has moved… all tags were carried over'); stellar/passkey-kit was created 2026-07-30, so its own star count understates adoption. npm passkey-kit (0.17.0, 2026-09-01; first published 2024-06-06; 126 versions) now points its repository at stellar/passkey-kit. https://www.npmjs.com/package/passkey-kit",
			triggers: ["passkey kit moved", "kalepail passkey kit"],
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "README security status (relay it): unaudited — the smart-wallet contract, SDKs and relayer proxy have had no independent audit; for context rules, thresholds and spending limits it points to the sibling stellar/smart-account-kit built on the audited OpenZeppelin stellar-contracts. Exports PasskeyKit (browser) and PasskeyServer (holds the relayer secret). https://github.com/stellar/passkey-kit",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"creit-tech/stellar-wallets-kit": [
		{
			note: "Published under two scopes: npm @creit.tech/stellar-wallets-kit (2.6.0, 2026-08-28; first published 2024-01-12) and JSR @creit-tech/stellar-wallets-kit (2.6.0; on JSR since 2024-11-02, linked to this repo) — the README's install path is now the JSR one (`npx jsr add @creit-tech/stellar-wallets-kit`). Docs at stellarwalletskit.dev; MIT. https://jsr.io/@creit-tech/stellar-wallets-kit",
			triggers: ["wallets kit package", "wallets kit jsr", "wallets kit npm"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blend-capital/blend-contracts": [
		{
			note: "This is the Blend V1 contract repo — last release v1.0.0 (2024-05-01; per-contract wasm: pool, pool-factory, backstop, emitter), last push 2024-07-29, not archived. V2 contracts live in the separate repo blend-capital/blend-contracts-v2 (v2.0.0, 2025-04-14) with docs in blend-capital/docs-v2; companions blend-sdk-js, blend-utils, blend-contract-sdk. AGPL-3.0. https://github.com/blend-capital/blend-contracts-v2",
			triggers: ["blend v2 contracts"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"coinfabrik/scout-audit": [
		{
			note: "Crate name differs from the repo: cargo-scout-audit (0.3.16, 2026-02-13; first published 2023-06-30; ~36k downloads; repository = this repo) — `cargo install cargo-scout-audit`, then `cargo scout-audit` (html/md/pdf/json/sarif output). GitHub Releases are stale (latest v0.2.10, 2024-04-25; tags reach v0.2.19) — read the version from crates.io. https://crates.io/crates/cargo-scout-audit",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Soroban-specific detector docs live in the companion repo CoinFabrik/scout-soroban (last push 2024-11-07), which installs the same cargo-scout-audit crate; the README lists a VS Code extension (CoinFabrik.scout-audit) and a GitHub Action. This repo last pushed 2026-04-24. https://github.com/CoinFabrik/scout-soroban",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/go": [
		{
			note: "ARCHIVED (GitHub archived:true; last push 2025-12-10). README header: 'REPOSITORY DEPRECATED — This repository has been moved to github.com/stellar/go-stellar-sdk', migration guide MIGRATION.md; services split to stellar/stellar-horizon, stellar/stellar-galexie and stellar/friendbot (see the stellar/go-stellar-sdk note). https://github.com/stellar/go",
			triggers: ["stellar go archived", "stellar go monorepo"],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api repos/stellar/go → archived:true, pushed_at 2025-12-10; raw README.md master lines 13-17.
	"stellar/freighter-mobile": [
		{
			note: "Shipped to both stores — Google Play id org.stellar.freighterwallet and App Store id6743947720 (README badges); tagged releases every 1–3 weeks (v1.19.27 2026-06-17, v1.22.27 2026-08-10, v1.24.28 2026-08-29, v1.25.28 2026-09-01). Dev prerequisites Node ≥22.12 (stellar-sdk 17 ESM), Yarn 4.10. https://github.com/stellar/freighter-mobile/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api releases?per_page=6; raw README.md main lines 2-3 (store URLs) and prerequisites block.
	"stellar/stellar-mpp-sdk": [
		{
			note: "npm name is @stellar/mpp (0.7.1, 2026-07-02; first published 2026-03-30; repository = this repo; Node ≥22, ESM). Stellar method for the Machine Payments Protocol (mpp.dev): 'charge' mode implements draft-stellar-charge-00 via SEP-41 transfers, plus optional one-way payment channels; v0.7 migration guide at docs/migrating-to-v0.7.md. https://www.npmjs.com/package/@stellar/mpp",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: raw package.json main (name @stellar/mpp, engines node>=22, type module); registry.npmjs.org/@stellar%2Fmpp; README head.
	"reflector-network/reflector-contract": [
		{
			note: "Cargo workspace of three crates (oracle, pulse-contract, beam-contract); per-contract releases: v6.0.1 for ReflectorPulse and ReflectorBeam (2026-07-23), v6.0.0 (2026-03-09), older v4.x reflector-oracle wasm (2024-05). Audit PDFs in audits/ (OtterSec 2024 public feed; Code4rena 2025 beam+pulse). README: Pulse = free 5-minute feeds, Beam = paid, faster. https://github.com/reflector-network/reflector-contract/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: default branch master; raw Cargo.toml members; gh api releases?per_page=6; gh api contents/audits; README lines 29-30.
	"stellar/anchor-platform": [
		{
			note: "Releases every 1–3 weeks: 4.7.1 (2026-08-26), 4.7.0 (2026-08-20), 4.6.2 (2026-08-03), 4.6.1 (2026-07-20); Docker Hub image stellar/anchor-platform (~936k pulls, updated 2026-09-01). https://github.com/stellar/anchor-platform/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api releases?per_page=4; hub.docker.com/v2/repositories/stellar/anchor-platform/ (pull_count 936473).
	"stellar/stellar-disbursement-platform-backend": [
		{
			note: "Latest release 7.0.0 (2026-08-19; 6.6.1 2026-06-24, 6.6.0 2026-06-18, 6.5.0 2026-05-05); Docker Hub image stellar/stellar-disbursement-platform-backend (~34.6k pulls, updated 2026-08-27); the UI is the companion repo stellar/stellar-disbursement-platform-frontend. https://github.com/stellar/stellar-disbursement-platform-backend/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api releases?per_page=4; hub.docker.com pull_count 34584; frontend repo present in the census list (score 50).
	"tupui/soroban-cli-python": [
		{
			note: "PyPI name is simply `soroban` (`pip install soroban`): 0.9.1 uploaded 2024-11-12, first release 0.1.0 2024-02-25, 15 releases, Python ≥3.10, project URLs point at this repo. The repo has commits after the last PyPI upload (pushed 2026-08-01) with no newer tag (latest tag v0.9.1). BSD-3-Clause. https://pypi.org/project/soroban/",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: pypi.org/pypi/soroban/json (version, releases, requires_python, project_urls); gh api tags; README `pip install soroban`.
	"acta-team/did-stellar": [
		{
			note: "npm @acta-team/did-stellar (0.1.2, 2026-07-27; first published 2026-05-26; repository = this repo, directory packages/resolver) — did:stellar v0.1 TypeScript SDK (DIF did-resolver compatible) plus a hosted resolver at did.acta.build; repo tag v0.1.3 exists with no matching npm version or GitHub release as of 2026-09-01. https://www.npmjs.com/package/@acta-team/did-stellar",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: registry.npmjs.org/@acta-team%2Fdid-stellar; gh api tags (v0.1.3,v0.1.2,v0.1.0) + releases (v0.1.2, v0.1.0); repo homepage did.acta.build.
	"sentinelfi/stellar-metamask-snap": [
		{
			note: "Published to npm 2026-08-27 as two packages, both 0.1.0 with repository = this repo: stellar-soroban-snap (the MetaMask Snap) and stellar-soroban-snap-connector; root package.json: SEP-0005 key derivation + SEP-43 signing API + companion dapp. Tags v0.1.0, pre-audit, phase-5-prep; repo has an audits/ dir and SECURITY.md. https://www.npmjs.com/package/stellar-soroban-snap",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: packages/{snap,connector}/package.json names; registry.npmjs.org for both (created 2026-08-27T16:17Z); gh api contents/ + tags.
	"kalepail/kale-sc": [
		{
			note: "README publishes the live addresses — MAINNET contract CDL74RF5BLYR2YBLCCI7F5FB6TPSCLKEJUBSD2RSVWZ4YHF3VMFAIGWA (the same README table carries the asset issuer, the SAC and the TESTNET equivalents) — and states the contract is unaudited ('a meme coin'). README parameters: 500 KALE/minute, 5% emission decay per ~30 days, ~500M cap; site kalefarm.xyz; no tagged releases. https://github.com/kalepail/KALE-sc",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: raw README.md main (table + CAUTION block); gh api repos (homepage kalefarm.xyz, releases/latest 404).
	"consulting-manao/tansu": [
		{
			note: "Repo description says development happens on Radicle (radicle.network node rad:zssaAF91kxuquZmZCV2SiK2FNX6s), not GitHub. README publishes the MAINNET contract CDXINK2T3P46M4LWK35FVIXXHJ2XHAS4FOVCGVPJ63YV5OVTM24IY5BI (TESTNET address in the same README), plus an SCF 28/30/41 badge; latest contracts release v2.0.2 (2026-05-12); site tansu.dev. https://github.com/Consulting-Manao/tansu",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api repos (description, homepage); raw README.md main badges; gh api releases?per_page=3.
	"ericmt-98/micopay-protocol": [
		{
			note: "Repo moved: ericmt-98/micopay-protocol now lives at Micopay/micopay-protocol (old path redirects; GitHub API resolves it, 2026-09-01) — cite the new org. MIT; app at app.micopay.xyz. https://github.com/Micopay/micopay-protocol",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api repos/ericmt-98/micopay-protocol → full_name Micopay/micopay-protocol, license MIT, homepage app.micopay.xyz.
	"stellar/laboratory": [
		{
			note: "No tags or GitHub releases; the main branch deploys continuously to lab.stellar.org (README: the deployed commit hash is shown bottom-right of the landing page). Next.js; Node ≥22.22.0, pnpm ≥10.15.1. https://github.com/stellar/laboratory",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// verified: gh api tags (empty) + releases/latest 404; README Overview + Prerequisites.
	// ── P5 batch 2 (2026-09-01): next tier by repoScore, same discipline —
	// every fact verified live on the asOf date; the stellar/go archive +
	// go-stellar-sdk succession re-verified independently before landing
	// (gh api: archived:true / successor pushed same-day). Three dead-link
	// repos are recorded as exactly that — a 404 verified today is a dated
	// fact, not a verdict about the project.
	"stellar/go-stellar-sdk": [
		{
			note: "Successor of the stellar/go monorepo: since October 2025 it holds only SDK packages (txnbuild, horizonclient, rpcclient, ingest, xdr); stellar/go is archived and redirects here (https://github.com/stellar/go). Module path github.com/stellar/go-stellar-sdk \u2014 rename imports from github.com/stellar/go/.., no breaking API changes (https://github.com/stellar/go/blob/master/MIGRATION.md).",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Services were split out of this repo: Horizon -> stellar/stellar-horizon, Galexie -> stellar/stellar-galexie, Friendbot -> stellar/friendbot; Ticker, Keystore and Federation Server were deprecated and removed at tag stellar-go-2025-10-29_10-56-50 (README 'Relocated'/'Deprecated Services': https://github.com/stellar/go-stellar-sdk#relocated).",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Versioning reset to Go module semver: v0.1.0 (2025-12-11) through v0.7.3 (2026-08-24); the last monorepo-style tag was horizonclient-v24.0.0 (2025-10-21). Pre-1.0, so minor bumps may break (https://github.com/stellar/go-stellar-sdk/releases).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"hyperledger-solang/solang": [
		{
			note: "Org moved twice: hyperledger-labs/solang -> hyperledger/solang -> hyperledger-solang/solang; both old GitHub paths redirect to the current repo (https://github.com/hyperledger/solang resolves to hyperledger-solang/solang as of 2026-09).",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Soroban/Stellar target landed in v0.3.4 (2025-06-29): SAC support, cross-contract calls, Soroban authorization framework and storage types; latest release v0.3.5 (2026-07-07) (https://github.com/hyperledger-solang/solang/releases/tag/v0.3.4).",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Distribution: bundled in the Solana Tools Suite v1.16.3+ (no separate install for Solana) and a Brew cask `brew install hyperledger/solang/solang`; companion crate solang-parser on crates.io (0.3.5, ~8.1M downloads) (https://crates.io/crates/solang-parser).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/freighter-backend": [
		{
			note: "TypeScript indexer/backend for the Freighter wallet extension. A next-generation Go rewrite exists at stellar/freighter-backend-v2 ('Freighter's next generation of backend system written in Go', active but no tagged releases as of 2026-09), while this v1 still ships releases (v1.9.1, 2026-05-11) (https://github.com/stellar/freighter-backend-v2).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"diadata-org/soroban-oracle-feeders": [
		{
			note: "Off-chain half of DIA's Soroban oracle stack: a Turborepo monorepo of data-feeder scripts (Node 20/Yarn, docker-compose deploy) that push prices to DIA's on-chain Soroban oracle contracts kept in the companion repo diadata-org/soroban-oracles (contracts last pushed 2024-08-09) (https://github.com/diadata-org/soroban-oracles).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar-light/confidential-agent-commerce": [
		{
			note: "Repo transferred out of the Stellar-Light org: it now lives at theboycoder/confidential-agent-commerce and the old Stellar-Light URL redirects there (GitHub API resolves the old path to the new full_name as of 2026-09-01) (https://github.com/theboycoder/confidential-agent-commerce).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"solomonadzape95/tilt": [
		{
			note: "Repo renamed: solomonadzape95/tilt is now solomonadzape95/crypt (old URL redirects). Project is branded 'API Safety Net' \u2014 a parametric SLA escrow on Soroban paying USDC to subscribers on API downtime, built for the Boundless x Trustless Work Hackathon (https://github.com/solomonadzape95/crypt).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"blockchain-oracle/xlmtools": [
		{
			note: "Published on npm as two packages: @xlmtools/mcp (single-bin MCP stdio server, 0.1.0-0.1.5, first published 2026-04-12) and @xlmtools/cli (bin `xlm`, exports createMcpServer(), up to 0.2.3, first published 2026-04-11) (https://www.npmjs.com/package/@xlmtools/mcp, https://www.npmjs.com/package/@xlmtools/cli).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"e1eng/agentboard": [
		{
			note: "Repo name is not the project name: agentBoard ships 'Signal Vault', an x402 puzzle arena where agents pay USDC per guess to crack a hidden 8-integer vector on Stellar testnet; live at signalvault.eleng.xyz (README: https://github.com/E1eng/agentBoard).",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"noetherdex/noether": [
		{
			note: "Repo no longer accessible: https://github.com/NoetherDEX/noether returns HTTP 404 (deleted or made private) as of 2026-09-01; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"0xnana/searchpay": [
		{
			note: "Repo no longer accessible: https://github.com/0xNana/SearchPay returns HTTP 404 (deleted or made private) as of 2026-09-01; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"alfa117/mongliagent": [
		{
			note: "Repo no longer accessible: https://github.com/ALFA117/MongliAgent returns HTTP 404 (deleted or made private) as of 2026-09-01; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// ── P5 batch (2026-09-01): 17 facts across 12 repos, each verified
	// live against npm/PyPI registries, gh releases/advisories APIs, or the
	// repo's own README on the asOf date (agent-researched, human-reviewed).
	// 13 further candidates honestly yielded nothing durable (testnet-only
	// hackathon demos) and are deliberately absent.
	"stellar/js-stellar-sdk": [
		{
			note: "npm name is @stellar/stellar-sdk (17.0.1, 2026-08-25). Three older packages are deprecated on npm in its favor: stellar-sdk (frozen at 13.3.0), soroban-client (frozen at 1.0.1), and @stellar/stellar-base (rolled into the SDK at v16.0.0, 2026-06-15) \u2014 resolve docs/code importing any of those to @stellar/stellar-sdk. https://www.npmjs.com/package/@stellar/stellar-sdk",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "v17.0.0 (2026-08-20) is the Protocol 28 major: Node >=22.12.0 required (require() fails with ERR_REQUIRE_ESM on Node 22.0-22.11) and React Native no longer needs a Buffer polyfill; the v16 line still gets maintenance releases (v16.3.0 backported Protocol 28 XDR, 2026-08-28). Breaking changes are marked per release: https://github.com/stellar/js-stellar-sdk/releases",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "Publishes agent-facing docs bundles \u2014 llms.txt (index) and llms-full.txt (full corpus + changelog) at https://stellar.github.io/js-stellar-sdk/llms.txt \u2014 point AI tools there instead of scraping the repo; the generated bundles are not committed to the repo itself.",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellarcn/py-stellar-base": [
		{
			note: "Repo name is not the package name: published on PyPI as stellar-sdk (docs: stellar-sdk.readthedocs.io); Python 3.10+, async via the [aiohttp] extra. Companion repos to cite together: lightsail-network/stellar-contract-bindings (Python bindings for Soroban contracts) and StellarCN/stellar-model (Horizon JSON to models). https://pypi.org/project/stellar-sdk/",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "16.0.0 (2026-08-28) is the Protocol 28 major with a breaking auth default: authorize_invocation and simulate_transaction now use CAP-71 ADDRESS_V2 credentials (legacy opt-outs: credentials_type=SOROBAN_CREDENTIALS_ADDRESS, use_upgraded_auth=False); 15.0.0 (2026-07-04) was the Protocol 27 major. Pin the major version. https://github.com/StellarCN/py-stellar-base/releases/tag/16.0.0",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/freighter": [
		{
			note: "Monorepo: the browser extension (5.47.0, 2026-08-31) plus the site-integration npm SDK @stellar/freighter-api (6.0.1, 2025-12-03). The extension is configured against TWO backend repos \u2014 stellar/freighter-backend (V1) and stellar/freighter-backend-v2 (V2), both wired via INDEXER_URL/INDEXER_V2_URL; the mobile app is the separate repo stellar/freighter-mobile.",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "One advisory in the GitHub Advisory Database: GHSA-vqr6-hwg2-775w (high, 2023-08-23) \u2014 mnemonic phrase readable by JavaScript through a private API, fixed in extension 5.3.1. Long patched; only relevant to forks/builds pinned below 5.3.1. https://github.com/stellar/freighter/security/advisories/GHSA-vqr6-hwg2-775w",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellar/smart-account-kit": [
		{
			note: "npm package is the unscoped smart-account-kit (0.6.2, 2026-08-19) \u2014 TypeScript client for the OpenZeppelin/stellar-contracts smart-account contract (passkeys, multi-signers, policies, fee sponsoring). Repo created 2026-07-30; Protocol 27 deployment artifacts are versioned in docs/deployments-protocol-27-2026-07-09.md. https://www.npmjs.com/package/smart-account-kit",
			source: "curated",
			asOf: "2026-09-01",
		},
		{
			note: "README security status (verify before recommending): the SDK, demo, relayer proxy and integration code have NOT had an independent audit; the underlying OZ contracts' audit (rc v0.7.0) has different scope and the deployed artifacts use a later source revision. Breaking changes at v0.4.0 are listed in docs/migration-v0.4.0.md. https://github.com/stellar/smart-account-kit",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"creit-tech/xbull-wallet": [
		{
			note: "For app integration the repo itself points at Stellar Wallets Kit (Creit-Tech/Stellar-Wallets-Kit, npm @creit.tech/stellar-wallets-kit 2.6.0, 2026-08-28) \u2014 one library covering xBull plus other Stellar wallets; the in-page xBullSDK is the older direct path. Latest wallet release v1.40.0 (2025-08-12): SEP-0053 message signing, protocol-23 SDK. AGPLv3. https://github.com/Creit-Tech/xBull-Wallet",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"stellarterm/stellarterm": [
		{
			note: "Web trading client for stellarterm.com; the markets API is the companion repo stellarterm/stellarterm-api (api.stellarterm.com, last push 2024-01). The README's deploy pointer stellarterm/stellarterm.github.io is an archived repo (last push 2018) \u2014 don't cite it as the live deploy path. Testnet mode via stellarterm.com/#testnet. https://github.com/stellarterm/stellarterm",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"shamba-records-limited/microvault": [
		{
			note: "SEP-0056 tokenized-vault engine for microlending; TESTNET deployment \u2014 vault CDZVKARL\u2026 and governance CAL3RYRW\u2026 contract addresses are published in the README (stellar.expert testnet links). v1.1.2 (2026-08-31) added MoneyGram cash-in for repayments and YellowCard collections. AGPL-3.0 with CLA-based dual licensing (commercial license offered). https://github.com/Shamba-Records-Limited/microvault",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"fredericrezeau/xray-games": [
		{
			note: "Engine behind the live arcade xray.games: Soroban contracts plus ZK circuits in BOTH Noir (Poseidon2) and Circom 2.1.9, verified on-chain via Protocol 25 (X-Ray) BN254 Groth16. Three MAINNET contracts are published in the README (Chain Slicer CD4XBH\u2026, Chain Snooker CBLPDJ\u2026, Chain Runner CATJOA\u2026); optional kalepail/ohloss faction integration. MIT. https://github.com/FredericRezeau/xray-games",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"bosun-josh121/clevercon": [
		{
			note: "Repo moved: now lives at clevercon-protocol/clevercon (old Bosun-Josh121 URL redirects; verified 2026-09-01) \u2014 cite the new org. Agent-payment rail + service marketplace on Stellar TESTNET (CleverVault contract CC4QX7\u2026); placed 2nd in the Stellar Agents hackathon; the privacy roadmap builds on companion repo Bosun-Josh121/ciphermit. https://github.com/clevercon-protocol/clevercon",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"ritik4ever/lodestar": [
		{
			note: "Repo moved: now lives at Stellar-Ecosystem/lodestar (old ritik4ever URL redirects; verified 2026-09-01). x402 service-discovery registry + agent credit scoring, two Soroban contracts on TESTNET (registry CAKZALA\u2026, agents CCT4FUTW\u2026); its own README status section says early-stage, demo-ready, not production-grade \u2014 relay that framing. https://github.com/Stellar-Ecosystem/lodestar",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"xaviersharwin10/soroban_node_0": [
		{
			note: "Despite the placeholder repo name, this is the Soroban Security Auditor agent from Stellar Hacks: Agents (April 2026), published on npm as auditor-mcp (0.1.8, 2026-04-12) \u2014 an MCP server whose agent audits Soroban .rs contracts and self-pays 0.15 USDC per audit via x402/Stripe MPP on testnet. Resolve auditor-mcp questions to this repo. https://www.npmjs.com/package/auditor-mcp",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	"davidmaronio/stellarpay402": [
		{
			note: "Published on npm twice: @davidmaronio/stellarpay402-mcp (MCP server, 0.1.1, 2026-04-08) and stellarpay402 (CLI, 0.1.1, 2026-04-13) \u2014 agent-to-agent API marketplace with a Soroban registry contract on TESTNET (CCCCETOW\u2026), built for the April 2026 Stellar x402 hackathon. https://www.npmjs.com/package/stellarpay402",
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// Verified 2026-09-01 from source at BOTH master and the scanned ref
	// (raw.githubusercontent.com, internal/ingest/main.go:38) — the constant
	// the #1 consumer's sls-080 probe reads. Horizon SPLIT out of stellar/go;
	// the monorepo's frozen copy answers with pre-split values (DeepWiki said
	// 22–25), which is exactly why this dated fact must lead the answer.
	"stellar/stellar-horizon": [
		{
			note: "Horizon's protocol ceiling: MaxSupportedProtocolVersion = 28 (a uint32 constant defined in internal/ingest/main.go) (verified 2026-09-01 at master AND at scanned ref 82660510 — https://github.com/stellar/stellar-horizon/blob/master/internal/ingest/main.go). Horizon split out of the stellar/go monorepo; the monorepo's frozen copy still carries pre-split values, so cite THIS repo for current Horizon constants.",
			triggers: [
				"max supported protocol version",
				"maximum supported protocol version",
				"highest supported protocol version",
			],
			source: "curated",
			asOf: "2026-09-01",
		},
	],
	// Verified 2026-08-31 against the GitHub Advisory Database (gh api
	// /advisories/<ghsa>): three repository advisories, severities and patched
	// versions confirmed from the records themselves. Dated facts, not a
	// permanent list — the note says to re-check the live feed.
	"stellar/rs-soroban-sdk": [
		{
			note: "Security advisories (as of 2026-08-31, check the live advisory feed — this list is dated, not permanent): CVE-2026-24889 / GHSA-96xm-fv9w-pf3f, medium — overflow in Bytes::slice, Vec::slice, GenRange::gen_range (soroban-sdk; fixed in 25.0.2 / 23.5.1 / 22.0.9); CVE-2026-26267 / GHSA-4chv-4c6w-w254, high — #[contractimpl] macro calls inherent function instead of trait (soroban-sdk-macros; fixed in 25.1.1 / 23.5.2 / 22.0.10); CVE-2026-32322 / GHSA-x2hw-px52-wp4m, medium — Fr scalar field equality bypasses modular reduction (soroban-sdk; fixed in 25.3.0 / 23.5.3 / 22.0.11). Impact conditions differ per advisory; upgrade to a patched supported branch and recompile affected deployed code.",
			source: "curated",
			asOf: "2026-08-31",
		},
	],
	// Verified 2026-08-01 (SDF Discord thread with earrietadev + our indexing
	// work): per-protocol extension docs live in subdirectory READMEs.
	"creit-tech/stellar-indexer-sdk": [
		{
			note: "Ships per-protocol extensions with their own docs under src/protocols/ (Blend, Reflector, Axis Markets; more in progress) — the root README is the map. Service is token-gated beta; SDK published on JSR as @stellar-indexer/stellar-indexer-sdk.",
			source: "curated",
			asOf: "2026-08-01",
		},
	],
	// Deep-read 2026-08-15 (full tree + package READMEs): architecture,
	// package map, SEP coverage, and the in-repo contract fleet — every fact
	// below verified against source, not README prose alone.
	"fazzatti/colibri": [
		{
			note: "Published on JSR as @colibri/core; fazzatti/colibri-examples is the companion worked-examples repo — cite both together for how-to questions.",
			source: "curated",
			asOf: "2026-07-31",
		},
		{
			note: "TypeScript-first Stellar/Soroban toolkit built on a pipeline/process/step architecture with a plugin system and deterministic error handling — including decoding contract errors out of failed simulation responses (core/common/helpers/contract-error-from-failed-simulation-response).",
			source: "curated",
			asOf: "2026-08-15",
		},
		{
			note: "Monorepo of six JSR packages: @colibri/core (pipelines + Stellar/Soroban utilities), @colibri/webauth (unified SEP-10 + SEP-45 web auth), @colibri/plugin-fee-bump (fee sponsorship via fee-bump wrapping), @colibri/plugin-channel-accounts (sponsored channel-account reuse), @colibri/rpc-streamer (live Soroban event streaming), @colibri/test-tooling.",
			source: "curated",
			asOf: "2026-08-15",
		},
		{
			note: "@colibri/webauth implements unified SEP-10 AND SEP-45 web authentication with deterministic account routing, strict challenge verification, and enforced Soroban simulation — one of the few SEP-45 (contract-account auth) implementations in the ecosystem.",
			source: "curated",
			asOf: "2026-08-15",
		},
		{
			note: "Ships a working smart-account reference fleet as in-repo Soroban contracts (_internal/contracts): passkey-account, delegated-asset-account, recursive-delegate-account, signatureless-account, web-auth — built to compiled wasm with sha256-pinned fixtures and tested against; the code-symbols layer (PasskeyAccount, DelegatedAssetAccount) comes from here.",
			source: "curated",
			asOf: "2026-08-15",
		},
		{
			note: "Engineering rigor above ecosystem norm for its size: Deno-first, co-located unit + integration tests across core modules, codecov coverage gate, custom lint rules, and an AGENTS.md carrying agent-facing contribution instructions.",
			source: "curated",
			asOf: "2026-08-15",
		},
	],
	// Verified 2026-08-15 (stored scan signals + owner confirmation): the EVM
	// giant's Stellar integration is real code in this monorepo.
	"sushi-labs/sushiswap": [
		{
			note: "SushiSwap is live on Stellar: this monorepo carries real Stellar integration code (deps @creit.tech/stellar-wallets-kit + @stellar/stellar-sdk, scanned capabilities contract-invoke + signing) — swap execution against Soroban with wallet-kit signing. Its codeDomains stay interface-derived (the Stellar side is TS integration, not contracts), so it deliberately does NOT carry defi-amm; cite this note for 'is Sushi on Stellar' questions.",
			source: "curated",
			asOf: "2026-08-15",
		},
	],
	"fazzatti/colibri-examples": [
		{
			note: "Companion worked-examples repo for @colibri (Deno runtime): getting-started/ carries the newcomer walkthroughs, examples/ the per-feature recipes, each with its own README — the practical entry point before reading colibri core.",
			source: "curated",
			asOf: "2026-08-15",
		},
	],
};

export interface AuditRecord {
	projectSlug: string | null;
	auditor: string | null;
	publishedAt: string | null;
}

/**
 * Build the notes array for one repo: curated entries for its fullName plus
 * one derived audit note when its owning project has reports in the registry.
 * Deterministic and complete — enrich writes the RESULT wholesale each pass.
 */
export interface RepoSignals {
	lastCommitAt?: string | null;
	codeInUse?: {
		contracts?: number | null;
		events?: number | null;
		eventsDelta?: number | null;
		subinvocations?: number | null;
		subinvocationsDelta?: number | null;
		asOf?: string | null;
	} | null;
}

/**
 * A curated note DIRECTLY answers a question when the query carries a
 * specific identifier — a camelCase / snake_case / dotted single token of
 * ≥8 chars, the shape of a constant or symbol name — that appears verbatim
 * (canon-squashed) in the note text. Deliberately TIGHT: generic prose
 * questions never match, so a note can only outrank a DeepWiki walkthrough
 * when it names the exact thing asked about (sls-080: a dated, source-cited
 * fact beats an undated third-party index that contradicts the scanned ref).
 * Public notes only — internal curation memos never become answers.
 */
export function findDirectAnswerNote(
	q: string,
	notes: KnowledgeNote[],
): KnowledgeNote | null {
	// Audit hardening (2026-09-01, three reproduced hijacks): (1) citation
	// URLs inside notes were matchable, so any question quoting github.com/
	// npmjs.com led whichever note first cited one — URLs are stripped before
	// anything matches; (2) bare registrable domains pass the dotted-token
	// shape but are not identifiers — dropped; (3) canon-squashing the whole
	// note let "internal_ingest" infix-match "internal/ingest/main.go" —
	// matching is now EXACT equality between identifier token sets extracted
	// from both sides with the same regex, never substring containment.
	const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
	const IDENT_RE = /[A-Za-z][A-Za-z0-9_.]*[A-Za-z0-9]/g;
	const isIdentShape = (w: string) =>
		/[a-z][A-Z]/.test(w) || /_/.test(w) || /^[a-z]+\.[a-z]+/i.test(w);
	const isBareDomain = (w: string) =>
		/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,}$/i.test(w) &&
		!/[A-Z].*[a-z]|[a-z].*[A-Z]/.test(w.replace(/\..*$/, "")) &&
		!w.includes("_");
	const identsOf = (text: string) =>
		new Set(
			(text.match(IDENT_RE) ?? [])
				.filter((w) => isIdentShape(w) && !isBareDomain(w))
				.map(canon)
				.filter((w) => w.length >= 8),
		);
	const qIdents = identsOf(q);
	if (qIdents.size) {
		for (const n of notes) {
			if (n.visibility === "internal") continue;
			const nIdents = identsOf(n.note.replace(/https?:\/\/\S+/g, " "));
			for (const t of qIdents) if (nIdents.has(t)) return n;
		}
	}
	// Trigger-phrase path (sls-080 round 2): the upstream probe asks the
	// question in plain English — "which Horizon ingestion constant pins the
	// highest supported protocol version" — which carries no identifier, so
	// the path above can never serve the note and DeepWiki's stale value wins.
	// Triggers are curated IN THIS FILE, never derived from input, and match
	// on whole-word sets (the infix trap stays dead: every trigger word must
	// appear as its own word in the question).
	const qWords = new Set(
		q
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean),
	);
	for (const n of notes) {
		if (n.visibility === "internal") continue;
		if ((n.triggers ?? []).some((t) => triggerFires(t, qWords))) return n;
	}
	return null;
}

/** Every word of the trigger appears as its own word in the question (≥2). */
function triggerFires(trigger: string, qWords: Set<string>): boolean {
	const words = trigger.toLowerCase().split(/\s+/).filter(Boolean);
	return words.length >= 2 && words.every((w) => qWords.has(w));
}

/**
 * Route a plain-English question to the ONE repo whose curated trigger
 * phrases fire on it — before the lexical index gets a vote. On 2026-09-01
 * "soroban cli renamed" routed to tupui/soroban-cli-python by name while the
 * rename fact lived on stellar/stellar-cli's note, so the trigger path inside
 * findDirectAnswerNote never ran. Exactly one repo or nothing: an ambiguous
 * trigger is a curation defect, not a routing decision, and falls through.
 */
export function findRepoByTrigger(q: string): string | null {
	const qWords = new Set(
		q
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean),
	);
	const hits = new Set<string>();
	for (const [repo, notes] of Object.entries(REPO_KNOWLEDGE_NOTES)) {
		for (const n of notes) {
			if (n.visibility === "internal") continue;
			if ((n.triggers ?? []).some((t) => triggerFires(t, qWords))) {
				hits.add(repo);
			}
		}
	}
	return hits.size === 1 ? [...hits][0] : null;
}

export function buildKnowledgeNotes(
	fullName: string,
	projectSlug: string | null,
	auditsByProject: Map<string, AuditRecord[]>,
	signals?: RepoSignals,
): KnowledgeNote[] {
	const notes: KnowledgeNote[] = [
		...(REPO_KNOWLEDGE_NOTES[fullName.toLowerCase()] ?? []),
	];
	const audits = projectSlug ? (auditsByProject.get(projectSlug) ?? []) : [];
	if (audits.length) {
		const dated = audits
			.filter((a) => a.publishedAt)
			.sort((a, b) =>
				String(b.publishedAt).localeCompare(String(a.publishedAt)),
			);
		const latest = dated[0] ?? audits[0];
		const latestBit = latest?.auditor
			? ` (latest: ${latest.auditor}${latest.publishedAt ? `, ${String(latest.publishedAt).slice(0, 10)}` : ""})`
			: "";
		// Audit-drift context (code-truth): "audited" and "audited N days +
		// commits ago" are different claims — say both, day-granular, only when
		// both dates exist.
		let driftBit = "";
		const latestDay = latest?.publishedAt
			? String(latest.publishedAt).slice(0, 10)
			: null;
		if (latestDay) {
			const driftDays = Math.max(
				0,
				Math.floor(
					(Date.now() - Date.parse(`${latestDay}T00:00:00Z`)) / 86_400_000,
				),
			);
			const commitDay = signals?.lastCommitAt
				? String(signals.lastCommitAt).slice(0, 10)
				: null;
			const changedBit =
				commitDay !== null
					? commitDay > latestDay
						? "; the repo has committed since"
						: "; no commits since"
					: "";
			driftBit = ` Latest report is ${driftDays} day${driftDays === 1 ? "" : "s"} old${changedBit}.`;
		}
		notes.push({
			note: `${audits.length} security audit report${audits.length === 1 ? "" : "s"} on record for the owning project${latestBit} — full reports via /api/audits?q=${encodeURIComponent(projectSlug ?? "")}.${driftBit}`,
			source: "derived:audit",
			asOf: new Date().toISOString().slice(0, 10),
		});
	}
	// Live-usage fact (code-truth): the repo's attributed mainnet contract(s)
	// show real activity per stellar.expert — static depth plus live usage.
	const use = signals?.codeInUse;
	if (use?.asOf && typeof use.contracts === "number" && use.contracts > 0) {
		const ev = typeof use.events === "number" ? use.events : null;
		const evDelta =
			typeof use.eventsDelta === "number" ? use.eventsDelta : null;
		const fmt = (n: number) => n.toLocaleString("en-US");
		notes.push({
			note: `Live on mainnet: ${use.contracts} attributed contract${use.contracts === 1 ? "" : "s"}${ev !== null ? `, ${fmt(ev)} lifetime events${evDelta !== null ? ` (${evDelta >= 0 ? "+" : ""}${fmt(evDelta)} since the prior weekly snapshot)` : ""}` : ""} per stellar.expert.`,
			source: "derived:usage",
			asOf: String(use.asOf).slice(0, 10),
		});
	}
	return notes;
}
