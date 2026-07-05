/**
 * Soroban SDK version → protocol / support-status mapping — the ONE constant in
 * the Code-Truth Ledger that must never be wrong (safety-spec hard invariant).
 *
 * We store the RAW `soroban-sdk` version string as the sourced fact and derive
 * `versionStatus` (current / supported / deprecated / unknown) RELATIVE to the
 * then-latest protocol at scan time. We deliberately do NOT publish a bare
 * `sorobanProtocol` int as "definitive truth" — the sdk→protocol mapping is
 * dirtier than a neat table (backports to old majors, the P24↔23.0.3 Whisk
 * exception), and being wrong is worse than being absent.
 *
 * MAINTENANCE (safety-spec Decision 5): re-verify this table on EVERY protocol
 * release against the official docs. Bump `LATEST_PROTOCOL` + add the row.
 *   Docs: https://developers.stellar.org/docs/build/smart-contracts/getting-started
 *         https://github.com/stellar/rs-soroban-sdk/releases
 *         https://developers.stellar.org/docs/networks/software-versions
 *
 * As-of: 2026-07-04. If today is materially later than TABLE_ASOF and this file
 * is unchanged, treat `versionStatus` as advisory (the constant is stale) — the
 * scanner's CB6 sanity check exists for exactly this.
 */

export const TABLE_ASOF = "2026-07-04";

/** The latest GA protocol version as of TABLE_ASOF. Drives current/supported. */
export const LATEST_PROTOCOL = 26;

/**
 * soroban-sdk MAJOR version → the Stellar protocol it targets. Keyed by the sdk
 * MAJOR because patches/minors within a major stay on the same protocol (and old
 * majors receive backport patches — a fresh 22.0.11 is NOT deprecated by virtue
 * of the number being "low"). The documented irregularity: sdk 23.0.3 shipped
 * for Protocol 24 (Whisk); we encode majors, and 23.x spans P24→P25, so we lean
 * on the range below rather than a 1:1 int.
 *
 * Ordered oldest→newest. `supportedFloor` = the oldest major still considered
 * "supported" (not yet EOL). Anything below it → `deprecated`.
 */
export const SDK_MAJOR_PROTOCOL: ReadonlyArray<{ major: number; protocol: number }> = [
	{ major: 0, protocol: 20 }, // 0.x preview line (pre-1.0), Protocol 20 Soroban launch
	{ major: 1, protocol: 20 },
	{ major: 20, protocol: 20 },
	{ major: 21, protocol: 21 },
	{ major: 22, protocol: 22 },
	{ major: 23, protocol: 24 }, // 23.x spans P24 (Whisk, 23.0.3) → P25
	{ major: 24, protocol: 25 },
	{ major: 25, protocol: 25 },
	{ major: 26, protocol: 26 },
];

/** Oldest sdk major still "supported" (>= this → supported/current, < this → deprecated). */
export const SUPPORTED_FLOOR_MAJOR = 21;

export type VersionStatus = "current" | "supported" | "deprecated" | "unknown";

/**
 * Parse a raw Cargo dependency version requirement into a numeric MAJOR, or null
 * when it is not a pinned semver we can reason about (git deps, path deps,
 * wildcards, pre-release-only, workspace markers). Returning null is the SAFE
 * outcome — the caller maps null → "unknown", which never lowers a tier.
 *
 * Accepts: "22", "22.0", "22.0.3", "=22.0.3", "^22", "~22.0", ">=21, <23"
 *          (takes the FIRST concrete major it can read), "22.0.0-rc.3" → 22.
 * Rejects (→ null): "*", "", "workspace", "git", "path", anything with no digit.
 */
export function parseSdkMajor(raw: string | null | undefined): number | null {
	if (!raw) return null;
	const s = String(raw).trim().toLowerCase();
	if (!s || s === "*" || s === "workspace" || s === "git" || s === "path") return null;
	// Reject obvious non-version markers (a git url, a path).
	if (s.includes("://") || s.startsWith("/") || s.startsWith(".")) return null;
	// First run of digits, optionally dotted — the major is the first group.
	const m = s.match(/(\d+)(?:\.\d+){0,2}/);
	if (!m) return null;
	const major = Number(m[1]);
	return Number.isFinite(major) ? major : null;
}

/** True when the raw version string denotes a pre-release / rc / git / path dep. */
export function isPrereleaseOrUnpinned(raw: string | null | undefined): boolean {
	if (!raw) return true;
	const s = String(raw).trim().toLowerCase();
	if (!s || s === "*" || s === "workspace") return true;
	if (s.includes("://") || s.startsWith("/") || s.startsWith(".")) return true;
	if (/-(rc|alpha|beta|pre|dev)/.test(s)) return true;
	return false;
}

/**
 * Derive support status from a raw soroban-sdk version requirement.
 *
 * SAFETY: pre-release/git/path/unpinned/unparseable → "unknown" (NEVER
 * "deprecated"). "unknown" must never lower a tier. Only a cleanly-parsed major
 * that is BELOW the supported floor is "deprecated"; the newest major(s) are
 * "current"; the rest supported. `now`/`latest` are injectable for tests.
 */
export function versionStatusOf(
	raw: string | null | undefined,
	opts?: { latestProtocol?: number },
): VersionStatus {
	if (raw == null || raw === "") return "unknown";
	if (isPrereleaseOrUnpinned(raw)) return "unknown";
	const major = parseSdkMajor(raw);
	if (major == null) return "unknown";
	const latest = opts?.latestProtocol ?? LATEST_PROTOCOL;

	const row = SDK_MAJOR_PROTOCOL.find((r) => r.major === major);
	// A major we don't have a row for: if it's >= our newest known major, it's
	// newer-than-table → treat as "current" (a fresh SDK we haven't tabled yet),
	// never deprecated. If below the supported floor → deprecated. Else supported.
	const newestKnownMajor = SDK_MAJOR_PROTOCOL[SDK_MAJOR_PROTOCOL.length - 1].major;
	if (!row) {
		if (major >= newestKnownMajor) return "current";
		if (major < SUPPORTED_FLOOR_MAJOR) return "deprecated";
		return "supported";
	}
	if (major < SUPPORTED_FLOOR_MAJOR) return "deprecated";
	if (row.protocol >= latest) return "current";
	return "supported";
}
