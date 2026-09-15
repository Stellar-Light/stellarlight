/**
 * Category landing pages — /directory/wallets, /directory/dex, and so on.
 *
 * WHY THESE EXIST. Nobody searches "directory". They search "stellar wallets",
 * "stellar anchors", "stellar lending". Those pages did not exist: the only way
 * to see a filtered view was /directory?type=Wallet, and a query parameter is a
 * poor ranking target — it shares its title, description and canonical with the
 * unfiltered page, so there was nothing for a crawler to rank against the query
 * someone actually typed.
 *
 * Each entry is a real slice of the index with its own inventory (Payments 273,
 * RWA 94, Wallet 71, Stablecoin 58 on 2026-09-15), not a generated permutation.
 * A type with nothing behind it would be a doorway page, so MIN_ROWS gates what
 * gets a page and what stays a filter.
 */

export interface DirectoryCategory {
	/** URL segment. */
	slug: string;
	/** The `types` value stored on a project row. */
	type: string;
	/** <h1> and the leading half of <title>. */
	heading: string;
	/** Meta description — written per category, never templated. */
	description: string;
}

/** A category needs this many live rows before it earns a page of its own. */
export const MIN_ROWS = 5;

export const DIRECTORY_CATEGORIES: DirectoryCategory[] = [
	{
		slug: "payments",
		type: "Payments",
		heading: "Stellar Payments Projects",
		description:
			"Payment products built on Stellar: remittance corridors, payout rails, merchant acceptance and treasury tooling, each with its live status, code activity and funding history.",
	},
	{
		slug: "wallets",
		type: "Wallet",
		heading: "Stellar Wallets",
		description:
			"Wallets that hold XLM and Stellar-issued assets — custodial, self-custody, smart-contract and passkey wallets — with the platforms each one ships on and whether it is still maintained.",
	},
	{
		slug: "rwa",
		type: "RWA",
		heading: "Real-World Assets on Stellar",
		description:
			"Tokenized real-world assets on Stellar: treasuries, real estate, credit, commodities and receivables, with the issuer behind each one and what is actually on chain.",
	},
	{
		slug: "stablecoins",
		type: "Stablecoin",
		heading: "Stellar Stablecoin Projects",
		description:
			"Projects issuing or building on Stellar stablecoins, with their issuers, pegs and integrations. For the assets themselves and their live supply, see /stablecoins.",
	},
	{
		slug: "dex",
		type: "DEX",
		heading: "Stellar DEXs & AMMs",
		description:
			"Decentralized exchanges and automated market makers on Stellar and Soroban, with liquidity venues, aggregators and the contracts behind them.",
	},
	{
		slug: "lending",
		type: "Lending",
		heading: "Stellar Lending & Borrowing",
		description:
			"Money markets, lending pools and credit protocols on Stellar, with the contracts they run on mainnet and their audit history.",
	},
	{
		slug: "anchors",
		type: "Anchor",
		heading: "Stellar Anchors",
		description:
			"Anchors connecting Stellar to local currency: on and off ramps, SEP-6, SEP-24 and SEP-31 implementations, with the corridors each one serves.",
	},
	{
		slug: "infrastructure",
		type: "Infrastructure",
		heading: "Stellar Infrastructure",
		description:
			"Core infrastructure for Stellar: node operators, data providers, custody, compliance and the services other builders depend on.",
	},
	{
		slug: "bridges",
		type: "Bridge",
		heading: "Stellar Bridges & Cross-Chain",
		description:
			"Bridges and cross-chain routes into and out of Stellar, with the assets each one carries and the mechanism behind the transfer.",
	},
	{
		slug: "developer-tools",
		type: "SDK",
		heading: "Stellar SDKs & Developer Tools",
		description:
			"SDKs, CLIs and developer tooling for building on Stellar and Soroban, with the languages each supports and how actively it is maintained.",
	},
	{
		slug: "explorers",
		type: "Explorer",
		heading: "Stellar Block Explorers",
		description:
			"Explorers for Stellar accounts, transactions, assets and Soroban contracts, with what each one indexes.",
	},
	{
		slug: "analytics",
		type: "Analytics",
		heading: "Stellar Analytics & Data",
		description:
			"Analytics, dashboards and data products covering Stellar network activity, asset flows and protocol metrics.",
	},
	{
		slug: "oracles",
		type: "Oracle",
		heading: "Stellar Oracles",
		description:
			"Price feeds and oracle networks serving Soroban contracts, with the assets each one publishes and how often.",
	},
	{
		slug: "nft",
		type: "NFT",
		heading: "Stellar NFT Projects",
		description:
			"NFT marketplaces, collections, minting tools and ticketing built on Stellar and Soroban, with what each project has actually shipped and whether the contracts are live on mainnet.",
	},
	{
		slug: "gaming",
		type: "Gaming",
		heading: "Stellar Gaming Projects",
		description:
			"Games and gaming infrastructure built on Stellar: in-game assets, player payments and studio tooling, with what each project has shipped and how recently its code moved.",
	},
	{
		slug: "ai",
		type: "AI",
		heading: "AI Projects on Stellar",
		description:
			"AI agents, agent payments and machine-to-machine products built on Stellar, including x402 and agentic payment rails.",
	},
	{
		slug: "security",
		type: "Security",
		heading: "Stellar Security & Audits",
		description:
			"Security firms, audit providers and safety tooling serving Stellar and Soroban builders.",
	},
	{
		slug: "exchanges",
		type: "Exchange",
		heading: "Exchanges Supporting Stellar",
		description:
			"Centralized and hybrid exchanges listing XLM and Stellar-issued assets, with the pairs and services each offers.",
	},
	{
		slug: "card-issuing",
		type: "Card Issuing",
		heading: "Stellar Card Programs",
		description:
			"Card issuing and spending products backed by Stellar assets, with the regions each one serves.",
	},
	{
		slug: "yield",
		type: "Yield",
		heading: "Yield Products on Stellar",
		description:
			"Yield-bearing products and strategies on Stellar, with the source of the yield in each case.",
	},
	{
		slug: "social-impact",
		type: "Social Impact",
		heading: "Social Impact Projects on Stellar",
		description:
			"Humanitarian, financial-inclusion and public-good projects using Stellar, with the programs each one runs.",
	},
	{
		slug: "education",
		type: "Education",
		heading: "Stellar Education & Learning",
		description:
			"Courses, bootcamps, docs sites and learning resources for building on Stellar and Soroban, with who runs each programme and whether it is still being taught.",
	},
	{
		slug: "indexers",
		type: "Indexer",
		heading: "Stellar Indexers",
		description:
			"Indexing services and subgraph-style data layers for Stellar and Soroban contract events, with the networks each one covers and how its data is exposed to builders.",
	},
	{
		slug: "rpc",
		type: "RPC",
		heading: "Stellar RPC Providers",
		description:
			"RPC and Horizon providers serving Stellar and Soroban applications, with the networks each one covers.",
	},
];

export function categoryBySlug(slug: string): DirectoryCategory | undefined {
	return DIRECTORY_CATEGORIES.find((c) => c.slug === slug);
}
