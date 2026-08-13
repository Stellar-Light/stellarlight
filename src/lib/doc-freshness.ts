/**
 * Doc-kind + SDK-version signals for research chunks
 * (improvements/ideas/research-doc-freshness.md — the stale-playbook class
 * repos are guarded against, unguarded on docs until now).
 *
 * Deterministic only (the audit-corpus doctrine: no LLM in ingest). docKind
 * separates staleness-SENSITIVE docs (guides/tutorials — old means possibly
 * wrong) from canonical ones (specs/whitepapers — old AND authoritative).
 * versionStatus flags version-bearing content via the SAME dated table repos
 * use (soroban-versions.ts): a setup guide showing `wasm32-unknown-unknown`
 * is deprecated no matter how recently we crawled it. Review-signal only —
 * never auto-down-ranked.
 */

import { parseSdkMajor, versionStatusOf } from "./soroban-versions";

export type DocKind = "spec" | "guide" | "article" | "data";

/** Sources whose docs are canonical: age ≠ staleness. */
const SPEC_SOURCES = new Set([
	"cap",
	"sep",
	"paper",
	"audit",
	"protocol-release",
	"security-program",
]);
/** Sources that are dated commentary/reporting. */
const ARTICLE_SOURCES = new Set(["sdf-blog", "lumenloop", "incident"]);
/** Structured datasets — freshness lives in their own asOf fields. */
const DATA_SOURCES = new Set(["ec-report", "dora-eval"]);

const GUIDE_HINT =
	/tutorial|guide|quick\s*start|quickstart|getting[- ]started|setup|install|how[- ]to|walkthrough|example/i;

export function docKindOf(input: {
	source: string;
	url?: string | null;
	title?: string | null;
}): DocKind {
	const src = input.source.toLowerCase();
	if (SPEC_SOURCES.has(src)) return "spec";
	if (DATA_SOURCES.has(src)) return "data";
	if (ARTICLE_SOURCES.has(src)) return "article";
	if (GUIDE_HINT.test(`${input.title ?? ""} ${input.url ?? ""}`)) return "guide";
	// developers-docs / repo-docs / scf-handbook default: instructional
	return "guide";
}

/** Deprecated-idiom markers that outrank any pinned version: content teaching
 * these is stale regardless of the SDK line it names. */
const DEPRECATED_IDIOMS = /wasm32-unknown-unknown|soroban-cli\s+(?:install|deploy)|--wasm\s+target\/wasm32-unknown-unknown/i;
const CURRENT_IDIOMS = /wasm32v1-none/i;
const SDK_PIN =
	/soroban-sdk\s*=\s*"?~?\^?(\d+)|@stellar\/stellar-sdk@[~^]?(\d+)|soroban_sdk\s+(\d+)\./i;

/** Version verdict for a chunk's CONTENT, or null when it names no version
 * signal at all (most prose — absence is honest, never "unknown"). */
export function docVersionStatus(content: string): string | null {
	if (DEPRECATED_IDIOMS.test(content)) return "deprecated";
	const m = content.match(SDK_PIN);
	if (m) {
		const major = parseSdkMajor(m[1] ?? m[2] ?? m[3] ?? null);
		if (major !== null) return versionStatusOf(`${major}.0.0`);
	}
	if (CURRENT_IDIOMS.test(content)) return "current";
	return null;
}
