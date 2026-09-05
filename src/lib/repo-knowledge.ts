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
	// ── P5 batch 10 (2026-09-05): the 62 never-examined pool rows — 47 repos /
	// 47 notes, 15 internal triage verdicts (BATCH_10_TRIAGE_2026_09_05).
	// Registry identities that link back (@kyvernlabs/pulse+mcp, @dfns/sdk,
	// @idos-network/client), README-published MAINNET IDs confirmed on
	// stellar.expert with creation dates (arka.fund factory/registry, Nirium's
	// client-owned DeFindex vault), release schemes (Moonlight soroban-core,
	// sorocarbon per-contract tags, quilltip), Cargo-pinned soroban-sdk versions
	// (25.3.0 / 25 / 26.1.0 / 22 / 21.0.1-preview.3 / 25.1.0), an SCF audit-bank
	// freeze tag (nectar), three renames resolved by 301 (Query402, RizoDAO,
	// NUUP — REPO_SUPERSESSIONS carries them), one dated 404. The 29 identity
	// notes are for rows with NO GitHub description — the README's own tagline,
	// its named hackathon, and its stated network, dated by the README commit.
	// Held to the bar: orbitkit-fun/stellar-agent-kit's four npm packages list a
	// repository that 404s (triage, not a note). ~250 GitHub API calls.
	"dogstarapps/arka.fund": [
		{
			note: "README (2026-07-04): 'Arka.fund is a non-custodial asset-management protocol for Stellar/Soroban' — managers create configurable vaults ('Arkas'). Mainnet: 'Mainnet release gate: passed on 2026-06-13'; 'deployed contract WASM hashes match the manifest as of 2026-07-03'; canonical IDs in deployments.mainnet.json — Arka Factory CAIVP3OKEPRAXCN5GRMNOZCVCF6VLI6DDDZ4X5NOIUUC73I5EGLG4CYK and Arka Registry CCMCYADNUESGFRIJRZ2AOHUZBIPMRLVZCHB3BVIPHZCKGWFJSSJQBXAY, both created on the public network 2026-06-11 by GBHIT7TX… (stellar.expert, read 2026-09-05); also Router CCZNPW4X…, Venue Registry CAR5IEPA…, OracleGuard CDHSFLLD…, Aquarius Adapter CAOJRRH3…. App app.arka.fund; no tags or releases. https://github.com/dogstarapps/arka.fund#readme",
			triggers: ["arka fund contracts", "arka fund mainnet"],
			source: "curated",
			asOf: "2026-07-04",
		},
	],
	"shariqazeem/kyvernlabs": [
		{
			note: "npm @kyvernlabs/pulse — 0.2.0 (2026-04-08; 2 versions since 2026-04-03; repository → this repo; MIT): 'x402 analytics middleware — multi-chain (Base, Stellar, Solana), blockchain-verified'; companion @kyvernlabs/mcp 0.2.0 (2026-04-04), 'MCP server for KyvernLabs Pulse — 17 tools'. README 'Pulse by KyvernLabs': Stellar verification via @stellar/stellar-sdk v15 on mainnet (horizon.stellar.org) + testnet, USDC; dashboard at kyvernlabs.com/pulse/dashboard. No tags or releases. https://www.npmjs.com/package/@kyvernlabs/pulse",
			triggers: ["kyvernlabs pulse npm", "x402 revenue analytics stellar"],
			source: "curated",
			asOf: "2026-04-08",
		},
	],
	"dfns/dfns-sdk-ts": [
		{
			note: "npm @dfns/sdk — 0.8.29 (2026-09-03; 185 versions since 2023-06-13; repository → this repo; MIT), the Dfns TypeScript SDK; GitHub release 0.8.29 the same day (README install `npm i @dfns/sdk`, Node 18+). Dfns' docs list Stellar among supported networks (docs.dfns.co/networks/stellar — Stellar wallets, sign and broadcast). https://www.npmjs.com/package/@dfns/sdk",
			triggers: ["dfns typescript sdk", "dfns sdk npm"],
			source: "curated",
			asOf: "2026-09-03",
		},
	],
	"idos-network/idos-sdk-js": [
		{
			note: "npm @idos-network/client — 1.5.0 (2026-08-11; 9 versions since 2025-05-22; repository → this repo; MIT), 'idOS Client JavaScript SDK for browser environments'; the client README lists \"stellar\" among wallet types ('Multi-Chain Wallet Support — Works with EVM, NEAR, XRPL, and Stellar wallet types'), with Stellar signature verification under packages/kwil-infra. Monorepo: all @idos-network/* packages are versioned together via Changesets; tags are per package (e.g. @idos-network/issuer-sdk-js@0.0.4). https://www.npmjs.com/package/@idos-network/client",
			triggers: ["idos javascript sdk", "idos stellar wallet"],
			source: "curated",
			asOf: "2026-08-11",
		},
	],
	"moonlight-protocol/soroban-core": [
		{
			note: "GitHub releases v0.5.0 (2026-07-20), v0.4.0 (2026-06-23), v0.3.0 (2026-06-17); 5 tags. Cargo workspace version 0.5.0 pins soroban-sdk =25.3.0 (Cargo.toml at HEAD). README: 'Moonlight: the missing privacy layer, for any blockchain, built on Stellar' — 'the core smart contracts and modules for the Moonlight Protocol on Soroban' (moonlightprotocol.io); the v0.5.0 notes declare the wasm32v1-none target in rust-toolchain.toml. https://github.com/Moonlight-Protocol/soroban-core/releases",
			triggers: [
				"moonlight soroban core release",
				"moonlight protocol contracts",
			],
			source: "curated",
			asOf: "2026-07-20",
		},
	],
	"nectar-network/nectar": [
		{
			note: "README (2026-08-16): 'Multi-operator keeper infrastructure for Soroban DeFi. Distributed liquidation network for Blend Protocol on Stellar'; 'Canonical repository: github.com/Nectar-Network/nectar — other mirrors may lag'; contracts 'frozen at tag audit-freeze-v1 for the SCF Soroban Security Audit Bank' (tag dated 2026-08-15; earlier v0.3.0-audit 2026-07-25; no releases). Testnet only: 'Tranche 3 hardened deploy settling in Circle testnet USDC, 2026-07-22' — KeeperRegistry CD33A7IG…, NectarVault CDOGQY7N… on Soroban testnet; the nectar-vault crate targets soroban-sdk 22.0.0. Companion: Nectar-Network/keeper-sdk; site nectarnetwork.fun. https://github.com/Nectar-Network/nectar#readme",
			triggers: [
				"nectar network audit freeze",
				"nectar keeper blend liquidation",
			],
			source: "curated",
			asOf: "2026-08-16",
		},
	],
	"stellarcarbon/sorocarbon": [
		{
			note: "GitHub releases are per-contract tags carrying the stellar-cli version — latest v0.4.5_contracts_sink_carbon_sink-carbon_cli22.8.1 (2025-11-13; a plain v0.4.5 tag the same day; v0.4.4 2025-11-13, v0.4.3 2025-11-03). The workspace targets soroban-sdk 22 (Cargo.toml at HEAD). README: 'Home of Stellarcarbon's Soroban smart contracts' — contracts/sink_carbon; the documented deploy path is testnet ('To deploy the latest release to testnet, first download it from GitHub'), showing a testnet sink contract CBDWJLGQ…. https://github.com/stellarcarbon/sorocarbon/releases",
			triggers: ["sorocarbon release", "stellarcarbon sink contract"],
			source: "curated",
			asOf: "2025-11-13",
		},
	],
	"pragya-shar/quilltip": [
		{
			note: "GitHub releases v1.2.0 (2026-08-25), v1.1.0 (2026-06-22), v1.0.0 (2026-05-08); 4 tags. README 'Quilltip - Decentralized Publishing Platform' (quilltip.me, MIT): micro-tipping for authors on Stellar — 'Network: Stellar Testnet' ('testnet practice today'); the Tipping Contract badge links a testnet contract (CC7Q3HDX…), documented in docs/tipping-contract-testnet-deploy.md. https://github.com/pragya-shar/quilltip/releases",
			triggers: ["quilltip release", "quilltip tipping contract"],
			source: "curated",
			asOf: "2026-08-25",
		},
	],
	"eras256/nirium": [
		{
			note: "README (2026-09-04): 'Nirium's own NiriumVault treasury contract remains on Stellar Testnet, audit-gated' (testnet CBTWMZCG…; NiriumProtocol CC2TU5BD…); 'The autonomous treasury node runs on mainnet over a DeFindex vault the client owns: a third-party contract audited by OtterSec, not ours' — that vault is CAMDXG6L4LXLXXV675KZSHM3BMSETZ4NVMC7JYIQCZ2JTG54OMSK57MH, created on the public network 2026-08-06 (stellar.expert token name 'DeFindex-Vault-Nirium Treasury', read 2026-09-05); 'Mainnet is invite-only'. Badges claim 'SCF Instaward #1 & #2 Delivered'; Apache-2.0; tags showroom-stable (2026-03-27) and deploy-1, no releases. https://github.com/Eras256/Nirium#readme",
			triggers: ["nirium vault mainnet", "nirium treasury contract"],
			source: "curated",
			asOf: "2026-09-04",
		},
	],
	"xccy-labs/xccy-soroban": [
		{
			note: "Only tag oraclehub-v0.1.0-soroban (commit 2026-05-06; no releases); workspace version 0.1.0 targets soroban-sdk 25 (Cargo.toml comment: 'soroban-sdk 25.3 transitively'). README 'Status: early. The OracleHub module is the only thing shipped so far. Hub + 5 adapters are deployed and live on Stellar testnet' — OracleHub v2 CDYX3GID…, ReflectorPrice v2 CACERBYE…, BlendRate CCHP47YX… (testnet); 'Mainnet readiness: security audit, parameter calibration, observability' is an open checkbox. https://github.com/XCCY-Labs/xccy-soroban#readme",
			triggers: ["xccy soroban oraclehub", "xccy interest rate swap soroban"],
			source: "curated",
			asOf: "2026-05-07",
		},
	],
	"cushyon/stellar_migration": [
		{
			note: "README 'CushionStellar' (2026-07-05): 'Capital-protected strategy vaults on Stellar' — a Next.js frontend plus one Soroban contract, 'SEP-41 token + SEP-56 vault with on-chain strategy safety checks'; the strategy-vault crate (0.1.0) targets soroban-sdk 26.1.0 with the wasm32v1-none target (Cargo.toml at HEAD). The repo description 'Migrate the smart contract logic to Stellar' predates this; deploy instructions are testnet; no tags or releases. https://github.com/cushyon/Stellar_migration#readme",
			triggers: ["cushionstellar vault", "cushion stellar strategy vault"],
			source: "curated",
			asOf: "2026-07-05",
		},
	],
	"towa-hi/stellarunitydevtoolkit": [
		{
			note: "README (2026-04-06): 'a set of tools that allows Unity developers to interface with the Stellar smart contract platform (formerly known as Soroban) through RPC' — 'Distributed as a Unity Package Manager package (com.scryingstone.stellar-sdk), targeting Unity 2022.3+'; the manifest at StellarDevToolkit/Packages/com.scryingstone.stellar-sdk/package.json is version 0.1.0, displayName 'Stellar Development Toolkit for Unity' (unity field 6000.0), beside a com.scryingstone.stellar-wallet package. No description, tags, releases or registry listing. https://github.com/towa-hi/StellarUnityDevToolkit#readme",
			triggers: ["unity stellar sdk", "stellar unity toolkit"],
			source: "curated",
			asOf: "2026-04-06",
		},
	],
	"stellarchain/soroban-auditor": [
		{
			note: "README (2026-02-11): 'Decompiler for Soroban WASM contracts -> source-like Rust (focus: reverse engineering, not perfect recompilation)' — binaries soroban-auditor and sdk-analyze; the Cargo package soroban-auditor 2.5.1 at HEAD depends on soroban-sdk 25.1.0 and is NOT on crates.io ('crate soroban-auditor does not exist', 2026-09-05) — build from source with `cargo build`. MIT; no tags or releases. https://github.com/stellarchain/soroban-auditor#readme",
			triggers: ["soroban wasm decompiler", "soroban auditor decompile"],
			source: "curated",
			asOf: "2026-02-11",
		},
	],
	"airswiftio/scf": [
		{
			note: "Soroban contracts only — soroban/contract_deployer, soroban/scf_pool and soroban/scf_soroban, built with `make` and deployed/bumped by per-contract deploy.sh and bump.sh scripts against the network named in a `network_name` file (README, 2024-03-12; it never says what SCF stands for). The pool crate pins soroban-sdk 21.0.1-preview.3 (Cargo.toml at HEAD); the README's setup links point at the retired soroban.stellar.org docs. No description, tags or releases; last push 2025-02-27. https://github.com/Airswiftio/SCF#readme",
			source: "curated",
			asOf: "2024-03-12",
		},
	],
	"emrekayat/query402": [
		{
			note: "RENAMED: this path redirects to github.com/Query402/Query402 (HTTP 301, 2026-09-05). README (2026-08-31): 'Query402 participates in the Stellar Wave program. This public repository is the canonical workspace for Wave issues and contributions'; 'Agentic pay-per-query internet access on Stellar with x402' — a 'hackathon-ready' router for search/news/scrape on stellar:testnet (facilitator keys from channels.openzeppelin.com/testnet); MIT; no tags or releases. https://github.com/Query402/Query402",
			triggers: ["query402 repo", "query402 stellar wave"],
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	"nallely-lopez/rizodao": [
		{
			note: "RENAMED: this path redirects to github.com/RizoDAO/RizoDAO (HTTP 301, 2026-09-05). README 'RIZO — Web3 Beauty Platform for the Latin Curly Hair Community' (2026-04-22): 'Payments: USDC on Stellar Testnet', a $RIZO loyalty token 'Soroban contract deployed' (testnet), 'Phase 2 — Mainnet (Q2 2026)' still a roadmap item; live at rizo-dao.vercel.app; no tags or releases. https://github.com/RizoDAO/RizoDAO",
			triggers: ["rizo dao repo", "rizodao stellar"],
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	"elegidokawai2/hackaton--ajolote-en-ingles-": [
		{
			note: "RENAMED: this path redirects to github.com/Ander-tsx/NUUP (HTTP 301, 2026-09-05). README 'NUUP — ProofWork' (2026-04-26, Spanish): 'Plataforma gamificada de freelancers con reputación on-chain sobre la red Stellar' — four Soroban contracts deployed to testnet by the repo's script ('Red: Testnet Stellar | Token de pago: MXNe (SAC)'); the original path records its hackathon origin ('Hackaton Ajolote'); no tags or releases. https://github.com/Ander-tsx/NUUP",
			triggers: ["nuup proofwork repo", "hackaton ajolote stellar"],
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	"gatogrozero/devengo": [
		{
			note: "No longer accessible: github.com/GatoGroZero/devengo returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-05) — deleted or made private. https://github.com/GatoGroZero/devengo",
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	"0xyudz/magentix": [
		{
			note: "README 'MagentiX — Autonomous AI Agents with x402 Payments on Stellar' (2026-04-13): 'Built for the Stellar Hacks 2026 hackathon' — a marketplace where 'Service Providers register AI tools' and agents pay per call via x402 with a '60/40' provider/platform split, demo at magenti-x-app-frontend-hyr5.vercel.app; Stellar testnet; no description, license, tags or releases. https://github.com/0xyudz/MagentiX#readme",
			triggers: ["magentix repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"7maylord/erebus": [
		{
			note: "README 'Erebus' (2026-04-12): 'Privacy-preserving payment pool for AI agents on Stellar × x402' — agents fund a shared pool and queue payouts so only Pool → Payee appears on-chain; 'Built for the Stellar Agents x402 + Stripe MPP Hackathon'; 'Network: Stellar Testnet', USDC, pool address GBP642BQ…; AGPL-3.0; frontend erebus-x.vercel.app; no tags or releases. https://github.com/7maylord/erebus#readme",
			triggers: ["erebus payment pool", "erebus x402 privacy"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"ella0victor/sentryx402": [
		{
			note: "README 'Sentryx402' (2026-04-13): 'a payment-native agent runner built for the Stellar x402 hackathon' — an autonomous research agent with 'a real wallet, a hard spending budget, a receipt trail', paying per query 'on Stellar testnet using x402' (Freighter on stellar:testnet); sentryx402.vercel.app; no description, license, tags or releases. https://github.com/ELLA0VICTOR/sentryx402#readme",
			triggers: ["sentryx402 repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"glayzz/agentmarket-pro": [
		{
			note: "README 'AgentMarket Pro' (2026-04-12): 'A live AI agent economy where autonomous agents hire each other and pay in real USDC via the x402 protocol on Stellar' — 'Built for Stellar Hacks: Agents — x402 + Stripe MPP Track' (DoraHacks stellar-agents-x402-stripe-mpp), a solo project; 'real USDC transaction on Stellar testnet'; demo agentmarket-pro.vercel.app; no description, license, tags or releases. https://github.com/Glayzz/agentmarket-pro#readme",
			triggers: ["agentmarket pro repo"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"jwattjr/x4tella-mvp": [
		{
			note: "README 'x4tella — Stellar Spend Guardrails for AI Agents' (2026-04-13): 'a Stellar-native controlled spend layer for autonomous AI agents' handling HTTP 402 challenges under maxPerRequest / totalBudget policies; 'Payments are settled in USDC on the Stellar Testnet'; a 'Project Notes & Hackathon Status' section marks it a hackathon build; no description, license, tags or releases. https://github.com/JWattjr/x4tella-mvp#readme",
			triggers: ["x4tella spend guardrails"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"jennivarl/autox420": [
		{
			note: "README 'AutoX420 — On-Chain API Paywall with x402 on Stellar' (2026-04-13): 'An AI agent that autonomously buys real API data using x402 micropayments on Stellar' — five paid endpoints bought every 45 seconds, 'Real USDC transactions on Stellar testnet'; live at auto402-production.up.railway.app; a 'Hackathon Requirements Met' table marks it a hackathon build; sibling Jennivarl/underworld; no description, license, tags or releases. https://github.com/Jennivarl/AutoX420#readme",
			triggers: ["autox420 repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"jennivarl/underworld": [
		{
			note: "README 'UNDERWORLD — AI Research Marketplace on Stellar' (2026-04-13): 'Three AI agents that autonomously buy and sell deep research intelligence' — client, orchestrator (Gemini 2.5 Flash) and specialists paid via x402, '$0.10 USDC' per request; 'Built for the Stellar Agents Hackathon'; 'Real Stellar testnet transactions — USDC verified by x402 facilitator'; sibling Jennivarl/AutoX420; no description, license, tags or releases. https://github.com/Jennivarl/underworld#readme",
			triggers: ["underworld research marketplace"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"unique-coder/stellarbrief": [
		{
			note: "README 'StellarBrief' (2026-04-13): 'A two-sided x402 trading intelligence market on Stellar' — six paid endpoints (crypto/forex prices, news, Claude summaries) at $0.01 USDC per call; 'Built for Stellar Hacks: Agents — April 2026'; 'a complete x402 product on Stellar testnet' (USDC SAC on testnet); no description, license, tags or releases. https://github.com/Unique-coder/stellarbrief#readme",
			triggers: ["stellarbrief repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"techkeyy/the-signaler": [
		{
			note: "README 'The Signaler' (2026-04-11): 'Autonomous Signal Acquisition Network' — seller agents post encrypted crypto-price signals, buyers (Python + stellar-sdk + Gemini) pay 'via x402-inspired protocol on Stellar'; 'Built for Stellar Hacks: Agents on DoraHacks'; 'Real Stellar testnet XLM payments per acquisition' ('Testnet-only transfers'); live at the-signaler-production.up.railway.app; no description, license, tags or releases. https://github.com/Techkeyy/the-signaler#readme",
			triggers: ["the signaler repo"],
			source: "curated",
			asOf: "2026-04-11",
		},
	],
	"aliveevie/sentinelmesh": [
		{
			note: "README 'SentinelMesh — Autonomous DeFi Threat Detection Network on Stellar' (2026-04-04): 'Built for the Agents on Stellar Hackathon — April 2026' (DoraHacks agents-on-stellar); 'Two Rust contracts deployed to Stellar testnet, built with soroban-sdk 21.7.6' — Circuit Breaker CDX4AAQT… and Reputation Registry CBGMETPT… (testnet), four sentinel agents paid over x402 (stellar:testnet); no description, license, tags or releases. https://github.com/aliveevie/sentinelmesh#readme",
			triggers: ["sentinelmesh repo", "sentinelmesh circuit breaker"],
			source: "curated",
			asOf: "2026-04-04",
		},
	],
	"chinesepowered/hack-stellaragents": [
		{
			note: "README 'Stellar Security Audit Agent' (2026-04-11): 'AI-powered smart contract auditor that verifies deployed code, finds vulnerabilities, and stores immutable audit results on Stellar' — compares deployed WASM against source and writes results to a Soroban audit-registry contract (submit_audit); 'Built for the Stellar Agents Hackathon'; Stellar testnet ('The pre-compiled Soroban WASM is included — deploy to testnet'); no description, license, tags or releases. https://github.com/chinesepowered/hack-stellaragents#readme",
			triggers: ["stellar security audit agent"],
			source: "curated",
			asOf: "2026-04-11",
		},
	],
	"comzzy-comzzy/datavend": [
		{
			note: "README 'DataVend — AI-Powered Stellar Data Agent' (2026-04-11): 'An autonomous AI agent that sells on-chain Stellar wallet data per query using the x402 payment protocol on Stellar mainnet' — '$0.01 USDC on Stellar mainnet', verified 'via OpenZeppelin facilitator'; 'Competition: Stellar Hacks: Agents — DoraHacks'; live at datavend.tech / datavend-three.vercel.app; no description, license, tags or releases. https://github.com/comzzy-comzzy/datavend#readme",
			triggers: ["datavend repo", "datavend x402"],
			source: "curated",
			asOf: "2026-04-11",
		},
	],
	"divineudoka12/zerixs": [
		{
			note: "README 'Zerixs' (2026-04-13): 'Goal-based autonomous financial agent network on Stellar' — an orchestrator that pays specialist agents 'through x402 on Stellar testnet' (Groq as the AI provider); its 'Submission Snapshot' and 'Why This Fits The Hackathon' sections mark it a hackathon submission; no description, license, tags or releases. https://github.com/divineudoka12/Zerixs#readme",
			triggers: ["zerixs repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"emdevelopa/stellar_payment_api": [
		{
			note: "README 'PLUTO — Agentic Payment Infrastructure on Stellar' (2026-04-13): 'a dual-mode payment infrastructure' — Freighter checkouts for humans plus an x402Middleware for agents; 'All Stellar interactions use actual testnet transactions' (USDC issuer GBBD47IF… on testnet); the 'Hackathon Notes & Judging Criteria' section lists areas unfinished 'due to hackathon time constraints'; live at stellar-payment-api.vercel.app; no description, license, tags or releases. https://github.com/emdevelopa/Stellar_Payment_API#readme",
			triggers: ["pluto agentic payment", "stellar payment api pluto"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"nice-bills/stipend": [
		{
			note: "README 'Stipend' (2026-04-12): 'Autonomous agent payment sidecar — intercepts HTTP 402 Payment Required responses and pays via Stellar automatically'; 'cross-submitted to two awesome hackathons simultaneously: the Stellar Hacks Hackathon and the OKX Build X Hackathon' with routing between Stellar and OKX X Layer; 'Testnet: Uses XLM (not USDC) on testnet'; @stellar/stellar-sdk; no description, license, tags or releases. https://github.com/nice-bills/stipend#readme",
			triggers: ["stipend payment sidecar"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"rtomas/soundstake": [
		{
			note: "README 'SoundStake' (2026-04-13): 'The first music catalog where AI agents pay musicians directly' — musicians register songs and price tiers on a Soroban contract, buyers pay per use via x402 in USDC; 'Hackathon: Stellar Agents x402 + Stripe MPP'; 'Blockchain: Stellar testnet → mainnet' (deploy steps are testnet, wasm32v1-none); live at soundstake-ten.vercel.app; no description, license, tags or releases. https://github.com/rtomas/soundstake#readme",
			triggers: ["soundstake repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"oscargauss/fan-match": [
		{
			note: "README 'FanForge' (2026-04-13): 'a Massively Multiplayer Online Stadium built for the Stellar Agents x402 Stripe MPP Hackathon' (DoraHacks) — two Claude-powered agents play foosball while fans fund them 'with USDC on Stellar testnet' via x402 micropayments (@stellar/stellar-sdk, Pollar keys); live at fan-forge.ogauss.io; no tags or releases. https://github.com/OscarGauss/fan-match#readme",
			triggers: ["fanforge stadium", "fan match repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"gabrululu/propulsor": [
		{
			note: "README 'Hackathon Context' (2026-08-21): 'Propulsor was originally built for She Ships 2026, a 48-hour global hackathon celebrating International Women's Day (March 6–8, 2026)', then 'extended for the Stellar Agentic Payments Hackathon' (x402 agent) 'and again for Stellar Hacks — Real-World ZK' (Groth16/BLS12-381 and RISC Zero proofs). SplitProtocol and TimeVault Soroban contracts are 'Deployed Testnet'; 'Stellar Mainnet — Post-hackathon'; app propulsor.lovable.app; no tags or releases. https://github.com/Gabrululu/Propulsor#readme",
			triggers: ["propulsor hackathon", "propulsor split protocol"],
			source: "curated",
			asOf: "2026-08-21",
		},
	],
	"penguinpecker/ko402": [
		{
			note: "README 'KO402 — Pay-Per-Move AI Fighting Game on Stellar' (2026-04-06): 'a turn-based fighting game where autonomous AI agents battle each other using real Stellar micropayments' — each move is a USDC payment and the pot (0.2 USDC) settles to the winner; 'Stellar Hacks: Agents — DoraHacks'; 'Stellar Testnet, USDC payments via Horizon SDK' (escrow account GCRRX5XD…); ko402.vercel.app; no description, license, tags or releases. https://github.com/penguinpecker/ko402#readme",
			triggers: ["ko402 fighting game"],
			source: "curated",
			asOf: "2026-04-06",
		},
	],
	"zzzbedream/cortex402": [
		{
			note: "README 'Cortex402' (2026-04-13): 'AI-native payment middleware for the x402 protocol on Stellar' — server-side 402 lifecycle plus typed agent tools (sign_stellar_transaction, check_payment_status) with single-use memo_hash replay protection; Horizon on Stellar Testnet with testnet USDC by default; the repo description is just the name; no license, tags or releases. https://github.com/zzzbedream/Cortex402#readme",
			triggers: ["cortex402 middleware"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"marxmad/agenticx402": [
		{
			note: "README 'PumaX402 — Agentic Services Hub on Stellar' (2026-04-13): 'A unified catalog and access layer for x402 and MPP services on Stellar: discover, pay per request, and consume APIs' — live hub at agenticx402-production.up.railway.app; stellar-sdk + stellar-cli + Soroban (Rust); MIT (Node ≥20); no description, tags or releases. https://github.com/MarxMad/Agenticx402#readme",
			triggers: ["pumax402 hub", "agenticx402 repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"panditdhamdhere/payflow": [
		{
			note: "README 'Payflow Agent Tools' (2026-04-12): 'Pay-per-call HTTP tools for AI agents on Stellar, using x402' — Express + @x402/express + @x402/stellar (exact scheme) with a Vite/React UI and Freighter; prices in 'testnet USDC' (issuer GBBD47IF…), flow 'matches the Stellar x402 quickstart'; written as a submission ('put the live URL at the top of your submission'); MIT; no description, tags or releases. https://github.com/panditdhamdhere/Payflow#readme",
			triggers: ["payflow agent tools"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"isaac-richie/stellarpulse": [
		{
			note: "README 'StellarPulse' (2026-04-13): 'a pay-per-insight intelligence terminal built on Stellar' — Polymarket/Kalshi signals turned into briefs, premium analysis 'behind Stellar x402 payment verification' for humans and agents; needs a 'Stellar testnet account' for payment testing; API at stellarpulse-api.vercel.app; no description, license, tags or releases. https://github.com/isaac-richie/stellarpulse#readme",
			triggers: ["stellarpulse repo"],
			source: "curated",
			asOf: "2026-04-13",
		},
	],
	"methu-ship/toll": [
		{
			note: "README 'toll: The Stellar Agentic API Marketplace' (2026-04-10): 'a decentralized, autonomous marketplace where AI agents buy and sell data and services using the X402 payment protocol on the Stellar Network' — a seller agent registers price/swap/FX feeds, a buyer agent scores and purchases them; 'Stellar Testnet' with Friendbot funding; no description, license, tags or releases. https://github.com/methu-ship/toll#readme",
			triggers: ["toll agentic api marketplace"],
			source: "curated",
			asOf: "2026-04-10",
		},
	],
	"shivraigithub/genesis402": [
		{
			note: "README 'Genesis402 - Stellar x402 Gateway' (2026-04-11): 'a no-code monetization layer that wraps existing APIs with pay-per-request enforcement using x402 on Stellar' — Express/TypeScript backend, Next.js frontend, x402Version 2 challenges; no description, license, tags or releases. https://github.com/ShivRaiGithub/Genesis402#readme",
			triggers: ["genesis402 gateway"],
			source: "curated",
			asOf: "2026-04-11",
		},
	],
	"godbrand0/argent": [
		{
			note: "README 'Argen: Agentic Liquidation Protocol' (2026-04-12): 'an autonomous lending protocol on Stellar that leverages ZK-Proofs and x402 payments' — 'Deployed Contracts (Stellar Testnet)': Vault CBNXMW4Q…, vUSDC CDEMATCS…, ZK Verifier CDGYLCFD… (all testnet); Apache-2.0; argent-mu.vercel.app; no description, tags or releases. https://github.com/Godbrand0/argent#readme",
			triggers: ["argen liquidation protocol", "argent repo stellar"],
			source: "curated",
			asOf: "2026-04-12",
		},
	],
	"soomtochukwu/tradeflow": [
		{
			note: "README 'TradeFlow' (2026-05-15): 'a decentralized, enterprise-grade Trade Finance (TradeFi) platform built on the Stellar network' digitizing Letters of Credit with 'Trustless Work Smart Contract Primitives' (multi-release escrow); 'Built for the Boundless Hackathon'; NEXT_PUBLIC_USE_MAINNET=false by default; trade--flow.vercel.app; no description, license, tags or releases. https://github.com/soomtochukwu/TradeFlow#readme",
			triggers: ["tradeflow letter of credit"],
			source: "curated",
			asOf: "2026-05-15",
		},
	],
	"dpinones/liars-dice": [
		{
			note: "README 'Liar's Dice — Bluffing with ZK Proofs on Stellar' (2026-02-23): 'a PvP bluffing game on Stellar where two players secretly roll dice' with zero-knowledge proofs keeping hands hidden; demo video on YouTube; MIT; no description, tags or releases. https://github.com/dpinones/liars-dice#readme",
			triggers: ["liars dice zk stellar"],
			source: "curated",
			asOf: "2026-02-23",
		},
	],
	"warp-driver/phoenix-blend-pool": [
		{
			note: "README 'phoenix-blend-pool' (2026-06-01): 'WarpDrive-driven rebalance automation for the Phoenix XLM-USDC blended pool variant' — a circuit subscribes to the blended pool's events, WarpDrive operators sign, an aggregator submits at quorum and an automation-handler contract on Stellar verifies; the Rebalance action moves USDC between the pool and Blend; GPL-3.0; no description, tags or releases. https://github.com/warp-driver/Phoenix-Blend-Pool#readme",
			triggers: [
				"phoenix blend pool rebalance",
				"warpdrive phoenix automation",
			],
			source: "curated",
			asOf: "2026-06-01",
		},
	],
	// ── P5 batch 9 (2026-09-02): 26 repos / 27 notes — the 40–49 band (181
	// curated-index rows, 96 examined after registry keys, earlier rejects and
	// rows already carrying a derived audit note). Registry identities that
	// link back (NuGet stellar-dotnet-sdk, hex stellar_sdk/stellar_base, Go
	// firehose-stellar, xBull wallet-connect, BlindPay's node/mcp/go/swift
	// SDKs, asgcard, dfns-sdk-python), Ledger's app-stellar release scheme,
	// four renames resolved by 301, an in-repo Halborn audit PDF confirmed via
	// the API, products whose GitHub releases are the download channel, two
	// dated 404s. Held to the bar: four repos whose only registry identity
	// does NOT link back to the repo (hot-dao/omni-sdk, tenk-dao/smartdeploy,
	// xycloo/rs-zephyr-toolkit, lockb0x-llc/pakana-…) are recorded as triage
	// verdicts instead. Every README contract ID in this band was checked on
	// stellar.expert — none is a mainnet deployment. 66 further repos yielded
	// nothing durable (26 not Stellar at all; 19 README-only; 17 hackathon /
	// testnet / fork) and sit in BAND_40_49_TRIAGE_2026_09_02. 3 API calls.
	"ledgerhq/app-stellar": [
		{
			note: "The Ledger hardware-wallet app for Stellar — Cargo package `stellar` 6.0.3 at HEAD; README: transaction signing on Nano X, Nano S+, Nano Gen5, Stax and Flex (ledger_app.toml devices: nanox, nanos+, stax, flex, apex_p). Releases are per-device tags carrying the app version: stax_1.10.0_6.0.3_sdk_v26.0.2 and flex_1.6.0_6.0.3_sdk_v26.0.2 (2026-04-22), nanox_2.7.0_6.0.3_sdk_v26.0.2 (2026-04-21); 388 tags. https://github.com/LedgerHQ/app-stellar/releases",
			triggers: ["ledger stellar app version", "ledger nano stellar app"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"beans-bv/dotnet-stellar-sdk": [
		{
			note: "NuGet stellar-dotnet-sdk — 15.1.0 (2026-06-07; 95 versions since 2.0.0 on 2018-05-31; the current 15.x entries list this repo as project URL while the 2021 7.2.x entries list elucidsoft/dotnet-stellar-sdk); companion package stellar-dotnet-sdk-xdr 15.1.0. README: 'Stellar API SDK for .NET', a port of the Java SDK (lightsail-network) with SEPs ported from Soneso's Flutter SDK; latest pre-release 16.0.0-beta (2026-06-25). https://www.nuget.org/packages/stellar-dotnet-sdk",
			triggers: ["dotnet stellar sdk nuget", "stellar dotnet sdk"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kommitters/stellar_sdk": [
		{
			note: "Hex stellar_sdk — 0.23.0 (2026-06-03; 45 releases since 2021-08-18; GitHub link → this repo; MIT), the Elixir SDK for Stellar. CHANGELOG 0.23.0 (02.06.2026): Protocol 22/23/26 support, stellar_base ~> 0.17.0, CreateContractArgsV2 (CAP-0058); the previous release 0.22.0 was 2024-08-16. Low-level XDR companion: kommitters/stellar_base. https://hex.pm/packages/stellar_sdk",
			triggers: ["elixir stellar sdk", "stellar sdk hex package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kommitters/stellar_base": [
		{
			note: "Hex stellar_base — 0.17.0 (2026-06-03; 42 releases since 2021-08-12; GitHub link → this repo; MIT): 'low-level elixir library to read, write, hash, and sign XDR primitive constructs'. CHANGELOG 0.17.0 (02.06.2026): Protocol 22/23/26, TransactionMetaV4, Quorum Freeze (CAP-0077), contract constructors (CAP-0058), muxed SCAddress (CAP-0079); the previous release 0.16.0 was 2024-07-23. Consumed by kommitters/stellar_sdk. https://hex.pm/packages/stellar_base",
			triggers: ["elixir stellar xdr library"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"streamingfast/firehose-stellar": [
		{
			note: "Go module github.com/streamingfast/firehose-stellar — v1.2.1 (2026-08-28; 10 tags; Go proxy origin → this repo). CHANGELOG: v1.2.1 requires stellar-core >= 28.0.1-3508 (SDF's fix for the August 2026 critical security advisory); v1.2.0 (2026-08-25) Protocol 28 (CAP-0083/CAP-0085); v1.1.0 (2026-06-18) Protocol 27 + the captive-core fetcher. A release is a tag push built by release.yml (binaries, images, Homebrew formula). https://github.com/streamingfast/firehose-stellar/blob/HEAD/CHANGELOG.md",
			triggers: ["firehose stellar release", "firehose stellar version"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "README (2026-09-02): 'Captive-core is the supported backend going forward. The RPC poller is kept for compatibility but is no longer actively developed — new deployments should use captive-core.' `firestellar fetch captive-core` is the recommended path; `firestellar fetch rpc` (Stellar RPC endpoint) is legacy, maintenance-only. https://github.com/streamingfast/firehose-stellar#readme",
			triggers: [
				"firehose stellar backend",
				"firehose stellar captive core",
				"firehose stellar rpc poller",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"creit-tech/xbull-wallet-connect": [
		{
			note: "npm @creit.tech/xbull-wallet-connect — 0.4.0 (2025-08-13; 2 versions since 2024-09-15; repository → this repo): 'connect your website with xBull Wallet in both extension and webapp version'. The README's install line is `npm i --save @creit.tech/xbull-wallet-connect` but it recommends installing from GitHub by version tag ('we use Github instead of NPM'); GitHub releases 0.1.0…0.4.0 (4 tags; 0.4.0 on 2025-08-13). https://www.npmjs.com/package/@creit.tech/xbull-wallet-connect",
			triggers: [
				"xbull wallet connect package",
				"connect website xbull wallet",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobstrco/stellar-identicon-js": [
		{
			note: "npm stellar-identicon-js — 1.0.0 (2019-09-19; 2 versions since 2019-09-18; repository → this repo; ISC): canvas identicons derived from a Stellar public key. README: the Python twin Lobstrco/stellar-identicon-py yields the same image for the same address by default, and LOBSTR's hosted service id.lobstr.co/<G…>.png serves 210×210 PNGs generated by the Python version behind CloudFront. No tags. https://www.npmjs.com/package/stellar-identicon-js",
			triggers: ["stellar identicon library", "identicon from stellar address"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"beans-bv/beans-merchant-sdk-javascript": [
		{
			note: "npm beans-merchant-sdk — 5.0.0 (2025-10-29; 11 versions since 2024-01-30; MIT; repository → github.com/Beans-BV/merchant_sdk_javascript, which redirects here — HTTP 301, 2026-09-02). README 'Beans Merchant JavaScript SDK': QR-code payment requests and on/off-ramp integration with the Beans app on Stellar; GitHub releases 1.0.0…5.0.0 (20 tags; 3.0.0–5.0.0 all published 2025-10-29). Sibling SDK: Beans-BV/beans-merchant-sdk-dart. https://www.npmjs.com/package/beans-merchant-sdk",
			triggers: ["beans merchant sdk npm", "beans merchant javascript"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"xcapit/openzktool": [
		{
			note: "RENAMED: github.com/xcapit/stellar-privacy-poc — the path in this repo's package.json (npm name stellar-privacy-sdk 0.1.0-poc) — redirects here (HTTP 301, 2026-09-02); the README badges still point at fboiero/stellar-privacy-poc, which returns 404. README 'OpenZKTool — Privacy infrastructure for Stellar Soroban using Zero-Knowledge Proofs', Status: Proof of Concept (Groth16/BN254 verifier for Soroban), AGPL-3.0; no tags or releases. https://github.com/xcapit/openzktool",
			triggers: ["openzktool repo renamed", "stellar privacy poc repo"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"sorobanhooks/freighter": [
		{
			note: "RENAMED: this path redirects to github.com/sorobanhooks/aptopia-wallet (HTTP 301, 2026-09-02), a fork of stellar/freighter (GitHub 'forked from' banner). README 'Aptopia': 'non-custodial smart wallet on the Stellar testnet' built as a Freighter fork with yield vaults, a trading agent, x402 pay-per-call data and an OpenZeppelin Smart Account — 'Mainnet is gated on audit + funding — this codebase targets Stellar testnet only.' No tags. https://github.com/sorobanhooks/aptopia-wallet",
			triggers: ["aptopia wallet repo", "sorobanhooks freighter fork"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"coinfabrik/scout-soroban": [
		{
			note: "README install line `cargo install cargo-scout-audit` — crates.io cargo-scout-audit 0.3.16 (2026-02-13; 39 versions since 2023-06-30) lists repository github.com/coinfabrik/scout-audit, not this repo: the maintained analyzer (ink!, Soroban, Substrate) lives in CoinFabrik/scout-audit; this Soroban-specific repo (last push 2024-07-31; no tags) hosts the docs site. Companions: VS Code extension CoinFabrik.scout-audit, GitHub Action coinfabrik/scout-actions@v3; SCF-funded. https://crates.io/crates/cargo-scout-audit",
			triggers: [
				"scout soroban install",
				"soroban static analysis tool",
				"scout audit crate",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"coinfabrik/scout-actions": [
		{
			note: "GitHub Marketplace action 'Run Scout Action' (`uses: coinfabrik/scout-actions@v3`; action.yml name 'Scout Security Analysis' — 'Runs Scout security analysis on Rust projects and reports findings'); latest release v3.2 (2025-01-31; 22 tags). README: Scout assists ink!, Soroban and Substrate developers; the analyzer itself is CoinFabrik/scout-audit (crate cargo-scout-audit). https://github.com/marketplace/actions/run-scout-action",
			triggers: ["scout github action", "soroban security github action"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"dfns/dfns-sdk-python": [
		{
			note: "PyPI dfns-sdk — 0.0.2 (2026-05-08; 4 releases since 2026-01-12; Repository → this repo), the Dfns Python SDK (GitHub release v0.0.2 the same day; 4 tags). Dfns' docs list Stellar among supported networks — 'Network-specific features, signature kinds, supported assets, and integration requirements for Stellar wallets on the DFNS platform' (docs.dfns.co/networks/stellar), with Stellar sign and broadcast API references. https://pypi.org/project/dfns-sdk/",
			triggers: ["dfns python sdk", "dfns stellar wallets"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"blindpaylabs/blindpay-node": [
		{
			note: "npm @blindpay/node — 5.3.1 (2026-08-07; 42 versions since 2025-09-27; repository → this repo; MIT), 'Official Node.js SDK for Blindpay API - Stablecoin API for global payments'; GitHub release v5.3.1 the same day (8 tags). BlindPay's own changelog dates its 'Stellar Integration' to 2025-05-09 and a 'Stellar Wallet Rotation and Testnet USDB Fix' to 2026-05-15. https://www.npmjs.com/package/@blindpay/node",
			triggers: ["blindpay node sdk", "blindpay stellar integration"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"blindpaylabs/blindpay-mcp": [
		{
			note: "npm @blindpay/mcp — 1.7.1 (2026-08-08; 16 versions since 2026-01-05; repository → this repo; MIT), 'Official MCP Server for BlindPay API - Stablecoin API for global payments'; GitHub release v1.7.1 the same day (13 tags). Stellar is one of BlindPay's rails per its changelog ('Stellar Integration', 2025-05-09). https://www.npmjs.com/package/@blindpay/mcp",
			triggers: ["blindpay mcp server"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"blindpaylabs/blindpay-go": [
		{
			note: "Go module github.com/blindpaylabs/blindpay-go — v1.19.0 (2026-08-04; Go proxy origin → this repo; 20 tags, four of them cut on 2026-08-04), 'Blindpay's Golang SDK'. Stellar is one of BlindPay's rails per its changelog ('Stellar Integration', 2025-05-09). https://pkg.go.dev/github.com/blindpaylabs/blindpay-go",
			triggers: ["blindpay go sdk"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"blindpaylabs/blindpay-swift": [
		{
			note: "Swift package distributed by git tag (Package.swift: package blindpay-swift, product BlindPay) — latest release v4.5.1 (2026-08-07; 27 tags; v4.4.0 and v4.5.0 on 2026-08-04), 'BlindPay's Swift SDK'. Stellar is one of BlindPay's rails per its changelog ('Stellar Integration', 2025-05-09). https://github.com/blindpaylabs/blindpay-swift/releases",
			triggers: ["blindpay swift sdk"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"asgcompute/asgcard-public": [
		{
			note: "npm @asgcard/sdk 1.1.5, @asgcard/cli 0.7.8 and @asgcard/mcp-server 0.6.3 (all 2026-04-08; 15/26/14 versions since 2026-03-10/13; MIT) each list repository → this repo. README 'ASG Card': agent-first virtual MasterCards paid 'via Stellar x402 (USDC) or Stripe Machine Payments Protocol', hosted at asgcard.dev; the README's license link points at ASGCompute/asgcard, which returns 404 (private). No tags. https://www.npmjs.com/package/@asgcard/sdk",
			triggers: ["asg card sdk", "asgcard npm packages"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"normalfinance/normal-stellar-amm": [
		{
			note: "GitHub releases: v1.0.0 (2025-11-06) plus per-contract tags of the same day (e.g. v1.0.0_contracts_pool_plane_pool-plane_cli22.8.1; 11 tags). README 'Audits': 'Summer 2025 x Halborn' — audits/ holds 'Normal x Halborn - Summer 2025 Audit.pdf' and THREAT.MD (GitHub API, 2026-09-02). Cargo workspace contracts/* + modules/*; sibling protocol repo normalfinance/stellar-v1 (renamed from lsp). https://github.com/normalfinance/normal-stellar-amm/releases",
			triggers: ["normal stellar amm audit", "normal amm halborn"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"satoshipay/solar": [
		{
			note: "Solar Wallet — README: 'User-friendly Stellar wallet, featuring multi-signature, custom assets management and more. Runs on Mac OS, Windows, Linux, Android and iOS'; binaries ship via GitHub releases — latest v0.28.1 (2022-06-03; 85 tags; v0.28.0 2021-10-27); keys encrypted with PBKDF2-SHA256 + xsalsa20-poly1305; solarwallet.io still links these downloads (2026-09-02). Last push 2022-06-03. https://github.com/satoshipay/solar/releases",
			triggers: ["solar wallet release", "satoshipay solar wallet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellarterm/stellarterm-desktop-client": [
		{
			note: "README: 'the StellarTerm client now in a desktop app format' — downloads via GitHub releases; latest 'StellarTerm Desktop Client v2220' (2023-02-21; 20 tags; previous v1956 2021-06-22, v1768 2020-05-29). The web client is the sibling stellarterm/stellarterm. https://github.com/stellarterm/stellarterm-desktop-client/releases",
			triggers: ["stellarterm desktop download", "stellarterm desktop release"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobstrco/vault-ios": [
		{
			note: "Source of the LOBSTR Vault iOS app — README links App Store id1452248529 ('LOBSTR Vault - Multi-signature security on the Stellar network'; local key storage; signs for one or more Stellar accounts; N-of-N across devices); single GitHub release 1.3.2 (2020-05-07; 2 tags); last push 2025-02-12. Android sibling: Lobstrco/vault-android. https://apps.apple.com/app/lobstr-vault/id1452248529",
			triggers: ["lobstr vault ios source", "lobstr vault app store"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"bigger-tech/simple-stellar-signer": [
		{
			note: "MOVED: github.com/PlutoDAO/simple-stellar-signer — the path the README's docs links still use — redirects here (HTTP 301, 2026-09-02). README 'Simple Signer': embeddable login + transaction signing for Stellar supporting xBull, Albedo, Freighter, Rabet, WalletConnect, LOBSTR and Ledger, with hosted instances named as sign.bigger.systems (+ -testnet, -futurenet). No tags; last push 2025-03-14. https://github.com/bigger-tech/simple-stellar-signer",
			triggers: ["simple stellar signer repo", "plutodao simple signer"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"devasignhq/apps": [
		{
			note: "No longer accessible: github.com/devasignhq/apps returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-07-31 (description: monorepo of the DevAsign Maintainer and Contributor apps, app.devasign.com). The owner's public escrow repo is devasignhq/bounty-escrow. https://github.com/devasignhq/apps",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"devasignhq/devasign-api": [
		{
			note: "No longer accessible: github.com/devasignhq/devasign-api returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-06-19 and a release v1.1.0 dated 2026-06-26. The owner's public escrow repo is devasignhq/bounty-escrow. https://github.com/devasignhq/devasign-api",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stanbar/stellot": [
		{
			note: "GitHub releases: 0.0.1 'Draft for SCF' (2020-03-21), 0.1.0 'IEEE Access' (2020-09-22), 0.2.0 'draft' (2023-10-27; 3 tags). README 'Stellot† on Soroban': a PhD-thesis proof-of-concept of the Stellot† receipt-free e-voting protocol (Feldman VSS/DKG, Shamir threshold decryption, hash nullifiers) with the election contract in contracts/election; live at stellot.com ('Threshold E-Voting on Soroban', 2026-09-02). https://github.com/stanbar/stellot/releases",
			triggers: ["stellot voting soroban", "stellot releases"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	// ── P5 batch 8 (2026-09-02): 18 repos / 21 notes — the band BELOW the pool,
	// curated-index repos with repoScore 50–59 (156 in the band; 98 examined
	// after registry keys, earlier rejects and rows already carrying notes).
	// Registry identities that link back (@x402/stellar + PyPI x402,
	// @lobstrco/signer-extension-api, @x402xlm/start, a Docker Hub image),
	// README-published MAINNET contract IDs confirmed on stellar.expert with
	// creation dates (hitz-gravity, contracts-acta, stellar8004, a2a-protocol),
	// one archive dated only by GitHub's banner (soroswap/frontend), three
	// path moves resolved by 301, one hosted product with releases, five dated
	// 404s. The other 80 yielded nothing durable and are recorded as internal
	// triage verdicts (BAND_50_59_TRIAGE_2026_09_02) so the board can tell
	// judged from unexamined when the pool widens to this band: 46 hackathon
	// demos / ZK games, 15 testnet-only or registry-less products, 5 not
	// Stellar repos, 5 with a registry identity but no Stellar fact in their
	// docs, 5 README-claimed packages unpublished or not linking back, 4
	// tag-only. Research used 16 GitHub API calls.
	"x402-foundation/x402": [
		{
			note: "npm @x402/stellar — the 'x402 Payment Protocol Stellar Implementation', Apache-2.0, repository → this repo, published since 2026-03-10. Depends on @stellar/stellar-sdk ^16 and @x402/core; the README's SDK install line lists it among the chain packages next to @x402/core. Git tags are per package (npm-@x402/stellar@v<version>). Read the current version from npm — this package releases continuously (three publishes in a day, 2026-09-04) and a version pinned here would be a stale mirror rather than knowledge. https://www.npmjs.com/package/@x402/stellar",
			triggers: ["x402 stellar npm", "x402 stellar package"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "PyPI x402 is the Python SDK (MIT; Repository → this repo; tags are per package, pypi-x402@v<version>); npm @x402/core (published since 2025-12-10) and the older unscoped npm x402 (since 2025-02-20, superseded by the scoped packages) both link back here. There is NO single latest GitHub release for this repo — it carries hundreds of per-package tags, so a plain 'latest release' lookup answers the wrong question. Read current versions from PyPI/npm rather than from here; this project publishes several releases a day. https://pypi.org/project/x402/",
			triggers: ["x402 python sdk"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"soroswap/frontend": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jul 24, 2026' (read 2026-09-02; the same day as soroswap/spacewalk-implementation and phoenix-zephyr-indexer). Repo description: 'OLD Soroswap.Finance Frontend for Soroswap AMM, Soroswap Aggregator & Spacewalk Bridge Implementation'; last push 2025-08-24; no tags or releases; the README still points at soroswap.finance. https://github.com/soroswap/frontend",
			triggers: ["soroswap frontend archived"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobstrco/lobstr-browser-extension": [
		{
			note: "npm @lobstrco/signer-extension-api — 2.1.0 (2026-07-24; 3 versions since 2024-03-27; repository → this repo; Apache-2.0), the client SDK in this monorepo's @lobstrco/signer-extension-api workspace (same 2.1.0 at HEAD). README: the LOBSTR signer extension lets dapps connect to the Stellar network and sign with the LOBSTR mobile wallet. No tags or releases. https://www.npmjs.com/package/@lobstrco/signer-extension-api",
			triggers: ["lobstr signer extension npm", "lobstr extension api package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"community-exchange-network/komunitin": [
		{
			note: "MOVED: github.com/komunitin/komunitin — the clone URL in this repo's own README — redirects here (HTTP 301, 2026-09-02). README: Komunitin 'Open System for Exchange Communities'; its accounting service is 'the decentralized backend for the accounting API based on the Stellar blockchain' (accounting/); live demo at demo.komunitin.org, docs at docs.komunitin.org. No tags. https://github.com/community-exchange-network/komunitin",
			triggers: ["komunitin repo moved", "komunitin accounting stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"skyhitz/hitz-gravity": [
		{
			note: "README 'Mainnet': HITZ Gravity Token (Soroban SEP-41, soroban-sdk 25) at CBAPZAZNNB4X3VPXV2LYA5RMV7XHXIVREES2GG7R5GUXDZ4R4CKOY4EU, WASM hash befa64d9…5b08, max supply 100,000,000 HITZ — stellar.expert (public) shows the contract created 2026-04-25 with the same wasm prefix; the 'Validated Source' is GitHub release v1.0.0 (2026-04-29). Powers skyhitz.io. https://stellar.expert/explorer/public/contract/CBAPZAZNNB4X3VPXV2LYA5RMV7XHXIVREES2GG7R5GUXDZ4R4CKOY4EU",
			triggers: ["hitz token contract", "skyhitz gravity token"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"acta-team/contracts-acta": [
		{
			note: "README 'Mainnet Deployments' + docs/deployments/mainnet.md (deployed 2026-06-30): did-stellar-registry 0.2.0 = CD6LSWW5ZSXOO5WAIHKQLQ262TW7BPI37PNEVMMA273BAPC65NN2AYXQ; vc-vault-factory 0.1.0 = CCWNZ6UMUXCDOVP2TWOPVLI4KP4VY4YF7VKPN6XLYVHNFAT24NDB33CX (vc-vault 0.4.0 instances are deployed by the factory from template WASM 2bd0323a…); factory fee 1 USDC per credential. Both IDs exist on stellar.expert (public), created 2026-06-30. https://github.com/ACTA-Team/contracts-acta#mainnet-deployments",
			triggers: ["acta mainnet contracts", "acta vault factory contract"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "Latest GitHub release mainnet-v1.0.0 'Mainnet launch - 2026-06-30' (2026-06-30); contract releases are per-crate tags (vc-vault-v0.4.0 2026-06-23, did-stellar-registry-v0.2.0, vc-vault-factory-v0.1.0; 7 tags). Cargo workspace 0.21.0 with repository → this repo. The did:stellar TypeScript resolver/SDK is the sibling acta-team/did-stellar. https://github.com/ACTA-Team/contracts-acta/releases",
			triggers: ["acta contracts release"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"rohan911438/a2a-protocol": [
		{
			note: "README 'Mainnet': escrow contract CADGOK3EO3F5IJAD2JVG4V65N2GXHAWEY5QERK66BZI7UBEQPQJLKRL3 on Stellar Mainnet (Public) — stellar.expert (public) shows it created 2026-08-08. The README self-describes as 'a hackathon project' (Team Brotherhood) with a live frontend at a2aprotocol.netlify.app; the A2AT token is 'Proposed, Not Yet Implemented'. No tags or releases. https://stellar.expert/explorer/public/contract/CADGOK3EO3F5IJAD2JVG4V65N2GXHAWEY5QERK66BZI7UBEQPQJLKRL3",
			triggers: ["a2a protocol escrow contract"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"progax01/stellar8004": [
		{
			note: "AgenticOcean — README 'Smart Contracts — Mainnet': VaultFactory CAXYXFBO26RSBU2HRNPDWOQ7M2WITX67E7PI543WHDDMM5F7U4WQOUXM, AgentRegistry CDKHR3UUKCKXJ6CRKWKUZI3SKWAAKJMU6TGHRBM2VJJBCKEO6ETH55AU, ReputationRegistry CB6B4EBQ3JXLGUWF5WGMQV63PL3K2WQP5LMEL2BZDIDTEPCIC5BDH6ZB, ValidationRegistry CDX65CKW2NZQZK5U7DQRK6KVOBI4PTLQVGHYAEQ7OPPY2KRCDUAS2AL5 — all four on stellar.expert (public), created 2026-02-23 by one deployer. Live demo agenticocean.solbinary.com. https://github.com/progax01/stellar8004#smart-contracts--mainnet",
			triggers: ["agenticocean contracts", "agenticocean mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "README 'Published SDKs' names npm @agenticocean/vault 0.1.1, @agenticocean/x402-stellar 1.0.1 and @agenticocean/defi-agent 0.3.1 (all 2026-02-23) — but none of the three registry entries points at this repo (vault and defi-agent carry no repository field; x402-stellar names a different path, stellaragent402/stellaragent402), so cite this README, not npm, for identity. https://www.npmjs.com/package/@agenticocean/vault",
			triggers: ["agenticocean npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"asgcompute/xlmx402earn": [
		{
			note: "npm @x402xlm/start — 1.3.3 (2026-04-11; 7 versions since 2026-04-09; repository → this repo; Apache-2.0), the `npx @x402xlm/start` quick-start skill the README badges ('Quick-start skill for AI agents to earn XLM on the Stellar testnet'); GitHub release v1.0.0 'Hackathon Submission' (2026-04-10; Stellar Hacks: Agents); hosted at stellar-agent-earn.vercel.app. Testnet product. https://www.npmjs.com/package/@x402xlm/start",
			triggers: ["x402xlm start package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"inferara/soroban-security-portal": [
		{
			note: "README 'Container Images': Docker Hub georgii4inferara/soroban-security-portal (API — the hub description is this repo's URL), soroban-security-portal-ui and sorobansecurityportal (Helm), all tagged 1.0.129 on 2026-08-26. The portal is hosted at stellarsecurityportal.com, listed on Tansu (project 'securityportal') and funded by the SCF + Stellar Public Good Program (README badge). No tags. https://hub.docker.com/r/georgii4inferara/soroban-security-portal",
			triggers: [
				"security portal docker image",
				"stellar security portal hosted",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"litemint/litemint": [
		{
			note: "README: app.litemint.com is 'a bespoke, open-source, non-custodial Stellar wallet built for gamers and digital collectors' (BIP-39, SLIP-0010/SEP-0005 derivation, SDEX trading, NFTs); its build guide downloads source from GitHub releases — latest v1.3.2 (2021-01-28; 9 tags). The npm package litemint (1.0.1, 2018) points at github.com/FredericRezeau/litemint, a separate repo, not this one. https://github.com/litemint/litemint/releases",
			triggers: ["litemint wallet release", "litemint web wallet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"normalfinance/stellar-v1": [
		{
			note: "RENAMED: github.com/normalfinance/lsp — the path still in this repo's package.json repository field — redirects here (HTTP 301, 2026-09-02). README 'Normal Stellar v1': USDC-backed synthetic-asset protocol (Cargo workspace 1.0.0, contracts/* + modules/*); git tags 1.0.0 (2026-01-26) and pre-fee-change, no GitHub releases (API, 2026-09-02); docs at docs.normalfinance.io. https://github.com/normalfinance/stellar-v1",
			triggers: ["normal finance lsp repo", "normal stellar v1 renamed"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"devasignhq/bounty-escrow": [
		{
			note: "Current path of devasignhq/soroban-contract (old path → HTTP 301 here, 2026-09-02; the README's badges still name soroban-contract; the registry also carries that old key). Single GitHub release v1.0.0 'Initial Release' (2026-06-05; 1 tag); Cargo package devasign_task_escrow 0.1.0; README deploy flow targets testnet and derives the mainnet USDC SAC from Circle's issuer GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN. https://github.com/devasignhq/bounty-escrow",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"devasignhq/soroban-escrow": [
		{
			note: "No longer accessible: github.com/devasignhq/soroban-escrow returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-07-21. The owner's public escrow contract repo is devasignhq/bounty-escrow (see that note). https://github.com/devasignhq/soroban-escrow",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"0xbhoomi/agentmesh": [
		{
			note: "No longer accessible: github.com/0xbhoomi/agentmesh returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-04-12 (an April-2026 agents-hackathon row). https://github.com/0xbhoomi/agentmesh",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"gdalabs/autorepay-stellar": [
		{
			note: "No longer accessible: github.com/gdalabs/autorepay-stellar returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-04-11 (an April-2026 agents-hackathon row). https://github.com/gdalabs/autorepay-stellar",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"thesupermanish/superpage-stellar": [
		{
			note: "No longer accessible: github.com/TheSupermanish/superpage-stellar returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-04-13 (an April-2026 agents-hackathon row). https://github.com/TheSupermanish/superpage-stellar",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"yieldback-cash/amm": [
		{
			note: "No longer accessible: github.com/yieldback-cash/amm returns 404 with no redirect (HTML page, git ls-remote and the GitHub API all agree, 2026-09-02) — deleted or made private; our index last saw a push on 2026-04-10. Sibling yieldback-cash/* rows were triaged in batch 5. https://github.com/yieldback-cash/amm",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	// ── P5 batch 7 (2026-09-02): 34 repos / 35 notes — the first batch aimed at
	// the board's notes POOL itself (curated-index repos with repoScore ≥ 60
	// and no note; entities.json → repos.coverage.knowledgeNotes.missing),
	// not at "the next tier by repoScore". All 149 pool repos were worked:
	// 34 carry a durable fact (registry identities that link back — Soneso
	// PHP SDK, @airgap/stellar, Keybase, Noir, Rango; README-published
	// mainnet contract IDs confirmed on stellar.expert; hosted products; six
	// path moves resolved through the API; three repos that now return 404,
	// dated; one author-declared shutdown). The other 115 yielded nothing
	// durable and are named with reasons in the batch notes: 72 hackathon
	// demos with tags only, 16 stub READMEs, 10 README-claimed packages that
	// are unpublished or do not link back, 10 with no registry or tags, 5
	// testnet-only products, 2 not Stellar repos at all — roughly half the
	// un-noted pool is April-2026 x402/MPP and ZK-gaming hackathon output
	// and is un-curatable by design. No rename or archive date is claimed;
	// no pool repo carries GitHub's archive banner. Research used 9 API calls.
	"soneso/stellar-php-sdk": [
		{
			note: "Packagist package soneso/stellar-php-sdk — 1.13.0 (2026-08-24; 87 versions since 0.0.1 on 2021-12-29; repository → this repo; Apache-2.0), matching GitHub release 1.13.0 'v1.13.0 Protocol 28 (CAP-85) support and ADDRESS_V2 defaults' (2026-08-24). README install: `composer require soneso/stellar-php-sdk`, PHP 8.0+. https://packagist.org/packages/soneso/stellar-php-sdk",
			triggers: ["php sdk composer", "stellar php sdk install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"airgap-it/airgap-coin-lib": [
		{
			note: "npm @airgap/stellar — 0.13.47 (2026-07-28; 46 versions since 2025-05-15; repository → this monorepo; MIT), the Stellar protocol module of AirGap's coinlib, published alongside @airgap/coinlib-core 0.13.47 (541 versions since 2020-12-17, same repo). 0.13.47 is also the newest of 82 git tags; no GitHub releases. https://www.npmjs.com/package/@airgap/stellar",
			triggers: ["airgap stellar npm", "airgap coinlib stellar module"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"airgap-it/airgap-vault": [
		{
			note: "Latest GitHub release v3.34.4 (2026-03-26; 71 tags). package.json at HEAD depends on @airgap/stellar 0.13.46 — the Stellar module published from sibling airgap-it/airgap-coin-lib. README 'Download': Google Play id it.airgap.vault and App Store id1417126841; the offline key-holder half of the pair with airgap-it/airgap-wallet. https://github.com/airgap-it/airgap-vault/releases/tag/v3.34.4",
			triggers: ["airgap vault release", "airgap vault stellar support"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"airgap-it/airgap-wallet": [
		{
			note: "Latest GitHub release v3.34.4 (2026-03-26; 97 tags), cut the same day as airgap-vault v3.34.4. package.json at HEAD depends on @airgap/stellar 0.13.46 (from sibling airgap-it/airgap-coin-lib). README 'Download': Google Play id it.airgap.wallet and App Store id1420996542; the online, public-data half of the AirGap pair. https://github.com/airgap-it/airgap-wallet/releases/tag/v3.34.4",
			triggers: ["airgap wallet release", "airgap wallet stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"keybase/client": [
		{
			note: "Latest GitHub release v6.6.3 (2026-06-03; 190 tags). Docker Hub image keybaseio/client ('Official Keybase CLI client distribution'; last updated 2026-06-05; nightly-* tags; standard/slim/alpine/node/python variants defined in packaging/linux/docker/README.md, which names this repo for issues). Stellar wallet code lives under go/stellar (https://github.com/keybase/client/tree/master/go/stellar). https://hub.docker.com/r/keybaseio/client",
			triggers: ["keybase docker image", "keybase stellar wallet code"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"noir-lang/noir": [
		{
			note: "npm @noir-lang/noir_js 1.0.0-beta.26 (2026-07-30; 655 versions since 2023-09-15; repository → this repo, directory tooling/noir_js; MIT OR Apache-2.0) and @noir-lang/noir_wasm 1.0.0-beta.26 (745 versions; compiler/wasm). Latest non-nightly GitHub release v1.0.0-beta.26 (2026-07-30); a nightly-YYYY-MM-DD release is cut daily (nightly-2026-09-01); Cargo workspace version 1.0.0-beta.26. https://www.npmjs.com/package/@noir-lang/noir_js",
			triggers: ["noir latest version", "noir js npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "55 published GitHub security advisories (unique GHSA ids across the six advisory pages, read 2026-09-02); newest GHSA-v2q4-prvf-7h73 'Incorrect conditional mutable reference assignment in Brillig' (Moderate, 2026-06-09); a batch of eight on 2026-05-19 incl. High GHSA-j4p3-qjx6-rmvx 'Load Store Forwarding incorrectly eliminates stores'. https://github.com/noir-lang/noir/security/advisories",
			triggers: ["noir security advisories", "noir compiler vulnerabilities"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"rango-exchange/rango-sdk": [
		{
			note: "npm rango-sdk 0.5.0 and rango-sdk-basic 0.5.0 (both 2026-05-18; 109 / 110 versions since 2022-02-10 / 2022-05-08; repository → this monorepo; GPL-3.0), matching GitHub release rango-sdk-basic@0.5.0 (2026-05-18); releases are per-package tags (rango-sdk@, rango-sdk-basic@, rango-types@). README install: `npm install rango-sdk-basic --save` or `npm install rango-sdk --save`. https://www.npmjs.com/package/rango-sdk",
			triggers: ["rango sdk npm", "rango sdk install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"rango-exchange/rango-client": [
		{
			note: "Monorepo of the Rango widget and wallets library (README: wallets/, queue-manager/, widget/); releases are per-package tags — widget-embedded@0.63.0 and provider-freighter@0.4.0 both on 2026-08-18 (3,386 tags). Stellar support is the wallets/provider-freighter package (package.json name @rango-dev/provider-freighter; Freighter wallet). https://github.com/rango-exchange/rango-client/releases/tag/provider-freighter%400.4.0",
			triggers: ["rango freighter provider", "rango widget release"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"akanimoh12/stellar-ipredict": [
		{
			note: "README 'Deployed Contracts (Stellar Mainnet)': Prediction Market CDGNPRYTFDXJLWZE4YDKZXW4IEN2RLPSE4N7VM5HJ7NLPL2QC45GIXI5, IPREDICT Token CAYL4TKNRMXAX5ZLQGFEZ6XOC2QHTCTN5QC2SB5BEEHLVO6SDU2UBLRH, Referral Registry CAGJVX6EXMCKKWDJCQFIEJ34CZTHZOGLWJM6KQTGDEXEO723CJZ5773H, Leaderboard CCWWOQSDSO3XXLCMA6A2HYRUFYVNUJZ2HPAMFQSPOB4JWYIBY2HWVTOB — all four exist on pubnet per stellar.expert (created 2026-06-02). Frontend https://ipredict-stellar.vercel.app (200 on 2026-09-02). https://github.com/Akanimoh12/Stellar-iPredict",
			triggers: ["ipredict contract address", "ipredict mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"sandragcarrillo/nexus4agents": [
		{
			note: "README 'Deployed Contracts — Mainnet': NexusRegistry CCR4Y2DLRJCQPGQJ2UNVZEOFANZEJC5NK6X6VGLP7PCVYTAQ54G4XSL2 and NexusPool CAWAYAYBUJUTTBTNLFOZ5S7AF3COO526WAZXJ6EHR45NJ6ZQ546K4B6O (both exist on pubnet per stellar.expert, created 2026-04-11), plus a testnet pair; one backend serves both networks (mainnet under a /mainnet/ prefix). Live app https://nexus4agents.vercel.app/ (200 on 2026-09-02). https://github.com/sandragcarrillo/nexus4agents",
			triggers: ["nexus registry contract", "nexus4agents mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"vinaystwt/xmpp": [
		{
			note: "npm @vinaystwt/xmpp-core 0.2.0 and @vinaystwt/xmpp-mcp 0.2.0 (both 2026-04-04; 3 versions each; repository → this repo; MIT) — the README's 'Public Packages' (`npm install @vinaystwt/xmpp-core @vinaystwt/xmpp-mcp`): gateway client / route planning, and an MCP server factory. README links its DoraHacks submission (Stellar Agents x402 + Stripe MPP hackathon). https://www.npmjs.com/package/@vinaystwt/xmpp-core",
			triggers: ["xmpp npm package", "xmpp core mcp install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"martinvibes/sentinelshield": [
		{
			note: "npm sentinelshield-stellar — 0.1.0 (2026-04-11; single version; repository → this repo; MIT; bins sentinelshield and sentinelshield-stellar), the README's `npm install sentinelshield-stellar`. README banner: 'currently live on Stellar Testnet while we finish a security audit … Mainnet is coming'; 'Built for the Stellar agentic payments hackathon'. https://www.npmjs.com/package/sentinelshield-stellar",
			triggers: ["sentinelshield npm", "sentinelshield mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"daraijaola/runbox": [
		{
			note: "npm runbox-client — 1.0.0 (2026-04-11; single version; repository → this repo; MIT), the README's `npm install runbox-client` SDK; GitHub release v1.0.0 the same day (the only tag). README also documents an MCP server (`npm install -g runbox-mcp`) and a Soroban spending-cap contract on testnet. https://www.npmjs.com/package/runbox-client",
			triggers: ["runbox client npm", "runbox sdk install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"fxjrin/defi-copilot": [
		{
			note: "npm defi-copilot-mcp — 1.3.1 (2026-04-12; 7 versions since 2026-04-11; repository → this repo; MIT; bin defi-copilot-mcp), the README's MCP server: `claude mcp add defi-copilot -- npx -y defi-copilot-mcp` (default STELLAR_NETWORK=testnet). The repo's package.json is named defi-copilot; the published npm name is defi-copilot-mcp. GitHub tags v1.0.0–v1.1.1. https://www.npmjs.com/package/defi-copilot-mcp",
			triggers: ["defi copilot mcp", "defi copilot npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"ggoldani/agent-passport": [
		{
			note: "npm @ggoldani/agent-passport-sdk 0.1.0 and @ggoldani/agent-passport-mcp 0.1.0 (both 2026-05-06; single versions; repository → this repo; MIT; MCP bin agent-passport-mcp) — the README's two install paths (app SDK vs MCP for Claude/Cursor); README examples target Soroban testnet RPC. https://www.npmjs.com/package/@ggoldani/agent-passport-sdk",
			triggers: ["agent passport sdk", "agentpassport mcp install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lumenwipe/lumenwipe": [
		{
			note: "README: non-custodial web app to close a Stellar account and recover locked XLM (API builds unsigned txs, the browser signs), hosted at https://lumenwipe.com with docs at https://docs.lumenwipe.com (both 200 on 2026-09-02); status line: 'the classic account wind-down runs today on testnet and mainnet. Soroban & DeFi protocol exits … are in active development'. Apache-2.0. https://github.com/LumenWipe/lumenwipe",
			triggers: ["lumenwipe close account", "lumenwipe hosted app"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"bytemaster333/account-demolisher": [
		{
			note: "README: 'Live at https://demolisher.app/' (200 on 2026-09-02) — closes Stellar accounts: classic entries, Soroban DeFi positions on Blend, Aquarius, Soroswap and FxDAO, balance conversion to XLM, CEX destinations via a mediator account, multisig signature collection, and a SEP-41 allowance viewer; security model at https://docs.demolisher.app/docs/developers/security/model (200). Node 22. https://github.com/bytemaster333/account-demolisher",
			triggers: ["account demolisher app", "demolisher close stellar account"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"carstenjacobsen/x402-testing-tool": [
		{
			note: "README: hosted at https://x402test.org (200 on 2026-09-02) — a Server Simulator (create a simulated x402-paywalled endpoint: method, path, network e.g. Stellar Testnet, asset, amount, receiving address) and a Client Simulator (send a request, get 402, build the payment, resubmit); wallet support 'currently only the Freighter wallet'. https://github.com/carstenjacobsen/x402-testing-tool",
			triggers: ["x402 testing tool", "x402test simulator"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobster-protocol/stellar-integrations": [
		{
			note: "README: React dashboard for the Soroban contracts of sibling https://github.com/Lobster-Protocol/Stellar ('our 2025 Build Award'; 200 on 2026-09-02), deployed on testnet; live at https://stellar-instit.lobster-protocol.com (200). Routing proofs run on mainnet through Stellar Broker (@stellar-broker/client), custody via DFNS, wallets via @creit-tech/stellar-wallets-kit v2 from JSR. https://github.com/Lobster-Protocol/stellar-integrations",
			triggers: ["lobster stellar dashboard", "lobster protocol build award"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lum-agg/stellar-dex-agg": [
		{
			note: "GitHub releases 'LumAgg 0.2.1' (tag swap-api-v0.2.1, 2026-08-07) and 'LumAgg 0.2.0' (2026-08-02); four swap-api-v* tags; Apache-2.0. README: routes swaps across Soroswap, Aquarius (xy=k, stable, CLMM), Phoenix, Sushi V3 and Comet, with optional comparison against Classic DEX path payments; docs/scf-resubmission-budget.md is described as 'SCF #44 resubmission — $80k tranche deliverables'. https://github.com/Lum-Agg/stellar-dex-agg/releases",
			triggers: ["lumagg release", "lumagg dex sources"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"moonlight-protocol/local-dev": [
		{
			note: "README 'Repos' names the Moonlight stack as nine sibling repos under github.com/Moonlight-Protocol — provider-platform, provider-console, council-platform, council-console, pay-platform, moonlight-pay, network-dashboard-platform, network-dashboard, ui (five spot-checked, all 200 on 2026-09-02) — run together by up.sh on a local Stellar network via Docker. Single release stellar-cli-v0.1.0 (2026-03-10). https://github.com/Moonlight-Protocol/local-dev",
			triggers: ["moonlight repos", "moonlight local stack"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kindfi-org/kindfi": [
		{
			note: "README monorepo map: apps/web (Next.js), apps/contract (Soroban, Rust), apps/indexer (SubQuery), services/supabase, services/ai, packages/lib, packages/drizzle; developer guide (architecture, code-style, OSS contribution guide) at https://kindfis-organization.gitbook.io/development (200 on 2026-09-02); escrows via Trustless Work. No releases or tags. https://github.com/kindfi-org/kindfi",
			triggers: ["kindfi developer guide", "kindfi monorepo layout"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"sentinelfi/sentinel_soroban_v3": [
		{
			note: "README: parametric flight-delay insurance on Soroban; documentation at https://sentinelfi.github.io/sentinel_soroban_v3/ and a testnet playground at https://sentinel-soroban-v3.vercel.app/ (both 200 on 2026-09-02); six contracts deployed on Stellar TESTNET with addresses in deployments/testnet.json (`make deploy-testnet`); governance jobs on Supabase. https://github.com/SentinelFi/sentinel_soroban_v3",
			triggers: [
				"sentinel flight insurance docs",
				"sentinelfi testnet playground",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"gladiusclub/gladius-backend": [
		{
			note: "README: Firebase / Cloud Firestore backend with custodial Stellar wallets (keys in Google Cloud KMS); its docs link https://gladius-2.gitbook.io/backend redirects to https://gladiusclub.gitbook.io/docs/backend (200 on 2026-09-02). package.json is named gladius-contracts and points at sibling https://github.com/GladiusClub/gladius-contracts (200). https://github.com/GladiusClub/gladius-backend",
			triggers: ["gladius backend docs", "gladius contracts repo"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"midasbal/lumina-scan": [
		{
			note: "README headline (read 2026-09-02): 'shutting this down. built it for a hackathon, no real future for it. maybe later' — the author's own status for this x402/MPP security-scanner submission (testnet USDC; demo at lumina-scan.vercel.app). No releases or tags. https://github.com/midasbal/lumina-scan",
			triggers: ["lumina scan status", "lumina scan shut down"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"ebubechi-ihediwa/verix": [
		{
			note: "MOVED: github.com/ebubechi-ihediwa/Verix redirects to github.com/verixhq/Verix (HTTP 301; GitHub API resolves the old path, 2026-09-02). Releases v0.1.0-foundation (2026-06-24) and v0.2.0-beta-ready (2026-06-26). README status table: 'Soroban Contracts (code) — Written, deployment pending', 'On-Chain Receipt Anchoring — Stub'; cites a 'Best Technical Integration' hackathon award. https://github.com/verixhq/Verix",
			triggers: ["verix repo moved", "verix soroban status"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"leomanza/near-shade-coordination": [
		{
			note: "RENAMED: github.com/leomanza/near-shade-coordination redirects to github.com/leomanza/delibera.xyz (HTTP 301; GitHub API resolves the old path, 2026-09-02). README: 'Delibera — Privacy-Preserving Multi-Agent DAO Coordination on NEAR'; the Stellar part is a 'Stellar Hacks: Agents hackathon entry' — x402 USDC payments on Stellar for a deliberation oracle settled on NEAR. https://github.com/leomanza/delibera.xyz",
			triggers: ["delibera repo renamed", "near shade coordination stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"leojay-net/stellar-agent-flow": [
		{
			note: "MOVED: github.com/leojay-net/Stellar-Agent-Flow redirects to github.com/Pridex-Org/Stellar-Agent-Flow (HTTP 301; GitHub API resolves the old path, 2026-09-02). README: 'AgentFlow (Stellar Edition)' — a node-canvas orchestrator for Stellar agents (Next.js + React Flow); package.json name agentflow, private; no releases or tags. https://github.com/Pridex-Org/Stellar-Agent-Flow",
			triggers: ["agentflow stellar repo moved"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"t0k1dev/vendly": [
		{
			note: "MOVED: github.com/t0k1dev/vendly redirects to github.com/tokidev-ai/vendly (HTTP 301; GitHub API resolves the old path, 2026-09-02). The README at the new path is the unmodified create-next-app boilerplate; package.json name web 0.1.0, private; no releases or tags. https://github.com/tokidev-ai/vendly",
			triggers: ["vendly repo moved"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"treblelegacy/x402-agents-stellar-project": [
		{
			note: "MOVED: github.com/TrebleLegacy/x402-agents-stellar-project redirects to github.com/pwsaragossy/x402-agents-stellar-project (HTTP 301; GitHub API resolves the old path, 2026-09-02). README: 'x402 Agentic Payments — Stellar Hackathon Submission' with a 'Project Status & Mocked Data (Hackathon Transparency)' section listing what is simulated; no releases or tags. https://github.com/pwsaragossy/x402-agents-stellar-project",
			triggers: ["x402 agents stellar project moved"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"trustless-oss/trustless-oss": [
		{
			note: "MOVED here: github.com/ryzen-xp/Trustless-OSS redirects to github.com/Trustless-OSS/Trustless-OSS (HTTP 301; GitHub API resolves the old path, 2026-09-02; repo created 2026-05-10) — the README's CI badges and clone URL still name ryzen-xp/Trustless-OSS. README: on-chain bounties for OSS contributors — fund a Stellar USDC escrow, attach rewards to issues, pay out when the linked PR merges. https://github.com/Trustless-OSS/Trustless-OSS",
			triggers: ["trustless oss repo moved", "trustless oss bounties"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"nsuccess/agentmarket": [
		{
			note: "Repo no longer accessible: https://github.com/Nsuccess/AgentMarket returns HTTP 404 (deleted or made private; the GitHub API answers 404 as well) as of 2026-09-02; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"big14way/stellar-agent-gateway": [
		{
			note: "Repo no longer accessible: https://github.com/big14way/stellar-agent-gateway returns HTTP 404 (deleted or made private; the GitHub API answers 404 as well) as of 2026-09-02; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"envexx/lument-trust": [
		{
			note: "Repo no longer accessible: https://github.com/envexx/Lument-Trust returns HTTP 404 (deleted or made private; the GitHub API answers 404 as well) as of 2026-09-02; census metadata is the surviving record.",
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	// ── P5 batch 6 (2026-09-02): 36 repos / 39 notes — the tier below batch 5.
	// 877 unseen repos were screened, ~70 had any signal beyond metadata, and
	// these are the ones with a durable, registry- or banner-backed fact:
	// Albedo, stellar-scaffold, Loam (7 crates, frontend now redirects to
	// stellar-scaffold/ui), lightsail contract-bindings + strledger,
	// OpenZeppelin monitor / keystore / adapters / upgrader plugin, the quorum
	// analyzer, eight ARCHIVED repos dated only by GitHub's banner with old
	// stellar/ paths resolved by redirect, and a handful of live products
	// with full mainnet contract IDs (stellar-8004, ohloss). Kept out:
	// pendulum-chain/vortex (Stellar mentioned once in an SDK README), and
	// two "X is not on npm / host answered 522 today" clauses — negatives
	// and transients age badly. ~45 further candidates yielded nothing
	// durable and are named in the batch notes (several are not Stellar
	// projects at all: StellarStation satellites, an EVM indexer, Pi
	// Network). Research used 0 GitHub API calls.
	"stellar-expert/albedo": [
		{
			note: "npm package @albedo-link/intent — 0.13.0 (2025-06-13; 17 versions since 2020-07-14; repository field → stellar-expert/albedo; MIT), built from this monorepo's intent/ directory; the README (README.MD, uppercase, on default branch master) installs it with `npm i -S @albedo-link/intent`. No GitHub releases. https://www.npmjs.com/package/@albedo-link/intent",
			triggers: ["albedo npm package", "albedo intent library"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "README: the frontend/ directory is the albedo.link site and browser-extension UI; hosted at https://albedo.link (200 on 2026-09-02) with a demo playground at https://albedo.link/demo and a no-code payment-request generator at https://albedo.link/playground#payment-request; SEP-0007 'web+stellar' links are handled automatically. https://github.com/stellar-expert/albedo",
			triggers: ["albedo hosted url", "albedo demo playground"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-scaffold/cli": [
		{
			note: "crates.io stellar-scaffold-cli — 0.0.27 (2026-08-13; 30 versions since 2025-05-12; repository → this repo's crates/stellar-scaffold-cli) plus stellar-build 0.0.7 (2026-06-30; 8 versions; same repo). README install: `cargo install --locked stellar-scaffold-cli`. Latest GitHub release stellar-scaffold-cli-v0.0.27 (2026-08-13); workspace pins soroban-sdk 27.0.0-rc.1 and stellar-xdr =27.0.0. https://crates.io/crates/stellar-scaffold-cli",
			triggers: ["scaffold stellar install", "stellar scaffold crate"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"loambuild/loam": [
		{
			note: "crates.io: loam-cli 0.14.4, loam-sdk 0.6.16, loam-soroban-sdk 0.6.16, loam-sdk-macro 0.8.6, loam-subcontract-core 0.7.9, loam-subcontract-ft 0.7.2 (all last published 2025-01-22) and loam-build 0.7.3 (2024-08-05); each entry links back to this repo's crates/ tree. Latest GitHub release loam-subcontract-ft-v0.7.2 (2025-01-22); workspace pins soroban-sdk 22.0.0-rc.3; not archived. https://crates.io/crates/loam-cli",
			triggers: ["loam sdk crates", "loam cli crate"],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "README names a third component, 'Loam Frontend' at github.com/loambuild/frontend — that path now 301-redirects to github.com/stellar-scaffold/ui (checked 2026-09-02), the Scaffold Stellar UI repo; the README itself never mentions Scaffold Stellar and no rename date is stated anywhere we read. https://github.com/loambuild/loam",
			triggers: ["loam frontend repo", "loam scaffold stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lightsail-network/stellar-contract-bindings": [
		{
			note: "PyPI package stellar-contract-bindings — 0.6.0b0 (2026-09-02; all releases betas; project URLs point here). README: `pip install stellar-contract-bindings`; generates Soroban bindings for Python, Java, Flutter/Dart, PHP, Swift/iOS and Kotlin Multiplatform (TypeScript/Rust are left to stellar-cli); hosted generator https://stellar-contract-bindings.fly.dev/ (200 on 2026-09-02). https://pypi.org/project/stellar-contract-bindings/",
			triggers: [
				"contract bindings python",
				"soroban bindings java flutter",
				"generate bindings kotlin swift",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lightsail-network/strledger": [
		{
			note: "PyPI package strledger — 0.10.1 (2025-09-01; 19 releases; homepage/repository fields point here), matching GitHub release v0.10.1 (2025-09-01). README: `pip install -U strledger`; Python bindings + CLI for the Ledger hardware-wallet Stellar app (get-address, app-info, signing), pairing with the StellarCN py-stellar-base SDK. https://pypi.org/project/strledger/",
			triggers: ["ledger stellar python", "strledger install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"openzeppelin/openzeppelin-monitor": [
		{
			note: "Docker image openzeppelin/openzeppelin-monitor (Docker Hub, registered 2025-04-04): tags v1.6.0 / 1.6.0 / latest pushed 2026-07-16, matching GitHub release v1.6.0 (2026-07-15) and Cargo.toml 1.6.0; not on crates.io. README 'Supported Networks': EVM-compatible, Stellar, Solana, Midnight (partial); depends on stellar-xdr 23.0.0. Sibling of openzeppelin-relayer. https://hub.docker.com/r/openzeppelin/openzeppelin-monitor",
			triggers: [
				"openzeppelin monitor docker",
				"openzeppelin monitor stellar support",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"openzeppelin/oz-keystore": [
		{
			note: "crates.io oz-keystore — 0.1.4 (2025-05-01; 5 versions since 2025-01-20; repository → this repo). README: unified keystore library — encrypted-JSON local keystore and HashiCorp Vault backends — for EVM, Stellar and Solana keys, with examples local-keystore-to-stellar-wallet and hashicorp-vault-to-stellar-wallet. No GitHub releases. https://crates.io/crates/oz-keystore",
			triggers: ["openzeppelin keystore crate", "oz keystore stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"openzeppelin/openzeppelin-adapters": [
		{
			note: "npm @openzeppelin/adapter-stellar — 4.0.1 (2026-08-21; 12 versions since 2026-03-24; repository → this monorepo, directory packages/adapter-stellar; AGPL-3.0). README: full Soroban adapter for Stellar public/test networks, wallet integration via Stellar Wallets Kit, SAC detection. Releases are per-package tags, e.g. @openzeppelin/adapter-stellar@4.0.1. https://www.npmjs.com/package/@openzeppelin/adapter-stellar",
			triggers: ["openzeppelin adapter stellar", "openzeppelin adapters npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"openzeppelin/stellar-upgrader-cli": [
		{
			note: "Stellar CLI plugin installed from source only — README: git clone, `cargo install --path .`, then binary `stellar-upgrader` shows in `stellar plugins --list`; Cargo.toml (stellar-upgrader 0.1.0) still has the placeholder repository 'github.com/your-username/stellar-upgrader'. The crates.io crate stellar-upgrader (1.1.4, publisher interoplabs-ci, no repository field) is a different project. https://github.com/OpenZeppelin/stellar-upgrader-cli",
			triggers: [
				"stellar upgrader plugin install",
				"openzeppelin upgrader cli",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar/stellar-quorum-analyzer": [
		{
			note: "SAT-solver library for FBAS quorum-intersection checks (SCP); README: 'Primary: Integrated with stellar-core'. stellar-core consumes it as a git dependency — src/rust/Cargo.toml has [dependencies.stellar-quorum-analyzer] version 0.1.0, git = this repo, rev 502a354eb9a31cf86098be84aa1b3081767fa3c7 (read 2026-09-02); not on crates.io, no releases; pins stellar-xdr =27.0.0. https://github.com/stellar/stellar-quorum-analyzer",
			triggers: ["quorum analyzer stellar core", "quorum intersection library"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar/stellar-turrets": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jan 8, 2026' (read 2026-09-02). README: Stellar Turrets reference implementation (Cloudflare Workers + AWS Lambda); its API-docs link https://tyvdh.github.io/stellar-turrets/ returns 404. The original tyvdh/stellar-turrets path now redirects to kalepail/stellar-turrets, itself archived ('Jan 15, 2022'). https://github.com/stellar/stellar-turrets",
			triggers: [
				"stellar turrets archived",
				"turrets reference implementation",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/transfer-server-validator": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Dec 15, 2021' (read 2026-09-02); github.com/stellar/transfer-server-validator redirects here. README: Jest suite for SEP-6/24/31 transfer servers at https://anchor-validator.stellar.org — now a 301 to https://anchor-tests.stellar.org/ (the stellar/stellar-anchor-tests UI; no HTTP response on 2026-09-02). https://github.com/stellar-deprecated/transfer-server-validator",
			triggers: ["transfer server validator", "anchor validator deprecated"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/sep24-demo-client": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Nov 7, 2023' (read 2026-09-02); github.com/stellar/sep24-demo-client redirects here. README: 'Stellar SEP24 Demo Client has been deprecated' — functionality integrated into https://github.com/stellar/stellar-demo-wallet, use https://demo-wallet.stellar.org/ (200 on 2026-09-02). package.json name is sep6-demo-client. https://github.com/stellar-deprecated/sep24-demo-client",
			triggers: ["sep24 demo client", "sep-24 demo deprecated"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/sep31-demo-client": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Nov 7, 2023' (read 2026-09-02); github.com/stellar/sep31-demo-client redirects here. README: 'Stellar SEP31 Demo Client is now Deprecated' — integrated into https://github.com/stellar/stellar-demo-wallet, use https://demo-wallet.stellar.org/ (200 on 2026-09-02). package.json name is sep6-demo-client, the same as the SEP-24 client's. https://github.com/stellar-deprecated/sep31-demo-client",
			triggers: ["sep31 demo client", "sep-31 demo deprecated"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/auth-required-tokens-manager": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jul 1, 2024' (read 2026-09-02); github.com/stellar/auth-required-tokens-manager redirects here. README: web app to manage TESTNET auth-required tokens and generate SEP-7 QR codes for payment / path-payment operations; package.json name is stellar-react-starter. https://github.com/stellar-deprecated/auth-required-tokens-manager",
			triggers: ["auth required tokens manager"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar-deprecated/network-explorer": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Nov 16, 2019' (read 2026-09-02); github.com/stellar/network-explorer redirects here. README line 1: 'This tool is no longer maintained. Take a look at the laboratory instead' (github.com/stellar/laboratory, live). https://github.com/stellar-deprecated/network-explorer",
			triggers: ["stellar network explorer archived"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"stellar/core-node-admin-panel": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jun 6, 2024' (read 2026-09-02). README 'Proposal': a UI admin toolset for validator operators to judge node health and risks, run as a proxy server + front-end against a stellar-core instance (`npm run dev`); package.json name stellar-node-admin, private. https://github.com/stellar/core-node-admin-panel",
			triggers: ["core node admin panel"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"lobstrco/stellar-core-parallel-catchup-py": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jun 22, 2026' (read 2026-09-02). readme.md (lowercase filename): 'Fast Stellar Core Catch Up' — Python scripts that run a full validator's history catch-up as parallel ledger-range jobs ('less than a day' on a powerful server vs. 'more than a month' serially); CircleCI badge. https://github.com/Lobstrco/stellar-core-parallel-catchup-py",
			triggers: ["parallel catchup stellar core", "lobstr catchup script"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"justmert/soropass": [
		{
			note: "npm @soropass/core — 0.3.1 (2026-09-01; 6 versions since 2026-08-10) and @soropass/ui 0.3.0 (2026-09-01; 1 version), both with repository → justmert/soropass; peer dependency @stellar/stellar-sdk. All contract addresses in the README are testnet. https://www.npmjs.com/package/@soropass/core",
			triggers: ["soropass npm", "soropass passkey package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"sergical/blockchain-wallet-validator": [
		{
			note: "npm blockchain-wallet-validator — 1.2.1 (2025-12-23; 7 versions since 2024-12-17; repository → sergical/blockchain-wallet-validator), matching GitHub release v1.2.1. README lists Stellar among validated networks (Base32 G… public keys, e.g. GBQMXVTR5HQNRGXPR4ZPBOZR7VQXOQMEQMZWIVLIW2MYBXC2HQWZZ4VJ) and says releases go out via npm trusted publishers (GitHub Actions OIDC). https://www.npmjs.com/package/blockchain-wallet-validator",
			triggers: [
				"validate stellar address library",
				"wallet address validator npm",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"raceeyxo/use-stellar": [
		{
			note: "npm use-stellar — 0.1.5 (2026-08-24; 4 versions since 2026-06-03). The registry's repository field names github.com/israelolrunfemi/use-stellar, which 301-redirects to RaceeyXo/use-stellar (checked 2026-09-02). README: React hooks for wallet connection, balances and tx submission; @stellar/stellar-sdk is bundled as a regular dependency, not a peer dependency. https://www.npmjs.com/package/use-stellar",
			triggers: ["use-stellar react hooks", "stellar react hooks package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"defarm-repo/defarm-sdk-ts": [
		{
			note: "npm @defarm/sdk — 0.2.1 (2026-08-22; 9 versions since 2026-02-22; repository → defarm-repo/defarm-sdk-ts; ships a `defarm` CLI bin; MIT). README: client-side sealing ('blind envelopes') for DeFarm livestock/item records, each DFID 'anchored on a public network (Stellar) + IPFS'; the pure-crypto core (src/core) is the auditable surface. No GitHub releases. https://www.npmjs.com/package/@defarm/sdk",
			triggers: ["defarm sdk npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"trionlabs/stellar-8004": [
		{
			note: "README 'Contracts' table, MAINNET: Identity Registry CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35, Reputation Registry CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA, Validation Registry CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG ('single source of truth': webapp/packages/sdk/src/core/config.ts). Explorer https://stellar8004.com (200 on 2026-09-02). https://github.com/trionlabs/stellar-8004",
			triggers: [
				"8004 mainnet contract addresses",
				"stellar 8004 identity registry",
				"agent registry stellar mainnet",
			],
			source: "curated",
			asOf: "2026-09-02",
		},
		{
			note: "npm @trionlabs/stellar8004 — 0.0.11 (2026-04-13; 2 versions; repository → trionlabs/stellar-8004): the TypeScript SDK for the three 8004 registries (identity, reputation, validation). No GitHub releases; workspace pins soroban-sdk 25. https://www.npmjs.com/package/@trionlabs/stellar8004",
			triggers: ["stellar8004 npm", "8004 sdk package"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kalepail/ohloss": [
		{
			note: "README 'Mainnet Deployment' — 'Status: Live on mainnet'; current contract CBOM2KGQDK4TMTIULH2UJWNLWEIXG47IM2RND4UDGM7KK5EQUQDFOVAY (CHITSHEET.md marks it NEW; the OLD contract was CAHPLVEDW2HWY2EOTCTECDK5ZRHAB5FLER3WGHQ5OPFMBMMFJSTBRJZU). Workspace pins soroban-sdk 23.1.0; no releases or tags. https://github.com/kalepail/ohloss",
			triggers: ["ohloss contract address", "ohloss mainnet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"xoxno/rs-lending-xlm": [
		{
			note: "README: over-collateralized money market on Soroban (central pool, per-market accounting, spokes as risk regimes, timelocked governance), licensed PolyForm Noncommercial 1.0.0 — 'Commercial use requires a written agreement with XOXNO'. Workspace pins soroban-sdk =27.0.6; no releases or tags; the README lists no deployed addresses ('resolve deployed addresses from the active network configuration'). https://github.com/XOXNO/rs-lending-xlm",
			triggers: ["xoxno lending license", "xoxno lending stellar"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"kalepail/superpeach": [
		{
			note: "README: passkey-powered multi-signer Stellar smart-wallet example — two sites in one repo (a 'Super Signer' site and an example dapp); demos hosted at https://superpeach.xyz/ plus https://minipeach-a.pages.dev/ and minipeach-b.pages.dev (superpeach.xyz and minipeach-a returned 200 on 2026-09-02). package.json is private; no releases. https://github.com/kalepail/superpeach",
			triggers: ["superpeach demo", "super peach passkey wallet"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"jamesbachini/soroban-playground": [
		{
			note: "README: online IDE for Soroban contracts, 'Available at https://soropg.com'; builds and tests run in a sandboxed Docker container behind a Rust app; ships soroban-sdk, sep-41-token and the OpenZeppelin stellar-* crates by default. Cargo package Soroban-Playground 0.8.1; no releases. https://github.com/jamesbachini/Soroban-Playground",
			triggers: ["soroban playground online ide", "soroban playground hosted"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"brozorec/smart-account-sign": [
		{
			note: "README: two Stellar CLI plugins for OpenZeppelin smart accounts — stellar-smart-account and stellar-passkey — installed from source (`cargo install --locked --path stellar-smart-account` / `--path stellar-passkey`, then `stellar plugins --list`); neither crate is on crates.io (2026-09-02). Stated limitation: Delegated signers are not supported (External signers only). https://github.com/brozorec/smart-account-sign",
			triggers: ["smart account cli plugin", "stellar passkey plugin install"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"script3/fee-vault": [
		{
			note: "Blend fee-vault contract. Latest GitHub release v1.0.0_fee-vault_cli22.0.1 (2025-05-06; 3 tags on the page); Cargo `publish = false` (not on crates.io); pins soroban-sdk 22.0.7. A separate repo script3/fee-vault-v2 exists (ERC4626-like share vault with optional signer gating and take / capped / fixed-rate configs; no releases as of 2026-09-02). https://github.com/script3/fee-vault/releases",
			triggers: ["blend fee vault release", "fee vault v2 repo"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"script3/fee-vault-v2": [
		{
			note: "README: Blend fee vault as an ERC4626-like share vault holding a pool's b_tokens, optional `signer` gating on entry, three admin configurations (take rate, capped rate, fixed rate). Cargo fee-vault-v2 1.0.0 `publish = false`, soroban-sdk 22.0.8; NO releases or tags as of 2026-09-02 (the V1 repo script3/fee-vault has v1.0.0_fee-vault_cli22.0.1, 2025-05-06). https://github.com/script3/fee-vault-v2",
			triggers: ["fee vault v2 configurations", "blend fee vault signer"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"soroswap/spacewalk-implementation": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jul 24, 2026' (read 2026-09-02). README (114 bytes): 'Implementation of the Skywalk bridge between Pendulum (Polkadot) and Stellar / Soroban' (sic — the repo name says Spacewalk); no manifest, releases or tags. https://github.com/soroswap/spacewalk-implementation",
			triggers: ["soroswap spacewalk archived"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"soroswap/phoenix-zephyr-indexer": [
		{
			note: "ARCHIVED — GitHub's banner: 'archived by the owner on Jul 24, 2026' (read 2026-09-02). No README; Cargo package zephyr-phoenix 0.1.0 pinning soroban-sdk 20.2.0 — a Zephyr indexer program for Phoenix; no releases or tags. https://github.com/soroswap/phoenix-zephyr-indexer",
			triggers: ["phoenix zephyr indexer archived"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"bp-ventures/sep30-docs": [
		{
			note: "README: documentation for BP Ventures' SEP-30 (recovery signer) implementation, with a hosted playground at https://sep30-demo.bpventures.us/ and API docs at https://sep30-demo.bpventures.us/docs#/ (both 200 on 2026-09-02); links the SEP-30 spec and SDF's recoverysigner blog post. Docs-only repo: no code, releases or packages. https://github.com/bp-ventures/sep30-docs",
			triggers: ["bp ventures sep-30 playground", "sep30 recovery signer demo"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"yripper/stellarpay": [
		{
			note: "npm @stellarpay-sdk/core, @stellarpay-sdk/client and @stellarpay-sdk/mcp — all 0.1.0 (2026-08-04; a single version each; repository → yripper/stellarpay). README: built for the Stellar hackathon (Agentic Payments track) and 'everything below is testnet' — one middleware for x402 + MPP charge/channel paywalls. https://www.npmjs.com/package/@stellarpay-sdk/core",
			triggers: ["stellarpay sdk npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"berkingurcan/stellar-agent-search": [
		{
			note: "npm stellar-agent-search — 0.1.0 (2026-07-30; 2 versions; repository → berkingurcan/stellar-agent-search; bin stellar-agent-search). README: read-only MCP server + CLI over the trionlabs/stellar-8004 registry contracts on mainnet, pinning the @trionlabs/stellar8004 SDK for signed writes; 'adds no contracts'. https://www.npmjs.com/package/stellar-agent-search",
			triggers: ["stellar agent search mcp", "8004 agent discovery mcp"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
	"zenith-protocols/zenith-sdk": [
		{
			note: "npm @zenith-protocols/zenith-sdk — 0.0.1 (2025-10-21; the only published version; repository → zenith-protocols/zenith-sdk), while package.json at HEAD says 2.0.0 (unpublished as of 2026-09-02). README: `npm install @zenith-protocols/zenith-sdk`; testnet + mainnet network constants for the Zenith vault/trading contracts. https://www.npmjs.com/package/@zenith-protocols/zenith-sdk",
			triggers: ["zenith sdk npm"],
			source: "curated",
			asOf: "2026-09-02",
		},
	],
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
			note: "npm @bluxcc/react — published since 2025-02-03. Its npm repository field still names github.com/bluxcc/blux, which returns HTTP 301 to bluxcc/react (2026-09-01) — this repo is the current home of that path. README install: npm i @bluxcc/react; docs https://docs.blux.cc/. Read the current version from npm; this package ships several releases a week. https://www.npmjs.com/package/@bluxcc/react",
			triggers: ["blux react package", "bluxcc blux repo moved"],
			source: "curated",
			asOf: "2026-09-02",
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
			note: "Companion UI of stellar/stellar-disbursement-platform-backend; releases follow the SDP version — 7.0.0 (2026-08-19), 6.6.0, 6.5.0. Docker Hub image stellar/stellar-disbursement-platform-frontend (~16.2k pulls; last updated 2026-09-04). Docs: developers.stellar.org/docs/platforms/stellar-disbursement-platform. https://hub.docker.com/r/stellar/stellar-disbursement-platform-frontend",
			triggers: [
				"sdp frontend docker",
				"disbursement platform frontend release",
			],
			source: "curated",
			asOf: "2026-09-04",
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
			note: "npm @bluxcc/core — published since 2025-09-23; repository points here. Licensed BUSL on npm (README section 'License & Usage Restrictions') — the fact worth knowing before depending on it; install `npm i @bluxcc/core`; site blux.cc. Read the current version from npm; this package ships several releases a week. https://www.npmjs.com/package/@bluxcc/core",
			triggers: ["blux npm package", "blux core license"],
			source: "curated",
			asOf: "2026-09-02",
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
			note: "Moved from kalepail/passkey-kit (496 stars there; archived; README 'This repository has moved… all tags were carried over'); stellar/passkey-kit was created 2026-07-30, so its own star count understates adoption. npm passkey-kit (0.17.2, 2026-09-04; first published 2024-06-06; 126 versions) now points its repository at stellar/passkey-kit. https://www.npmjs.com/package/passkey-kit",
			triggers: ["passkey kit moved", "kalepail passkey kit"],
			source: "curated",
			asOf: "2026-09-04",
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
			note: "Releases every 1–3 weeks: 4.7.1 (2026-08-26), 4.7.0 (2026-08-20), 4.6.2 (2026-08-03), 4.6.1 (2026-07-20). Published as the Docker Hub image stellar/anchor-platform; the image is rebuilt with each release and between them, so read its current tag from Docker Hub rather than from here. https://github.com/stellar/anchor-platform/releases",
			source: "curated",
			asOf: "2026-09-05",
		},
	],
	// verified: gh api releases?per_page=4; hub.docker.com/v2/repositories/stellar/anchor-platform/ (pull_count 936473).
	"stellar/stellar-disbursement-platform-backend": [
		{
			note: "On the 7.x release line since 7.0.0 (2026-08-19); prior minors 6.6.1 (2026-06-24), 6.6.0 (2026-06-18), 6.5.0 (2026-05-05). Published as the Docker Hub image stellar/stellar-disbursement-platform-backend (~34.6k pulls); the image is rebuilt frequently, so read its current tag from Docker Hub rather than from here. The UI is the companion repo stellar/stellar-disbursement-platform-frontend. https://github.com/stellar/stellar-disbursement-platform-backend/releases",
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
			note: "npm package is the unscoped smart-account-kit (0.7.0, 2026-09-04) \u2014 TypeScript client for the OpenZeppelin/stellar-contracts smart-account contract (passkeys, multi-signers, policies, fee sponsoring). Repo created 2026-07-30; Protocol 27 deployment artifacts are versioned in docs/deployments-protocol-27-2026-07-09.md. https://www.npmjs.com/package/smart-account-kit",
			source: "curated",
			asOf: "2026-09-04",
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

/**
 * Pool triage verdicts (INTERNAL — never served). The quality board's notes
 * pool is the curated-index repos with repoScore >= 60. On 2026-09-02 every
 * pool repo without a note was examined for a durable, source-citable fact
 * (registry identity that links back, rename/archive, release line, a
 * README-published mainnet ID); these 115 yielded nothing, for the reason
 * recorded. Recording the verdict lets the board tell JUDGED from
 * UNEXAMINED (coverage.knowledgeNotes.triaged) without publishing an
 * opinion about anyone's repo — the same discipline as the batch-1 internal
 * memos. Re-examine a row when it gains a registry package or a mainnet
 * deployment. Keys are lowercase owner/name.
 */
/**
 * Batch-8 triage verdicts for the 50–59 band (2026-09-02): the 80 examined
 * repos that yielded nothing durable, each with the reason. Same contract as
 * POOL_TRIAGE_2026_09_02 — INTERNAL notes, never served, counted by the board
 * as "judged" rather than "unexamined". Re-examine on a registry package,
 * a mainnet deployment, or a project link.
 */
/**
 * Batch-9 triage verdicts for the 40–49 band (2026-09-02): examined repos
 * that yielded nothing durable, each with the reason — INTERNAL, never
 * served, counted by the board as "judged" if the pool ever widens here.
 */
const BAND_40_49_TRIAGE_2026_09_02: Record<string, string> = {
	"alternun-development/alternun":
		"daily version tags (v1.1.80 2026-09-01; 906 tags) but 0 Stellar mentions in README, docs.alternun.io or alternun.io",
	"alternun-development/alternun-admin-ui":
		"private UI shell; 0 Stellar mentions; no tags",
	"alternun-development/alternun-sc-staking":
		"README contract ID CDJRRYST…YB2V not found on public or testnet stellar.expert; no tags",
	"apay-io/apay-bot":
		"1 KB README; package.json name unpublished; last push 2020",
	"bigger-tech/flow":
		"package.json placeholder repository; npm n8n-nodes-stellar 0.1.1 belongs to another repo (joaquinsoza → yripper/n8n-nodes-stellar)",
	"bingtellar/blink-build":
		"testnet only (both README IDs created on testnet 2026-03-25)",
	"blockdaemon/agave-snapshot-uploader":
		"not a Stellar repo (Solana snapshot uploader)",
	"blockdaemon/pyth-exporter":
		"not a Stellar repo (Solana/Pyth exporter; Go module origin gitlab.com/Blockdaemon/solana/pyth_exporter)",
	"blockroll-tech/nuban-bank-prediction":
		"not a Stellar repo (npm nuban-prediction 1.2.0 has no repository field; Nigerian bank lookup)",
	"blockroll-tech/open-assets":
		"not a Stellar repo (logo/asset library; 0 Stellar mentions)",
	"btq-ag/btq-core":
		"not a Stellar repo (own L1 reference node; v0.5.0-testnet)",
	"chainpatrol/discord-bot":
		"not a Stellar repo (private Discord bot; 0 Stellar mentions)",
	"chainpatrol/docs": "not a Stellar repo (docs site; 0 Stellar mentions)",
	"cityofzion/neon-wallet-desktop":
		"not a Stellar repo (NEO/Ethereum wallet by its README; 0 Stellar mentions; v3.11.0 2026-06-17)",
	"coinspect/wallet-security-framework":
		"no Stellar fact in README (wallet security checklist; 0 mentions)",
	"dappradar/nft-sales-adapters":
		"no Stellar adapter in src/adapters (69 entries, none named stellar/soroban); 353-byte README",
	"defarm-repo/soroban-value-chain":
		"PoC by its own README; no tags; last push 2025-04",
	"dextools-io/aggregator-widget":
		"not a Stellar repo (widget docs; 0 Stellar mentions)",
	"dextools-io/chart-widget":
		"not a Stellar repo (widget docs; 0 Stellar mentions)",
	"dfns/dfns-solutions": "recipes/examples; no registry, no tags",
	"dfns/trusted-dealer":
		"not Stellar-specific (CGGMP key import/export; crates `publish = false`; key-import/v0.5.0 2026-08-12)",
	"dogstarcoin/auction-soroban-sc": "no tags, IDs or registry; last push 2023",
	"drips-network/app":
		"not a Stellar repo (EVM funding dapp; 0 Stellar mentions)",
	"drips-network/contracts":
		"not a Stellar repo (EVM contracts; per-chain tags v2_*_update_3)",
	"flashbacknetwork/flashonstellar":
		"tags only (0.3.1v2 2024-12-10; 4 tags); no IDs or registry",
	"flutterwave/node-v3":
		"npm flutterwave-node-v3 1.4.1 (2026-06-17; old path Flutterwave/Flutterwave-node-v3 → 301) but 0 Stellar mentions",
	"flutterwave/php-v3":
		"packagist flutterwavedev/flutterwave-v3 1.2.1 (2026-08-04; repo links back) but 0 Stellar mentions",
	"flutterwave/python-v2":
		"PyPI rave_python 1.5.0 (2026-06-15; homepage Flutterwave/rave-python → 301) but 0 Stellar mentions",
	"flutterwave/react-v3":
		"npm flutterwave-react-v3 1.3.3 (2026-02-11; old path Flutterwave/Flutterwave-React-v3 → 301) but 0 Stellar mentions",
	"francoperez03/stellar-enclave":
		"fork of NethermindEth/stellar-private-payments (GitHub banner); hackathon, four testnet IDs (2026-04-11)",
	"gateway-fm/open-privacy-suite":
		"not a Stellar repo (Ethereum privacy suite; v0.13.0-rc.3)",
	"gateway-fm/ops-explorer":
		"not a Stellar repo (Ethereum explorer; v0.9.0-rc.2)",
	"gateway-fm/oz-policy-builder":
		"README-only so far (no tags; crates unpublished; SCF milestone repo, push 2026-09-01)",
	"grantchain/grantfox":
		"private package; 0 Stellar mentions in README; no tags",
	"hot-dao/omni-sdk":
		"registry entry (@hot-labs/omni-sdk) does not link back to the repo",
	"idos-network/idos-schema": "179-byte README; no tags; 0 Stellar mentions",
	"indexed-xyz/docs": "docs site only (297-byte README; 0 Stellar mentions)",
	"inferara/inferara.com": "company website source (119-byte README)",
	"innookeke/veritask": "hackathon demo, testnet only (private package)",
	"julianclatro/stellar-game-studio":
		"fork of jamesbachini/Stellar-Game-Studio (GitHub banner); testnet ID (2026-02-04)",
	"ledgerhq/lumen":
		"not a Stellar repo (Ledger Design System; 'lumen' name collision; npm @ledgerhq/lumen-ui-react 0.1.56)",
	"linkioafrica/wavy_soroban_contract":
		"67-byte README; Cargo 0.0.0; last push 2024",
	"lobstrco/fraudulent-assets": "README-only data list; no tags",
	"lockb0x-llc/pakana-stellar-razor-components":
		"NuGet entry carries no repository link",
	"luanlabs/fluxity-interface":
		"hosted app (app.fluxity.finance) but no releases, registry or IDs",
	"luanlabs/fluxity-v1-core":
		"Cargo fluxity-v1-core 0.2.0 unpublished; no tags",
	"metagov/daostar":
		"no Stellar fact in README (DAO standards; v1.0.0 2024-08-28; npm name unpublished)",
	"mks044/reapp-poc": "proof of concept; private workspace; testnet",
	"nrxschool/stellar-bootcamp": "course material; 980-byte README; no tags",
	"offer-hub/protocol-offer-hub":
		"hackathon-style Soroban contract; no tags, IDs or registry",
	"offer-hub/x402":
		"hackathon demo; package.json name 'metered' collides with an unrelated npm package (metered-org)",
	"rango-exchange/rango-contracts-v2":
		"not a Stellar repo (Solidity/hardhat; 311-byte README)",
	"runtimeverification/simbolik-vscode":
		"not a Stellar repo (Solidity debugger extension v15.0.1)",
	"sentinelfi/core": "draft contracts workspace; no tags or IDs",
	"sentinelfi/flight": "private UI; testnet only",
	"sentinelfi/soroban_vault":
		"'draft implementation intended for testing purposes only' (README); its 'Mainnet contract address' CCW67TSZ…MI75 is the USDC asset contract and CAS3J7GY…OWMA the XLM one (both created 2024-02-21 by the SAC deployer)",
	"shogun444/agroshield": "hackathon-style app, testnet only",
	"skyhitz/api":
		"252-byte README; npm name skyhitz-api unpublished; last push 2020",
	"skyhitz/cloudflare-graphql": "private worker backend; no IDs or tags",
	"socket-fi/socketfi-dapp-v1":
		"private package; 1.6 KB README; last push 2024",
	"soundnesslabs/soundness-layer":
		"not a Stellar repo (Sui/Walrus verification layer)",
	"stackman27/soo": "no README, no tags",
	"streamcharge/apicharge":
		"issue-tracker repo by its own README ('use this repo to log issues and request features'); no tags",
	"tenk-dao/smartdeploy":
		"crates.io entries (smartdeploy-*) carry no repository field",
	"vaquita-fi/vaquita-eth-global":
		"ETHGlobal hackathon build; 0 Stellar mentions in README",
	"warp-driver/hodlers-app":
		"tech-demo submission by its own README; no IDs or tags",
	"xycloo/onchain-stellar-complaints": "no README, no tags",
	"xycloo/rs-zephyr-toolkit":
		"crates.io entries carry no repository field — link is indirect",
	"yieldback-cash/market-indexer":
		"no README; package.json name ybc-indexer unpublished",
	"yieldback-cash/ybc-contracts":
		"no tags or IDs (siblings triaged in batches 5 and 8)",
};

const BAND_50_59_TRIAGE_2026_09_02: Record<string, string> = {
	"0xshobha/stellar": "hackathon demo, no registry (2.3 KB README)",
	"acta-team/contracts-acta-spikes":
		"experimental spikes by its own README; no tags (facts live on contracts-acta)",
	"alouzious/hive": "hackathon demo, testnet only (mainnet on roadmap)",
	"alphatechini/stellar-autotask": "hackathon demo, no manifest",
	"ange-r/xioma-agent":
		"hackathon demo, testnet only ('Testnet only' in README)",
	"aryansaxenaa/clausekit":
		"hackathon demo, testnet only (Trustless Work hackathon)",
	"aswinwebdev/forge402": "hackathon demo, testnet only",
	"atharvawaghchoure/agentrep": "hackathon demo, testnet only (testnet ID)",
	"betap987/agent-vault-v2": "hackathon demo, testnet only (testnet IDs)",
	"bholdguy/ara-crystal-machine-economy":
		"hackathon demo, testnet only (Replit-hosted)",
	"bitfalt/ecoproof":
		"hackathon demo, testnet only (Trustless Work hackathon; private package)",
	"blockdaemon/agave-snapshot-gossip-client":
		"not a Stellar repo (Solana/Agave tool; 0 Stellar mentions)",
	"blockful/trustful-stellar-v1":
		"testnet-only contracts; no registry, no tags (last push 2025-03)",
	"boxkit-labs/flare": "testnet; APK sideload only, not in stores",
	"btc-wine/terwa-rwa-vault":
		"docs-only README; testnet; no registry (terwa.io presale platform)",
	"calimero-network/core":
		"registry identity but README states no Stellar fact (crates link back; 0 Stellar mentions)",
	"chatpay-go-labs-oficial/chatpay-tallent-ai": "hackathon demo, no registry",
	"chucklam/x402-you.com": "hackathon demo, no registry (2.4 KB README)",
	"coinspect/learn-evm-attacks":
		"not a Stellar repo (EVM attack catalogue; 0 Stellar mentions)",
	"david1984tk/bimex":
		"hackathon-style app; testnet IDs; the 'pilot project' doc it points to for mainnet addresses holds none",
	"deegalabs/stellar-402-spendguard":
		"hackathon submission; 'Testnet only' by README (v0.1.0 2026-04-07)",
	"deonorla/continuum":
		"hackathon demo, testnet only (npm name 'continuum' belongs to another project)",
	"emmy123222/stellar-search":
		"hackathon demo, testnet default (16 stars; no registry)",
	"enerdao/mvp_smart_contract": "2024 MVP contract; no registry, no tags",
	"everyfinance/smart-contracts-stellar":
		"testnet-only contracts; no registry (6 testnet IDs)",
	"flamki/stellarmind": "hackathon demo, no registry",
	"fxdao/fxdao-sc": "1-byte README; CLI-generated tags only (workspace 22.0.7)",
	"giveth/giveth-dapps-v2":
		"release-only; README states no Stellar fact (v3.54; stellar-sdk only in package.json)",
	"hamdyx2202/stellarpayagent": "hackathon demo, testnet only",
	"handilusa/ferrule": "hackathon demo, testnet only (testnet IDs)",
	"ianvinasmoke24/centurion-pay": "hackathon demo, testnet only",
	"inferara/inference":
		"registry identity but README states no Stellar fact (VS Code ext + v0.0.5; 0 Stellar mentions)",
	"janneh2000/stellarshield-ai":
		"hackathon demo, no registry (mainnet on roadmap)",
	"jaredjuarez/guacamole-app":
		"hackathon demo, no manifest (Vite template README)",
	"jennyt3/ai-bora--stellar": "hackathon demo, testnet only (testnet IDs)",
	"jnrspaco/stellarscope": "hackathon demo, no registry",
	"karagozemin/fortexa":
		"hackathon demo, testnet only ('built for testnet validation')",
	"keoyle52/agentmart": "hackathon demo; mainnet claim without IDs or registry",
	"klarqqs/zap402":
		"package.json repository → 404 path (Nursca/zap402); testnet only",
	"laina-defi/laina":
		"no registry, no tags; README has no addresses (hosted URL only in metadata)",
	"lviffy/aaek":
		"README-claimed npm package unpublished (@aaek/sdk; testnet ID)",
	"mariaelisaaraya/shield-stellar":
		"hackathon demo, testnet only (testnet IDs)",
	"mistakili/stellar-agents": "hackathon demo, no registry (Replit-hosted)",
	"mugglepay/mugglepay":
		"not a Stellar repo (crypto payment gateway; 0 Stellar mentions)",
	"nathanofzion/zi-playground":
		"private app; mainnet is a checklist, not a deployment",
	"nicofains1/spendguard": "hackathon demo, testnet only",
	"nihal-pandey-2302/autonomics-core": "hackathon demo, testnet only",
	"nimrid/x402-shopify-commerce": "hackathon demo, no registry",
	"nitish-d-great/stellarread": "hackathon demo, testnet only",
	"normalfinance/normal-index-v1":
		"package.json name unpublished; tag only (@normalfinance/normal-index-v1; 1 tag)",
	"nova-registry-agent/nova-backend":
		"hackathon demo, testnet only (testnet IDs)",
	"nsdbroficial/aegis402": "hackathon demo, testnet only (testnet ID)",
	"offer-hub/offer-hub":
		"release-only; private package; no hosted URL (v1.0.1 2026-02-18; Airtm + Trustless Work orchestrator)",
	"offer-hub/offer-hub-monorepo":
		"private monorepo; no tags; hosted URL only in metadata (same README header as OFFER-HUB/OFFER-HUB)",
	"official-jumpa/jumpa-website":
		"website repo; no registry, no tags (sibling of triaged official-jumpa/jumpa)",
	"oppia-software-labs/zkarcade":
		"hackathon ZK game, testnet only (testnet ID)",
	"paltalabs/defindex-rescue": "ops scripts; no registry, no tags",
	"perun-network/perun-soroban-token":
		"no README; crate unpublished; last push 2024-07",
	"phibao/agent-net":
		"hackathon demo, testnet only ('hardcoded to Stellar testnet')",
	"pyved-solution/pyved-engine":
		"registry identity but README states no Stellar fact (PyPI links back; Stellar only as SDF sponsor logo)",
	"rango-exchange/explorer":
		"hosted site only; README states no Stellar fact (explorer.rango.exchange; 0 Stellar mentions)",
	"rarible/protocol-contracts":
		"not a Stellar repo (EVM NFT contracts; 0 Stellar mentions)",
	"raunet234/solva-mcp": "hackathon demo, testnet only",
	"sadik-tofik/gigpay": "hackathon demo, no registry (2.5 KB README)",
	"samfresh-ai/task-mesh":
		"hackathon demo, testnet only (publish=false; testnet IDs)",
	"sebwingleet/aerochain-stellar":
		"no registry, no tags, no addresses (last push 2025-06)",
	"secbytex03/paymint": "hackathon demo, testnet only",
	"smart-treasury-account-sta/smart-contracts":
		"POC contracts; no registry, no tags (sibling of triaged STA dapp)",
	"socket-fi/socketfi-account-indexer":
		"private package; no registry, no tags (sibling of triaged Socket-Fi rows)",
	"stellar-oxide-gateway/stellar-oxide-gateway":
		"testnet-only by its own README ('Current Working Paths: USDC on Stellar testnet'); no registry",
	"sumitraikwar18/paywall.ai":
		"hackathon demo, testnet only ('Testnet only' in README)",
	"swiftexwallet/swiftex":
		"release-only; no registry/store identity (1.0.5 2026-07-03; APK sideload build only)",
	"tacticalnoot/smol-fe-hackathon":
		"hackathon fork of smol-fe; hosted URL only (noot.smol.xyz; no tags, no registry)",
	"thegivehub/smartcontracts":
		"no registry, no tags; 1.2 KB README (last push 2025-10)",
	"towa-hi/zk":
		"hackathon ZK game, testnet only (stellar-game-studio template)",
	"vjb/stellar-chaos-swarm": "hackathon demo, testnet only (testnet ID)",
	"web3isco/signalforge-agent": "hackathon demo, no registry (3 KB README)",
	"xavio2495/stexio":
		"README-claimed npm packages unpublished (stexio, @stexio/js-sdk, stexio-proxy)",
	"xbull-corp/guess-the-xbull": "hackathon ZK game, testnet only (testnet ID)",
	"zbagdzevicius/tokentails":
		"not a Stellar repo (commercially licensed; 0 Stellar mentions)",
};

const POOL_TRIAGE_2026_09_02: Record<string, string> = {
	"402md/agentcard": "hackathon demo, testnet only",
	"abdulwahabalm/paygent": "hackathon demo, no registry",
	"abroad-finance/abroad": "deploy-* tags only; no registry",
	"acta-team/give-interactuar": "no registry, no tags, no hosted URL",
	"alternun-development/alternun-ui": "UI shell, no registry/tags",
	"andy00l/x402-autopilot": "hackathon demo, testnet only",
	"arihaan/stellar-sara": "hackathon demo, no registry",
	"arnavmehta7/agenflow-protocol": "hackathon demo, 2 KB README",
	"ashfrancis/chickenz": "hackathon ZK game, testnet only",
	"asmodey-afk/stellar-agent-rep": "hackathon submission, no registry",
	"asterizm-protocol/asterizm-contracts-stellar":
		"testnet-only contracts; no registry, no tags",
	"ayushsaklani-min/agentstell": "npm packages don't link back (see D)",
	"bahmez/heistduel": "hackathon ZK game, no registry",
	"blockdaemon/solana-accountsdb-plugin-kafka":
		"not a Stellar repo (Solana geyser plugin)",
	"bosun-josh121/conductor": "hackathon demo, no registry",
	"buendia-builders/ocean_request": "hackathon demo, testnet only",
	"cassxbt/starlane": "hackathon demo, testnet only",
	"catmcgee/stellar-poker-cosnarks": "hackathon ZK game, testnet only",
	"christabel337/agentex": "hackathon demo, no registry",
	"cijethecreator/stellar-tickets": "companion repo 404; IDs without network",
	"cyberverse2/gopadi": "app scaffold, no registry/tags",
	"darthclyn/paygent-stellar": "hackathon demo, no manifest",
	"davz7/mananaseguro": "hackathon demo, no registry",
	"devasignhq/agent": "no registry, no tags, no hosted URL",
	"dmustapha/verdikt": "hackathon demo, testnet only",
	"dprof-in-tech/stipend": "hackathon-style app, no registry",
	"emanuel250yt/stellarorchestra": "README claims npm package not published",
	"emperorsixpacks/-bear-protocol": "hackathon demo; IDs without network",
	"endernakamoto/walt": "hackathon pitch, no registry",
	"eq-lab/pipeline": "no README; one v0.0.1 tag",
	"eras256/milechain": "hackathon demo, testnet escrow",
	"foundermafstat/nft-dnd-stellar": "hackathon ZK game, testnet only",
	"franklivania/caushun": "hackathon demo, no registry",
	"fundable-protocol/fundable-soroban-contracts":
		"alpha tags only, publish=false (see D)",
	"fundable-protocol/stellar_client_os":
		"testnet client; package.json repo \u2192 404 path",
	"futurehelp/query402-api": "hackathon backend; npm name unpublished",
	"gbangbolaoluwagbemiga/kairos": "hackathon demo, testnet only",
	"gyan0890/shieldex": "hackathon demo ('[Hackathon Name]' placeholder)",
	"harystyleseze/careguard": "hackathon demo; npm name unpublished",
	"heylmstoned/prism-stellar-earn": "SCF submission summary; no registry",
	"hoops-finance/calypso-x402": "hackathon demo, no registry",
	"hoops-finance/cometswap": "1 KB stub, no registry",
	"jennycruzy/geotruth": "hackathon demo, testnet only",
	"kaksv/uber-for-agents": "hackathon demo, no registry",
	"kaleababayneh/zstellar-wordle": "hackathon ZK game; hosted demo only",
	"karansinghbisht/veilgrid": "hackathon ZK game, testnet only",
	"kaxeck/nextforge": "hackathon demo, testnet only",
	"klorenn/cosmic-coder-": "hackathon ZK game, testnet only",
	"klorenn/phase": "hackathon-style app, no registry",
	"legasicrypto/agent-credit-rail": "hackathon demo, no registry",
	"leticarolina/watchdog": "hackathon demo; tags only",
	"liquidsfi/liquidsfi-oracle-web": "60-byte stub README, no registry",
	"liquidsfi/liquidsfi-web-app": "Vite template README, no registry",
	"liquidsfi/zkliquid-home": "Vite template README, no registry",
	"liquidsfi/zkliquid-protocol": "60-byte stub README, no registry",
	"loquit-doru/stellar-tokensentry": "README claims npm package not published",
	"lumens-news/news": "no registry/tags; site gave no response",
	"makindeahmed2110/telos": "no README, no tags",
	"mallikaakash/agentsense": "README claims npm package not published",
	"manoahlinks/mindvault": "hackathon demo, testnet only",
	"marcos-sxt/le_coup": "hackathon ZK game, no registry",
	"maxsouth-dev/payloop": "hackathon demo, no registry",
	"mikemoulder/ero": "hackathon demo, no registry",
	"miracle656/veil": "hosted docs shell only; no registry (see D)",
	"mokwathedeveloper/agent-paywall-router": "hackathon demo, testnet only",
	"mr-574rk/mesh402": "hackathon demo, testnet only",
	"mrtimonm/stellar-x-402": "hackathon demo; ID without network",
	"murat48/zktexasholdem": "hackathon ZK game, testnet only",
	"myles181/hagglenet": "hackathon backend, no registry",
	"nickthelegend/fund402": "3 KB README, no registry",
	"nickyunstoppable/veilstar-brawl": "hackathon ZK game, testnet only",
	"nikhilraikwar/authora": "hackathon demo, testnet only",
	"nikhilraikwar/cubeathon": "hackathon ZK game, testnet only",
	"nirmalplays/stellar-x402": "no manifest, no registry",
	"nuelose/cardentic": "hackathon demo, no registry",
	"official-jumpa/jumpa": "npm name belongs to another project",
	"officially-aditya/taskflow-x402": "hackathon demo, testnet only",
	"olivmath/stealth-battleship": "hackathon ZK game, testnet only",
	"oni7u7/kivo": "no README, no tags",
	"oppia-software-labs/sentinel": "MVP-target README; no registry/tags",
	"oshioke-salaki/agent-tontine": "hackathon demo, no registry",
	"oyingrace/agent_loom": "hackathon experiment, no registry",
	"paltalabs/etherfuse-privy-wallet": "testnet/sandbox MVP; no registry",
	"pedro-gattai/zkachi": "hackathon ZK game, no registry",
	"pedro-pelicioni/court-of-shadows": "hackathon ZK game, no registry",
	"peridotfinance/peridot-soroban": "testnet vault demo; one unrelated tag",
	"phamdat721101/signal": "not a Stellar repo (Uniswap v4 / Somnia)",
	"rizwanmoulvi/agent-got-card-x402": "hackathon demo, 4 KB README",
	"sampath-04/hivepayai": "hackathon demo, testnet only",
	"sandman-sh/credence": "hackathon demo, testnet only",
	"shadow-ash/payloop": "testnet contract only; no registry",
	"shreshtthh/agentguard": "hackathon demo, no registry",
	"shreshtthh/zk-seep": "hackathon ZK game, testnet only",
	"simplex-t/sunvasi": "no README, no tags",
	"simplytokenized/soroban-smart-contracts":
		"only third-party (Reflector) contract IDs",
	"siriuslattice/stellarmcp": "npm package lacks repository field (see D)",
	"smart-treasury-account-sta/dapp": "testnet dApp, no registry",
	"socket-fi/socketfi-app": "stub README; package.json repo \u2192 404 path",
	"socket-fi/socketfi-website": "stub README, no registry",
	"softalpha0/agent-bazaar": "hackathon demo; npm name unpublished",
	"spinachfi/spinach": "1.7 KB README, no registry",
	"stellar-light/stellar-pay": "self-curation is an owner call (fact in D)",
	"stellarcarbon/hackmeridian": "210-byte hackathon stub",
	"stellarzerolab/neurochain-dsl-stellar":
		"crate not on crates.io; hackathon package",
	"tasfia-17/stellar-mcp": "package.json name not on npm; hackathon",
	"thewoodfish/agentcompute": "npm entry lacks repository field; testnet",
	"theyuvan/zk-throne": "hackathon ZK game, testnet only",
	"tkcollective/x402-research-skill":
		"PyPI package links to a 404 sibling (see D)",
	"toanbm/stellar-trader": "hackathon demo, testnet; npm name unpublished",
	"ts-mfon/stellar-agent-api-bazaar": "hackathon demo, testnet only",
	"uzochukwuv/eleventts-stellar-mcp": "hackathon MCP demo, private package",
	"velikanghost/heekowave": "hackathon demo, no registry",
	"wuododhis/agentic_stellar": "hackathon-style app, no registry",
	"yonkoo11/beacon": "hackathon demo, no registry",
	"zhekinmaksim/orbitsafe": "hackathon demo, testnet by design",
};
for (const [key, why] of Object.entries(POOL_TRIAGE_2026_09_02)) {
	REPO_KNOWLEDGE_NOTES[key] ??= [];
	REPO_KNOWLEDGE_NOTES[key].push({
		note: `Pool triage 2026-09-02: ${why}. Examined for a durable, source-citable fact and none was found — judged, not unexamined. Re-examine if the repo gains a registry package or a mainnet deployment.`,
		source: "curated",
		asOf: "2026-09-02",
		visibility: "internal",
	});
}
for (const [key, why] of Object.entries(BAND_50_59_TRIAGE_2026_09_02)) {
	REPO_KNOWLEDGE_NOTES[key] ??= [];
	REPO_KNOWLEDGE_NOTES[key].push({
		note: `Band 50–59 triage 2026-09-02: ${why}. Examined for a durable, source-citable fact and none was found — judged, not unexamined. Re-examine if the repo gains a registry package or a mainnet deployment.`,
		source: "curated",
		asOf: "2026-09-02",
		visibility: "internal",
	});
}
for (const [key, why] of Object.entries(BAND_40_49_TRIAGE_2026_09_02)) {
	REPO_KNOWLEDGE_NOTES[key] ??= [];
	REPO_KNOWLEDGE_NOTES[key].push({
		note: `Band 40–49 triage 2026-09-02: ${why}. Examined for a durable, source-citable fact and none was found — judged, not unexamined. Re-examine if the repo gains a registry package or a mainnet deployment.`,
		source: "curated",
		asOf: "2026-09-02",
		visibility: "internal",
	});
}

/**
 * Batch-10 triage verdicts (2026-09-05): the 15 of the 62 never-examined pool
 * rows that yielded nothing durable, each with the reason — INTERNAL, never
 * served, counted by the board as "judged" rather than "unexamined".
 */
const BATCH_10_TRIAGE_2026_09_05: Record<string, string> = {
	"acta-team/brazil-regional-kit":
		"README's 'seven publishable packages' are not on npm (packages/ holds anchors + kit workspaces; @acta-team/ramp-core unpublished); testnet only; no tags",
	"chidubemkingsley/proofescrow":
		"hackathon demo ('Built for the Hackathon', unnamed) — Trustless Work escrow on Stellar testnet; no registry, no tags",
	"edgadafi/dispersor-nomina-alebrije":
		"testnet MVP (Spanish README; hackathon not named); no registry, no tags",
	"joseluismirro/settler": "no README; no tags",
	"websoroban/backend-ide": "empty repo (no README, no language detected)",
	"rodolfonv/proyecto-rbj":
		"672-byte README ('plataforma de préstamos descentralizada en Stellar'); no registry, no tags",
	"shadowfirmware/safelytics":
		"2 KB README, 'testnet en desarrollo'; no registry, no tags",
	"diegoveme/macetero":
		"Prisma/PostgreSQL backend; 0 Stellar mentions in README",
	"inferara/inference-language-spec":
		"language specification; 0 Stellar/Soroban mentions in README",
	"blockdaemon/solana-cluster": "not a Stellar repo (Solana cluster manager)",
	"dfns/terraform-provider-tunnel":
		"not a Stellar repo (Terraform tunnel provider)",
	"stallionsassemble/stallion-contract":
		"bounty contract with no network stated; no registry, no tags (BSL-1.0)",
	"official-jumpa/jumpa-web-app":
		"multi-chain wallet web app (Stellar, Base, Solana); no registry, no tags",
	"sam-rytech/automata-v2":
		"cross-chain agent app, Stellar one of several chains; README 'Version 2.0.0' has no tag or registry behind it",
	"orbitkit-fun/stellar-agent-kit":
		"README-claimed npm packages (stellar-agent-kit 1.0.6, x402-stellar-sdk 1.0.5, create-stellar-devkit-app 1.1.5, stellar-devkit-mcp 1.0.6; all 2026-03-15) list repository codewmilan/stellar-agent-kit, which returns 404 — no link back (see D)",
};
for (const [key, why] of Object.entries(BATCH_10_TRIAGE_2026_09_05)) {
	REPO_KNOWLEDGE_NOTES[key] ??= [];
	REPO_KNOWLEDGE_NOTES[key].push({
		note: `Batch-10 triage 2026-09-05: ${why}. Examined for a durable, source-citable fact and none was found — judged, not unexamined. Re-examine if the repo gains a registry package or a mainnet deployment.`,
		source: "curated",
		asOf: "2026-09-05",
		visibility: "internal",
	});
}

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
