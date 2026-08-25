/**
 * langDepth — integration-depth score for Python/Go/Kotlin/Java repos
 * (code-truth 4B). Same architecture and philosophy as jsDepth (which it
 * mirrors deliberately — see js-depth.ts): baseline hard-capped so
 * being-a-lang-repo-with-stellar-context can never alone look deep,
 * substance from capability evidence (the per-language idiom tables shipped
 * in slice A), penalties for scaffold markers.
 *
 * Replaces the flat 0.3 `lang-sdk` floor in the scanner when the repo has
 * actual sources in these languages. CALIBRATION status: deep-side anchored
 * on the four verified language flagships in scripts/scan/depth-labels.ts
 * (LANG_DEEP); shallow-side labels are added as real corpus repos are
 * verified — never guessed (answer-key discipline). The depth-eval gate
 * enforces the deep floor on every change.
 */
import { detectSdkCapabilities, type SymbolBlob } from "./code-symbols";

export interface LangDepthInput {
	fullName: string;
	blobs: SymbolBlob[];
	scalars: {
		isFork: boolean;
		tagCount: number;
		readmeText: string | null;
		topics: string[];
		nameLooksTemplate: boolean;
	};
}

export interface LangDepthResult {
	langDepth: number;
	capabilities: string[];
	langSloc: number;
	reasons: string[];
}

// Same weights as jsDepth — the semantics are per-capability, not
// per-language. Recalibrate independently if the eval ever demands it.
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

const LANG_EXT = /\.(py|go|kt|java)$/i;
const EXAMPLE_NAME =
	/\b(examples?|tutorial|template|boilerplate|starter|scaffold|workshop|bootcamp|demos?|playground|hello|quickstart)\b/i;
const STELLAR_CONTEXT =
	/stellar_sdk|github\.com\/stellar\/go|org\.stellar\.(sdk|anchor)|stellar\.sdk/;

export function computeLangDepth(input: LangDepthInput): LangDepthResult {
	const reasons: string[] = [];
	const langBlobs = input.blobs.filter((b) => b.text && LANG_EXT.test(b.path));
	const langSloc = langBlobs.reduce(
		(n, b) =>
			n + (b.text ?? "").split("\n").filter((l) => l.trim().length > 0).length,
		0,
	);
	if (langBlobs.length === 0) {
		return {
			langDepth: 0,
			capabilities: [],
			langSloc: 0,
			reasons: ["no-lang-sources"],
		};
	}
	const capabilities = detectSdkCapabilities(input.blobs);
	const hasContext = langBlobs.some((b) => STELLAR_CONTEXT.test(b.text ?? ""));

	// (A) BASELINE — capped at 0.15: has sources + stellar context in them.
	const baseline = Math.min(0.15, 0.08 + (hasContext ? 0.07 : 0));

	// (B) SUBSTANCE — capability evidence is the core: what the code DOES.
	const capScore = capabilities.reduce(
		(s, c) => s + (CAP_WEIGHTS[c] ?? 0.02),
		0,
	);
	const realFlow =
		capabilities.includes("tx-building") && capabilities.includes("signing")
			? 0.1
			: 0;
	const slocCurve = 0.1 * Math.min(1, Math.log(1 + langSloc) / Math.log(3001));
	const testScore = input.blobs.some(
		(b) =>
			/(^|\/)(tests?|__tests__|e2e)\/|_test\.(go|py)$|Tests?\.(kt|java)$/i.test(
				b.path,
			) && b.text,
	)
		? 0.05
		: 0;
	const maturityScore = (input.scalars.tagCount ?? 0) >= 10 ? 0.05 : 0;

	let raw = Math.min(
		1,
		baseline + capScore + realFlow + slocCurve + testScore + maturityScore,
	);

	// (C) scaffold caps — mirrors the JS example cap (immaturity-gated).
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
		// No stellar-idiom interaction detected: cap at the old flat level so
		// context-free lang repos can never outrank real integrations.
		reasons.push("no-sdk-calls");
		raw = Math.min(raw, 0.3);
	}

	return {
		langDepth: Number(raw.toFixed(3)),
		capabilities,
		langSloc,
		reasons,
	};
}
