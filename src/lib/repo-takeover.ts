/**
 * Whether a GitHub redirect from a repo a project claims lands on that same
 * repository, judged before a writer adopts the new name.
 *
 * GitHub redirects a repo's old path after a rename, a transfer or an
 * account rename, and keeps the redirect until a repo is created at the old
 * path. An account that is renamed or deleted frees its name: anyone can
 * register it, create a repo at an old path, and rename the account again,
 * and the old path then redirects to their repo. Three project claims led
 * into two such accounts (found 2026-11-12): scalemote/flow,
 * yk-labs-dev/soroban-cli-gui and orbit-cdp/hermes. enrich-repos followed
 * each redirect and served the new repo as the project's code.
 *
 * A move to another owner is refused when the repo it lands on holds no
 * code: GitHub detects no language in it and its default branch holds at
 * most HOLLOW_MAX_COMMITS commits (or it has no branch). A transfer or
 * rename keeps the repo's files and history, so a claimed codebase still
 * holds code after it moves. Measured 2026-11-12 on 1,731 claimed paths
 * (project claims, stored repo rows, hackathon build links) and the 2,421
 * repos of that day's repo pass, org fan-out included: 74 redirect to
 * another owner. The 3 takeovers hold 1 or 2 commits and no detected
 * language. Of the 71 honest moves, one has no detected language and holds
 * 26 commits; the 10 with 5 commits or fewer all hold code.
 *
 * A field GitHub did not answer is never read as absent: when the language
 * or the commit count of a cross-owner target was not read, the redirect is
 * not judged. The claim is skipped for that run, nothing is written, and it
 * counts as could-not-check, never as a refusal.
 *
 * A rename inside one owner, or a change of letter case, is never refused:
 * only the account's holder can make it. A refusal writes nothing and is not
 * served. To follow a refused move (an honest move of an empty repo), a
 * curator claims the new path directly, with GITHUB_REPOS_SET or
 * GITHUB_LINK_FIX in scripts/data/curation-maps.ts: a direct claim involves
 * no redirect, so this check never sees it.
 *
 * ponytail: a taker who pushes a code file, or six commits, passes, and so
 * does one who re-registers a freed name and creates the repo there with no
 * redirect at all, the cheapest takeover. The exact test: store GitHub's
 * databaseId (or the repo's createdAt, which never changes) on each repo
 * row, with enrich-repos its one writer, and refuse any read whose id
 * differs from the stored one, redirect or not; a mismatch writes nothing
 * and files a ledger row. It trusts the first read, so rows taken before the
 * backfill still rest on this rule.
 */

/** The three takeovers hold 1 or 2 commits; the honest move with no
 * detected language and the fewest commits holds 26. */
export const HOLLOW_MAX_COMMITS = 5;

/** What GitHub answers for the claimed path, after its redirect. */
export interface RedirectTarget {
	nameWithOwner: string | null;
	primaryLanguage: string | null;
	/** Commits on the default branch: 0 when the repo has no branch, null
	 * when the count was not read. */
	commitCount: number | null;
	createdAt?: string | null;
	/** Fields GitHub answered with an error for, as dotted paths. */
	unread?: readonly string[];
}

export type RedirectVerdict =
	| { verdict: "follow" }
	| { verdict: "refuse" | "could-not-judge"; reason: string };

const FOLLOW: RedirectVerdict = { verdict: "follow" };

const ownerOf = (fullName: string) =>
	(fullName.split("/")[0] ?? "").toLowerCase();

/** Follow, refuse, or could not judge. Every reason is in our words only:
 * the target's description and README are never quoted. */
export function judgeRedirect(
	claimed: string,
	target: RedirectTarget,
): RedirectVerdict {
	const to = target.nameWithOwner;
	if (!to || ownerOf(to) === ownerOf(claimed)) return FOLLOW;
	// A language GitHub read is code, whatever else was left out.
	if (target.primaryLanguage) return FOLLOW;
	const missing = [
		target.unread?.some((p) => p.split(".")[0] === "primaryLanguage") &&
			"language",
		target.commitCount === null && "commit count",
	].filter(Boolean);
	if (missing.length)
		return {
			verdict: "could-not-judge",
			reason: `${claimed} redirects to ${to}, under another owner, and GitHub's answer left out its ${missing.join(" and ")}`,
		};
	const commits = target.commitCount ?? 0;
	if (commits > HOLLOW_MAX_COMMITS) return FOLLOW;
	const created = target.createdAt
		? `, created ${target.createdAt.slice(0, 10)}`
		: "";
	return {
		verdict: "refuse",
		reason: `${claimed} now redirects to ${to}, a repo under another owner with no code and ${commits} commit${commits === 1 ? "" : "s"}${created}`,
	};
}

/** A claim enrich-repos did not write this run. `denied`: the name is on
 * DENIED_REPOS, a decision already made. */
export interface RedirectRow {
	verdict: "refuse" | "could-not-judge" | "denied";
	claimed: string;
	to: string | null;
	project: string | null;
	reason: string;
	/** Set on a refusal kept from an earlier run (its generatedAt) because
	 * this run could not read the claim. */
	carriedFrom?: string;
}

/** This run's rows, plus every refusal the previous artifact held whose
 * claim this run could not read (`unread`, lowercased owner/name or an
 * owner/ prefix for a failed org listing) or could not judge. A claim not
 * read is not a claim repaired: without this, one degraded run would close
 * an open finding by silence. A claim this run read and followed, or that
 * no project makes any more, is not carried. A carried refusal replaces this
 * run's could-not-judge row for the same claim: both name one ledger
 * finding, and the refusal is the one evidence supports. */
export function carryForward(
	rows: readonly RedirectRow[],
	previous: unknown,
	unread: ReadonlySet<string>,
): RedirectRow[] {
	const prev = previous as {
		generatedAt?: unknown;
		rows?: unknown;
	} | null;
	if (!prev || !Array.isArray(prev.rows)) return [...rows];
	const decided = new Set(
		rows
			.filter((r) => r.verdict !== "could-not-judge")
			.map((r) => r.claimed.toLowerCase()),
	);
	const unjudged = new Set(
		rows
			.filter((r) => r.verdict === "could-not-judge")
			.map((r) => r.claimed.toLowerCase()),
	);
	const keep = (claimed: string) => {
		const c = claimed.toLowerCase();
		return (
			!decided.has(c) &&
			(unread.has(c) || unread.has(`${c.split("/")[0]}/`) || unjudged.has(c))
		);
	};
	const carried = (prev.rows as Partial<RedirectRow>[])
		.filter(
			(r): r is RedirectRow =>
				r?.verdict === "refuse" &&
				typeof r.claimed === "string" &&
				typeof r.reason === "string" &&
				keep(r.claimed),
		)
		.map((r) => ({
			...r,
			carriedFrom:
				r.carriedFrom ??
				(typeof prev.generatedAt === "string" ? prev.generatedAt : "unknown"),
		}));
	const carriedClaims = new Set(carried.map((r) => r.claimed.toLowerCase()));
	return [
		...rows.filter(
			(r) =>
				r.verdict !== "could-not-judge" ||
				!carriedClaims.has(r.claimed.toLowerCase()),
		),
		...carried,
	];
}

/** Where enrich-repos records each executed full run's rows for the
 * ledger; the workflow points the write at the runner's temp directory and
 * a separate job commits it. */
export const REDIRECTS_ARTIFACT =
	"improvements/audits/repo-redirects-latest.json";

export const OVERRIDE =
	"To follow one, claim the new path directly (GITHUB_REPOS_SET or GITHUB_LINK_FIX): a direct claim involves no redirect.";

/** The ledger failure mode for a row: a refusal is a claim for curation, a
 * redirect not judged is our read failing, and a denied row is no finding. */
export function ledgerMode(row: {
	verdict?: unknown;
}): "redirect-taken" | "redirect-unjudged" | null {
	if (row.verdict === "refuse") return "redirect-taken";
	if (row.verdict === "could-not-judge") return "redirect-unjudged";
	return null;
}

const TITLE = {
	refuse: "Repo redirect refused",
	"could-not-judge": "Repo redirect not judged",
	denied: "Denied repo skipped",
} as const;

/** A GitHub Actions annotation for a row; denied rows get none. */
export function annotation(row: RedirectRow): string | null {
	if (row.verdict === "denied") return null;
	const level = row.verdict === "refuse" ? "warning" : "notice";
	return `::${level} title=${TITLE[row.verdict]}::${row.reason} (claimed by ${row.project ?? "an org seed"})`;
}

/** The run's rows as a job summary table, in our words only. */
export function redirectSummary(rows: readonly RedirectRow[]): string {
	if (!rows.length) return "";
	const lines = rows.map(
		(r) =>
			`| ${TITLE[r.verdict]} | ${r.project ?? "an org seed"} | ${r.reason} |`,
	);
	return [
		"### Claims enrich-repos did not write",
		"",
		"| What | Project | Why |",
		"| --- | --- | --- |",
		...lines,
		"",
		`Nothing was written for these. ${OVERRIDE}`,
		"",
	].join("\n");
}
