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

/** Does this evidence link point at Stellar testnet (or futurenet)? On-chain
 * activity read from a testnet explorer page or endpoint is testnet activity,
 * not a mainnet deployment: rendergate and clevercon were stamped mainnet off
 * stellar.expert testnet links while their own descriptions said testnet. */
export function isTestnetEvidence(url: string | null | undefined): boolean {
	return /stellar\.expert\/explorer\/(?:testnet|futurenet)\/|horizon-(?:testnet|futurenet)\.stellar\.org|soroban-(?:testnet|futurenet)\.stellar\.org|friendbot/i.test(
		url ?? "",
	);
}

/**
 * The evidence classes a positive deployment claim carries (sls-024). The
 * writer is scripts/data/backfill-deployment.ts; rwa-registry is also filled
 * at serve time by deploymentFromRegistry.
 *   human-verified: a curator checked a source that names the network
 *     (DEPLOYMENT_VERIFIED).
 *   onchain-activity: a contract, asset, account or transaction the row holds,
 *     read on chain when the claim was written.
 *   mainnet-contract-join: a repo of the project publishes a contract id that
 *     the mainnet ledger holds.
 *   defillama-tvl: DefiLlama tracks the protocol on Stellar (a reading of at
 *     most TVL_FRESH_DAYS); it reads mainnet contracts.
 *   rwa-registry: a minted product in the verified RWA registry whose
 *     attribution holds both ways (toml-bidirectional; deploymentFromRegistry).
 *   operator-toml: the project's own stellar.toml declares an asset that
 *     Horizon holds and whose issuer names the project's domain back.
 */
export const DEPLOYMENT_BASES = [
	"human-verified",
	"onchain-activity",
	"mainnet-contract-join",
	"defillama-tvl",
	"rwa-registry",
	"operator-toml",
] as const;
export type DeploymentBasis = (typeof DEPLOYMENT_BASES)[number];

export type OnchainKind = "contract" | "asset" | "account" | "tx";

/** The id shape each artifact kind must have. A link whose id does not fit
 * (an asset page for XLM, which has no issuer) names no checkable artifact. */
const ARTIFACT_ID: Record<OnchainKind, RegExp> = {
	contract: /^C[A-Z2-7]{55}$/,
	asset: /^[A-Za-z0-9]{1,12}-G[A-Z2-7]{55}$/,
	account: /^G[A-Z2-7]{55}$/,
	tx: /^[0-9a-f]{64}$/,
};

/** A stellar.expert explorer link read as the artifact it names (contract,
 * asset CODE-ISSUER, account or transaction, on public or testnet), or null
 * for any other link, including one whose id does not fit its kind. */
export function onchainArtifact(url: string | null | undefined): {
	network: "mainnet" | "testnet";
	kind: OnchainKind;
	id: string;
} | null {
	const m =
		/^https:\/\/stellar\.expert\/explorer\/(public|testnet)\/(contract|asset|account|tx)\/([A-Za-z0-9-]+)(?:[/?#]|$)/.exec(
			url ?? "",
		);
	const kind = m?.[2] as OnchainKind | undefined;
	if (!m || !kind || !ARTIFACT_ID[kind].test(m[3])) return null;
	return {
		network: m[1] === "public" ? "mainnet" : "testnet",
		kind,
		id: m[3],
	};
}

/** The human-readable page for one on-chain artifact. stellar.expert's API is
 * paywalled since 2026-11-06; its explorer pages are not, and the claim is
 * checked against the ledger (RPC, Horizon), never against this page. */
export const explorerUrl = (
	network: "mainnet" | "testnet",
	kind: OnchainKind,
	id: string,
) =>
	`https://stellar.expert/explorer/${network === "mainnet" ? "public" : "testnet"}/${kind}/${id}`;

/** One check's outcome. could-not-check is never read as absence. */
export type ProbeState = "found" | "checked-absent" | "could-not-check";

/** One piece of evidence for a positive claim, with the outcome of its check. */
export interface DeploymentCandidate {
	network: "mainnet" | "testnet";
	basis: DeploymentBasis;
	sourceUrl: string;
	/** The evidence's own date; null = observed by this run. */
	asOf: string | null;
	probe: ProbeState;
}

export type DeploymentDecision =
	| { kind: "claim"; claim: DeploymentCandidate }
	| { kind: "abstain"; why: string }
	| { kind: "none" };

/**
 * The writer's rule (sls-024), over candidates in precedence order: the first
 * one whose check found its artifact is the claim. A candidate that could not
 * be checked before any was found stops the walk, because a failed read must
 * never change the stored claim; a checked-absent one is skipped. A candidate
 * with no sourceUrl is never a claim: a positive deployment always carries
 * the URL a reader can re-check it at.
 */
export function decideDeployment(
	candidates: readonly DeploymentCandidate[],
): DeploymentDecision {
	for (const c of candidates) {
		if (!c.sourceUrl) continue;
		if (c.probe === "found") return { kind: "claim", claim: c };
		if (c.probe === "could-not-check")
			return { kind: "abstain", why: `${c.basis} ${c.sourceUrl}` };
	}
	return { kind: "none" };
}

/**
 * What a served positive deployment claim lacks (sls-024): its own source, a
 * basis from DEPLOYMENT_BASES, a date, and Stellar in the row's network list.
 * A source that is an explorer link on the other network, or testnet evidence
 * behind a mainnet claim, contradicts the claim. [] for a complete claim and
 * for unknown, whose null fields are the documented unknown state.
 */
export function deploymentGaps(row: {
	deployment?: {
		network?: string | null;
		basis?: string | null;
		sourceUrl?: string | null;
		asOf?: string | null;
	} | null;
	supportedNetworks?: readonly string[] | null;
}): string[] {
	const d = row.deployment;
	if (d?.network !== "mainnet" && d?.network !== "testnet") return [];
	const gaps: string[] = [];
	if (!d.sourceUrl) gaps.push("no sourceUrl");
	if (!(DEPLOYMENT_BASES as readonly string[]).includes(d.basis ?? ""))
		gaps.push(d.basis ? `basis ${d.basis} is not a known class` : "no basis");
	if (!d.asOf) gaps.push("no asOf");
	const art = onchainArtifact(d.sourceUrl);
	if (
		(art && art.network !== d.network) ||
		(d.network === "mainnet" && isTestnetEvidence(d.sourceUrl))
	)
		gaps.push(`${d.network} claim cites evidence from another network`);
	if (!row.supportedNetworks?.some((n) => n.toLowerCase() === "stellar"))
		gaps.push("supportedNetworks does not list stellar");
	return gaps;
}

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

/**
 * Fill an UNKNOWN deployment from the verified RWA registry; never overwrite
 * a known one.
 *
 * sls-023's 2026-09-04 re-check: "Deployment exists on 61 rows, but 47 have
 * network unknown, basis null, and sourceUrl null." A project whose live
 * product is in the registry is deployed on mainnet, when the registry can
 * say the product is the project's. The row lends its evidence URL, so the
 * claim is re-checkable at source.
 *
 * Only a row whose attribution holds both ways from first-party records
 * lends: toml-bidirectional, where the issuer's own stellar.toml names the
 * asset and the issuer's home_domain names that domain back. Neither side
 * can be produced by a third party alone. Every other level rests on one side
 * or on somebody else (audit 2026-11-12):
 *  - entity-toml: the entity's toml names the issuer, but the issuer's
 *    home_domain names the minting tool (rivool-finance: lobstr.co), so any
 *    toml could name that issuer;
 *  - on-chain-home-domain: the issuer names the entity, which anyone can do
 *    for an issuer they hold, and the entity's toml omits the asset;
 *  - contract-metadata: a Soroban token's own name and symbol, which its
 *    deployer chooses, plus rwa.xyz's listing;
 *  - on-chain-only: the asset exists, and rwa.xyz's listing is the only
 *    attribution.
 * Those rows still feed `products`, where each serves its level.
 *
 * A stored mainnet/testnet fact is a stronger, human- or scanner-placed claim
 * and stands; a slug with no lending row stays unknown, because unknown is an
 * admission and this must not turn it into a claim.
 */
export function deploymentFromRegistry(
	stored: DeploymentFact,
	slug: string | null | undefined,
): DeploymentFact {
	if (stored.network !== "unknown" || !slug) return stored;
	// Minted rows lend evidence: a single-holder tranche IS deployed on
	// mainnet. A zero-supply contract or a listing that no longer resolves is not.
	const best = RWA_REGISTRY.filter(
		(r) =>
			r.projectSlug === slug &&
			r.verificationLevel === "toml-bidirectional" &&
			(r.state === "live" || r.state === "issued-single-holder"),
	).sort((a, b) => a.id.localeCompare(b.id))[0];
	if (!best) return stored;
	return {
		network: "mainnet",
		basis: "rwa-registry",
		sourceUrl: best.evidenceUrl,
		asOf: best.verifiedAt,
	};
}

/**
 * What stands behind supportedNetworks (sls-017), served as networksBasis.
 * Only "curated" lists are meant to be complete; every other basis derives
 * exactly ["stellar"] from evidence on the row and says nothing about other
 * chains. "deployment" is the row's own positive deployment record (network
 * mainnet or testnet with a sourceUrl). It is read last, so it fills only a
 * list nothing else derives, and a positive deployment never sits beside a
 * null network list (sls-024).
 */
export const NETWORKS_BASES = [
	"curated",
	"onchain-activity",
	"defillama-tvl",
	"anchor-coverage",
	"scf-award",
	"deployment",
] as const;
export type NetworksBasis = (typeof NETWORKS_BASES)[number];

/** A stored network list, or null: an empty or missing list is "we hold no
 * curation", never "supports no networks" (sls-017). Served lowercase, as the
 * spec documents: 20 curated rows stored "Stellar" (2026-11-11). */
export function pickNetworks(v: unknown): string[] | null {
	if (!Array.isArray(v)) return null;
	const nets = [
		...new Set(
			v
				.filter((x): x is string => typeof x === "string" && !!x.trim())
				.map((x) => x.trim().toLowerCase()),
		),
	];
	return nets.length ? nets : null;
}

/**
 * supportedNetworks and networksBasis for a stored project doc. A curated
 * list wins. Otherwise evidence on the row that the project operates on
 * Stellar, strongest first: contract records (onchain.contracts), DefiLlama
 * Stellar TVL, SEP or corridor coverage, an SCF award (the fund pays only
 * for Stellar work). The served deployment fact is read last, only to fill a
 * list nothing else derives. Status is not a factor: whether the project runs
 * today is what status says. A derived list is never exhaustive, which is
 * what networksBasis tells a reader.
 */
export function deriveNetworks(
	// biome-ignore lint/suspicious/noExplicitAny: payload project doc shape
	p: any,
): { supportedNetworks: string[] | null; networksBasis: NetworksBasis | null } {
	const curated = pickNetworks(p?.supportedNetworks);
	if (curated) return { supportedNetworks: curated, networksBasis: "curated" };

	const cov = p?.coverage;
	const deployment = pickDeployment(p?.deployment, p?.slug);
	const basis: NetworksBasis | null = p?.onchain?.contracts?.length
		? "onchain-activity"
		: typeof p?.tvlUSD === "number" && p.tvlUSD > 0
			? "defillama-tvl"
			: cov &&
					(cov.countries?.length || cov.currencies?.length || cov.seps?.length)
				? "anchor-coverage"
				: p?.scf?.awarded
					? "scf-award"
					: deployment.network !== "unknown" && deployment.sourceUrl
						? "deployment"
						: null;

	return basis
		? { supportedNetworks: ["stellar"], networksBasis: basis }
		: { supportedNetworks: null, networksBasis: null };
}
