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
	builder: string;
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
	winners: RecentWinner[];
}

/**
 * Most recently completed Stellar hackathon with announced winners.
 * Update this when a newer one finishes.
 */
export const LATEST_WINNERS: RecentHackathonWinners = {
	hackathonName: "Stellar Hacks: Agents",
	hackathonUname: "stellar-agents-x402-stripe-mpp",
	endedAt: "2026-04-13",
	totalPrizePool: 10000,
	winners: [
		{
			rank: 1,
			placementLabel: "1st Place",
			projectName: "Cards402",
			builder: "Ash Francis",
			description:
				"Stellar-powered wallets for AI agents with instant virtual Visa card issuance.",
			prizeUsd: 5000,
			dorahacksBuidlUrl: "https://dorahacks.io/buidl/42819",
		},
		{
			rank: 2,
			placementLabel: "2nd Place",
			projectName: "clevercon",
			builder: "Bosun",
			description:
				"Trustless AI agent marketplace with Soroban-secured USDC payments.",
			prizeUsd: 2000,
		},
		{
			rank: 3,
			placementLabel: "3rd Place",
			projectName: "RenderGate",
			builder: "tantk",
			description: "Website rendering for AI agents — pay per render via x402.",
			prizeUsd: 1250,
		},
		{
			rank: 4,
			placementLabel: "4th Place",
			projectName: "x402-mcp-stellar-template",
			builder: "Fabian Farinas",
			description:
				"Drop-in x402 middleware for Node and Python — minimal setup for paid MCP servers on Stellar.",
			prizeUsd: 1000,
		},
		{
			rank: 5,
			placementLabel: "5th Place",
			projectName: "TollPay",
			builder: "Raj Karia",
			description:
				"Stripe for MCP servers — per-call USDC micropayments on Stellar for AI tool usage.",
			prizeUsd: 750,
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
