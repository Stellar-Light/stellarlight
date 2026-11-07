/**
 * An asset's supply on Stellar from Horizon's own /assets record: free, keyless
 * and served by the network itself, where stellar.expert's API (x402, per
 * request) and rwa.xyz's asset API (moved off its public v4 path) went paid in
 * November 2026.
 *
 * Always one code AND one pinned issuer, never a code alone: BENJI has 22
 * issuers on mainnet, several of them impersonating Franklin Templeton (see
 * the registry's verification note in src/data/rwa-registry.ts).
 */
export const HORIZON = "https://horizon.stellar.org";

export const horizonAssetUrl = (code: string, issuer: string) =>
	`${HORIZON}/assets?asset_code=${encodeURIComponent(code)}&asset_issuer=${encodeURIComponent(issuer)}`;

const STROOPS = 10_000_000n;

/** A Horizon amount ("1150573406.8338513") in stroops, or null when it is not one. */
function stroopsOf(v: unknown): bigint | null {
	if (typeof v !== "string") return null;
	const m = /^(\d+)(?:\.(\d{1,7}))?$/.exec(v);
	if (!m) return null;
	return BigInt(m[1]) * STROOPS + BigInt((m[2] ?? "").padEnd(7, "0"));
}

/**
 * Every balance Horizon counts for the asset: trustlines in each
 * authorization state (a frozen trustline still holds the asset), claimable
 * balances, liquidity pools and Soroban contract balances. Summed in stroops
 * so a billion-unit supply keeps its decimals. Null when any bucket is not a
 * readable amount: an unreadable record is unknown, never a supply of 0.
 */
export function supplyOfAssetRecord(record: unknown): number | null {
	const r = record as {
		balances?: Record<string, unknown>;
		claimable_balances_amount?: unknown;
		liquidity_pools_amount?: unknown;
		contracts_amount?: unknown;
	} | null;
	if (!r || typeof r.balances !== "object" || r.balances === null) return null;
	const parts = [
		r.balances.authorized,
		r.balances.authorized_to_maintain_liabilities,
		r.balances.unauthorized,
		r.claimable_balances_amount,
		r.liquidity_pools_amount,
		r.contracts_amount,
	].map(stroopsOf);
	if (parts.some((p) => p === null)) return null;
	const total = (parts as bigint[]).reduce((a, b) => a + b, 0n);
	return Number(total / STROOPS) + Number(total % STROOPS) / 1e7;
}

/**
 * The asset's supply now, with the time it was read. A failed read, an empty
 * record set (Horizon knows no such asset for this issuer) or an unreadable
 * record throws: the caller answers that as an outage, never as a figure.
 */
export async function horizonAssetSupply(
	code: string,
	issuer: string,
	fetchImpl: typeof fetch = fetch,
): Promise<{ supply: number; readAt: string }> {
	const url = horizonAssetUrl(code, issuer);
	const res = await fetchImpl(url, {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(10_000),
	});
	if (!res.ok) throw new Error(`Horizon answered ${res.status} for ${code}`);
	const body = (await res.json()) as {
		_embedded?: { records?: unknown[] };
	};
	const record = body._embedded?.records?.[0];
	if (!record) throw new Error(`Horizon holds no ${code} record for ${issuer}`);
	const supply = supplyOfAssetRecord(record);
	if (supply === null)
		throw new Error(`Horizon's ${code} record could not be read`);
	return { supply, readAt: new Date().toISOString() };
}
