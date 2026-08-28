/**
 * The ONE serializer for a project's deployment fact (sls-079).
 *
 * Why a shared helper instead of three inline blocks: the first ship of this
 * field landed on one of the search route's THREE row builders, and the served
 * paths silently omitted it. One function used everywhere means the builders
 * cannot drift, and the semantics live where a unit test can pin them:
 *
 *  - network defaults to "unknown" — absence of evidence is never read as
 *    "not deployed", and a consumer must SEE that we do not know.
 *  - basis/sourceUrl/asOf pass through only when stored; never invented.
 */

export const DEPLOYMENT_NETWORKS = ["mainnet", "testnet", "unknown"] as const;
export type DeploymentNetwork = (typeof DEPLOYMENT_NETWORKS)[number];

export interface DeploymentFact {
	network: DeploymentNetwork;
	basis: string | null;
	sourceUrl: string | null;
	asOf: string | null;
}

export function pickDeployment(
	d:
		| {
				network?: string | null;
				basis?: string | null;
				sourceUrl?: string | null;
				asOf?: string | null;
		  }
		| null
		| undefined,
): DeploymentFact {
	const network = (DEPLOYMENT_NETWORKS as readonly string[]).includes(
		d?.network ?? "",
	)
		? (d?.network as DeploymentNetwork)
		: "unknown";
	if (network === "unknown") {
		// An unknown must not carry stray provenance: basis/sourceUrl describe
		// EVIDENCE, and unknown means there is none.
		return { network, basis: null, sourceUrl: null, asOf: null };
	}
	return {
		network,
		basis: d?.basis ?? null,
		sourceUrl: d?.sourceUrl ?? null,
		asOf: d?.asOf ?? null,
	};
}
