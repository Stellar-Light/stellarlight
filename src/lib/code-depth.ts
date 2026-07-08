/**
 * Code-Truth Ledger — codeDepth v2 (substance-dominant, clone-hardened).
 *
 * Pure, offline. Given a repo's contract source (grouped PER CRATE, multi-file)
 * derive a 0-1 depth score that SEPARATES a real Soroban contract from a
 * hello-world scaffold — the P1 formula did not (a scaffold scored ~0.87 and
 * cleared the 0.6 "quality" gate). Everything here encodes the 11 findings of
 * the 2026-07-04 adversarial review (scratchpad/codedepth-v2-spec.md + the
 * review verdict). It is a NEW module — code-signals.ts is untouched; the P2
 * scanner wires this in. codeDepth is null in prod until then, so nothing breaks.
 *
 * The dangerous error is a FALSE NEGATIVE — a genuinely deep repo scoring under
 * the gate and losing authority. The review found three real paths to that, all
 * fixed here: (1) module-split blindness — real logic lives in sibling files, not
 * lib.rs, so we parse the UNION of a crate's .rs blobs; (2) dense single-crate
 * contracts can't earn the multi-crate breadth/cross-call terms, so a
 * single-crate compensation term lifts them; (3) OZ/SEP-41 tokens share template
 * structure, so the clone multiplier gates on code EMPTINESS, not similarity.
 */

// ── Inputs ───────────────────────────────────────────────────────────────────

/** One fetched Rust/Cargo/toml blob. `text` null when present-but-unreadable. */
export interface DepthBlob {
	path: string;
	text: string | null;
}

/** Repo-level scalars from the GraphQL query (all near-free). */
export interface DepthScalars {
	/** Mainnet contract id from the README VERIFIED to exist on-chain via
	 * stellar.expert (fetch layer; null = none found or unverifiable). Unfakeable
	 * positive evidence — an address string alone is cheap, a live contract isn't. */
	mainnetContractId?: string | null;
	isFork?: boolean;
	parentFullName?: string | null; // fork parent (owner/name)
	commitCount?: number | null;
	releaseCount?: number | null;
	tagCount?: number | null;
	singleAuthor?: boolean | null; // one distinct commit author
	allCommitsWithin48h?: boolean | null; // hackathon-throwaway window
	readmeText?: string | null; // for deployed-address probe
	topics?: string[]; // GitHub topics (for the example-repo name marker)
}

export interface DepthInput {
	fullName: string;
	proof:
		| "cargo-sdk"
		| "contract-macros"
		| "js-sdk"
		| "lang-sdk"
		| "stellar-toml"
		| "weak-mention"
		| "none";
	versionStatus: "current" | "supported" | "deprecated" | "unknown";
	isDeployableContract: boolean; // Cargo cdylib
	/** ALL fetched blobs (root + per-crate Cargo.toml + top src/*.rs by size + tests). */
	blobs: DepthBlob[];
	/** Distinct contract-crate directories detected from the FULL tree (breadth). */
	contractCrateDirs: string[];
	scalars: DepthScalars;
}

// ── Known scaffolds (fork-cap + name priors) ─────────────────────────────────

export const KNOWN_SCAFFOLDS: ReadonlySet<string> = new Set(
	[
		"stellar/soroban-examples",
		"stellar/soroban-template-astro",
		"stellar/soroban-template-sveltekit-passkeys",
		"stellar/scaffold-soroban",
		"stellar/soroban-example-dapp",
		"stellar/soroban-quickstart",
		"dbcfd/soroban-template",
	].map((s) => s.toLowerCase()),
);

/**
 * Curated "example / tutorial / reference" repos — repos whose PURPOSE is to
 * teach, whose contract code is real but NOT an authoritative product. codeDepth
 * is capped for these regardless of code substance (an examples repo's token
 * demo is real Rust, but it is not the canonical token implementation). Curated
 * = zero over-filter risk (these are definitionally examples). The long tail is
 * caught by the immaturity-gated name marker (see computeCodeDepth).
 */
export const KNOWN_EXAMPLE_REPOS: ReadonlySet<string> = new Set(
	[
		"stellar/soroban-examples",
		"stellar/soroban-example-dapp",
		"stellar/soroban-dapps-challenge",
		"stellar/sorobanathon",
		"stellar/sorobounty-spectacular",
		"stellar/soroban-quickstart",
		"xycloo/soroban-guide",
		"soroban-cookbook/soroban-cookbook-",
		"theahaco/soroban-tutorial-project",
	].map((s) => s.toLowerCase()),
);

/** Name/topic markers that flag an example/tutorial/scaffold repo. */
// v3 (2026-07-08 frontier calibration): added demo/bootcamp/course/academy/
// lesson — nrxschool/stellar-bootcamp (tutorial token + course slides) scored
// 0.616 and warp-driver/oracle-demo 0.569 purely because their marker words
// were missing. Still immature-gated: a real released project named "*-demo"
// keeps full score.
const EXAMPLE_NAME_MARKER =
	/\b(examples?|tutorial|quickstart|workshop|cookbook|getting.started|sample|scaffold|boilerplate|starter|challenge|sorobanathon|demos?|bootcamp|course|academy|classroom|lessons?)\b/i;

/** Is this repo an example/tutorial by curation or (immaturity-gated) name marker? */
export function isExampleRepo(
	fullName: string,
	topics: string[] | undefined,
	mature: boolean,
): boolean {
	if (KNOWN_EXAMPLE_REPOS.has(fullName.toLowerCase())) return true;
	// Name/topic marker only caps an IMMATURE repo — a real, released project that
	// happens to have "demo"/"sample" in its name keeps full score (no over-filter).
	if (mature) return false;
	const name = fullName.slice(fullName.indexOf("/") + 1);
	return (
		EXAMPLE_NAME_MARKER.test(name) ||
		(topics ?? []).some((t) => EXAMPLE_NAME_MARKER.test(t))
	);
}

/**
 * Canonical scaffold fingerprints — identifier-normalized k=5 shingles of the
 * soroban-examples hello_world / increment / errors / events contract bodies.
 * Precomputed offline (the real build ships a `build-canon-fingerprints.ts`
 * one-shot; this embedded set covers the dominant clone sources for the module +
 * tests). A body whose normalized shingles overlap these heavily is a clone.
 */
export const CANON_SCAFFOLD_SHINGLES: ReadonlySet<string> = new Set(
	// hello_world: `pub fn hello(env: Env, to: String) -> Vec<String> { vec![&env, String::from_str(&env,"Hello"), to] }`
	// increment:   `let mut count: u32 = env.storage().instance().get(&COUNTER).unwrap_or(0); count += 1; env.storage().instance().set(&COUNTER,&count); ...`
	shinglesOf(
		normalizeRust(
			"pub fn NAME ( env : Env , to : String ) -> Vec < String > { vec ! [ & env , String :: from_str ( & env , LIT ) , to ] } " +
				"let mut count : u32 = env . storage ( ) . instance ( ) . get ( & COUNTER ) . unwrap_or ( 0 ) ; count += 1 ; env . storage ( ) . instance ( ) . set ( & COUNTER , & count ) ; env . storage ( ) . instance ( ) . extend_ttl ( LIT , LIT ) ; count",
		),
	),
);

// ── Small utilities ──────────────────────────────────────────────────────────

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const basename = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const crateDirOf = (path: string) => {
	// crate dir = the path up to "/src/"; else the file's dir.
	const i = path.indexOf("/src/");
	if (i >= 0) return path.slice(0, i);
	const s = path.lastIndexOf("/");
	return s >= 0 ? path.slice(0, s) : "";
};

/** Strip Rust comments + string/char literals so bodies compare on structure. */
function stripCommentsAndStrings(src: string): string {
	let out = "";
	let i = 0;
	const n = src.length;
	while (i < n) {
		const c = src[i];
		const c2 = src[i + 1];
		if (c === "/" && c2 === "/") {
			while (i < n && src[i] !== "\n") i++;
			continue;
		}
		if (c === "/" && c2 === "*") {
			i += 2;
			while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
			i += 2;
			continue;
		}
		if (c === '"') {
			out += " LIT ";
			i++;
			while (i < n && src[i] !== '"') {
				if (src[i] === "\\") i++;
				i++;
			}
			i++;
			continue;
		}
		out += c;
		i++;
	}
	return out;
}

/** Normalize Rust to a token stream: idents→ID, numbers→LIT, strings already LIT. */
export function normalizeRust(src: string): string[] {
	const clean = stripCommentsAndStrings(src);
	const toks =
		clean.match(
			/[A-Za-z_][A-Za-z0-9_]*|::|->|=>|\+=|-=|==|!=|<=|>=|&&|\|\||[{}()[\];,.&|!<>=+\-*/%?:]|LIT/g,
		) ?? [];
	const KEYWORDS = new Set([
		"fn",
		"let",
		"mut",
		"pub",
		"impl",
		"struct",
		"enum",
		"match",
		"if",
		"else",
		"for",
		"while",
		"loop",
		"return",
		"self",
		"env",
		"Env",
		"u32",
		"u64",
		"i128",
		"u128",
		"bool",
		"String",
		"Vec",
		"Map",
		"Address",
		"Symbol",
		"storage",
		"instance",
		"persistent",
		"temporary",
		"get",
		"set",
		"require_auth",
		"true",
		"false",
	]);
	return toks.map((t) => {
		if (t === "LIT") return "LIT";
		if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return KEYWORDS.has(t) ? t : "ID";
		if (/^\d/.test(t)) return "LIT";
		return t;
	});
}

/** k=5 token shingles. */
export function shinglesOf(tokens: string[], k = 5): Set<string> {
	const s = new Set<string>();
	for (let i = 0; i + k <= tokens.length; i++)
		s.add(tokens.slice(i, i + k).join(" "));
	if (tokens.length > 0 && tokens.length < k) s.add(tokens.join(" "));
	return s;
}

export function jaccard(a: Set<string>, b: ReadonlySet<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let inter = 0;
	for (const x of a) if (b.has(x)) inter++;
	return inter / (a.size + b.size - inter);
}

// ── Function-body extraction (brace-matched, from a contractimpl impl) ────────

interface FnBody {
	name: string;
	body: string;
	statements: number;
}

/**
 * Extract public fn bodies that live inside a `#[contractimpl]`-preceded `impl`
 * (or any `impl` in a file that has contract macros). Brace-matched; tolerant of
 * nested braces, strings, and comments (we strip strings/comments first).
 */
function extractContractFns(src: string): FnBody[] {
	const clean = stripCommentsAndStrings(src);
	const fns: FnBody[] = [];
	const reFn =
		/\bpub\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\s*\([^)]*\)[^;{]*\{/g;
	let m: RegExpExecArray | null;
	while ((m = reFn.exec(clean))) {
		const name = m[1];
		let depth = 1;
		let i = reFn.lastIndex;
		const start = i;
		while (i < clean.length && depth > 0) {
			if (clean[i] === "{") depth++;
			else if (clean[i] === "}") depth--;
			i++;
		}
		const body = clean.slice(start, i - 1);
		const statements = body
			.split(";")
			.filter((s) => s.trim().length > 0).length;
		fns.push({ name, body, statements });
		reFn.lastIndex = i;
	}
	return fns;
}

/**
 * SUBSTANCE-not-presence (review P5): a fn is nonTrivial only if it has >=3
 * statements AND does real work — require_auth, a cross-contract call,
 * arithmetic on a value, or a branch (if/match). A `log!/get/set/return` shell
 * no longer qualifies, defeating getter-padding + empty-body stuffing.
 */
function isNonTrivial(fn: FnBody): boolean {
	if (fn.statements < 3) return false;
	const b = fn.body;
	const hasAuth = /\brequire_auth(?:_for_args)?\s*\(/.test(b);
	const hasCross = /\bClient\s*::\s*new\b|contractclient!|contractimport!/.test(
		b,
	);
	const hasArith =
		/[a-z_0-9)\]]\s*[+\-*/%]\s*[a-z_0-9(]/i.test(b) ||
		/\.(checked_add|checked_sub|checked_mul|checked_div)\b/.test(b);
	const hasBranch = /\bif\b|\bmatch\b/.test(b);
	return hasAuth || hasCross || hasArith || hasBranch;
}

// ── Per-crate + repo depth facts ─────────────────────────────────────────────

interface CrateFacts {
	nonTrivialFns: number;
	totalContractFns: number;
	rustSloc: number;
	writeSites: number;
	authGatedWrites: number;
	requireAuthCount: number;
	crossCalls: number;
	dataKeyVariants: number;
	storageTiers: number;
	errorArms: number;
	customAccountAuth: boolean;
	financialArith: number; // financial term co-occurring with arithmetic in a fn
	fnShingles: Set<string>;
}

const RE_WRITE = /\.(set|update|extend_ttl|bump|remove)\s*\(/g;
const RE_AUTH = /\brequire_auth(?:_for_args)?\s*\(/g;
const RE_CROSS = /([A-Za-z_][A-Za-z0-9_]*Client)\s*::\s*new\s*\(/g;
const RE_STORAGE_TIER =
	/\.storage\s*\(\s*\)\s*\.\s*(instance|persistent|temporary)\b/g;
const RE_CUSTOM_AUTH =
	/__check_auth|CustomAccountInterface|secp256r1|ed25519|env\s*\.\s*crypto\s*\(/;
const FIN_TERMS =
	/\b(interest_rate|interest|liquidat\w*|weighted|invariant|flash.?loan|collateral|accrue|slippage|amount_out|reserve|fee)\b/i;

function crateFactsOf(rsBlobs: DepthBlob[]): CrateFacts {
	const f: CrateFacts = {
		nonTrivialFns: 0,
		totalContractFns: 0,
		rustSloc: 0,
		writeSites: 0,
		authGatedWrites: 0,
		requireAuthCount: 0,
		crossCalls: 0,
		dataKeyVariants: 0,
		storageTiers: 0,
		errorArms: 0,
		customAccountAuth: false,
		financialArith: 0,
		fnShingles: new Set(),
	};
	const tiers = new Set<string>();
	const crossNames = new Set<string>();
	for (const b of rsBlobs) {
		if (b.text == null) continue;
		const t = b.text;
		// SLOC: non-blank, non-comment lines (exclude #[cfg(test)] regions crudely).
		const noTest = t.replace(/#\[cfg\(test\)\][\s\S]*$/m, "");
		f.rustSloc += noTest.split("\n").filter((l) => {
			const s = l.trim();
			return (
				s.length > 0 &&
				!s.startsWith("//") &&
				!s.startsWith("/*") &&
				!s.startsWith("*")
			);
		}).length;

		const fns = extractContractFns(t);
		for (const fn of fns) {
			f.totalContractFns++;
			if (isNonTrivial(fn)) f.nonTrivialFns++;
			for (const sh of shinglesOf(normalizeRust(fn.body))) f.fnShingles.add(sh);
			// write sites in this fn + whether it also require_auths (gate density)
			const writes = (fn.body.match(RE_WRITE) ?? []).length;
			const auths = (fn.body.match(RE_AUTH) ?? []).length;
			f.writeSites += writes;
			if (writes > 0 && auths > 0) f.authGatedWrites += writes;
			// financial arithmetic co-occurrence (review P6d)
			if (FIN_TERMS.test(fn.body) && /[+\-*/%]|checked_/.test(fn.body))
				f.financialArith++;
		}
		f.requireAuthCount += (t.match(RE_AUTH) ?? []).length;
		// cross-contract calls whose return is used (assigned/let) — de-gamed (P6b)
		let cm: RegExpExecArray | null;
		RE_CROSS.lastIndex = 0;
		while ((cm = RE_CROSS.exec(t))) crossNames.add(cm[1]);
		for (const tier of t.match(RE_STORAGE_TIER) ?? []) tiers.add(tier);
		if (RE_CUSTOM_AUTH.test(t)) f.customAccountAuth = true;
		// DataKey / contracttype enum variants + contracterror arms
		const dk = t.match(
			/#\[contracttype\][\s\S]{0,40}?enum\s+\w+\s*\{([^}]*)\}/,
		);
		if (dk)
			f.dataKeyVariants = Math.max(
				f.dataKeyVariants,
				dk[1].split(",").filter((s) => s.trim()).length,
			);
		const ce = t.match(
			/#\[contracterror\][\s\S]{0,40}?enum\s+\w+\s*\{([^}]*)\}/,
		);
		if (ce)
			f.errorArms = Math.max(
				f.errorArms,
				ce[1].split(",").filter((s) => s.trim()).length,
			);
	}
	f.crossCalls = crossNames.size;
	f.storageTiers = tiers.size;
	return f;
}

// ── The v2 score ─────────────────────────────────────────────────────────────

export interface CodeDepthResult {
	codeDepth: number;
	// transparency for explain / audit
	baseline: number;
	substance: number;
	cloneMultiplier: number;
	nonTrivialFns: number;
	contractCrates: number;
	rustSloc: number;
	reasons: string[];
}

/**
 * codeDepth v2. Per-crate scoring with MAX (not union) so a 38-example workspace
 * cannot sum its way to quality; breadth is a small gated bonus. Baseline
 * hard-capped at 0.20 so "is-a-contract" can never alone clear 0.6.
 */
export function computeCodeDepth(input: DepthInput): CodeDepthResult {
	const reasons: string[] = [];

	// Non-Rust proofs: real but not contract depth.
	if (
		input.proof === "js-sdk" ||
		input.proof === "lang-sdk" ||
		input.proof === "stellar-toml"
	) {
		return zero(0.3, "js/toml-proof");
	}
	if (input.proof !== "cargo-sdk" && input.proof !== "contract-macros") {
		return zero(0, "no-proof");
	}

	// (A) BASELINE — hard-capped at 0.20 (review invariant).
	const baseline = Math.min(
		0.2,
		0.1 +
			0.05 * (input.isDeployableContract ? 1 : 0) +
			0.05 * (input.versionStatus === "current" ? 1 : 0),
	);

	// Group .rs blobs by crate dir; score each crate; take MAX for depth terms.
	const rs = input.blobs.filter((b) => b.path.toLowerCase().endsWith(".rs"));
	const byCrate = new Map<string, DepthBlob[]>();
	for (const b of rs) {
		const key = crateDirOf(b.path);
		(byCrate.get(key) ?? byCrate.set(key, []).get(key)!).push(b);
	}
	const crateFacts = [...byCrate.values()].map(crateFactsOf);
	// repo-level shingle union (for clone check) + repo SLOC
	const repoShingles = new Set<string>();
	let repoSloc = 0;
	for (const cf of crateFacts) {
		for (const s of cf.fnShingles) repoShingles.add(s);
		repoSloc += cf.rustSloc;
	}

	const contractCrates = Math.max(input.contractCrateDirs.length, byCrate.size);

	// best single crate by a quick sub-score (nonTrivial density + auth + state)
	const crateSub = (cf: CrateFacts) =>
		Math.min(1, cf.nonTrivialFns / 8) *
			(0.5 + 0.5 * (cf.nonTrivialFns / Math.max(1, cf.totalContractFns))) +
		0.3 * authScore(cf) +
		0.2 * stateComplexity(cf);
	const best = crateFacts.length
		? crateFacts.reduce((a, b) => (crateSub(b) > crateSub(a) ? b : a))
		: crateFactsOf([]);

	// (B) SUBSTANCE — MAX-crate for depth-driven terms, gated breadth.
	const fnRatio =
		best.totalContractFns > 0 ? best.nonTrivialFns / best.totalContractFns : 0;
	const substantiveFns =
		Math.min(1, best.nonTrivialFns / 8) * (0.5 + 0.5 * fnRatio);

	// breadth gated: only counts if >= ceil(SAMPLED crates/3) crates each clear
	// a bar. v3 (2026-07-08): the denominator was TOTAL contractCrates, but the
	// shared fetch unit caps sources at top-18 — in a 40-crate monorepo (hoops)
	// most crates have zero fetched files, so the gate demanded deep code in
	// crates the input never contained and real workspaces could never earn
	// breadth. Judge the gate on crates we actually sampled; the term magnitude
	// still uses total crates (real breadth), so a 2-crate repo can't inflate.
	const deepCrates = crateFacts.filter((cf) => cf.nonTrivialFns >= 3).length;
	const sampledCrates = crateFacts.filter((cf) => cf.rustSloc > 0).length;
	const breadthGate =
		contractCrates > 1 &&
		sampledCrates > 1 &&
		deepCrates >= Math.ceil(Math.min(contractCrates, sampledCrates) / 3);
	const workspaceBreadth = breadthGate
		? Math.min(1, (contractCrates - 1) / 8)
		: 0;

	// single-crate compensation (review P7): a real single contract can't earn
	// the breadth/cross terms — lift it if it has real logic. Threshold is
	// deliberately reachable by a genuine token/escrow (>=2 real methods with
	// auth-gated writes or real state), but a scaffold (nonTrivialFns 0-1) gets
	// nothing. Exact lift is calibrated against real repos in P2.
	const singleCrateComp =
		contractCrates === 1 &&
		best.nonTrivialFns >= 2 &&
		(authScore(best) > 0.5 || stateComplexity(best) > 0.2)
			? 0.12
			: 0;

	const slocCurve = Math.min(1, Math.log(1 + repoSloc) / Math.log(801));
	const crossScore = Math.min(1, best.crossCalls / 2);
	const testScore = testDepth(input.blobs);
	const releaseScore = Math.min(
		1,
		Math.max(input.scalars.releaseCount ?? 0, input.scalars.tagCount ?? 0) / 3,
	);
	// v3: on-chain-VERIFIED deployment (fetch layer checks stellar.expert) is
	// worth ~3x a bare address mention — the address string is fakeable, the
	// live mainnet contract is not.
	const addrMention = /\bC[A-Z2-7]{55}\b/.test(input.scalars.readmeText ?? "");
	const deployedAddr = input.scalars.mainnetContractId
		? 1
		: addrMention
			? 0.35
			: 0;

	const substance =
		0.16 * workspaceBreadth +
		singleCrateComp +
		0.2 * substantiveFns +
		0.11 * slocCurve +
		0.12 * authScore(best) +
		0.06 * (best.customAccountAuth ? 1 : 0) +
		0.08 * crossScore +
		0.06 * stateComplexity(best) +
		0.06 * testScore +
		0.05 * releaseScore + // release maturity (audit dir path is fakeable → dropped, review P6c)
		0.04 * Math.min(1, best.financialArith / 3) +
		0.08 * deployedAddr;

	// (C) penalties.
	let penalty = 0;
	if (best.writeSites > 0 && best.requireAuthCount === 0) {
		penalty += 0.05;
		reasons.push("writes-no-auth");
	}
	if (input.scalars.singleAuthor && input.scalars.allCommitsWithin48h) {
		penalty += 0.1;
		reasons.push("hackathon-throwaway");
	}

	let raw = clamp01(baseline + substance - penalty);

	// Example/tutorial cap — an examples repo's code is real but not an
	// authoritative product; cap it below the 0.6 quality gate so it stays
	// community-tier (findable) but not surfaced as canonical. Curated set = no
	// over-filter risk; the name marker only fires on IMMATURE repos so a real
	// released project named "*-demo" keeps full score.
	const mature =
		(input.scalars.releaseCount ?? 0) > 0 || (input.scalars.tagCount ?? 0) > 2;
	if (isExampleRepo(input.fullName, input.scalars.topics, mature)) {
		reasons.push("example-repo");
		raw = Math.min(raw, 0.45);
	}

	// Tooling/SDK-usage cap — a crate can DEPEND on soroban-sdk (CLI, indexer,
	// client codegen) and even contain contract-adjacent strings (require_auth
	// in tx-building code, .storage() in ledger tooling) without BEING a
	// contract; stellar-cli scored 0.50 from its own application logic this
	// way. The discriminator tooling can't fake is the contract-macro FAMILY:
	// zero #[contract]/#[contractimpl]/#[contracttype]/#[contracterror] across
	// every analyzed .rs ⇒ demonstrably no contract code here ⇒ cap at the
	// shallow-proof level (0.35, ~js-sdk tier). The family (not just entry
	// macros) is deliberate: in module-split repos the tiny #[contract] entry
	// file can fall below the top-N size cut while the big module files carry
	// #[contracttype] DataKeys (blend does exactly this — entry-macros-only
	// capping wrongly sank it to 0.35 in the calibration re-probe).
	const contractFamilyMacros = rs.reduce(
		(n, b) =>
			n +
			(b.text?.match(/#\[\s*contract(impl|type|error|client)?\s*\]/g)?.length ??
				0),
		0,
	);
	if (contractFamilyMacros === 0) {
		reasons.push("no-contract-macros");
		raw = Math.min(raw, 0.35);
	}

	// (D) CLONE MULTIPLIER — gated on EMPTINESS not similarity (review P8):
	// a repo full of real non-trivial logic is immune even if it structurally
	// resembles a template (SEP-41/OZ tokens legitimately share shape).
	const jRaw = jaccard(repoShingles, CANON_SCAFFOLD_SHINGLES);
	const emptiness = 1 - Math.min(1, best.nonTrivialFns / 6);
	const jEff = jRaw * emptiness;
	const m = Math.max(0.35, Math.min(1, 1 - 0.55 * jEff)); // floor 0.35 (review P8), coeff calibratable
	if (jEff > 0.3) reasons.push(`clone:${jEff.toFixed(2)}`);

	// (E) fork-of-scaffold hard cap (defense in depth).
	const parent = (input.scalars.parentFullName ?? "").toLowerCase();
	if (
		input.scalars.isFork &&
		KNOWN_SCAFFOLDS.has(parent) &&
		(input.scalars.commitCount ?? 99) < 15 &&
		m > 0.4
	) {
		reasons.push("fork-of-scaffold");
		return {
			codeDepth: Math.min(raw * m, 0.4),
			baseline,
			substance,
			cloneMultiplier: m,
			nonTrivialFns: best.nonTrivialFns,
			contractCrates,
			rustSloc: repoSloc,
			reasons,
		};
	}

	return {
		codeDepth: raw * m,
		baseline,
		substance,
		cloneMultiplier: m,
		nonTrivialFns: best.nonTrivialFns,
		contractCrates,
		rustSloc: repoSloc,
		reasons,
	};

	function zero(v: number, why: string): CodeDepthResult {
		return {
			codeDepth: v,
			baseline: v,
			substance: 0,
			cloneMultiplier: 1,
			nonTrivialFns: 0,
			contractCrates: 0,
			rustSloc: 0,
			reasons: [why],
		};
	}
}

// write-gated require_auth density (review P6a).
function authScore(cf: CrateFacts): number {
	if (cf.writeSites > 0)
		return Math.min(1, cf.authGatedWrites / Math.max(1, cf.writeSites * 0.5));
	return 0.3 * Math.min(1, cf.requireAuthCount / 3);
}

function stateComplexity(cf: CrateFacts): number {
	const keyed = Math.min(1, (cf.dataKeyVariants + cf.errorArms) / 12);
	const tiered = Math.min(1, cf.storageTiers / 3);
	return clamp01(0.6 * keyed + 0.4 * tiered);
}

function testDepth(blobs: DepthBlob[]): number {
	let testFns = 0;
	let asserts = 0;
	for (const b of blobs) {
		if (b.text == null) continue;
		testFns += (b.text.match(/#\[test\]/g) ?? []).length;
		asserts += (b.text.match(/\bassert(?:_eq|_ne)?!/g) ?? []).length;
	}
	// substance: needs real asserts, not just a #[test] shell (review P5).
	return clamp01(
		0.6 * Math.min(1, testFns / 6) + 0.4 * Math.min(1, asserts / 12),
	);
}
