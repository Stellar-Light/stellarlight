import { RWA_REGISTRY } from "@/data/rwa-registry";
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
	slug?: string | null,
): DeploymentFact {
	const network = (DEPLOYMENT_NETWORKS as readonly string[]).includes(
		d?.network ?? "",
	)
		? (d?.network as DeploymentNetwork)
		: "unknown";
	const stored: DeploymentFact =
		network === "unknown"
			? // An unknown must not carry stray provenance: basis/sourceUrl describe
				// EVIDENCE, and unknown means there is none.
				{ network, basis: null, sourceUrl: null, asOf: null }
			: {
					network,
					basis: d?.basis ?? null,
					sourceUrl: d?.sourceUrl ?? null,
					asOf: d?.asOf ?? null,
				};
	// sls-023: a live product in the verified RWA registry proves mainnet
	// deployment. Applied INSIDE the one serializer so every row builder gets
	// it and the three-builder drift guard stays literally true.
	return deploymentFromRegistry(stored, slug);
}

const LEVEL_RANK: Record<string, number> = {
	"toml-bidirectional": 0,
	"entity-toml": 1,
	"contract-metadata": 2,
	"on-chain-home-domain": 3,
	"on-chain-only": 4,
};

/**
 * Fill an UNKNOWN deployment from the verified RWA registry — never overwrite
 * a known one.
 *
 * sls-023's 2026-09-04 re-check: "Deployment exists on 61 rows, but 47 have
 * network unknown, basis null, and sourceUrl null." A project whose live
 * product is in the registry has proven mainnet deployment — the issuer's own
 * stellar.toml plus Horizon, or the Soroban contract itself — and that is
 * exactly the evidence `deployment` is documented to require. The strongest
 * verified row lends its evidence URL, so the claim is re-checkable at source.
 *
 * A stored mainnet/testnet fact is a stronger, human- or scanner-placed claim
 * and stands; a slug with no live registry row stays unknown, because unknown
 * is an admission and this must not turn it into a claim.
 */
export function deploymentFromRegistry(
	stored: DeploymentFact,
	slug: string | null | undefined,
): DeploymentFact {
	if (stored.network !== "unknown" || !slug) return stored;
	// Minted rows lend evidence: a single-holder tranche IS deployed on
	// mainnet. A zero-supply contract or a listing that no longer resolves is not.
	const live = RWA_REGISTRY.filter(
		(r) =>
			r.projectSlug === slug &&
			(r.state === "live" || r.state === "issued-single-holder"),
	).sort(
		(a, b) =>
			(LEVEL_RANK[a.verificationLevel] ?? 9) -
				(LEVEL_RANK[b.verificationLevel] ?? 9) || a.id.localeCompare(b.id),
	);
	const best = live[0];
	if (!best) return stored;
	return {
		network: "mainnet",
		basis: "rwa-registry",
		sourceUrl: best.evidenceUrl,
		asOf: best.verifiedAt,
	};
}
