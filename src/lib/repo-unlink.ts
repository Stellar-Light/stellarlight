/**
 * Which repo rows lose their projectSlug because no project claims them any
 * more. enrich-repos is the one writer of repos.projectSlug: it builds its
 * targets from project claims (github.repos, links.github, org fan-out) and
 * upserts those rows, so before this a row a project stopped claiming kept
 * the link forever and the project page kept serving it
 * (stellar/moneygram-access-wallet-mvp under moneygram, 2026-11-12).
 *
 * A row is unlinked only when all of these hold:
 *  - it entered the index as a project link (`source` project-link); a row
 *    that came from ec-taxonomy or builder-owned is never touched here;
 *  - no claim this run reached it: not by id (the run's own lookups, which
 *    are case-insensitive and follow a rename to the canonical row) and not
 *    by name (every claimed name and every canonical name GitHub returned);
 *  - its project cannot claim it through an org fan-out that ran: when the
 *    row's owner org was expanded and the row's slug is that org's linking
 *    project or a project under that org, the org link still stands. The
 *    fan-out's 100-repo page, 40-repo cap and archived filter decide which
 *    repos get refreshed, not which ones the project claims;
 *  - the claim set is whole: a targeted run (--only, ENRICH_LIMIT) or any
 *    failed read (an org listing, a repo lookup GitHub could not answer)
 *    unlinks nothing, since a partial claim set would read as absence;
 *  - the total is within UNLINK_CAP, so a bug cannot mass-unlink.
 *
 * Every run prints the plan. Only an execute that also passes --unlink
 * writes it: a manual dispatch with both boxes ticked, after its dry run was
 * read. Scheduled and chained runs report the drift and change nothing.
 */

/** Measured 2026-11-12 from the public repos and projects APIs: 51 rows no
 *  project claimed (38 once curation claims 13 of them), 2,181 held by an org
 *  link that still stands. A weekly run after the first should unlink a
 *  handful. Above this the run unlinks
 *  nothing and fails; raise it in a reviewed PR after reading the dry run. */
export const UNLINK_CAP = 75;

/** GitHub answered for the name itself, so the name cannot lead to another
 *  row through a rename. Any other fetch error leaves the claim unresolved. */
export const ANSWERED_FETCH_ERRORS = new Set([
	"Repository not found",
	"Private repository - access denied",
]);

type Note = { source?: string | null } & Record<string, unknown>;

export interface UnlinkRow {
	id: string;
	fullName: string;
	projectSlug?: string | null;
	source?: string | null;
	/** As stored, internal notes included (read with context.internal). */
	knowledgeNotes?: Note[] | null;
}

export interface Unlink {
	id: string;
	fullName: string;
	from: string;
	knowledgeNotes?: Note[] | null;
}

/** What enrich-repos copies from the owning project onto the row, and what
 *  an unlink resets it to: the link and name, the project's hackathon
 *  placement and SCF award (searchRepos serves both as stored), and the
 *  note citing the project's audits (source AUDIT_NOTE_SOURCE). repoScore
 *  and triageTags are derived from these and follow when the regrade and
 *  triage lanes next run. */
export const UNLINK_RESETS = {
	projectSlug: null,
	projectName: null,
	scfAwarded: false,
	hackathonWinner: false,
} as const;
export const AUDIT_NOTE_SOURCE = "derived:audit";
/** Every field an unlink writes; enrich-repos reads each one back. */
export const UNLINK_VERIFIED_FIELDS = [
	...Object.keys(UNLINK_RESETS),
	"projectUnlink",
	"knowledgeNotes",
];

export function planRepoUnlinks(args: {
	rows: readonly UnlinkRow[];
	claimedIds: ReadonlySet<string>;
	/** Any case; compared case-insensitively. */
	claimedNames: Iterable<string>;
	/** Lowercased org login: the slugs that can claim through its fan-out. */
	orgClaimants: ReadonlyMap<string, ReadonlySet<string>>;
	targeted: boolean;
	/** Reads that failed this run; any one makes the claim set partial. */
	failures: readonly string[];
	cap?: number;
}): { unlinks: Unlink[]; abstain: string | null; overCap: boolean } {
	const cap = args.cap ?? UNLINK_CAP;
	if (args.targeted)
		return { unlinks: [], abstain: "targeted run", overCap: false };
	if (args.failures.length)
		return {
			unlinks: [],
			abstain: `${args.failures.length} read(s) failed, so the claim set is partial: ${args.failures.slice(0, 5).join("; ")}`,
			overCap: false,
		};
	const names = new Set([...args.claimedNames].map((n) => n.toLowerCase()));
	const unlinks: Unlink[] = [];
	for (const r of args.rows) {
		const slug = r.projectSlug;
		if (r.source !== "project-link" || !slug) continue;
		const name = r.fullName.toLowerCase();
		if (args.claimedIds.has(r.id) || names.has(name)) continue;
		if (args.orgClaimants.get(name.split("/")[0])?.has(slug)) continue;
		unlinks.push({
			id: r.id,
			fullName: r.fullName,
			from: slug,
			knowledgeNotes: r.knowledgeNotes,
		});
	}
	if (unlinks.length > cap)
		return {
			unlinks: [],
			abstain: `${unlinks.length} rows would be unlinked, over the cap of ${cap}`,
			overCap: true,
		};
	return { unlinks, abstain: null, overCap: false };
}

/** Unlinks are written only by an execute run that also opts in. */
export const writesUnlinks = (argv: readonly string[]) =>
	argv.includes("--execute") && argv.includes("--unlink");

export type UnlinkWrite = typeof UNLINK_RESETS & {
	projectUnlink: { from: string; at: string; reason: string };
	/** Only when the row carried the project's audit note. */
	knowledgeNotes?: Note[];
};

/** Prints one line per unlink and the total; writes each only when `write`.
 *  Returns what was written, for the caller's read-back, and what failed. */
export async function applyRepoUnlinks(
	unlinks: readonly Unlink[],
	opts: {
		write: boolean;
		at: string;
		update: (id: string, data: UnlinkWrite) => Promise<unknown>;
		log: (line: string) => void;
	},
): Promise<{
	written: Map<string, { fullName: string; data: UnlinkWrite }>;
	failed: string[];
}> {
	const written = new Map<string, { fullName: string; data: UnlinkWrite }>();
	const failed: string[] = [];
	for (const u of unlinks) {
		opts.log(
			`unlink ${u.fullName} from ${u.from} (no project claims it; ${opts.at.slice(0, 10)})`,
		);
		if (!opts.write) continue;
		const notes = u.knowledgeNotes ?? [];
		const data: UnlinkWrite = {
			...UNLINK_RESETS,
			projectUnlink: {
				from: u.from,
				at: opts.at,
				reason: "no project claims it",
			},
			...(notes.some((n) => n.source === AUDIT_NOTE_SOURCE)
				? {
						knowledgeNotes: notes.filter((n) => n.source !== AUDIT_NOTE_SOURCE),
					}
				: {}),
		};
		try {
			await opts.update(u.id, data);
			written.set(u.id, { fullName: u.fullName, data });
		} catch (e) {
			failed.push(`${u.fullName}: ${e instanceof Error ? e.message : e}`);
		}
	}
	opts.log(
		`unlink total: ${unlinks.length}${opts.write || !unlinks.length ? "" : " (not written: a manual execute with --unlink writes them)"}`,
	);
	return { written, failed };
}
