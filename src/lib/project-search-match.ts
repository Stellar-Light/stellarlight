/**
 * Project-search matching primitives — the retrieval half of
 * /api/projects/search, extracted so the admission/scoring rules are unit
 * testable (they decide whether a project is even a candidate, which is where
 * recall misses like Etherfuse and Sushi originated).
 *
 * The governing principle, learned from sls-018: STRUCTURED TRUTH (a project's
 * `types` and curated `coverage`) is stronger evidence of relevance than prose
 * token overlap, so it must drive INCLUSION — not just ranking. Before this,
 * a project was a candidate only if its name/description/category contained the
 * query words; a multi-product issuer whose prose is about its primary product
 * (Etherfuse → Stablebonds) never surfaced for its secondary capability (a
 * Mexico/MXN on-ramp) even though its `coverage` literally named the corridor.
 */

// Synonym + light-stem expansion so natural queries reach records described in
// adjacent vocabulary the literal `like` would miss: "game" → "gaming"/"GameFi",
// "dex" → "amm"/"swap", "pool" → "liquidity", "on-ramp" → "anchor". Each query
// token expands to a term set; a record matches the token if ANY term hits its
// text. Keeps recall high on single-word category queries without a vector pass.
import { contentTokens } from "./repo-search";

export const SYNONYMS: Record<string, string[]> = {
	wallet: ["wallet", "custody", "signer", "keystore"],
	dex: ["dex", "amm", "swap", "exchange", "orderbook", "liquidity"],
	amm: ["amm", "liquidity", "pool", "swap", "dex"],
	swap: ["swap", "dex", "amm", "exchange", "liquidity"],
	// pool/liquidity cross-map: Sushi's record says "liquidity provision", the
	// query said "liquidity pool" — one missing literal word ("pool") dropped a
	// battle-tested DEX from a strict AMM query (sls-019).
	pool: ["pool", "liquidity", "amm", "dex", "swap"],
	liquidity: ["liquidity", "pool", "amm", "dex", "swap"],
	lending: ["lending", "lend", "borrow", "loan", "money market"],
	lend: ["lend", "lending", "borrow", "loan"],
	borrow: ["borrow", "borrowing", "lend", "lending", "loan"],
	oracle: ["oracle", "price feed", "data feed", "feed"],
	bridge: ["bridge", "cross-chain", "interoperability", "cctp", "wrapped"],
	// Chain-name vocabulary: bridge/multichain records say "EVM" or "cross-chain";
	// users name the chain ("Ethereum", "Polygon"). Both directions mapped so
	// "move tokens from Ethereum to Stellar" reaches Allbridge/CCTP-class records
	// whose prose never contains the literal chain name (Beacon Q3 feedback).
	evm: ["evm", "ethereum", "erc-20", "erc20", "cross-chain", "bridge"],
	ethereum: ["ethereum", "evm", "erc-20", "eth", "cross-chain", "bridge"],
	polygon: ["polygon", "evm", "cross-chain"],
	arbitrum: ["arbitrum", "evm", "cross-chain"],
	cctp: ["cctp", "cross-chain transfer protocol", "circle", "usdc", "bridge"],
	stablecoin: ["stablecoin", "stable", "usdc", "eurc"],
	staking: ["staking", "stake", "yield", "apy", "earn"],
	yield: ["yield", "apy", "earn", "staking", "vault"],
	nft: ["nft", "collectible", "collectibles", "mint"],
	gaming: ["gaming", "game", "gamefi", "play-to-earn", "play2earn"],
	game: ["game", "gaming", "gamefi", "play-to-earn"],
	// Ramp/anchor vertical. "on-ramp"/"off-ramp"/"fiat"/"cash-in" all map onto
	// the anchor/ramp/SEP vocabulary records and coverage use, so a corridor
	// query reaches issuers whose prose never says "anchor" (sls-018).
	anchor: [
		"anchor",
		"on-ramp",
		"off-ramp",
		"ramp",
		"sep-24",
		"sep24",
		"sep-6",
		"sep6",
		"fiat",
	],
	"on-ramp": [
		"on-ramp",
		"onramp",
		"anchor",
		"ramp",
		"fiat",
		"cash-in",
		"deposit",
	],
	onramp: ["onramp", "on-ramp", "anchor", "ramp", "fiat", "deposit"],
	"off-ramp": [
		"off-ramp",
		"offramp",
		"anchor",
		"ramp",
		"fiat",
		"cash-out",
		"withdraw",
	],
	offramp: ["offramp", "off-ramp", "anchor", "ramp", "fiat", "withdraw"],
	ramp: ["ramp", "on-ramp", "off-ramp", "anchor", "fiat"],
	fiat: ["fiat", "anchor", "ramp", "on-ramp", "off-ramp"],
	remittance: [
		"remittance",
		"cross-border",
		"money transfer",
		"send money",
		"payout",
	],
	// Region umbrellas → the country vocabulary records actually use. Raven's
	// launch demo ("LatAm asset issuers") missed PagFinance/CashAbroad because
	// their records say "Brazil"/"Mexico", never the umbrella term "LatAm".
	latam: [
		"latam",
		"latin america",
		"brazil",
		"brazilian",
		"mexico",
		"mexican",
		"argentina",
		"colombia",
		"chile",
		"peru",
	],
	africa: ["africa", "african", "nigeria", "kenya", "ghana", "south africa"],
	asia: [
		"asia",
		"asian",
		"india",
		"indian",
		"philippines",
		"indonesia",
		"vietnam",
		"singapore",
	],
	europe: ["europe", "european", "eu"],
	payments: ["payments", "payment", "checkout", "merchant", "settlement"],
	indexer: ["indexer", "indexing", "data pipeline", "subgraph", "etl"],
	rpc: ["rpc", "node", "endpoint", "horizon"],
	sdk: ["sdk", "library", "client library", "kit"],
	explorer: ["explorer", "block explorer"],
	faucet: ["faucet", "friendbot"],
	identity: ["identity", "kyc", "did", "credential", "compliance"],
	governance: ["governance", "dao", "voting"],
	custody: ["custody", "custodial", "mpc", "multisig", "key management"],
	domains: ["domains", "domain", "name service", "naming"],
	rwa: [
		"rwa",
		"real world asset",
		"real-world asset",
		"tokenized",
		"tokenization",
	],
	// Machine/agent payments (x402). Expand to the phrases real records actually
	// use — ApiCharge says "pay-per-call"/"API monetization", Benkiko says
	// "micropayment" — never the literal "x402". Keep to specific phrases, not
	// bare "api"/"payment", to avoid pulling in generic infra/payments projects.
	x402: [
		"x402",
		"pay-per-call",
		"pay per call",
		"api monetization",
		"micropayment",
		"metered",
		"machine payment",
		"agentic payment",
		"agent payment",
	],
	micropayment: [
		"micropayment",
		"micro-payment",
		"pay-per-call",
		"x402",
		"metered",
	],
	mpp: [
		"mpp",
		"machine payment",
		"machine-to-machine",
		"x402",
		"agentic payment",
	],
	agentic: [
		"agentic",
		"agent payment",
		"agentic payment",
		"x402",
		"machine payment",
	],
	// ROSCA / rotating-savings. Lul's description says "ROSCA", Vaquita is a
	// rotating-savings product; the regional names (susu/chama/stokvel/…) appear
	// in queries but not descriptions, so map them onto the terms records use.
	rosca: [
		"rosca",
		"rotating savings",
		"savings group",
		"savings circle",
		"susu",
		"esusu",
		"chama",
		"stokvel",
		"tanda",
		"ajo",
	],
	chama: ["chama", "rosca", "rotating savings", "savings group"],
	susu: ["susu", "esusu", "rosca", "rotating savings"],
	esusu: ["esusu", "susu", "rosca", "rotating savings"],
	stokvel: ["stokvel", "rosca", "rotating savings", "savings group"],
	tanda: ["tanda", "rosca", "rotating savings", "savings circle"],
};

export function termsForToken(t: string): string[] {
	const out = new Set<string>([t]);
	if (t.length > 4 && t.endsWith("s")) out.add(t.slice(0, -1)); // plural
	if (t.length > 5 && t.endsWith("ing")) out.add(t.slice(0, -3)); // gerund
	for (const syn of SYNONYMS[t] ?? []) out.add(syn);
	return [...out];
}

// Stopword-filtered tokenization SHARED with repo search (contentTokens):
// natural-question filler ("from", "to", "what", "best") must not score as
// query terms — it let a wallet whose description merely contains "from"
// outrank the actual bridges on "move tokens from Ethereum to Stellar".
// contentTokens keeps the raw tokens when a query is ALL stopwords.
export function tokenize(q: string): string[] {
	return contentTokens(q);
}

// Map a query token to the `types` value it implies, so ranking + admission can
// treat a record that IS the queried category as more relevant than one that
// merely mentions it. Prominence is global; this scopes it to intent.
export const INTENT_TYPE: Record<string, string> = {
	wallet: "Wallet",
	dex: "DEX",
	amm: "DEX",
	swap: "DEX",
	pool: "DEX",
	liquidity: "DEX",
	lending: "Lending",
	lend: "Lending",
	borrow: "Lending",
	bridge: "Bridge",
	payments: "Payments",
	payment: "Payments",
	remittance: "Payments",
	x402: "Payments",
	mpp: "Payments",
	micropayment: "Payments",
	anchor: "Anchor",
	"on-ramp": "Anchor",
	onramp: "Anchor",
	"off-ramp": "Anchor",
	offramp: "Anchor",
	ramp: "Anchor",
	sdk: "SDK",
	indexer: "Indexer",
	explorer: "Explorer",
	rpc: "RPC",
	node: "RPC",
	faucet: "Faucet",
	nft: "NFT",
	rwa: "RWA",
	gaming: "Gaming",
	game: "Gaming",
	stablecoin: "Stablecoin",
};

export function intentTypesFor(tokens: string[]): Set<string> {
	const s = new Set<string>();
	for (const t of tokens) {
		if (INTENT_TYPE[t]) s.add(INTENT_TYPE[t]);
		for (const syn of SYNONYMS[t] ?? [])
			if (INTENT_TYPE[syn]) s.add(INTENT_TYPE[syn]);
	}
	return s;
}

// Ramp/anchor/corridor intent vocabulary. A query carrying any of these (direct
// or via synonym) is asking about fiat ramps/anchors, which is when curated
// `coverage` becomes a first-class retrieval signal (vs. a topic query where a
// stray "usd" shouldn't drag in every anchor).
export const RAMP_VOCAB = new Set([
	"anchor",
	"on-ramp",
	"off-ramp",
	"onramp",
	"offramp",
	"ramp",
	"ramps",
	"fiat",
	"cash-in",
	"cash-out",
	"cashin",
	"cashout",
	"deposit",
	"withdraw",
	"withdrawal",
	"sep-6",
	"sep6",
	"sep-24",
	"sep24",
	"sep-31",
	"sep31",
	"corridor",
]);

export function isRampIntent(tokens: string[]): boolean {
	return tokens.some(
		(t) => RAMP_VOCAB.has(t) || termsForToken(t).some((v) => RAMP_VOCAB.has(v)),
	);
}

// Coverage/type-carrying shape shared by keyword rows. Kept loose so callers can
// pass raw Payload docs or mapped rows.
export interface MatchableProject {
	name?: string | null;
	shortDescription?: string | null;
	category?: string | null;
	types?: string[] | null;
	supportedNetworks?: string[] | null;
	coverage?: {
		countries?: string[] | null;
		currencies?: string[] | null;
		seps?: string[] | null;
	} | null;
}

function covValues(p: MatchableProject): string[] {
	const c = p.coverage;
	if (!c || typeof c !== "object") return [];
	const arr = (v: unknown): string[] =>
		Array.isArray(v)
			? v.filter((x): x is string => typeof x === "string" && !!x)
			: [];
	return [...arr(c.countries), ...arr(c.currencies), ...arr(c.seps)];
}

// The searchable text for a project. Beyond prose (name/description/category) it
// folds in STRUCTURED truth — `types`, `supportedNetworks`, and curated coverage
// values — so a record surfaces for a query its prose doesn't literally contain
// but its structured data does. Coverage PRESENCE additionally implies anchor/
// ramp capability (coverage is only synced onto records that matched an anchor
// partner), so we inject the ramp identity vocabulary for any covered project —
// that is what lets a multi-product issuer answer a generic ramp query.
const COVERAGE_IMPLIES = [
	"anchor",
	"on-ramp",
	"off-ramp",
	"ramp",
	"fiat",
	"deposit",
	"withdraw",
];
export function buildHaystack(p: MatchableProject): string {
	const cov = covValues(p);
	const covText = cov.length ? [...cov, ...COVERAGE_IMPLIES].join(" ") : "";
	const types = Array.isArray(p.types) ? p.types.join(" ") : "";
	const nets = Array.isArray(p.supportedNetworks)
		? p.supportedNetworks.join(" ")
		: "";
	return `${p.name ?? ""} ${p.shortDescription ?? ""} ${p.category ?? ""} ${types} ${nets} ${covText}`.toLowerCase();
}

// Prose+structured keyword score: how many query tokens hit the haystack (each
// token counts once, via any of its expanded terms).
export function scoreTokens(hay: string, tokens: string[]): number {
	if (!tokens.length) return 1;
	return tokens.reduce(
		(s, t) => s + (termsForToken(t).some((v) => hay.includes(v)) ? 1 : 0),
		0,
	);
}

// Does the record's own `types` match the query's implied category?
export function typeMatch(
	p: MatchableProject,
	intentTypes: Set<string>,
): boolean {
	return (
		intentTypes.size > 0 && (p.types ?? []).some((t) => intentTypes.has(t))
	);
}

// Does the project's curated coverage serve a queried country / currency / SEP?
// High-precision: true only when a query token literally matches a structured
// coverage value. This is what admits a corridor match prose scoring misses.
export function corridorMatch(p: MatchableProject, tokens: string[]): boolean {
	const vals = new Set(covValues(p).map((s) => s.toLowerCase()));
	if (!vals.size) return false;
	return tokens.some((t) => termsForToken(t).some((v) => vals.has(v)));
}

// A structured relevance hit: the record IS the queried category, OR its
// coverage serves a queried corridor under ramp intent. Structured truth is
// stronger evidence than one extra prose word, so callers admit a structured
// hit one match-tier looser than prose-token-count alone (fixes Sushi's
// strict-AND near-miss and Etherfuse's corridor miss in one rule).
export function structuredHit(
	p: MatchableProject,
	intentTypes: Set<string>,
	tokens: string[],
	rampIntent: boolean,
): boolean {
	if (typeMatch(p, intentTypes)) return true;
	if (rampIntent && corridorMatch(p, tokens)) return true;
	return false;
}
