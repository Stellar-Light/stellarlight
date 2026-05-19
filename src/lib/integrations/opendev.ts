/**
 * OpenDev Developer Metrics Integration — Stub
 *
 * Research findings:
 * - OpenDev (opendev.org) is primarily an OpenStack infrastructure
 *   tooling platform, not directly Stellar-related.
 * - For Stellar-specific developer metrics, the relevant sources are:
 *   1. GitHub API — Already integrated via src/lib/github.ts
 *   2. Stellar Expert (stellar.expert) — Block explorer with account/asset analytics
 *   3. Horizon API (horizon.stellar.org) — Ledger data, transactions, operations
 *   4. StellarBeat (stellarbeat.io) — Network node/validator monitoring
 *   5. SCF API (communityfund.stellar.org) — Already integrated for funding data
 *
 * Potential future integrations to consider:
 * - stellar.expert/explorer/public/api — Account stats, asset holders, DEX volume
 * - horizon.stellar.org — Transaction counts, smart contract invocations per project
 * - soroban-rpc — Soroban contract metrics (invocation count, TVL)
 *
 * Integration plan:
 * 1. Map project onchain addresses to Horizon accounts
 * 2. Fetch transaction/operation counts for each mapped account
 * 3. Store in Signals collection alongside GitHub data
 * 4. Display on project detail pages in a "Network Activity" section
 *
 * Estimated effort: 2-3 days for Horizon integration, 1 week for full dashboard
 */

// Placeholder types for future Stellar network metrics
export interface StellarMetrics {
	accountId: string;
	transactionCount: number;
	operationCount: number;
	lastTransactionAt: string | null;
	trustlineCount?: number;
	paymentVolume24h?: number;
}

/**
 * Fetch Stellar network metrics for a given account from Horizon.
 * Currently a stub — returns null. Implement when ready.
 */
export async function fetchStellarMetrics(
	_accountId: string,
): Promise<StellarMetrics | null> {
	// TODO: Implement when Horizon integration is approved
	// const response = await fetch(`https://horizon.stellar.org/accounts/${accountId}`);
	// const data = await response.json();
	// return { ... };
	return null;
}
