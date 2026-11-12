/**
 * SCF round-level count check (sls-111): awards per round in our directory
 * versus SCF's own round pages. Pure logic, no I/O; the CLI that reads both
 * sides is scripts/eval/scf-round-counts.ts.
 *
 * SCF side, per numbered round, exact: the round's own page
 * (communityfund.stellar.org/awards/<id>) lists every submission the round
 * received, with its status and its project. The round's awards are the
 * projects with an awarded submission there, and the projects whose own page
 * summary names the round as their last award (the listing's
 * lastAwardedRound): SCF leaves a funded submission in a pipeline status such
 * as "Information Collection" long after the award, and one page (stride-4uu,
 * #33) carries an award summary with no submission in the round. A project
 * whose submissions in the round are all pending, and that no summary pins,
 * is undecided: neither an award nor a refusal. The listing alone gave only
 * the latest round exactly (every earlier round was a floor), and it is the
 * list SCF served capped at 500, so it is never the completeness source here.
 *
 * Our side: awarded rows whose scfAwardedRounds hold the round.
 *
 * Per round: agrees, short (ours below SCF), over or unconfirmed. Only the
 * latest ended round (and any later one) allows for its undecided projects:
 * ours above SCF by no more than them is unconfirmed there, since SCF may
 * still decide them. In an earlier, closed round a pending submission is not
 * a reason to accept a claim, so any count above SCF's is over. Status:
 * mismatch when any round is short or over, else match.
 *
 * could-not-check, never a count, when a side was not read in full: the round
 * index or any round page unread, an ended round whose page lists no
 * submission (a page that changed shape), an index that skips a round below
 * its highest (SCF numbers rounds from 1 without gaps) or lacks a round the
 * baseline lists, the listing unread, a row of it unreadable, or lacking a
 * page our rows cite for the latest ended round (a cut listing), or our rows
 * not read in full.
 */

export interface ScfListingRow {
	id?: unknown;
	slug?: unknown;
	title?: unknown;
	lastAwardedRound?: unknown;
}

export interface OurAwardedRow {
	slug?: unknown;
	scfAwardedRounds?: unknown;
	scfSourceUrl?: unknown;
}

/** One round as its page lists it; submissions null = the page was not read. */
export interface ScfRound {
	round: number;
	phase: string;
	submissions: Array<{
		id: string;
		project: string | null;
		verdict: "awarded" | "declined" | "pending";
	}> | null;
}

export interface RoundCount {
	round: number;
	scf: number;
	/** projects whose submissions in the round are all pending and that no
	 *  page summary pins: SCF has not said whether they were awarded */
	undecided: number;
	ours: number;
	verdict: "agrees" | "short" | "over" | "unconfirmed";
	/** A round before the latest ended round: its undecided projects allow
	 *  nothing, so a count above SCF's is over. */
	closed: boolean;
	/** SCF's awards in the round that no row claiming it carries: no such row
	 *  cites the page, and the enrich's join (joinedRow) puts the page on none
	 *  of them. An award outside the listing is named by record id, and one
	 *  with no project page by its submission. */
	uncited: string[];
	/** The listed pages among them, as slugs: what the ratchet compares. */
	uncitedPages: string[];
	/** Every listed page SCF awards in the round, carried or not, as slugs:
	 *  the pages a baseline entry's missing list can be judged against. */
	awardPages: string[];
}

export type RoundCountReport =
	| { status: "could-not-check"; reason: string }
	| {
			status: "match" | "mismatch";
			rounds: RoundCount[];
			/** Awarded rows with no rounds and no SCF page cited: nobody read
			 *  their rounds, so they count in no round. A row with no rounds
			 *  that cites a page read it (an award SCF does not number). */
			roundsUnread: number;
	  };

const PAGE = "https://communityfund.stellar.org/project/";

export function compareRoundCounts(input: {
	rounds: ScfRound[] | null;
	listing: ScfListingRow[] | null;
	ours: OurAwardedRow[] | null;
	/** The slug of the row the enrich joins a listed page to (an
	 *  SCF_SLUG_OVERRIDES entry, an exact name, the title prefix), so a page a
	 *  row folds without citing it still reads as carried. */
	joinedRow?: (page: { slug: string; title: string }) => string | undefined;
	/** The rounds the baseline lists: an index without one is a partial read. */
	expectRounds?: number[];
}): RoundCountReport {
	const cannot = (reason: string): RoundCountReport => ({
		status: "could-not-check",
		reason,
	});
	const { rounds, listing, ours } = input;
	if (!rounds?.length) return cannot("SCF round index unread or empty");
	for (const r of rounds) {
		if (!r.submissions) return cannot(`SCF #${r.round} page unread`);
		if (r.phase === "Ended" && r.submissions.length === 0)
			return cannot(
				`SCF #${r.round} has ended but its page lists no submission, so the page changed shape`,
			);
	}
	// SCF numbers its rounds from 1 without a gap, so an index that skips one
	// below its highest was not read whole: the skipped round would otherwise
	// read as a round only we claim, ours over SCF's 0.
	const indexed = new Set(rounds.map((r) => r.round));
	const top = Math.max(...indexed);
	const skipped: number[] = [];
	for (let n = 1; n <= top; n++) if (!indexed.has(n)) skipped.push(n);
	if (skipped.length)
		return cannot(
			`SCF round index skips ${skipped.map((n) => `#${n}`).join(", ")} below #${top}, so it was not read whole`,
		);
	const absent = (input.expectRounds ?? []).filter((n) => !indexed.has(n));
	if (absent.length)
		return cannot(
			`SCF round index lacks ${absent.map((n) => `#${n}`).join(", ")}, which the baseline lists`,
		);
	if (!listing?.length) return cannot("SCF listing unread or empty");
	// The listing only pins awards here, but a cut one drops a pin, and an
	// award with no submission in its round (stride-4uu) would then read as
	// ours over SCF's: exactly 500 rows is the cap SCF served until 2026-10.
	if (listing.length === 500)
		return cannot("SCF listing returned exactly 500 rows, its old page cap");
	if (!ours?.length) return cannot("our awarded rows were not read in full");
	// A page's summary pins its last award (lastAwardedRound). A negative code
	// is an award SCF does not number and 0 names none: neither pins a round.
	const pins = new Map<number, Set<string>>();
	const listed = new Map<
		string,
		{ slug: string; title: string; round: number }
	>();
	for (const p of listing) {
		const { id, slug, title, lastAwardedRound: round } = p;
		if (
			typeof id !== "string" ||
			!id ||
			typeof slug !== "string" ||
			!slug ||
			typeof round !== "number" ||
			!Number.isInteger(round)
		)
			return cannot(
				`SCF listing row unreadable: id ${JSON.stringify(id)}, slug ${JSON.stringify(slug)}, lastAwardedRound ${JSON.stringify(round)}`,
			);
		const seen = listed.get(id);
		if (seen && (seen.slug !== slug || seen.round !== round))
			return cannot(
				`SCF listing gives ${id} twice: ${seen.slug} #${seen.round} and ${slug} #${round}`,
			);
		listed.set(id, {
			slug,
			title: typeof title === "string" ? title : "",
			round,
		});
		if (round > 0) pins.set(round, new Set([...(pins.get(round) ?? []), id]));
	}
	const roundsOf = (r: OurAwardedRow) =>
		Array.isArray(r.scfAwardedRounds) ? r.scfAwardedRounds.map(Number) : null;
	const pageOf = (r: OurAwardedRow) =>
		typeof r.scfSourceUrl === "string" && r.scfSourceUrl.startsWith(PAGE)
			? r.scfSourceUrl.slice(PAGE.length)
			: null;
	// Undecided projects allow for a count above SCF's only in the latest
	// ended round and after it; every earlier round is closed.
	const latestEnded = Math.max(
		-1,
		...rounds.filter((r) => r.phase === "Ended").map((r) => r.round),
	);
	// The witness that the listing is whole where it matters most: every page
	// our rows cite for the latest ended round is in it, or its pins (and so
	// that round's count) could be cut.
	const listedSlugs = new Set([...listed.values()].map((l) => l.slug));
	const unlisted = ours
		.filter((r) => roundsOf(r)?.includes(latestEnded))
		.map(pageOf)
		.filter((s): s is string => s !== null && !listedSlugs.has(s));
	if (unlisted.length)
		return cannot(
			`SCF listing lacks ${unlisted.length} page(s) our rows cite for #${latestEnded}: ${unlisted.join(", ")}`,
		);
	const scfByRound = new Map<
		number,
		{ awarded: Set<string>; undecided: number }
	>();
	for (const r of rounds) {
		// A submission with no project page is its own award: SCF counts it.
		const keyOf = (s: { id: string; project: string | null }) =>
			s.project ?? `submission ${s.id}`;
		const subs = r.submissions ?? [];
		const awarded = new Set([
			...subs.filter((s) => s.verdict === "awarded").map(keyOf),
			...(pins.get(r.round) ?? []),
		]);
		const pending = new Set(
			subs
				.filter((s) => s.verdict === "pending")
				.map(keyOf)
				.filter((k) => !awarded.has(k)),
		);
		scfByRound.set(r.round, { awarded, undecided: pending.size });
	}
	// Rounds only we claim count too: SCF's index lists no such round, or its
	// page lists no award in it.
	for (const r of ours)
		for (const round of roundsOf(r) ?? [])
			if (Number.isInteger(round) && round > 0 && !scfByRound.has(round))
				scfByRound.set(round, { awarded: new Set(), undecided: 0 });
	const counts = [...scfByRound.entries()]
		.sort(([a], [b]) => b - a)
		.map(([round, { awarded, undecided }]): RoundCount => {
			const claiming = ours.filter((r) => roundsOf(r)?.includes(round));
			const n = claiming.length;
			const scf = awarded.size;
			const closed = round < latestEnded;
			const allowance = closed ? 0 : undecided;
			const verdict =
				n === scf
					? "agrees"
					: n < scf
						? "short"
						: n > scf + allowance
							? "over"
							: "unconfirmed";
			const cited = new Set(claiming.map(pageOf));
			const claimingSlugs = new Set(claiming.map((r) => r.slug));
			const carried = (page: { slug: string; title: string }) => {
				if (cited.has(page.slug)) return true;
				const row = input.joinedRow?.(page);
				return row !== undefined && claimingSlugs.has(row);
			};
			// An award outside the listing has no known slug here, so it is
			// named by its record id (SCF serves the page at that URL too) and
			// a row may cite it under its slug.
			const uncited: string[] = [];
			const uncitedPages: string[] = [];
			const awardPages: string[] = [];
			for (const key of awarded) {
				if (key.startsWith("submission ")) {
					uncited.push(`${key} (no project page)`);
					continue;
				}
				const page = listed.get(key);
				if (page) awardPages.push(page.slug);
				if (!page) uncited.push(`${PAGE}${key} (outside the SCF listing)`);
				else if (!carried(page)) {
					uncited.push(PAGE + page.slug);
					uncitedPages.push(page.slug);
				}
			}
			return {
				round,
				scf,
				undecided,
				ours: n,
				verdict,
				closed,
				uncited: uncited.sort(),
				uncitedPages: uncitedPages.sort(),
				awardPages: awardPages.sort(),
			};
		});
	return {
		status: counts.some((r) => r.verdict === "short" || r.verdict === "over")
			? "mismatch"
			: "match",
		rounds: counts,
		roundsUnread: ours.filter((r) => !roundsOf(r)?.length && pageOf(r) === null)
			.length,
	};
}

/**
 * The ratchet (scripts/eval/scf-round-shortfalls.json): a dated, reviewed
 * list of the rounds known to be short, so the check reds on what changed and
 * not on every run. Without it the check was red on every execute: 34 rounds
 * before #45 were short on 2026-11-11, and workflow-health reads three reds in
 * a row at a signal step as a standing signal that hides the next one.
 * `missing` names the SCF award pages no row carries in that round (the
 * intake list), and a listed page uncited in a round must be on it: a page
 * that newly goes uncited inside an unchanged total is a swap. A listed page
 * on it that is carried now is stale, page by page, so the list is never a
 * standing allowance (a page carried and then lost again would pass). Pages
 * outside the listing are named here by slug but at run time only by record
 * id, so they are neither checked nor judged stale. An entry whose
 * counts agree (scf equal to ours) records a known swap and must name its
 * pages.
 */
export interface ShortfallBaseline {
	asOf: string;
	rounds: Array<{
		round: number;
		scf: number;
		ours: number;
		missing: string[];
	}>;
}

export interface RatchetFinding {
	round: number;
	/** new: a short round the baseline does not list. grew: a listed round
	 *  whose shortfall is larger. over: ours above what SCF allows, never
	 *  baselinable. uncited: a listed SCF page no row carries, in a round the
	 *  baseline does not list or missing from its entry (a swap inside an
	 *  unchanged total, or a lost join). stale: a listed round whose shortfall
	 *  shrank or closed, so the entry must be lowered or removed. */
	kind: "new" | "grew" | "over" | "uncited" | "stale";
	detail: string;
}

/** The baseline file as written, checked field by field; a reason when it
 * cannot be used. A missing or broken baseline is not an empty one: read as
 * empty, every known shortfall would read as new. */
export function parseShortfallBaseline(
	raw: unknown,
): ShortfallBaseline | { error: string } {
	const b = raw as { asOf?: unknown; rounds?: unknown } | null;
	if (!b || typeof b.asOf !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.asOf))
		return { error: "baseline has no asOf date (YYYY-MM-DD)" };
	if (!Array.isArray(b.rounds)) return { error: "baseline has no rounds list" };
	const seen = new Set<number>();
	const rounds: ShortfallBaseline["rounds"] = [];
	for (const e of b.rounds as Array<Record<string, unknown>>) {
		const { round, scf, ours, missing } = e ?? {};
		if (
			!Number.isInteger(round) ||
			(round as number) <= 0 ||
			!Number.isInteger(scf) ||
			!Number.isInteger(ours) ||
			(ours as number) < 0 ||
			(scf as number) < (ours as number) ||
			!Array.isArray(missing) ||
			!missing.every((m) => typeof m === "string") ||
			(scf === ours && missing.length === 0)
		)
			return {
				error: `baseline entry unreadable, over, or neither a shortfall nor a named swap: ${JSON.stringify(e)}`,
			};
		if (seen.has(round as number))
			return { error: `baseline lists SCF #${round} twice` };
		seen.add(round as number);
		rounds.push({
			round: round as number,
			scf: scf as number,
			ours: ours as number,
			missing: missing as string[],
		});
	}
	return { asOf: b.asOf, rounds };
}

/** A baseline `missing` entry or an uncited name as a page slug: the page URL
 * prefix and any parenthetical note dropped. */
const pageKey = (s: string) =>
	s
		.replace(PAGE, "")
		.replace(/\s*\(.*\)$/, "")
		.trim();

/** Each round against the baseline: what fails the step, and notes that do
 * not (a listed round whose counts moved together, the shortfall unchanged). */
export function judgeAgainstBaseline(
	rounds: RoundCount[],
	baseline: ShortfallBaseline,
): { findings: RatchetFinding[]; notes: string[] } {
	const findings: RatchetFinding[] = [];
	const notes: string[] = [];
	const listed = new Map(baseline.rounds.map((e) => [e.round, e]));
	for (const r of rounds) {
		const e = listed.get(r.round);
		listed.delete(r.round);
		if (r.verdict === "over")
			findings.push({
				round: r.round,
				kind: "over",
				detail: `SCF #${r.round}: ours ${r.ours} above SCF ${r.scf}${
					r.undecided === 0
						? ""
						: r.closed
							? ` (its ${r.undecided} pending submission(s) allow nothing in a closed round)`
							: ` and its ${r.undecided} undecided`
				}, never baselinable`,
			});
		const allowedPages = new Set((e?.missing ?? []).map(pageKey));
		const strays = r.uncitedPages.filter((p) => !allowedPages.has(p));
		for (const p of allowedPages)
			if (r.awardPages.includes(p) && !r.uncitedPages.includes(p))
				findings.push({
					round: r.round,
					kind: "stale",
					detail: `SCF #${r.round}: ${p} is carried now; drop it from the entry's missing list`,
				});
		if (strays.length)
			findings.push({
				round: r.round,
				kind: "uncited",
				detail: `SCF #${r.round}: no row claiming the round carries ${strays.join(", ")}${e ? ", which its baseline entry does not list" : ""}; a swap inside the total or a lost join`,
			});
		const gap = r.verdict === "short" ? r.scf - r.ours : 0;
		if (!e) {
			if (gap > 0)
				findings.push({
					round: r.round,
					kind: "new",
					detail: `SCF #${r.round}: SCF ${r.scf}, ours ${r.ours}, short by ${gap} and not in the baseline`,
				});
			continue;
		}
		const was = e.scf - e.ours;
		if (gap > was)
			findings.push({
				round: r.round,
				kind: "grew",
				detail: `SCF #${r.round}: short by ${gap}, the baseline allows ${was} (SCF ${e.scf}, ours ${e.ours}; now SCF ${r.scf}, ours ${r.ours})`,
			});
		else if (gap < was)
			findings.push({
				round: r.round,
				kind: "stale",
				detail:
					gap === 0
						? `SCF #${r.round}: the gap closed (SCF ${r.scf}, ours ${r.ours}); remove its baseline entry`
						: `SCF #${r.round}: short by ${gap}, the baseline allows ${was}; lower its entry to SCF ${r.scf}, ours ${r.ours}`,
			});
		else if (was === 0 && !r.uncitedPages.some((p) => allowedPages.has(p)))
			findings.push({
				round: r.round,
				kind: "stale",
				detail: `SCF #${r.round}: the swap its entry records is gone (every page it lists is carried); remove its entry`,
			});
		else if (r.scf !== e.scf || r.ours !== e.ours)
			notes.push(
				`SCF #${r.round}: SCF ${e.scf} -> ${r.scf} and ours ${e.ours} -> ${r.ours}, the same shortfall; a swap hides in a total that did not move, so read the round`,
			);
	}
	for (const e of listed.values())
		findings.push({
			round: e.round,
			kind: "stale",
			detail: `SCF #${e.round}: listed in the baseline but neither side counts the round now; remove its entry`,
		});
	return { findings, notes };
}

/** Why one page of our awarded rows (GET /api/projects/search?scfAwarded=true)
 * cannot be counted, or null when it can. A page the API marks partial, one
 * with failed reads, one with no total, and one generated before `notBefore`
 * (the edge cache serving what it held before a sync) are all could-not-check:
 * a stale or cut read must never pass as a count of the sync. */
export function ourPageProblem(
	body: unknown,
	notBefore: Date | null,
): string | null {
	const b = body as {
		projects?: unknown;
		meta?: {
			partial?: unknown;
			failedReads?: unknown;
			counts?: { total?: unknown };
			generatedAt?: unknown;
		};
	} | null;
	if (!b || !Array.isArray(b.projects)) return "no projects array";
	if (b.meta?.partial !== false) return "the API marked the page partial";
	if (Array.isArray(b.meta.failedReads) && b.meta.failedReads.length > 0)
		return "the API reported failed reads";
	if (typeof b.meta.counts?.total !== "number") return "no total";
	if (notBefore) {
		const at = Date.parse(String(b.meta.generatedAt ?? ""));
		if (!Number.isFinite(at))
			return "no generatedAt to date the page against the sync";
		if (at < notBefore.getTime())
			return `the page was generated at ${String(b.meta.generatedAt)}, before the sync finished at ${notBefore.toISOString()}`;
	}
	return null;
}
