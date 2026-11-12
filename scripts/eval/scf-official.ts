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

import { findTitlePrefixMatch, normSpaceless } from "../../src/lib/identity";

export const SCF = "https://communityfund.stellar.org";

/** Spaceless lowercase with accents folded: the matcher's own normSpaceless,
 * so the crosscheck and the enrich read "Cryptoconexión" alike (sls-111). */
export const canon = (s: string) => normSpaceless(s || "");

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
/**
 * Hosts a submission merely LINKS, which are never its identity.
 *
 * The SCF absence diff collects every external link on a detail page as a
 * website candidate, so one stray link can decide who a project is. That is
 * fine for socials and CDNs — until a third-party DASHBOARD or link-in-bio
 * page slips through: minisend-7tt links a Dune dashboard and matched our
 * unrelated `dune` row, the BWB submission links a beacons.ai bio and matched
 * `noticias-trading`. Both projects are genuinely absent from the directory,
 * and a false identity match does not merely mislabel a row — it deletes a
 * real gap from the absence list. Add a host here when it turns up as a
 * shared destination rather than a product site.
 */
export const THIRD_PARTY_LINK =
	/stellar\.org|stellar\.expert|twitter\.com|\/\/x\.com|\/\/www\.x\.com|linkedin\.com|discord|t\.me|medium\.com|docs\.google|airtable|notion\.so|vercel\.app\/api|fonts\.|cdn\.|googleapis|gstatic|cloudfront|w3\.org|sanity\.io|googletagmanager|visualwebsiteoptimizer|gitbook\.io|schema\.org|sentry|segment\.|hotjar|plausible|posthog|apple\.com|play\.google|google\.com|dappradar|defillama|coinmarketcap|coingecko|crunchbase|producthunt|typeform|calendly|mailchimp|substack|dune\.com|beacons\.ai|linktr\.ee|bio\.link|bento\.me|carrd\.co|about\.me|lu\.ma|eventbrite/i;

export function isThirdPartyLink(url: string): boolean {
	return THIRD_PARTY_LINK.test(url);
}

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
	// One submission object: id … status … roundName, then the rest of the
	// object up to the next brace. awardType and budget are read out of that
	// rest independently, because SCF reorders them: awardType … budget on
	// 2026-08-03 (fluxity-mez), budget … awardType by 2026-10-02. The ordered
	// regex this replaces read the new order as "no budget" on every card, and
	// a dry run planned to write null amounts over ~550 stored round awards.
	// The [^{}] guard keeps every read inside one object, so a missing field
	// fails to null and never bleeds into the next card.
	const re =
		/"id":"([^"]+)"[^{}]*?"status":"([^"]+)"[^{}]*?"roundName":"([^"]+)"([^{}]*)/g;
	const fieldsOf = (rest: string) => ({
		awardType: /"awardType":"([^"]*)"/.exec(rest)?.[1] || null,
		budget: /"budget":(\d+(?:\.\d+)?)/.exec(rest)?.[1] ?? null,
	});
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
		const f = fieldsOf(m[4]);
		if (!isAward && !isNegativeVerdict(status)) {
			const num = m[3].match(/SCF\s*#\s*(\d+)/i)?.[1];
			const nc = {
				id: m[1],
				roundNum: num ? Number(num) : null,
				budgetUSD: f.budget ? Number(f.budget) : null,
				awardType: f.awardType,
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
			budgetUSD: isAward && f.budget ? Number(f.budget) : null,
			awardType: isAward ? f.awardType : null,
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
	// The same pin holds beside earlier Awarded cards (sls-111: liqvid-hrr on
	// 2026-10-03, #37 Awarded, #45 still in Information Collection, total =
	// #37 + #45 to the dollar, and the lane stored rounds [37]). The neutral
	// budget must then equal the total less every award the page itemizes,
	// and each of those needs a known budget: a partial sum never passes.
	const pageAward = /"awarded":true,"lastAwardedRound":(\d+)/.exec(txt);
	const pageTotal = /"totalAwarded":(\d+)/.exec(txt);
	const itemized = [
		...[...awardByRound.values()].map((a) => a.budgetUSD),
		...cards
			.filter((c) => c.isAward && c.roundNum === null)
			.map((c) => c.budgetUSD),
	];
	if (
		pageAward &&
		pageTotal &&
		!awarded.has(pageAward[1]) &&
		itemized.every((b) => b !== null)
	) {
		const r = Number(pageAward[1]);
		const rest =
			Number(pageTotal[1]) - itemized.reduce<number>((s, b) => s + (b ?? 0), 0);
		const inRound = [...neutralByKey.values()].filter((c) => c.roundNum === r);
		if (rest > 0 && inRound.length === 1 && inRound[0].budgetUSD === rest) {
			awarded.add(String(r));
			notAwarded.delete(String(r));
			awardByRound.set(r, {
				round: r,
				budgetUSD: rest,
				awardType: inRound[0].awardType,
			});
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

/**
 * Whether a parsed page (enrich-from-scf's per-page detail) shows an award in
 * any form: an Awarded card, a round the page's own summary pins (the
 * reconciliation in parseRoundVerdicts), or an award record. The
 * Awarded-card count alone stays 0 by design for a pinned award whose card
 * still sits in a pipeline status, so a guard reading only the count held
 * Enable at awarded=false over its SCF #45 award (sls-111, 2026-10-03).
 */
export function showsAward(
	page:
		| {
				awardedRounds?: readonly unknown[];
				roundAwards?: readonly unknown[];
				verdictAwardedAny?: number;
		  }
		| null
		| undefined,
): boolean {
	return (
		(page?.awardedRounds?.length ?? 0) > 0 ||
		(page?.roundAwards?.length ?? 0) > 0 ||
		(page?.verdictAwardedAny ?? 0) > 0
	);
}

/**
 * The directory row an SCF slug base names, for the absence diff, or
 * undefined: an exact slug, name or alias, else the single best title prefix
 * over names (findTitlePrefixMatch). In an absence report a false hit is not
 * a mislabel, it deletes a real gap: the old first-hit rules (a shared
 * prefix, a 5-letter substring, any shared word) filed Onboard under our
 * Onboarding Club row and AgentSmith x402 under our x402 row (sls-111).
 */
export function servedBy<
	R extends { slug: string; name: string; aliases?: string[] },
>(base: string, rows: R[]): R | undefined {
	const key = normSpaceless(base);
	const exact = rows.find(
		(r) =>
			r.slug === base ||
			normSpaceless(r.name) === key ||
			(r.aliases ?? []).some((a) => normSpaceless(a) === key),
	);
	return exact ?? findTitlePrefixMatch(base.replace(/-/g, " "), rows);
}

/** Rows by canon name, for names exactly one project carries: a name two
 * projects share identifies neither (scf-crosscheck took the first row,
 * enrich-from-scf the last, sls-111). `identityOf` says which rows are one
 * project (a lineage shadow and its canonical row); `onShared` hears every
 * name it drops, for a person to decide. */
export function uniqueNames<R extends { name: string }>(
	rows: R[],
	identityOf: (row: R) => unknown = (row) => row,
	onShared?: (name: string, rows: R[]) => void,
): Map<string, R> {
	const byName = new Map<string, R[]>();
	for (const r of rows) {
		const key = canon(r.name);
		if (key) byName.set(key, [...(byName.get(key) ?? []), r]);
	}
	const out = new Map<string, R>();
	for (const [key, named] of byName) {
		if (new Set(named.map(identityOf)).size === 1) out.set(key, named[0]);
		else onShared?.(key, named);
	}
	return out;
}

/**
 * What one matched pair (an SCF page, our row) says, for scf-crosscheck:
 * understated when our row serves scfAwarded false and the page shows an
 * award (its awarded rounds, maybe none when the award has no number);
 * backfill when our row is awarded with no rounds and the page awards
 * numbered rounds. Only the page's verdicts decide: a listing badge is a
 * round ENTERED, never an award (and the listing carried none on
 * 2026-11-04, so a badge-driven check never fired). A page that could not
 * be read (v null) says nothing, and neither does a human-verified row:
 * curate's SCF_FIX owns it, and an unlinked one (pen, hermes) is false on
 * purpose beside another project's page (sls-111).
 */
export function classifyScfMatch(m: {
	ourAwarded: boolean;
	ourRounds: string[];
	ourBasis?: string | null;
	v: ReturnType<typeof parseRoundVerdicts> | null;
}): { understated?: string[]; backfill?: string[] } {
	if (!m.v || m.ourBasis === "human-verified") return {};
	const rounds = [...m.v.awarded].sort((a, b) => Number(a) - Number(b));
	if (!m.ourAwarded)
		return rounds.length > 0 || m.v.awardedAnyCount > 0
			? { understated: rounds }
			: {};
	return m.ourRounds.length === 0 && rounds.length > 0
		? { backfill: rounds }
		: {};
}

/** The stored projects.scf fields scfHold reads. */
export interface StoredScf {
	awarded?: boolean | null;
	basis?: string | null;
	asOf?: string | null;
	sourceUrl?: string | null;
	slug?: string | null;
}

/**
 * Why enrich-from-scf must leave a row's SCF record as it is, or null when
 * the page decides it. One field, one writer (sls-111):
 * - a human-verified record is curate's (SCF_FIX). The reader adds nothing:
 *   curate syncs its rounds exactly, so a page round the reader added would
 *   be removed on curate's next run and added back on the enrich's, and on
 *   an unlinked row (pen, hermes) it would serve awarded false beside it;
 * - an awarded=false from an official read (basis official-record, such as
 *   fix-scf-rounds' boolean fix, set when every decided card lost) yields
 *   only to a page that awards a numbered round after every round the page
 *   marks lost: a later round's award. The page carries no dates, so round
 *   order stands in for "after its asOf";
 * - any other awarded=false an SCF writer stamped (a date, source or page
 *   slug without that basis: a poison clear, an unlink) is a removal, and
 *   the reader never undoes it;
 * - an unstamped false (the default of a row nobody has read) yields to a
 *   page that shows an award in any form (showsAward), and holds when the
 *   page decides its cards and awards nothing (the coopstable class).
 */
export function scfHold(
	current: StoredScf | null | undefined,
	page:
		| (Parameters<typeof showsAward>[0] & {
				verdictSubmissions?: number;
				notAwardedRounds?: readonly number[];
		  })
		| null
		| undefined,
	pageSaysAwarded: boolean,
): string | null {
	if (current?.basis === "human-verified")
		return "human-verified record: curate SCF_FIX owns it";
	if (current?.awarded !== false || !pageSaysAwarded) return null;
	if (current.basis === "official-record") {
		const won = Math.max(0, ...(page?.awardedRounds ?? []).map(Number));
		const lost = Math.max(0, ...(page?.notAwardedRounds ?? []));
		return won > lost
			? null
			: "awarded=false from an official read, and no award after its losses";
	}
	if (current.basis || current.asOf || current.sourceUrl || current.slug)
		return "awarded=false was set by an SCF correction: a removal";
	if ((page?.verdictSubmissions ?? 0) > 0 && !showsAward(page))
		return "the page decides its cards and shows no award";
	return null;
}

/** The page's own `"siteUrls":{...}` object, brace-matched off the rebuilt
 * flight stream. One per page (checked on 531 pages, 2026-10-03). */
export function siteUrlsOf(txt: string): Record<string, unknown> | null {
	const at = txt.indexOf('"siteUrls":{');
	if (at < 0) return null;
	const start = txt.indexOf("{", at);
	let depth = 0;
	for (let i = start; i < txt.length; i++) {
		if (txt[i] === "{") depth++;
		else if (txt[i] === "}" && --depth === 0) {
			try {
				return JSON.parse(txt.slice(start, i + 1));
			} catch {
				return null;
			}
		}
	}
	return null;
}

/** An owner or owner/repo GitHub URL, nothing else: the field also carries
 * GitLab links, Google Docs and comma-joined pairs on real pages. */
const GITHUB_URL =
	/^https?:\/\/(?:www\.)?github\.com\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?\/?$/;
const githubUrl = (v: unknown): string | undefined =>
	typeof v === "string" && GITHUB_URL.test(v.trim()) ? v.trim() : undefined;
/** A single absolute http(s) URL. Bare handles ("@telluscoop") and
 * scheme-less hosts are dropped rather than guessed at. */
const httpUrl = (v: unknown): string | undefined =>
	typeof v === "string" && /^https?:\/\/[^\s,]+$/.test(v.trim())
		? v.trim()
		: undefined;

/** What enrich-from-scf reads off one SCF project page. */
export type ScfPage = {
	description?: string;
	website?: string;
	twitter?: string;
	github?: string;
	totalAwarded?: number;
	awardedRounds?: number[];
	roundAwards?: Array<{
		awardName?: string | null;
		round: number | null;
		amountUSD: number | null;
		awardType: string | null;
	}>;
	verdictSubmissions?: number;
	verdictAwardedAny?: number;
	/** Numbered rounds the page marks lost (every decided card negative). */
	notAwardedRounds?: number[];
	/** Page-level project record (title / slug / lastAwardedRound), read for
	 * pages the listing never served — see SCF_PAGES_BEYOND_CAP. */
	pageSlug?: string;
	title?: string;
	lastAwardedRound?: number;
};

/** Read one SCF project page's HTML (enrich-from-scf's per-page detail), or
 * null when the page carries no project record for `slug`. A renamed record's
 * old slug answers HTTP 200 with Next's not-found payload (Vaquita's old
 * page, 2026-11-07), and that must read as could-not-read, never as a page
 * that awards nothing. All 531 listed pages carried their own record on
 * 2026-11-05. */
export function readScfPage(html: string, slug: string): ScfPage | null {
	const result: ScfPage = {};

	// Try __NEXT_DATA__ (Pages Router) first
	const nextDataMatch = html.match(
		/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
	);
	if (nextDataMatch) {
		try {
			const nextData = JSON.parse(nextDataMatch[1]);
			const pageProps = nextData?.props?.pageProps;
			const project = pageProps?.project || pageProps?.data || pageProps;
			if (project) {
				const desc =
					project.description ||
					project.projectDescription ||
					project.shortDescription;
				if (desc && typeof desc === "string" && desc.length > 20) {
					result.description = desc.slice(0, 500);
				}
				const urls = project.siteUrls || project.urls || project.links || {};
				if (urls.website) result.website = urls.website;
				if (urls.x || urls.twitter) result.twitter = urls.x || urls.twitter;
				if (urls.github) result.github = urls.github;
				if (project.totalAwarded && typeof project.totalAwarded === "number") {
					result.totalAwarded = project.totalAwarded;
				}
			}
		} catch {
			/* ignore parse errors */
		}
	}

	// Try __next_f streaming data (App Router) — extract totalAwarded
	// Data is in escaped JSON like: totalAwarded\":115000
	if (!result.totalAwarded) {
		const awardedMatch = html.match(/totalAwarded\\?"?\s*:\s*(\d+(?:\.\d+)?)/);
		if (awardedMatch) {
			result.totalAwarded = parseFloat(awardedMatch[1]);
		}
	}

	// Page-level project record — the same fields a listing row carries —
	// for pages the listing never serves (SCF_PAGES_BEYOND_CAP). pageSlug
	// doubles as the identity check: an unknown slug renders 200 with no
	// project payload (soft-404), which must read as could-not-parse.
	// Read off the REBUILT flight stream, not the raw HTML: the stream is
	// cut into <script> chunks at arbitrary points, and a cut inside this
	// field sequence blanked the identity check on 3 of 113 pages in the
	// first dry run (mojoflower-mq4, sorostarter-9b2, opengrants-fdb).
	const flight = [
		...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g),
	]
		.map((m) => {
			try {
				return JSON.parse(m[1]) as string;
			} catch {
				return "";
			}
		})
		.join("");
	const txt = flight || html.replace(/\\"/g, '"');
	const pageRec = txt.match(
		/"title":"([^"]*)","slug":"([a-z0-9-]+)","totalAwarded"/,
	);
	if (pageRec?.[2] !== slug) return null;
	result.title = pageRec[1];
	result.pageSlug = pageRec[2];
	const pageRound = txt.match(/"lastAwardedRound":(-?\d+)/);
	if (pageRound) result.lastAwardedRound = Number(pageRound[1]);

	// Links (2026-10-03). The page is App Router, so the __NEXT_DATA__ read
	// above never matches and no link had been read since the site moved:
	// the last run added 0 links across 472 matched projects. The project's
	// own submission carries them as siteUrls on the flight stream.
	const urls = siteUrlsOf(txt);
	if (urls) {
		result.website ??= httpUrl(urls.website);
		result.twitter ??= httpUrl(urls.x ?? urls.twitter);
		result.github ??= githubUrl(urls.github);
	}

	// Awarded rounds from per-submission VERDICTS ONLY (2026-07-11 fix).
	// The old "grab every SCF #N on the page" scrape read the badge/
	// submission arrays, which include NOT-awarded submission rounds —
	// that corrupted round membership on 74 records (fixed by
	// scripts/data/fix-scf-rounds.ts; verdict parser shared via
	// scripts/eval/scf-official.ts). No parseable verdicts → leave
	// awardedRounds unset rather than guess.
	const verdicts = parseRoundVerdicts(html);
	if (verdicts.awarded.size > 0) {
		result.awardedRounds = [...verdicts.awarded]
			.map(Number)
			.sort((a, b) => a - b);
	}
	// sls-058 defect 2: per-awarded-round official record (published budget
	// + award type) from the same submission cards — the reconciling basis
	// for the page's own totalAwarded.
	if (verdicts.awards.length > 0) {
		result.roundAwards = verdicts.awards.map((a) => ({
			round: a.round,
			awardName: a.awardName,
			amountUSD: a.budgetUSD,
			awardType: a.awardType,
		}));
	}
	// Surfaced for the no-resurrect guard below (main loop): a page that
	// parses ≥1 submission with ZERO awarded is affirmative evidence of
	// non-award.
	result.verdictSubmissions = verdicts.submissions;
	result.verdictAwardedAny = verdicts.awardedAnyCount;
	result.notAwardedRounds = [...verdicts.notAwarded]
		.map(Number)
		.sort((a, b) => a - b);

	return Object.keys(result).length > 0 ? result : null;
}

/** Every object in the flight text that opens `{"id":"rec…` (how SCF writes
 * every record, on all 46 round pages read 2026-11-11), parsed whole with
 * string-aware brace matching, so each later field is read by name wherever
 * SCF puts it: SCF has reordered fields inside these objects before. Null
 * when any record does not close or parse: a cut page is a partial read,
 * never a page with fewer records (every opener on all 47 pages read
 * 2026-11-11 parsed). A page whose records stop opening with their id reads
 * as empty, which the round-count check also reports as could-not-check. */
function recordObjects(txt: string): Array<Record<string, unknown>> | null {
	const out: Array<Record<string, unknown>> = [];
	for (const m of txt.matchAll(/\{"id":"rec[A-Za-z0-9]+"/g)) {
		const start = m.index ?? 0;
		let depth = 0;
		let inString = false;
		let parsed = false;
		for (let i = start; i < txt.length; i++) {
			const c = txt[i];
			if (inString) {
				if (c === "\\") i++;
				else if (c === '"') inString = false;
			} else if (c === '"') inString = true;
			else if (c === "{") depth++;
			else if (c === "}" && --depth === 0) {
				try {
					out.push(JSON.parse(txt.slice(start, i + 1)));
					parsed = true;
				} catch {
					/* not one object: the page is not read whole */
				}
				break;
			}
		}
		if (!parsed) return null;
	}
	return out;
}

/** The numbered build award rounds SCF's /awards page lists: the record id
 * that addresses each round's own page (/awards/<id>), its number and its
 * phase ("Ended", "Initial Review"). Null when the page was not read whole. */
export function readAwardRounds(
	html: string,
): Array<{ id: string; round: number; phase: string }> | null {
	const records = recordObjects(rebuildFlight(html));
	if (!records) return null;
	const rounds = new Map<
		string,
		{ id: string; round: number; phase: string }
	>();
	for (const o of records) {
		const round = o.roundNumber;
		if (
			o.type === "Build Award Round" &&
			typeof round === "number" &&
			Number.isInteger(round) &&
			round > 0 &&
			typeof o.phase === "string"
		)
			rounds.set(String(o.id), { id: String(o.id), round, phase: o.phase });
	}
	return [...rounds.values()];
}

/** What a submission's status says about an award: "awarded" (Awarded, or a
 * partly paid "Awarded (50%)"), "declined" (a decision against it: the
 * negative verdicts above, or "Not Approved", which a round page gives the
 * submissions turned down at its first review), or "pending" for every other
 * status, a pipeline step a funded submission can sit in long after its award
 * ("Information Collection") as well as one nobody decided. */
export function submissionVerdict(
	status: string,
): "awarded" | "declined" | "pending" {
	const s = status.trim();
	if (/^Awarded\b/.test(s)) return "awarded";
	if (isNegativeVerdict(s) || s === "Not Approved") return "declined";
	return "pending";
}

/** Every submission one round's page (/awards/<id>) lists for that round, with
 * the project record it belongs to (null for a submission SCF never linked to
 * a project page: early rounds have some, a few of them awarded). Null when
 * the page was not read whole. */
export function readRoundSubmissions(
	html: string,
	round: number,
): Array<{
	id: string;
	project: string | null;
	verdict: ReturnType<typeof submissionVerdict>;
}> | null {
	const records = recordObjects(rebuildFlight(html));
	if (!records) return null;
	const subs = new Map<
		string,
		{
			id: string;
			project: string | null;
			verdict: ReturnType<typeof submissionVerdict>;
		}
	>();
	for (const o of records) {
		if (typeof o.status !== "string" || typeof o.roundName !== "string")
			continue;
		if (Number(/SCF\s*#\s*(\d+)/i.exec(o.roundName)?.[1]) !== round) continue;
		subs.set(String(o.id), {
			id: String(o.id),
			project: typeof o.project === "string" ? o.project : null,
			verdict: submissionVerdict(o.status),
		});
	}
	return [...subs.values()];
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
