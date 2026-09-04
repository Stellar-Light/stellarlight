import { RWA_REGISTRY, type RwaAsset } from "@/data/rwa-registry";

/** The per-product record shape served on a project row (`products`). */
export interface ProductRecord {
	name: string;
	kind: string;
	network: string;
	status: string;
	contractId: string | null;
	evidenceUrl: string;
	asOf: string;
	note: string | null;
}

/**
 * Product records the verified RWA registry contributes to one project row.
 *
 * Only `state: "live"` rows qualify. A contract that exists with zero supply
 * and zero events is deployed, not a live product — serving it as one would
 * be the same overclaim sls-023 was filed about, in the other direction.
 * Those rows stay on /api/rwa with their state spelled out.
 */
export function registryProducts(
	slug: string | null | undefined,
): ProductRecord[] {
	if (!slug) return [];
	return RWA_REGISTRY.filter(
		(r) => r.projectSlug === slug && r.state === "live",
	).map(toProduct);
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
		note: `${r.verificationLevel}${r.symbol && r.symbol !== r.name ? ` · ${r.symbol}` : ""}`,
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
