/**
 * SCF's own payment record per project (pure logic, no I/O). Every SCF
 * project page carries two figures from SCF's books, totalAwarded and
 * totalPaid. A Build award is paid in tranches and the last one is the
 * mainnet launch, so a Build award paid in full is SCF's own record that the
 * team delivered its mainnet launch (or the final deliverable the award
 * allowed in its place).
 *
 * The schedule by era, read off the paid shares on single-award pages
 * (2026-11-23, 530 pages): Build rounds 30 to 40 pay in three equal tranches
 * (cumulative 1/3, 2/3, 1); Build rounds 41 and later pay the Handbook's four
 * (10% on acceptance, MVP 20%, testnet 30%, mainnet 40%: cumulative 0.1, 0.3,
 * 0.6, 1). Legacy and other awards were paid in full on every single-award
 * page read, so they say nothing about a launch; one whose status names a
 * share ("Awarded (50%)") is held to it.
 *
 * The page gives one paid total, so a share per award exists only where the
 * total splits one way: every award's share comes from its schedule and the
 * shares times the budgets sum to the paid total. Where it does not split,
 * the share is null, never a guess.
 *
 * The writer is scripts/enrich-from-scf.ts (projects.scf.paid, and one
 * scf-paid-reads row per execute); the API serves it as scfPaid.
 */

export const PAID_SCHEDULES = ["thirds", "four-tranche"] as const;
export type PaidSchedule = (typeof PAID_SCHEDULES)[number];
const SHARES: Record<PaidSchedule, number[]> = {
	thirds: [0, 1 / 3, 2 / 3, 1],
	"four-tranche": [0, 0.1, 0.3, 0.6, 1],
};

/** Why a page's paid total did or did not split into per-award shares. */
export const PAID_SPLITS = [
	"exact",
	"ambiguous",
	"no-fit",
	"budgets-differ",
	"no-figures",
	"no-schedule",
] as const;
export type PaidSplit = (typeof PAID_SPLITS)[number];

/** One awarded submission on an SCF project page. */
export interface PaidAward {
	/** SCF's submission record id. */
	submission: string;
	round: number | null;
	awardType: string | null;
	budgetUSD: number | null;
	/** "Awarded", or "Awarded (50%)" for one SCF marks part paid. */
	status: string;
}

/** One SCF project page's own payment figures and awarded submissions. */
export interface PaidPage {
	sourceUrl: string;
	totalAwarded: number | null;
	totalPaid: number | null;
	awards: PaidAward[];
}

/** One Build award as projects.scf.paid stores it. */
export interface StoredBuildAward {
	submission: string;
	sourceUrl: string;
	round: number | null;
	budgetUSD: number | null;
	schedule: PaidSchedule | null;
	paidShare: number | null;
	/** End of the first sync read that showed this share. */
	paidShareSeenBy: string | null;
	/** Start of the sync read before it, which showed another share. */
	paidShareNotSeenAt: string | null;
}

/** projects.scf.paid. One writer: the SCF sync. */
export interface StoredScfPaid {
	totalAwarded: number | null;
	totalPaid: number | null;
	seenBy: string;
	notSeenAt: string | null;
	split: PaidSplit;
	builds: StoredBuildAward[];
}

/** One page in a scf-paid-reads row: the sync's read of it. */
export interface PaidReadPage {
	page: string;
	totalAwarded: number | null;
	totalPaid: number | null;
	split: PaidSplit;
	builds: Array<{ submission: string; paidShare: number | null }>;
}

/** The newest scf-paid-reads row, as the next run reads it. */
export interface PreviousPaidRead {
	startedAt: string;
	pages: ReadonlyMap<string, PaidReadPage>;
}

const isBuild = (a: PaidAward) => /^Build\b/i.test(a.awardType ?? "");

export function scheduleOf(round: number | null): PaidSchedule | null {
	if (round === null || round < 30) return null;
	return round <= 40 ? "thirds" : "four-tranche";
}

export const pageSlugOf = (sourceUrl: string) =>
	sourceUrl.replace(/^.*\/project\//, "");

/** The page's paid total split into a share per Build award. */
export function splitPaidPage(page: PaidPage): {
	split: PaidSplit;
	builds: Array<{
		award: PaidAward;
		schedule: PaidSchedule | null;
		paidShare: number | null;
	}>;
} {
	const builds = page.awards.filter(isBuild);
	const none = (split: PaidSplit) => ({
		split,
		builds: builds.map((award) => ({
			award,
			schedule: scheduleOf(award.round),
			paidShare: null,
		})),
	});
	const { totalAwarded, totalPaid } = page;
	if (totalAwarded === null || totalPaid === null) return none("no-figures");
	if (page.awards.some((a) => a.budgetUSD === null))
		return none("budgets-differ");
	const budgets = page.awards.map((a) => a.budgetUSD ?? 0);
	if (Math.abs(budgets.reduce((s, b) => s + b, 0) - totalAwarded) > 1)
		return none("budgets-differ");
	const options = page.awards.map((a) => {
		if (!isBuild(a)) {
			const pct = /\((\d+(?:\.\d+)?)%\)/.exec(a.status)?.[1];
			return [pct ? Number(pct) / 100 : 1];
		}
		const s = scheduleOf(a.round);
		return s ? SHARES[s] : null;
	});
	if (options.some((o) => o === null)) return none("no-schedule");
	const opts = options as number[][];
	// ponytail: brute force over every combination; a page past 100k
	// combinations (7+ Build awards) is reported ambiguous, never searched.
	if (opts.reduce((n, o) => n * o.length, 1) > 100_000)
		return none("ambiguous");
	const tol = Math.max(1, 0.002 * totalAwarded);
	let combos: number[][] = [[]];
	for (const o of opts) combos = combos.flatMap((c) => o.map((x) => [...c, x]));
	const fits = combos.filter(
		(c) =>
			Math.abs(c.reduce((s, f, i) => s + f * budgets[i], 0) - totalPaid) <= tol,
	);
	if (!fits.length) return none("no-fit");
	let exact = true;
	const out = builds.map((award) => {
		const i = page.awards.indexOf(award);
		const seen = new Set(fits.map((c) => c[i]));
		if (seen.size > 1) exact = false;
		return {
			award,
			schedule: scheduleOf(award.round),
			paidShare: seen.size === 1 ? [...seen][0] : null,
		};
	});
	return { split: exact ? "exact" : "ambiguous", builds: out };
}

/** The page as a scf-paid-reads row records it. */
export function paidReadPage(page: PaidPage): PaidReadPage {
	const s = splitPaidPage(page);
	return {
		page: pageSlugOf(page.sourceUrl),
		totalAwarded: page.totalAwarded,
		totalPaid: page.totalPaid,
		split: s.split,
		builds: s.builds.map((b) => ({
			submission: b.award.submission,
			paidShare: b.paidShare,
		})),
	};
}

const sum = (xs: Array<number | null>) =>
	xs.every((x) => typeof x === "number")
		? (xs as number[]).reduce((s, x) => s + x, 0)
		: null;

/**
 * A row's paid record from the pages read for it now (one, or several a row
 * folds). Dates carry over while the figures stand; a changed figure is
 * seen by `now` (a time after the pages were read) and not seen at the start
 * of the previous sync read when that read showed a different value. Null
 * when no page was read.
 */
export function nextScfPaid(input: {
	pages: readonly PaidPage[];
	stored?: StoredScfPaid | null;
	previous?: PreviousPaidRead | null;
	now: string;
}): StoredScfPaid | null {
	const { pages, previous, now } = input;
	// a stored value of another shape is no record
	const stored = Array.isArray(input.stored?.builds) ? input.stored : null;
	if (!pages.length) return null;
	const splits = pages.map((p) => ({ page: p, ...splitPaidPage(p) }));
	const totalAwarded = sum(pages.map((p) => p.totalAwarded));
	const totalPaid = sum(pages.map((p) => p.totalPaid));
	const prevPages = pages.map((p) =>
		previous?.pages.get(pageSlugOf(p.sourceUrl)),
	);
	const totalsKept =
		stored &&
		stored.totalAwarded === totalAwarded &&
		stored.totalPaid === totalPaid;
	const prevTotals = prevPages.every(Boolean)
		? [
				sum(prevPages.map((p) => p?.totalAwarded ?? null)),
				sum(prevPages.map((p) => p?.totalPaid ?? null)),
			]
		: null;
	const builds = splits.flatMap((s) =>
		s.builds.map((b): StoredBuildAward => {
			const was = stored?.builds.find(
				(x) => x.submission === b.award.submission,
			);
			const base = {
				submission: b.award.submission,
				sourceUrl: s.page.sourceUrl,
				round: b.award.round,
				budgetUSD: b.award.budgetUSD,
				schedule: b.schedule,
				paidShare: b.paidShare,
			};
			if (b.paidShare === null)
				return { ...base, paidShareSeenBy: null, paidShareNotSeenAt: null };
			if (was && was.paidShare === b.paidShare && was.paidShareSeenBy)
				return {
					...base,
					paidShareSeenBy: was.paidShareSeenBy,
					paidShareNotSeenAt: was.paidShareNotSeenAt,
				};
			const before = previous?.pages
				.get(pageSlugOf(s.page.sourceUrl))
				?.builds.find((x) => x.submission === b.award.submission)?.paidShare;
			return {
				...base,
				paidShareSeenBy: now,
				paidShareNotSeenAt:
					previous && typeof before === "number" && before !== b.paidShare
						? previous.startedAt
						: null,
			};
		}),
	);
	return {
		totalAwarded,
		totalPaid,
		seenBy: totalsKept ? stored.seenBy : now,
		notSeenAt: totalsKept
			? stored.notSeenAt
			: previous &&
					prevTotals &&
					prevTotals.every((t) => t !== null) &&
					(prevTotals[0] !== totalAwarded || prevTotals[1] !== totalPaid)
				? previous.startedAt
				: null,
		split: splits.find((s) => s.split !== "exact")?.split ?? "exact",
		builds,
	};
}

/** Whether two paid records state the same figures (dates aside): the
 * sync writes only on a change, so a re-run right after plans nothing. */
export function samePaid(
	a: StoredScfPaid | null | undefined,
	b: StoredScfPaid | null | undefined,
): boolean {
	const key = (r: StoredScfPaid | null | undefined) =>
		Array.isArray(r?.builds)
			? JSON.stringify([
					r.totalAwarded,
					r.totalPaid,
					r.split,
					r.builds.map((x) => [
						x.submission,
						x.sourceUrl,
						x.round,
						x.budgetUSD,
						x.schedule,
						x.paidShare,
					]),
				])
			: null;
	return key(a) === key(b);
}

/** Tranches a share stands for under its schedule: [paid, of]. */
function tranches(
	schedule: PaidSchedule | null,
	share: number | null,
): [number, number] | null {
	if (!schedule || share === null) return null;
	const i = SHARES[schedule].findIndex((s) => Math.abs(s - share) < 1e-9);
	return i < 0 ? null : [i, SHARES[schedule].length - 1];
}

export interface ServedScfPaid {
	totalAwardedUSD: number | null;
	totalPaidUSD: number | null;
	seenBy: string;
	notSeenAt: string | null;
	split: PaidSplit;
	buildAwards: Array<{
		round: number | null;
		sourceUrl: string;
		budgetUSD: number | null;
		schedule: PaidSchedule | null;
		paidShare: number | null;
		tranchesPaid: number | null;
		tranches: number | null;
		finalTranchePaid: boolean | null;
		paidShareSeenBy: string | null;
		paidShareNotSeenAt: string | null;
	}>;
}

/** The row's scfPaid block; null when the sync has stored no paid read. */
export function servedScfPaid(raw: unknown): ServedScfPaid | null {
	const r = raw as StoredScfPaid | null | undefined;
	if (!r || typeof r !== "object" || !Array.isArray(r.builds)) return null;
	return {
		totalAwardedUSD: r.totalAwarded ?? null,
		totalPaidUSD: r.totalPaid ?? null,
		seenBy: r.seenBy,
		notSeenAt: r.notSeenAt ?? null,
		split: r.split,
		buildAwards: r.builds.map((b) => {
			const t = tranches(b.schedule, b.paidShare);
			return {
				round: b.round ?? null,
				sourceUrl: b.sourceUrl,
				budgetUSD: b.budgetUSD ?? null,
				schedule: b.schedule ?? null,
				paidShare: b.paidShare ?? null,
				tranchesPaid: t ? t[0] : null,
				tranches: t ? t[1] : null,
				finalTranchePaid: b.paidShare === null ? null : b.paidShare === 1,
				paidShareSeenBy: b.paidShareSeenBy ?? null,
				paidShareNotSeenAt: b.paidShareNotSeenAt ?? null,
			};
		}),
	};
}
