/**
 * Shared helpers for reading the OFFICIAL SCF source of truth
 * (communityfund.stellar.org) — extracted verbatim from scf-crosscheck.ts so
 * the fix wave (scripts/data/fix-scf-rounds.ts) and the report
 * (scripts/eval/scf-crosscheck.ts) parse the source with the SAME calibrated
 * logic instead of drifting copies. Behavior-preserving move: the crosscheck's
 * output is byte-identical to its pre-extraction runs.
 *
 * Calibration lessons carried by this module (run-1 + phoenix #18/#24):
 *  - Badge / `buildAwardRounds` arrays on SCF pages include NOT-awarded
 *    submission rounds — NEVER trust them for round membership.
 *  - Per-submission verdicts ({"status":"Awarded"/"Not Awarded"} + roundName)
 *    are the only membership truth on the page.
 *  - Absence of a badge/verdict is NOT negative evidence — ambiguity never
 *    accuses (callers must treat unparseable pages as unverifiable).
 */

export const SCF = "https://communityfund.stellar.org";

export const canon = (s: string) =>
	(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ScfEntry {
	base: string;
	rounds: string[];
	url: string;
}

/** Scrape the SCF projects listing: one entry per project detail link, with
 * the nearby `SCF #N` badge numbers (round badges include not-awarded rounds —
 * usable for presence signals only, never for membership). */
export async function fetchScf(): Promise<ScfEntry[]> {
	const res = await fetch(`${SCF}/projects`, {
		headers: { "User-Agent": "stellarlight-scf-crosscheck" },
	});
	if (!res.ok) throw new Error(`SCF listing: ${res.status}`);
	const html = await res.text();
	const matches = [...html.matchAll(/href="\/project\/([a-z0-9-]+)"/g)];
	const out = new Map<string, ScfEntry>();
	for (let i = 0; i < matches.length; i++) {
		const slug = matches[i][1];
		if (out.has(slug)) continue;
		const base = slug.replace(/-[a-z0-9]{3}$/, "");
		const start = matches[i].index ?? 0;
		const end = matches[i + 1]?.index ?? Math.min(html.length, start + 6000);
		const rounds = [
			...new Set(
				[...html.slice(start, end).matchAll(/SCF\s*#(\d+)/g)].map((m) => m[1]),
			),
		];
		out.set(slug, { base, rounds, url: `${SCF}/project/${slug}` });
	}
	return [...out.values()];
}

/**
 * Statuses the SCF detail page uses that are AFFIRMATIVE negative verdicts —
 * the submission was considered and did NOT result in an award. Calibrated on
 * the 2026-07-11 "ambiguous 13" hand-verification wave (grantfox/cartwey/
 * freedom-pay-wallet/alternun/nobak/sorobanhooks/surgepay/joona-pay/airgap/
 * peerpesa/sytemap/venerez/abroad — every one carried at least one of these on
 * its rendered submission cards, cross-checked against the official per-round
 * recap winner lists) plus the sls-026 Aquarius "Ineligible" round-30 row.
 * "Rejected" appears with suffixes ("Rejected - timeout" on alternun's #40),
 * so it matches as a prefix. Anything NOT listed here and not "Awarded"
 * (e.g. "Information Collection", "Pending", "Test Transaction", "Ready for
 * Payment") is NEUTRAL — in-flight or ambiguous, never negative evidence.
 */
const NEGATIVE_STATUSES = [
	"Not Awarded",
	"Prescreen Failed",
	"Panel Review Failed",
	"Ineligible",
] as const;
export function isNegativeVerdict(status: string): boolean {
	return (
		(NEGATIVE_STATUSES as readonly string[]).includes(status) ||
		/^Rejected\b/.test(status)
	);
}

/**
 * Per-round award verdicts from a detail page's submission cards. The page
 * embeds each submission as structured data with an explicit status:
 *   {"status":"Not Awarded", …, "roundName":"SCF #24", …}
 * (present twice — flight chunks + inline props — with escaped quotes; we
 * unescape and dedupe via sets). A round counts as AWARDED if ANY submission
 * in it was awarded (projects resubmit within a round — phoenix's Liquidity
 * round has both verdicts), and NOT-awarded only when every submission in the
 * round carries an affirmative NEGATIVE verdict (isNegativeVerdict above:
 * "Not Awarded" / "Prescreen Failed" / "Panel Review Failed" / "Ineligible" /
 * "Rejected…"). Neutral/in-flight statuses (e.g. "Information Collection",
 * "Pending", "Ready for Payment") verdict NOTHING — those rounds stay out of
 * both sets, so ambiguity still never accuses (sls-026/GT-17: a populated
 * amount or Build award_type must not imply Awarded — nor Not-Awarded).
 * Rounds without an SCF #N number (e.g. "Liquidity Award…") don't map onto
 * our numeric scfAwardedRounds and are ignored for the round sets, but still
 * count toward `awardedAnyCount` so a caller can tell "zero awarded
 * submissions AT ALL" from "awards only in non-numeric rounds" (the
 * coopstable boolean-fix precondition).
 * NOTE: the page's `buildAwardRounds` array is NOT usable — it includes
 * not-awarded rounds (verified on phoenix-svj, 2026-07-11).
 */
export function parseRoundVerdicts(html: string): {
	awarded: Set<string>;
	notAwarded: Set<string>;
	/** Submission cards with a DECISIVE status (Awarded or a negative verdict).
	 * Neutral/in-flight cards are excluded — preserved semantics from when the
	 * parser only read Awarded/Not Awarded: `submissions === 0` still means
	 * "the page verdicts nothing", the never-accuse skip condition. */
	submissions: number;
	/** Submissions with status "Awarded" in ANY round, numeric or not. */
	awardedAnyCount: number;
	/** sls-058 defect 2: the official submission record per AWARDED numeric
	 * round — published budget (USD) + award type off the same submission cards
	 * the verdicts come from. A round with MULTIPLE awarded submissions sums
	 * their budgets (deduped by card id — the page embeds each card twice);
	 * one missing budget nulls the round, a partial sum lies. budgetUSD null =
	 * award confirmed but no parseable budget — never guessed. Reconciling
	 * basis for the page's own totalAwarded, which can still exceed it. */
	awards: Array<{
		round: number;
		budgetUSD: number | null;
		awardType: string | null;
	}>;
} {
	const txt = html.replace(/\\"/g, '"');
	const awardByRound = new Map<
		number,
		{ round: number; budgetUSD: number | null; awardType: string | null }
	>();
	// Field order within one submission object: status … roundName … awardType
	// … budget (verified on fluxity-mez 2026-08-03). The [^{}] guards keep every
	// capture inside a single object — a missing awardType/budget fails to null,
	// never bleeds into the next card.
	const re =
		/"id":"([^"]+)"[^{}]*?"status":"([^"]+)"[^{}]*?"roundName":"([^"]+)"(?:[^{}]*?"awardType":"([^"]*)")?(?:[^{}]*?"budget":(\d+(?:\.\d+)?))?/g;
	// Per-CARD collection first: the page embeds each card twice (flight
	// reference form + resolved props form) and the reference form can carry a
	// TRUNCATED budget (bondhive #29: 100 vs the resolved 100000). Keep the MAX
	// budget per card id across embeds — resolved ≥ reference always, and
	// agreeing embeds are a no-op. Rounds are folded from cards afterwards.
	interface Card {
		id: string;
		isAward: boolean;
		roundNum: number | null;
		budgetUSD: number | null;
		awardType: string | null;
	}
	const cardByKey = new Map<string, Card>();
	const mergeInto = (prev: Card, next: Card) => {
		prev.budgetUSD =
			prev.budgetUSD !== null && next.budgetUSD !== null
				? Math.max(prev.budgetUSD, next.budgetUSD)
				: (prev.budgetUSD ?? next.budgetUSD);
		prev.awardType = prev.awardType ?? next.awardType;
	};
	for (const m of txt.matchAll(re)) {
		const status = m[2];
		const isAward = status === "Awarded";
		if (!isAward && !isNegativeVerdict(status)) continue; // neutral — verdicts nothing
		const num = m[3].match(/SCF\s*#\s*(\d+)/i)?.[1];
		const card: Card = {
			id: m[1],
			isAward,
			roundNum: num ? Number(num) : null,
			budgetUSD: isAward && m[5] ? Number(m[5]) : null,
			awardType: isAward && m[4] ? m[4] : null,
		};
		const key = `${card.isAward ? "A" : "N"}|${card.id}`;
		const prev = cardByKey.get(key);
		if (!prev) cardByKey.set(key, card);
		else mergeInto(prev, card);
	}
	// RSC chunk boundaries can split a card's id VALUE mid-string, so the same
	// card re-matches under a truncated id and double-counts (prism-dxb: the
	// resolved embed matched as id "r" beside "recpWygA3kmg3NsZx", summing #44
	// to exactly 2× the page's own Total awarded). A fragment id is always a
	// PREFIX of the full id (the regex needs the literal `"id":"` before the
	// capture, which only survives on the head side of the split). So: a card
	// whose id is a proper prefix of another same-polarity card's id, with the
	// same round and award type, is that card's other embed — merge, never sum.
	const cards: Card[] = [];
	for (const card of cardByKey.values()) {
		const host = [...cardByKey.values()].find(
			(other) =>
				other !== card &&
				other.isAward === card.isAward &&
				other.id.length > card.id.length &&
				other.id.startsWith(card.id) &&
				other.roundNum === card.roundNum &&
				(other.awardType === card.awardType ||
					other.awardType === null ||
					card.awardType === null),
		);
		if (host) mergeInto(host, card);
		else cards.push(card);
	}
	const awarded = new Set<string>();
	const negative = new Set<string>();
	let submissions = 0;
	let awardedAnyCount = 0;
	for (const c of cards) {
		submissions++;
		if (c.isAward) awardedAnyCount++;
		if (c.roundNum === null) continue;
		const round = String(c.roundNum);
		if (c.isAward) awarded.add(round);
		else negative.add(round);
	}
	const notAwarded = new Set([...negative].filter((r) => !awarded.has(r)));
	// Fold per-card records into per-round records: a round with multiple
	// awarded CARDS sums their budgets; one budget-less card nulls the round
	// (a partial sum lies).
	for (const c of cards) {
		if (!c.isAward || c.roundNum === null) continue;
		const prev = awardByRound.get(c.roundNum);
		if (!prev) {
			awardByRound.set(c.roundNum, {
				round: c.roundNum,
				budgetUSD: c.budgetUSD,
				awardType: c.awardType,
			});
		} else {
			awardByRound.set(c.roundNum, {
				round: c.roundNum,
				budgetUSD:
					prev.budgetUSD !== null && c.budgetUSD !== null
						? prev.budgetUSD + c.budgetUSD
						: null,
				awardType: prev.awardType ?? c.awardType,
			});
		}
	}
	// Reconciliation against the page's OWN rendered counter ("Awarded
	// Submissions: N"). If our deduped awarded-card count still disagrees, the
	// parse is unreliable for award DETAIL on this page — null every round's
	// budget/type rather than serve a summed guess (membership stays: the
	// verdict sets dedupe by round and fix-scf-rounds has its own guards).
	const counter = html.match(
		/Awarded Submissions<\/div><div[^>]*>(\d+)</,
	)?.[1];
	if (counter !== undefined && Number(counter) !== awardedAnyCount) {
		for (const rec of awardByRound.values()) {
			rec.budgetUSD = null;
			rec.awardType = null;
		}
	}
	const awards = [...awardByRound.values()].sort((a, b) => a.round - b.round);
	return { awarded, notAwarded, submissions, awardedAnyCount, awards };
}

export async function fetchDetailHtml(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": "stellarlight-scf-crosscheck" },
		});
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}
