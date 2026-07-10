/**
 * jsDepth — dapp-depth score for JS/TS repos (gist gap 1, phase 2).
 *
 * The question it answers: "is this REAL Stellar integration code — a wallet,
 * dapp, or SDK an agent can safely reference — or boilerplate that merely
 * imports the SDK?" Same architecture as the Rust codeDepth: baseline
 * hard-capped (being-a-JS-repo-with-the-SDK can never alone look deep),
 * substance from capability evidence, penalties for scaffold markers.
 *
 * CALIBRATED against the JS answer key in scripts/scan/depth-labels.ts
 * (JS_DEEP/JS_SHALLOW — mined from live products/SDKs vs official
 * templates/tutorials, adversarially verified 2026-07-09). Weights are
 * calibratable; the depth-eval gate enforces separation on every change.
 */
import {
	detectSdkCapabilities,
	extractJsSymbols,
	type SymbolBlob,
} from "./code-symbols";

export interface JsDepthInput {
	fullName: string;
	blobs: SymbolBlob[];
	/** package.json declares a stellar dependency (from code-signals facts). */
	stellarJsDep: string | null;
	scalars: {
		isFork: boolean;
		tagCount: number;
		readmeText: string | null;
		topics: string[];
		nameLooksTemplate: boolean;
	};
}

export interface JsDepthResult {
	jsDepth: number;
	capabilities: string[];
	jsSymbols: number;
	jsSloc: number;
	reasons: string[];
}

// Capability weights — core value-moving flows highest; presence-y ones low.
const CAP_WEIGHTS: Record<string, number> = {
	"tx-building": 0.13,
	signing: 0.13,
	"contract-invoke": 0.1,
	"soroban-rpc": 0.08,
	"sep10-auth": 0.08,
	"sep24-ramp": 0.08,
	"wallet-kit": 0.06,
	"wallet-provider": 0.06,
	passkey: 0.06,
	horizon: 0.05,
	"fee-bump": 0.04,
};

const JS_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/i;
const EXAMPLE_NAME =
	/\b(examples?|tutorial|template|boilerplate|starter|scaffold|workshop|bootcamp|demos?|playground|hello)\b/i;

// Horizon read-endpoint call builders. Read-heavy products (explorers,
// dashboards, wallets) hit MANY distinct endpoints; templates hit one or two
// (loadAccount + submitTransaction). Breadth of reads is substance the single
// "horizon" capability tag can't express.
const HORIZON_READ_RE =
	/\bserver\s*\.\s*(payments|operations|effects|trades|offers|orderbook|ledgers|transactions|accounts|assets|claimableBalances|liquidityPools|tradeAggregation|strictReceivePaths|strictSendPaths)\s*\(/g;

export function computeJsDepth(input: JsDepthInput): JsDepthResult {
	const reasons: string[] = [];
	const jsBlobs = input.blobs.filter((b) => b.text && JS_EXT.test(b.path));
	const jsSloc = jsBlobs.reduce(
		(n, b) =>
			n + (b.text ?? "").split("\n").filter((l) => l.trim().length > 0).length,
		0,
	);
	const capabilities = detectSdkCapabilities(input.blobs);
	const jsSymbols = extractJsSymbols(input.blobs).length;

	if (jsBlobs.length === 0) {
		return {
			jsDepth: 0,
			capabilities: [],
			jsSymbols: 0,
			jsSloc: 0,
			reasons: ["no-js-sources"],
		};
	}

	// (A) BASELINE — capped at 0.15: has JS sources + a declared stellar dep.
	const baseline = Math.min(0.15, 0.08 + (input.stellarJsDep ? 0.07 : 0));

	// (B) SUBSTANCE — capability evidence is the core: what the code DOES.
	const capScore = capabilities.reduce(
		(s, c) => s + (CAP_WEIGHTS[c] ?? 0.02),
		0,
	);
	// integration breadth bonus: tx-building AND signing together = a real
	// value-moving flow, the single strongest dapp signal.
	const realFlow =
		capabilities.includes("tx-building") && capabilities.includes("signing")
			? 0.1
			: 0;
	const slocCurve = 0.1 * Math.min(1, Math.log(1 + jsSloc) / Math.log(3001));
	const symbolCurve = 0.08 * Math.min(1, jsSymbols / 20);
	const testScore = input.blobs.some(
		(b) => /(^|\/)(tests?|__tests__|e2e)\//i.test(b.path) && b.text,
	)
		? 0.05
		: 0;
	// read breadth: ≥4 DISTINCT Horizon read endpoints = a read-heavy product
	// (explorer/dashboard/wallet). Templates call one or two. Blind-spot fix
	// (2026-07-10): stellarexplorer's substance is breadth of reads, which no
	// capability tag captured.
	const readEndpoints = new Set<string>();
	for (const b of jsBlobs)
		for (const m of (b.text ?? "").matchAll(HORIZON_READ_RE))
			readEndpoints.add(m[1]);
	const readBreadth = readEndpoints.size >= 4 ? 0.06 : 0;
	if (readBreadth) reasons.push(`read-breadth-${readEndpoints.size}`);
	// released maturity: ≥10 version tags = a maintained, shipped product.
	// Scaffolds and tutorials don't cut ten releases. Small on purpose —
	// maturity supports substance, it must never substitute for it.
	const maturityScore = (input.scalars.tagCount ?? 0) >= 10 ? 0.05 : 0;

	let raw = Math.min(
		1,
		baseline +
			capScore +
			realFlow +
			slocCurve +
			symbolCurve +
			testScore +
			readBreadth +
			maturityScore,
	);

	// (C) scaffold caps — mirrors the Rust example cap (immaturity-gated).
	const mature = (input.scalars.tagCount ?? 0) > 2;
	const name = input.fullName.slice(input.fullName.indexOf("/") + 1);
	if (
		!mature &&
		(EXAMPLE_NAME.test(name) ||
			input.scalars.nameLooksTemplate ||
			(input.scalars.topics ?? []).some((t) => EXAMPLE_NAME.test(t)))
	) {
		reasons.push("example-repo");
		raw = Math.min(raw, 0.4);
	}
	if (capabilities.length === 0) {
		// imports-only / UI-only: whatever else it has, no SDK interaction was
		// detected — cap at the old flat level so it can't outrank real flows.
		reasons.push("no-sdk-calls");
		raw = Math.min(raw, 0.3);
	}

	return {
		jsDepth: Number(raw.toFixed(3)),
		capabilities,
		jsSymbols,
		jsSloc,
		reasons,
	};
}
