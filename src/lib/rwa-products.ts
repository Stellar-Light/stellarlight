import { RWA_REGISTRY, type RwaAsset } from "@/data/rwa-registry";

/**
 * The per-product record served on a project row (`products`).
 *
 * `status` is the stored products enum (live | development | announced |
 * retired). It cannot say "minted but held only by the issuer", so the
 * registry's own state rides alongside as `registryState`, and the identity,
 * issuer, verification level and launch date the finding asked for are
 * fields — not text stuffed into `note`.
 */
export interface ProductRecord {
	name: string;
	kind: string;
	network: string;
	status: string;
	contractId: string | null;
	evidenceUrl: string;
	asOf: string;
	note: string | null;
	/** Issuing entity as the registry attributes it; null on hand-curated rows. */
	issuer?: string | null;
	/** `CODE-GISSUER` or the contract id — the asset's identity. */
	assetId?: string | null;
	verificationLevel?: string | null;
	registryState?: string | null;
	launchedAt?: string | null;
}

/** States that mean the asset is minted on mainnet. */
const MINTED = new Set(["live", "issued-single-holder"]);

/**
 * Product records the verified RWA registry contributes to one project row.
 *
 * Minted rows only: a contract with zero supply and zero events is deployed,
 * not a product. A tranche deployed twice (pairedWith) yields ONE record —
 * the earlier-launched contract — so a project is never double-counted.
 */
export function registryProducts(
	slug: string | null | undefined,
): ProductRecord[] {
	if (!slug) return [];
	const seenPair = new Set<string>();
	const out: ProductRecord[] = [];
	for (const r of RWA_REGISTRY.filter(
		(x) => x.projectSlug === slug && MINTED.has(x.state),
	).sort(
		(a, b) =>
			String(a.launchedAt ?? "").localeCompare(String(b.launchedAt ?? "")) ||
			a.id.localeCompare(b.id),
	)) {
		if (r.pairedWith) {
			const key = [r.id, r.pairedWith].sort().join("|");
			if (seenPair.has(key)) continue;
			seenPair.add(key);
		}
		out.push(toProduct(r));
	}
	return out;
}

function toProduct(r: RwaAsset): ProductRecord {
	return {
		name: r.name,
		kind: r.productKind,
		network: r.network,
		status: "live",
		contractId:
			r.contract ?? (r.code && r.issuer ? `${r.code}-${r.issuer}` : null),
		evidenceUrl: r.evidenceUrl,
		asOf: r.verifiedAt,
		note:
			r.state === "issued-single-holder"
				? "minted; exactly one holder (the issuer or its custodian); no secondary activity"
				: null,
		issuer: r.issuerEntity,
		assetId: r.id,
		verificationLevel: r.verificationLevel,
		registryState: r.state,
		launchedAt: r.launchedAt,
	};
}

/**
 * Merge stored (curated) product rows with the registry's, de-duplicated on
 * contractId. Null — never [] — when neither holds anything: an unmodelled
 * dimension is UNKNOWN, and "[]" is a positive claim that the project ships
 * no products on Stellar.
 */
export function mergeProducts(
	stored: ProductRecord[] | null,
	slug: string | null | undefined,
): ProductRecord[] | null {
	const fromRegistry = registryProducts(slug);
	if (!stored?.length && !fromRegistry.length) return null;
	const seen = new Set<string>();
	const out: ProductRecord[] = [];
	for (const p of [...(stored ?? []), ...fromRegistry]) {
		const key = p.contractId ?? `${p.name}|${p.network}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(p);
	}
	return out;
}

export { deploymentFromRegistry } from "@/lib/project-deployment";
