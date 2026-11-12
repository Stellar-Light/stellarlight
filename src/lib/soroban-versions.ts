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
 * Staleness check: `versionTableStaleness()` below, run nightly by
 * scripts/check-sdk-table.ts (nightly-health.yml). Until 2026-11-12 this
 * comment promised a "CB6 sanity check" that no code implemented, and the
 * table sat at 2026-08-11 while soroban-sdk 28 and 29 shipped and mainnet
 * moved to Protocol 29.
 */

export const TABLE_ASOF = "2026-11-12";

/** The latest GA protocol version as of TABLE_ASOF. Drives current/supported.
 * Horizon mainnet root on 2026-11-12: current_protocol_version 29. */
export const LATEST_PROTOCOL = 29;

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
export const SDK_MAJOR_PROTOCOL: ReadonlyArray<{
	major: number;
	protocol: number;
}> = [
	{ major: 0, protocol: 20 }, // 0.x preview line (pre-1.0), Protocol 20 Soroban launch
	{ major: 1, protocol: 20 },
	{ major: 20, protocol: 20 },
	{ major: 21, protocol: 21 },
	{ major: 22, protocol: 22 },
	{ major: 23, protocol: 24 }, // 23.x spans P24 (Whisk, 23.0.3) → P25
	{ major: 24, protocol: 25 },
	{ major: 25, protocol: 25 },
	{ major: 26, protocol: 26 },
	// P27 live (verified 2026-08-11: Horizon root current_protocol_version: 27,
	// sdk v27.0.x released since 2026-07-21).
	{ major: 27, protocol: 27 },
	// v28.0.0 (2026-09-18) release notes: "This is a release supporting
	// Protocol 28". P28 reached mainnet 2026-09-16 (software-versions page).
	{ major: 28, protocol: 28 },
	// v29.0.0 (2026-10-07) moves to soroban-env 29.0.0, the Smart Contract Host
	// Environment the software-versions page lists for P29 (mainnet
	// 2026-10-01). P29 added no CAPs; that page still lists Rust SDK 28.0.0 as
	// the SDK for it. Use 29.0.1: 29.0.0 shipped the v28 wasmi runtime.
	{ major: 29, protocol: 29 },
];

/**
 * Oldest sdk major still "supported" (>= this → supported/current, < this →
 * deprecated). OUR floor, not the publisher's: the rs-soroban-sdk README
 * (since 2026-05-06) supports only "the two most recent soroban-sdk major
 * releases" with critical security fixes, 28 and 29 on 2026-11-12. Moving
 * this to the publisher's window is an owner decision (improvements/TODO.md).
 */
export const SUPPORTED_FLOOR_MAJOR = 21;

/** Protocol a given sdk MAJOR targets per the maintained table, or null when
 * the major isn't in the table — never guessed. ADVISORY by the same doctrine
 * as versionStatus: the mapping has documented irregularities (23.x spans
 * P24→P25), so consumers get "derived from the sdk major as of TABLE_ASOF",
 * not an attestation. */
export function protocolForSdkMajor(major: number | null): number | null {
	if (major === null) return null;
	return SDK_MAJOR_PROTOCOL.find((r) => r.major === major)?.protocol ?? null;
}

export const VERSION_STATUSES = [
	"current",
	"supported",
	"deprecated",
	"unknown",
] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

/** The SDK line behind a deprecated reading (see deprecatedBy). */
export const DEPRECATED_BY = ["soroban-sdk", "js-sdk", "both"] as const;

/**
 * The JavaScript SDK line — a SEPARATE major series from the Rust crate, and
 * the reason `versionStatus` read "unknown" on 5,356 of 10,876 scanned repos.
 *
 * Reusing the Rust classifier here is actively wrong: @stellar/stellar-sdk v17
 * is the CURRENT release, but 17 sits below SUPPORTED_FLOOR_MAJOR (21) in the
 * Rust table, so the newest JS SDK in the ecosystem would have been stamped
 * "deprecated". Hence its own table.
 *
 * Sourced 2026-09-07 from the npm registry, not inferred:
 *   dist-tags  latest=17.0.1, lts-16=16.3.0, p27=16.0.0-rc.2
 *   v17 2026-08-20 · v16 2026-06-15 · v15 2026-03-30 · v14 2025-08-14
 *   v13 2024-11-14 · v12 2024-05-02 · v11 2023-12-07
 * Re-read 2026-11-12: latest=17.4.0, lts-16=16.4.1, rc=17.0.0-rc.2; no v18.
 *   The js-stellar-sdk README supports v17 and v16 ("through March 2027").
 *
 * MAINTENANCE: re-verify against `npm view @stellar/stellar-sdk dist-tags`.
 */
export const JS_SDK_ASOF = "2026-11-12";

/** dist-tags.latest major at JS_SDK_ASOF. */
export const JS_SDK_LATEST_MAJOR = 17;

/**
 * Oldest JS SDK major we still call supported. The publisher's own oldest
 * maintained tag is `lts-16`, which would put the floor at 16 and stamp 1,430
 * repos deprecated in one step. We sit two majors below that instead: the same
 * conservatism the Rust table is built on ("being wrong is worse than being
 * absent"), so only majors from the Protocol-22 era and earlier — last
 * published 2025-04-21 — are called deprecated.
 */
export const JS_SDK_SUPPORTED_FLOOR_MAJOR = 14;

/**
 * Packages npm itself serves with a `deprecated` field set by the publisher.
 * Not our judgement — the maintainers' own words:
 *   stellar-sdk            "This package has moved to @stellar/stellar-sdk!"
 *   @stellar/stellar-base  "now rolled into @stellar/stellar-sdk"
 *   soroban-client         "now deprecated: transition to @stellar/stellar-sdk"
 *                          (added 2026-11-12 from `npm view soroban-client
 *                          deprecated`; 8 scanned repos depend on it)
 * 681 and 39 indexed repos respectively still depend on the first two.
 */
export const PUBLISHER_DEPRECATED_JS_PACKAGES: ReadonlySet<string> = new Set([
	"stellar-sdk",
	"@stellar/stellar-base",
	"soroban-client",
]);

/** detectStellarProof's lang-sdk markers read "python:requirements.txt";
 * an npm dependency always holds an @ (an alias "npm:@stellar/..." too). */
export const isLangMarker = (s: string | null | undefined): boolean =>
	!!s && /^[a-z][a-z-]*:[^@]+$/.test(s);

/** The stored `stellarJsDep` when it names an npm package, else null. The
 * scanner also stores those markers in that field ("rust-infra:cargo.toml",
 * "go:go.mod"; 343 scanned repos on 2026-11-12), which must not be served as
 * a JavaScript dependency. */
export function npmStellarDep(dep: string | null | undefined): string | null {
	return dep && !isLangMarker(dep) ? dep : null;
}

/** Split a stored `stellarJsDep` ("@stellar/stellar-sdk@^17.0.1") into its parts. */
export function splitJsDep(
	dep: string | null | undefined,
): { name: string; range: string } | null {
	if (!dep) return null;
	const i = dep.lastIndexOf("@");
	if (i <= 0) return { name: dep, range: "" };
	return { name: dep.slice(0, i), range: dep.slice(i + 1) };
}

/**
 * Support status of a JS Stellar dependency, or "unknown" when we cannot read
 * it. Same safety doctrine as versionStatusOf: unparseable, unpinned or
 * unrecognised NEVER yields "deprecated".
 *
 * Non-npm sentinels the scanner also stores in this field
 * ("rust-infra:cargo.toml", "go:go.mod", "python:requirements.txt") are not JS
 * deps and return "unknown".
 */
export function jsSdkVersionStatusOf(
	dep: string | null | undefined,
): VersionStatus {
	const parts = splitJsDep(dep);
	if (!parts) return "unknown";
	const { name, range } = parts;
	// A publisher-deprecated package is deprecated at ANY version.
	if (PUBLISHER_DEPRECATED_JS_PACKAGES.has(name)) return "deprecated";
	if (name !== "@stellar/stellar-sdk") return "unknown"; // only this line is tabled
	if (isPrereleaseOrUnpinned(range)) return "unknown";
	const m = /^[\^~>=<\s]*(\d+)\./.exec(range);
	if (!m) return "unknown";
	const major = Number(m[1]);
	if (!Number.isFinite(major)) return "unknown";
	if (major < JS_SDK_SUPPORTED_FLOOR_MAJOR) return "deprecated";
	if (major >= JS_SDK_LATEST_MAJOR) return "current";
	return "supported";
}

/**
 * The repo's overall SDK support status. The Rust crate is the stronger signal
 * (a Soroban contract's own SDK) and wins when it says anything; the JS dep
 * fills in the scanned repos that carry no Cargo.toml. A "deprecated" reading
 * from either is kept: a stale pin is a stale pin. So "deprecated" here is
 * NOT a soroban-sdk claim: `deprecatedBy()` names the line behind it.
 */
export function combinedVersionStatus(
	sorobanSdkVersion: string | null | undefined,
	stellarJsDep: string | null | undefined,
): VersionStatus {
	const rust = versionStatusOf(sorobanSdkVersion);
	const js = jsSdkVersionStatusOf(stellarJsDep);
	if (rust !== "unknown" && js !== "unknown")
		return rust === "deprecated" || js === "deprecated" ? "deprecated" : rust;
	return rust !== "unknown" ? rust : js;
}

/** Which SDK line makes a repo's combined status "deprecated", or null when
 * neither does. Non-null exactly when combinedVersionStatus() is
 * "deprecated", because "unknown" is never deprecated on either side. */
export function deprecatedBy(
	sorobanSdkVersion: string | null | undefined,
	stellarJsDep: string | null | undefined,
): (typeof DEPRECATED_BY)[number] | null {
	const rust = versionStatusOf(sorobanSdkVersion) === "deprecated";
	const js = jsSdkVersionStatusOf(stellarJsDep) === "deprecated";
	if (rust && js) return "both";
	if (rust) return "soroban-sdk";
	return js ? "js-sdk" : null;
}

/** The three upstream readings from their raw answers (crates.io crate,
 * Horizon root, npm dist-tags), or null when any is not a released version:
 * an unparsed field would compare as "not ahead" and read as current, and an
 * error text holding "503" would read as major 503. */
export function upstreamVersions(
	crate: unknown,
	horizon: unknown,
	distTags: unknown,
): {
	sorobanSdkMaxStable: string;
	networkProtocol: number;
	jsSdkLatest: string;
} | null {
	const SEMVER = /^\d+\.\d+\.\d+$/;
	// biome-ignore lint/suspicious/noExplicitAny: untyped upstream JSON
	const sdk = (crate as any)?.crate?.max_stable_version;
	// biome-ignore lint/suspicious/noExplicitAny: untyped upstream JSON
	const protocol = (horizon as any)?.current_protocol_version;
	// biome-ignore lint/suspicious/noExplicitAny: untyped upstream JSON
	const js = (distTags as any)?.latest;
	if (typeof sdk !== "string" || !SEMVER.test(sdk)) return null;
	if (typeof js !== "string" || !SEMVER.test(js)) return null;
	if (!Number.isInteger(protocol) || protocol < 1) return null;
	return {
		sorobanSdkMaxStable: sdk,
		networkProtocol: protocol,
		jsSdkLatest: js,
	};
}

/**
 * What upstream has shipped that this table does not know yet: one line per
 * gap, [] when the table is current. Inputs are read by
 * scripts/check-sdk-table.ts from crates.io (soroban-sdk max_stable_version),
 * the Horizon mainnet root (current_protocol_version) and npm
 * (@stellar/stellar-sdk dist-tags.latest). `table` is injectable for tests.
 */
export function versionTableStaleness(
	upstream: {
		sorobanSdkMaxStable: string;
		networkProtocol: number;
		jsSdkLatest: string;
	},
	table = {
		newestSdkMajor: SDK_MAJOR_PROTOCOL[SDK_MAJOR_PROTOCOL.length - 1].major,
		latestProtocol: LATEST_PROTOCOL,
		jsLatestMajor: JS_SDK_LATEST_MAJOR,
	},
): string[] {
	const out: string[] = [];
	const rust = parseSdkMajor(upstream.sorobanSdkMaxStable);
	if (rust !== null && rust > table.newestSdkMajor)
		out.push(
			`soroban-sdk ${upstream.sorobanSdkMaxStable} is out; SDK_MAJOR_PROTOCOL stops at major ${table.newestSdkMajor}.`,
		);
	if (upstream.networkProtocol > table.latestProtocol)
		out.push(
			`mainnet runs protocol ${upstream.networkProtocol}; LATEST_PROTOCOL is ${table.latestProtocol}.`,
		);
	const js = parseSdkMajor(upstream.jsSdkLatest);
	if (js !== null && js > table.jsLatestMajor)
		out.push(
			`@stellar/stellar-sdk ${upstream.jsSdkLatest} is latest; JS_SDK_LATEST_MAJOR is ${table.jsLatestMajor}.`,
		);
	return out;
}

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
	if (!s || s === "*" || s === "workspace" || s === "git" || s === "path")
		return null;
	// Reject obvious non-version markers (a git url, a path).
	if (s.includes("://") || s.startsWith("/") || s.startsWith(".")) return null;
	// First run of digits, optionally dotted — the major is the first group.
	const m = s.match(/(\d+)(?:\.\d+){0,2}/);
	if (!m) return null;
	const major = Number(m[1]);
	return Number.isFinite(major) ? major : null;
}

/** True when the raw version string denotes a pre-release / rc / git / path dep. */
export function isPrereleaseOrUnpinned(
	raw: string | null | undefined,
): boolean {
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
	const newestKnownMajor =
		SDK_MAJOR_PROTOCOL[SDK_MAJOR_PROTOCOL.length - 1].major;
	if (!row) {
		if (major >= newestKnownMajor) return "current";
		if (major < SUPPORTED_FLOOR_MAJOR) return "deprecated";
		return "supported";
	}
	if (major < SUPPORTED_FLOOR_MAJOR) return "deprecated";
	if (row.protocol >= latest) return "current";
	return "supported";
}
