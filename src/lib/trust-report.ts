/**
 * Trust report — the code-truth composite for one repo.
 *
 * "Should I depend on this?" is a JOIN, not a lookup: code truth from the
 * scanner (proof, depth, domains, interface), live on-chain usage, the
 * audits registry with drift since the latest report, succession, activity,
 * and project linkage — one call instead of five, every field evidence-
 * grounded, no synthetic verdicts. `signals` names the facts that hold
 * (deterministic, closed vocabulary); the consumer draws the conclusion.
 *
 * The interface block is the codegen guard: generated calls can be checked
 * against the real scanned signatures (the silent-success family — calling
 * a function that doesn't exist — is caught by ground truth, not prose).
 *
 * Deferred (needs evidence we don't store yet): dependents-of-this-repo
 * requires a repo→published-crate-names mapping (stellarDeps holds crate
 * names, not repo names); ship when the scanner extracts crate identity.
 */

import type { Payload } from "payload";
import { activityStateOf } from "./repo-grade";

export const TRUST_SIGNALS = [
	"scanned",
	"deep-code",
	"live-on-mainnet",
	"verified-contract-id",
	"audited",
	"multi-audited",
	"code-changed-since-audit",
	"actively-maintained",
	"archived",
	"superseded",
] as const;
export type TrustSignal = (typeof TRUST_SIGNALS)[number];

export interface TrustReport {
	repo: {
		fullName: string;
		url: string | null;
		stars: number | null;
		lastCommitAt: string | null;
		isArchived: boolean;
		tier: string | null;
		activityState: string;
	};
	project: { slug: string; name: string | null } | null;
	codeTruth: {
		scanState: string | null;
		scannedAt: string | null;
		stellarProof: string | null;
		codeDepth: number | null;
		codeDomains: string[];
		sdkCapabilities: string[];
		interfaceSize: number;
		contractInterface: string[];
		mainnetContractId: string | null;
	};
	usage: {
		contracts: number;
		events: number | null;
		eventsDelta: number | null;
		subinvocations: number | null;
		asOf: string;
	} | null;
	audits: {
		count: number;
		latest: { auditor: string | null; publishedAt: string | null; title: string | null };
		reports: Array<{ auditor: string | null; publishedAt: string | null; title: string | null }>;
	} | null;
	/** Commits landing AFTER the latest audit report — audited code is not
	 * necessarily the code running today. Null when unaudited or undated. */
	auditDrift: { latestAuditAt: string; lastCommitAt: string; daysOfDrift: number } | null;
	succession: { successorRepo: string | null; predecessors: string[] };
	signals: TrustSignal[];
}

export async function buildTrustReport(
	payload: Payload,
	fullName: string,
): Promise<TrustReport | null> {
	const res = await payload.find({
		collection: "repos",
		where: { fullName: { equals: fullName } },
		limit: 1,
		depth: 0,
		select: { readmeExcerpt: false },
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const d = res.docs[0] as any;
	if (!d) return null;

	const iface: string[] = Array.isArray(d.contractInterface)
		? d.contractInterface.filter((s: unknown): s is string => typeof s === "string")
		: [];
	const ciu = d.codeInUse;
	const usage =
		ciu?.asOf && typeof ciu.contracts === "number"
			? {
					contracts: ciu.contracts as number,
					events: (ciu.events ?? null) as number | null,
					eventsDelta: (ciu.eventsDelta ?? null) as number | null,
					subinvocations: (ciu.subinvocations ?? null) as number | null,
					asOf: String(ciu.asOf),
				}
			: null;

	// Audits: exact projectSlug join (never fuzzy), all reports newest-first.
	let audits: TrustReport["audits"] = null;
	if (d.projectSlug) {
		const ares = await payload.find({
			collection: "audits",
			where: { projectSlug: { equals: String(d.projectSlug) } },
			limit: 100,
			depth: 0,
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		const rows = (ares.docs as any[])
			.map((a) => ({
				auditor: a.auditor ? String(a.auditor) : null,
				publishedAt: a.publishedAt ? String(a.publishedAt) : null,
				title: a.title ? String(a.title) : null,
			}))
			.sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")));
		if (rows.length) audits = { count: rows.length, latest: rows[0], reports: rows };
	}

	const lastCommitAt = d.lastCommitAt ? String(d.lastCommitAt) : null;
	const latestAuditAt = audits?.latest.publishedAt ?? null;
	const auditDrift =
		latestAuditAt && lastCommitAt && lastCommitAt > latestAuditAt
			? {
					latestAuditAt,
					lastCommitAt,
					daysOfDrift: Math.floor(
						(new Date(lastCommitAt).getTime() - new Date(latestAuditAt).getTime()) / 864e5,
					),
				}
			: null;

	// Succession both directions: our successor, and repos naming US theirs.
	const pres = await payload.find({
		collection: "repos",
		where: { successorRepo: { equals: fullName } },
		limit: 20,
		depth: 0,
		select: { fullName: true },
	});
	const predecessors = (pres.docs as Array<{ fullName?: string }>)
		.map((p) => String(p.fullName ?? ""))
		.filter(Boolean);

	const activityState = activityStateOf(lastCommitAt, !!d.isArchived);
	const signals: TrustSignal[] = [];
	if (d.codeScanState === "scanned") signals.push("scanned");
	if (typeof d.codeDepth === "number" && d.codeDepth >= 0.5) signals.push("deep-code");
	if ((usage?.contracts ?? 0) >= 1) signals.push("live-on-mainnet");
	if (d.mainnetContractId) signals.push("verified-contract-id");
	if ((audits?.count ?? 0) >= 1) signals.push("audited");
	if ((audits?.count ?? 0) >= 3) signals.push("multi-audited");
	if (auditDrift) signals.push("code-changed-since-audit");
	if (activityState === "active") signals.push("actively-maintained");
	if (d.isArchived) signals.push("archived");
	if (d.successorRepo) signals.push("superseded");

	return {
		repo: {
			fullName: String(d.fullName),
			url: d.url ? String(d.url) : null,
			stars: typeof d.stars === "number" ? d.stars : null,
			lastCommitAt,
			isArchived: !!d.isArchived,
			tier: d.tier ? String(d.tier) : null,
			activityState,
		},
		project: d.projectSlug
			? { slug: String(d.projectSlug), name: d.projectName ? String(d.projectName) : null }
			: null,
		codeTruth: {
			scanState: d.codeScanState ? String(d.codeScanState) : null,
			scannedAt: d.codeScannedAt ? String(d.codeScannedAt) : null,
			stellarProof: d.stellarProof ? String(d.stellarProof) : null,
			codeDepth: typeof d.codeDepth === "number" ? d.codeDepth : null,
			codeDomains: Array.isArray(d.codeDomains)
				? d.codeDomains.filter((s: unknown): s is string => typeof s === "string")
				: [],
			sdkCapabilities: Array.isArray(d.sdkCapabilities)
				? d.sdkCapabilities.filter((s: unknown): s is string => typeof s === "string")
				: [],
			interfaceSize: iface.length,
			contractInterface: iface.slice(0, 60),
			mainnetContractId: d.mainnetContractId ? String(d.mainnetContractId) : null,
		},
		usage,
		audits,
		auditDrift,
		succession: {
			successorRepo: d.successorRepo ? String(d.successorRepo) : null,
			predecessors,
		},
		signals,
	};
}
