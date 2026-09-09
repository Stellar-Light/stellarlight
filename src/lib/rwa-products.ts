import {
	RWA_DEPLOYER_COVERAGE,
	RWA_ISSUER_COVERAGE,
	RWA_REGISTRY,
	type RwaAsset,
} from "@/data/rwa-registry";

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
	/** The issuer toml's own `status` for this asset (live | private | test …) where the toml was read; null = not read. `private` = a restricted offering. */
	tomlStatus?: string | null;
	launchedAt?: string | null;
	/** Issuer flags from Horizon (classic assets): whitelist, freeze, clawback. null on Soroban tokens and hand-curated rows. */
	controls?: {
		authRequired: boolean;
		authRevocable: boolean;
		authImmutable: boolean;
		clawbackEnabled: boolean;
	} | null;
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
			r.tomlStatus === "private"
				? "issuer toml status=private: a restricted offering (KYC-gated platform accounts, not publicly tradable per the issuer); minted and held, but not a public market"
				: r.state === "issued-single-holder"
					? "minted; exactly one holder (the issuer or its custodian); no secondary activity"
					: null,
		tomlStatus: r.tomlStatus,
		issuer: r.issuerEntity,
		assetId: r.id,
		verificationLevel: r.verificationLevel,
		registryState: r.state,
		launchedAt: r.launchedAt,
		controls: r.controls,
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

/**
 * Whether a project's registry-fed `products` is COMPLETE for the issuers it
 * joins (sls-083). Etherfuse served five products while its own toml
 * declared nine, and nothing on the row said "partial" — a consumer could only
 * mistake five for the set. This states the comparison: what the tracked
 * issuer accounts' own stellar.toml declared (RWA_ISSUER_COVERAGE), how many
 * of those are registry rows, and how many products the row actually serves
 * (minted states only, a paired tranche once — so served < tracked is normal
 * and is not incompleteness).
 *
 * Null when none of the project's issuer accounts has a reconciled toml
 * (Soroban issuers, on-chain-only rows, hand-curated products): completeness
 * cannot be stated, and null says so — never "complete".
 */
/**
 * issuer-stellar-toml — classic assets: what the issuer accounts' own toml
 * declares. deployer-contracts — Soroban tokens (no toml): every contract the
 * entity's deployer account created with its token wasm, read from Horizon's
 * create-contract history (Spiko: 19 contracts, 17 tokens). The spec spreads
 * this array (the enum-literal ratchet forbids a second copy).
 */
export const PRODUCTS_COVERAGE_BASES = [
	"issuer-stellar-toml",
	"deployer-contracts",
] as const;

export interface ProductsCoverage {
	basis: (typeof PRODUCTS_COVERAGE_BASES)[number];
	/** Most recent reconcile date among the project's covered issuers. */
	asOf: string;
	/** Issuer accounts joined to this project whose toml has been reconciled. */
	issuers: number;
	/** Issuer ACCOUNTS joined to this project the statement does not cover: classic issuers whose toml could not be read, plus one for the project's Soroban tokens if it has any (no toml). An issuer whose toml was read and declares nothing under it is reconciled, not counted here. */
	issuersUnreconciled: number;
	/** (code, issuer) pairs those tomls declare under the covered accounts. */
	declared: number;
	/** Of those declared pairs, registry rows (any state). */
	tracked: number;
	/**
	 * REGISTRY-fed product records on this row: minted states only, one per
	 * paired tranche. Not `products.length` — the row's `products` may also
	 * carry hand-curated records merged in. A different count from
	 * `tracked`, not a subset of it: smaller
	 * when a declared asset is zero-supply (tracked, not a product), larger
	 * when the registry tracks an issued asset the toml omits (WisdomTree
	 * EPXC — verificationLevel on-chain-home-domain).
	 */
	served: number;
	/**
	 * Every declared pair is a registry row AND every issuer account joined to
	 * this project was reconciled. False when an issuer's toml could not be
	 * read (Circle: the EURC issuer's home domain serves no toml) — a
	 * consumer keying on this boolean must not read a partially-reconciled
	 * project as closed; that is sls-083's failure mode with a green flag.
	 */
	complete: boolean;
}

export function productsCoverage(
	slug: string | null | undefined,
): ProductsCoverage | null {
	if (!slug) return null;
	const rows = RWA_REGISTRY.filter((r) => r.projectSlug === slug);
	if (!rows.length) return null;
	const issuerAccounts = new Set(
		rows.map((r) => r.issuer).filter((x): x is string => !!x),
	);
	const covered = RWA_ISSUER_COVERAGE.filter((c) =>
		issuerAccounts.has(c.issuer),
	);
	if (!covered.length) return deployerCoverage(slug, rows);
	const trackedIds = new Set(rows.map((r) => r.id));
	let declared = 0;
	let tracked = 0;
	for (const c of covered)
		for (const code of c.declared) {
			declared++;
			if (trackedIds.has(`${code}-${c.issuer}`)) tracked++;
		}
	// Counted in ISSUER ACCOUNTS, not rows: classic issuers with no toml entry,
	// plus ONE for the project's Soroban tokens if it has any (they have no
	// toml; a mixed project must not inflate this by its token count). Both
	// are "cannot state", counted so the reader sees it.
	const unreconciled =
		(rows.some((r) => r.kind === "soroban") ? 1 : 0) +
		[...issuerAccounts].filter((a) => !covered.some((c) => c.issuer === a))
			.length;
	return {
		basis: "issuer-stellar-toml",
		asOf:
			covered
				.map((c) => c.reconciledAt)
				.sort()
				.at(-1) ?? "",
		issuers: covered.length,
		issuersUnreconciled: unreconciled,
		declared,
		tracked,
		served: registryProducts(slug).length,
		complete: declared === tracked && unreconciled === 0,
	};
}

/**
 * The Soroban basis: a project whose registry rows are contract tokens has no
 * toml to reconcile, but its deployer account's create-contract history is
 * just as declarative — and, unlike rwa.xyz's listing, it is the issuer's own
 * act. `declared` = contracts that deployer created with the entity's token
 * wasm (RWA_DEPLOYER_COVERAGE, read from Horizon on reconciledAt); `tracked`
 * = of those, registry rows in any state. Null when the entity has no
 * deployer entry.
 */
function deployerCoverage(
	slug: string,
	rows: RwaAsset[],
): ProductsCoverage | null {
	const entities = new Set(
		rows.map((r) => r.issuerEntity).filter((x): x is string => !!x),
	);
	const covered = RWA_DEPLOYER_COVERAGE.filter((c) =>
		entities.has(c.issuerEntity),
	);
	if (!covered.length) return null;
	const trackedIds = new Set(rows.map((r) => r.id));
	let declared = 0;
	let tracked = 0;
	for (const c of covered)
		for (const id of c.declared) {
			declared++;
			if (trackedIds.has(id)) tracked++;
		}
	// Classic rows on a Soroban-covered project would need a toml entry; any
	// without one count as unreconciled, as on the toml side.
	const classicUncovered = new Set(
		rows
			.filter((r) => r.kind === "classic" && r.issuer)
			.map((r) => r.issuer as string)
			.filter((a) => !RWA_ISSUER_COVERAGE.some((c) => c.issuer === a)),
	).size;
	return {
		basis: "deployer-contracts",
		asOf:
			covered
				.map((c) => c.reconciledAt)
				.sort()
				.at(-1) ?? "",
		issuers: covered.length,
		issuersUnreconciled: classicUncovered,
		declared,
		tracked,
		served: registryProducts(slug).length,
		complete: declared === tracked && classicUncovered === 0,
	};
}

export { deploymentFromRegistry } from "@/lib/project-deployment";
