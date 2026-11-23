/**
 * Contracts as first-class entities — the registry serve.
 *
 * Inverts the repo-centric index into a CONTRACT-centric view: every row is
 * a mainnet contract we can tie to verified evidence, joined across the
 * stores we already maintain — the scanner (verified contract id, proof,
 * depth, interface, domains), enrich-onchain (live usage stats), the audits
 * registry (per-project reports + currency), and successions.
 *
 * MEMBERSHIP IS EVIDENCE-GATED: a row exists only when the scanner verified
 * a README contract id live on mainnet and did not judge it cited
 * (src/lib/contract-basis.ts) OR enrich-onchain attributed real on-chain
 * activity to the repo. An id the README only cites (a contract the repo
 * calls) is never listed as the repo's contract: on 2026-11-11 Reflector's
 * connector was listed with the SushiSwap factory and three repos with one
 * Blend pool. An id not judged yet (published) is listed as before.
 * No self-declared registries, no directory prose. The set grows exactly as
 * fast as scans + weekly on-chain passes reach repos; meta carries that note.
 *
 * The curated on-chain map (src/data/onchain-map.json) reaches this registry
 * through the project rows the on-chain lane writes: a contract a row holds
 * with a map tier carries `attribution` (project, tier, evidence, source,
 * ledger-proved creation, endedAt), and one no repo row names gets a row of
 * its own (contractBasis onchain-map). A contract two rows hold outside one
 * issuer-and-token family is attributed to neither.
 */

import type { Payload } from "payload";
import { isOwnContract } from "./contract-basis";
import { repoInUrl } from "./onchain-join";
import { MAP_TIERS } from "./onchain-map";
import { findWholeSet } from "./whole-set";

/** The on-chain map's link of a contract to its project, as the on-chain
 * lane last wrote it on the project row. */
export interface ContractAttribution {
	project: { slug: string; name: string | null };
	tier: "strong" | "labelled";
	evidence: string[];
	sourceUrl: string | null;
	createdAt: string | null;
	createdLedger: number | null;
	dateBasis: string | null;
	/** Every member of the issuer-and-token family holding it, issuer first;
	 * null when one project holds it. */
	sharedWithinFamily: string[] | null;
	/** The day the weekly check first read the contract absent from mainnet. */
	endedAt: string | null;
	/** The reading that last checked it (the project's onchain.asOf). */
	asOf: string | null;
}

export interface ContractRow {
	/** The repo's mainnet contract id (C…, any basis but cited), else the
	 * first address on-chain enrichment attributed to it; null when the row
	 * is here for live usage alone. */
	contractId: string | null;
	/** Every mainnet address on-chain enrichment attributed to THIS repo
	 *  (the deployed WASM is attested to the repo), carried on the project
	 *  row. Empty when nothing was attributed, never a claim that the repo
	 *  deploys nothing. */
	verifiedContracts: Array<{
		address: string;
		label: string | null;
		/** The on-chain enrichment reading that attributed it (project onchain.asOf). */
		asOf: string | null;
	}>;
	contractBasis: string | null;
	/** Null on a row the on-chain map alone lists, when no source repo is
	 * attested for the contract. */
	repo: { fullName: string; url: string | null } | null;
	project: { slug: string; name: string | null } | null;
	stellarProof: string | null;
	codeDepth: number | null;
	codeDomains: string[];
	/** Extracted public contract fn signatures — size + a preview. */
	interfaceSize: number;
	interfacePreview: string[];
	codeInUse: {
		contracts: number;
		activeLedgers: number | null;
		lastEventAt: string | null;
		asOf: string;
	} | null;
	audits: {
		count: number;
		latestAuditor: string | null;
		latestPublishedAt: string | null;
	} | null;
	successorRepo: string | null;
	scannedAt: string | null;
	/** The on-chain map's link of contractId to a project, or null when the
	 * map holds none for it. */
	attribution: ContractAttribution | null;
}

export interface ContractsQuery {
	q?: string;
	domain?: string;
	limit?: number;
	offset?: number;
}

const REGISTRY_TTL_MS = 300_000;
let registryCache: { at: number; rows: Promise<ContractRow[]> } | null = null;

/**
 * The registry rows do not depend on the query: three reads over repos,
 * projects and audits that every /api/contracts call used to repeat. Build
 * them at most once per instance per five minutes, share the in-flight
 * promise between concurrent callers, and filter, sort and page per request.
 * ponytail: per-instance cache; a shared cache if instances multiply.
 */
/** Tests: drop the per-instance snapshot between cases. */
export function resetContractsRegistryCache(): void {
	registryCache = null;
}

function loadRegistryRows(payload: Payload): Promise<ContractRow[]> {
	const now = Date.now();
	if (!registryCache || now - registryCache.at > REGISTRY_TTL_MS) {
		const rows = buildRegistryRows(payload);
		registryCache = { at: now, rows };
		rows.catch(() => {
			registryCache = null;
		});
	}
	return registryCache.rows;
}

export async function buildContractsRegistry(
	payload: Payload,
	opts: ContractsQuery = {},
): Promise<{ contracts: ContractRow[]; total: number }> {
	const { q = "", domain = "", limit = 20, offset = 0 } = opts;
	let rows = [...(await loadRegistryRows(payload))];
	if (domain) rows = rows.filter((r) => r.codeDomains.includes(domain));
	if (q) {
		const needle = q.toLowerCase();
		rows = rows.filter(
			(r) =>
				(r.repo?.fullName ?? "").toLowerCase().includes(needle) ||
				(r.project?.slug ?? "").includes(needle) ||
				(r.project?.name ?? "").toLowerCase().includes(needle) ||
				(r.contractId ?? "").toLowerCase().includes(needle),
		);
	}
	// Most-evidenced first: live usage, then verified id, then depth.
	rows.sort(
		(a, b) =>
			(b.codeInUse ? 1 : 0) - (a.codeInUse ? 1 : 0) ||
			(b.contractId ? 1 : 0) - (a.contractId ? 1 : 0) ||
			(b.codeDepth ?? 0) - (a.codeDepth ?? 0),
	);

	return { contracts: rows.slice(offset, offset + limit), total: rows.length };
}

async function buildRegistryRows(payload: Payload): Promise<ContractRow[]> {
	const res = await payload.find({
		collection: "repos",
		where: {
			or: [
				{ mainnetContractId: { exists: true } },
				{ "codeInUse.contracts": { greater_than: 0 } },
			],
		},
		limit: 500,
		depth: 0,
		pagination: false,
		select: { readmeExcerpt: false },
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const docs = res.docs as any[];

	// The on-chain map's contracts, as the project rows hold them.
	// Every such row (limit 0): a cut set would drop attributions in silence.
	const mapped = await findWholeSet(payload, {
		collection: "projects",
		where: { "onchain.contracts.tier": { in: [...MAP_TIERS] } },
		limit: 0,
		depth: 0,
		select: { slug: true, name: true, onchain: true },
	});
	const attribution = attributionsOf(mapped.docs);

	// One audits query for every owning project (EXACT projectSlug join —
	// the repo-knowledge discipline, never fuzzy).
	const slugs = [
		...new Set([
			...docs.map((d) => d.projectSlug).filter(Boolean),
			...[...attribution.values()].map((a) => a.attribution.project.slug),
		]),
	] as string[];
	// Project rows carry on-chain enrichment's per-contract attribution
	// (onchain.contracts[].verifiedRepo). A repo row admitted on usage alone
	// (Blend: codeInUse.contracts 2, mainnetContractId null) served no address
	// at all while its project row held the pool factory and backstop for the
	// SAME repo — found by a through-Raven battery on 2026-09-05. Join them.
	const attributedByRepo = new Map<
		string,
		Array<{ address: string; label: string | null; asOf: string | null }>
	>();
	if (slugs.length) {
		const projects = await payload.find({
			collection: "projects",
			where: { slug: { in: slugs } },
			limit: 500,
			depth: 0,
			pagination: false,
			joins: false,
			select: { slug: true, onchain: true },
		});
		for (const p of projects.docs as any[]) {
			const list = Array.isArray(p?.onchain?.contracts)
				? p.onchain.contracts
				: [];
			for (const c of list) {
				const repo = typeof c?.verifiedRepo === "string" ? c.verifiedRepo : "";
				const m = repo.match(/github\.com\/([^/]+\/[^/?#]+)/i);
				if (!m || typeof c?.address !== "string" || !c.address) continue;
				const key = m[1].replace(/\.git$/, "").toLowerCase();
				const cur = attributedByRepo.get(key) ?? [];
				cur.push({
					address: c.address,
					label: typeof c.label === "string" && c.label ? c.label : null,
					asOf: p?.onchain?.asOf ? String(p.onchain.asOf) : null,
				});
				attributedByRepo.set(key, cur);
			}
		}
	}
	const auditsByProject = new Map<
		string,
		{
			count: number;
			latestAuditor: string | null;
			latestPublishedAt: string | null;
		}
	>();
	if (slugs.length) {
		const audits = await payload.find({
			collection: "audits",
			where: { projectSlug: { in: slugs } },
			limit: 500,
			depth: 0,
			pagination: false,
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		for (const a of audits.docs as any[]) {
			const slug = String(a.projectSlug ?? "");
			if (!slug) continue;
			const cur = auditsByProject.get(slug) ?? {
				count: 0,
				latestAuditor: null,
				latestPublishedAt: null,
			};
			cur.count += 1;
			const pub = a.publishedAt ? String(a.publishedAt) : null;
			if (pub && (!cur.latestPublishedAt || pub > cur.latestPublishedAt)) {
				cur.latestPublishedAt = pub;
				cur.latestAuditor = a.auditor ? String(a.auditor) : null;
			}
			auditsByProject.set(slug, cur);
		}
	}

	const rows: ContractRow[] = docs.map((d) => {
		const iface: string[] = Array.isArray(d.contractInterface)
			? d.contractInterface.filter(
					(s: unknown): s is string => typeof s === "string",
				)
			: [];
		const ciu = d.codeInUse;
		const attributed =
			attributedByRepo.get(String(d.fullName).toLowerCase()) ?? [];
		// An id the source rule judged cited is not the repo's deployment: it
		// neither names the row nor admits it. One not judged yet (published,
		// or no basis) is served as before until a rescan judges it.
		const ownId =
			d.mainnetContractId && isOwnContract(d.mainnetContractBasis)
				? String(d.mainnetContractId)
				: null;
		return {
			contractId: ownId ?? attributed[0]?.address ?? null,
			contractBasis: ownId
				? d.mainnetContractBasis
					? String(d.mainnetContractBasis)
					: null
				: attributed.length
					? "onchain-attributed"
					: null,
			verifiedContracts: attributed,
			repo: { fullName: String(d.fullName), url: d.url ? String(d.url) : null },
			project: d.projectSlug
				? {
						slug: String(d.projectSlug),
						name: d.projectName ? String(d.projectName) : null,
					}
				: null,
			stellarProof: d.stellarProof ? String(d.stellarProof) : null,
			codeDepth: typeof d.codeDepth === "number" ? d.codeDepth : null,
			codeDomains: Array.isArray(d.codeDomains)
				? d.codeDomains.filter(
						(s: unknown): s is string => typeof s === "string",
					)
				: [],
			interfaceSize: iface.length,
			interfacePreview: iface.slice(0, 5),
			codeInUse:
				ciu?.asOf && typeof ciu.contracts === "number"
					? {
							contracts: ciu.contracts,
							activeLedgers: ciu.activeLedgers ?? null,
							lastEventAt: ciu.lastEventAt ?? null,
							asOf: String(ciu.asOf),
						}
					: null,
			audits: d.projectSlug
				? (auditsByProject.get(String(d.projectSlug)) ?? null)
				: null,
			successorRepo: d.successorRepo ? String(d.successorRepo) : null,
			scannedAt: d.codeScannedAt ? String(d.codeScannedAt) : null,
			attribution: null,
		};
	});

	// Membership is the repo's own contract or live usage; a row the query
	// found only for an id it cites has neither.
	const listed = rows.filter((r) => r.contractId || r.codeInUse);
	for (const r of listed)
		r.attribution =
			(r.contractId && attribution.get(r.contractId)?.attribution) || null;
	// A mapped contract no repo row names is a row of its own.
	const named = new Set(listed.map((r) => r.contractId));
	for (const [address, { attribution: a, verifiedRepo }] of attribution) {
		if (named.has(address)) continue;
		const repo = repoInUrl(verifiedRepo);
		listed.push({
			contractId: address,
			contractBasis: "onchain-map",
			verifiedContracts: [],
			repo: repo ? { fullName: repo, url: `https://github.com/${repo}` } : null,
			project: a.project,
			stellarProof: null,
			codeDepth: null,
			codeDomains: [],
			interfaceSize: 0,
			interfacePreview: [],
			codeInUse: null,
			audits: auditsByProject.get(a.project.slug) ?? null,
			successorRepo: null,
			scannedAt: null,
			attribution: a,
		});
	}
	return listed;
}

/**
 * Each mapped contract's attribution, by address, from the project rows
 * that hold it. Held by one row: that row's. Held by several: only when
 * they are all members of the one issuer-and-token family each entry names,
 * and then under the family's first member present (the issuer). Anything
 * else is a contract linked to two projects, which proves neither.
 */
export function attributionsOf(
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	projects: any[],
): Map<string, { attribution: ContractAttribution; verifiedRepo: unknown }> {
	const holders = new Map<
		string,
		// biome-ignore lint/suspicious/noExplicitAny: stored array row
		Array<{ slug: string; name: string | null; c: any; asOf: string | null }>
	>();
	for (const p of projects) {
		if (typeof p?.slug !== "string" || !p.slug) continue;
		for (const c of Array.isArray(p?.onchain?.contracts)
			? p.onchain.contracts
			: []) {
			if (typeof c?.address !== "string" || !c.address) continue;
			if (c.tier !== "strong" && c.tier !== "labelled") continue;
			holders.set(c.address, [
				...(holders.get(c.address) ?? []),
				{
					slug: p.slug,
					name: typeof p.name === "string" ? p.name : null,
					c,
					asOf: p.onchain?.asOf ? String(p.onchain.asOf) : null,
				},
			]);
		}
	}
	const strings = (v: unknown): string[] =>
		Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
	const out = new Map<
		string,
		{ attribution: ContractAttribution; verifiedRepo: unknown }
	>();
	for (const [address, hs] of holders) {
		let h = hs[0];
		if (hs.length > 1) {
			const family = strings(h.c.sharedWithinFamily);
			const slugs = new Set(hs.map((x) => x.slug));
			const sameFamily =
				slugs.size === hs.length &&
				hs.every(
					(x) =>
						family.includes(x.slug) &&
						strings(x.c.sharedWithinFamily).join() === family.join(),
				);
			if (!sameFamily) continue;
			const first = family.find((s) => slugs.has(s));
			h = hs.find((x) => x.slug === first) ?? h;
		}
		const family = strings(h.c.sharedWithinFamily);
		out.set(address, {
			verifiedRepo: h.c.verifiedRepo,
			attribution: {
				project: { slug: h.slug, name: h.name },
				tier: h.c.tier,
				evidence: strings(h.c.evidence),
				sourceUrl: typeof h.c.sourceUrl === "string" ? h.c.sourceUrl : null,
				createdAt: h.c.createdAt ? String(h.c.createdAt) : null,
				createdLedger:
					typeof h.c.createdLedger === "number" ? h.c.createdLedger : null,
				dateBasis: typeof h.c.dateBasis === "string" ? h.c.dateBasis : null,
				sharedWithinFamily: family.length ? family : null,
				endedAt: h.c.endedAt ? String(h.c.endedAt) : null,
				asOf: h.asOf,
			},
		});
	}
	return out;
}
