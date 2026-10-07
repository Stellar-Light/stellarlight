/**
 * Nightly detectors → committed ledger artifacts.
 *
 * The improvement ledger ingests only committed artifacts (pure repo-file
 * read). The nightly detectors used to file a GitHub issue and vanish — the
 * sdkCapabilities hole (lessons/2026-08-12) had no ledger row because this
 * layer never fed the spine. Each detector now writes
 * `improvements/engine/nightly/<detector>-latest.json` when FINDINGS_DIR is
 * set (the nightly-health workflow sets it; local runs stay side-effect-free).
 *
 * An EMPTY failures array is a real signal — "ran and found nothing" is what
 * lets the feeder auto-clear a previously open finding. Detectors must write
 * on clean runs and on outage exits alike (a missing/stale artifact is
 * indistinguishable from a quiet pass — the stale-evidence trap).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface NightlyFailure {
	/** stable human probe string — the ledger's dedupe key input */
	probe: string;
	note?: string;
	/** ledger surface override (validated by the feeder; defaults per-source) */
	surface?: string;
	/** knownFailing-marked probes land as low severity instead of high */
	known?: boolean;
}

export function writeNightlyFindings(
	detector: string,
	failures: NightlyFailure[],
): void {
	const dir = process.env.FINDINGS_DIR;
	if (!dir) return;
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, `${detector}-latest.json`),
		`${JSON.stringify({ generatedAt: new Date().toISOString(), detector, failures }, null, "\t")}\n`,
	);
}
