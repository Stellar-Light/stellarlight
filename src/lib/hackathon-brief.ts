/**
 * Hackathon brief — the one-call version of the skill's "Hackathon Build
 * Brief" workflow. A two-day team's first-hour questions, joined server-side:
 *
 *   is it already built?      → vet (competitors, maturity, gap, prior art)
 *   what should we fork?      → startFrom (trust summaries for the top repos)
 *   what's live to build on?  → liveContracts (verified mainnet, by domain)
 *   is there money after?     → funding (live SCF round, funded peers)
 *   what must we not claim?   → whatNotToClaim (derived from the facts above)
 *
 * Composed from the existing builders (scf-pitch already contains the
 * vet-idea view; trust-report; contracts-registry; the builds index) — no
 * new data, no verdicts, every block keeps its own basis. Trimmed on purpose:
 * consumers sit behind a ~6k-token result cap, and the full trust report's
 * contractInterface alone can exceed it, so startFrom carries a summary and
 * points at /api/repos/trust for the rest.
 */
import type { Payload } from "payload";
import { buildContractsRegistry, type ContractRow } from "./contracts-registry";
import {
	getHackathonBuildsIndex,
	searchHackathonBuilds,
} from "./hackathon-builds";
import { buildScfPitch, type ScfPitchReport } from "./scf-pitch";
import { buildTrustReport, type TrustReport } from "./trust-report";

/** GAP_VERTICALS value → the closest code-domain axis /api/contracts filters
 * on. Verticals with no code-domain (RWA, Bridge, Gaming, …) map to null: the
 * contracts block then says so instead of guessing a domain. */
export const VERTICAL_TO_CONTRACT_DOMAIN: Record<string, string> = {
	Lending: "defi-lending",
	DEX: "defi-amm",
	Payments: "payments-x402",
	Anchor: "anchor-ramp",
	Indexer: "indexer",
	Wallet: "wallet-infra",
};

/** Idea-text hints that name a code domain more precisely than the vertical
 * does (an oracle or a yield vault is not a GAP_VERTICALS value). Checked
 * before the vertical map so "oracle for RWA prices" lands on oracle, not
 * on RWA → null. */
const TOKEN_TO_CONTRACT_DOMAIN: Array<[RegExp, string]> = [
	[/\boracles?\b|price[- ]feed/i, "oracle"],
	[/\byield\b|\bvaults?\b/i, "defi-yield"],
	[/\bx402\b|\bmpp\b/i, "payments-x402"],
	[/\bamm\b|\bswap\b|\bdex\b/i, "defi-amm"],
	[/\blend(ing)?\b|\bborrow/i, "defi-lending"],
	[/\banchor\b|\bon[- ]?ramp|\boff[- ]?ramp|sep-?24/i, "anchor-ramp"],
	[/\bindexer\b|\bindexing\b/i, "indexer"],
	[/\bpasskey|\bsmart[- ]account|\bwallet\b/i, "wallet-infra"],
];

export function contractDomainFor(
	idea: string,
	vertical: string | null,
): { domain: string | null; basis: string } {
	for (const [re, d] of TOKEN_TO_CONTRACT_DOMAIN)
		if (re.test(idea))
			return { domain: d, basis: `idea text names the ${d} domain` };
	if (vertical && VERTICAL_TO_CONTRACT_DOMAIN[vertical])
		return {
			domain: VERTICAL_TO_CONTRACT_DOMAIN[vertical],
			basis: `closest code domain to the ${vertical} vertical`,
		};
	return {
		domain: null,
		basis: vertical
			? `the ${vertical} vertical has no code-domain axis in the contracts registry`
			: "the idea did not resolve to a vertical or a code domain",
	};
}

export interface TrustSummary {
	repo: TrustReport["repo"];
	project: TrustReport["project"];
	codeTruth: Omit<TrustReport["codeTruth"], "contractInterface">;
	usage: TrustReport["usage"];
	audits: {
		count: number;
		latest: {
			auditor: string | null;
			publishedAt: string | null;
			title: string | null;
		};
	} | null;
	auditDrift: TrustReport["auditDrift"];
	succession: TrustReport["succession"];
	signals: TrustReport["signals"];
	/** The full report (incl. the complete contractInterface) lives here. */
	fullReport: string;
}

/** Trim a TrustReport to what a brief needs. Pure. */
export function summarizeTrust(t: TrustReport): TrustSummary {
	const { contractInterface: _iface, ...codeTruth } = t.codeTruth;
	return {
		repo: t.repo,
		project: t.project,
		codeTruth,
		usage: t.usage,
		audits: t.audits
			? { count: t.audits.count, latest: t.audits.latest }
			: null,
		auditDrift: t.auditDrift,
		succession: t.succession,
		signals: t.signals,
		fullReport: `/api/repos/trust?repo=${encodeURIComponent(t.repo.fullName)}`,
	};
}

export interface HackathonBrief {
	idea: string;
	vertical: string | null;
	/** Same computation as /api/vet-idea (competitors, maturity, gap, judged prior art). */
	vet: ScfPitchReport["vet"];
	/** Prototype-layer prior art: DoraHacks submissions matching the idea, winners first. */
	builds: Array<{
		name: string;
		hackathon: string;
		endedAt: string | null;
		isWinner: boolean;
		placement: string | null;
		githubUrl: string | null;
		url: string | null;
	}>;
	/** Candidate repos to fork/study — the top competitor repos that are not
	 * archived, with a trust summary each. A competitor is a starting point to
	 * READ, not necessarily a template. */
	startFrom: TrustSummary[];
	liveContracts: {
		domain: string | null;
		basis: string;
		contracts: Array<
			Pick<
				ContractRow,
				| "contractId"
				| "repo"
				| "project"
				| "stellarProof"
				| "codeDomains"
				| "interfaceSize"
				| "codeInUse"
			>
		>;
		note: string;
	};
	funding: {
		round: ScfPitchReport["round"];
		fundedPeers: ScfPitchReport["fundedPeers"];
		fundingBar: ScfPitchReport["fundingBar"];
	};
	/** Deterministic, derived from the blocks above — the overreaches this
	 * exact brief would tempt. Each names the fact it stands on. */
	whatNotToClaim: string[];
}

/** Pure: which claims THIS brief would tempt, from its own facts. */
export function deriveWhatNotToClaim(
	b: Omit<HackathonBrief, "whatNotToClaim">,
): string[] {
	const out: string[] = [];
	if (b.vet.gap)
		out.push(
			"'There is a gap' means SUPPLY-side coverage is thin — it is not evidence anyone wants this. Do not pitch demand from the gap number.",
		);
	if (b.vet.maturity.auditedProjects === 0)
		out.push(
			"'Nobody in this space is audited' — an audit absent from the registry means no PUBLISHED audit at our source, never that a protocol is unaudited.",
		);
	if (b.startFrom.length)
		out.push(
			"A repo's `signals` is a closed vocabulary of facts that hold ('audited', 'live-on-mainnet', 'code-changed-since-audit'…) — not a safety score. Do not rank repos by counting them.",
		);
	if (b.startFrom.some((s) => s.auditDrift && s.auditDrift.daysOfDrift > 0))
		out.push(
			"An audited starter with commits after its latest report: 'audited' does not cover the code you would fork. Say 'audited at <date>, changed since'.",
		);
	if (b.liveContracts.contracts.length === 0)
		out.push(
			"No verified contract in the registry for this domain is NOT 'nothing exists on mainnet' — the registry is evidence-gated. Say 'no verified contract on record'.",
		);
	if (b.funding.round.source === "unavailable")
		out.push(
			"SCF round state came back unavailable — do not say the round is closed. Verify at communityfund.stellar.org.",
		);
	if (b.vet.priorArt.repos.some((r) => r.activityState !== "active"))
		out.push(
			"Dead hackathon prior art is a signal about the idea's difficulty, not proof the space is free. Name it and say why yours will survive the weekend.",
		);
	if (b.vertical === null)
		out.push(
			"The idea did not resolve to a Stellar vertical — competitor and gap blocks are best-effort keyword hits, not a vertical census.",
		);
	return out;
}

export async function buildHackathonBrief(
	payload: Payload,
	q: string,
): Promise<HackathonBrief> {
	// scf-pitch already contains the vet-idea view + live round + funded peers.
	const pitch = await buildScfPitch(payload, q);
	const domain = contractDomainFor(q, pitch.vertical);

	const [contractsRes, index] = await Promise.all([
		domain.domain
			? buildContractsRegistry(payload, { domain: domain.domain, limit: 5 })
			: Promise.resolve({ contracts: [] as ContractRow[], total: 0 }),
		getHackathonBuildsIndex().catch(() => []),
	]);

	// Starter candidates: top competitor repos that are not archived, ≤2, each
	// with a trust summary. Fetched in parallel; a missing trust report just
	// drops that candidate (it means the repo isn't indexed deeply enough to
	// recommend forking anyway).
	const candidates = pitch.vet.competitors.repos
		.filter((r) => r.activityState !== "archived")
		.slice(0, 2);
	const trusts = await Promise.all(
		candidates.map((r) =>
			buildTrustReport(payload, r.fullName).catch(() => null),
		),
	);
	const startFrom = trusts
		.filter((t): t is TrustReport => !!t)
		.map(summarizeTrust);

	const builds = searchHackathonBuilds(index, q)
		.slice(0, 5)
		.map(({ b }) => ({
			name: b.name,
			hackathon: b.hackathon.title,
			endedAt: b.hackathon.endedAt ?? null,
			isWinner: b.isWinner,
			placement: b.hackathonPlacement ?? null,
			githubUrl: b.githubUrl ?? null,
			url: b.url ?? null,
		}));

	const partial: Omit<HackathonBrief, "whatNotToClaim"> = {
		idea: q,
		vertical: pitch.vertical,
		vet: pitch.vet,
		builds,
		startFrom,
		liveContracts: {
			domain: domain.domain,
			basis: domain.basis,
			contracts: contractsRes.contracts.slice(0, 5).map((c) => ({
				contractId: c.contractId,
				repo: c.repo,
				project: c.project,
				stellarProof: c.stellarProof,
				codeDomains: c.codeDomains,
				interfaceSize: c.interfaceSize,
				codeInUse: c.codeInUse,
			})),
			note:
				contractsRes.contracts.length === 0
					? "No verified contract on record for this domain — evidence-gated registry; absence is not nonexistence."
					: `${contractsRes.total} verified contract(s) in the registry for this domain; showing up to 5 — full list at /api/contracts?domain=${domain.domain}.`,
		},
		funding: {
			round: pitch.round,
			fundedPeers: pitch.fundedPeers.slice(0, 5),
			fundingBar: pitch.fundingBar,
		},
	};
	return { ...partial, whatNotToClaim: deriveWhatNotToClaim(partial) };
}
