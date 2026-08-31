/**
 * Quality grade (0-100) for a code reference — the "grade certain repos as
 * better references" artifact. A repo's OWN merit is the base (its stars,
 * recency, whether it's documented/tagged); inherited project/builder authority
 * (hackathon-winner + SCF-funded + prominence) is a BOOST *gated by* own merit,
 * so a flagship org's throwaway sub-repo (0 stars, no description) can't ride
 * its parent's prominence to a "strong reference" score. Archived/fork repos
 * are down-weighted. Computed at enrich time and stored as `repoScore`;
 * /api/repos/search ranks by it so an agent gets the strongest *real* existing
 * references first, not a flagship org's peripheral plumbing.
 */

export interface RepoGradeInput {
	lastCommitAt?: string | Date | null;
	stargazerCount?: number | null;
	isFork?: boolean;
	isArchived?: boolean;
	hackathonWinner?: boolean; // owning project placed in a hackathon
	scfAwarded?: boolean; // owning project is SCF-funded
	projectProminence?: number; // 0-100 curated prominence of the owning project
	builderReputation?: number; // 0-1, from the owning builder's Stellar Passport (SCF tier / featured / activity)
	/** on the hand-maintained canonical list (src/lib/repo-search.ts) — the
	 * strongest external validation we have: a human said this repo IS the
	 * answer for a concept. */
	curatedCanonical?: boolean;
	// Own-merit signals so a flagship org's throwaway sub-repo can't inherit the
	// parent's full authority (e.g. reflector's 0-star node-orchestrator).
	hasDescription?: boolean;
	topicCount?: number;
	openIssues?: number;
	// AI/human code-review score (0-1) from a hackathon evaluation. When present,
	// it's the strongest quality signal we have — an actual code review — so it
	// can lift a 0-star hackathon repo to a strong reference (and sink a weak one
	// regardless of how fresh/linked it is). Ungated by own-merit on purpose.
	judgeScore?: number | null;
	// Code-Truth Ledger depth (0-1) from analyzing the repo's actual Soroban
	// source (soroban-sdk dep, contract macros, auth/storage, deployable cdylib).
	// Like judgeScore, it's evidence from the CODE, not heuristics — a
	// code-verified 0-star contract earns a strong reference on its own merit.
	// Ungated by own-merit on purpose (the code IS the merit).
	codeDepth?: number | null;
	/** Default-branch commits in the last 90 days (activitySignals.commits90d).
	 * Refines freshness WITHIN the fresh band: two repos committed last week can
	 * differ 50x in velocity. Null = not captured — no penalty, never punish
	 * missing data. */
	commits90d?: number | null;
}

export interface RepoGrade {
	score: number; // 0-100
	label: "high" | "medium" | "low";
	freshness: number; // 0-1
	traction: number; // 0-1
	authority: number; // 0-1
	ownMerit: number; // 0-1
}

const DAY_MS = 86_400_000;

/**
 * Observable per-repo activity state, derived at serve time — never stored, so
 * it can't go stale, and never guessed (the repo-stale ≠ defunct lesson):
 *   archived   — the OWNER's own declaration; the only death verdict we make
 *   active     — a known commit within 45 days
 *   maintained — within 180 days
 *   dormant    — older than 180 days (a KNOWN date; an observation, not a verdict)
 *   unknown    — no commit date held; absence of evidence, never evidence of death
 */
export type RepoActivityState =
	| "active"
	| "maintained"
	| "dormant"
	| "archived"
	| "unknown";

export const REPO_ACTIVITY_STATES: readonly RepoActivityState[] = [
	"active",
	"maintained",
	"dormant",
	"archived",
	"unknown",
];

export function activityStateOf(
	lastCommitAt: string | Date | null | undefined,
	isArchived: boolean | null | undefined,
): RepoActivityState {
	if (isArchived) return "archived";
	if (!lastCommitAt) return "unknown";
	const t = new Date(lastCommitAt).getTime();
	if (!Number.isFinite(t)) return "unknown";
	const ageDays = (Date.now() - t) / DAY_MS;
	if (ageDays <= 45) return "active";
	if (ageDays <= 180) return "maintained";
	return "dormant";
}

// 1.0 within ~90 days, linearly decaying to 0 by ~2 years stale.
function freshnessOf(lastCommitAt?: string | Date | null): number {
	if (!lastCommitAt) return 0;
	const t = new Date(lastCommitAt).getTime();
	if (!Number.isFinite(t)) return 0;
	const ageDays = (Date.now() - t) / DAY_MS;
	if (ageDays <= 90) return 1;
	if (ageDays >= 730) return 0;
	return 1 - (ageDays - 90) / (730 - 90);
}

// Log-scaled stars, saturating around 1,000 stars → 1.0.
function tractionOf(stars?: number | null): number {
	const s = Math.max(0, stars ?? 0);
	return Math.min(1, Math.log10(s + 1) / 3);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function repoGrade(input: RepoGradeInput): RepoGrade {
	// Velocity-adjusted freshness (repo-intel blend, answer-key calibrated):
	// date freshness says WHEN the last commit was; commits90d says how alive
	// the repo is within that band. 1 commit → 0.85x, 30+/90d → 1.0x. The
	// swing is deliberately small (≤ ~2 score points) — a tie-breaker among
	// active repos, never a rank-upheaver; null = 1.0x (no data, no penalty).
	const velocityAdj =
		typeof input.commits90d === "number" && Number.isFinite(input.commits90d)
			? 0.85 + 0.15 * Math.min(Math.max(input.commits90d, 0) / 30, 1)
			: 1;
	const freshness = freshnessOf(input.lastCommitAt) * velocityAdj;
	const traction = tractionOf(input.stargazerCount);
	const hasDesc = input.hasDescription ? 1 : 0;
	const hasTopics = (input.topicCount ?? 0) > 0 ? 1 : 0;
	const engaged = (input.openIssues ?? 0) > 0 ? 1 : 0;

	// Does the repo stand on its OWN as a reference? Stars + recency + whether
	// it's documented/tagged/has any engagement. This is the base — a 0-star,
	// undocumented sub-repo scores low here no matter whose org it's under.
	const ownMerit = clamp01(
		0.45 * traction +
			0.25 * freshness +
			0.18 * hasDesc +
			0.07 * hasTopics +
			0.05 * engaged,
	);

	// Inherited authority from the owning project/builder.
	let authority = 0;
	if (input.hackathonWinner) authority += 0.35;
	if (input.scfAwarded) authority += 0.25;
	authority += Math.min(0.4, Math.max(0, input.projectProminence ?? 0) / 250); // prominence 100 → +0.4
	authority += Math.min(0.4, Math.max(0, input.builderReputation ?? 0) * 0.4); // builder rep → up to +0.4
	authority = Math.min(1, authority);

	// Authority is a BOOST gated by own merit: a no-merit peripheral repo only
	// gets ~30% of its parent's authority, so flagship plumbing can't ride the
	// org's prominence up to "strong reference".
	const boostedAuthority = authority * (0.3 + 0.7 * ownMerit);

	let composite = 0.6 * ownMerit + 0.4 * boostedAuthority;

	// A code review trumps heuristics. If this repo was judged, blend toward the
	// review: a 5/5 (judge 1.0) becomes a strong reference even at 0 stars; a
	// 1/5 caps it low. Take the better of heuristic vs judge-driven so a repo
	// that's BOTH judged-high and has traction can still climb past judged-only.
	if (
		typeof input.judgeScore === "number" &&
		Number.isFinite(input.judgeScore)
	) {
		const j = Math.max(0, Math.min(1, input.judgeScore));
		const judgeDriven = 0.05 + 0.8 * j; // 0 → 0.05, 1 → 0.85
		composite = Math.max(composite, judgeDriven);
	}

	// Code depth trumps heuristics too — parallel to judgeScore. A code-verified
	// deployable contract (codeDepth ~1.0) becomes a strong reference even at 0
	// stars, fixing star-dominance for the long tail of real-but-unstarred repos.
	// That intent is right and is preserved.
	//
	// But UNGATED it was inverted, and this is the field agents actually rank
	// on. codeDepth measures how heavily a repo USES the Stellar SDK — which an
	// APPLICATION answers better than the SDK itself, because a library does not
	// import itself. Measured live 2026-08-30, sorted by repoScore:
	//
	//     85  Andy00L/x402-autopilot        (0 stars, no project)
	//     85  ashfrancis/chickenz           (0 stars, no project)
	//     85  xaviersharwin10/soroban_node_0
	//     ...
	//     76  stellar/js-stellar-sdk
	//
	// Student dApps outranking SDF's own SDK, on the number Scout tells agents
	// to trust. So the code-driven lift is now SCALED BY EXTERNAL VALIDATION —
	// does anything outside the repo's own source say it is an answer? This is
	// the same discipline already applied to `authority` above ("a no-merit
	// peripheral repo only gets ~30% of its parent's authority"): deep code is
	// evidence a repo is REAL, not evidence it is CANONICAL.
	//
	// Deliberately NOT gated on stars alone — that would reinstate the star
	// dominance this branch exists to fix. A curated or SCF-funded or
	// project-linked repo keeps the full lift at zero stars.
	if (typeof input.codeDepth === "number" && Number.isFinite(input.codeDepth)) {
		const c = Math.max(0, Math.min(1, input.codeDepth));
		const validated = input.curatedCanonical
			? 1 // a human named it the canonical answer
			: input.scfAwarded || (input.projectProminence ?? 0) > 0
				? 0.85 // funded, or linked to a curated project
				: (input.stargazerCount ?? 0) >= 10
					? 0.7 // the ecosystem noticed it
					: 0.45; // deep code and nothing else vouching for it
		const codeDriven = (0.1 + 0.7 * c) * validated;
		composite = Math.max(composite, codeDriven);
	}

	if (input.isArchived) composite *= 0.5; // archived = weaker reference
	if (input.isFork) composite *= 0.7; // forks deprioritized
	composite = clamp01(composite);

	const score = Math.round(composite * 100);
	const label = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
	return {
		score,
		label,
		freshness: Math.round(freshness * 100) / 100,
		traction: Math.round(traction * 100) / 100,
		authority: Math.round(authority * 100) / 100,
		ownMerit: Math.round(ownMerit * 100) / 100,
	};
}
