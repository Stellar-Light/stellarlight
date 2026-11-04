/**
 * What scripts/import-curated-builds.ts writes for each curated row, and its
 * dry run, kept pure so a test runs the plan over fixtures. The script reads
 * the store, prints this plan and, on --execute, writes it and reads every
 * field back.
 */
import type { CuratedBuild } from "@/data/curated-builds";
import type { CuratedHackathon } from "@/data/curated-hackathons";
import { CURATED_BUILD_ID, repoFullNameOf } from "@/lib/hackathon-build-links";

export const curatedEntryKey = (b: CuratedBuild) =>
	`${b.id}@${b.hackathonSlug}`;

/** Rows the import refuses: a duplicate or non-curated id, or no curated
 * event behind it. */
export function badCuratedRows(
	rows: CuratedBuild[],
	events: Map<string, CuratedHackathon>,
): CuratedBuild[] {
	const ids = new Set<string>();
	return rows.filter((b) => {
		const dup = ids.has(b.id);
		ids.add(b.id);
		return dup || !events.has(b.hackathonSlug) || !CURATED_BUILD_ID.test(b.id);
	});
}

/** The fields the import is the one writer of, for one row. A field the
 * file leaves empty is written as null, so a second run clears a value the
 * file corrected (outside review, 2026-10-20). The derived fields (stack,
 * activity, project link, embedding, categories) are the sync lane's. */
export function curatedFacts(
	b: CuratedBuild,
	ev: CuratedHackathon,
): Record<string, unknown> {
	return {
		buildId: b.id,
		entryKey: curatedEntryKey(b),
		name: b.name,
		hackathonSlug: b.hackathonSlug,
		hackathonTitle: ev.title,
		endedAt: new Date(ev.end_time * 1000).toISOString(),
		url: b.url,
		isWinner: b.isWinner,
		track: b.track ?? null,
		placement: b.placement ?? null,
		vision: b.description ?? null,
		githubUrl: b.githubUrl ?? null,
		repoFullName: repoFullNameOf(b.githubUrl),
		demoUrl: b.demoUrl ?? null,
		winnerSource: b.winnerSource ?? null,
		entryBasis: b.entryBasis ?? null,
		entryEvidence: b.entryEvidence ?? null,
		contracts: b.contracts ?? null,
		contractsCheckedAt: b.contractsCheckedAt ?? null,
		hiddenUpstream: false,
	};
}

/** Equal as stored: a field written as null may read back absent. */
export function sameValue(stored: unknown, wrote: unknown): boolean {
	if (wrote === null || wrote === false)
		return stored === wrote || stored === null || stored === undefined;
	return JSON.stringify(stored) === JSON.stringify(wrote);
}

export interface CuratedImportPlan {
	/** The dry run's lines: each create, update and hide, every changed
	 * field old to new. */
	lines: string[];
	/** Rows to write: id null creates. */
	writes: Array<{
		entryKey: string;
		id: string | null;
		facts: Record<string, unknown>;
	}>;
	/** Every row's facts by entryKey, for the read-back. */
	expected: Map<string, Record<string, unknown>>;
	created: number;
	updated: number;
	unchanged: number;
}

/** What the import would write: stored rows by entryKey; orphans are the
 * served curated rows no longer in the files, each hidden, never deleted. */
export function planCuratedImport(
	rows: CuratedBuild[],
	events: Map<string, CuratedHackathon>,
	stored: Map<string, Record<string, unknown>>,
	orphans: Array<{ entryKey?: unknown }> = [],
): CuratedImportPlan {
	const plan: CuratedImportPlan = {
		lines: [],
		writes: [],
		expected: new Map(),
		created: 0,
		updated: 0,
		unchanged: 0,
	};
	for (const b of rows) {
		const ev = events.get(b.hackathonSlug);
		if (!ev) continue;
		const facts = curatedFacts(b, ev);
		const entryKey = curatedEntryKey(b);
		plan.expected.set(entryKey, facts);
		const old = stored.get(entryKey);
		const diff = Object.entries(facts).filter(
			([k, v]) => !sameValue(old?.[k], v),
		);
		if (old && !diff.length) {
			plan.unchanged++;
			continue;
		}
		plan.lines.push(`  ${old ? "update" : "create"} ${entryKey}`);
		for (const [k, v] of diff)
			plan.lines.push(
				`      ${k}: ${JSON.stringify(old?.[k] ?? null)} -> ${JSON.stringify(v)}`,
			);
		plan.writes.push({ entryKey, id: old ? String(old.id) : null, facts });
		if (old) plan.updated++;
		else plan.created++;
	}
	for (const o of orphans)
		plan.lines.push(`  hide ${o.entryKey}: no longer in the curated files`);
	return plan;
}

/** The fields the daily sync derives (scripts/sync-hackathon-builds.ts
 * steps 3 to 7), the only ones it writes on a curated row: the import owns
 * every other field (one field, one writer). */
export const SYNC_DERIVED_FIELDS = [
	"repoCurrentFullName",
	"projectSlug",
	"projectName",
	"projectLinkBasis",
	"linkCheckedAt",
	"embedding",
	"embeddingTextHash",
	"stack",
	"stackReadAt",
	"repoMissingAt",
	"categories",
	"categoriesAt",
	"categoriesMethod",
	"repoLastCommitAt",
	"repoArchived",
	"activityCheckedAt",
] as const;

/** A stored curated row the sync derives fields for: served and with a
 * repo. Carries only what the derive steps read (the link rules, the
 * embedded text, the stack order), copied from the stored row; null for any
 * other row. */
export function curatedSyncRow(d: {
	buildId: string;
	entryKey?: string | null;
	hackathonSlug: string;
	name: string;
	vision?: string | null;
	track?: string | null;
	isWinner?: boolean | null;
	githubUrl?: string | null;
	demoUrl?: string | null;
	repoFullName?: string | null;
	endedAt?: string | null;
	hiddenUpstream?: boolean | null;
}) {
	if (!CURATED_BUILD_ID.test(d.buildId) || !d.repoFullName || d.hiddenUpstream)
		return null;
	return {
		buildId: d.buildId,
		entryKey: d.entryKey ?? `${d.buildId}@${d.hackathonSlug}`,
		name: d.name,
		vision: d.vision ?? null,
		track: d.track ?? null,
		isWinner: !!d.isWinner,
		githubUrl: d.githubUrl ?? null,
		demoUrl: d.demoUrl ?? null,
		repoFullName: d.repoFullName,
		endedAt: d.endedAt ?? null,
	};
}

/** What the sync writes on a curated row: its derived fields, nothing else. */
export function derivedOnly(
	r: Record<string, unknown>,
): Record<string, unknown> {
	return Object.fromEntries(
		SYNC_DERIVED_FIELDS.filter((f) => f in r).map((f) => [f, r[f]]),
	);
}
