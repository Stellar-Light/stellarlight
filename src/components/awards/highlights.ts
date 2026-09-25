/**
 * i³ Awards, nominee "2026 in review" highlights.
 *
 * Two kinds of entry live here:
 *   - the 2026 NOMINEES (imported 2026-09-23 from Emir's intake): each set is
 *     written from that project's own i³ submission, stage, category answers
 *     and figures are the project's statements, quoted faithfully, not
 *     verified by us. Numbers appear as an odometer only where the submission
 *     gave one.
 *   - the hidden test round's mock nominees (decaf, beans, …): qualitative and
 *     playful on purpose, no fabricated figures.
 * The shape is stable so a later `highlights` field on the AwardNominees
 * collection can drop straight in.
 */

export type HighlightKind = "growth" | "launch" | "reach" | "milestone";

/**
 * The mechanism drawn beside a moment (awards.css, "Highlight glyphs"), each
 * redrawn from yui540's gallery, page 4. Every moment names its own, chosen
 * for what the moment says and never for its kind: a kind-level default put
 * the same mark on every launch and every reach, which read as noise.
 */
export type HighlightGlyph =
	| "pour"
	| "flip"
	| "fan"
	| "fold"
	| "charge"
	| "mic"
	| "curtain"
	| "boil"
	| "tap"
	| "peel"
	| "torch"
	| "door"
	| "book"
	| "unbox"
	| "gather"
	| "orbit"
	| "snap"
	| "clink"
	| "download"
	| "pip"
	| "expand"
	| "puzzle"
	| "menu"
	| "dpad"
	| "share"
	| "press"
	| "reload"
	| "keypad"
	| "launch"
	| "layout"
	| "shutter"
	| "cards"
	| "focus"
	| "thataway"
	| "steps"
	| "domino"
	| "chain"
	| "memo"
	| "stamp"
	| "tab";

/**
 * An optional metric renders as a rolling-digit odometer that counts up when
 * the sheet opens. `grounded` marks values taken straight from the project's
 * blurb (e.g. "nearly 200 countries"); anything else is illustrative demo
 * momentum and must be replaced with real on-chain data before a public round.
 */
export interface HighlightMetric {
	value: number;
	prefix?: string;
	/** number-sized affix, e.g. "+" or "×". */
	suffix?: string;
	/** small unit/label rendered under the rolled number, e.g. "chains". */
	caption?: string;
}

export interface Highlight {
	kind: HighlightKind;
	/** The mechanism for this moment, chosen for what the moment says. */
	glyph: HighlightGlyph;
	headline: string;
	detail: string;
	metric?: HighlightMetric;
}

export const NOMINEE_HIGHLIGHTS: Record<string, Highlight[]> = {
	// ── Impact ──
	decaf: [
		{
			kind: "reach",
			glyph: "share",
			headline: "Cash-out reached further",
			detail: "Remittances landed in more corridors than ever before.",
			metric: { value: 200, caption: "countries" },
		},
		{
			kind: "launch",
			glyph: "tap",
			headline: "New off-ramps went live",
			detail: "More ways to turn USDC into money in a hand.",
		},
		{
			kind: "growth",
			glyph: "charge",
			headline: "Volume kept climbing",
			detail: "Everyday people moved more value home, month over month.",
		},
	],
	beans: [
		{
			kind: "growth",
			glyph: "gather",
			headline: "More families onboarded",
			detail: "Payments simple enough that nobody had to explain them.",
		},
		{
			kind: "launch",
			glyph: "fold",
			headline: "The app got simpler still",
			detail: "New flows that tuck the crypto completely out of sight.",
		},
		{
			kind: "milestone",
			glyph: "door",
			headline: "Stellar rails, made invisible",
			detail: "Money that just moves. No jargon, no friction.",
		},
	],
	elsa: [
		{
			kind: "reach",
			glyph: "download",
			headline: "Dollars reached more wallets",
			detail: "Savings that quietly outrun local inflation.",
		},
		{
			kind: "growth",
			glyph: "steps",
			headline: "Balances held their value",
			detail: "More paychecks kept their worth through the year.",
		},
		{
			kind: "launch",
			glyph: "unbox",
			headline: "New saving tools shipped",
			detail: "Everyday dollar accounts, a few taps away.",
		},
	],
	meru: [
		{
			kind: "reach",
			glyph: "pour",
			headline: "More freelancers got paid",
			detail: "A dollar account in every LatAm pocket.",
		},
		{
			kind: "growth",
			glyph: "thataway",
			headline: "Cross-border payouts climbed",
			detail: "Getting paid stopped meaning waiting on a bank.",
		},
		{
			kind: "launch",
			glyph: "door",
			headline: "New payout rails opened",
			detail: "More ways for the region to receive and spend.",
		},
	],
	// ── Innovation ──
	etherfuse: [
		{
			kind: "launch",
			glyph: "flip",
			headline: "Real-world yield, on-chain",
			detail: "Tokenized government bonds became a Stellar primitive.",
		},
		{
			kind: "growth",
			glyph: "tap",
			headline: "More yield flowed on-chain",
			detail: "TradFi returns, now composable with everything else.",
		},
		{
			kind: "milestone",
			glyph: "puzzle",
			headline: "Bridged TradFi and Stellar",
			detail: "The kind of asset a whole ecosystem can build on.",
		},
	],
	blend: [
		{
			kind: "growth",
			glyph: "expand",
			headline: "Liquidity kept compounding",
			detail: "Isolated pools drew deposits all year long.",
		},
		{
			kind: "launch",
			glyph: "layout",
			headline: "New pool primitives shipped",
			detail: "More ways to lend, borrow and wall off risk.",
		},
		{
			kind: "reach",
			glyph: "snap",
			headline: "Builders kept plugging in",
			detail: "Became a default money-market layer on Soroban.",
		},
	],
	sorobanhooks: [
		{
			kind: "launch",
			glyph: "boil",
			headline: "Contracts learned to react",
			detail: "Event-driven automation for Soroban went live.",
		},
		{
			kind: "growth",
			glyph: "domino",
			headline: "More hooks firing every week",
			detail: "Automations that let contracts answer the world.",
		},
		{
			kind: "milestone",
			glyph: "orbit",
			headline: "Made Soroban feel alive",
			detail: "Reactive infrastructure the ecosystem was missing.",
		},
	],
	// ── Interoperability ──
	defindex: [
		{
			kind: "launch",
			glyph: "press",
			headline: "Strategies became one-click",
			detail: "Whole DeFi indexes any wallet can embed.",
		},
		{
			kind: "reach",
			glyph: "puzzle",
			headline: "Plugged into more wallets",
			detail: "One integration, a shelf of strategies.",
		},
		{
			kind: "growth",
			glyph: "menu",
			headline: "More strategies indexed",
			detail: "A widening menu of ways to put capital to work.",
		},
	],
	allbridge: [
		{
			kind: "reach",
			glyph: "share",
			headline: "Connected more chains",
			detail: "Stellar liquidity flowed further out into the world.",
			metric: { value: 12, caption: "chains" },
		},
		{
			kind: "growth",
			glyph: "pour",
			headline: "Bridged volume climbed",
			detail: "Value came in, value went out, all year.",
		},
		{
			kind: "milestone",
			glyph: "focus",
			headline: "Stellar, on the bridge map",
			detail: "A dozen networks, one liquidity path.",
		},
	],
	"usdc-swap": [
		{
			kind: "reach",
			glyph: "layout",
			headline: "Five networks, one feel",
			detail: "Cross-chain USDC without the five-step headache.",
			metric: { value: 5, caption: "networks" },
		},
		{
			kind: "growth",
			glyph: "thataway",
			headline: "More USDC moved cross-chain",
			detail: "Stablecoin that treats chains like one network.",
		},
		{
			kind: "launch",
			glyph: "door",
			headline: "New routes went live",
			detail: "Shorter hops between where dollars live.",
		},
	],
	rubic: [
		{
			kind: "reach",
			glyph: "dpad",
			headline: "Chains on the map",
			detail: "And this year, Stellar joined the route.",
			metric: { value: 70, suffix: "+", caption: "chains" },
		},
		{
			kind: "growth",
			glyph: "menu",
			headline: "More routes aggregated",
			detail: "The best path found, wherever value needed to go.",
		},
		{
			kind: "launch",
			glyph: "thataway",
			headline: "Stellar routing shipped",
			detail: "A new lane into the ecosystem, opened up.",
		},
	],
	// ── 2026 nominations round, from each project's i³ submission ──
	// Impact
	abroad: [
		{
			kind: "growth",
			glyph: "pour",
			headline: "3,139 payments settled",
			detail:
				"About $314K paid from Stellar wallets and received as BRL and COP.",
			metric: { value: 3139, caption: "transactions" },
		},
		{
			kind: "launch",
			glyph: "press",
			headline: "PIX live at Meridian 2025",
			detail:
				"Attendees paid like locals in Brazil straight from Beans, Lobstr, Zypto and Freighter.",
		},
		{
			kind: "reach",
			glyph: "share",
			headline: "Two corridors, one flow",
			detail:
				"PIX in Brazil and Bre-B in Colombia; Stellar carries 91% of the volume.",
		},
	],
	agtrail: [
		{
			kind: "growth",
			glyph: "gather",
			headline: "6,000+ farmers and users",
			detail:
				"Across 25+ cooperatives and 150+ agribusiness partners in 8+ Nigerian states.",
			metric: { value: 6000, suffix: "+", caption: "farmers and users" },
		},
		{
			kind: "launch",
			glyph: "launch",
			headline: "Live on mainnet, May 2026",
			detail:
				"SCF #38 Build Award completed; a production app with measurable on-chain activity.",
		},
		{
			kind: "milestone",
			glyph: "download",
			headline: "Farmers paid in NGNC",
			detail:
				"Buyers settle verified trades on Stellar; farmers cash out to a Nigerian bank account.",
		},
	],
	bousol: [
		{
			kind: "growth",
			glyph: "chain",
			headline: "7,000+ funded wallets",
			detail:
				"About 150 new signups a day from Africa alone, on top of the Haiti and Caribbean base.",
			metric: { value: 7000, suffix: "+", caption: "funded wallets" },
		},
		{
			kind: "launch",
			glyph: "orbit",
			headline: "Sòl circles, on-chain",
			detail:
				"The rotating-savings tradition as a non-custodial USDC wallet with a verifiable record.",
		},
		{
			kind: "milestone",
			glyph: "puzzle",
			headline: "Registered MSB, real on-ramps",
			detail:
				"MoneyGram, Stripe and PayPal live, plus a signed TSA with MoneyGram.",
		},
	],
	fastbuka: [
		{
			kind: "growth",
			glyph: "shutter",
			headline: "More merchants, less commission",
			detail:
				"Low-cost rails keep more of each sale with neighbourhood vendors.",
		},
		{
			kind: "launch",
			glyph: "launch",
			headline: "Marketplace live on mainnet",
			detail:
				"Consumers, local merchants and couriers across Africa since February 2026.",
		},
		{
			kind: "milestone",
			glyph: "tap",
			headline: "Riders paid in under 60 seconds",
			detail: "Delivery earnings land the same day instead of weekly.",
		},
	],
	"coala-pay": [
		{
			kind: "growth",
			glyph: "download",
			headline: "2,955 people reached in Somalia",
			detail:
				"Funds delivered in under 24 hours, inside the critical 72-hour window.",
			metric: { value: 2955, caption: "people reached" },
		},
		{
			kind: "launch",
			glyph: "tap",
			headline: "Anticipatory aid went live",
			detail:
				"Smart-contract subgrants for NRC Somalia, triggered by weather data since late 2025.",
		},
		{
			kind: "milestone",
			glyph: "boil",
			headline: "Over $1M standing by",
			detail:
				"WFP funds on Stellar release the moment a pre-disaster threshold is crossed, for 39,610 people.",
		},
	],
	codelnpay: [
		{
			kind: "growth",
			glyph: "expand",
			headline: "70,000+ young Africans reached",
			detail: "Training, quests, hackathons and job placement since inception.",
			metric: { value: 70000, suffix: "+", caption: "young people reached" },
		},
		{
			kind: "milestone",
			glyph: "orbit",
			headline: "Two years live on Stellar",
			detail:
				"Cross-border payroll so remote workers keep what employers abroad pay them.",
		},
		{
			kind: "reach",
			glyph: "peel",
			headline: "Income without the cuts",
			detail:
				"Stablecoin salaries land on-chain, lifting household income in overlooked regions.",
		},
	],
	domipago: [
		{
			kind: "growth",
			glyph: "charge",
			headline: "5,600+ transactions",
			detail:
				"More than $1.5M moved on the U.S. to Dominican Republic corridor since November 2023.",
			metric: { value: 5600, suffix: "+", caption: "transactions" },
		},
		{
			kind: "launch",
			glyph: "curtain",
			headline: "Mainnet on Stellar, July 2026",
			detail:
				"SCF Build Award completed; production hardening for end-to-end payouts in the DR.",
		},
		{
			kind: "milestone",
			glyph: "pip",
			headline: "Remittances inside WhatsApp",
			detail:
				"Recipients request and receive money in the channel families already use.",
		},
	],
	findtruman: [
		{
			kind: "growth",
			glyph: "layout",
			headline: "Building on Stellar since 2024",
			detail:
				"Creator incentives, copyright records and player reputation, all live.",
		},
		{
			kind: "launch",
			glyph: "memo",
			headline: "Games from a sentence",
			detail:
				"An agentic framework turns natural-language ideas into playable 3D games in hours.",
		},
		{
			kind: "reach",
			glyph: "keypad",
			headline: "Web2 sign-in, on-chain ownership",
			detail:
				"Google login with an automatically linked Stellar address; assets recorded on-chain.",
		},
	],
	"freedom-pay-wallet": [
		{
			kind: "growth",
			glyph: "pour",
			headline: "$100,000 USDC in aid delivered",
			detail:
				"To more than 1,200 people in The Gambia, Tanzania, Uganda and Ethiopia.",
			metric: { value: 100000, prefix: "$", caption: "USDC delivered as aid" },
		},
		{
			kind: "reach",
			glyph: "cards",
			headline: "Aid that becomes access",
			detail:
				"Cash-out, airtime, utilities, gift cards and a prepaid Visa from one wallet.",
		},
		{
			kind: "milestone",
			glyph: "shutter",
			headline: "Women entrepreneurs funded",
			detail:
				"Grants in Uganda helped recipients restock, start and grow small businesses.",
		},
	],
	giveth: [
		{
			kind: "growth",
			glyph: "download",
			headline: "Every donation arrives in full",
			detail:
				"No platform fee, so grassroots projects anywhere can fundraise without a bank.",
		},
		{
			kind: "launch",
			glyph: "expand",
			headline: "Stellar QF round in 2025",
			detail:
				"SDF-matched quadratic funding where donors decided which projects got matched.",
		},
		{
			kind: "milestone",
			glyph: "focus",
			headline: "Scan and give",
			detail: "Donate on Stellar by QR code: no wallet connection, no account.",
		},
	],
	jetpad: [
		{
			kind: "growth",
			glyph: "chain",
			headline: "Nigeria, Kenya and Ghana live",
			detail: "Hold dollars, pay bills, cash out to a bank or mobile money.",
		},
		{
			kind: "launch",
			glyph: "launch",
			headline: "iOS app shipped October 2025",
			detail:
				"Then KYC and referrals, fiat pay to naira, and XLM for airtime and data.",
		},
		{
			kind: "milestone",
			glyph: "peel",
			headline: "No seed phrase, no gas",
			detail:
				"Email or biometrics; JetPad sponsors the fees and the USDC trustline.",
		},
	],
	liqvidxyz: [
		{
			kind: "growth",
			glyph: "cards",
			headline: "$10.13M of RWAs issued on Stellar",
			detail: "Two deals, zero defaults, verified on RWA.xyz and RWA.io.",
			metric: {
				value: 10,
				prefix: "$",
				suffix: "M+",
				caption: "tokenized assets issued",
			},
		},
		{
			kind: "launch",
			glyph: "clink",
			headline: "First issuance closed at $5.75M",
			detail: "Nearly double the volume committed in the SCF grant.",
		},
		{
			kind: "milestone",
			glyph: "steps",
			headline: "Second deal, no grant behind it",
			detail: "$4.3M closed after the award ended.",
		},
	],
	"public-node": [
		{
			kind: "growth",
			glyph: "mic",
			headline: "A nonprofit voice in governance",
			detail:
				"The only 501(c)(3) dedicated to Stellar, weighing in on quorum and consensus.",
		},
		{
			kind: "milestone",
			glyph: "orbit",
			headline: "Seven years of uptime",
			detail:
				"Independent Tier 1 validation since the first Meridian in Mexico City.",
		},
		{
			kind: "reach",
			glyph: "keypad",
			headline: "Recovery you don't have to trust",
			detail:
				"An independent participant in decentralized wallet recovery for Beans users.",
		},
	],
	rahat: [
		{
			kind: "growth",
			glyph: "mic",
			headline: "14,032 people warned before floods",
			detail: "SMS and voice early warnings across Nepal's Terai river basins.",
			metric: { value: 14032, caption: "people warned" },
		},
		{
			kind: "launch",
			glyph: "chain",
			headline: "Stellar since July 2025",
			detail:
				"From one municipality to more than 15, with the Nepal Red Cross and Mercy Corps.",
		},
		{
			kind: "milestone",
			glyph: "shutter",
			headline: "$200K+ of aid, 180+ local vendors",
			detail:
				"Relief spent in the community, with 40 women-run vendors on the network.",
		},
	],
	"stellar-passport": [
		{
			kind: "growth",
			glyph: "stamp",
			headline: "71 events run on Passport",
			detail:
				"15 country organizations and 19 ambassador chapters on one platform.",
			metric: { value: 71, caption: "events" },
		},
		{
			kind: "launch",
			glyph: "domino",
			headline: "Live since Meridian 2025",
			detail:
				"More than 2,500 challenges completed with passkey smart wallets and on-chain stamps.",
		},
		{
			kind: "reach",
			glyph: "focus",
			headline: "No app, no seed phrase",
			detail:
				"Join with a fingerprint or face scan; organizers get a no-code admin panel.",
		},
	],
	"stellar-security-portal": [
		{
			kind: "growth",
			glyph: "torch",
			headline: "840 findings, searchable",
			detail: "From 60 audit reports across 52 protocols, classified and free.",
			metric: { value: 840, caption: "vulnerability findings" },
		},
		{
			kind: "launch",
			glyph: "curtain",
			headline: "Public since July 2025",
			detail:
				"Born as Soroban Security Portal, serving the ecosystem for over a year.",
		},
		{
			kind: "reach",
			glyph: "book",
			headline: "Security knowledge for small teams",
			detail:
				"Learn from audits others paid for before spending a dollar on your own.",
		},
	],
	"token-terminal": [
		{
			kind: "growth",
			glyph: "layout",
			headline: "42 standardized Stellar metrics",
			detail:
				"Chain and app dashboards outside the paywall since September 2025.",
			metric: { value: 42, caption: "metrics" },
		},
		{
			kind: "milestone",
			glyph: "steps",
			headline: "#4 globally for tokenized funds",
			detail:
				"$3.22B in tokenized fund market cap, ahead of Solana and Avalanche.",
		},
		{
			kind: "reach",
			glyph: "tab",
			headline: "Same data in Lagos and on Bloomberg",
			detail:
				"Institutional-grade financials, free, so the inclusion case rests on evidence.",
		},
	],
	tucambio: [
		{
			kind: "growth",
			glyph: "charge",
			headline: "14,024 transactions",
			detail: "580 Stellar wallets created, as of September 2026.",
			metric: { value: 14024, caption: "transactions" },
		},
		{
			kind: "launch",
			glyph: "domino",
			headline: "Build Award completed June 2026",
			detail: "SCF #37 from MVP to testnet to mainnet; live on Stellar since.",
		},
		{
			kind: "reach",
			glyph: "fold",
			headline: "Dollars that wait for you",
			detail:
				"Receive USDC, hold value, convert only when spending, even under 387% inflation.",
		},
	],
	// Innovation
	centiiv: [
		{
			kind: "growth",
			glyph: "domino",
			headline: "Building on Stellar since 2022",
			detail: "Sourcing, matching and payment execution in a single workflow.",
		},
		{
			kind: "launch",
			glyph: "tap",
			headline: "Liquidity on demand",
			detail:
				"Pick verified providers by currency, price and settlement speed through one integration.",
		},
		{
			kind: "reach",
			glyph: "door",
			headline: "Emerging markets, made viable",
			detail:
				"Lower cost of expansion for fintechs facing FX and compliance bottlenecks.",
		},
	],
	eara: [
		{
			kind: "growth",
			glyph: "door",
			headline: "Regulated Europe, on Stellar",
			detail:
				"Institutional rails for tokenized investment products, backed by a licensed securities agency.",
		},
		{
			kind: "launch",
			glyph: "flip",
			headline: "CompliantID",
			detail:
				"A privacy-first KYC passport that verifies eligibility without personal data on-chain.",
		},
		{
			kind: "milestone",
			glyph: "keypad",
			headline: "Secure Custodian",
			detail:
				"Multisignature governance for critical operations on regulated assets.",
		},
	],
	inference: [
		{
			kind: "growth",
			glyph: "domino",
			headline: "Five releases in nine weeks",
			detail:
				"v0.0.1 shipped May 2026: compiler, CLI, docs and a VS Code extension.",
		},
		{
			kind: "launch",
			glyph: "memo",
			headline: "Specs a developer can write",
			detail:
				"Rust-like syntax compiled through WebAssembly into Rocq proof obligations.",
		},
		{
			kind: "reach",
			glyph: "torch",
			headline: "Prove absence, not just presence",
			detail:
				"Specification-first development that slots into audit preparation.",
		},
	],
	irl: [
		{
			kind: "growth",
			glyph: "share",
			headline: "A loyalty network across cities",
			detail:
				"Venues, promoters, festivals and artists share one portable record of participation.",
		},
		{
			kind: "launch",
			glyph: "steps",
			headline: "Build Award, all three tranches",
			detail:
				"City guides, check-ins, loyalty, embedded wallets and stablecoin payments, live.",
		},
		{
			kind: "milestone",
			glyph: "fan",
			headline: "Featured by Stellar",
			detail:
				"Bringing culture onchain, invisibly: rewards and payments that feel like a normal app.",
		},
	],
	"rivool-finance": [
		{
			kind: "growth",
			glyph: "gather",
			headline: "40,000 advisors, one gap",
			detail:
				"Dollar accounts, yield, tokenized assets and payments through the advisor's own relationship.",
		},
		{
			kind: "launch",
			glyph: "shutter",
			headline: "Mainnet since December 2025",
			detail: "An on-chain neobank for financial advisors in Brazil.",
		},
		{
			kind: "milestone",
			glyph: "snap",
			headline: "Fees settled by smart contract",
			detail:
				"Advisory fees and revenue splits settle per client on Soroban, no custodian in between.",
		},
	],
	"soroban-resource-usage-reporter": [
		{
			kind: "growth",
			glyph: "expand",
			headline: "Growing into Blocksmith",
			detail:
				"An all-in-one Soroban toolkit from local testing to source verification, in private beta.",
		},
		{
			kind: "launch",
			glyph: "charge",
			headline: "Live since January 2025",
			detail:
				"CPU, memory and ledger reads and writes reported before a contract hits a limit.",
		},
		{
			kind: "milestone",
			glyph: "reload",
			headline: "Rebuilt in Rust",
			detail:
				"Runs inside a standard contract test suite; began on npm as @57block/stellar-resource-usage.",
		},
	],
	stellarchain: [
		{
			kind: "growth",
			glyph: "book",
			headline: "Twelve years of Stellar history",
			detail:
				"An explorer live since 2014, now covering Mainnet, Testnet and Futurenet.",
		},
		{
			kind: "launch",
			glyph: "layout",
			headline: "Classic and Soroban in one view",
			detail:
				"Contract events, storage, metadata and source verification beside ledgers and markets.",
		},
		{
			kind: "reach",
			glyph: "flip",
			headline: "Soroban Auditor, open source",
			detail:
				"Reconstructs source-like Rust from compiled WASM when the original is unavailable.",
		},
	],
	tansu: [
		{
			kind: "growth",
			glyph: "book",
			headline: "Built for the Cyber Resilience Act",
			detail:
				"A public place for the approved commit, its SBOM and CVE scans, readable by any auditor.",
		},
		{
			kind: "launch",
			glyph: "launch",
			headline: "Mainnet since October 2025",
			detail:
				"On testnet since May 2024; SCF membership NFT and Public Goods deployments added in 2026.",
		},
		{
			kind: "milestone",
			glyph: "stamp",
			headline: "Commits approved on-chain",
			detail:
				"A project's own decision to release, recorded on a public chain, independent of the forge.",
		},
	],
	"volta-circuit": [
		{
			kind: "growth",
			glyph: "orbit",
			headline: "Live across chains since 2023",
			detail:
				"The Gnosis Safe model, brought to Stellar under an SDF Integration Support Grant.",
		},
		{
			kind: "launch",
			glyph: "keypad",
			headline: "Multisig on Soroban, in production",
			detail:
				"Role-based permissions, policy controls and SDK automation, with public developer docs.",
		},
		{
			kind: "reach",
			glyph: "puzzle",
			headline: "Custody's complement",
			detail:
				"Contract-callable multisig for protocols expanding from EVM to Stellar.",
		},
	],
	"webacy-inc": [
		{
			kind: "growth",
			glyph: "reload",
			headline: "Billions protected since 2021",
			detail:
				"Hundreds of security, compliance and market signals, updated as conditions change.",
		},
		{
			kind: "launch",
			glyph: "puzzle",
			headline: "Stellar integration live, May 2026",
			detail:
				"Live risk scores across wallets, transactions, contracts, protocols and assets.",
		},
		{
			kind: "reach",
			glyph: "torch",
			headline: "Risk checks agents can call",
			detail:
				"APIs and agent tooling that allow, block or escalate before a transaction happens.",
		},
	],
	// Interoperability
	blux: [
		{
			kind: "growth",
			glyph: "chain",
			headline: "300+ accounts signed in",
			detail:
				"July to September 2026; one integration onboarded 100+ users with passkeys.",
			metric: { value: 300, suffix: "+", caption: "sign-ins" },
		},
		{
			kind: "launch",
			glyph: "keypad",
			headline: "Mainnet since March 2025",
			detail:
				"Email, social and passkey login, or an existing wallet, through one SDK.",
		},
		{
			kind: "reach",
			glyph: "cards",
			headline: "One integration, every wallet",
			detail:
				"JavaScript and React SDKs for signing, balances and on/off-ramp flows.",
		},
	],
	reflector: [
		{
			kind: "growth",
			glyph: "focus",
			headline: "$200M+ TVL secured",
			detail: "Live on mainnet since April 2024, in development since 2022.",
			metric: { value: 200, prefix: "$", suffix: "M+", caption: "TVL secured" },
		},
		{
			kind: "milestone",
			glyph: "share",
			headline: "The default oracle for Blend",
			detail:
				"Also Etherfuse, OrbitCDP, DeFindex, Laina, EquitX and SorobanDomains.",
		},
		{
			kind: "reach",
			glyph: "gather",
			headline: "Consensus by the community",
			detail:
				"Script3, CreitTech, UltraStellar, xyclooLabs, PublicNode, LightSail and StellarExpert.",
		},
	],
	rozo: [
		{
			kind: "growth",
			glyph: "domino",
			headline: "18,500+ Stellar transactions sponsored",
			detail: "A core cross-chain route measures a P95 of about 10 seconds.",
			metric: { value: 18500, suffix: "+", caption: "transactions sponsored" },
		},
		{
			kind: "launch",
			glyph: "unbox",
			headline: "Checkout, CLI, npm and agent skill",
			detail: "Pay from Stellar even when the merchant settles on Base.",
		},
		{
			kind: "reach",
			glyph: "focus",
			headline: "Scan to pay, any network",
			detail:
				"SEP-7, Solana Pay, EVM requests and plain addresses in one wallet.",
		},
	],
	seevcash: [
		{
			kind: "growth",
			glyph: "steps",
			headline: "$3.4M in total volume",
			detail:
				"Five consecutive quarters of growth since launching in October 2024.",
			metric: { value: 3, prefix: "$", suffix: "M+", caption: "total volume" },
		},
		{
			kind: "launch",
			glyph: "cards",
			headline: "Visa card fully live",
			detail:
				"Beta in July 2026, $18,500 transacted, then general availability in September.",
		},
		{
			kind: "reach",
			glyph: "thataway",
			headline: "US dollars to MTN Mobile Money",
			detail:
				"Bridge, OwlPay and BlindPay route value through Stellar into Ghana; SeevPlus sends cedis out.",
		},
	],
	swiftex: [
		{
			kind: "growth",
			glyph: "charge",
			headline: "1,568 transactions in 30 days",
			detail: "About $103K of volume across iOS, Android and web.",
			metric: { value: 1568, caption: "transactions, last 30 days" },
		},
		{
			kind: "launch",
			glyph: "gather",
			headline: "Eight chains into Stellar",
			detail:
				"NEAR Intents bridging; account creation and the trustline inside the same flow.",
		},
		{
			kind: "reach",
			glyph: "download",
			headline: "146 bridges, 243 trustlines",
			detail:
				"Capital and accounts arriving on Stellar from five EVM chains in one month.",
		},
	],
	"trustless-work": [
		{
			kind: "growth",
			glyph: "pour",
			headline: "$258,102 released through escrows",
			detail:
				"Stablecoin value released on mainnet across 1,285 escrows, per the project's own Dune dashboard, September 2026.",
			metric: { value: 258102, prefix: "$", caption: "released on mainnet" },
		},
		{
			kind: "launch",
			glyph: "launch",
			headline: "Live on mainnet since November 2025",
			detail:
				"Milestone-based escrow through APIs, SDKs and open-source templates, with no smart contract to write; now on the SCF Integration Track.",
		},
		{
			kind: "milestone",
			glyph: "chain",
			headline: "A builder ecosystem around escrow",
			detail:
				"OfferHub, Mercato, ArcusX, Boundless and KindFi build on its escrows; one Boundless hackathon with 114 participants showcased 31 more products.",
		},
	],
};

export function highlightsFor(slug: string): Highlight[] {
	return NOMINEE_HIGHLIGHTS[slug] ?? [];
}
