/**
 * The per-row half of scripts/regrade-repos.ts, kept free of the database so
 * a scoped run (--only, --only-file) and the full pass grade a row with the
 * same code: a scoped grade is the full pass's grade for that row, or the
 * scope is a second grader.
 */
import {
	isFirstParty,
	type RepoGrade,
	type RepoGradeInput,
	repoGrade,
	vouchingNoteCount,
} from "./repo-grade";
import { CURATED_CANONICAL_REPOS } from "./repo-search";

const CURATED = new Set(CURATED_CANONICAL_REPOS.map((n) => n.toLowerCase()));

/** Authority inputs live on the project, not the repo. */
export interface ProjectAuthority {
	prominence: number;
	scfAwarded: boolean;
	hackathonWinner: boolean;
}

export function projectAuthority(p: Record<string, unknown>): ProjectAuthority {
	return {
		prominence: Number(p.prominence ?? 0),
		scfAwarded: Boolean((p.scf as { awarded?: boolean })?.awarded),
		hackathonWinner: Boolean(p.hackathonPlacement),
	};
}

type Row = Record<string, unknown>;

/** The grade the stored row earns now, from stored fields only. */
export function gradeStoredRow(
	r: Row,
	projects: ReadonlyMap<string, ProjectAuthority>,
): RepoGrade {
	return repoGrade(gradeInputOf(r, projects));
}

/** What the grade reads from a stored row and its project. */
export function gradeInputOf(
	r: Row,
	projects: ReadonlyMap<string, ProjectAuthority>,
): RepoGradeInput {
	const slug = r.projectSlug ? String(r.projectSlug) : null;
	const proj = slug ? projects.get(slug) : undefined;
	// Internal notes are triage memory ("not worth surfacing"), a verdict
	// AGAINST the repo. They must not count as external validation.
	const notes = Array.isArray(r.knowledgeNotes) ? r.knowledgeNotes : [];
	const input: RepoGradeInput = {
		lastCommitAt: (r.lastCommitAt as string) ?? null,
		stargazerCount: Number(r.stars ?? 0),
		isFork: Boolean(r.isFork),
		isArchived: Boolean(r.isArchived),
		hackathonWinner: Boolean(r.hackathonWinner) || !!proj?.hackathonWinner,
		scfAwarded: !!proj?.scfAwarded,
		projectProminence: proj?.prominence ?? 0,
		hasDescription: !!String(r.description ?? "").trim(),
		topicCount: Array.isArray(r.topics) ? r.topics.length : 0,
		openIssues: Number(r.openIssues ?? 0),
		commits90d:
			typeof (r.activitySignals as { commits90d?: number })?.commits90d ===
			"number"
				? (r.activitySignals as { commits90d: number }).commits90d
				: null,
		codeDepth: typeof r.codeDepth === "number" ? r.codeDepth : null,
		judgeScore: typeof r.judgeScore === "number" ? r.judgeScore : null,
		stellarProof: typeof r.stellarProof === "string" ? r.stellarProof : null,
		knowledgeNoteCount: vouchingNoteCount(notes),
		curatedCanonical: CURATED.has(String(r.fullName ?? "").toLowerCase()),
		firstParty: isFirstParty(String(r.fullName ?? "")),
		// Scanned facts. Present on the row since the code scan; they
		// reached the grade for the first time on 2026-09-07.
		testsPresent: typeof r.testsPresent === "boolean" ? r.testsPresent : null,
		ciPresent: typeof r.ciPresent === "boolean" ? r.ciPresent : null,
		lastReleaseAt:
			(r.activitySignals as { lastReleaseAt?: string })?.lastReleaseAt ?? null,
		versionStatus: typeof r.versionStatus === "string" ? r.versionStatus : null,
		contractInterfaceCount: Array.isArray(r.contractInterface)
			? r.contractInterface.length
			: 0,
		codeScanned: r.codeScanState === "scanned",
		// Feeds the template/scaffold demotion: a repo whose PURPOSE is to be
		// incomplete is a weaker reference than a finished one.
		name: r.fullName ? String(r.fullName) : null,
		// Registry-verified packages. The formula has read this since #1508
		// and NEITHER writer passed it, so the whole signal computed as zero
		// for every row.
		publishedPackageCount: Array.isArray(r.publishedPackages)
			? r.publishedPackages.length
			: 0,
		// Stored on the row by enrich, which passes it to repoGrade. This
		// lane did not, so the same row scored differently depending on which
		// lane wrote it last: the one-field-one-writer flip-flop.
		builderReputation:
			typeof r.builderReputation === "number" ? r.builderReputation : 0,
	};
	return input;
}

export interface RegradeMove {
	id: string;
	fullName: string;
	/** -1 when the row holds no score at all */
	from: number;
	to: number;
	labelFrom: string;
	labelTo: string;
}

/**
 * Plan one page of rows. `only` (lowercased owner/repo) scopes the pass:
 * every other row is skipped before it is graded. `matched` holds one
 * lowercased name per matched row, so a name never met and a name two rows
 * share (a case twin) both show.
 */
export function planRegrade(
	rows: Row[],
	projects: ReadonlyMap<string, ProjectAuthority>,
	only: ReadonlySet<string> | null,
): { matched: string[]; moves: RegradeMove[] } {
	const matched: string[] = [];
	const moves: RegradeMove[] = [];
	for (const r of rows) {
		const key = String(r.fullName ?? "").toLowerCase();
		if (only && !only.has(key)) continue;
		matched.push(key);
		const grade = gradeStoredRow(r, projects);
		const from = Number(r.repoScore ?? -1);
		const labelFrom = r.repoScoreLabel ? String(r.repoScoreLabel) : "";
		// A row whose score is right but whose LABEL is stale still needs a
		// write, so skipping on score alone would leave desynced rows
		// unrepaired by the very run meant to repair them.
		if (grade.score === from && grade.label === labelFrom) continue;
		moves.push({
			id: String(r.id),
			fullName: String(r.fullName),
			from,
			to: grade.score,
			labelFrom,
			labelTo: grade.label,
		});
	}
	return { matched, moves };
}

/** Why a scoped run must write nothing; empty when the scope is whole. */
export function scopeProblems(
	only: ReadonlySet<string>,
	matched: readonly string[],
): string[] {
	const count = new Map<string, number>();
	for (const k of matched) count.set(k, (count.get(k) ?? 0) + 1);
	const missing = [...only].filter((n) => !count.has(n));
	const twins = [...count].filter(([, c]) => c > 1).map(([k]) => k);
	return [
		...(missing.length ? [`named but not found: ${missing.join(", ")}`] : []),
		...(twins.length
			? [`named and matched by more than one row: ${twins.join(", ")}`]
			: []),
	];
}

export interface RegradeArgs {
	execute: boolean;
	/** 0 = no limit */
	limit: number;
	/** lowercased owner/repo names; null = every row */
	only: Set<string> | null;
}

const NAME_RE = /^[\w.-]+\/[\w.-]+$/;

/**
 * The script's arguments, checked before it touches the database. Only
 * --execute, --limit=N, --only=a/b,c/d and --only-file=<path> (one name per
 * line, blanks and # comments ignored) are accepted. Anything else throws,
 * because an unread flag leaves no scope and no scope is a full pass: the
 * space form `--only a/b` other scripts take, a bare `--only`, `--onyl=a/b`.
 * A scope that names nothing throws for the same reason.
 */
export function parseRegradeArgs(
	args: string[],
	readFile: (path: string) => string,
): RegradeArgs {
	const inline: string[] = [];
	const files: string[] = [];
	let execute = false;
	let limit = 0;
	for (const a of args) {
		if (a === "--execute") execute = true;
		else if (/^--limit=\d+$/.test(a)) limit = Number(a.slice(8));
		else if (a.startsWith("--only-file=")) files.push(a.slice(12));
		else if (a.startsWith("--only=")) inline.push(a.slice(7));
		else if (a.startsWith("--only"))
			throw new Error(
				`${a}: write --only=owner/repo[,owner/repo] or --only-file=<path>, with "="`,
			);
		else
			throw new Error(
				`unknown argument: ${a} (accepted: --execute, --limit=N, --only=..., --only-file=...)`,
			);
	}
	if (!inline.length && !files.length) return { execute, limit, only: null };
	if (limit)
		throw new Error(
			"--limit with --only: a scope already names its rows, and a limit would write some of them",
		);
	const text = [
		...inline,
		...files.map((f) =>
			readFile(f)
				.split("\n")
				.map((l) => l.replace(/#.*/, ""))
				.join("\n"),
		),
	].join(",");
	const names = text.split(/[\s,]+/).filter(Boolean);
	const bad = names.filter((n) => !NAME_RE.test(n));
	if (bad.length)
		throw new Error(`--only: not owner/repo: ${bad.slice(0, 5).join(", ")}`);
	if (!names.length) throw new Error("--only: no repo names given");
	return { execute, limit, only: new Set(names.map((n) => n.toLowerCase())) };
}

/**
 * The whole run: plan every page first, refuse a scope that is not whole
 * (a name no row matched, a name two rows matched), and only then write.
 * A typo in one of 38 names therefore writes nothing. `write` returns null
 * when the row reads back as written, else what it read.
 */
export async function runRegrade(
	pages: AsyncIterable<Row[]>,
	projects: ReadonlyMap<string, ProjectAuthority>,
	args: RegradeArgs,
	write: (m: RegradeMove) => Promise<string | null>,
): Promise<{
	read: number;
	matched: string[];
	moves: RegradeMove[];
	problems: string[];
	wrote: number;
	mismatched: string[];
}> {
	let read = 0;
	const matched: string[] = [];
	let moves: RegradeMove[] = [];
	for await (const rows of pages) {
		read += rows.length;
		const plan = planRegrade(rows, projects, args.only);
		matched.push(...plan.matched);
		moves.push(...plan.moves);
	}
	if (args.limit) moves = moves.slice(0, args.limit);
	const problems = args.only ? scopeProblems(args.only, matched) : [];
	const mismatched: string[] = [];
	let wrote = 0;
	if (args.execute && !problems.length)
		for (const m of moves) {
			const miss = await write(m);
			wrote++;
			if (miss) mismatched.push(miss);
		}
	return { read, matched, moves, problems, wrote, mismatched };
}
