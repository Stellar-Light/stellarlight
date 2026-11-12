/**
 * Oracle products on Stellar (sls-029): one row per provider contract on each
 * network, every address read from where it is published and checked on
 * chain on `asOf`.
 *
 * This file is the IDENTITY half: who publishes which contract on which
 * network, and how the contract is read. It never carries a freshness claim.
 * Whether a feed is updating is what scripts/refresh-oracle-feeds.ts reads
 * from the chain into the oracle-readings collection, dated per check; the
 * search route joins that reading onto the record (src/lib/oracle-products.ts).
 * Stored `products` rows of kind oracle-feed are not served for a provider
 * listed here: this registry is their one writer.
 *
 * Checked 2026-11-11, contract instances read with getLedgerEntries
 * (mainnet.sorobanrpc.com, soroban-testnet.stellar.org):
 *  - every live row below had a contract instance on its network;
 *  - the three retired rows had none, and a simulated call returned
 *    Error(Storage, MissingValue) with no restore preamble (not archived).
 *    Testnet's ledger history starts 2025-12-17 (horizon-testnet's first
 *    ledger), so an address published before that reset no longer exists.
 */

/** How the lane reads a contract (src/lib/oracle-observe.ts). */
export const ORACLE_READ_METHODS = [
	"sep40-lastprice",
	"reflector-beam-last-timestamp",
	"chainlink-latest-round",
	"band-reference-data",
	"redstone-adapter-read",
	"pull-verifier",
	"instance-only",
] as const;
export type OracleReadMethod = (typeof ORACLE_READ_METHODS)[number];

/** Raven's address tiers (sls-029). official-address = the provider itself
 * publishes the address (docs, repository, app or config); directory-only =
 * only a third-party directory (Stellar's oracle-providers page) does.
 * provider-announced is no tier here: a provider that announced Stellar
 * support without an address has no record, and its products stay null. */
export const ORACLE_ADDRESS_TIERS = [
	"official-address",
	"directory-only",
] as const;
export type OracleAddressTier = (typeof ORACLE_ADDRESS_TIERS)[number];

export interface OracleProduct {
	/** Directory project slug of the provider. */
	slug: string;
	name: string;
	network: "mainnet" | "testnet";
	contractId: string;
	/** live = a contract instance existed on asOf; retired = the published
	 * address held no contract on asOf. Never a freshness claim. */
	status: "live" | "retired";
	read: OracleReadMethod;
	addressTier: OracleAddressTier;
	evidenceUrl: string;
	/** YYYY-MM-DD the address was read at evidenceUrl and checked on chain. */
	asOf: string;
	note: string;
	/** chainlink-latest-round and redstone-adapter-read: the provider's
	 * machine-readable feed list, read on every run. */
	feedListUrl?: string;
	/** A heartbeat the provider publishes for this contract beyond its
	 * on-chain resolution(); the lane's age bound is twice the longer one. */
	heartbeatSeconds?: number;
	/** band-reference-data: the symbols to read, as neither the contract nor
	 * the provider lists them, with where and when they were seeded. */
	feeds?: Array<{ id: string }>;
	feedSeed?: { sourceUrl: string; asOf: string };
}

const ASOF = "2026-11-11";
const STELLAR_DOCS =
	"https://developers.stellar.org/docs/data/oracles/oracle-providers";
const REFLECTOR_MAINNET = "https://orchestrator.reflector.network/config";
const REFLECTOR_TESTNET =
	"https://orchestrator-testnet.reflector.network/config";
/** Reflector's testnet config sets priceHeartbeat 7200000 ms; its mainnet
 * config sets none. */
const REFLECTOR_TESTNET_HEARTBEAT = 7200;
const REDSTONE_APP =
	"https://app.redstone.finance/push-feeds?networks=stellar&testnets=true";
const PULSE =
	"Reflector Pulse: free SEP-40 reads; Reflector states a uniform update interval, resolution().";
const BEAM =
	"Reflector Beam: SEP-40 reads need prepaid per-asset access bought with XRF, so per-asset prices are not publicly readable; the contract's own last_timestamp is.";

/** RedStone's relayer manifests (its own published, machine-readable feed
 * lists: adapter contract, feed ids, per-feed contracts, update triggers). */
const REDSTONE_MANIFEST = (name: string) =>
	`https://raw.githubusercontent.com/redstone-finance/redstone-oracles-monorepo/main/packages/relayer-remote-config/main/relayer-manifests-non-evm/${name}.json`;
/** Band's relay transactions, where the seeded symbols were read. */
const BAND_RELAYS =
	"https://horizon.stellar.org/accounts/GBQ3IVOX6M7SYIOPQIMKZUKDDXIYCXTEOU34USTGFJ4NEYCQU27LH6Q3/operations?order=desc";

export const ORACLE_REGISTRY: OracleProduct[] = [
	// ── Band: the address is published on Stellar's page only; Band's docs,
	// blog and band-std-reference-contracts-soroban README name none.
	{
		slug: "band",
		name: "Band StandardReference",
		network: "mainnet",
		contractId: "CCQXWMZVM3KRTXTUPTN53YHL272QGKF32L7XEDNZ2S6OSUFK3NFBGG5M",
		status: "live",
		read: "band-reference-data",
		addressTier: "directory-only",
		evidenceUrl: STELLAR_DOCS,
		asOf: ASOF,
		note: "Band's blog, Soroban repository and supported-blockchains page give no Stellar update interval or feed list; the symbols read here are the ones its relay transactions carried when seeded (feedList says where and when).",
		// ponytail: symbols seeded from the relay transactions read 2026-11-11;
		// a symbol Band adds later is not read until added here.
		feeds: [{ id: "XLM" }, { id: "USDC" }],
		feedSeed: { sourceUrl: BAND_RELAYS, asOf: ASOF },
	},
	{
		slug: "band",
		name: "Band StandardReference",
		network: "testnet",
		contractId: "CBRV5ZEQSSCQ4FFO64OF46I3UASBVEJNE5C2MCFWVIXL4Z7DMD7PJJMF",
		status: "retired",
		read: "band-reference-data",
		addressTier: "directory-only",
		evidenceUrl: STELLAR_DOCS,
		asOf: ASOF,
		note: "Listed on Stellar's oracle-providers page, but no contract exists at this address on testnet (checked 2026-11-11). Band's blog, Soroban repository and supported-blockchains page publish no replacement.",
		feeds: [{ id: "XLM" }, { id: "USDC" }],
		feedSeed: { sourceUrl: BAND_RELAYS, asOf: ASOF },
	},
	// ── DIA: its only published Stellar contract is this testnet one.
	{
		slug: "dia",
		name: "DIA oracle",
		network: "testnet",
		contractId: "CAEDPEZDRCEJCF73ASC5JGNKCIJDV2QJQSW6DJ6B74MYALBNKCJ5IFP4",
		status: "retired",
		read: "instance-only",
		addressTier: "official-address",
		evidenceUrl:
			"https://www.diadata.org/docs/guides/chain-specific-guide/stellar",
		asOf: ASOF,
		note: "DIA's Stellar guide and Stellar's oracle-providers page list this testnet contract, but no contract exists at this address on testnet (checked 2026-11-11). The guide names no mainnet contract.",
	},
	// ── Lightecho: README "Official Contracts" at bp-ventures/lightecho-stellar-oracle (trunk).
	{
		slug: "lightecho",
		name: "Lightecho SEP-40 oracle, base XLM",
		network: "mainnet",
		contractId: "CDOR3QD27WAAF4TK4MO33TGQXR6RPNANNVLOY277W2XVV6ZVJ6X6X42T",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: "https://github.com/bp-ventures/lightecho-stellar-oracle",
		asOf: ASOF,
		note: "The README's production contract. Its base-USD contract is listed as not deployed.",
	},
	{
		slug: "lightecho",
		name: "Lightecho SEP-40 oracle, base XLM",
		network: "testnet",
		contractId: "CA335SIV2XT6OC3SOUTZBHTX5IXMFO3WYBD3NNVBP37JXX4FXFNF5CI6",
		status: "retired",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: "https://github.com/bp-ventures/lightecho-stellar-oracle",
		asOf: ASOF,
		note: "The README's testnet contract; no contract exists at this address on testnet (checked 2026-11-11).",
	},
	// ── Reflector: the oracle contracts in Reflector's own orchestrator
	// config (its dao and subscriptions contracts are not oracles). Stellar's
	// oracle-providers page lists the three Pulse contracts per network.
	{
		slug: "reflector",
		name: "Reflector Pulse: Stellar DEX prices",
		network: "mainnet",
		contractId: "CALI2BYU2JE6WVRUFYTS6MSBNEHGJ35P4AVCZYF3B6QOE3QKOB2PLE6M",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_MAINNET,
		asOf: ASOF,
		note: `${PULSE} Data source pubnet (Stellar on-chain trades), quoted in USDC; assets are keyed by their Stellar asset contract.`,
	},
	{
		slug: "reflector",
		name: "Reflector Pulse: external CEX and DEX prices",
		network: "mainnet",
		contractId: "CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_MAINNET,
		asOf: ASOF,
		note: `${PULSE} Prices from external exchanges, quoted in USD.`,
	},
	{
		slug: "reflector",
		name: "Reflector Pulse: foreign exchange rates",
		network: "mainnet",
		contractId: "CBKGPWGKSKZF52CFHMTRR23TBWTPMRDIYZ4O2P5VS65BMHYH4DXMCJZC",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_MAINNET,
		asOf: ASOF,
		note: `${PULSE} Fiat and gold rates, quoted in USD.`,
	},
	{
		slug: "reflector",
		name: "Reflector Beam: Stellar DEX prices",
		network: "mainnet",
		contractId: "CCRVIC2R4W5XZTVBPQR4UNGZAFSVIFDLD64B6RPX2262F36P4ISEE2F7",
		status: "live",
		read: "reflector-beam-last-timestamp",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_MAINNET,
		asOf: ASOF,
		note: `${BEAM} Not on Stellar's oracle-providers page.`,
	},
	{
		slug: "reflector",
		name: "Reflector Pulse: Stellar DEX prices",
		network: "testnet",
		contractId: "CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_TESTNET,
		heartbeatSeconds: REFLECTOR_TESTNET_HEARTBEAT,
		asOf: ASOF,
		note: `${PULSE} Data source pubnet (mainnet on-chain trades) served on testnet, quoted in mainnet USDC.`,
	},
	{
		slug: "reflector",
		name: "Reflector Pulse: external CEX and DEX prices",
		network: "testnet",
		contractId: "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_TESTNET,
		heartbeatSeconds: REFLECTOR_TESTNET_HEARTBEAT,
		asOf: ASOF,
		note: `${PULSE} Prices from external exchanges, quoted in USD.`,
	},
	{
		slug: "reflector",
		name: "Reflector Pulse: foreign exchange rates",
		network: "testnet",
		contractId: "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_TESTNET,
		heartbeatSeconds: REFLECTOR_TESTNET_HEARTBEAT,
		asOf: ASOF,
		note: `${PULSE} Fiat and gold rates, quoted in USD.`,
	},
	{
		slug: "reflector",
		name: "Reflector Pulse: testnet DEX prices",
		network: "testnet",
		contractId: "CA2NWEPNC6BD5KELGJDVWWTXUE7ASDKTNQNL6DN3TGBVWFEWSVVGMUAF",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_TESTNET,
		heartbeatSeconds: REFLECTOR_TESTNET_HEARTBEAT,
		asOf: ASOF,
		note: `${PULSE} Data source testnet (testnet on-chain trades), quoted in testnet USDC. Not on Stellar's oracle-providers page.`,
	},
	{
		slug: "reflector",
		name: "Reflector Beam: external CEX and DEX prices",
		network: "testnet",
		contractId: "CAJ6ZBULX6AZA43GAO7EZ53ETTDGHS4LDHOZA6IQUQJ4XB4EYBJYGUUC",
		status: "live",
		read: "reflector-beam-last-timestamp",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_TESTNET,
		heartbeatSeconds: REFLECTOR_TESTNET_HEARTBEAT,
		asOf: ASOF,
		note: BEAM,
	},
	{
		slug: "reflector",
		name: "Reflector Beam: foreign exchange rates",
		network: "testnet",
		contractId: "CB2IB6YKLJ3N56MP2OTU7JQX7D6IJBK7HV4N2RO6YHTITP2YG6A3HRBI",
		status: "live",
		read: "reflector-beam-last-timestamp",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_TESTNET,
		heartbeatSeconds: REFLECTOR_TESTNET_HEARTBEAT,
		asOf: ASOF,
		note: BEAM,
	},
	{
		slug: "reflector",
		name: "Reflector Beam: Stellar DEX prices",
		network: "testnet",
		contractId: "CCQQHVZ2EG6TI6ULPIHIHXUKFIPP7UUKXPCDOWFT2Y7K7CLINUXDCJDR",
		status: "live",
		read: "reflector-beam-last-timestamp",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_TESTNET,
		heartbeatSeconds: REFLECTOR_TESTNET_HEARTBEAT,
		asOf: ASOF,
		note: BEAM,
	},
	{
		slug: "reflector",
		name: "Reflector Beam: testnet DEX prices",
		network: "testnet",
		contractId: "CDEIQLTE3Y3XQMYPSZFJC2OXIS67F4MURGP73NCE2C2NZZ22RNSPV7ZI",
		status: "live",
		read: "reflector-beam-last-timestamp",
		addressTier: "official-address",
		evidenceUrl: REFLECTOR_TESTNET,
		heartbeatSeconds: REFLECTOR_TESTNET_HEARTBEAT,
		asOf: ASOF,
		note: BEAM,
	},
	// ── RedStone: its app's Stellar push feeds and its relayer manifests
	// (the testnet SEP-40 contract is in the manifests, not the app). Every
	// MultiFeed feed is stored in the adapter; a per-feed contract reads it
	// from there. The lane reads each adapter's feed list from its manifest.
	{
		slug: "redstone-finance",
		name: "RedStone MultiFeed adapter",
		network: "mainnet",
		contractId: "CA526Y2NQWGWVVQ7RFFPGAZMU66PSYJ3UC2MTVAV4ZU7OM5BOPHDXUSG",
		status: "live",
		read: "redstone-adapter-read",
		addressTier: "official-address",
		evidenceUrl: REDSTONE_APP,
		asOf: ASOF,
		note: "Push model: a feed is written on its deviation threshold or heartbeat, and the adapter's checked read rejects a value past its staleness bound (30 hours in RedStone's published source). A feed's own contract, where it has one, is listed with the feed. RedStone's deployment files also hold a SolvBTC price feed contract (CA5ZDXNDNOR7RA6M6HAB5ZPITD2NU3DIW2AFJCBTV2MJHRUPQXNI2LSE) that its manifest no longer lists.",
		feedListUrl: REDSTONE_MANIFEST("stellarMultiFeed"),
	},
	{
		slug: "redstone-finance",
		name: "RedStone SEP-40 oracle",
		network: "mainnet",
		contractId: "CBMGLKUQZVSAIL5CPDDAWSUY7MAKXISHMOZEVLMBUWBMFGHRJSR4WYRF",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REDSTONE_APP,
		asOf: ASOF,
		note: "SEP-40 lastprice over MultiFeed adapter values, quoted in USD; most assets are keyed by their Stellar asset contract.",
	},
	{
		slug: "redstone-finance",
		name: "RedStone SEP-40 oracle for savUSD",
		network: "mainnet",
		contractId: "CBVKPBQVZEG5OQFAAY3W4ISJ77BK76OWKUWXVEUFK2RMX6LT2Q6E2NA6",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REDSTONE_APP,
		asOf: ASOF,
		note: "A separate SEP-40 contract quoted in avUSD.",
	},
	{
		slug: "redstone-finance",
		name: "RedStone MultiFeed adapter",
		network: "testnet",
		contractId: "CBIHT4HVRIT5OMVLSXZ44J2ZAXYBDDGOSCN3LTN2DOC6SWHDS5IP6BK3",
		status: "live",
		read: "redstone-adapter-read",
		addressTier: "official-address",
		evidenceUrl: REDSTONE_APP,
		asOf: ASOF,
		note: "Testnet MultiFeed adapter.",
		feedListUrl: REDSTONE_MANIFEST("stellarTestnetMultiFeed"),
	},
	{
		slug: "redstone-finance",
		name: "RedStone MultiFeed adapter (Rust relayer)",
		network: "testnet",
		contractId: "CD4KFB23CQLJ47RIPESVBTQ444R75M6QVEZULWXHHFYYZT7SS2VGXOPW",
		status: "live",
		read: "redstone-adapter-read",
		addressTier: "official-address",
		evidenceUrl: REDSTONE_APP,
		asOf: ASOF,
		note: "A second testnet adapter, listed in RedStone's manifests as stellarRustTestnetMultiFeed.",
		feedListUrl: REDSTONE_MANIFEST("stellarRustTestnetMultiFeed"),
	},
	{
		slug: "redstone-finance",
		name: "RedStone SEP-40 oracle",
		network: "testnet",
		contractId: "CA7MY6TYNL5Z5H5FYGMN7YWSY3JIZG7LFY3DZ26EEGRBQ2UKTFWHD4ZJ",
		status: "live",
		read: "sep40-lastprice",
		addressTier: "official-address",
		evidenceUrl: REDSTONE_MANIFEST("stellarTestnetSep40"),
		asOf: ASOF,
		note: "In RedStone's relayer manifest and deployment files, not in its app.",
	},
	// ── Chainlink: Data Feeds are one proxy per network, a feed chosen by
	// its 32-byte data_id; Data Streams verify signed reports per call.
	{
		slug: "chainlink",
		name: "Chainlink Data Feeds proxy",
		network: "mainnet",
		contractId: "CDQBHEUGLDHMSUHG4IH33RJBUTMNCZOT4JIAQR4WZFRDZW6DR6S32ZLZ",
		status: "live",
		read: "chainlink-latest-round",
		addressTier: "official-address",
		evidenceUrl: "https://docs.chain.link/data-feeds/stellar",
		asOf: ASOF,
		note: "One proxy serves every feed; a contract picks a feed by its data_id. Feeds and heartbeats come from Chainlink's published Stellar feed list.",
		feedListUrl:
			"https://docs.chain.link/files/json/feeds-stellar-mainnet.json",
	},
	{
		slug: "chainlink",
		name: "Chainlink Data Feeds proxy",
		network: "testnet",
		contractId: "CBUF6IADAWPWIDWRTHJNINKXHG2UTIQ6TU2F2HRAXWAI7OT3KJPKK6O4",
		status: "live",
		read: "chainlink-latest-round",
		addressTier: "official-address",
		evidenceUrl: "https://docs.chain.link/data-feeds/stellar",
		asOf: ASOF,
		note: "Same interface as the mainnet proxy.",
		feedListUrl:
			"https://docs.chain.link/files/json/feeds-stellar-testnet.json",
	},
	{
		slug: "chainlink",
		name: "Chainlink Data Streams verifier",
		network: "testnet",
		contractId: "CA7GVHWH4GRHE6GI7MHEKQZAOYO4GE7KRGSU3EOS3HYJRVLX3XEA4ONQ",
		status: "live",
		read: "pull-verifier",
		addressTier: "official-address",
		evidenceUrl:
			"https://docs.chain.link/data-streams/tutorials/stellar-onchain-report-verification",
		asOf: ASOF,
		note: "Pull model: an application verifies a signed report per call through the verifier; reports are not written to an on-chain feed. The address is the verifier Chainlink's testnet tutorial calls; Chainlink's Data Streams pages name no mainnet verifier for Stellar (checked 2026-11-11).",
	},
	// ── Pyth: Pyth Pro verifier contracts (docs.pyth.network contract addresses).
	{
		slug: "pyth",
		name: "Pyth Pro verifier",
		network: "mainnet",
		contractId: "CACZ3GBAKUPIAFRILUFO27J5RUH5GJ2VSJ46LP6GJYSKGDRTQ5MS3HCH",
		status: "live",
		read: "pull-verifier",
		addressTier: "official-address",
		evidenceUrl: "https://docs.pyth.network/pro/contract-addresses",
		asOf: ASOF,
		note: "Pull model: an application verifies a signed price update per call; prices are not written to an on-chain feed. Receiving the feeds requires a Pyth Pro subscription.",
	},
	{
		slug: "pyth",
		name: "Pyth Pro verifier",
		network: "testnet",
		contractId: "CAYFT5JE3UQTKT4Q6ZOZK4FXVYVT6RE3MFC7STA4UB6WAEGBT65MRU52",
		status: "live",
		read: "pull-verifier",
		addressTier: "official-address",
		evidenceUrl: "https://docs.pyth.network/pro/contract-addresses",
		asOf: ASOF,
		note: "Pull model, as on mainnet.",
	},
];
