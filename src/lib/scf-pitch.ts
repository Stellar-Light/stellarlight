/**
 * SCF-pitch — the "help me prep a Stellar Community Fund pitch" composite.
 *
 * Joins what a pitch-writer assembles by hand: the LIVE round state (open
 * submissions + deadline, from the same source /api/rfps serves), the
 * vertical's already-funded peers with real award totals (differentiation
 * targets), the full vet-idea view (competitors, supply-side gap, prior
 * art), and deterministic pitch angles derived from those facts. No prose
 * generation — every angle names the fact it stands on, and every block
 * carries its basis.
 */

import type { Payload } from "payload";
import { ACTIVE_PROJECT_STATUSES } from "./population";
import { fetchScfRounds } from "./scf-rounds";
import { buildVetIdea, type VetIdeaReport } from "./vet-idea";

export interface ScfPitchReport {
	idea: string;
	vertical: string | null;
	/** Live round state — never asserts a negative on fetch failure. */
	round: {
		source: "live" | "unavailable";
		open: Array<{
			round: number;
			phase: string | null;
			submissionDeadline: string | null;
		}>;
		note: string;
	};
	/** Already-funded ACTIVE projects in the vertical, largest award first —
	 * the projects a pitch must differentiate against. */
	fundedPeers: Array<{
		slug: string;
		name: string | null;
		totalAwardedUSD: number | null;
		lastAwardedRound: number | null;
	}>;
	fundingBar: {
		fundedProjects: number;
		totalAwardedUSD: number;
		basis: string;
	};
	/** The competitive/gap/prior-art view — same computation as /api/vet-idea. */
	vet: Pick<VetIdeaReport, "competitors" | "maturity" | "priorArt" | "gap">;
	/** Deterministic angles — each names the fact it stands on. */
	angles: string[];
}

export async function buildScfPitch(
	payload: Payload,
	q: string,
): Promise<ScfPitchReport> {
	const [vet, scfLive] = await Promise.all([
		buildVetIdea(payload, q),
		fetchScfRounds().catch(() => null),
	]);

	const open = (scfLive?.roundsInProgress ?? [])
		.filter((r) => /submission/i.test(r.phase ?? ""))
		.map((r) => ({
			round: r.round,
			phase: r.phase ?? null,
			submissionDeadline: r.submissionDeadline ?? null,
		}));
	const round: ScfPitchReport["round"] = scfLive
		? {
				source: "live",
				open,
				note: open.length
					? "Apply via https://communityfund.stellar.org — rules in the SCF Handbook."
					: "No round currently in Submission phase; the next opening is announced on communityfund.stellar.org.",
			}
		: {
				source: "unavailable",
				open: [],
				note: "Live round check failed — verify at https://communityfund.stellar.org before assuming anything about round state.",
			};

	// Funded peers: vertical-wide over ACTIVE projects, structured scf truth.
	let fundedPeers: ScfPitchReport["fundedPeers"] = [];
	let fundedCount = 0;
	let totalAwardedUSD = 0;
	if (vet.vertical) {
		const res = await payload.find({
			collection: "projects",
			where: { status: { in: [...ACTIVE_PROJECT_STATUSES] } },
			limit: 5000,
			depth: 0,
			select: {
				slug: true,
				name: true,
				types: true,
				scf: true,
				scfAwarded: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		const funded = fundedInVertical(res.docs as any[], vet.vertical);
		fundedPeers = funded.peers.slice(0, 8);
		fundedCount = funded.count;
		totalAwardedUSD = funded.totalAwardedUSD;
	}

	const angles: string[] = [];
	if (open.length)
		angles.push(
			`SCF Round #${open[0].round} is in Submission now${open[0].submissionDeadline ? ` (deadline ${open[0].submissionDeadline})` : ""} — a live window, not a someday plan.`,
		);
	if (vet.gap && vet.gap.total <= 3)
		angles.push(
			`Coverage argument: only ${vet.gap.total} active ${vet.vertical} project(s) in the directory — supply-side gap (not a demand claim).`,
		);
	if (vet.gap && vet.gap.total > 3 && fundedCount)
		angles.push(
			`Differentiation required: ${vet.vertical} has ${vet.gap.total} active projects and SCF already funded ${fundedCount} of them (largest awards: ${fundedPeers
				.slice(0, 3)
				.map((p) => p.slug)
				.join(", ")}). The pitch must say what they don't do.`,
		);
	if (fundedCount === 0 && vet.vertical)
		angles.push(
			`No ACTIVE ${vet.vertical} project carries an SCF award on record — first-mover framing available (absence of a record, not proof none exists).`,
		);
	const deadPrior = countWentQuiet(vet.priorArt.repos);
	if (deadPrior > 0)
		angles.push(
			`${deadPrior} judged-hackathon prior attempt(s) in this space went quiet (no commit in 180 days) or were archived. Address why this one survives (reviewers will ask).`,
		);
	if (vet.maturity.liveOnMainnetRepos > 0)
		angles.push(
			`${vet.maturity.liveOnMainnetRepos} competitor repo(s) verified live on mainnet — working-code bar is set; a deck-only pitch underperforms here.`,
		);

	return {
		idea: q,
		vertical: vet.vertical,
		round,
		fundedPeers,
		fundingBar: {
			fundedProjects: fundedCount,
			totalAwardedUSD,
			basis:
				"Every ACTIVE directory project in the vertical with a structured SCF award record (scf.awarded); totalAwardedUSD is the recorded award USD across all of them. fundedPeers lists the 8 largest.",
		},
		vet: {
			competitors: vet.competitors,
			maturity: vet.maturity,
			priorArt: vet.priorArt,
			gap: vet.gap,
		},
		angles,
	};
}

/** Every ACTIVE project in the vertical with an SCF award on record, largest
 * award first, with the count and total over ALL of them. The report shows the
 * top 8 as peers; the angle once called that display cap the funded count
 * ("SCF already funded 8" for a vertical with 192 funded projects). */
export function fundedInVertical(
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	docs: any[],
	vertical: string,
): {
	peers: ScfPitchReport["fundedPeers"];
	count: number;
	totalAwardedUSD: number;
} {
	const peers = docs
		.filter(
			(p) =>
				Array.isArray(p.types) &&
				p.types.includes(vertical) &&
				(p.scf?.awarded ?? p.scfAwarded),
		)
		.map((p) => ({
			slug: String(p.slug),
			name: p.name ? String(p.name) : null,
			totalAwardedUSD:
				typeof p.scf?.totalAwarded === "number" ? p.scf.totalAwarded : null,
			lastAwardedRound:
				typeof p.scf?.lastAwardedRound === "number"
					? p.scf.lastAwardedRound
					: null,
		}))
		.sort((a, b) => (b.totalAwardedUSD ?? 0) - (a.totalAwardedUSD ?? 0));
	return {
		peers,
		count: peers.length,
		totalAwardedUSD: peers.reduce((n, p) => n + (p.totalAwardedUSD ?? 0), 0),
	};
}

/** Prior attempts that went quiet: dormant (no commit in 180 days) or
 * archived. A maintained repo (a commit within 180 days) did not go inactive,
 * though the angle used to count it. */
export function countWentQuiet(
	repos: Array<{ activityState?: string | null }>,
): number {
	return repos.filter(
		(r) => r.activityState === "dormant" || r.activityState === "archived",
	).length;
}
