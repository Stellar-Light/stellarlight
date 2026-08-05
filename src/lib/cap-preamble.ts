/**
 * Parse the structured preamble every CAP carries (a fenced `Key: Value` block
 * at the top of core/cap-*.md in stellar/stellar-protocol):
 *
 *   CAP: 0063
 *   Title: ...
 *   Status: Final
 *   Protocol version: 23
 *
 * These two fields are the code-truth crosswalk keys: Status says whether the
 * CAP is real ("Final"/"Implemented" vs "Draft"/"Rejected"), Protocol version
 * says WHICH protocol shipped it — the join point to soroban-sdk versions.
 * Null when a field is absent or unparseable — never guessed (some CAPs are
 * drafts with `Protocol version: TBD`).
 */
export interface CapPreamble {
	status: string | null;
	protocolVersion: number | null;
}

export function parseCapPreamble(md: string): CapPreamble {
	// Only read the head of the doc — the preamble is always first; a
	// `Status:` deep in prose must not match.
	const head = md.slice(0, 2500);
	const status = head.match(/^Status:\s*(.+?)\s*$/m)?.[1] ?? null;
	const pvRaw = head.match(/^Protocol version:\s*(.+?)\s*$/m)?.[1] ?? null;
	const pv = pvRaw && /^\d+$/.test(pvRaw) ? Number(pvRaw) : null;
	return { status, protocolVersion: pv };
}
