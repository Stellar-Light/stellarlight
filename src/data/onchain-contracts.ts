/**
 * Hand-verified on-chain join keys for directory projects: mainnet Soroban
 * contract addresses and issued assets, seeded ONLY from each project's own
 * primary sources (deployment manifests, READMEs, canonical issuer accounts).
 * A wrong link here silently misattributes on-chain activity, so entries
 * require a source URL and never come from memory or third-party guesses.
 *
 * Consumed by scripts/data/enrich-onchain-projects.ts, which fetches
 * per-contract activity (events/subinvocations/storage) and per-asset stats
 * (holders/supply) from stellar.expert and writes projects.onchain.
 *
 * Growth levers (deliberate, verified-only):
 *  - repos' codeVerified.mainnetContractId (README-claimed + echo-verified)
 *    merges automatically at enrich time — no entry needed here.
 *  - new flagship entries land here with their manifest/README URL.
 */

export interface OnchainSeed {
	/** Directory project slug (must exist — enrich verifies before writing). */
	slug: string;
	contracts?: Array<{
		address: string;
		/** Human label from the project's own naming (manifest key, README). */
		label: string;
	}>;
	asset?: { code: string; issuer: string };
	/** Primary source the addresses were read from. */
	source: string;
}

export const ONCHAIN_SEEDS: OnchainSeed[] = [
	{
		// blend-capital/blend-utils mainnet.contracts.json (verified 2026-07-20)
		slug: "blend",
		contracts: [
			{
				address: "CCZD6ESMOGMPWH2KRO4O7RGTAPGTUPFWFQBELQSS7ZUK63V3TZWETGAG",
				label: "pool factory",
			},
			{
				address: "CAO3AGAMZVRMHITL36EJ2VZQWKYRPWMQAPDQD5YEOF3GIF7T44U4JAL3",
				label: "backstop",
			},
			{
				address: "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD",
				label: "Fixed V2 pool",
			},
			{
				address: "CD25MNVTZDL4Y3XBCPCJXGXATV5WUHHOWMYFF4YBEGU5FCPGMYTVG5JY",
				label: "BLND token (SAC)",
			},
		],
		source:
			"https://github.com/blend-capital/blend-utils/blob/main/mainnet.contracts.json",
	},
	{
		// soroswap/core mainnet contracts manifest (verified 2026-07-20; router
		// confirmed active on stellar.expert with 200k+ subinvocations)
		slug: "soroswap",
		contracts: [
			{
				address: "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH",
				label: "aggregator router",
			},
		],
		source: "https://github.com/soroswap/core (mainnet.contracts.json)",
	},
	{
		// reflector-network/reflector-contract README (verified 2026-07-20)
		slug: "reflector",
		contracts: [
			{
				address: "CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN",
				label: "price oracle",
			},
			{
				address: "CBLLEW7HD2RWATVSMLAGWM4G3WCHSHDJ25ALP4DI6LULV5TU35N2CIZA",
				label: "price oracle",
			},
		],
		source:
			"https://github.com/reflector-network/reflector-contract/blob/master/README.md",
	},
	{
		// Canonical AQUA issuer (aqua.network stellar.toml; supply cross-checked
		// against the published 100B cap via stellar.expert, 2026-07-20)
		slug: "aquarius",
		asset: {
			code: "AQUA",
			issuer: "GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA",
		},
		source: "https://aqua.network/.well-known/stellar.toml",
	},
	{
		// Circle's canonical Stellar USDC issuer (circle.com stellar.toml)
		slug: "circle",
		asset: {
			code: "USDC",
			issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
		},
		source: "https://www.circle.com/.well-known/stellar.toml",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "allbridge",
		contracts: [
			{
				address: "CBQ6GW7QCFFE252QEVENUNG45KYHHBRO4IZIWFJOXEFANHPQUXX5NFWV",
				label: "Main Bridge Contract (Stellar)",
			},
			{
				address: "CAOTMWRKNMV5GWSVOMWCTCM5ZZFEQFUSWNLCZXA2KAXD4YG5A4DIPNFT",
				label: "Liquidity Pool — USDC (Stellar)",
			},
		],
		source:
			"https://docs-core.allbridge.io/product/how-does-allbridge-core-work/allbridge-core-contracts.md",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "phoenix",
		contracts: [
			{
				address: "CB4SVAWJA6TSRNOJZ7W2AWFW46D5VR4ZMFZKDIKXEINZCZEGZCJZCKMI",
				label: "FACTORY_ADDRESS",
			},
			{
				address: "CCLZRD4E72T7JCZCN3P7KNPYNXFYKQCL64ECLX7WP5GNVYPYJGU2IO2G",
				label: "MULTIHOP_ADDRESS",
			},
			{
				address: "CDEGWCGEMNFZT3UUQD7B4TTPDHXZLGEDB6WIP4PWNTXOR5EZD34HJ64O",
				label: "VESTING_ADDRESS",
			},
			{
				address: "CD5XNKK3B6BEF2N7ULNHHGAMOKZ7P6456BFNIHRF4WNTEDKBRWAE7IAA",
				label: "PHO_USDC_POOL_ADDRESS",
			},
			{
				address: "CBCZGGNOEUZG4CAAE7TGTQQHETZMKUT4OIPFHHPKEUX46U4KXBBZ3GLH",
				label: "XLM_PHO_POOL_ADDRESS",
			},
			{
				address: "CBHCRSVX3ZZ7EGTSYMKPEFGZNWRVCSESQR3UABET4MIW52N4EVU6BIZX",
				label: "XLM_USDC_POOL_ADDRESS",
			},
			{
				address: "CBISULYO5ZGS32WTNCBMEFCNKNSLFXCQ4Z3XHVDP4X4FLPSEALGSY3PS",
				label: "XLM_EURC_POOL_ADDRESS",
			},
		],
		source:
			"https://raw.githubusercontent.com/Phoenix-Protocol-Group/phoenix-contracts/main/scripts/upgrade_mainnet.sh",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "defindex",
		contracts: [
			{
				address: "CDKFHFJIET3A73A2YN4KV7NSV32S6YGQMUFH3DNJXLBWL4SKEGVRNFKI",
				label: "defindex_factory",
			},
			{
				address: "CDB2WMKQQNVZMEBY7Q7GZ5C7E7IAFSNMZ7GGVD6WKTCEWK7XOIAVZSAP",
				label: "usdc_blend_autocompound_fixed_strategy",
			},
			{
				address: "CC5CE6MWISDXT3MLNQ7R3FVILFVFEIH3COWGH45GJKL6BD2ZHF7F7JVI",
				label: "eurc_blend_autocompound_fixed_strategy",
			},
			{
				address: "CDPWNUW7UMCSVO36VAJSQHQECISPJLCVPDASKHRC5SEROAAZDUQ5DG2Z",
				label: "xlm_blend_autocompound_fixed_strategy",
			},
			{
				address: "CCBTSHPUVNKCT5V675AAVYNANHXBU26PTZK2QLS7ZLFNYRJZT5HW3VL6",
				label: "usdc_blend_autocompound_etherfuse_strategy",
			},
			{
				address: "CAZ3LLLKPWEOVK6K4G5NCQ2VXWABLFIPKKNMN5GLKMZKEN7JSKTEMIKN",
				label: "cetes_blend_autocompound_etherfuse_strategy",
			},
			{
				address: "CA3SO5RRKOONAPWVR5XY6CMOYZGN4M4QKVIGX5DFRIIJUJW2SFSELBXL",
				label: "ustry_blend_autocompound_etherfuse_strategy",
			},
			{
				address: "CDSCVJHJWUZQMR64FVK3XMND5NKSN7Z23KPRCHKFHVGOEJBWPVH5B5XA",
				label: "tesouro_blend_autocompound_etherfuse_strategy",
			},
		],
		source:
			"https://raw.githubusercontent.com/paltalabs/defindex/main/public/mainnet.contracts.json",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "etherfuse",
		asset: {
			code: "CETES",
			issuer: "GCRYUGD5NVARGXT56XEZI5CIFCQETYHAPQQTHO2O3IQZTHDH4LATMYWC",
		},
		source: "https://etherfuse.com/.well-known/stellar.toml",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "rozo",
		contracts: [
			{
				address: "CAC5SKP5FJT2ZZ7YLV4UCOM6Z5SQCCVPZWHLLLVQNQG2RWWOOSP3IYRL",
				label: "Rozo Intents V1 Contract (Stellar Mainnet)",
			},
		],
		source:
			"https://raw.githubusercontent.com/RozoAI/rozo-intents-contracts/main/README.md",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "velo",
		asset: {
			code: "VELO",
			issuer: "GDM4RQUQQUVSKQA7S6EM7XBZP3FCGH4Q7CL6TABQ7B2BEJ5ERARM2M5M",
		},
		source: "https://velo.org/.well-known/stellar.toml",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "huma",
		contracts: [
			{
				address: "CBQHYENQ7ANK5UEUOGEL5CMLZV3LUPS4IVR3EHXMMVYQTNMFOGPTLXBC",
				label: "ContractFactory",
			},
			{
				address: "CAXZGMU3EHOHGXGXDJWVPG5PIVC2DCZQ2JO2YI3RGSM4OQK7ZIQ46FV5",
				label: "HumaConfig",
			},
			{
				address: "CAADAYJOZF5HXPVZXBXA3PLCU7OSRW34OKVXG2676KAGZVZBI6EYQ73L",
				label: "PoolStorage",
			},
			{
				address: "CBFX4CMIWVOVFTJCRC5BYTBOXBZVJXNUI2D5UWM6WP4J2VBXRFYV4YQC",
				label: "PoolManager",
			},
			{
				address: "CDVJY4NLTSKNLHO2JIRKDERE366WYG3OSJY42VOLI7DBAX4X5Q2BY75O",
				label: "Pool",
			},
			{
				address: "CCXOG76F7A67FHR5OVJPGUVLHF55VOYJZADWEQDDMVLR66R3ODNRAIEP",
				label: "CreditStorage",
			},
			{
				address: "CBX7MQGXQN6DHGDDRARUH266PIIDTFB5H5HVFPFL365V2JJPX2OWZOZT",
				label: "CreditManager",
			},
			{
				address: "CC34OGI32WJDSGFES3HWSETSKPN5BQLDEYFHFTDVTUEL2HZLJG5M2UAJ",
				label: "Credit",
			},
			{
				address: "CDJ6AO57ZWBIDITDN32URXYQY6MTSFBNF6OFOCENRDE2MUB67UZKLKDP",
				label: "Junior/Senior Tranche (docs list one address for both)",
			},
		],
		source: "https://docs.huma.finance/ecosystem-resources/smart-contracts",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "untangled",
		contracts: [
			{
				address: "CBLC4NWJPBHWPXDL4TTXDZJLVZ2JFWMVZHQNI4MLZRNKYGIKGX6K4DMA",
				label: "USDyc Vault",
			},
		],
		source:
			"https://raw.githubusercontent.com/untangledfinance/untangled-docs/master/docs/Intro/03.Addresses.md",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "peridot-finance",
		contracts: [
			{
				address: "CCVUFGXKFVPAHWMMDDL6HXKUN2B2G73Z27VRM3WXZBBSQEUTNLI6YPEX",
				label: "Controller",
			},
			{
				address: "CCPJFBH5WSNZVMCUQCBM4X5334L6ZL3W4Q33XJAK45RCDHJ2JGJ5AP6A",
				label: "JRM Volatile (XLM)",
			},
			{
				address: "CCI5LBBNYOASPQ62GIRY54PDEYWWURJB75HNRAFOU4LTOU3XBC73IB5I",
				label: "JRM Stable (USDC + EURC)",
			},
			{
				address: "CDNJSOJKURHQUDBO7OHK7Z64R2CNMIAWXENHM24ALK7Y3H56EU6PUOKR",
				label: "PERI ($P) token",
			},
			{
				address: "CBU4Y7CJFOUZZE3QBOXTKM54UTUYW3SDJWTNMDGJBNCR5HS5UCEKV3BE",
				label: "Vault XLM",
			},
			{
				address: "CBVUJJIJTRJNOORPPCVH72DP7YDCOMDHI6WYKP3WOFVEPSCVP3TBXHIN",
				label: "Vault USDC",
			},
			{
				address: "CD3WN3PLW63HFZXE56OTRLMBV46WG54TFPGRL4RDQ43HQTTWVB4RPO3G",
				label: "Vault EURC",
			},
			{
				address: "CBP2R5KYAWJCOCVDTSNTEVL3O6JBTWOOH7SZOX7DX5DLGVZCAMLBDZM3",
				label: "Peridot EURC Vault (DeFindex)",
			},
			{
				address: "CAB4JOLSCNELJVDQKZLVGHKWJCLXFDBZZMITJAFL4GBGTHIKWO47PYFH",
				label: "Peridot USDC Vault (DeFindex)",
			},
		],
		source:
			"https://raw.githubusercontent.com/PeridotFinance/Peridot-Soroban/main/peridot-contracts/addresses.md",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "bondhive",
		contracts: [
			{
				address: "CB5LRBLBP5ATWIADFWKBBEAHET5VHPBHNI645CYEWAGZ3FJFCUZ77JJC",
				label: "BTC (Mar-25) pool vault",
			},
			{
				address: "CBEBQCQ7S6INRNRPDMSJHXXFQ3PRYJN6DVS6KSPPV4RIP7MCD55WYOGY",
				label: "BTC (Mar-25) VST share token (shareId)",
			},
			{
				address: "CATCQIV7C5QTCLMBXQ3LZ3U6BQFL5AMAFOKXNLSLDK6CLBFBJWO7CHVH",
				label: "ETH (Mar-25) pool vault",
			},
			{
				address: "CCZXWZIEUFSDHINYBS2NAVOOGG3U657EEXNGBUTIZAOMLFC2PYK6ZJDN",
				label: "ETH (Mar-25) VST share token (shareId)",
			},
			{
				address: "CA47LEDIUMKJ7LSDI3OLNTZFHMX6RX4PC7KADOM3OMAZ4SI4FK254OGW",
				label: "BTC (Dec-24) pool vault",
			},
			{
				address: "CBO43XS6UOAOUUQDEE7JRCJ7SCSXUGTW2PNNSR3V5TQVL7MDXZL6XQ7X",
				label: "BTC (Dec-24) VST share token (shareId)",
			},
			{
				address: "CBBB7U7R5DGPYRBZU4U7EN7SEXMA7GJZV53NDA6A5PPJQIBHBOVTT7HW",
				label: "ETH (Dec-24) pool vault",
			},
			{
				address: "CBBVLM6W5FEYKCKHRLNTTLITIHMYQ437LVY7I7HXCGTPXPW3P6O4ZYZD",
				label: "ETH (Dec-24) VST share token (shareId)",
			},
		],
		source:
			"https://raw.githubusercontent.com/Bond-Hive/interface/main/app/constants/poolOptions.ts",
	},
	{
		// high-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "yieldblox",
		contracts: [
			{
				address: "CCCCIQSDILITHMM7PBSLVDT5MISSY7R26MNZXCX4H7J5JQ5FPIYOGYFS",
				label: "YieldBlox V2 Pool (Blend pool)",
			},
			{
				address: "CANSYFVMIP7JVYEZQ463Y2I2VLEVNLDJJ4QNZTDBGLOOGKURPTW4A6FQ",
				label: "Governance (Soroban Governor)",
			},
		],
		source: "https://yieldblox.finance/",
	},
	{
		// medium-confidence, verified live 2026-07-20 (fan-out batch); see source
		slug: "xoxno",
		contracts: [
			{
				address: "CDA3XS2HETVCW5GSRN3FH4X3YJ45IA6DNVSZTEOYDFGOCXQK4ZJG22JM",
				label: "xoxno_oracle_adapter",
			},
			{
				address: "CCVENFSVCBYDHVOACFZXMNNYVOZ3LKXPZYU5LUI4N7KTXOKRVYD7F3TR",
				label: "aggregator",
			},
		],
		source:
			"https://raw.githubusercontent.com/XOXNO/rs-lending-xlm/main/configs/networks.json",
	},
];
