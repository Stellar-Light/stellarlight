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
];
