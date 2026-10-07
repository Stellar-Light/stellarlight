/**
 * Depth routing — WHICH scorer reads a repo, decided by the sources that were
 * actually fetched rather than by the proof label alone.
 *
 * The defect (measured live 2026-09-14 over the 509 `lang-sdk` rows): the
 * scanner picked the reader from `stellarProof`, so a mislabelled repo went to
 * a reader that could not see its files and kept `computeCodeDepth`'s flat 0.3
 * forever — 63 of 71 Rust rows, 30 of 44 JavaScript, 19 of 25 TypeScript and
 * all 28 rows with no primaryLanguage sat at exactly 0.300. The labels are
 * wrong for banal reasons: `lang-sdk` is what the allowlist pin writes when a
 * canonical repo's primaryLanguage is empty at scan time, and what the
 * `rust-infra` marker fires for crates depending on stellar-xdr rather than
 * soroban-sdk.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * Read every language we actually fetched NON-TEST sources in, and take the
 * MAX — floored at the reading the label-driven path already produced, so a
 * re-route can only ADD a reading, never remove one.
 *
 * Why max and not a priority order: a fixed priority is wrong in both
 * directions and both are in the live corpus. Rust-first would hand
 * Soneso/stellar_flutter_sdk to the Rust reader — it carries proof=cargo-sdk
 * off 22 lines of vendored Rust while 16,959 lines of JVM source are its real
 * mass, exactly the vendored-sliver mistake the hybrid rule in
 * scan-repo-code.ts was written to stop. JS-first would strip a Soroban
 * contract repo that ships a large TS frontend of its contract reading, the
 * deepest true thing about it.
 *
 * Why floored, measured: without the floor, eight repos in a 180-repo sample
 * DROPPED — stellar/freighter-developer-docs 0.300 → 0.119,
 * OpenZeppelin/openzeppelin-monitor 0.300 → 0.272 — every one of them a repo
 * whose real mass is a language the fetcher brought back nothing for, re-read
 * on the handful of incidental files it did bring back. 0.3 is the honest "a
 * real proof we cannot read the depth of"; 0.119 off 21 lines of docs-site JS
 * is false precision, not a better answer.
 *
 * Why a non-Rust reading must match the Rust SLOC to count: that is the
 * existing hybrid-repo rule (`ld.langSloc > rsSloc`), kept so a pure-Rust repo
 * with an incidental deploy script is untouched.
 *
 * Why the JS reading may not lift a Rust-proof repo: measured, it inflates.
 * Allowing it moved 15 of 180 sampled repos up by as much as +0.454 —
 * kalepail/passkey-kit 0.659 → 1.000, Consulting-Manao/tansu 0.692 → 0.980 —
 * every one a Soroban contract repo re-graded on its dapp frontend. jsDepth's
 * scale is calibrated against JS products (depth-labels JS_DEEP/JS_SHALLOW),
 * not against contracts; mixing the two scales is a scorer-calibration change
 * with its own answer key, not a routing fix. Today's code never consults
 * jsDepth for a Rust proof, and neither does this.
 *
 * "Sources" means NON-TEST sources. Routing on raw ".rs present" would grade
 * stellar/rs-stellar-archivist on 4,830 lines of test code and
 * OpenZeppelin/openzeppelin-monitor on 6,635 — for both, every Rust line the
 * fetch returned. (That those repos got test files and no source at all is the
 * fetch-side half of this fix, in selectDepthPaths.)
 *
 * Pure and read-only: no fetches, no DB. The scanner and scan-report both go
 * through this one unit so the routing cannot drift between them.
 */
import { computeCodeDepth, type DepthInput, isTestPath } from "./code-depth";
import { computeJsDepth } from "./js-depth";
import { computeLangDepth } from "./lang-depth";

const RS_EXT = /\.rs$/i;
const JS_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
/** Matches the fetcher's LANG_EXT (fetch-repo-code.ts) — the only non-JS
 * languages the capability detector has idioms for (code-symbols.ts
 * LANG_FAMILIES: py, go, jvm). Dart and C are deliberately NOT here. Widening
 * the fetch alone buys nothing: run over 2,710 lines of Soneso/stellar_flutter_sdk
 * (transaction.dart + key_pair.dart), `detectSdkCapabilities` returns `[]`, and
 * computeLangDepth caps a zero-capability repo at 0.3 — exactly the value those
 * 22 Dart rows already hold. Dart/C support is a capability-table + answer-key
 * job, not a routing one. */
const LANG_EXT = /\.(py|go|kt|java)$/i;

const isRustProof = (p: DepthInput["proof"]) =>
	p === "cargo-sdk" || p === "contract-macros";

export interface DepthRouteInput {
	/** Exactly what computeCodeDepth takes — carries fullName, proof and blobs. */
	depth: DepthInput;
	/** package.json Stellar dependency (code-signals facts), for jsDepth. */
	stellarJsDep: string | null;
	nameLooksTemplate: boolean;
}

export interface DepthRouteResult {
	codeDepth: number;
	/** Which reading won. "label" = the label-driven reading stood. */
	route: "rust" | "js" | "lang" | "label";
	/** Every reading computed, null where that language had no sources.
	 * `label` is what the pre-routing scanner would have written — the floor. */
	readings: {
		label: number;
		rust: number | null;
		js: number | null;
		lang: number | null;
	};
	/** Non-test SLOC fetched per language — the mass gate's evidence. */
	sloc: { rust: number; js: number; lang: number };
}

function slocOf(blobs: DepthInput["blobs"], ext: RegExp): number {
	let n = 0;
	for (const b of blobs) {
		if (b.text == null || !ext.test(b.path) || isTestPath(b.path)) continue;
		n += b.text.split("\n").filter((l) => l.trim().length > 0).length;
	}
	return n;
}

export function routeCodeDepth(input: DepthRouteInput): DepthRouteResult {
	const { depth } = input;
	const sloc = {
		rust: slocOf(depth.blobs, RS_EXT),
		js: slocOf(depth.blobs, JS_EXT),
		lang: slocOf(depth.blobs, LANG_EXT),
	};
	const flat = computeCodeDepth(depth).codeDepth;
	const readings: DepthRouteResult["readings"] = {
		label: flat,
		rust: null,
		js: null,
		lang: null,
	};
	const scalars = {
		isFork: !!depth.scalars.isFork,
		tagCount: depth.scalars.tagCount ?? 0,
		readmeText: depth.scalars.readmeText ?? null,
		topics: depth.scalars.topics ?? [],
		nameLooksTemplate: input.nameLooksTemplate,
	};

	// The Rust reading. For a Rust proof `readings.label` already IS it; for any
	// other label computeCodeDepth returns the flat constant on the label alone,
	// so ask it again as a Rust repo. The proof field is used NOWHERE else in
	// computeCodeDepth (only in its two early-return guards), so this overrides
	// the label check and nothing more.
	if (isRustProof(depth.proof)) {
		readings.rust = flat;
	} else if (sloc.rust > 0) {
		readings.rust = computeCodeDepth({
			...depth,
			proof: "cargo-sdk",
		}).codeDepth;
	}
	if (sloc.js > 0) {
		const jd = computeJsDepth({
			fullName: depth.fullName,
			blobs: depth.blobs,
			stellarJsDep: input.stellarJsDep,
			scalars,
		});
		if (!jd.reasons.includes("no-js-sources")) readings.js = jd.jsDepth;
	}
	if (sloc.lang > 0) {
		const ld = computeLangDepth({
			fullName: depth.fullName,
			blobs: depth.blobs,
			scalars,
		});
		if (!ld.reasons.includes("no-lang-sources")) readings.lang = ld.langDepth;
	}

	// THE FLOOR — what the label-driven scanner wrote before this router, so a
	// re-route can only add a reading. For js-sdk/lang-sdk that is the calibrated
	// jsDepth/langDepth, NOT the flat 0.3: those scorers are calibrated to put
	// boilerplate at or below 0.3, and flooring them at the constant would undo
	// that (js-depth.ts, "real dapps rise above 0.3, boilerplate stays below").
	if (depth.proof === "js-sdk" && readings.js != null)
		readings.label = readings.js;
	else if (depth.proof === "lang-sdk" && readings.lang != null)
		readings.label = readings.lang;

	// `none` / `weak-mention` keep 0 however much source was fetched: depth is
	// STELLAR depth, and a repo we cannot prove is Stellar has none of it.
	// (computeCodeDepth already returns 0 for those — no reading may override it.)
	if (depth.proof === "none" || depth.proof === "weak-mention")
		return { codeDepth: flat, route: "label", readings, sloc };

	// Mass gate, from the hybrid-repo rule this replaces (`ld.langSloc > rsSloc`):
	// a non-Rust reading counts only when its language is at least as much of
	// what we fetched as the Rust is, so a repo whose real mass is Rust is never
	// re-graded on an incidental deploy script. Named readers are listed before
	// the floor so a tie reports WHICH reader produced the number.
	const candidates: Array<[DepthRouteResult["route"], number]> = [];
	if (readings.rust != null) candidates.push(["rust", readings.rust]);
	if (readings.js != null && sloc.js >= sloc.rust && !isRustProof(depth.proof))
		candidates.push(["js", readings.js]);
	if (readings.lang != null && sloc.lang >= sloc.rust)
		candidates.push(["lang", readings.lang]);
	candidates.push(["label", readings.label]);
	const best = candidates.reduce((a, b) => (b[1] > a[1] ? b : a));
	return { codeDepth: best[1], route: best[0], readings, sloc };
}
