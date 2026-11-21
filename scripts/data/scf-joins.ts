/**
 * Which SCF page joins which directory row: the page-verified overrides and
 * the slug form enrich-from-scf.ts matches with, in one module tests can
 * read. No I/O.
 */

import {
	RESERVED as GITHUB_RESERVED,
	parseGithubIdentity,
} from "../../src/lib/github-identity";
import {
	cleanTitle as cleanScfTitle,
	findTitlePrefixMatch,
	normSpaceless,
	stemSlugHash,
} from "../../src/lib/identity";
import {
	parseLink,
	registrableDomain,
	urlHost,
} from "../../src/lib/partner-project-identity";
import { isThirdPartyLink } from "../eval/scf-official";

/** Generate slug from name */
export function toSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

// sls-061 (#767): SCF titles that no normalization reaches: the API title
// names the PRODUCT/SUBMISSION, our record names the project. Keyed by the
// SCF slug (stable), mapped to OUR slug. Each pair verified 2026-08-07
// against the SCF page + our record before adding; never guessed.
export const SCF_SLUG_OVERRIDES: Record<string, string> = {
	// nightly-completeness residual since 2026-08-31: coala-pay is awarded
	// (rounds 22, 31, 35: see SCF_SUBMISSION_LINKS in curate-projects.ts)
	// but both SCF pages are submission-named, so no round award was ever
	// populated. r22 page-verified on anticipatory-aid-on-soroban-f7j, r35 on
	// coala-pay-billy-wallet-9mi (2026-09-01).
	"anticipatory-aid-on-soroban-f7j": "coala-pay",
	"coala-pay-billy-wallet-9mi": "coala-pay",
	// One row, several pages (2026-09-06): the second page is submission-
	// named and carries a later round. Every pair host-matched to our row
	// and page-parsed; the fold below keeps every page's award (before it,
	// the last page written won and curate's promote-only linkage put the
	// dropped round back: the row flipped on every execute).
	"prices-api-rfp-ctx-1vo": "ctx", // r41 $138,000 · rates.ctx.com (ctxcom-evm carries r19)
	"octopos-g6i": "untangled", // r41 $120,000 · stellar.untangled.finance (untangled-qcs carries r31 + Liquidity '25 Q3)
	"institutional-liquidity-infrastructure-for-stellar-k5c": "lobster", // r42 $115,000 · lobster-protocol.com, github.com/lobster-protocol (lobster-vzw carries r36)
	// tucambio's stored slug tucambio-wallets-lru renders no project payload
	// (soft-404); the project's page is submission-named.
	"seasonal-workers-payroll-lru": "tucambio", // r37 $75,000 + r43 $100,000 · tucambio.app, github.com/tucambioapp
	// Wave 2 (2026-09-06): rows the title-prefix matcher rightly rejects
	// ("Team Finance" ≠ "TrustSwap: Team Finance"; "Choppaddi" is FastBuka's
	// page retitled: same hash vmf, choppaddi.com is the row's site).
	"trustswap-team-finance-coa": "trustswap", // r36 $120,000 · team.finance
	"choppaddi-vmf": "fastbuka", // r38 $70,000 + r44 $80,000 (#35 not awarded) · choppaddi.com; folds with fast-buka-delivery-nbo (no submissions)
	// 2026-09-06: SCF's "Hermes: Stellar's Own Perpetual Exchange" links
	// github.com/zenith-protocols: that is our ZENEX row (zenex.trade, org
	// zenith-protocols, described "Zenex, formerly Hermes"). The name matcher
	// gave the page to our unrelated `hermes` row (OrbitCDP's perp exchange,
	// github.com/orbit-cdp/hermes), which carried $150,000 that is not its
	// award; that row is unlinked in SCF_FIX. Two live products share a name,
	// so only the link intersection decides.
	"hermes-isy": "zenex", // #32 $150,000 · github: github.com/zenith-protocols
	"bondhiveonchain-fixed-deposit-pbl": "bondhive",
	"coinsph-stellar-remittances-qwo": "coins-ph",
	"identity-operating-system-idos-nqg": "idos",
	"peer-by-honeycoin-inz": "honey-coin",
	"pelago-airswift-nkm": "airswift",
	// Soroban → Stellar rename class (product renamed, SCF page didn't).
	"soroban-security-portal-7ea": "stellar-security-portal",
	// sls-063 (2026-08-11, stellar-raven): 10 more product/submission-named
	// slugs, each page-verified locally: parseRoundVerdicts on the official
	// page reproduces the finding's exact round + budget before mapping.
	// vottun disambiguated by evidence: the developer-platform page carries
	// the r27 award; the wirex-vottun page does not.
	// Seed-review linkage (2026-09-01): four rows from the 2026-08-31
	// absence review whose SCF page titles are submission-named, so the
	// name matcher can never join them: the review's own evidence URLs
	// carry the page slugs. Each page-verified via parseRoundVerdicts
	// before mapping: pagcrypto r42/$96k · upesa r42/$86k (its stored r41
	// is NOT page-awarded: linkage lets the crosscheck adjudicate it) ·
	// roberto-sanz r22/$9k + r24/$30k · verseprop r33/$112,020 (stored
	// r31/r32 not page-awarded: same adjudication path). Coala Pay
	// deliberately NOT mapped: the only listed page ("Billy Wallet")
	// shows r35/$60k vs our stored [22,31]: likely multiple pages per
	// project; a wrong single-page join would mis-scope totals.
	// Legacy-award linkage wave 2 (2026-09-01): the remaining nine
	// no-linkage rows' page slugs were sitting in the seed-review map's
	// own evidence URLs all along. Every page verified via
	// parseRoundVerdicts before mapping; eight agree exactly with stored
	// rounds, escala's page marks #42/#43 "Not Awarded" (award = #44/$70k
	//: map corrected in the same change). Coala Pay stays deliberately
	// UNJOINED: it is a real multi-page project (r22 on
	// anticipatory-aid-on-soroban-f7j, r35 on coala-pay-billy-wallet-9mi,
	// r31 unverdicted on both) and a single-slug join would let the
	// exact-replace drop the unverdicted round.
	"stellar-women-bootcamp-r5v": "womenbiz",
	"embedded-collective-investment-via-soroban-syi": "escala",
	"confidential-transfers-and-balances-hdt": "fairblock",
	"solo-labs-iy1": "ichi",
	"soroban-disassembler-working-title-ply": "inferera",
	"advanced-debugging-for-soroban-contracts-5sr": "simbolik",
	"rfp-soroban-wasm-specialized-reverse-engineering-tool-mxh":
		"soroban-decompiler",
	"stellar-surge-1gh": "dfs-labs",
	"smart-account-onboarding-8yr": "the-aha-company",
	"regulated-brl-settlement-for-fx-and-institutional-payments-on-stellar-2vu":
		"pagcrypto",
	"liquid-by-upesa-dvq": "upesa",
	"social-podcast-ini": "roberto-sanz-criptomonedas",
	"a-real-estate-tokenization-platform-ss1": "verseprop",
	"allbridge-core-3lc": "allbridge",
	"obsrvr-prism-fvl": "obsrvr",
	"ibis-stablecoin-neobank-ramp-api-infrastructure-g4c": "ibis",
	"digibank-non-custodial-n1t": "digibank",
	"vottun-developer-platform-c2v": "vottun",
	"upesa-formerly-utoken-pbs": "utoken",
	"usdc-swap-stellar-cctp-bridge-yv8": "usdc-swap",
	"transfuse-multichain-asset-bridge-iyi": "transfuse",
	"catalyst-blockchain-manager-woe": "catalyst",
	"blade-tradfi-to-defi-bridge-zgq": "blade",
	// title-prefix rule casualties, same-entity page-verified (2026-08-12):
	// Greep pay = Greeppay; zkCrossDEX = zkCross's DEX; CashAbroad Smart
	// Treasury = Cash Abroad's second submission.
	// greep-pos-greep-pay-hfe, joined here until 2026-11-12, renders no
	// record now; the page SCF serves is -mhp (pay.greep.io,
	// github.com/GreepPay, the row's links).
	"greep-pos-greep-pay-mhp": "greeppay",
	"zkcrossdex-ipb": "zkcross",
	"cashabroad-smart-treasury-wla": "cash-abroad",
	// sls-111 (2026-11-04): a submission-named SCF #45 page whose own site,
	// slimepay.com, is the row's site. r45 $35,000 (its #44 not awarded).
	"the-merchant-settlement-rail-for-africa-bzf": "slimepay",
	// 2026-11-07: SCF retitled this record "Wellspring", so it joined our
	// wellspring row by name and that row served #30 and $150,000 beside
	// its own #41. Its only submission is RampMeDaddy's ("Bringing Stellar
	// Passkey Wallets to Telegram Globally"), and its links are the
	// rampmedaddy row's: site rampmedaddy.com and the same GitHub repo. One
	// company runs both products (each site's terms name it, DBA RampMeDaddy
	// and DBA Wellspring); wellspring-rdo (#41, wellspring.money) stays the
	// wellspring row's page. r30 $150,000.
	"wellspring-xuv": "rampmedaddy",
	// sls-111: rows with a 3 or 4 letter name that is not an acronym no
	// longer join by title prefix (a row named Lend would take any title
	// starting "Lend"). These live joins are kept here instead, each with
	// the page's own site equal to the row's site (2026-11-05).
	"bexo-wallet-usdc-payments-cross-border-transfers-qr-merchant-payments-for-latin-america-uyu":
		"bexo", // bexo.app
	"lendxyz-7xc": "lend", // app.lend.xyz
	"zarf-protocol-zarfto-b5n": "zarf", // zarf.to
	"loop-cashback-everywhere-with-stellar-zom": "loop", // loopfinance.io
	"sfx-super-money-app-uav": "sfx", // sfxchange.co
	"lul-serving-the-unbanked-ckz": "lulpay", // lulpay.com (the lul row is its lineage shadow)
	"eara-european-regulated-rwa-ecosystem-dmu": "eara", // earaglobal.com
	"rozo-one-tap-to-pay-vqy": "rozo", // rozo.ai
	"cobo-custody-integration-for-institution-p8i": "cobo", // cobo.com
	"cocaxyz-5fk": "coca", // coca.xyz
	"paid-payrolling-0sk": "paid", // p-aid.world
	// sls-111 (2026-11-11): the twelve SCF #45 awardees the directory had no
	// row for, seeded in SEEDS (scripts/data/curation-maps.ts) from these
	// pages. Each joins by its page slug, never by name: most rows are named
	// for the product, not the SCF title. The comment names the link the page
	// and the row share; the three rows with none were seeded from the page
	// itself (statusSourceUrl), because the site the page gives is dead
	// (Astrolabe, ZKELLA) or a person's repository (Principal).
	"pollar-nqe": "pollar", // pollar.xyz
	"pods-dxl": "pods", // deframe.io
	"agentsmith-x402-stellar-facilitator-and-bazaar-discovery-kdw":
		"agentsmith-x402", // 57blocks.com/blockchain, which lists AgentSmith
	"cara7-yyx": "cara7", // cara7.com
	"astrolabe-bzg": "astrolabe", // seeded from the page; its vercel.app site is gone
	"onboard-kvj": "onboard", // onboard.xyz
	"nila-fwc": "nila", // nila.land
	"principal-vzt": "principal-protocol", // seeded from the page; its site is a person's repository, not linked
	"zkella-protocol-compliance-ready-confidential-finance-infrastructure-for-stellar-sib":
		"zkella", // seeded from the page; its site, zaiffer.org, answers 404
	"canary-protocol-y4l": "canary-protocol", // canaryprotocol.com
	"fermah-pay-w3c": "fermah-pay", // fermah.xyz
	"open-rwa-vault-infrastructure-nis": "strata", // bootnode.dev, whose Strata page names this award
	// Beamable's #38 page is titled "Onboard Game Devs with Beamable", so with
	// the onboard row above the title-prefix matcher would hand it to Onboard
	// (a join simulation over all 531 listed pages found it, and no other).
	// Its site, beamable.com, and its GitHub org are the beamable row's, and
	// its #38 $150,000 is the award that row carries with no page cited.
	"onboard-game-devs-with-beamable-m5q": "beamable",
	// sls-116 (2026-11-12): the award pages of rounds before #45 that no row
	// carried, each read on 2026-11-12 beside the row it names. Listed pages
	// the name matcher cannot reach; the comment names the link the page and
	// the row share. Six rows stored the page already but no source, so the
	// enrich never re-read them (hana by the 4-letter rule).
	"hana-wallet-x9e": "hana", // hanawallet.io
	"hyperledger-solang-dwa": "solang", // github.com/hyperledger-solang
	"muwpay-qwa": "muwp", // muwpay.com
	"stellar-attestation-service-lda": "attest", // github.com/daccred/attest.so
	"soroban-rpc-sdk-dep": "cross-platform-soroban-rpc-sdk", // github.com/FrankSzendzielarz/SorobanRPCSDK
	"stellar-integration-in-adamik-api-piy": "adamik", // github.com/AdamikHQ
	"convexity-humanitarian-aid-transfer-solution-chats-bd8": "chats", // chats.cash
	"bpv-stellarmesh-anchor-afq": "bp-ventures", // bpventures.us
	"institutional-treasury-xlm-wyu": "arrel", // arreltech.com
	"meta-contracts-in-stellar-p4c": "stellar-router-sdk", // jsr.io/@creit-tech/stellar-router-sdk, the row's site
	"oz-accounts-policy-builder-by-gatewayfm-mqp": "gatewayfm", // gateway.fm; folds with gatewayfm-noq (#16)
	"post-quantum-secure-wallets-for-stellar-97o": "soundness", // soundness.xyz
	"sdk-for-stellar-qt-mab": "stellar-qt-sdk", // github.com/bnogalm
	"soroban-and-stellar-content-g7j": "noticias-trading", // the row's description is the page's, and the same beacons.ai profile
	"unstoppable-money-eii": "unstoppable-wallet", // unstoppable.money; folds with unstoppable-wallet-thi (#34)
	"vanna-protocol-icb": "vanna-finance", // vanna.finance
	"zkfetch-zktls-powered-oracle-solution-mfy": "reclaim", // reclaimprotocol.org
	"flow-sbr": "obsrvr", // withobsrvr.com, three rows' site; the obsrvr row's description names Flow
	// SCF record rechQd4T6SVeIF7gH: smilepay-global-7gh, the row's stored
	// page, renders no record now; SCF retitled it PaySome.ai. Same record,
	// same awards (#10, #37).
	"paysomeai-7gh": "smilepay",
	// Pages outside the listing that a name cannot join (the enrich finds
	// them on SCF's round pages). A page with no link joins only where the
	// row's description says what the page does (most rows were seeded from
	// these pages), or the name is coined and Stellar-specific ("name").
	"stellarpay-dy1": "stellarpay", // #2; Shopify merchants, as the row says (its #30 is Not Awarded)
	"equilibreio-ok2": "equilibre", // a portfolio balancer for Stellar
	"centaurus-i4z": "centaurus", // a second-layer payment network
	"stellar-battle-hha": "stellar-battle", // community-funded prizes
	"blue-orion-wpj": "blue-orion", // Stellar workshops
	"lumens-for-charity-rui": "lumens-for-charity", // XLM donations to charities
	"lumenaut-pool-0nd": "lumenaut", // the inflation pool
	"getblockcardcom-afx": "getblockcard", // the title is the row's site
	"sendit-ll9": "sendit", // the row's description cites its SCF round 4 award
	"stellar-update-g85": "stellar-update", // a blog about Stellar
	"rigel-yeo": "rigel", // monetized links
	"opensolar-teb": "opensolar", // securitized solar financing
	"lettuce-4zo": "lettuce", // a Stellar point of sale
	"mxlet-mq9": "mxlet", // an open Stellar hardware wallet
	"relax-rbc": "relax", // HR assets on Stellar
	"crypto-link-2ej": "crypto-link", // a Discord payments bot
	"vitreous-jdm": "vitreous", // transparent fundraising
	"soroban-assistant-h9o": "soroban-assistant", // a Soroban AI assistant
	"sorosorcerercom-x3s": "sorosorcerer", // a Soroban contract builder
	"canfy-a2m": "canfy", // a Stellar developer copilot
	"sorscan-svd": "sorscan", // a Soroban explorer
	"aurapay-xkw": "aurapay", // remittances to Latin America
	"localcoin-tdn": "localcoin", // incentives for social-good organisations
	"gecko-fuzz-emh": "gecko-fuzz", // contract fuzzing
	"paygo-crypto-ajc": "paygo-crypto", // PAYGO distributors
	"skeeper-a-keeper-platform-8rf": "skeeper", // Soroban keepers
	"stocken-capital-legaltech-wid": "stocken-capital", // legal governance platform
	"forge-cxk": "forge", // Horizon and RPC node deployment
	"mimoto-b9d": "mimoto", // ZK identity for payments
	"chaincred-rk7": "chaincred", // company finances on Soroban
	"prophe-okb": "prophe", // project management toolset
	"grip-fuv": "grip", // one card over every account; x.com/trygripapp, trygrip.co
	"sgf-solutions-tdi": "sgf-solutions", // USDC to ARS
	"ea-kazi-1qp": "ea-kazi", // the same EA_KAZI_backend_ic repository
	"swplug-pba": "swplug", // name
	"stellarauth-nnk": "stellarauth", // name
	"cosmiclink-kno": "cosmiclink", // name (cosmic-plus)
	"cosmicvote-qlc": "cosmicvote", // name (cosmic-plus)
	"nicetrade-qrp": "nicetrade", // name
	"cryptocannoneer-tzl": "cryptocannoneer", // name
	// Product pages whose site or GitHub owner is the row's (the row is the
	// company or renamed product).
	"azores-metaverse-e17": "bes-metaverse", // azores.group, github.com/BESMetaverse
	"kometpay-raw": "puenta", // kometpay.com
	"soroban-smart-option-contract-2ty": "block-time-financial", // github.com/blocktimefinancial
	"formal-verso-i5m": "saw", // galois.com, github.com/GaloisInc
	"bank2bit-s7u": "blox", // blox.global
	"anchor-transparency-node-f6w": "usher", // usher.so, github.com/usherlabs
	"stellar-talent-platform-p3z": "techfiesta", // github.com/Ekolance-Official
	"infrastructure-support-liquify-x8y": "liquify", // liquify.com
	"merkle-tree-airdrop-tooling-rlq": "sorodrop", // sorodrop.xyz
	"oneclickfi-xgi": "one-click", // oneclick.fi
	"stellar-time-machine-llg": "genie-ai", // genieai.tech
	"fixed-rate-fixie-dxh": "polaris-lend", // jetprotocol.io (its title's quote was unreadable until sls-116)
	// The page's one awarded submission (SCF #44, $95,000) is titled
	// "SoroPass: Passkey SDK & UI Components". Its only link,
	// github.com/justmert/passkey-ui, answers 404; the soropass row links
	// github.com/justmert/soropass, "a minimal, composable passkey SDK and a
	// small set of UI components for Stellar smart accounts" by the same
	// owner, built to plug into stellar-wallets-kit, the gap the submission
	// names (read 2026-11-12).
	"passkey-ui-sj6": "soropass",
	// Canonical-vs-dupe routing (sls-043 close-out): official "Band Protocol"
	// exact-matches the band-protocol DUPE row by name; the CANONICAL slug is
	// `band`, which otherwise matches nothing and would keep stale data.
	"band-protocol-2ob": "band",
	// Read 2026-11-14. The page "Soroban Optimistic Oracle (SOO)" (SCF #33,
	// $30,000 Build Award) links two repositories of one account:
	// github.com/stackman27/SOO, which is the repository our row links
	// (Rust, pushed 2025-04-13), and github.com/stackman27/soroban-opt-oracle,
	// which answers 404. The page reader returns the second as the page's
	// site, and two rows link that account (this one, and the Draft
	// `soroban-optimsitic-oracle`, the awarded submission's own misspelling),
	// so the logo repair's same-repository rule could not confirm the page.
	// The name already joins this page to this row in the sync; this entry
	// records why the page is the row's.
	"soroban-optimistic-oracle-soo-b6y": "soroban-optimistic-oracle",
};

/** A directory row as the matcher reads it. */
export interface JoinRow {
	slug: string;
	name: string;
	canonicalSlug?: string | null;
	links?: { website?: string | null; github?: string | null } | null;
}

/** The lookups matchListingRow reads (built once per run by the enrich). */
export interface JoinIndex<R extends JoinRow> {
	rows: R[];
	bySlug: Map<string, R>;
	/** exact spaceless names one project carries (uniqueNames) */
	byNormName: Map<string, R>;
	identityOf: (row: R) => unknown;
}

/**
 * The row an SCF listing entry joins, before any lineage-shadow re-key: an
 * override, an exact name, a slug, then the single best title prefix.
 * Partial matching is the last resort and TITLE-PREFIX ONLY (sls-043,
 * 2026-08-12): spaceless containment matched across word seams ("Soroban
 * Disassembler" took Band Protocol's slot), and even word-boundary
 * containment fails for generic one-word names. Legit tail matches ("...by
 * Gateway.fm") get explicit SCF_SLUG_OVERRIDES instead.
 */
export function matchListingRow<R extends JoinRow>(
	scf: { slug?: unknown; title?: unknown },
	index: JoinIndex<R>,
	onSkip?: (row: R, why: string) => void,
): R | undefined {
	// Trim parenthetical noise ("Soroban Optimistic Oracle  (SOO) ").
	const cleanTitle = cleanScfTitle(String(scf.title ?? ""));
	const normTitle = normSpaceless(cleanTitle);
	const slug = String(scf.slug ?? "");
	// SCF slugs carry a trailing hash ("warp-drive-7tk"): stem it.
	const stem = stemSlugHash(slug);
	const { bySlug, byNormName } = index;
	const hit =
		bySlug.get(SCF_SLUG_OVERRIDES[slug] ?? "") ||
		byNormName.get(normTitle) ||
		bySlug.get(toSlug(cleanTitle)) ||
		bySlug.get(slug) ||
		bySlug.get(stem) ||
		byNormName.get(normSpaceless(stem));
	if (hit || normTitle.length < 4) return hit;
	return findTitlePrefixMatch(cleanTitle, index.rows, onSkip, index.identityOf);
}

/** The owner/repo of a GitHub link, lowercased, or null. */
const repoOf = (u?: string | null) =>
	u
		?.match(/github\.com\/([^/\s]+\/[^/\s?#]+)/i)?.[1]
		.toLowerCase()
		.replace(/\.git$/, "") ?? null;

/**
 * The link that confirms a fold of SCF pages joined to one row by name, or
 * null: every page must share the row's website (registrable domain) or its
 * exact GitHub repo. A shared GitHub org is not enough, since one company can
 * run two products: wellspring-xuv (RampMeDaddy's page, retitled
 * "Wellspring") shares only the org with the wellspring row.
 */
export function foldLinkNote(
	pages: Array<{ website?: string | null; github?: string | null }>,
	row: JoinRow,
): string | null {
	const site = registrableDomain(row.links?.website);
	const repo = repoOf(row.links?.github);
	const shared = new Set<string>();
	for (const p of pages) {
		if (site && registrableDomain(p.website) === site) shared.add(site);
		else if (repo && repoOf(p.github) === repo)
			shared.add(`github.com/${repo}`);
		else return null;
	}
	return shared.size ? [...shared].join(", ") : null;
}
/**
 * SCF pages outside the listing, joined to OUR row (our slug to page slug).
 * /backend/projects serves 531 rows whatever it is asked, so a project
 * outside it never reaches the name matcher. Since sls-116 the enrich finds
 * those pages itself from SCF's round pages (every numbered round's awards,
 * by project record id, read live on every run), and joins each by a
 * reviewed entry here or in SCF_SLUG_OVERRIDES, or by a name a shared link
 * confirms (joinOffListing). This map stays the reviewed list for the pages
 * a name cannot join and for the awards SCF does not number (Liquidity,
 * Public Goods), which no round page lists: those were found once, offline,
 * from the Wayback CDX index of /project/*. Every entry: page parsed with
 * parseRoundVerdicts, and the site, GitHub org or X handle on the page
 * matched our row's links, or, where the page carries no links, the name is
 * coined, Stellar-specific and unambiguous (marked "name").
 * Left out on purpose: pages whose cards are all negative verdicts,
 * Kickstart-only pages ("SCF Kickstart #N" cards are neutral to the
 * parser), and pages already attached to another row: one page never joins
 * two rows, and a fossil join is cleared first (pen and opengrants-fdb,
 * SCF_FIX unlink, 2026-09-06). Amounts are the page's own budgets;
 * "undisclosed" = award confirmed, no budget on the page (stored as
 * amountUSD null, never 0).
 */
export const SCF_PAGES_BEYOND_CAP: Record<string, string> = {
	accelar: "accelar-2td", // #26 $33,000 · site+github: accelar.io, github.com/accelar-labs
	"art-club": "art-club-ia2", // #26 $40,000 · github: github.com/grmarkkes
	artizen: "artizen-ngf", // #33 $130,000 · site+github: artizen.fund, github.com/artizen-fund
	assetdesk: "assetdesk-kqx", // #19 $70,000 · site: assetdesk.xyz
	astrocore: "astrocore-4xe", // #2 undisclosed · name: astroband's Stellar core port, SCF #2
	astrograph: "astrograph-thf", // #1 undisclosed · name: astroband's Stellar GraphQL, SCF #1
	autify: "autify-network-nxv", // #14 $15,000 · site: autifynetwork.com
	"scaffold-stellar": "scaffold-stellar-ldy", // PG Q2 '26 undisclosed · github: github.com/theahaco; awarded=true was hand-patched with no page
	blend: "blend-mfy", // Liquidity '24 Q1 $50,000 · site+github: blend.capital, github.com/blend-capital; awarded=true was hand-patched with no page; the page is not numbered-round listed (Wayback CDX only)
	blockedenxyz: "blockedenxyz-6du", // #18 $139,999 · site+github: blockeden.xyz, github.com/blockedenhq
	blocknify: "blocknify-5bv", // #6 $4,543.37 · #7 $131,973.75 · name: coined name
	borderless: "borderless-u3x", // #20 $43,000 · #22 $82,500 · site+github: borderlesspayments.xyz, github.com/borderless-payments
	bravepay: "bravepay-tze", // #11 $200,000 · site: bravepay.net
	btq: "btq-jva", // #14 $10,000 · site: btq.com
	cede: "cede-labs-fxy", // #31 $119,800 · site+github: cede.store, github.com/cedelabs
	chaincerts: "chaincerts-u04", // #13 $75,000 · #18 $103,125 · site+github: chaincerts.co, github.com/kommitters
	"chainlink-oracles-relayer": "chainlink-oracles-relayer-c5f", // #15 $38,400 · site+github: docs.relink.services, github.com/relinkservices
	chef: "chef-c8c", // #22 $18,000 · site: github.io/stellar-chef, stellar-chef.github.io
	chronospay: "chronospay-nrb", // #11 $65,000 · site: chronospay.io
	"city-states": "city-states-medieval-70v", // #2 undisclosed · name: our host citystatesm = "City States: Medieval"
	clear: "clear-4rw", // #26 $45,000 · site: borderlesspayments.xyz
	"clickpesa-debt-fund": "clickpesa-debt-fund-ssc", // #26 $30,000 · #28 $95,000 · name: product-named, same company (ClickPesa)
	clob: "clob-qoi", // #29 $72,019 · site: ideasoft.io
	coinsender: "coinsender-f7q", // #24 $23,440 · site+github: coinsender.io, github.com/megadev-ou
	constellation: "constellation-protocol-4uv", // #19 $110,000 · #23 $100,000 · github: github.com/constellation-protocol
	copperx: "copperx-gateway-and-payout-yhf", // #29 $50,000 · site+github: copperx.io, github.com/copperxhq
	dappradar: "dappradar-e06", // #27 $50,000 · #34 $95,000 · site: dappradar.com, x.com/dappradar
	deb: "deb-sj5", // #6 $653.09 · site: demo.drivedeb.com, drivedeb.com
	dropzey: "dropzey-in4", // #23 $38,500 · site+github: dropzey.com, github.com/zainh332
	"elixir-stellar-sdk": "elixir-stellar-sdk-wib", // #10 $12,000 · github: github.com/kommitters
	elsa: "elsa-wallet-banking-filipinos-hcg", // #11 $95,000 · site: elsa.care
	emigro: "emigro-jp6", // #17 $46,400 · #20 $33,920 · #25 $90,000 · site+github: emigro.co, github.com/emigro
	empowch: "empowch-eh9", // #11 $25,000 · site: empowch.com
	fijicoin: "fijicoin-frq", // #8 $50,000 · site: mai.money
	"flutter-stellar-sdk": "flutter-stellar-sdk-ilm", // PG Q2 '26 undisclosed · PG Q3 '25 undisclosed · PG Q4 '25 undisclosed · github: github.com/soneso
	flux: "flux-yu0", // #22 $38,000 · site: iflux.app
	"fx-swap": "fx-swap-by-hedgehog-unu", // #21 $42,450 · site: hedgeeffective.com
	getpaid: "getpaid-z9y", // #9 $192,500 · site: getpaid.africa
	"governance-modules-library": "governance-modules-library-nr4", // #22 $27,000 · #26 $74,000 · github: github.com/blockscience
	handlpay: "handlpay-ah3", // #30 $60,000 · site+github: github.com/handlpay, handlpay.com
	hiyield: "hiyield-0e4", // #18 $150,000 · site: hiyield.xyz
	icanproveit: "icanproveit-proof-of-learning-icn", // #26 $50,000 · github: github.com/tuvalusoftware
	idunu: "idunu-help-kids-thrive-3tm", // #21 $15,000 · #25 $15,000 · name: coined name
	"infinity-wallet": "infinity-wallet-f7m", // #16 $130,000 · site+github: github.com/infinitywallet, infinitywallet.io
	"ios-stellar-sdk": "ios-stellar-sdk-tdq", // PG Q2 '26 undisclosed · PG Q3 '25 undisclosed · PG Q4 '25 undisclosed · github: github.com/soneso
	"java-stellar-sdk": "java-stellar-sdk-btq", // PG Q2 '26 undisclosed · PG Q3 '25 undisclosed · PG Q4 '25 undisclosed · github: github.com/lightsail-network
	"js-worker-sdk": "js-worker-sdk-rjo", // #24 $12,500 · #27 $35,000 · github: github.com/cloudouble
	katagames: "katagames-r2t", // #11 $25,000 · site: kata.games, x.com/createplayearn
	keizai: "keizai-qfe", // #21 $43,000 · #28 $41,000 · github: github.com/keizai-tools
	"kmac-state-machine-template": "kmac-state-machine-template-extension-jqw", // #20 $7,500 · github: github.com/huitemagico
	"kotlin-stellar-sdk": "kotlin-stellar-sdk-fjl", // #9 $11,500 · github: github.com/rahimklaber
	kript: "kript-pva", // #27 $35,000 · #32 $77,000 · site: kriptup.io
	kunst21: "kunst21com-ray", // #9 undisclosed · name: SCF title is our host kunst21.com
	"legacy-suite": "legacy-suite-on-stellar-zpd", // #24 $49,998 · site+github: github.com/avento-labs, legacysuite.com
	lumenscan: "lumenscan-bwl", // #4 undisclosed · name: Lumen-specific name
	mica: "mica-ckw", // #16 $138,700 · site+github: github.com/micatechnology, mica.rent
	mojoflower: "mojoflower-mq4", // #7 $196,415 · #11 $47,500 · #17 $100,000 · github: github.com/mojoflower-garden
	mystic: "mystic-finance-xp7", // #29 $47,000 · site: mysticfinance.xyz
	"net-sdk": "net-sdk-cfe", // PG Q2 '26 undisclosed · PG Q4 '25 undisclosed · github: github.com/beans-bv
	"nirvana-labs": "nirvana-labs-4eh", // #26 $36,000 · site: nirvanalabs.io
	oinc: "oinc-kix", // #17 $105,000 · site: com.br, useoinc.com.br
	okashi: "okashi-oee", // #13 $82,000 · #15 $124,800 · #20 $100,000 · #24 $100,000 · site+github: github.com/okashi-dev, okashi.dev
	omnilumen: "omnilumen-dyk", // #28 $50,000 · github: github.com/omnilumen
	// scf.awarded was true with $48,000 and no page anywhere: an uncited award.
	// The page's own SCF #27 Legacy v5.0 Activation budget is $48,000, equal to
	// the figure already on our row, and its links (orally.net,
	// github.com/orally-network) match the product's name.
	orally: "orally-network-76g", // #27 $48,000 · amount+name
	"open-gamefi-sdk": "open-gamefi-sdk-ibv", // #28 $39,000 · github: github.com/yanis7774
	opengrants: "opengrants-fdb", // PG Q2 '26 undisclosed · PG Q3 '25 undisclosed · PG Q4 '25 undisclosed · site+github: opengrants.net, github.com/metagov/daostar
	ortege: "ortege-ai-tsm", // #18 $11,200 · #22 $40,000 · #26 $100,000 · github: github.com/ortege-xyz
	paysapp: "paysapp-l02", // #3 undisclosed · name: coined name (kuyawa)
	"planet-pay": "planet-pay-lxg", // #14 $49,500 · #21 $96,000 · github: github.com/scalemote
	plutope: "plutope-merchant-app-zmh", // #27 $33,400 · github: github.com/plutopein, x.com/plutopeio
	poma: "poma-protocol-s3f", // #29 $14,000 · github: github.com/poma-protocol, x.com/pomaprotocol
	qolaq: "qolaq-wev", // #13 $150,000 · site: qolaq.org
	qstn: "qstn-3rv", // #20 $2,500 · site: qstn.us
	ramm: "ramm-global-retail-commerce-zbg", // #22 $38,500 · site+github: github.com/jamiels, ramm.ai
	rarible: "rariblecom-stellar-ujd", // #30 $150,000 · site+github: github.com/rarible, rarible.com
	sanctum: "sanctum-cfe", // #23 $50,000 · #25 $85,000 · github: github.com/zkbricks
	securx: "securx-medical-prescriptions-xmt", // #27 $42,400 · site: securxtech.wixsite.com, wixsite.com/securx
	silicore: "silicore-wrz", // #29 $31,000 · github: github.com/ilanklim
	"simple-signer": "simple-signer-ei9", // #9 $10,000 · github: github.com/fsodano
	solarkraft: "solarkraft-jdu", // #24 $50,000 · #29 $67,000 · github: github.com/freespek
	"soroban-explorer": "soroban-explorer-rtb", // #19 $61,000 · #23 $100,000 · site: sorobanexp.com
	"soroban-polygon-interop": "soroban-polygon-interop-3gz", // #27 $42,755 · site: entethalliance.github.io, github.io/crosschain-interoperability
	"soroban-pre-order-contract": "soroban-pre-order-contract-ucp", // #12 $1,000 · github: github.com/aolieman
	"soroban-react": "soroban-react-khv", // #20 $25,000 · github: github.com/paltalabs
	sorobanmath: "sorobanmath-zuo", // #20 $40,000 · github: github.com/rahul-soshte
	sorobuild: "sorobuild-zhc", // #22 $44,800 · name: Soroban-specific coined name
	sorosan: "sorosan-twd", // #20 $29,000 · github: github.com/sorosan
	// scf.slug soropg-zcg was hand-set, but the page is outside the 500-row
	// listing, so no pass ever visited it: the row served awarded=true with an
	// empty roundAwards and the page's -226 sentinel as its round. Its one
	// award is a partial disbursement ("Awarded (50%)"), which only became
	// readable with the status fix in the same batch.
	soropg: "soropg-zcg", // PG Q2 '26 undisclosed · site+github: soropg.com, github.com/jamesbachini
	sorosplits: "sorosplits-9w7", // #19 $59,700 · #23 $94,000 · site+github: github.com/findolor, sorosplits.xyz
	sorostarter: "sorostarter-9b2", // #29 $47,175 · github: github.com/sorostarter, x.com/sorostarter
	spacewalk: "spacewalk-sel", // #11 $100,000 · site+github: github.com/pendulum-chain, pendulumchain.org
	spatium: "spatium-wallet-7ii", // #13 $148,000 · #22 $35,200 · name: coined wallet name, spatium.net on page
	starloom: "starloom-ox2", // #26 $45,900 · site: starloom.io
	"stellar-nest": "stellar-nest-thq", // #25 $14,800 · github: github.com/alkeops
	"stellar-tip": "stellar-tip-pj5", // #4 undisclosed · name: Stellar-specific name
	"stellar-token-launchpad": "stellar-token-launchpad-flp", // #24 $40,000 · site+github: github.com/cryptixag, tokenlaunchpad.eu
	"stellar-tools": "stellar-tools-6qw", // #26 $18,700 · site+github: github.com/joaquinsoza, stellartools.xyz
	stellarguard: "stellarguard-41d", // #1 undisclosed · name: Stellar-specific name
	stellarmint: "stellarmint-ece", // #5 $51,277.94 · site: stellarmint.io
	stellarport: "stellarport-gfe", // #2 undisclosed · name: Stellar-specific name
	stellarprodev: "stellarprodev-z0n", // #17 $39,880 · #29 $26,000 · site+github: github.com/omeganetwork-tech, stellarpro.dev
	stellarscamreport: "stellarscamreport-wir", // #6 $5,445 · site: stellarscam.report
	stellot: "stellot-vp7", // #4 undisclosed · name: Stellar-specific coined name
	"storehouse-gold": "storehouse-gold-to-stellar-nlz", // #26 $50,000 · name: distinctive product name
	stroopyai: "stroopyai-e5a", // #20 $21,370 · site: stroopy.ai
	tap4change: "tap4change-wgd", // #21 $73,280 · site: tap4change.org
	taskio: "taskio-87z", // #7 $283,499 · site: task.io
	teken: "teken-easy-multi-signatures-avi", // #28 $29,500 · github: github.com/moonbite-gmbh
	"timed-transactions-api": "timed-transactions-api-shu", // #1 undisclosed · name: SCF #1 project, name unambiguous
	tracee: "tracee-jnz", // #16 $128,925 · github: github.com/tracee1910
	triiyo: "triiyo-5cf", // #22 $50,303 · site: triiyo.com
	uils: "uils-yl5", // #17 $141,027.50 · name: coined name, uils.la on page, no links on our row
	walletban: "walletban-n32", // #20 $20,000 · site: walletban.xyz
	"web3-antivirus": "web3-antivirus-w3a-a37", // #28 $50,000 · github: github.com/web3-antivirus
	xycloans: "xycloans-qqr", // #13 $31,800 · Liquidity '24 Q1 $50,000 · github: github.com/xycloo
	zentra: "zentra-cxp", // #23 $18,200 · site+github: github.com/tosinshada, tide-soroban-contract-frontend.vercel.app
	ziriz: "ziriz-my0", // #22 $48,000 · github: github.com/zirizapp
};

const BEYOND_CAP_BY_PAGE = new Map(
	Object.entries(SCF_PAGES_BEYOND_CAP).map(([ours, page]) => [page, ours]),
);

/** Hosts that hold many projects: a site on one is no project's site. */
const CODE_HOST =
	/^(?:github\.com|gitlab\.com|github\.io|vercel\.app|netlify\.app|herokuapp\.com)$/;

/** The GitHub owner a link names, lowercased (SCF writes an org as
 * github.com/orgs/<owner>), or null. GitHub's own first segments (sponsors,
 * marketplace) name nobody: two links under github.com/sponsors/ once read as
 * the shared owner "sponsors". */
const githubOwner = (u?: string | null) => {
	const owner = u
		?.match(/github\.com\/(?:orgs\/)?([^/\s?#]+)/i)?.[1]
		?.toLowerCase();
	return owner && !GITHUB_RESERVED.has(owner) ? owner : null;
};

/**
 * The link an SCF page and a row share, or null: the registrable domain of
 * their sites (never a code host or a third-party page such as a link-in-bio
 * profile), else their GitHub owner. A name is a hypothesis; this is the
 * evidence that the name is one project.
 */
export function sharedLink(
	page: { website?: string | null; github?: string | null },
	row: JoinRow,
): string | null {
	const site = registrableDomain(page.website);
	if (
		site &&
		!CODE_HOST.test(site) &&
		!isThirdPartyLink(String(page.website)) &&
		site === registrableDomain(row.links?.website)
	)
		return `site ${site}`;
	return sharedOwner(page, row);
}

/** The GitHub owner an SCF page and a row both link, or null. */
function sharedOwner(
	page: { website?: string | null; github?: string | null },
	row: JoinRow,
): string | null {
	const owner = githubOwner(page.github) ?? githubOwner(page.website);
	const ours =
		githubOwner(row.links?.github) ?? githubOwner(row.links?.website);
	return owner && owner === ours ? `github ${owner}` : null;
}

/** Hosts whose pages belong to many unrelated owners (a channel, a profile,
 * a package, a submission): a link on one is no project's site, even when
 * both links are the same URL. */
const SHARED_HOST =
	/^(?:youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|facebook\.com|instagram\.com|tiktok\.com|reddit\.com|npmjs\.com|jsr\.io|crates\.io|pypi\.org|huggingface\.co|bitbucket\.org|devpost\.com|dorahacks\.io|taikai\.network|figma\.com|bit\.ly)$/;

/**
 * The site an SCF page and a row share, as the logo repair reads it: the
 * same full host, a leading www aside. A registrable domain is not enough
 * here: two unrelated tenants of onrender.com or pages.dev share one, and a
 * subdomain can be another party's. Never a code host, a host that holds
 * many owners' pages (SHARED_HOST) or a third-party page.
 */
function sameHost(
	page: { website?: string | null },
	row: JoinRow,
): string | null {
	// urlHost, not a cut of the link's text: see its note. The domain is read
	// off the parsed host for the same reason.
	const host = urlHost(page.website);
	const domain = registrableDomain(host);
	return host &&
		host === urlHost(row.links?.website) &&
		!CODE_HOST.test(domain) &&
		!SHARED_HOST.test(domain) &&
		!isThirdPartyLink(String(page.website))
		? `site ${host}`
		: null;
}

/**
 * The GitHub owner and repository a link names, lowercased, or null. Stricter
 * than githubOwner: the link's host must be github.com as a URL parser reads
 * it (github.com inside a path or a query names nobody), and the owner must
 * be a login (parseGithubIdentity).
 */
function githubRef(
	link?: string | null,
): { owner: string; repo: string | null } | null {
	const url = parseLink(link);
	if (!url || urlHost(link) !== "github.com") return null;
	const seg = url.pathname.split("/").filter(Boolean);
	if (seg[0]?.toLowerCase() === "orgs") seg.shift();
	const id = parseGithubIdentity(`github.com/${seg.slice(0, 2).join("/")}`);
	if (!id.orgLogin) return null;
	const owner = id.orgLogin.toLowerCase();
	return {
		owner,
		repo: id.repo ? `${owner}/${id.repo.name.toLowerCase()}` : null,
	};
}

const rowGithub = (row: JoinRow) =>
	githubRef(row.links?.github) ?? githubRef(row.links?.website);

/**
 * The GitHub owners more than one project links (a lineage shadow and its
 * canonical row are one project). Measured 2026-11-14: 49, among them
 * stellar (11 projects), soneso (8) and creit-tech (6). Such an owner says
 * which organisation a page belongs to, not which of its projects.
 */
export function githubOwnersOfManyRows(rows: readonly JoinRow[]): Set<string> {
	const slugs = new Set(rows.map((r) => r.slug));
	const projects = new Map<string, Set<string>>();
	for (const r of rows) {
		const owner = rowGithub(r)?.owner;
		if (!owner) continue;
		const id =
			r.canonicalSlug && slugs.has(r.canonicalSlug) ? r.canonicalSlug : r.slug;
		projects.set(owner, (projects.get(owner) ?? new Set()).add(id));
	}
	return new Set(
		[...projects].filter(([, ids]) => ids.size > 1).map(([owner]) => owner),
	);
}

/**
 * The GitHub link that says an SCF page is this row's, or null: the same
 * owner when that owner is this project's alone, the same repository when
 * several projects link the owner (`ownersOfManyRows`).
 */
function sameGithub(
	page: { website?: string | null; github?: string | null },
	row: JoinRow,
	ownersOfManyRows: ReadonlySet<string>,
): string | null {
	const theirs = githubRef(page.github) ?? githubRef(page.website);
	const ours = rowGithub(row);
	if (!theirs || !ours || theirs.owner !== ours.owner) return null;
	if (!ownersOfManyRows.has(theirs.owner)) return `github ${theirs.owner}`;
	return theirs.repo && theirs.repo === ours.repo
		? `github ${theirs.repo}`
		: null;
}

/**
 * What says an SCF page is this row's own, or null: a reviewed join
 * (SCF_SLUG_OVERRIDES, SCF_PAGES_BEYOND_CAP), else a site on the same full
 * host (sameHost), else a GitHub owner or repository the two link
 * (sameGithub). The logo repair asks before it takes a page's image as a
 * row's logo: the page a row stores was often joined by name alone, and the
 * bridge row (bridge.xyz) stores "Bridge+Anchor XOF/USDC for lomi.". Stricter
 * than sharedLink, which the SCF sync still uses for pages outside the
 * listing. `ownersOfManyRows`: githubOwnersOfManyRows over every row.
 */
export function pageConfirmsRow(
	pageSlug: string,
	page: { website?: string | null; github?: string | null },
	row: JoinRow,
	ownersOfManyRows: ReadonlySet<string>,
): string | null {
	const reviewed = SCF_SLUG_OVERRIDES[pageSlug];
	if (
		(reviewed && (reviewed === row.slug || reviewed === row.canonicalSlug)) ||
		SCF_PAGES_BEYOND_CAP[row.slug] === pageSlug
	)
		return "a reviewed join";
	return sameHost(page, row) ?? sameGithub(page, row, ownersOfManyRows);
}

/**
 * The row an SCF page outside the listing joins (sls-116): a reviewed entry
 * (SCF_SLUG_OVERRIDES, SCF_PAGES_BEYOND_CAP), else the row the matcher joins
 * by name when the two share a link. Old pages often carry no link and many
 * names recur (SCF #2's StellarPay, Wally, Amber), so a name alone joins
 * nothing: the reason, and the row a person should check, come back instead.
 */
export function joinOffListing<R extends JoinRow>(
	page: {
		slug: string;
		title: string;
		website?: string | null;
		github?: string | null;
	},
	index: JoinIndex<R>,
): { row: R; how: string } | { row?: undefined; why: string; candidate?: R } {
	const reviewed =
		SCF_SLUG_OVERRIDES[page.slug] ?? BEYOND_CAP_BY_PAGE.get(page.slug);
	if (reviewed) {
		const row = index.bySlug.get(reviewed);
		return row
			? { row, how: "reviewed entry" }
			: { why: `its reviewed entry names ${reviewed}, which is no row` };
	}
	const named = matchListingRow(page, index);
	if (!named) return { why: "no row of the page's name" };
	const link = sharedLink(page, named);
	return link
		? { row: named, how: `name, ${link}` }
		: {
				why: "name only, no link the page and the row share",
				candidate: named,
			};
}

/**
 * Rows whose stored SCF award was copied from a page another project joins
 * this run (sls-116: one page, one row). The pre-2026-08-12 substring matcher
 * wrote Arculus's page and its SCF #30 award onto StellarPay ("stellarpay"
 * inside "Arculus x Stellar: Payments"); the arculus row carries that page,
 * and nothing re-read StellarPay, because the enrich only writes rows a page
 * joins. A row joined this run is rewritten from its own page instead, a
 * lineage shadow shares its canonical row's page, a human-verified record is
 * curate's, and a stored page no row joins stands, unread.
 */
export function strandedAwards<
	R extends JoinRow & {
		scf?: {
			awarded?: boolean | null;
			slug?: string | null;
			basis?: string | null;
			awardedRounds?: unknown[] | null;
		} | null;
	},
>(
	rows: readonly R[],
	joinedPage: ReadonlyMap<string, unknown>,
	joined: ReadonlySet<unknown>,
	identityOf: (row: R) => unknown,
): Array<{ row: R; page: string; owner: unknown }> {
	const out: Array<{ row: R; page: string; owner: unknown }> = [];
	for (const row of rows) {
		const page = row.scf?.slug;
		if (!page || row.scf?.basis === "human-verified") continue;
		if (!row.scf?.awarded && !row.scf?.awardedRounds?.length) continue;
		const id = identityOf(row);
		const owner = joinedPage.get(page);
		if (owner === undefined || owner === id || joined.has(id)) continue;
		if (SCF_SHARED_CLAIMS[row.slug]?.page === page) continue;
		out.push({ row, page, owner });
	}
	return out;
}

/**
 * Rows that keep an SCF award copied from a page another row joins, by a
 * reviewed decision (sls-116): the sync leaves both rows as they are, and the
 * round-count check counts the page's award once, on the row the page joins.
 */
export const SCF_SHARED_CLAIMS: Record<
	string,
	{ page: string; joinedTo: string; why: string }
> = {
	// "Peer (by Honeycoin)" funds Peer, HoneyCoin's app, which is the peer
	// row (usepeer.co); the page joins the company row, honey-coin
	// (SCF_SLUG_OVERRIDES). Which row carries the award is the owner's call
	// (improvements/TODO.md), so neither row changes until then.
	peer: {
		page: "peer-by-honeycoin-inz",
		joinedTo: "honey-coin",
		why: "product row or company row is an owner decision",
	},
};

/** The round-count check's rows: a shared claim (SCF_SHARED_CLAIMS) is the
 * same award as its page's own row, so it is not counted twice. */
export function countedRows<
	R extends {
		slug?: unknown;
		scf?: { slug?: string | null } | null;
		scfSourceUrl?: unknown;
	},
>(rows: readonly R[]): R[] {
	const PAGE = "https://communityfund.stellar.org/project/";
	const pageOf = (r: R) =>
		r.scf?.slug ??
		(typeof r.scfSourceUrl === "string" && r.scfSourceUrl.startsWith(PAGE)
			? r.scfSourceUrl.slice(PAGE.length)
			: null);
	// the claim holds only while the row stores the claim's page, as in
	// strandedAwards: a page of its own makes it a row like any other
	return rows.filter(
		(r) => SCF_SHARED_CLAIMS[String(r.slug)]?.page !== pageOf(r),
	);
}

/** Most stranded awards one run may remove without --allow-stranded. */
export const STRANDED_CEILING = 5;

/** Everything a sync run could not check: beyond-cap pages that did not
 * parse, pages on the round path not read, and joined pages not read. */
export function couldNotCheck(run: {
	beyondCap: readonly string[];
	roundPath: readonly string[];
	joinedPages: readonly string[];
}): string[] {
	return [...run.beyondCap, ...run.roundPath, ...run.joinedPages];
}

/** The stranded-award removals a run writes: none when the run could not
 * check something (a page it did not read may be the one that joins the row)
 * or when there are more than the ceiling, which reads as a join gone wrong
 * at scale (two were left on 2026-11-12), not as data. */
export function strandedWrites<T>(
	stranded: readonly T[],
	opts: {
		ceiling: number;
		/** --allow-stranded: must equal the count this run found, which says
		 *  the person read these removals and no others */
		allow?: number;
		couldNotCheck: readonly string[];
	},
): { write: T[]; refused: string | null } {
	const n = stranded.length;
	if (opts.couldNotCheck.length)
		return {
			write: [],
			refused: `the run could not check ${opts.couldNotCheck.length} page(s)`,
		};
	if (!Number.isInteger(opts.ceiling) || opts.ceiling < 0)
		return { write: [], refused: `the ceiling ${opts.ceiling} is not a count` };
	if (opts.allow !== undefined) {
		if (!Number.isInteger(opts.allow) || opts.allow < 0)
			return {
				write: [],
				refused: `--allow-stranded ${opts.allow} is not a count`,
			};
		if (opts.allow !== n)
			return {
				write: [],
				refused: `--allow-stranded ${opts.allow} names a different count from the ${n} this run found; read them and pass ${n}`,
			};
		return { write: [...stranded], refused: null };
	}
	if (n > opts.ceiling)
		return {
			write: [],
			refused: `${n} removals is over the ceiling of ${opts.ceiling}; rerun with --allow-stranded ${n} after reading them`,
		};
	return { write: [...stranded], refused: null };
}
