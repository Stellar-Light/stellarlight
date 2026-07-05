/**
 * The EXACT field set the signals-only scanner may write, derived purely from
 * a scan result. This is the write-path safety gate, unit-tested:
 *
 *  - a non-ok outcome persists ONLY scan-state fields — a failed/partial scan
 *    must never record a proof/depth judgment (especially not proof "none",
 *    which downstream consumers treat as "confidently not Stellar");
 *  - NO tier / unverifiedStellar / audit-tier / repoScore fields, ever — v1 is
 *    signals-only, so demotion risk is zero BY CONSTRUCTION, not by review.
 *
 * scan-repo-code.ts must build its update payload exclusively through
 * signalsToWrite() (CI-asserted), so the gate cannot be bypassed silently.
 */
import type { CodeFacts, ScanOutcome, StellarProof } from "../../src/lib/code-signals";

export interface SignalsInput {
	outcome: ScanOutcome;
	scanNote: string | null;
	proof: StellarProof;
	facts: CodeFacts;
	codeDepth: number; // computeCodeDepth(...).codeDepth
	farmScore: number;
	farmFlags: string[];
}

/** Fields the scanner is FORBIDDEN to write — demotion/authority surfaces. */
export const FORBIDDEN_WRITE_KEYS = [
	"tier",
	"unverifiedStellar",
	"priorTier",
	"tierReason",
	"tierChangedAt",
	"tierRunId",
	"priorUnverified",
	"unverifiedRunId",
	"repoScore", // enrich-repos owns score recomputation (single grade path, no drift)
	"repoScoreLabel",
] as const;

export function signalsToWrite(s: SignalsInput, nowIso: string): Record<string, unknown> {
	if (s.outcome !== "ok") {
		// Could not conclude → record ONLY that we tried and why it failed, so
		// the repo is retried later and never judged from a broken read.
		return {
			codeScanState: s.outcome, // "error" | "incomplete"
			codeScanNote: s.scanNote,
			codeScannedAt: nowIso,
		};
	}
	return {
		stellarProof: s.proof,
		codeDepth: s.codeDepth,
		sorobanSdkVersion: s.facts.sorobanSdkVersion,
		versionStatus: s.facts.versionStatus,
		contractMacroCount: s.facts.contractMacroCount,
		isDeployableContract: s.facts.isDeployableContract,
		hasAuthPatterns: s.facts.hasAuthPatterns,
		hasStoragePatterns: s.facts.hasStoragePatterns,
		hasEvents: s.facts.hasEvents,
		usesNoStd: s.facts.usesNoStd,
		stellarJsDep: s.facts.stellarJsDep,
		farmScore: s.farmScore,
		farmFlags: s.farmFlags,
		codeScanState: "scanned",
		codeScanNote: s.scanNote,
		codeScannedAt: nowIso,
	};
}

/** Fetch blew up before any scan result existed (network, no tree, throw). */
export function errorToWrite(message: string, nowIso: string): Record<string, unknown> {
	return {
		codeScanState: "error",
		codeScanError: message.slice(0, 200),
		codeScannedAt: nowIso,
	};
}
