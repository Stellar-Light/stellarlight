/**
 * Which SCF page joins which directory row: the page-verified overrides and
 * the slug form enrich-from-scf.ts matches with, in one module tests can
 * read. No I/O.
 */
import {
	cleanTitle as cleanScfTitle,
	findTitlePrefixMatch,
	normSpaceless,
	stemSlugHash,
} from "../../src/lib/identity";
import { registrableDomain } from "../../src/lib/partner-project-identity";

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
	"greep-pos-greep-pay-hfe": "greeppay",
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
	// Canonical-vs-dupe routing (sls-043 close-out): official "Band Protocol"
	// exact-matches the band-protocol DUPE row by name; the CANONICAL slug is
	// `band`, which otherwise matches nothing and would keep stale data.
	"band-protocol-2ob": "band",
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
