/**
 * codeDepth ground-truth answer key — the ONE label set the calibration probe
 * (depth-probe.ts) and the CI regression gate (depth-eval.ts) both consume.
 *
 * Membership is grounded in EXTERNAL facts only — never "the current scorer
 * likes it" (that would make the gate circular and blind to shared bias):
 *   DEEP    = SCF-funded and/or audited and/or canonical live protocols whose
 *             contracts demonstrably run in production.
 *   SHALLOW = official templates / examples / quickstarts / hello-worlds —
 *             structurally complete by design, substantively empty by design.
 *
 * Deliberately EXCLUDED: high-scoring repos with no external corroboration
 * (no linked project, no funding, no audit) — a scorer-flattering unknown is
 * exactly the thing a label set must not contain.
 *
 * Grow it, don't churn it: add rows with a `why`; only remove a row when the
 * external fact changes (protocol dies, example graduates to a real product).
 */

export interface LabeledRepo {
	fullName: string;
	why: string;
}

export const DEEP: LabeledRepo[] = [
	// v3 graduate (2026-07-08): breadth-gate sampling fix lifted 0.443 → 0.603.
	{
		fullName: "hoops-finance/contracts",
		why: "Non-fork repo with Hoops' own implemented Soroban router + 4 AMM adapters + smart-account contracts (no stub bodies, per-adapter integration tests); project is SCF r29/30-funded ($150k, SDF-Verified) with a live produ...",
	},
	// ── 2026-07-08 label-mining expansion: 111-agent workflow (find → verify →
	// adversarial refute) over audit corpus + SCF-delivered + template evidence;
	// every row independently verified against the repo + external sources. ──
	{
		fullName: "allbridge-io/allbridge-core-soroban-contracts",
		why: "Non-fork Rust workspace holding Allbridge Core's real Soroban bridge + gas-oracle contracts (full swap/bridge/vUSD method implementations); project is SCF r23-funded and Live with the bridge delivered on Stellar (nati...",
	},
	{
		fullName: "phoenix-protocol-group/phoenix-nft-marketplace",
		why: "Original (non-fork) Soroban workspace with substantial custom auction/collections/deployer contracts (~19-21KB contract.rs each + 80KB tests); Phoenix is SCF-funded r16/18/20/24/25 ($394.5k) with a live delivered prod...",
	},
	{
		fullName: "bp-ventures/lightecho-stellar-oracle",
		why: "Non-fork monorepo with full SEP-40 Soroban oracle contract sources (oracle-onchain/sep40/contract); SCF r16-funded ($93k, project Live) with README-published, stellar.expert-verifiable mainnet contract deployment.",
	},
	{
		fullName: "rozoai/rozo-intents-contracts",
		why: "Hacken-audited (SCA Rozo/SDF, Mar 2026) Soroban contracts with a verifiable mainnet deployment (CAC5SKP5... on StellarExpert); SCF r38/43/44 project is Live with a working bridge product.",
	},
	{
		fullName: "YieldBack-Cash/amm",
		why: "SCF r38-funded YieldBack.Cash (Live, yieldback.cash up); repo holds its real custom Soroban AMM for time-decaying assets — 22.8KB contract.rs with implied-rate/curve math + 17.5KB tests, not a fork or example scaffold",
	},
	{
		fullName: "warp-driver/Phoenix-Blend-Pool",
		why: "SCF r41-funded WarpDrive ($150k, project Live), non-fork org repo with original 1,100-line Soroban automation-handler contract and mainnet deploy surface pinning real Blend/USDC addresses",
	},
	{
		fullName: "Bond-Hive/soroban_contracts",
		why: "CoinFabrik-audited BondHive vault contracts (609-line Soroban bond vault, non-fork) with mainnet deployments verified on stellar.expert and $190k SCF funding (rounds 27/29), product Live.",
	},
	{
		fullName: "CometDEX/comet-contracts-v1",
		why: "Audited Balancer-style weighted-pool AMM: real Soroban contract sources (c_pool/c_math/factory, non-fork Rust) with the audit report committed in-repo (audit/comet_audit_final.pdf); project Live per directory record.",
	},
	{
		fullName: "excellar-labs/excellar-contracts",
		why: "CoinFabrik-audited (04-2024 report) Soroban RWA token contracts of SCF-funded (rounds 17+26), live Excellar — real contract sources, not a fork or scaffold.",
	},
	{
		fullName: "FxDAO/FxDAO-SC",
		why: "Runtime Verification-audited CDP protocol contracts (FxDAO.pdf, 2024, in RV's public publications index); non-fork Rust repo with substantial vaults/locking-pool Soroban sources and RV-engagement test files in-tree.",
	},
	{
		fullName: "zenith-protocols/orbit-contracts",
		why: "Veridise-audited (audits/Veridise-OrbitCDP.pdf in-repo) real Soroban treasury/oracle/DAO contract sources of OrbitCDP, an SCF-funded ($280k) formerly-live CDP protocol.",
	},
	{
		fullName: "reflector-network/reflector-dao-contract",
		why: "Certora-audited (audit PDF in-repo: reflector_audit_certora_dao+subscriptions_2024.pdf) real Soroban DAO contract sources (467-line lib.rs, ballot/voting/unlock logic + tests, non-fork) for Reflector, a Live SCF-award...",
	},
	{
		fullName: "reflector-network/reflector-subscription-contract",
		why: "Real Soroban subscription-contract sources (616-line lib.rs + types/extensions/tests, not a fork) with the Certora audit PDF (audits/reflector_audit_certora_dao+subscriptions_2024.pdf) committed in-repo; Reflector is ...",
	},
	{
		fullName: "script3/soroban-governor",
		why: "Audited Soroban Governor DAO contracts — full Rust sources (governor + votes contracts, extensive tests), audit PDF in-repo (audits/soroban_governor_audit_final.pdf), SCF rounds 22/24 ($111k) with live product at gove...",
	},
	{
		fullName: "soroswap/aggregator",
		why: "Runtime Verification-audited (audit PDFs in-repo) Soroban aggregator+adapter contract sources with mainnet deployment addresses; live SCF-funded product, distinct from soroswap/core",
	},
	{
		fullName: "paltalabs/defindex",
		why: "OtterSec-audited Soroban vault/factory/strategy contracts (138 .rs under apps/contracts, audits/2025_03_18_ottersec_defindex_audit.pdf in-repo); non-fork, SCF-funded ($150k, rounds 28/32) with Live product",
	},
	{
		fullName: "PotLock/grantpicks",
		why: "Veridise audit (VAR-Potlock GrantPicks V3, Apr 2025) explicitly scopes stellar/contract/{lists,project-registry,round}/src/* at commit 902900a which resolves in this repo; substantial multi-contract Soroban workspace ...",
	},
	{
		fullName: "axelarnetwork/axelar-amplifier-stellar",
		why: "OtterSec (2025-04) + FYEO (2025-01) audits explicitly scoped to axelar-amplifier-stellar in Axelar's public audits repo; repo holds the real non-fork Soroban gateway/gas-service/ITS contract sources, live on Stellar s...",
	},
	{
		fullName: "untangledfinance/soroban-vault-contract",
		why: "Real Soroban vault sources (vault/offer/redeem_request modules + tests + threat model, non-fork Rust); Veridise's audit archive confirms an Untangled Vault Soroban/Rust audit (2025-05-22), plus SCF rounds 30/31 with L...",
	},
	{
		fullName: "EquitXCompany/equitx-project",
		why: "Runtime Verification-audited xasset/orchestrator/data-feed Soroban contracts (RV publications index, 2025 report) with substantive non-skeleton sources; SCF rounds 26+31 funded, product live",
	},
	{
		fullName: "Crossmint/stellar-smart-account",
		why: 'Halborn-audited Soroban smart-account contracts — dedicated Halborn "Stellar Smart Account – Crossmint" assessment (Aug 2025, in-repo at security/reviews/) plus a Nov 2026 follow-up; 63 substantive Rust sources (mul...',
	},
	{
		fullName: "Trustless-Work/trustlesswork-smart-contract-stellar",
		why: "Runtime Verification-audited Soroban escrow contracts (public 131-pp report, Nov 2025, cites this repo's core/dispute.rs; repo = renamed Trustless-Work-Smart-Escrow); real dispute/milestone/fee contract sources + test...",
	},
	{
		fullName: "The-Brookes-Project/soroban-sc",
		why: "Veridise-audited (public archive: Verseprop Soroban/Rust token, report 2025-12-05) real 983-line compliance security-token contract for Verseprop, a live revenue-producing RWA platform; 'HTML' language is just checked...",
	},
	{
		fullName: "xycloo/xycloans",
		why: "OtterSec audit report shipped in-repo (audits/osec.pdf) over real Soroban flash-loan contract crates (pool/ + factory/ with math/execution/rewards modules and full test suites); README cites SCF #12 win and project re...",
	},
	{
		fullName: "VestingLabs/stellar_vesting",
		why: "Runtime Verification-audited (audit PDF committed in-repo) real Soroban vesting factory+manager contracts for TokenOps, a Live SCF-awarded project",
	},
	{
		fullName: "icon-project/xcall-multi",
		why: "Coinspect-audited ICON xCall Soroban GMP contracts (fix review v241106, ICON Foundation blog Nov 2024); real Rust sources under contracts/soroban/contracts/xcall (non-fork, mainnet deployment wiki)",
	},
	{
		fullName: "blend-capital/blend-contracts",
		why: "audited lending protocol, SCF-funded, live on mainnet",
	},
	{
		fullName: "blend-capital/blend-contracts-v2",
		why: "v2 of the audited live lending protocol (current separation floor)",
	},
	{ fullName: "soroswap/core", why: "audited AMM, SCF-funded, live" },
	{
		fullName: "reflector-network/reflector-contract",
		why: "canonical oracle, SCF-funded, live feeds on mainnet",
	},
	{
		fullName: "kalepail/passkey-kit",
		why: "canonical passkey smart-wallet kit, widely integrated",
	},
	{ fullName: "eq-lab/slender", why: "SCF-funded lending protocol, live" },
	{
		fullName: "phoenix-protocol-group/phoenix-contracts",
		why: "SCF-funded AMM suite",
	},
	{ fullName: "laina-defi/laina", why: "SCF-funded lending protocol" },
	{
		fullName: "sentinelfi/sentinel_soroban_v3",
		why: "SCF-funded insurance/coverage protocol",
	},
	{ fullName: "normalfinance/normal-stellar-amm", why: "SCF-funded AMM" },
	{
		fullName: "perun-network/perun-soroban-contract",
		why: "Perun state channels — established research org's Soroban port",
	},
];

export const SHALLOW: LabeledRepo[] = [
	// v3 graduates (2026-07-08): education/demo name markers now example-cap them.
	{
		fullName: "nrxschool/stellar-bootcamp",
		why: "NearX School bootcamp course materials — Aula 1-5 syllabus with slide JPGs and hello_world/counter/flipper tutorial contracts; scaffold-by-design education repo, not a product.",
	},
	{
		fullName: "warp-driver/oracle-demo",
		why: 'Official WarpDrive tech-demo by its own README ("This repo is a tech-demo... reads top-to-bottom in one sitting") — testnet-only quickstart oracle example demonstrating the framework\'s cron/event triggers, not the p...',
	},
	// ── 2026-07-08 label-mining expansion (same verified batch) ──
	{
		fullName: "HatomProtocol/hatom-sc-proxies",
		why: 'Repo is 100% auto-generated MultiversX proxy interface stubs ("multiversx-sc proxy generator. DO NOT EDIT" headers, only *_proxy.rs call wrappers, no contract logic, not even Soroban code) — Hatom\'s real SCF r41 con...',
	},
	{
		fullName: "bigger-tech/template-stellar-smart-contract",
		why: 'GitHub is_template=true, not a fork; README self-describes as "a template for developing smart contracts" with a "sample contract with basic functionality" — the src/ tree is a generic init/set_admin/transfer demo...',
	},
	{
		fullName: "k3-labs/k3-template-rust",
		why: 'GitHub is_template=true official K3 Labs starter (Cargo package literally "k3-rust-example"); 8-file, 33KB repo whose only code is a ~60-line demo users KV handler on k3-wasm-sdk — scaffold by design, not the projec...',
	},
	{
		fullName: "axelarnetwork/stellar-gmp-example",
		why: 'Official Axelar-org example repo — README self-describes as "a standalone example of using Axelar\'s GMP protocol" with testnet-only quickstart instructions and a single minimal demo contract (6 src/*.rs files); scaf...',
	},
	{
		fullName: "theahaco/soroban-test-examples",
		why: "Aha Labs integration-test fixture repo: tree is the stock soroban-examples set (increment/atomic-swap/custom-types/token) plus trivial signature-test contracts, 24KB, 2-line README, 0 stars — example scaffold by desig...",
	},
	{
		fullName: "theahaco/hello-world-soroban-comparison",
		why: "Single-file (src/lib.rs) hello-world reimplementing Soroban's official quickstart contract to compare NEAR vs Soroban binary sizes — trivial one-fn tutorial-derived exercise (last push 2022-10), not a product; no matc...",
	},
	{
		fullName: "theahaco/soroban-tutorial-project",
		why: "README self-identifies as the code the Soroban Getting Started tutorial creates and an Astro template; only contracts are the tutorial's trivial hello (one 2-line fn) and incrementor (counter) — scaffold by design.",
	},
	{
		fullName: "xycloo/soroban-lottery-contract",
		why: 'README says "Code for sorobanathon submission" linking a tutorial blog post; a single ~258-line lib.rs on pre-1.0 2022 Soroban SDK, self-described as a "Lottery contract example" — a tutorial/example artifact by d...',
	},
	{
		fullName: "coinfabrik/scout-soroban-examples",
		why: 'Official CoinFabrik example corpus by design — README self-describes as "development templates"/examples repo built to exercise the Scout detector, deployed only on local standalone node; the real product is scout-a...',
	},
	{
		fullName: "stellar/soroban-examples",
		why: "official example set — structure without product substance",
	},
	{ fullName: "stellar/soroban-quickstart", why: "official quickstart" },
	{ fullName: "stellar/soroban-example-dapp", why: "official example dapp" },
	{
		fullName: "stellar/soroban-template-astro",
		why: "official template (KNOWN_SCAFFOLDS)",
	},
	{
		fullName: "jamesbachini/Soroban-Hello-World",
		why: "hello-world tutorial repo",
	},
	{ fullName: "dbcfd/soroban-template", why: "community template" },
	{
		fullName: "axelarnetwork/stellar-its-example",
		why: "official integration example",
	},
	{
		fullName: "allbridge-io/allbridge-proxy-contract-example",
		why: "official proxy-contract example",
	},
];

/** Gate thresholds — see depth-eval.ts for how they're asserted. Calibrated
 * 2026-07-07 against live scores (deep min 0.57 = blend-v2; shallow max 0.44
 * = the official examples): a change that drags a real protocol under 0.55,
 * lifts a template over 0.50, or collapses the band margin below 0.05 fails. */
export const GATE = {
	deepMin: 0.55,
	shallowMax: 0.5,
	marginMin: 0.05,
	/** Fetch failures happen (renames, rate limits); require this coverage per band. */
	minCoverage: 0.8,
} as const;

/**
 * FRONTIER — labels that are TRUE by external evidence but that the CURRENT
 * scorer cannot yet separate (2026-07-08 empirical run: these 10 real audited/
 * SCF-delivered protocols scored 0.39-0.52 while a bootcamp's tutorial
 * contracts scored 0.616). Deliberately NOT deleted — a label the scorer fails
 * is a scorer finding, not a label error; deleting it would make the key
 * circular. depth-eval prints these as a non-gating scoreboard; scorer v3's
 * definition of done is graduating rows from here into DEEP/SHALLOW.
 * (stellar/rs-soroban-env carries a domain note: audited host/VM rather than a
 * contract crate — a real edge of what "contract depth" means.)
 */
export const DEEP_FRONTIER: LabeledRepo[] = [
	{
		fullName: "diadata-org/soroban-oracles",
		why: "DIA org's own repo with implemented Soroban price + drand-randomness oracle contracts (admin auth, events, tests); SCF r20-funded ($38k disclosed) with a Live product listed as one of three oracle providers in officia...",
	},
	{
		fullName: "bandprotocol/band-std-reference-contracts-soroban",
		why: "Official Band Protocol org repo with the real StandardReference Soroban contract sources (full relay/admin implementation + tests + built wasm); corroborated by SCF r41 award ($100k) and Band's live mainnet oracle lis...",
	},
	{
		fullName: "stellar-broker/router-contract",
		why: "Real Soroban router contract sources (Aqua/SoroSwap/Comet/Phoenix adapters + malicious-LP tests), Runtime Verification audit PDF committed in-repo (2025-04-28), SCF r33 $150k with product Live at stellar.broker",
	},
	{
		fullName: "axis-markets/orderbook",
		why: "Real non-fork Soroban orderbook contract (soroban-sdk 26, substantive matching/settlement logic in src/orderbook.rs+trade.rs, full test suite, v0.4.0, active June 2026) by the StellarExpert team; SCF r40+r42 $136k dis...",
	},
	{
		fullName: "OpenZeppelin/stellar-contracts",
		why: "Multiply-audited official OZ Soroban library — 350 .rs contract sources plus 7 in-repo audit PDFs (0.1.0-RC→v0.7.0) matching the security-portal reports.",
	},
	{
		fullName: "allbridge-io/dex-soroban-contracts",
		why: "Quarkslab-audited Allbridge Estrela Soroban DEX (two rounds, report 24-03-1573 + Round 2); audit's described scope (2/3-token pools via Newton's method + factory) matches this repo's contracts/two_pool, three_pool, fa...",
	},
	{
		fullName: "57blocks/stellar-timelock-contract",
		why: "Veridise-audited TimeLockController contract sources (README links the audit report); SCF-27-funded project's own contracts repo, not a fork or scaffold.",
	},
	{
		fullName: "stellar/rs-soroban-env",
		why: "Veridise-audited Stellar Soroban Core (published VAR_Stellar_Soroban report); official non-fork repo with 305 Rust sources implementing the mainnet Soroban host/VM incl. built-in contracts.",
	},
	{
		fullName: "spiko-tech/stellar-contracts",
		why: "Halborn audit (halborn.com/audits/spiko/stellar-contracts-879885, Sept 2025) is explicitly scoped to this exact repo, which holds Spiko's real non-fork Soroban sources (permission-manager/redemption/token for the live...",
	},
];

export const SHALLOW_FRONTIER: LabeledRepo[] = [];

/**
 * JS/TS dapp-depth answer key (gist gap 1, phase 2) — same discipline as the
 * Rust bands: externally-grounded (live products/official SDKs vs official
 * templates/tutorials), adversarially verified, never scorer-derived.
 * Consumed by the depth-eval JS section; computeJsDepth calibrates here.
 */
export const JS_DEEP: LabeledRepo[] = [
	{
		fullName: "creit-tech/xbull-wallet",
		why: "Real xBull wallet source: signing.service.ts signs Transaction/FeeBumpTransaction/Soroban auth via @stellar/stellar-sdk Keypair, plus SEP-7/10/24 services and a full stellar-sdk gateway; active pro...",
	},
	{
		fullName: "stellarterm/stellarterm",
		why: "Session.js builds/signs real transactions via @stellar/stellar-sdk (TransactionBuilder + Ledger/Trezor/Freighter/WalletConnect signing) plus first-party orderbook/multisig/SEP-24 modules; long-live...",
	},
	{
		fullName: "blend-capital/blend-sdk-js",
		why: "src/pool/pool_contract.ts builds real Soroban contract ops via @stellar/stellar-sdk (Contract.call + spec.funcArgsToScVals → XDR) across pool/backstop/emitter/pool_factory modules; official publish...",
	},
	{
		fullName: "stellar-broker/ui",
		why: "src/widget/wallet-kit.js has real wallet-connect + signing (StellarWalletsKit modal, signTx via TransactionBuilder.fromXDR on PUBLIC) and withdraw-form uses StrKey validation; it is the live stella...",
	},
	{
		fullName: "RozoAI/rozo-rewards-miniapp",
		why: "src/hooks/useRozoWallet.ts builds a real Soroban contract-invoke tx (@stellar/stellar-sdk TransactionBuilder + Contract.call pay, simulateTransaction, auth-entry XDR, signAuthEntry signing flow) pl...",
	},
	{
		fullName: "diadata-org/soroban-oracle-feeders",
		why: "TS-dominant repo; own source (apps/oracle/src/oracles/soroban.ts + packages/common/src/soroban.ts) does real @stellar/stellar-sdk work — TransactionBuilder, contract.call('set_multiple_values'), pr...",
	},
	{
		fullName: "NoetherDEX/noether",
		why: "web/lib/stellar/market.ts builds/signs/submits Soroban contract txs with @stellar/stellar-sdk (toScVal args, signTransaction flow, rpc/xdr/Horizon imports) plus wallet-kit connection and tx-builder...",
	},
	{
		fullName: "Nectar-Network/nectar",
		why: "frontend/lib/stellar.ts has genuine SDK integration (Stellar Wallets Kit multi-wallet connect/sign, Horizon balances, TransactionBuilder + Soroban rpc.Server/Contract/assembleTransaction contract i...",
	},
];

export const JS_SHALLOW: LabeledRepo[] = [
	{
		fullName: "allbridge-io/allbridge-example-react",
		why: 'README self-describes as "a simple example of how to integrate the Allbridge Core SDK" that "intentionally omits validation/error handling"; Stellar.ts is a ~30-line Freighter connect/sign wrap...',
	},
	{
		fullName: "paltalabs/defindex-integration-tutorial",
		why: 'README explicitly frames the repo as a video-tutorial production kit ("Tutorial completo... material necesario para producir un video tutorial") with demo-only code (src/demo/ CLI/backend/fronten...',
	},
	{
		fullName: "soroswap/stellar-workshop",
		why: 'README self-describes as an "educational workshop... for Rio University students"; repo is two tutorial scripts (workshop-rio.ts/soroswap.ts) doing testnet-only, console-narrated SDK walkthroughs...',
	},
	{
		fullName: "etherfuse/ramp-api-example",
		why: 'Self-described official API example ("Example of how to use the etherfuse Ramp API"; package.json "Simple example for how to use ramp API") whose only code is plain fetch() calls to api.etherfu...',
	},
	{
		fullName: "ripe-money/tutorial-wallet-standard",
		why: 'Repo self-describes as "Tutorial / exploratory app to understand Wallet Standard"; README calls it a "barebone" explore app, tree is a tiny create-next-app scaffold, and the SDK used is @solana...',
	},
	{
		fullName: "reclaimprotocol/zkfetch-stellar-example",
		why: 'Repo is named "-example" and its README self-describes as "a comprehensive demonstration"/"showcases how to" — official demo scaffold (0 stars, ~10 files); real but tutorial-purpose stellar-s...',
	},
	{
		fullName: "sorobanhooks/sorobanhooks-integration-example",
		why: 'Self-titled "Integration Example" — create-next-app boilerplate whose only source (BalanceStream.js) uses socket.io-client to hit sorobanhooks API; no Stellar SDK anywhere, 0 stars, 2-day commit ...',
	},
	{
		fullName: "mowblox/upgrade-contracts-example",
		why: 'Stock "Sample Hardhat Project" README, 12-file EVM boilerplate (Vending.sol + default Lock.ts test), single-day 2023 push, 0 stars, no Stellar SDK usage at all — scaffold-by-design.',
	},
	{
		fullName: "mystic-finance/example-otc-project",
		why: 'README states "This project simulates the codebase of a protocol integrating with Mysticswap" and package.json is named example-otc-protocol; NestJS/Mongo demo with no Stellar SDK deps at all (EV...',
	},
	{
		fullName: "rangesecurity/oracle-example",
		why: 'README opens with "This repository demonstrates how to fetch off-chain data... Example" (explicit example-by-design framing), and its TS client (anchor/client/sdk.ts, package.json) uses only @sol...',
	},
	{
		fullName: "bluxcc/next-ts-blux-template",
		why: 'Official Blux starter template ("A minimal Next starter with Blux already integrated"): 4-file app whose only Stellar-adjacent code is a BluxProvider wrapper (providers.tsx) and a trivial login/l...',
	},
	{
		fullName: "boostylabs/react-webpack-template",
		why: 'Self-described "template repository for react app": package.json has no Stellar deps at all, App.tsx is the stock Learn-React placeholder, whole tree is webpack/eslint scaffold config — generic b...',
	},
	{
		fullName: "adamikhq/adamik-tutorial",
		why: 'Tutorial/demo by design (repo name + README "Sodot Multichain Demo ... demonstrates how to interact"); zero Stellar SDK deps in package.json — tx encode/sign/broadcast go through Adamik\'s chain-a...',
	},
	{
		fullName: "mowblox/blockexplorer-starter",
		why: "Alchemy University Ethereum bootcamp starter — README is lesson/clone-the-starter framing, src/App.js is trivial alchemy-sdk getBlockNumber boilerplate on ETH_MAINNET with zero Stellar SDK code; te...",
	},
];

/**
 * JS_DEEP_FRONTIER — TRUE labels (verified live products/SDKs) the current
 * scorer under-scores (2026-07-09 calibration run 2: 0.30-0.48). Dominant
 * cause: monorepo selection dilution — the top-8 JS file sample misses the
 * Stellar integration files (allbridge SDK: 19k SLOC sampled, zero
 * capability hits; its srb/ integration sits below the cut). Non-gating;
 * graduating rows = jsDepth v2 work. Never delete a true label the scorer
 * fails — that would make the key circular.
 */
export const JS_DEEP_FRONTIER: LabeledRepo[] = [
	{
		fullName: "reflector-network/reflector-node",
		why: "src/utils/rpc-helper.js does genuine @stellar/stellar-sdk@16 Soroban work — rpc.Server requests, Transaction/DecoratedSignature handling, submitTransaction with XDR result parsing — plus oracle/DAO...",
	},
	{
		fullName: "glo-foundation/glo-wallet",
		why: "Live Glo Dollar wallet with real SDK use in own source: lib/balance.ts parses Horizon txs via StellarSdk.TransactionBuilder.fromXDR, UserAuthModal.tsx does Freighter wallet connection via stellar-w...",
	},
	{
		fullName: "idos-network/idos-sdk-js",
		why: "Core package packages/kwil-infra has genuine @stellar/stellar-sdk integration — Stellar Keypair signing flow in create-kwil-signer.ts and Keypair.verify signature verification in signature-verifica...",
	},
	{
		fullName: "dfns/dfns-sdk-ts",
		why: "packages/lib-stellar/index.ts (published @dfns/lib-stellar 0.8.24) implements real signing: imports @stellar/stellar-sdk Transaction/FeeBumpTransaction/Networks, serializes tx envelope to XDR and a...",
	},
	{
		fullName: "chatch/stellarexplorer",
		why: "Live steexp.com explorer (2017-2026, 507 stars) with real @stellar/stellar-sdk@16 integration in its own app/lib/stellar/ — Soroban rpc.Server subclass, Horizon query builders, Federation/MuxedAcco...",
	},
	{
		fullName: "lobstrco/lobstr-browser-extension",
		why: "Official LOBSTR wallet extension (active, pushed 2026-07): Home.tsx uses @stellar/stellar-sdk Horizon.Server for live balance handling and background/messageListener/external/sign.ts + @lobstrco/si...",
	},
	{
		fullName: "allbridge-io/allbridge-core-js-sdk",
		why: "src/services/bridge/srb and src/utils/srb use @stellar/stellar-sdk for real Soroban contract tx building (swap_and_bridge), Horizon/SorobanRpc submission, trustlines and simulate/restore — first-pa...",
	},
];

/** Gate for the JS bands — thresholds set from the first empirical run. */
// Calibration run 2 (2026-07-09): gating min(DEEP)=0.510 (blend-sdk-js),
// max(SHALLOW)=0.400 (the example-cap ceiling) → margin 0.110.
export const JS_GATE = {
	deepMin: 0.5,
	shallowMax: 0.4,
	marginMin: 0.05,
	minCoverage: 0.75,
};
