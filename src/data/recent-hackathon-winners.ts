/**
 * Recent hackathon winners — surfaced as a featured highlight at the top
 * of /hackathons. Update this constant whenever a new Stellar hackathon
 * announces winners.
 *
 * No DB writes required. Pure static data the page reads at render time.
 */

export interface RecentWinner {
	rank: number; // 1 = 1st, 2 = 2nd, 3 = 3rd, etc.
	placementLabel: string; // "1st", "2nd", "Track Winner", etc.
	projectName: string;
	builder?: string; // omitted for live-derived winners (DoraHacks buidls don't expose a clean builder name)
	description: string;
	prizeUsd: number;
	dorahacksBuidlUrl?: string; // direct link to the DoraHacks BUIDL page
	builderPassportUrl?: string; // link to Stellar Passport profile, if known
}

export interface RecentHackathonWinners {
	hackathonName: string;
	hackathonUname: string; // for the DoraHacks deep-link
	endedAt: string; // ISO date
	totalPrizePool: number;
	/** External "all winners" page. undefined = construct the DoraHacks URL
	 * from hackathonUname (live-derived data); null = the event has NO
	 * external winners page (e.g. Builder Summit SP 26, which never ran on
	 * DoraHacks) — the carousel hides its header link instead of shipping a
	 * dead one. */
	winnersPageUrl?: string | null;
	winners: RecentWinner[];
}

/**
 * Most recently completed Stellar hackathon with announced winners.
 * Update this when a newer one finishes.
 */
export const LATEST_WINNERS: RecentHackathonWinners = {
	hackathonName: "Stellar Builder Summit SP 26",
	hackathonUname: "stellar-builder-summit-2026",
	endedAt: "2026-08-07",
	totalPrizePool: 10000,
	// Not a DoraHacks event — there is no external winners page, and the
	// hackathonUname-constructed URL 404s. Cards deep-link to our own
	// project pages instead (dorahacksBuidlUrl predates non-DoraHacks
	// events; it is simply the card's destination).
	winnersPageUrl: null,
	// The 12 build-bounty winners. Five content-bounty winners (tutorial /
	// video tracks, $100 each, no repos) complete the $10k pool but are not
	// product builds, so the product highlight omits them:
	// ChatPay Go Labs, FASIS (×3 tracks), Block Girls.
	winners: [
		{
			rank: 1,
			placementLabel: "1st — Confidential Wallets",
			projectName: "OpenZeppelin Stellar Privacy Wallet",
			builder: "coderipper",
			description:
				"Confidential-token, private-payment wallet built on OpenZeppelin's Stellar stack.",
			prizeUsd: 1250,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/openzeppelin-stellar-privacy-wallet",
		},
		{
			rank: 1,
			placementLabel: "1st — Agentic Payments (x402/MPP)",
			projectName: "StellarPay (x402)",
			builder: "coderipper",
			description: "Agentic payments over x402/MPP on Stellar.",
			prizeUsd: 1000,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/stellarpay-x402",
		},
		{
			rank: 1,
			placementLabel: "1st — Brazil Ramps & Regional Kits",
			projectName: "ACTA Brazil Regional Kit",
			builder: "ACTA",
			description: "Brazil-first ramps and regional integration kit.",
			prizeUsd: 1000,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/acta",
		},
		{
			rank: 1,
			placementLabel: "1st — Enterprise, Compliance & RWA",
			projectName: "QuietBook",
			builder: "Kaptan_web3",
			description: "Enterprise compliance and RWA build.",
			prizeUsd: 1000,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/quietbook",
		},
		{
			rank: 1,
			placementLabel: "1st — CLI Plugins for Agents",
			projectName: "Stellar Memory",
			builder: "Raiz Protocol",
			description: "Memory CLI plugin for Stellar agents.",
			prizeUsd: 750,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/stellar-memory",
		},
		{
			rank: 1,
			placementLabel: "1st — Emerging-Market Yield",
			projectName: "Truway",
			builder: "Truway",
			description: "Brazil-first emerging-market yield build.",
			prizeUsd: 750,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/truway-yield",
		},
		{
			rank: 2,
			placementLabel: "2nd — Agentic Payments (x402/MPP)",
			projectName: "Sextant",
			builder: "El Guri",
			description: "Agentic payments build over x402/MPP.",
			prizeUsd: 750,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/sextant-agent",
		},
		{
			rank: 2,
			placementLabel: "2nd — Brazil Ramps & Regional Kits",
			projectName: "LatAm Ramp Kit",
			builder: "TrustlessWork",
			description: "LatAm on/off-ramp integration kit.",
			prizeUsd: 750,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/trustless-work",
		},
		{
			rank: 2,
			placementLabel: "2nd — Confidential Wallets",
			projectName: "Stellar Confidential Token SDK",
			builder: "aguilar1x",
			description: "SDK for confidential tokens on Stellar.",
			prizeUsd: 750,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/stellar-confidential-token-sdk",
		},
		{
			rank: 2,
			placementLabel: "2nd — CLI Plugins for Agents",
			projectName: "Teji",
			builder: "Always Cooking",
			description: "CLI plugin for Stellar agents.",
			prizeUsd: 500,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/teji",
		},
		{
			rank: 2,
			placementLabel: "2nd — Emerging-Market Yield",
			projectName: "EnergyPay Tesouro Yield",
			builder: "Fenix",
			description: "Brazilian treasury-yield energy-payments build.",
			prizeUsd: 500,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/energypay-tesouro-yield",
		},
		{
			rank: 2,
			placementLabel: "2nd — Enterprise, Compliance & RWA",
			projectName: "Trustless Work privacy PoC",
			builder: "Green Road",
			description: "Privacy proof-of-concept on Trustless Work.",
			prizeUsd: 500,
			dorahacksBuidlUrl: "https://stellarlight.xyz/project/trustless-work",
		},
	],
};


/**
 * Fallback when a winner doesn't have a direct BUIDL URL — link to the
 * hackathon's winner page so users can find the project there.
 */
export function getWinnerLink(winner: RecentWinner): string {
	return (
		winner.dorahacksBuidlUrl ??
		`https://dorahacks.io/hackathon/${LATEST_WINNERS.hackathonUname}/winner`
	);
}
