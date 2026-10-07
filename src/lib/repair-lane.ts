/**
 * The repair lane — the piece of the autonomy ladder that did not exist
 * (QUALITY.md §3): every detector opened ledger rows, no lane ever worked
 * one. This module is the lane's PURE half: which row to pick, the prompt
 * the agent runs against, which paths it may never touch, how an attempt is
 * recorded. The workflow (.github/workflows/repair-lane.yml) is the
 * impure half: it runs the agent in a checkout with NO production secrets,
 * checks the diff against PROTECTED_PATHS, pushes a `repair/*` branch and
 * opens a PR. It never merges. A human merges at Stage 1.
 */

export interface LedgerRow {
	id: string;
	source?: string;
	surface?: string;
	severity?: string;
	status: string;
	probe?: string;
	failureMode?: string;
	blockedOn?: string | null;
	firstSeen?: string;
	lastSeen?: string;
}

export interface Attempt {
	rowId: string;
	date: string;
	run: string;
	outcome: "fixed" | "already-passing" | "skip" | "blocked" | "error";
	pr: string | null;
	costUsd: number | null;
	note: string;
}

/** Sources the lane may work, with the reason each is autonomously fixable. */
export const WORKABLE_SOURCES: Record<string, string> = {
	"engine-a-recall":
		"a retrieval probe with a URL — re-checkable, fixable in ranking code",
	"engine-b-sweeps": "a data or serving sweep finding with a probe",
	"engine-d-demand":
		"a demand-replay class — usually an eval classification or a ranking fix",
	"engine-e-contract":
		"spec-vs-API drift; the API side is code, the spec side is protected",
	"nightly-battery":
		"a Raven battery question our corpus answers weakly — ranking or corpus",
	"nightly-claims": "a claim citation that stopped verifying",
	"nightly-completeness": "a record-completeness invariant",
	"nightly-field-population": "a served field that went empty",
	"nightly-note-freshness":
		"a registry fact the freshness lane re-verified as stale — edit the note",
	"raven-drift": "an op the gateway no longer routes as documented",
};

/** Sources the lane must NOT work, with the reason (a human or an upstream owns them). */
export const DENIED_SOURCES: Record<string, string> = {
	"link-health":
		"a dead link is a curation refresh (relink or retire), not code",
	"raven-routing":
		"a routing miss is Raven's index (catalog-lag) or a scorer we do not own",
};

/** Paths the agent may edit only through a human: the API contract, the
 *  published client, the lanes themselves, and anything that executes
 *  against production. A diff that touches one turns the run into
 *  `blocked` — the PR is not opened, the attempt is recorded. */
export const PROTECTED_PATHS = [
	"specs/",
	"api-client/",
	"public/openapi.json",
	"src/lib/openapi-spec.ts",
	".github/workflows/",
	"improvements/lanes/",
	"src/collections/",
	"src/payload.config.ts",
	"src/components/awards/",
];

export function isProtectedPath(p: string): boolean {
	return PROTECTED_PATHS.some((x) => p === x || p.startsWith(x));
}

const SEV: Record<string, number> = { high: 0, medium: 1, low: 2 };
export const MAX_ATTEMPTS_PER_ROW = 2;
export const RETRY_AFTER_DAYS = 14;

/** Pick ONE row: open, from a workable source, not blocked upstream, not
 *  already attempted twice recently, not carrying an open PR. Highest
 *  severity first, then oldest. Returns the reason when nothing qualifies
 *  so the lane log says WHY it did nothing. */
export function pickRow(
	rows: LedgerRow[],
	attempts: Attempt[],
	now = new Date(),
): { row: LedgerRow | null; reason: string; considered: number } {
	const cutoff = new Date(now.getTime() - RETRY_AFTER_DAYS * 86_400_000)
		.toISOString()
		.slice(0, 10);
	const recent = new Map<string, Attempt[]>();
	for (const a of attempts) {
		if (a.date < cutoff) continue;
		recent.set(a.rowId, [...(recent.get(a.rowId) ?? []), a]);
	}
	const open = rows.filter((r) => r.status === "open");
	const eligible = open.filter((r) => {
		const src = r.source ?? r.id.split(":")[0];
		if (!(src in WORKABLE_SOURCES)) return false;
		if (r.blockedOn) return false;
		const tries = recent.get(r.id) ?? [];
		if (tries.some((a) => a.outcome === "fixed" && a.pr)) return false; // PR open or merged, awaiting re-detection
		if (tries.length >= MAX_ATTEMPTS_PER_ROW) return false;
		return true;
	});
	eligible.sort(
		(a, b) =>
			(SEV[a.severity ?? "low"] ?? 9) - (SEV[b.severity ?? "low"] ?? 9) ||
			(a.firstSeen ?? "").localeCompare(b.firstSeen ?? ""),
	);
	if (!eligible.length) {
		const denied = open.filter(
			(r) => (r.source ?? r.id.split(":")[0]) in DENIED_SOURCES,
		).length;
		const blocked = open.filter((r) => r.blockedOn).length;
		return {
			row: null,
			reason: `no workable row: ${open.length} open, ${denied} owned by a human or upstream (link-health / raven-routing), ${blocked} blocked upstream, the rest attempted ${MAX_ATTEMPTS_PER_ROW}× in ${RETRY_AFTER_DAYS} days or awaiting re-detection`,
			considered: open.length,
		};
	}
	return {
		row: eligible[0],
		reason: `${eligible.length} workable; highest severity, oldest first`,
		considered: open.length,
	};
}

/** Where the row's full evidence lives (improvement-ledger.ts feeder map). */
export function artifactFor(source: string): string {
	if (source.startsWith("nightly-"))
		return `improvements/engine/nightly/${source.replace(/^nightly-/, "")}-latest.json`;
	if (source === "raven-drift")
		return "improvements/engine/raven-drift-latest.json";
	return `improvements/engine/weekly/${source}-latest.json`;
}

export function buildPrompt(
	row: LedgerRow,
	opts: { branch: string; date: string },
): string {
	const source = row.source ?? row.id.split(":")[0];
	return `You are the repair lane of Stellar Light (stellarlight.xyz), running unattended in CI on branch ${opts.branch} (${opts.date}). You work exactly ONE improvement-ledger row and you open no PR yourself — the workflow does, from what you commit. A human merges. Nothing here can reach production: there are no database secrets in this environment, and you must never run a script with --execute, never git push, never merge.

THE ROW
- id: ${row.id}
- source: ${source} (${WORKABLE_SOURCES[source] ?? "unknown"})
- surface: ${row.surface ?? "?"} · severity: ${row.severity ?? "?"} · first seen ${row.firstSeen?.slice(0, 10) ?? "?"} · last seen ${row.lastSeen?.slice(0, 10) ?? "?"}
- probe: ${row.probe ?? "(none)"}
- failure mode: ${row.failureMode ?? "(none)"}
- full evidence: ${artifactFor(source)} (find the entry whose probe/expected matches this row) and improvements/ledger/findings.json

RULE 1 — RE-CHECK BEFORE YOU FIX. If the probe is a URL, curl it now (read-only GET against https://stellarlight.xyz). If the row's condition no longer holds live, do NOT change code: write .repair/verdict.json with outcome "already-passing", the live evidence, and stop. Rows close by re-detection, not by edits. An empty page or a 5xx once is not evidence either way — re-check once after a few seconds.

RULE 2 — ROOT CAUSE, SMALLEST DIFF. Read the code path end to end before editing (the search route, the ranking helpers in src/lib/project-search-match.ts, the research rank in src/lib/research-rank.ts, the registry in src/lib/repo-knowledge.ts, the eval scripts in scripts/eval/ — whichever the row touches). Fix the class, not the example: a named project or query is a probe into a general defect. Keep the diff minimal. Add or adjust ONE unit test that fails without the fix. For a stale knowledge note, verify the new fact against the registry (npm / crates / GitHub) and cite it in the note with today's date.

RULE 3 — GATES, ALL OF THEM, BEFORE YOU COMMIT.
  npx biome check --write <files you touched>
  npx tsc --noEmit -p tsconfig.json
  npx vitest run <the test files near what you touched>
  (scripts/ changes only:) npx tsc -p tsconfig.scripts.json --noEmit 2>&1 | grep -c "error TS"  — must not exceed the count before your change.
If a gate fails and you cannot fix it honestly, write outcome "skip" with the reason and stop.

RULE 4 — PROTECTED PATHS. Never edit: ${PROTECTED_PATHS.join(", ")}. The API contract, the published client, the lanes and anything that writes production are human-gated. If the fix genuinely needs one of them, write outcome "blocked" naming the path and the change a human should make, and stop.

RULE 5 — WHAT YOU LEAVE BEHIND.
  1. git add the files you changed and git commit them (one commit; message in the repo's style: type(scope): what changed and why, with the row id in the body, ending with the line "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>").
  2. .repair/pr-body.md — sections: Root cause (what the code did and why), Fix (what changed), Proof (the tests you ran and their output lines), Live check (the exact URL and what should be true after deploy). Plain prose, numbers over adjectives, no praise.
  3. .repair/verdict.json — {"outcome": "fixed" | "already-passing" | "skip" | "blocked", "summary": "<one line>", "files": [..]}.
Do not touch anything else. Do not write memory files, docs, or QUALITY.md. When done, stop.`;
}

export function attemptsAfter(attempts: Attempt[], a: Attempt): Attempt[] {
	return [
		...attempts.filter((x) => !(x.rowId === a.rowId && x.run === a.run)),
		a,
	];
}
