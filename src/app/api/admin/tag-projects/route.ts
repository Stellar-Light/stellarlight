import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

// Explicit name-to-type overrides (audited)
const EXPLICIT_OVERRIDES: Record<string, string[]> = {
	// Wallets
	Freighter: ["Wallet"],
	Lobstr: ["Wallet"], // wallet only, not a DEX
	Beans: ["Wallet", "Payments"], // payments wallet
	"BOSS Wallet": ["Wallet"],
	"Hana Wallet": ["Wallet"],
	Hana: ["Wallet"],
	Rabet: ["Wallet"],
	"xBull Wallet": ["Wallet"],
	xBull: ["Wallet"],
	Albedo: ["Wallet"],
	Litemint: ["Gaming", "NFT"], // gaming studio (Cyberbrawl), not a wallet
	xcapit: ["Wallet"],
	StellarGuard: ["Wallet", "Security"],
	Stellarport: ["Wallet", "DEX"],
	"Unstoppable Wallet": ["Wallet", "Bridge"],
	Vibrant: ["Payments"], // rebranded to Vesseo (vesseoapp.com)
	Vesseo: ["Payments"],
	"Hito Wallet": ["Wallet"],
	Moonlight: ["Wallet"],
	MXlet: ["Wallet"],
	Empowch: ["Wallet", "Payments"], // remittance wallet (MENA region)
	"Ben Wallet": ["Wallet"],
	Arculus: ["Wallet"],
	"Boss Revolution": ["Payments"], // remittance/money transfer app
	"JS-Capacitor Passkey Kit": ["SDK"], // developer SDK for passkey wallets
	OneKey: ["Wallet", "Security"],
	"HOT Protocol": ["Wallet", "Bridge"],
	HedgePay: ["Wallet", "Lending"], // DeFi investment wallet (LatAm)
	Sollpay: ["Wallet", "Bridge"], // ZK wallet with cross-chain swaps
	"Ultra Stellar": ["SDK"], // software engineering company, not a wallet
	Interstellar: ["DEX"], // defunct DEX, not a wallet
	SocketFi: ["Analytics"], // notification/alerts protocol, not a wallet
	Mojoflower: ["RWA"], // share tokenization platform (Iceland share ledgers)

	// DEXs / AMMs
	Aquarius: ["DEX"],
	StellarX: ["DEX"],
	Soroswap: ["DEX"],
	Phoenix: ["DEX"],
	StellarBroker: ["DEX"],
	Switchly: ["DEX"],
	SwiftEx: ["DEX"],
	"Vanna Finance": ["DEX"],
	RAMM: ["DEX"],
	Hermes: ["DEX"],
	"Sushi Swap": ["DEX"], // SushiSwap — live on Stellar (sushi.com/stellar/swap)
	"Dex Tools": ["DEX"],
	Spinach: ["DEX"],
	Normal: ["DEX"],
	"Stellars Finance": ["DEX"],
	"Every Finance": ["DEX"],
	"FX Swap": ["DEX"],
	Estrela: ["Stablecoin", "DEX"], // stablecoin swap protocol
	Reyts: ["DEX"],
	"Block Time Financial": ["DEX"],
	"Meria DeFi": ["DEX", "Analytics"],
	"One Click": ["DEX"],
	// Lending
	Blend: ["Lending"],
	"YieldBack.Cash": ["Lending"],
	"Templar Protocol": ["Lending"],
	Trilobyte: ["Lending"],
	Untangled: ["RWA", "Lending"],
	"Polaris Lend": ["Lending"],
	"Pluto Loans": ["Lending"],
	Laina: ["Lending"],
	OrbitCDP: ["Lending"],
	Huma: ["Lending"],
	AssetDesk: ["Lending"],
	Alula: ["Lending"],
	"Lumen Later": ["Lending"],
	Peridot: ["Lending", "Bridge"],
	Indentura: ["Lending"],
	CoopStable: ["Lending"],
	"CoopStable v2 - Yield sharing stablecoin": ["Stablecoin", "Lending"],
	"ClickPesa Debt Fund": ["RWA", "Lending"],

	// Bridges
	ZKLiquid: ["Bridge"],
	"VIA Labs": ["Bridge", "SDK"],
	Tricorn: ["Bridge"],
	Transfuse: ["Bridge"],
	Styx: ["Bridge"],
	"USDC Swap": ["Bridge", "Payments"],
	Allbridge: ["Bridge"],
	Rubic: ["DEX", "Bridge"],
	Houdiniswap: ["DEX", "Bridge"],

	// Payments
	Wagent: ["Payments"],
	"Wirex Pay": ["Payments"],
	Verseprop: ["Payments", "RWA"],
	Utoken: ["Payments"],
	TransferMole: ["Payments"],
	Sytemap: ["Payments", "RWA"],
	StellarPay: ["Payments"],
	Tracee: ["Payments"],
	Trace: ["Payments"],
	Tipper: ["Payments"],
	TuCambio: ["Payments", "Anchor"],
	TheXBank: ["Payments", "Anchor"],
	Zentra: ["Payments"],
	MoneyGram: ["Payments"],
	Fonbnk: ["Payments"],
	Circle: ["Payments"],
	Flutterwave: ["Payments"],
	"Yellow Card": ["Payments"],
	Cowrie: ["Payments"],
	Nala: ["Payments"],
	Decaf: ["Payments"],
	ClickPesa: ["Payments"],
	Afriex: ["Payments"],
	Anclap: ["Payments", "Anchor"],
	Chippercash: ["Payments"],
	TYPIQO: ["Payments"],
	Copperx: ["Payments"],
	Paysapp: ["Payments"],
	Fastbuka: ["Payments"],
	FijiCoin: ["Payments"],
	"Crypto Link": ["Payments"],
	CodeLnPay: ["Payments"],
	Centiiv: ["Payments"],
	Centaurus: ["Payments"],
	CashAbroad: ["Payments"],
	BravePay: ["Payments"],
	Alfred: ["Payments"],
	Rigel: ["Payments"],
	Clear: ["Payments"],
	DCM: ["Payments"],
	DomiPago: ["Payments"],
	Elsa: ["Payments"],
	"Freedom Pay Wallet": ["Payments"],
	Hurupay: ["Payments"],
	"Coins.ph": ["Payments"],
	Cartwey: ["Payments"],
	Bousol: ["Payments"],
	Rozo: ["Payments"],
	RemittEase: ["Payments"],
	Lul: ["Payments"],
	"Loop Finance": ["Payments"],
	"Kasi Money": ["Payments"],
	Grip: ["Payments"],
	PeerPesa: ["Payments"],
	dolphinze: ["Payments"],
	involt: ["Payments"],
	SFx: ["Payments"],
	SStream: ["Payments"],
	Stables: ["Payments", "Anchor"],
	ROSEN: ["Payments"],
	GetPaid: ["Payments"],
	Splito: ["Payments"],
	"Diameter Pay": ["Payments"],

	// Social Impact — crowdfunding, charity, humanitarian
	KindFi: ["Social Impact"], // crowdfunding platform
	Boundless: ["Social Impact"], // web3 funding platform
	"The Give Hub": ["Social Impact"], // crowdfunding/microloan platform
	TAP4Change: ["Social Impact"], // social micro-funding
	Idunu: ["Social Impact"], // fundraising for charities
	"Lumens for Charity": ["Social Impact"], // charity donations
	Juntta: ["Social Impact"], // crowdfunding platform
	Rahat: ["Social Impact"], // humanitarian financial access
	CHATS: ["Social Impact"], // humanitarian aid (MercyCorps, UNICEF)
	Comunitaria: ["Social Impact"], // government/NGO platform
	LocalCoin: ["Social Impact"], // social good orgs
	GrantPicks: ["Social Impact"], // funding platform (Potlock)
	Giveth: ["Social Impact"], // quadratic funding
	OpenSolar: ["Social Impact"], // solar energy crowdfunding
	Komunitin: ["Social Impact"], // local currency exchange communities — low relevance, not payments

	// Marketplaces / Platforms — NOT Payments
	Gearup: ["NFT", "Payments"], // P2P marketplace for creators
	Eascrow: ["SDK"], // escrow-as-a-service smart contracts
	"Trustless Work": ["SDK"], // escrows-as-a-service
	SoroSplits: ["SDK"], // smart contract for split payments
	Dropzey: ["SDK"], // airdrop management
	Lumenaut: ["SDK"], // inflation pool
	"Stellar Tip": ["Payments"], // tipping platform
	"tip me": ["Payments"], // tipping platform
	Amero: ["Lending"], // collaborative savings via smart contracts
	Venerez: ["Payments"], // programmable spend platform
	ApiCharge: ["SDK"], // API monetization platform
	Steepx: ["SDK"], // protocol support/stack upgrade
	POMA: ["SDK"], // web3 platform collective
	Axal: ["AI"], // autopilot support (AI agent)
	uils: ["Payments"], // embedded finance for gig economy

	// Stablecoin issuers / platforms
	"Glo Dollar": ["Stablecoin"], // Glo USD stablecoin issuer
	Brale: ["Stablecoin", "Anchor"], // stablecoin issuance platform
	Stablecorp: ["Stablecoin", "Anchor"], // Canadian stablecoin issuer (QCAD)
	Dollarize: ["Stablecoin", "Payments"], // USD stablecoin platform
	"Honey Coin": ["Payments"], // payments app

	// Anchors
	Usher: ["Anchor", "SDK"],
	MYKOBO: ["Stablecoin", "Anchor"], // EURC stablecoin on Soroban
	"Settle Network": ["Anchor"],
	ntoklo: ["Anchor"],
	Apay: ["Anchor"],

	// SDKs
	"Swift Wallet SDK": ["SDK"],
	Subs: ["SDK"],
	"Stroopy.AI": ["AI"],
	"stellarpro.dev": ["Education"],
	Walletban: ["SDK"],
	Vottun: ["SDK"],
	Uniblock: ["SDK"],
	SWPLUG: ["SDK", "Payments"],
	"Timed Transactions API": ["SDK"],
	Stellarmint: ["SDK"],
	StellarAuth: ["SDK"],
	"Stellar Unity Developer Kit": ["SDK"],
	"WebSoroban IDE": ["SDK"],
	TokenOps: ["SDK"],
	Trustswap: ["Security", "SDK"],
	Tumbl: ["SDK"],
	StreamingFast: ["SDK", "Indexer"],
	"Stellar Router SDK": ["SDK"],
	Sorosan: ["SDK"],
	"Soroban SDK Tools": ["SDK"],
	"Horizon-as-a-Service": ["SDK"],
	Forge: ["SDK"],
	Expand: ["SDK"],
	Basement: ["SDK"],
	CommuniDAO: ["SDK"],
	Reclaim: ["SDK"],
	"JS Worker SDK": ["SDK"],
	"Kotlin Stellar SDK": ["SDK"],
	Sentinel: ["SDK"],
	OmniLumen: ["SDK"],
	Adamik: ["SDK"],
	Accelar: ["SDK"],
	Autowhale: ["SDK"],
	"0xAuth": ["SDK", "Security"],
	Orally: ["SDK"],
	Satellite: ["SDK"],
	"Soroban Pre-Order Contract": ["SDK"],
	"Governance Modules Library": ["SDK"],
	DevAsign: ["SDK"],
	Skeeper: ["SDK"],
	"Stellar-MetaMask": ["SDK", "Wallet"],
	SiBorg: ["SDK"],
	Paykit: ["Payments", "SDK"],
	PayZoll: ["Payments", "SDK"],
	OpenZeppelin: ["SDK", "Security"],
	Crossmint: ["SDK", "Wallet"],
	Cobo: ["Wallet", "SDK"],
	"Mobula Labs": ["SDK", "Analytics"],
	Beamable: ["SDK", "Gaming"],

	// Explorers
	StellarExpert: ["Explorer", "Analytics"],
	"Stellar Transaction Visualizer": ["Explorer"],
	"stellarchain.io": ["Explorer"],
	Lumenscan: ["Explorer"],
	"Soroban Explorer": ["Explorer"],

	// Indexer
	Decentrio: ["Indexer", "SDK"],
	SorobanHooks: ["SDK", "Indexer"],

	// Analytics
	"Token Terminal": ["Analytics"],
	Sorscan: ["Analytics"],
	SorobanPulse: ["Analytics"],
	"Soroban ELK": ["Analytics"],
	"Soroban Resource Usage Reporter": ["Analytics"],
	Ortege: ["Analytics"],
	Blip: ["Analytics"],
	Agnostic: ["Analytics"],
	Certik: ["Security"],
	Lobster: ["Analytics"],
	"Stellar DeFi Dune Dashboards": ["Analytics"],
	Synced: ["Analytics"],
	Bitwave: ["Analytics"],
	"Genie AI": ["Analytics", "AI"],

	// AI
	StellarGPT: ["AI", "SDK"],
	"Soroban Assistant": ["AI", "SDK"],
	"Stellar AI Agent Kit": ["SDK", "AI"],
	"AI Transparency Token": ["AI", "Security"],
	OWNY: ["AI", "Analytics"],

	// Gaming
	Warmancer: ["Gaming"],
	Wadzzo: ["Gaming"],
	FindTruman: ["Gaming"],
	"Kata.Games": ["Gaming"],
	CryptoCannoneer: ["Gaming"],
	Stride: ["Gaming"],
	"Open GameFi SDK ": ["SDK", "Gaming"],

	// Education
	TEACHMEDEFI: ["Education"],
	Womenbiz: ["Education"],
	Web3dev: ["Education"],
	Venalabs: ["Education", "Gaming"],
	"The Starship Soroban": ["Education"],
	Techfiesta: ["Education"],
	Sorobash: ["Education"],
	"Soroban Learn": ["Education"],
	"Stellar Update": ["Education"],
	"Blue Orion": ["Education"],
	"Encode Club": ["Education"],
	EduNode: ["Education"],
	"Dapp World": ["Education"],
	Cryptoconexión: ["Education"],
	BAF: ["Education"],
	ICanProveIt: ["Education"],
	"Noticias Trading": ["Education"],
	DevTrak: ["Education"],
	B4B: ["Education"], // rewarding content creators for web3 education
	Gladius: ["Education", "Gaming"],

	// Security
	"Web3 Antivirus": ["Security"],
	Veridise: ["Security"],
	Trustful: ["Security"],
	Teken: ["Security"],
	CyVers: ["Security"],
	Coinspect: ["Security"],
	ChainPatrol: ["Security"],
	Halborn: ["Security"],
	OtterSec: ["Security"],
	Quarkslab: ["Security"],
	Code4rena: ["Security"],
	Cantina: ["Security"],
	Certora: ["Security"],
	"Runtime Verification": ["Security"],
	Extractor: ["Security"],
	Scout: ["Security"],
	AnChain: ["Security"],
	"AnChain.AI": ["Security"],
	Hypernative: ["Security"],
	Solarkraft: ["Security"],
	"Webacy Inc.": ["Security"],
	"Stellarscam.report": ["Security"],
	"Scam Flagging System": ["Security"],
	Soundness: ["Security"],
	LumenShade: ["Security"],
	Gecko: ["Security"],
	"Gecko Fuzz": ["Security"],
	Bevor: ["Security"],
	Tansu: ["Security"],
	"Soroban Security Portal": ["Security"],
	Blux: ["Wallet", "Security"],
	Volta: ["Security", "Wallet"],
	"Volta Circuit": ["Security", "Wallet"],
	Inference: ["Security", "SDK"],
	Fairblock: ["Security", "SDK"],
	Almanax: ["Security"],
	Aerochain: ["RWA"],
	Mimoto: ["Security"],

	// NFT
	"THE HUB": ["NFT"],
	"The Blue Marble": ["NFT"],
	sTeX: ["NFT"],
	Rarible: ["NFT"],
	SNNAC: ["NFT"],
	Sorodrop: ["NFT"],
	Kunst21: ["NFT"],
	"Stellar Tools": ["SDK", "NFT"],
	QuillTip: ["NFT", "Payments"],
	Plutus: ["NFT"],
	"Stellar Passport": ["NFT"],
	OCTO: ["NFT"],
	Skyhitz: ["NFT"],
	ChimpDAO: ["NFT"],

	// RWA
	ZET: ["RWA"],
	"Storehouse Gold": ["RWA"],
	TRAK: ["RWA"],
	Stellarcarbon: ["RWA"],
	WisdomTree: ["RWA"],
	"STOCKen CAPITAL": ["RWA"],
	Upwealth: ["RWA", "Analytics"],
	Blade: ["RWA"],
	Bitbond: ["RWA"],
	Spiko: ["RWA"],
	Nauta: ["RWA"],
	"Nauta Land": ["RWA"],
	Metafyed: ["RWA"],
	reBlue: ["RWA"],
	"KYC Token": ["RWA"],
	EnerDAO: ["RWA"],
	ALTERNUN: ["RWA"],
	AgTrail: ["RWA"],
	Dobprotocol: ["RWA", "AI"],
	Minah: ["RWA"],
	Mica: ["RWA"],
	Borderdollar: ["RWA", "Lending"],
	Splyce: ["RWA"],
	"Splyce Finance": ["RWA"],
	Spydra: ["RWA"],
	Mystic: ["RWA", "Lending"],
	HiYield: ["RWA", "Lending"],
	"Liqvid.xyz": ["RWA", "Lending"],
	"Rivool Finance": ["RWA", "Lending"],
	DFNS: ["Wallet", "SDK"],

	// Misc — projects that don't fit cleanly
	Stellot: ["SDK"], // e-Voting platform
	StellarStrides: ["Education"], // marketing/branding for blockchain
	"Stellar Light": ["Explorer"], // ecosystem directory
	Wally: ["Gaming"], // P2P marketplace for experiences
	"Task.io": ["Social Impact"], // social impact data platform
	Vitreous: ["Social Impact"], // fundraising platform
	QSTN: ["Social Impact"], // survey marketplace with rewards
	stallion: ["Payments"], // talent marketplace with payments
	Zig3v2: ["Wallet", "SDK"], // biometric account creation
	Xlmeme: ["DEX"], // token launchpad
	Artizen: ["NFT"], // match funding for art
	"ART Club": ["NFT"], // creators + funders
	DIA: ["SDK"], // oracle
	Band: ["SDK"], // oracle
	"Soroban Optimistic Oracle": ["SDK"], // oracle
	Quasar: ["SDK"], // oracle
	Flashback: ["Indexer"], // decentralized multi-cloud storage / infrastructure
	AIDA: ["DEX", "AI"],
	IRL: ["NFT", "Payments"],
	Legasi: ["Lending", "RWA"],
	Seevcash: ["Payments"],
	"human.tech": ["Wallet"],

	// === Remaining "Other"-tagged projects ===

	// Stablecoins / Assets — these are stablecoin tickers, not projects
	ARS: ["Stablecoin"],
	ARST: ["Stablecoin"],
	AUDD: ["Stablecoin"],
	BRL: ["Stablecoin"],
	BRZ: ["Stablecoin"],
	EURC: ["Stablecoin"],
	EURS: ["Stablecoin"],
	EURx: ["Stablecoin"],
	GBPx: ["Stablecoin"],
	GLOUSD: ["Stablecoin"],
	KES: ["Stablecoin"],
	MBRL: ["Stablecoin"],
	MXNe: ["Stablecoin"],
	NGNC: ["Stablecoin"],
	PEN: ["Stablecoin"],
	QCAD: ["Stablecoin"],
	RWF: ["Stablecoin"],
	TZS: ["Stablecoin"],
	USDC: ["Stablecoin"],
	USDx: ["Stablecoin"],
	VCHF: ["Stablecoin"],
	VEUR: ["Stablecoin"],
	gYEN: ["Stablecoin"],
	xUSD: ["Stablecoin"],
	zUSD: ["Stablecoin"],

	// Analytics / Monitoring
	Alterscope: ["Analytics", "Security"],
	Dapplooker: ["Analytics"],
	DeRisk: ["Analytics", "Security"],
	Kwickbit: ["Analytics"],
	Stellarbeat: ["Explorer", "Analytics"],
	StellarFolio: ["Analytics", "Wallet"],
	ZettaBlock: ["Indexer", "Analytics"],
	"Stellar Dashboard": ["Analytics"],
	"Soroban Pulse": ["Analytics"],
	"Stellar Pulse": ["Analytics"],

	// Infrastructure / SDK
	Blockdaemon: ["Indexer"], // node infrastructure provider
	InfStones: ["Indexer"], // node infrastructure provider
	NOWNodes: ["Indexer"], // RPC node provider
	"Nirvana Labs": ["Indexer"], // infra provider
	PipeOps: ["Indexer"], // deployment infrastructure
	"Public Node": ["Indexer"], // free RPC endpoints
	Diadata: ["SDK"], // oracle data feeds
	Lightecho: ["SDK"], // price feed oracle
	Reflector: ["SDK"], // oracle
	"Band Protocol": ["SDK"], // oracle (dupe of Band)
	ChainAtlas: ["SDK"],
	Nebula: ["SDK", "Indexer"],
	"Soroban Governor": ["SDK"],
	"Soroban Hub": ["SDK"],
	SorobanIDE: ["SDK"],
	Okashi: ["SDK"],
	Digicus: ["SDK"],
	Keizai: ["SDK"],
	"Stellar Laboratory": ["SDK", "Explorer"],
	"Soroban Domains": ["SDK"],
	"Stroopy AI": ["AI", "SDK"],
	Sora: ["SDK"],
	"Reclaim Protocol": ["SDK"], // dupe of Reclaim
	"Expand Network": ["SDK"], // dupe of Expand
	Gateway: ["Indexer"], // RPC/indexer node provider (Gateway.fm)
	"Ortege AI": ["Analytics", "AI"], // dupe of Ortege
	Chartui: ["DEX", "Analytics"],
	DEXTools: ["DEX", "Analytics"],
	"Posted App": ["SDK"],

	// DeFi Protocols
	Hoops: ["DEX", "Analytics"],
	"Hoops Finance": ["DEX", "Analytics"],
	XycLoans: ["Lending"],
	Yieldblox: ["Lending"],
	Slender: ["Lending"],
	FxDAO: ["Stablecoin", "Lending"], // decentralized stablecoin protocol
	"Orbit Finance": ["Lending"],
	Bondhive: ["RWA", "Lending"],
	Excellar: ["RWA"],
	Etherfuse: ["RWA"],
	"Huma Finance": ["Lending"], // dupe of Huma
	"Mica Rent": ["RWA"], // dupe of Mica
	"Blue Marble": ["NFT"], // dupe of The Blue Marble
	Dune: ["Analytics"], // dupe of Stellar DeFi Dune Dashboards

	// Education
	EasyA: ["Education"],
	NearX: ["Education"],
	"Soroban Academy": ["Education"],
	"Stellar Quest": ["Education", "Gaming"],
	"Rise In": ["Education"],
	Bigger: ["Education"],
	"Block by Block": ["Education"],
	"DFS Labs": ["Education"],
	OnBoarding: ["Education"],
	"OnBoarding Club": ["Education"],
	"Stellar Global": ["Education"],

	// Gaming
	Dogstar: ["Gaming", "Education"],
	"Token Tails": ["Gaming"],
	Kale: ["Gaming"],

	// NFT / Social
	Ziriz: ["NFT"],

	// Fintech / RWA
	"Lumos DAO": ["SDK"],
	Tauvlo: ["RWA"],
	Benji: ["RWA"], // Franklin Templeton tokenized securities
	Taurus: ["RWA", "SDK"],
	"Stellar Carbon": ["RWA"],
	Arcturus: ["AI", "SDK"],

	// Fix wrong tags
	"Arka.fund": ["DEX"], // asset management, NOT lending
	"Peridot Finance": ["Lending", "Bridge"], // remove Wallet, AI

	// === Remaining untagged projects ===
	"Aha Labs": ["SDK"], // dev labs / entity, but SDK is closest type
	Answerly: ["Social Impact"], // content rewards platform
	Arrel: ["SDK"],
	Astrocore: ["SDK"],
	Astrograph: ["Explorer"],
	AuraPay: ["Payments"],
	AutoAction: ["SDK"],
	"BES Metaverse": ["Gaming"],
	BTQ: ["SDK"],
	Benkiko: ["SDK"],
	Canfy: ["AI", "SDK"],
	Catalyst: ["RWA"],
	ChainCred: ["Analytics"],
	Chaincerts: ["SDK"],
	"Chainlink Oracles Relayer": ["SDK"],
	ChainsAtlas: ["SDK"],
	Chef: ["SDK"],
	Chronospay: ["Payments"],
	"City States": ["Gaming"],
	"Command Robotics": ["SDK"], // robotics + blockchain integration
	"Cosmic.vote": ["SDK"], // decentralized governance voting
	Cryptix: ["SDK"],
	"DID:STELLAR": ["SDK"],
	idOS: ["Security"], // decentralized identity & storage layer
	DappRadar: ["Analytics"],
	DeFarm: ["RWA"],
	"EA Kazi": ["Payments"], // freelancer platform with payments
	EQLab: ["SDK"],
	Eara: ["RWA"],
	EarnBIT: ["DEX"],
	"Elio DAO": ["SDK"],
	Equilibre: ["Analytics", "Wallet"],
	EquitX: ["RWA"],
	"FROST Implementation": ["SDK", "Security"],
	Flipside: ["Analytics"],
	"Free Voting Platform": ["SDK"],
	GalacticTalk: ["Education"],
	GetBlockCard: ["Payments"],
	GrantFox: ["SDK"], // collaboration platform for Stellar ecosystem
	Greeppay: ["Payments"],
	"Haciendo Stellar": ["Education"],
	Ichi: ["DEX"],
	InstantDAO: ["SDK"],
	"K3 Labs": ["SDK"],
	Kryptos: ["Analytics"],
	Lantern: ["Lending"],
	Lettuce: ["Payments"],
	Liquify: ["SDK"],
	LumosDAO: ["SDK"],
	MultiClique: ["SDK", "Security"],
	Neovestor: ["RWA"],
	NiceTrade: ["DEX"],
	Nodies: ["SDK"],
	"PAYGO Crypto": ["Payments"],
	"Planet Pay": ["SDK"],
	Prophe: ["SDK"],
	Puenta: ["Payments"],
	Quidroo: ["Payments"],
	RaumFi: ["DEX", "Lending"],
	"Redstone Finance": ["SDK"],
	"SGF Solutions": ["Payments", "Anchor"],
	Sanctum: ["SDK", "Security"],
	Scorechain: ["Security", "Analytics"],
	Sendit: ["Payments"],
	"Simple Signer": ["SDK", "Wallet"],
	"Smart Deploy": ["SDK"],
	Solang: ["SDK"],
	Soracle: ["SDK"],
	"Soroban Copilot": ["SDK"],
	"Soroban Timelock Contract": ["SDK"],
	Sorobix: ["SDK"],
	"Lumen Loop": ["Education"], // ecosystem news aggregator, not a block explorer
	"Cosmic.link": ["SDK"], // transactions over URL
	Ripe: ["Anchor"], // anchor to GCash Philippines
	Interlinked: ["SDK"], // decentralized link shortener, not a bridge
	Cede: ["Bridge"], // CEX-DeFi liquidity flow
	"Pakana.Net": ["Payments", "SDK"], // payment and document processing
	TrustedPlastic: ["Social Impact", "RWA"], // plastic waste collection

	// Anchor corrections — most "anchors" are just payment companies
	// Real Stellar anchors issue assets on-network (kept as Anchor above)
	// The following were wrongly tagged via keyword fallback:
	Airswift: ["Payments", "Lending"], // supply chain financing, not an anchor
	Bidali: ["Payments"], // gift card platform, not an anchor
	Bitwage: ["Payments"], // payroll platform, not an anchor
	Changera: ["Payments"], // remittance app, not an anchor
	Chipper: ["Payments"], // cross-border payments, not an anchor
	Cinko: ["Payments"], // cross-border payments, not an anchor
	"Felix Pago": ["Payments"], // US-Mexico remittance, not an anchor
	"Joona Pay": ["Payments"], // W. African merchant payments, not an anchor
	Kulipa: ["Payments"], // stablecoin card payments, not an anchor
	LINK: ["Payments"], // Africa cross-border payments, not an anchor
	Lemon: ["Wallet", "Payments"], // Argentine crypto wallet, not an anchor
	"Mozart Pay": ["Payments"], // e-commerce payments, not an anchor
	Oinc: ["Payments"], // LatAm personal finance, not an anchor
	Outbounder: ["Payments"], // humanitarian payment platform, not an anchor
	Pretium: ["Payments"], // African cross-border payments, not an anchor
	Ripio: ["Wallet", "Payments"], // LatAm crypto platform, not an anchor
	Shiga: ["Payments", "SDK"], // fintech infra, not an anchor
	"Tago Cash": ["Wallet", "Payments"], // digital wallet, not an anchor
	Tala: ["Payments", "Lending"], // financial services / micro-lending
	Tribal: ["Payments", "Lending"], // corporate credit, not an anchor
	Triiyo: ["Payments"], // expat services payments, not an anchor
	Wagelink: ["Payments"], // payroll, not an anchor
	Wave: ["Payments"], // African mobile money, not an anchor
	Whalestack: ["Payments"], // enterprise crypto payments, not an anchor
	Yativo: ["SDK", "Payments"], // financial infra platform, not an anchor
	Zebec: ["Payments"], // streaming payments, not an anchor
	Silicore: ["Education"], // education about anchors, not an anchor itself
	"PHP Anchor SDK": ["SDK"], // SDK for building anchors, not an anchor itself
	Autify: ["Payments"], // cross-border infra, not an anchor
	Freelii: ["Wallet"], // noncustodial wallet, not an anchor
	Lenme: ["Lending"], // P2P lending, not a payment rail or anchor

	// Wrong tag fixes from deep audit
	BorderDollar: ["RWA"], // RWA investment platform, not payment rail
	MUWP: ["DEX", "Bridge"], // cross-chain token swaps, not payment rail
	Syklo: ["Wallet", "Lending"], // DeFi yield wallet on Blend, not payment rail
	DeFindex: ["Lending"], // savings accounts for wallet providers, not DEX
	StarLoom: ["DEX"], // launchpad with SocioFi, not SDK
	MugglePay: ["Payments"], // merchant crypto acceptance, not SDK
	GiveCredit: ["Social Impact"], // carbon offset donations, not payment rail/RWA
	Qolaq: ["Social Impact"], // mutual aid / insurance, not lending
	Constellation: ["RWA", "DEX"], // tokenized indexes
	"Legacy Suite": ["Wallet", "RWA"], // estate planning with digital assets
	SecuRx: ["SDK"], // medical prescriptions on blockchain, not RWA
	Relax: ["SDK"], // HR data tracking, not RWA
	Nobak: ["Education"], // Soroban playground/education

	// Education / Content
	"5x Crypto": ["Education"], // crypto education content
	"BAF Network": ["Education"], // community education
	"Roberto Sanz": ["Education"], // content creator
	"Hi Fifo": ["Education"], // YouTube content creator
	"Luminary's Archive": ["Education"], // YouTube content creator
	"Tellus Cooperative": ["Social Impact", "Education"], // sustainable finance LatAm
};

// Keyword-based rules (fallback)
const TAG_RULES: { type: string; keywords: string[] }[] = [
	{
		type: "Wallet",
		keywords: ["wallet", "custodial wallet", "browser extension wallet"],
	},
	{
		type: "DEX",
		keywords: [
			"dex",
			"decentralized exchange",
			"amm",
			"automated market maker",
			"swap protocol",
			"trading protocol",
			"liquidity pool",
			"order book",
		],
	},
	{
		type: "Lending",
		keywords: [
			"lending",
			"borrowing",
			"loan",
			"collateral",
			"yield",
			"interest rate",
			"credit protocol",
		],
	},
	{
		type: "Bridge",
		keywords: [
			"bridge",
			"cross-chain",
			"interoperability",
			"multi-chain",
			"multichain",
		],
	},
	{
		type: "Payments",
		keywords: [
			"payment",
			"remittance",
			"cross-border",
			"on-ramp",
			"off-ramp",
			"p2p transfer",
			"tipping",
			"payroll",
			"invoice",
			"checkout",
		],
	},
	{
		type: "Anchor",
		keywords: [
			"stellar anchor",
			"sep-24",
			"sep-6",
			"sep-31",
			"fiat gateway",
			"on/off ramp anchor",
		],
	},
	{
		type: "SDK",
		keywords: [
			" sdk",
			"developer tool",
			"api ",
			"plugin",
			"library",
			"framework",
		],
	},
	{
		type: "Explorer",
		keywords: [
			"explorer",
			"block explorer",
			"transaction viewer",
			"blockchain explorer",
		],
	},
	{ type: "Indexer", keywords: ["indexer", "subgraph", "data indexing"] },
	{
		type: "Analytics",
		keywords: [
			"analytics",
			"dashboard",
			"metrics",
			"data platform",
			"monitoring",
		],
	},
	{
		type: "AI",
		keywords: [
			" ai ",
			"artificial intelligence",
			"machine learning",
			"neural",
			"llm",
		],
	},
	{
		type: "Gaming",
		keywords: ["game", "gaming", "play-to-earn", "gamified", "gamification"],
	},
	{
		type: "Education",
		keywords: [
			"education",
			"learn",
			"tutorial",
			"bootcamp",
			"course",
			"workshop",
		],
	},
	{
		type: "Security",
		keywords: [
			"security",
			"audit",
			"scam",
			"antivirus",
			"vulnerability",
			"formal verification",
		],
	},
	{
		type: "NFT",
		keywords: ["nft", "non-fungible", "collectible", "digital art"],
	},
	{
		type: "RWA",
		keywords: [
			"real world asset",
			"tokeniz",
			"real estate",
			"commodity",
			"gold-backed",
			"carbon credit",
			"supply chain",
		],
	},
];

function inferTypes(name: string, desc: string): string[] {
	const searchText = `${name} ${desc}`.toLowerCase();
	const types: Set<string> = new Set();

	for (const rule of TAG_RULES) {
		for (const kw of rule.keywords) {
			if (searchText.includes(kw.toLowerCase())) {
				types.add(rule.type);
				break;
			}
		}
	}

	return Array.from(types);
}

export async function GET(request: NextRequest) {
	// Simple secret check — use query param ?secret=tag123
	const secret = request.nextUrl.searchParams.get("secret");
	if (secret !== "tag123") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const dryRun =
		request.nextUrl.searchParams.get("dry") === "true" ||
		request.nextUrl.searchParams.get("dry") === "1";

	const payload = await getPayload({ config });

	// Fetch all projects
	const allProjects: any[] = [];
	let page = 1;
	let hasNext = true;
	while (hasNext) {
		const result = await payload.find({
			collection: "projects",
			limit: 100,
			page,
			depth: 0,
		});
		allProjects.push(...result.docs);
		hasNext = result.hasNextPage;
		page++;
	}

	// --- Migration: rename "Payment Rail" → "Payments" in all projects ---
	let migrated = 0;
	for (const project of allProjects) {
		const types: string[] = project.types || [];
		if (types.includes("Payment Rail")) {
			const newTypes = types.map((t: string) =>
				t === "Payment Rail" ? "Payments" : t,
			);
			if (!dryRun) {
				await payload.update({
					collection: "projects",
					id: project.id,
					data: { types: newTypes as any },
				});
			}
			project.types = newTypes; // update in-memory for tagging pass
			migrated++;
		}
	}

	const results: any[] = [];
	let updated = 0;
	let skipped = 0;

	for (const project of allProjects) {
		const currentTypes: string[] = project.types || [];
		const name = project.name || "";

		// Check explicit override
		const override = EXPLICIT_OVERRIDES[name];
		if (override) {
			const sortedCurrent = [...currentTypes].sort().join(",");
			const sortedNew = [...override].sort().join(",");
			if (sortedCurrent === sortedNew) {
				skipped++;
				continue;
			}

			if (!dryRun) {
				await payload.update({
					collection: "projects",
					id: project.id,
					data: { types: override as any },
				});
			}
			results.push({
				name,
				from: currentTypes,
				to: override,
				source: "explicit",
			});
			updated++;
			continue;
		}

		// Skip already tagged
		if (currentTypes.length > 0) {
			skipped++;
			continue;
		}

		// Try keyword inference
		const inferred = inferTypes(name, project.shortDescription || "");
		if (inferred.length === 0) {
			skipped++;
			continue;
		}

		if (!dryRun) {
			await payload.update({
				collection: "projects",
				id: project.id,
				data: { types: inferred as any },
			});
		}
		results.push({
			name,
			from: currentTypes,
			to: inferred,
			source: "inferred",
		});
		updated++;
	}

	return NextResponse.json({
		dryRun,
		total: allProjects.length,
		migrated,
		updated,
		skipped,
		changes: results,
	});
}
