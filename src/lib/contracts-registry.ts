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
 * a README-claimed contract id live on mainnet (stellar.expert echo-check)
 * OR enrich-onchain attributed real on-chain activity to the repo. No
 * self-declared registries, no directory prose. The set is small today and
 * grows exactly as fast as scans + weekly on-chain passes reach repos —
 * meta carries that honesty note.
 */

import type { Payload } from "payload";

export interface ContractRow {
	/** Verified mainnet contract id (C…), null when membership came via
	 * usage attribution without a specific id in the repo's README. */
	contractId: string | null;
	contractBasis: string | null;
	repo: { fullName: string; url: string | null };
	project: { slug: string; name: string | null } | null;
	stellarProof: string | null;
	codeDepth: number | null;
	codeDomains: string[];
	/** Extracted public contract fn signatures — size + a preview. */
	interfaceSize: number;
	interfacePreview: string[];
	codeInUse: {
		contracts: number;
		events: number | null;
		eventsDelta: number | null;
		asOf: string;
	} | null;
	audits: {
		count: number;
		latestAuditor: string | null;
		latestPublishedAt: string | null;
	} | null;
	successorRepo: string | null;
	scannedAt: string | null;
}

export interface ContractsQuery {
	q?: string;
	domain?: string;
	limit?: number;
	offset?: number;
}

export async function buildContractsRegistry(
	payload: Payload,
	opts: ContractsQuery = {},
): Promise<{ contracts: ContractRow[]; total: number }> {
	const { q = "", domain = "", limit = 20, offset = 0 } = opts;

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
		select: { readmeExcerpt: false },
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const docs = res.docs as any[];

	// One audits query for every owning project (EXACT projectSlug join —
	// the repo-knowledge discipline, never fuzzy).
	const slugs = [
		...new Set(docs.map((d) => d.projectSlug).filter(Boolean)),
	] as string[];
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

	let rows: ContractRow[] = docs.map((d) => {
		const iface: string[] = Array.isArray(d.contractInterface)
			? d.contractInterface.filter(
					(s: unknown): s is string => typeof s === "string",
				)
			: [];
		const ciu = d.codeInUse;
		return {
			contractId: d.mainnetContractId ? String(d.mainnetContractId) : null,
			contractBasis: d.mainnetContractBasis
				? String(d.mainnetContractBasis)
				: null,
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
							events: ciu.events ?? null,
							eventsDelta: ciu.eventsDelta ?? null,
							asOf: String(ciu.asOf),
						}
					: null,
			audits: d.projectSlug
				? (auditsByProject.get(String(d.projectSlug)) ?? null)
				: null,
			successorRepo: d.successorRepo ? String(d.successorRepo) : null,
			scannedAt: d.codeScannedAt ? String(d.codeScannedAt) : null,
		};
	});

	if (domain) rows = rows.filter((r) => r.codeDomains.includes(domain));
	if (q) {
		const needle = q.toLowerCase();
		rows = rows.filter(
			(r) =>
				r.repo.fullName.toLowerCase().includes(needle) ||
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
