/**
 * Live SCF round state from communityfund.stellar.org/awards (sls-014).
 *
 * sls-007 shipped the scfRound meta as a hand-curated constant on the belief
 * that SCF publishes no machine-readable round feed. sls-014 proved that
 * assumption stale-at-birth: the awards page EMBEDS a structured
 * `award_rounds` payload (roundNumber, phase, per-phase dates) in its RSC
 * flight stream — our constant said "no round confirmed open" while the page
 * showed SCF #45 in Submission. This module parses that payload on a 6-hour
 * revalidate (well inside the ~6-week round cadence) so the meta can never
 * again assert a negative its own cited source contradicts.
 *
 * Parsing notes (verified against the live page 2026-07-06):
 *   - The payload is split across RSC flight chunks, so one big JSON.parse
 *     fails mid-array. Small per-round regexes survive chunk boundaries.
 *   - `"phase":"X","roundNumber":N` pairs enumerate every round (45 at time
 *     of writing); each round's `dates` blob follows its roundNumber, and
 *     `awardSubmission.close` is the submission deadline shown on the page
 *     ("Deadline to submit: July 26, 2026" ⇄ close:"2026-07-26").
 *
 * INVARIANT (the sls-014 lesson): when the fetch/parse fails, callers must
 * fall back to a shape that does NOT claim "no round open" — say the live
 * check failed and point at verifyAt instead. fetchScfRounds returns null on
 * any failure precisely so the caller can't accidentally reuse stale
 * affirmative-negative copy.
 */

const AWARDS_URL = "https://communityfund.stellar.org/awards";
const REVALIDATE_SECONDS = 6 * 60 * 60; // 6h — weekly was recommended; this is tighter and free

export interface ScfRound {
	round: number;
	/** "Submission" | "Panel Review" | "Ended" | … (verbatim from the page) */
	phase: string;
	/** Submission deadline (awardSubmission.close), ISO date, when published. */
	submissionDeadline: string | null;
}

export interface ScfRoundState {
	/** Highest round not yet Ended (the round a "current SCF round?" question means). */
	currentRound: number | null;
	/** Phase of currentRound, verbatim. */
	currentPhase: string | null;
	/** Highest round with phase "Ended" — the last fully concluded round. */
	lastConcludedRound: number | null;
	/** All rounds not yet Ended (e.g. one in Submission AND one in Panel Review). */
	roundsInProgress: ScfRound[];
	/** Submission window of the round currently in the Submission phase, if any. */
	submissionWindow: { opens: string | null; closes: string | null };
	fetchedAt: string;
}

export async function fetchScfRounds(): Promise<ScfRoundState | null> {
	try {
		const res = await fetch(AWARDS_URL, {
			headers: { "user-agent": "stellarlight.xyz data layer (scf-round meta)" },
			next: { revalidate: REVALIDATE_SECONDS },
		});
		if (!res.ok) return null;
		const text = (await res.text()).replace(/\\"/g, '"');

		const rounds: ScfRound[] = [];
		const pairRe = /"phase":"([^"]+)","roundNumber":(\d+)/g;
		for (const m of text.matchAll(pairRe)) {
			const phase = m[1];
			const round = Number(m[2]);
			// The round's dates blob follows within a few hundred chars; grab the
			// submission deadline. Missing/empty stays null (never guessed).
			const seg = text.slice(m.index ?? 0, (m.index ?? 0) + 900);
			const dl = seg.match(
				/"awardSubmission":\{"open":"[^"]*","close":"(\d{4}-\d{2}-\d{2})"/,
			);
			rounds.push({ round, phase, submissionDeadline: dl ? dl[1] : null });
		}
		if (rounds.length === 0) return null;

		const inProgress = rounds
			.filter((r) => r.phase !== "Ended")
			.sort((a, b) => b.round - a.round);
		const concluded = rounds
			.filter((r) => r.phase === "Ended")
			.sort((a, b) => b.round - a.round);
		const submitting = inProgress.find((r) => r.phase === "Submission") ?? null;

		return {
			currentRound: inProgress[0]?.round ?? null,
			currentPhase: inProgress[0]?.phase ?? null,
			lastConcludedRound: concluded[0]?.round ?? null,
			roundsInProgress: inProgress,
			submissionWindow: {
				opens: null, // the page publishes deadlines, not open dates, for live rounds
				closes: submitting?.submissionDeadline ?? null,
			},
			fetchedAt: new Date().toISOString(),
		};
	} catch {
		return null;
	}
}
