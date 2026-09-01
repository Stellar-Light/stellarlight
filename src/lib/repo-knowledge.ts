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
	const qWords = new Set(q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
	for (const n of notes) {
		if (n.visibility === "internal") continue;
		for (const t of n.triggers ?? []) {
			const words = t.toLowerCase().split(/\s+/).filter(Boolean);
			if (words.length >= 2 && words.every((w) => qWords.has(w))) return n;
		}
	}
	return null;
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
