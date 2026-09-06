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
/** RSC pages ship their payload as `self.__next_f.push([1,"…"])` string
 * chunks cut at arbitrary byte offsets — inside a card's id (the prism-dxb
 * double count below), inside a roundName ("SCF #" | "34 ": nebulavrf-uve
 * parsed as an award with no round, 2026-09-06), anywhere. Reading the raw
 * markup means a card that straddles a cut parses with a truncated field.
 * Join the chunks (each is one JSON string literal) and read the stream the
 * browser would; a page without chunks, or one whose chunk does not parse,
 * is read as it came. */
export function rebuildFlight(html: string): string {
	const chunks = [
		...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g),
	];
	if (chunks.length === 0) return html;
	let out = "";
	for (const m of chunks) {
		try {
			out += JSON.parse(m[1]) as string;
		} catch {
			return html;
		}
	}
	return out;
}

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
		/** null for an award SCF does not number — read awardName. */
		round: number | null;
		/** The award's own name, e.g. "Liquidity Award - '24 Q1". Present ONLY
		 *  on non-numbered awards, where it is the award's only identity — a
		 *  numbered award is identified by its round, so the key is absent
		 *  there rather than carrying a null nobody reads. The API layer
		 *  normalises both shapes to an explicit awardName. */
		awardName?: string;
		budgetUSD: number | null;
		awardType: string | null;
	}>;
} {
	const txt = rebuildFlight(html).replace(/\\"/g, '"');
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
		roundName: string | null;
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
	// Neutral/in-flight cards verdict nothing, but the page-counter
	// reconciliation below needs to SEE them (dedup by id, max budget across
	// the double embeds — same discipline as verdict cards).
	const neutralByKey = new Map<
		string,
		{
			id: string;
			roundNum: number | null;
			budgetUSD: number | null;
			awardType: string | null;
		}
	>();
	for (const m of txt.matchAll(re)) {
		const status = m[2];
		// SCF marks a partially-disbursed award "Awarded (50%)" / "Awarded (10%)"
		// — the percentage is how much of the budget has been PAID, not how much
		// was awarded. Exact-matching "Awarded" filed those cards as neutral, so
		// the award verdicted nothing and the row kept an uncited scf.awarded:
		// soropg (Public Goods Q2 '26, 50%), clob and qstn (SCF #20, 10%) all
		// read as "no award on the page". "Not Awarded" does not start with
		// "Awarded", so the negative verdicts are untouched.
		const isAward = /^Awarded\b/.test(status);
		if (!isAward && !isNegativeVerdict(status)) {
			const num = m[3].match(/SCF\s*#\s*(\d+)/i)?.[1];
			const nc = {
				id: m[1],
				roundNum: num ? Number(num) : null,
				budgetUSD: m[5] ? Number(m[5]) : null,
				awardType: m[4] || null,
			};
			const prev = neutralByKey.get(nc.id);
			if (!prev) neutralByKey.set(nc.id, nc);
			else {
				prev.budgetUSD =
					prev.budgetUSD !== null && nc.budgetUSD !== null
						? Math.max(prev.budgetUSD, nc.budgetUSD)
						: (prev.budgetUSD ?? nc.budgetUSD);
				prev.awardType = prev.awardType ?? nc.awardType;
			}
			continue; // neutral — verdicts nothing
		}
		const num = m[3].match(/SCF\s*#\s*(\d+)/i)?.[1];
		const card: Card = {
			id: m[1],
			isAward,
			roundNum: num ? Number(num) : null,
			roundName: m[3] || null,
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
	// capture, which only survives on the head side of the split).
	//
	// Audit hardening (2026-08-31): a bare fragment like "r" prefixes EVERY
	// Airtable rec-id, so with two same-round/type awarded cards the fragment
	// of the larger could merge into the SMALLER host and Math.max-inflate its
	// budget — reproduced: 15,000 + 124,600 + frag("r", 124,600) summed the
	// round to 249,200 while the count gate read 2 = 2 and passed. So a
	// fragment merges ONLY into a budget-AGREEING host (equal, or the budget
	// missing on one side); with no agreeing host it still proves round
	// MEMBERSHIP (its verdict is real) but contributes no count and no budget
	// — a fragment is never its own card.
	const isFragmentOf = (card: Card, other: Card) =>
		other !== card &&
		other.isAward === card.isAward &&
		other.id.length > card.id.length &&
		other.id.startsWith(card.id) &&
		other.roundNum === card.roundNum &&
		(other.awardType === card.awardType ||
			other.awardType === null ||
			card.awardType === null);
	const allCards = [...cardByKey.values()];
	const cards: Card[] = [];
	const membershipOnly: Card[] = [];
	for (const card of allCards) {
		const hosts = allCards.filter((o) => isFragmentOf(card, o));
		if (!hosts.length) {
			cards.push(card);
			continue;
		}
		// Host preference (cross-vendor audit round 2): the type check in
		// isFragmentOf tolerates null on either side, so a type-less fragment
		// could attach across award types. Budget agreement already prevents
		// inflation (the merge is a Math.max of equal budgets), but the type
		// attribution should still land on the right card: same-type +
		// budget-equal beats budget-equal beats budget-unknown.
		const agreeing =
			hosts.find(
				(h) =>
					h.awardType !== null &&
					h.awardType === card.awardType &&
					h.budgetUSD !== null &&
					h.budgetUSD === card.budgetUSD,
			) ??
			hosts.find(
				(h) => h.budgetUSD !== null && h.budgetUSD === card.budgetUSD,
			) ??
			hosts.find((h) => h.budgetUSD === null || card.budgetUSD === null);
		if (agreeing) mergeInto(agreeing, card);
		else membershipOnly.push(card);
	}
	const awarded = new Set<string>();
	const negative = new Set<string>();
	let submissions = 0;
	let awardedAnyCount = 0;
	for (const c of cards) {
		submissions++;
		if (c.isAward) awardedAnyCount++;
	}
	// Membership reads cards AND host-less fragments: a fragment's verdict is
	// real even when its budget can't be attributed, and dropping its round
	// would turn a dedup guard into a membership hole.
	for (const c of [...cards, ...membershipOnly]) {
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
	// Submissions: N") — polarity matters: only an OVER-count nulls. Parsing
	// MORE awarded cards than the page claims means duplication slipped the
	// dedup, so budgets/types are unreliable — null them, never guess
	// (membership stays: the verdict sets dedupe by round and fix-scf-rounds
	// has its own guards). Parsing FEWER is expected whenever the site's
	// counter includes cards we deliberately treat as neutral (Ready for
	// Payment / Information Collection) — never-accuse must not become
	// never-report. Whitespace-tolerant so minor markup drift doesn't silently
	// disarm the gate.
	const nullAwardDetail = () => {
		for (const rec of awardByRound.values()) {
			rec.budgetUSD = null;
			rec.awardType = null;
		}
	};
	const counter = html.match(
		/Awarded Submissions\s*<\/div>\s*<div[^>]*>\s*(\d+)\s*</,
	)?.[1];
	if (counter !== undefined && awardedAnyCount > Number(counter))
		nullAwardDetail();
	// Second, independent gate: the page's rendered "Total awarded" dollar
	// figure. Budgets summing ABOVE it (past display-rounding slack — $124.6K
	// rounds to the nearest 0.1K) means some budget was attributed twice or to
	// the wrong card, the class the count gate provably cannot see (a
	// wrong-host merge keeps the count intact). Under-total is normal: rounds
	// with unparseable budgets are nulled, and the page's total can exceed the
	// per-round records.
	const totalM = html.match(
		/Total awarded\s*<\/div>\s*<div[^>]*>\s*\$([\d.,]+)\s*([KM])?/i,
	);
	if (totalM) {
		const base = Number(totalM[1].replace(/,/g, ""));
		const mult =
			totalM[2]?.toUpperCase() === "M"
				? 1e6
				: totalM[2]?.toUpperCase() === "K"
					? 1e3
					: 1;
		const rendered = base * mult;
		const budgetSum = [...awardByRound.values()].reduce(
			(s, r) => s + (r.budgetUSD ?? 0),
			0,
		);
		const slack = mult / 2 + rendered * 0.01;
		if (rendered > 0 && budgetSum > rendered + slack) nullAwardDetail();
	}
	// Page-counter reconciliation (2026-09-01, the kutana/janus class): 21
	// awarded rows served roundAwards [] because their single awarded
	// submission sits in a NEUTRAL pipeline status ("Information Collection")
	// the verdict reader rightly refuses to call Awarded. When the page's OWN
	// summary fields pin the award to one submission EXACTLY — awarded:true, a
	// numeric lastAwardedRound holding exactly ONE neutral submission whose
	// budget equals totalAwarded to the dollar, and zero Awarded cards
	// anywhere — the award record is the page's own assertion, not an
	// inference. Any ambiguity (a second submission in the round, a split-id
	// fragment, a total that no single budget matches) skips: empty stays
	// honest. `submissions`/`awardedAnyCount` are deliberately untouched —
	// the reconcile adds award knowledge, never accusation evidence, so the
	// never-accuse and no-resurrect guards keep their meaning.
	if (awardedAnyCount === 0 && awardByRound.size === 0) {
		const pageAward = /"awarded":true,"lastAwardedRound":(\d+)/.exec(txt);
		const pageTotal = /"totalAwarded":(\d+)/.exec(txt);
		if (pageAward && pageTotal) {
			const r = Number(pageAward[1]);
			const total = Number(pageTotal[1]);
			const inRound = [...neutralByKey.values()].filter(
				(c) => c.roundNum === r,
			);
			if (total > 0 && inRound.length === 1 && inRound[0].budgetUSD === total) {
				awarded.add(String(r));
				notAwarded.delete(String(r));
				awardByRound.set(r, {
					round: r,
					budgetUSD: total,
					awardType: inRound[0].awardType,
				});
			}
		}
	}
	// Awards SCF does not number. "Liquidity Award - '24 Q1" carries no SCF #N,
	// so it maps onto no numeric round and was dropped entirely — Blend's
	// $50,000, status Awarded on SCF's own page, surfaced as money beside an
	// empty scfAwardedRounds with nothing to explain it. The round SETS stay
	// numeric-only on purpose (the never-accuse and no-resurrect guards read
	// them), so this adds award RECORDS and changes no verdict.
	const namedAwards = new Map<
		string,
		{
			round: null;
			awardName: string;
			budgetUSD: number | null;
			awardType: string | null;
		}
	>();
	for (const c of cards) {
		if (!c.isAward || c.roundNum !== null || !c.roundName) continue;
		const prev = namedAwards.get(c.roundName);
		if (!prev) {
			namedAwards.set(c.roundName, {
				round: null,
				awardName: c.roundName,
				budgetUSD: c.budgetUSD,
				awardType: c.awardType,
			});
		} else {
			// Same summing rule as the numeric fold: a budget-less card nulls
			// the award, because a partial sum lies.
			prev.budgetUSD =
				prev.budgetUSD !== null && c.budgetUSD !== null
					? prev.budgetUSD + c.budgetUSD
					: null;
			prev.awardType = prev.awardType ?? c.awardType;
		}
	}
	const awards = [
		...[...awardByRound.values()].sort((a, b) => a.round - b.round),
		...[...namedAwards.values()].sort((a, b) =>
			a.awardName.localeCompare(b.awardName),
		),
	];
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
