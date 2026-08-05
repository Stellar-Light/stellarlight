/**
 * Per-repo knowledge notes (repo-intel slice 3) — dated FACTS with sources,
 * never LLM summaries (the audit-corpus SURFACE-don't-summarize doctrine).
 *
 * Two sources, merged by enrich on every pass (so curation is self-healing —
 * the map below is the truth and reapplies weekly):
 *   curated  — hand-verified facts about what a repo IS that no signal can
 *              derive (doc maps, packaging, companion repos). Promote-only
 *              discipline: only add what you verified, date it.
 *   derived:audit — the repo's owning project has verified security-audit
 *              reports in our registry (EXACT projectSlug join, never fuzzy).
 */

export interface KnowledgeNote {
	note: string;
	/** "curated" | "derived:audit" — where this fact came from. */
	source: string;
	/** When the fact was verified/derived (YYYY-MM-DD). */
	asOf: string;
}

/**
 * Curated per-repo facts, keyed by lowercase fullName. DISCIPLINE: every entry
 * verified against the repo's own docs/registry pages on the asOf date.
 */
export const REPO_KNOWLEDGE_NOTES: Record<string, KnowledgeNote[]> = {
	// Verified 2026-08-01 (SDF Discord thread with earrietadev + our indexing
	// work): per-protocol extension docs live in subdirectory READMEs.
	"creit-tech/stellar-indexer-sdk": [
		{
			note: "Ships per-protocol extensions with their own docs under src/protocols/ (Blend, Reflector, Axis Markets; more in progress) — the root README is the map. Service is token-gated beta; SDK published on JSR as @stellar-indexer/stellar-indexer-sdk.",
			source: "curated",
			asOf: "2026-08-01",
		},
	],
	// Verified 2026-07-31 (indexing pass): JSR packaging + companion repo.
	"fazzatti/colibri": [
		{
			note: "Published on JSR as @colibri/core; fazzatti/colibri-examples is the companion worked-examples repo — cite both together for how-to questions.",
			source: "curated",
			asOf: "2026-07-31",
		},
	],
};

export interface AuditRecord {
	projectSlug: string | null;
	auditor: string | null;
	publishedAt: string | null;
}

/**
 * Build the notes array for one repo: curated entries for its fullName plus
 * one derived audit note when its owning project has reports in the registry.
 * Deterministic and complete — enrich writes the RESULT wholesale each pass.
 */
export function buildKnowledgeNotes(
	fullName: string,
	projectSlug: string | null,
	auditsByProject: Map<string, AuditRecord[]>,
): KnowledgeNote[] {
	const notes: KnowledgeNote[] = [
		...(REPO_KNOWLEDGE_NOTES[fullName.toLowerCase()] ?? []),
	];
	const audits = projectSlug ? (auditsByProject.get(projectSlug) ?? []) : [];
	if (audits.length) {
		const dated = audits
			.filter((a) => a.publishedAt)
			.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
		const latest = dated[0] ?? audits[0];
		const latestBit = latest?.auditor
			? ` (latest: ${latest.auditor}${latest.publishedAt ? `, ${String(latest.publishedAt).slice(0, 10)}` : ""})`
			: "";
		notes.push({
			note: `${audits.length} security audit report${audits.length === 1 ? "" : "s"} on record for the owning project${latestBit} — full reports via /api/audits?q=${encodeURIComponent(projectSlug ?? "")}.`,
			source: "derived:audit",
			asOf: new Date().toISOString().slice(0, 10),
		});
	}
	return notes;
}
