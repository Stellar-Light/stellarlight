/**
 * i³ Awards — nominee "2026 in review" highlights.
 *
 * Two kinds of entry live here:
 *   - the 2026 NOMINEES (imported 2026-09-23 from Emir's intake): each set is
 *     written from that project's own i³ submission — stage, category answers
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
	headline: string;
	detail: string;
	metric?: HighlightMetric;
}

export const NOMINEE_HIGHLIGHTS: Record<string, Highlight[]> = {
	// ── Impact ──
	decaf: [
		{
			kind: "reach",
			headline: "Cash-out reached further",
			detail: "Remittances landed in more corridors than ever before.",
			metric: { value: 200, caption: "countries" },
		},
		{
			kind: "launch",
			headline: "New off-ramps went live",
			detail: "More ways to turn USDC into money in a hand.",
		},
		{
			kind: "growth",
			headline: "Volume kept climbing",
			detail: "Everyday people moved more value home, month over month.",
		},
	],
	beans: [
		{
			kind: "growth",
			headline: "More families onboarded",
			detail: "Payments simple enough that nobody had to explain them.",
		},
		{
			kind: "launch",
			headline: "The app got simpler still",
			detail: "New flows that tuck the crypto completely out of sight.",
		},
		{
			kind: "milestone",
			headline: "Stellar rails, made invisible",
			detail: "Money that just moves. No jargon, no friction.",
		},
	],
	elsa: [
		{
			kind: "reach",
			headline: "Dollars reached more wallets",
			detail: "Savings that quietly outrun local inflation.",
		},
		{
			kind: "growth",
			headline: "Balances held their value",
			detail: "More paychecks kept their worth through the year.",
		},
		{
			kind: "launch",
			headline: "New saving tools shipped",
			detail: "Everyday dollar accounts, a few taps away.",
		},
	],
	meru: [
		{
			kind: "reach",
			headline: "More freelancers got paid",
			detail: "A dollar account in every LatAm pocket.",
		},
		{
			kind: "growth",
			headline: "Cross-border payouts climbed",
			detail: "Getting paid stopped meaning waiting on a bank.",
		},
		{
			kind: "launch",
			headline: "New payout rails opened",
			detail: "More ways for the region to receive and spend.",
		},
	],
	// ── Innovation ──
	etherfuse: [
		{
			kind: "launch",
			headline: "Real-world yield, on-chain",
			detail: "Tokenized government bonds became a Stellar primitive.",
		},
		{
			kind: "growth",
			headline: "More yield flowed on-chain",
			detail: "TradFi returns, now composable with everything else.",
		},
		{
			kind: "milestone",
			headline: "Bridged TradFi and Stellar",
			detail: "The kind of asset a whole ecosystem can build on.",
		},
	],
	blend: [
		{
			kind: "growth",
			headline: "Liquidity kept compounding",
			detail: "Isolated pools drew deposits all year long.",
		},
		{
			kind: "launch",
			headline: "New pool primitives shipped",
			detail: "More ways to lend, borrow and wall off risk.",
		},
		{
			kind: "reach",
			headline: "Builders kept plugging in",
			detail: "Became a default money-market layer on Soroban.",
		},
	],
	sorobanhooks: [
		{
			kind: "launch",
			headline: "Contracts learned to react",
			detail: "Event-driven automation for Soroban went live.",
		},
		{
			kind: "growth",
			headline: "More hooks firing every week",
			detail: "Automations that let contracts answer the world.",
		},
		{
			kind: "milestone",
			headline: "Made Soroban feel alive",
			detail: "Reactive infrastructure the ecosystem was missing.",
		},
	],
	// ── Interoperability ──
	defindex: [
		{
			kind: "launch",
			headline: "Strategies became one-click",
			detail: "Whole DeFi indexes any wallet can embed.",
		},
		{
			kind: "reach",
			headline: "Plugged into more wallets",
			detail: "One integration, a shelf of strategies.",
		},
		{
			kind: "growth",
			headline: "More strategies indexed",
			detail: "A widening menu of ways to put capital to work.",
		},
	],
	allbridge: [
		{
			kind: "reach",
			headline: "Connected more chains",
			detail: "Stellar liquidity flowed further out into the world.",
			metric: { value: 12, caption: "chains" },
		},
		{
			kind: "growth",
			headline: "Bridged volume climbed",
			detail: "Value came in, value went out, all year.",
		},
		{
			kind: "milestone",
			headline: "Stellar, on the bridge map",
			detail: "A dozen networks, one liquidity path.",
		},
	],
	"usdc-swap": [
		{
			kind: "reach",
			headline: "Five networks, one feel",
			detail: "Cross-chain USDC without the five-step headache.",
			metric: { value: 5, caption: "networks" },
		},
		{
			kind: "growth",
			headline: "More USDC moved cross-chain",
			detail: "Stablecoin that treats chains like one network.",
		},
		{
			kind: "launch",
			headline: "New routes went live",
			detail: "Shorter hops between where dollars live.",
		},
	],
	rubic: [
		{
			kind: "reach",
			headline: "Chains on the map",
			detail: "And this year, Stellar joined the route.",
			metric: { value: 70, suffix: "+", caption: "chains" },
		},
		{
			kind: "growth",
			headline: "More routes aggregated",
			detail: "The best path found, wherever value needed to go.",
		},
		{
			kind: "launch",
			headline: "Stellar routing shipped",
			detail: "A new lane into the ecosystem, opened up.",
		},
	],
	// ── 2026 nominations round — from each project's i³ submission ──
	// Impact
	abroad: [
		{
			kind: "growth",
			headline: "3,139 payments settled",
			detail:
				"About $314K paid from Stellar wallets and received as BRL and COP.",
			metric: { value: 3139, caption: "transactions" },
		},
		{
			kind: "launch",
			headline: "PIX live at Meridian 2025",
			detail:
				"Attendees paid like locals in Brazil straight from Beans, Lobstr, Zypto and Freighter.",
		},
		{
			kind: "reach",
			headline: "Two corridors, one flow",
			detail:
				"PIX in Brazil and Bre-B in Colombia; Stellar carries 91% of the volume.",
		},
	],
	agtrail: [
		{
			kind: "growth",
			headline: "6,000+ farmers and users",
			detail:
				"Across 25+ cooperatives and 150+ agribusiness partners in 8+ Nigerian states.",
			metric: { value: 6000, suffix: "+", caption: "farmers and users" },
		},
		{
			kind: "launch",
			headline: "Live on mainnet, May 2026",
			detail:
				"SCF #38 Build Award completed; a production app with measurable on-chain activity.",
		},
		{
			kind: "milestone",
			headline: "Farmers paid in NGNC",
			detail:
				"Buyers settle verified trades on Stellar; farmers cash out to a Nigerian bank account.",
		},
	],
	bousol: [
		{
			kind: "growth",
			headline: "7,000+ funded wallets",
			detail:
				"About 150 new signups a day from Africa alone, on top of the Haiti and Caribbean base.",
			metric: { value: 7000, suffix: "+", caption: "funded wallets" },
		},
		{
			kind: "launch",
			headline: "Sòl circles, on-chain",
			detail:
				"The rotating-savings tradition as a non-custodial USDC wallet with a verifiable record.",
		},
		{
			kind: "milestone",
			headline: "Registered MSB, real on-ramps",
			detail:
				"MoneyGram, Stripe and PayPal live, plus a signed TSA with MoneyGram.",
		},
	],
	fastbuka: [
		{
			kind: "growth",
			headline: "More merchants, less commission",
			detail:
				"Low-cost rails keep more of each sale with neighbourhood vendors.",
		},
		{
			kind: "launch",
			headline: "Marketplace live on mainnet",
			detail:
				"Consumers, local merchants and couriers across Africa since February 2026.",
		},
		{
			kind: "milestone",
			headline: "Riders paid in under 60 seconds",
			detail: "Delivery earnings land the same day instead of weekly.",
		},
	],
	"coala-pay": [
		{
			kind: "growth",
			headline: "2,955 people reached in Somalia",
			detail:
				"Funds delivered in under 24 hours, inside the critical 72-hour window.",
			metric: { value: 2955, caption: "people reached" },
		},
		{
			kind: "launch",
			headline: "Anticipatory aid went live",
			detail:
				"Smart-contract subgrants for NRC Somalia, triggered by weather data since late 2025.",
		},
		{
			kind: "milestone",
			headline: "Over $1M standing by",
			detail:
				"WFP funds on Stellar release the moment a pre-disaster threshold is crossed, for 39,610 people.",
		},
	],
	codelnpay: [
		{
			kind: "growth",
			headline: "70,000+ young Africans reached",
			detail: "Training, quests, hackathons and job placement since inception.",
			metric: { value: 70000, suffix: "+", caption: "young people reached" },
		},
		{
			kind: "milestone",
			headline: "Two years live on Stellar",
			detail:
				"Cross-border payroll so remote workers keep what employers abroad pay them.",
		},
		{
			kind: "reach",
			headline: "Income without the cuts",
			detail:
				"Stablecoin salaries land on-chain, lifting household income in overlooked regions.",
		},
	],
	domipago: [
		{
			kind: "growth",
			headline: "5,600+ transactions",
			detail:
				"More than $1.5M moved on the U.S. to Dominican Republic corridor since November 2023.",
			metric: { value: 5600, suffix: "+", caption: "transactions" },
		},
		{
			kind: "launch",
			headline: "Mainnet on Stellar, July 2026",
			detail:
				"SCF Build Award completed; production hardening for end-to-end payouts in the DR.",
		},
		{
			kind: "milestone",
			headline: "Remittances inside WhatsApp",
			detail:
				"Recipients request and receive money in the channel families already use.",
		},
	],
	findtruman: [
		{
			kind: "growth",
			headline: "Building on Stellar since 2024",
			detail:
				"Creator incentives, copyright records and player reputation, all live.",
		},
		{
			kind: "launch",
			headline: "Games from a sentence",
			detail:
				"An agentic framework turns natural-language ideas into playable 3D games in hours.",
		},
		{
			kind: "reach",
			headline: "Web2 sign-in, on-chain ownership",
			detail:
				"Google login with an automatically linked Stellar address; assets recorded on-chain.",
		},
	],
	"freedom-pay-wallet": [
		{
			kind: "growth",
			headline: "$100,000 USDC in aid delivered",
			detail:
				"To more than 1,200 people in The Gambia, Tanzania, Uganda and Ethiopia.",
			metric: { value: 100000, prefix: "$", caption: "USDC delivered as aid" },
		},
		{
			kind: "reach",
			headline: "Aid that becomes access",
			detail:
				"Cash-out, airtime, utilities, gift cards and a prepaid Visa from one wallet.",
		},
		{
			kind: "milestone",
			headline: "Women entrepreneurs funded",
			detail:
				"Grants in Uganda helped recipients restock, start and grow small businesses.",
		},
	],
	giveth: [
		{
			kind: "growth",
			headline: "Every donation arrives in full",
			detail:
				"No platform fee, so grassroots projects anywhere can fundraise without a bank.",
		},
		{
			kind: "launch",
			headline: "Stellar QF round in 2025",
			detail:
				"SDF-matched quadratic funding where donors decided which projects got matched.",
		},
		{
			kind: "milestone",
			headline: "Scan and give",
			detail: "Donate on Stellar by QR code: no wallet connection, no account.",
		},
	],
	jetpad: [
		{
			kind: "growth",
			headline: "Nigeria, Kenya and Ghana live",
			detail: "Hold dollars, pay bills, cash out to a bank or mobile money.",
		},
		{
			kind: "launch",
			headline: "iOS app shipped October 2025",
			detail:
				"Then KYC and referrals, fiat pay to naira, and XLM for airtime and data.",
		},
		{
			kind: "milestone",
			headline: "No seed phrase, no gas",
			detail:
				"Email or biometrics; JetPad sponsors the fees and the USDC trustline.",
		},
	],
	liqvid: [
		{
			kind: "growth",
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
			headline: "First issuance closed at $5.75M",
			detail: "Nearly double the volume committed in the SCF grant.",
		},
		{
			kind: "milestone",
			headline: "Second deal, no grant behind it",
			detail: "$4.3M closed after the award ended.",
		},
	],
	"public-node": [
		{
			kind: "growth",
			headline: "A nonprofit voice in governance",
			detail:
				"The only 501(c)(3) dedicated to Stellar, weighing in on quorum and consensus.",
		},
		{
			kind: "milestone",
			headline: "Seven years of uptime",
			detail:
				"Independent Tier 1 validation since the first Meridian in Mexico City.",
		},
		{
			kind: "reach",
			headline: "Recovery you don't have to trust",
			detail:
				"An independent participant in decentralized wallet recovery for Beans users.",
		},
	],
	rahat: [
		{
			kind: "growth",
			headline: "14,032 people warned before floods",
			detail: "SMS and voice early warnings across Nepal's Terai river basins.",
			metric: { value: 14032, caption: "people warned" },
		},
		{
			kind: "launch",
			headline: "Stellar since July 2025",
			detail:
				"From one municipality to more than 15, with the Nepal Red Cross and Mercy Corps.",
		},
		{
			kind: "milestone",
			headline: "$200K+ of aid, 180+ local vendors",
			detail:
				"Relief spent in the community, with 40 women-run vendors on the network.",
		},
	],
	"stellar-passport": [
		{
			kind: "growth",
			headline: "71 events run on Passport",
			detail:
				"15 country organizations and 19 ambassador chapters on one platform.",
			metric: { value: 71, caption: "events" },
		},
		{
			kind: "launch",
			headline: "Live since Meridian 2025",
			detail:
				"More than 2,500 challenges completed with passkey smart wallets and on-chain stamps.",
		},
		{
			kind: "reach",
			headline: "No app, no seed phrase",
			detail:
				"Join with a fingerprint or face scan; organizers get a no-code admin panel.",
		},
	],
	"stellar-security-portal": [
		{
			kind: "growth",
			headline: "840 findings, searchable",
			detail: "From 60 audit reports across 52 protocols, classified and free.",
			metric: { value: 840, caption: "vulnerability findings" },
		},
		{
			kind: "launch",
			headline: "Public since July 2025",
			detail:
				"Born as Soroban Security Portal, serving the ecosystem for over a year.",
		},
		{
			kind: "reach",
			headline: "Security knowledge for small teams",
			detail:
				"Learn from audits others paid for before spending a dollar on your own.",
		},
	],
	"token-terminal": [
		{
			kind: "growth",
			headline: "42 standardized Stellar metrics",
			detail:
				"Chain and app dashboards outside the paywall since September 2025.",
			metric: { value: 42, caption: "metrics" },
		},
		{
			kind: "milestone",
			headline: "#4 globally for tokenized funds",
			detail:
				"$3.22B in tokenized fund market cap, ahead of Solana and Avalanche.",
		},
		{
			kind: "reach",
			headline: "Same data in Lagos and on Bloomberg",
			detail:
				"Institutional-grade financials, free, so the inclusion case rests on evidence.",
		},
	],
	tucambio: [
		{
			kind: "growth",
			headline: "14,024 transactions",
			detail: "580 Stellar wallets created, as of September 2026.",
			metric: { value: 14024, caption: "transactions" },
		},
		{
			kind: "launch",
			headline: "Build Award completed June 2026",
			detail: "SCF #37 from MVP to testnet to mainnet; live on Stellar since.",
		},
		{
			kind: "reach",
			headline: "Dollars that wait for you",
			detail:
				"Receive USDC, hold value, convert only when spending, even under 387% inflation.",
		},
	],
	// Innovation
	centiiv: [
		{
			kind: "growth",
			headline: "Building on Stellar since 2022",
			detail: "Sourcing, matching and payment execution in a single workflow.",
		},
		{
			kind: "launch",
			headline: "Liquidity on demand",
			detail:
				"Pick verified providers by currency, price and settlement speed through one integration.",
		},
		{
			kind: "reach",
			headline: "Emerging markets, made viable",
			detail:
				"Lower cost of expansion for fintechs facing FX and compliance bottlenecks.",
		},
	],
	eara: [
		{
			kind: "growth",
			headline: "Regulated Europe, on Stellar",
			detail:
				"Institutional rails for tokenized investment products, backed by a licensed securities agency.",
		},
		{
			kind: "launch",
			headline: "CompliantID",
			detail:
				"A privacy-first KYC passport that verifies eligibility without personal data on-chain.",
		},
		{
			kind: "milestone",
			headline: "Secure Custodian",
			detail:
				"Multisignature governance for critical operations on regulated assets.",
		},
	],
	inference: [
		{
			kind: "growth",
			headline: "Five releases in nine weeks",
			detail:
				"v0.0.1 shipped May 2026: compiler, CLI, docs and a VS Code extension.",
		},
		{
			kind: "launch",
			headline: "Specs a developer can write",
			detail:
				"Rust-like syntax compiled through WebAssembly into Rocq proof obligations.",
		},
		{
			kind: "reach",
			headline: "Prove absence, not just presence",
			detail:
				"Specification-first development that slots into audit preparation.",
		},
	],
	irl: [
		{
			kind: "growth",
			headline: "A loyalty network across cities",
			detail:
				"Venues, promoters, festivals and artists share one portable record of participation.",
		},
		{
			kind: "launch",
			headline: "Build Award, all three tranches",
			detail:
				"City guides, check-ins, loyalty, embedded wallets and stablecoin payments, live.",
		},
		{
			kind: "milestone",
			headline: "Featured by Stellar",
			detail:
				"Bringing culture onchain, invisibly: rewards and payments that feel like a normal app.",
		},
	],
	"rivool-finance": [
		{
			kind: "growth",
			headline: "40,000 advisors, one gap",
			detail:
				"Dollar accounts, yield, tokenized assets and payments through the advisor's own relationship.",
		},
		{
			kind: "launch",
			headline: "Mainnet since December 2025",
			detail: "An on-chain neobank for financial advisors in Brazil.",
		},
		{
			kind: "milestone",
			headline: "Fees settled by smart contract",
			detail:
				"Advisory fees and revenue splits settle per client on Soroban, no custodian in between.",
		},
	],
	"soroban-resource-usage-reporter": [
		{
			kind: "growth",
			headline: "Growing into Blocksmith",
			detail:
				"An all-in-one Soroban toolkit from local testing to source verification, in private beta.",
		},
		{
			kind: "launch",
			headline: "Live since January 2025",
			detail:
				"CPU, memory and ledger reads and writes reported before a contract hits a limit.",
		},
		{
			kind: "milestone",
			headline: "Rebuilt in Rust",
			detail:
				"Runs inside a standard contract test suite; began on npm as @57block/stellar-resource-usage.",
		},
	],
	stellarchain: [
		{
			kind: "growth",
			headline: "Twelve years of Stellar history",
			detail:
				"An explorer live since 2014, now covering Mainnet, Testnet and Futurenet.",
		},
		{
			kind: "launch",
			headline: "Classic and Soroban in one view",
			detail:
				"Contract events, storage, metadata and source verification beside ledgers and markets.",
		},
		{
			kind: "reach",
			headline: "Soroban Auditor, open source",
			detail:
				"Reconstructs source-like Rust from compiled WASM when the original is unavailable.",
		},
	],
	tansu: [
		{
			kind: "growth",
			headline: "Built for the Cyber Resilience Act",
			detail:
				"A public place for the approved commit, its SBOM and CVE scans, readable by any auditor.",
		},
		{
			kind: "launch",
			headline: "Mainnet since October 2025",
			detail:
				"On testnet since May 2024; SCF membership NFT and Public Goods deployments added in 2026.",
		},
		{
			kind: "milestone",
			headline: "Commits approved on-chain",
			detail:
				"A project's own decision to release, recorded on a public chain, independent of the forge.",
		},
	],
	"volta-circuit": [
		{
			kind: "growth",
			headline: "Live across chains since 2023",
			detail:
				"The Gnosis Safe model, brought to Stellar under an SDF Integration Support Grant.",
		},
		{
			kind: "launch",
			headline: "Multisig on Soroban, in production",
			detail:
				"Role-based permissions, policy controls and SDK automation, with public developer docs.",
		},
		{
			kind: "reach",
			headline: "Custody's complement",
			detail:
				"Contract-callable multisig for protocols expanding from EVM to Stellar.",
		},
	],
	"webacy-inc": [
		{
			kind: "growth",
			headline: "Billions protected since 2021",
			detail:
				"Hundreds of security, compliance and market signals, updated as conditions change.",
		},
		{
			kind: "launch",
			headline: "Stellar integration live, May 2026",
			detail:
				"Live risk scores across wallets, transactions, contracts, protocols and assets.",
		},
		{
			kind: "reach",
			headline: "Risk checks agents can call",
			detail:
				"APIs and agent tooling that allow, block or escalate before a transaction happens.",
		},
	],
	// Interoperability
	blux: [
		{
			kind: "growth",
			headline: "300+ accounts signed in",
			detail:
				"July to September 2026; one integration onboarded 100+ users with passkeys.",
			metric: { value: 300, suffix: "+", caption: "sign-ins" },
		},
		{
			kind: "launch",
			headline: "Mainnet since March 2025",
			detail:
				"Email, social and passkey login, or an existing wallet, through one SDK.",
		},
		{
			kind: "reach",
			headline: "One integration, every wallet",
			detail:
				"JavaScript and React SDKs for signing, balances and on/off-ramp flows.",
		},
	],
	reflector: [
		{
			kind: "growth",
			headline: "$200M+ TVL secured",
			detail: "Live on mainnet since April 2024, in development since 2022.",
			metric: { value: 200, prefix: "$", suffix: "M+", caption: "TVL secured" },
		},
		{
			kind: "milestone",
			headline: "The default oracle for Blend",
			detail:
				"Also Etherfuse, OrbitCDP, DeFindex, Laina, EquitX and SorobanDomains.",
		},
		{
			kind: "reach",
			headline: "Consensus by the community",
			detail:
				"Script3, CreitTech, UltraStellar, xyclooLabs, PublicNode, LightSail and StellarExpert.",
		},
	],
	rozo: [
		{
			kind: "growth",
			headline: "18,500+ Stellar transactions sponsored",
			detail: "A core cross-chain route measures a P95 of about 10 seconds.",
			metric: { value: 18500, suffix: "+", caption: "transactions sponsored" },
		},
		{
			kind: "launch",
			headline: "Checkout, CLI, npm and agent skill",
			detail: "Pay from Stellar even when the merchant settles on Base.",
		},
		{
			kind: "reach",
			headline: "Scan to pay, any network",
			detail:
				"SEP-7, Solana Pay, EVM requests and plain addresses in one wallet.",
		},
	],
	seevcash: [
		{
			kind: "growth",
			headline: "$3.4M in total volume",
			detail:
				"Five consecutive quarters of growth since launching in October 2024.",
			metric: { value: 3, prefix: "$", suffix: "M+", caption: "total volume" },
		},
		{
			kind: "launch",
			headline: "Visa card fully live",
			detail:
				"Beta in July 2026, $18,500 transacted, then general availability in September.",
		},
		{
			kind: "reach",
			headline: "US dollars to MTN Mobile Money",
			detail:
				"Bridge, OwlPay and BlindPay route value through Stellar into Ghana; SeevPlus sends cedis out.",
		},
	],
	swiftex: [
		{
			kind: "growth",
			headline: "1,568 transactions in 30 days",
			detail: "About $103K of volume across iOS, Android and web.",
			metric: { value: 1568, caption: "transactions, last 30 days" },
		},
		{
			kind: "launch",
			headline: "Eight chains into Stellar",
			detail:
				"NEAR Intents bridging; account creation and the trustline inside the same flow.",
		},
		{
			kind: "reach",
			headline: "146 bridges, 243 trustlines",
			detail:
				"Capital and accounts arriving on Stellar from five EVM chains in one month.",
		},
	],
};

export function highlightsFor(slug: string): Highlight[] {
	return NOMINEE_HIGHLIGHTS[slug] ?? [];
}
