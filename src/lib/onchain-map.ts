/**
 * The curated on-chain map (src/data/onchain-map.json): which mainnet
 * contracts and accounts belong to which directory project, each link with
 * its evidence kind, tier, public source and ledger-proved creation. Built by
 * scripts/build-onchain-map.ts; read only by the on-chain lane
 * (scripts/data/enrich-onchain-projects.ts), the one writer of
 * projects.onchain, which serves it on project rows and through them on
 * /api/contracts.
 *
 * The rules are pure and tested (src/lib/__tests__/onchain-map.test.ts):
 *   - only the strong and labelled tiers are linked; weaker links (named on
 *     the project's own pages only, or the same deployer only) are left out;
 *   - an address linked to more than one project proves nothing and is
 *     linked to none, except inside an issuer-and-token family (one company
 *     and the tokens it issues), where each member keeps it one tier down,
 *     and the groups attributed to one member by hand;
 *   - at build time, a contract whose only evidence is code is left out when
 *     the account that created it deployed another project's own contracts
 *     and none of this one's (leaveOutOtherOperators).
 * The lane applies the rules again to the file it reads, so a hand edit that
 * gives one address to two unrelated projects links it to neither. The
 * readers it checks each address with are in onchain-sources.ts.
 */

/** The tiers the map links; weaker links stay out. */
export const MAP_TIERS = ["strong", "labelled"] as const;
export type MapTier = (typeof MAP_TIERS)[number];

/** Why an address is a project's, as the map names it (meanings in the
 * file's `evidenceKinds`). A link lists one or more, strongest first. */
export const ONCHAIN_MAP_EVIDENCE = [
	"directory",
	"own-repo-interface",
	"own-wasm-meta",
	"own-pages-confirmed",
	"own-deployer-confirmed",
	"own-account",
	"protocol-registry",
	"public-directory-label",
	"named-on-own-pages",
	"same-deployer",
] as const;

export interface OnchainMapLink {
	slug: string;
	address: string;
	kind: "contract" | "account";
	tier: MapTier;
	/** Why the address is the project's, strongest first (see the file's
	 * `evidenceKinds`). */
	evidence: string[];
	/** The name a label or the directory gives the address, or null. */
	label: string | null;
	/** What the evidence found, in words, or null. */
	note: string | null;
	/** The public page or file the link was read from. */
	sourceUrl: string;
	/** Contracts: creation, proved in that ledger's metadata. Accounts: the
	 * current account's opening, proved the same way (not a launch date).
	 * Null when no ledger proof was found. */
	createdAt: string | null;
	createdLedger: number | null;
	dateBasis: string | null;
	/** Every member of the issuer-and-token family holding this address,
	 * issuer first; absent when one project holds it. */
	sharedWithinFamily?: string[];
}

/**
 * Issuer-and-token families: an address linked to several members of one
 * family is kept for each, one tier down (strong to labelled). The directory
 * has no builtBy link between issuer and token rows (null for all of them,
 * read 2026-11-23), so the families are curated. The first slug is the
 * issuer; a contract the family shares is served under it on /api/contracts.
 */
export const ISSUER_TOKEN_FAMILIES: readonly (readonly string[])[] = [
	["fxdao", "usdx", "eurx", "gbpx"],
	["circle", "usdc", "circle-cctp-cross-chain-transfer-protocol"],
	["anclap", "ars", "pen"],
	["mykobo", "eurckobo"],
	["brale", "mxne"],
	["clickspesa", "kes", "rwf", "tzs"],
	["glo-dollar", "glousd"],
	["gyen", "zusd"],
	["ondo", "usdy"],
	["upesa", "utoken"],
];

/** Shared groups given to one member by hand: the public directory labels
 * these accounts with the foundation's name. */
export const SHARED_ATTRIBUTE_TO: ReadonlyArray<{
	slugs: readonly string[];
	to: string;
}> = [
	{
		slugs: [
			"stellar-development-foundation",
			"stellar-disbursement-platform-sdp",
		],
		to: "stellar-development-foundation",
	},
];

/**
 * Apply the tier and sharing rules. Sharing is judged over every input row,
 * weaker ones included: a weaker link to another project still makes the
 * address ambiguous.
 */
export function selectLinks<
	T extends { slug: string; address: string; tier: string },
>(
	rows: readonly T[],
): {
	kept: Array<T & { tier: MapTier; sharedWithinFamily?: string[] }>;
	left: Array<{ row: T; reason: string }>;
} {
	const slugsOf = new Map<string, Set<string>>();
	for (const r of rows)
		slugsOf.set(r.address, (slugsOf.get(r.address) ?? new Set()).add(r.slug));
	const kept: Array<T & { tier: MapTier; sharedWithinFamily?: string[] }> = [];
	const left: Array<{ row: T; reason: string }> = [];
	for (const r of rows) {
		const slugs = slugsOf.get(r.address) ?? new Set([r.slug]);
		const tier = r.tier;
		if (tier !== "strong" && tier !== "labelled") {
			left.push({ row: r, reason: "weaker tier" });
			continue;
		}
		if (slugs.size === 1) {
			kept.push({ ...r, tier });
			continue;
		}
		const family = ISSUER_TOKEN_FAMILIES.find((f) =>
			[...slugs].every((s) => f.includes(s)),
		);
		if (family) {
			kept.push({
				...r,
				tier: "labelled",
				sharedWithinFamily: family.filter((s) => slugs.has(s)),
			});
			continue;
		}
		const group = SHARED_ATTRIBUTE_TO.find(
			(g) =>
				g.slugs.length === slugs.size && g.slugs.every((s) => slugs.has(s)),
		);
		if (group) {
			if (r.slug === group.to) kept.push({ ...r, tier });
			else left.push({ row: r, reason: `shared group given to ${group.to}` });
			continue;
		}
		left.push({
			row: r,
			reason: `linked to ${slugs.size} projects outside any issuer-and-token family`,
		});
	}
	return { kept, left };
}

/** Evidence that says only that a contract runs a project's code: a protocol
 * registry groups contracts by the code they run, and a code proof matches
 * the deployed functions or build metadata to a repo. Neither says who runs
 * the contract. */
export const CODE_ONLY_EVIDENCE: readonly string[] = [
	"protocol-registry",
	"own-wasm-meta",
	"own-repo-interface",
];

/**
 * The operator rule (2026-11-24). A contract whose only evidence is code is
 * left out when the account that created it deployed another project's own
 * contracts (a strong link with evidence beyond code) and none of this
 * project's. Stellar Index's comet registry lists every pool that runs
 * Comet's code, so the comet row held Blend's BLND:USDC pool (created by
 * Blend's deployer) and BLNT's two pools (created by BLNT's). A creator no
 * other project deployed for, or one not known, leaves the link as it is:
 * code that names its author is still evidence when nothing contradicts it.
 * `createdBy` is the creating account, from the ledger, or null.
 */
export function leaveOutOtherOperators<
	T extends {
		slug: string;
		kind: string;
		tier: string;
		evidence: readonly string[];
		createdBy?: string | null;
	},
>(rows: readonly T[]): { kept: T[]; left: Array<{ row: T; reason: string }> } {
	const codeOnly = (r: T) =>
		r.evidence.length > 0 &&
		r.evidence.every((e) => CODE_ONLY_EVIDENCE.includes(e));
	const deployedFor = new Map<string, Set<string>>();
	for (const r of rows)
		if (
			r.kind === "contract" &&
			r.tier === "strong" &&
			r.createdBy &&
			!codeOnly(r)
		)
			deployedFor.set(
				r.createdBy,
				(deployedFor.get(r.createdBy) ?? new Set()).add(r.slug),
			);
	const kept: T[] = [];
	const left: Array<{ row: T; reason: string }> = [];
	for (const r of rows) {
		const slugs = r.createdBy ? deployedFor.get(r.createdBy) : undefined;
		if (r.kind === "contract" && codeOnly(r) && slugs && !slugs.has(r.slug))
			left.push({
				row: r,
				reason: `created by the deployer of ${[...slugs].sort().join(", ")}, not of ${r.slug}: code alone does not say who runs it`,
			});
		else kept.push(r);
	}
	return { kept, left };
}

/**
 * The contracts a stored row holds that a seed or the map now gives to
 * another row (`owner`: address to slug). They leave the row even when it has
 * no join key left: that is a curator's or the map's reading, not a read that
 * failed. `gone` names the row that holds each one now.
 */
export function settledElsewhere<T extends { address?: unknown }>(
	slug: string,
	stored: readonly T[],
	owner: ReadonlyMap<string, string>,
): { keep: T[]; gone: Array<{ contract: T; to: string }> } {
	const keep: T[] = [];
	const gone: Array<{ contract: T; to: string }> = [];
	for (const c of stored) {
		const to =
			typeof c?.address === "string" ? owner.get(c.address) : undefined;
		if (to && to !== slug) gone.push({ contract: c, to });
		else keep.push(c);
	}
	return { keep, gone };
}

/** Present, absent, or null when it could not be checked. */
export type Presence = "present" | "absent" | null;

/**
 * endedAt after one existence check: an address read absent is ended on the
 * day it was first read absent; one read present is not ended; one that
 * could not be checked keeps what the row holds. Could-not-check never ends
 * an address.
 */
export function endedAtOf(
	prior: unknown,
	presence: Presence,
	now: string,
): string | null {
	const held = typeof prior === "string" && prior ? prior : null;
	if (presence === "present") return null;
	if (presence === "absent") return held ?? now;
	return held;
}

/** Credit the sources' terms ask for, served wherever the links are. */
export const ONCHAIN_MAP_ATTRIBUTION = [
	{
		name: "Stellar Index",
		url: "https://stellarindex.io",
		use: "contract creation pointers and protocol registries (its terms ask for a link when its data is shown publicly)",
	},
	{
		name: "stellar-expert/public-directory",
		url: "https://github.com/stellar-expert/public-directory",
		use: "address labels, MIT License, Copyright (c) 2022 StellarExpert",
	},
] as const;
