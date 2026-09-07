/**
 * Quality grade (0-100) for a code reference — the "grade certain repos as
 * better references" artifact. A repo's OWN merit is the base (its stars,
 * recency, whether it's documented/tagged); inherited project/builder authority
 * (hackathon-winner + SCF-funded + prominence) is a BOOST *gated by* own merit,
 * so a flagship org's throwaway sub-repo (0 stars, no description) can't ride
 * its parent's prominence to a "strong reference" score. Archived/fork repos
 * are down-weighted. Computed at enrich time and stored as `repoScore`;
 * /api/repos/search ranks by it so an agent gets the strongest *real* existing
 * references first, not a flagship org's peripheral plumbing.
 */

export interface RepoGradeInput {
	lastCommitAt?: string | Date | null;
	stargazerCount?: number | null;
	isFork?: boolean;
	isArchived?: boolean;
	hackathonWinner?: boolean; // owning project placed in a hackathon
	scfAwarded?: boolean; // owning project is SCF-funded
	projectProminence?: number; // 0-100 curated prominence of the owning project
	builderReputation?: number; // 0-1, from the owning builder's Stellar Passport (SCF tier / featured / activity)
	/** on the hand-maintained canonical list (src/lib/repo-search.ts) — the
	 * strongest external validation we have: a human said this repo IS the
	 * answer for a concept. */
	curatedCanonical?: boolean;
	// Own-merit signals so a flagship org's throwaway sub-repo can't inherit the
	// parent's full authority (e.g. reflector's 0-star node-orchestrator).
	hasDescription?: boolean;
	topicCount?: number;
	openIssues?: number;
	// AI/human code-review score (0-1) from a hackathon evaluation. When present,
	// it's the strongest quality signal we have — an actual code review — so it
	// can lift a 0-star hackathon repo to a strong reference (and sink a weak one
	// regardless of how fresh/linked it is). Ungated by own-merit on purpose.
	judgeScore?: number | null;
	// Code-Truth Ledger depth (0-1) from analyzing the repo's actual Soroban
	// source (soroban-sdk dep, contract macros, auth/storage, deployable cdylib).
	// Like judgeScore, it's evidence from the CODE, not heuristics — a
	// code-verified 0-star contract earns a strong reference on its own merit.
	// Ungated by own-merit on purpose (the code IS the merit).
	codeDepth?: number | null;
	/**
	 * The scan's verdict on whether this repo contains Stellar code at all:
	 * "none" is an affirmative finding (we looked and found nothing), while
	 * null/undefined means nobody looked — never punished.
	 *
	 * Stars are evidence the ECOSYSTEM AT LARGE noticed a repo, not that the
	 * STELLAR ecosystem did. iancoleman/bip39 carries 4,314 stars and no
	 * Stellar code; OneKeyHQ/app-monorepo 2,433 and none. Both outscored
	 * blend-capital/blend-contracts (21 stars, the live lending protocol) until
	 * traction was made relevance-weighted.
	 */
	stellarProof?: string | null;
	/**
	 * How many curated knowledge notes this repo carries. A note is a human
	 * writing down what the repo IS, with a source and a date — the same kind
	 * of external validation as being named canonical, and cheaper to earn, so
	 * it counts one tier lower.
	 */
	knowledgeNoteCount?: number | null;
	/** Default-branch commits in the last 90 days (activitySignals.commits90d).
	 * Refines freshness WITHIN the fresh band: two repos committed last week can
	 * differ 50x in velocity. Null = not captured — no penalty, never punish
	 * missing data. */
	commits90d?: number | null;
	/**
	 * The publisher is the protocol org itself (stellar/, soroban/, SDF).
	 *
	 * SDF never receives an SCF award — it AWARDS them — so every first-party
	 * repo scored as though nothing outside it vouched for it. Measured
	 * 2026-09-07: 0 of 212 indexed stellar-org repos carried scfAwarded, and 74
	 * live first-party repos graded "low", among them stellar/js-xdr (26 stars,
	 * the XDR codec every SDK depends on) at 31 and stellar/stellar-docs at 34.
	 */
	firstParty?: boolean;
	// --- Facts the code scanner already reads, stores and serves. Until
	// 2026-09-07 exactly two of the sixteen (codeDepth, stellarProof) reached
	// this grade; the rest were scanned on 10,876 repos and discarded here.
	/** a test suite exists in the tree (4,029 scanned repos have one) */
	testsPresent?: boolean | null;
	/** CI config exists in the tree (2,529 scanned repos have one) */
	ciPresent?: boolean | null;
	/** activitySignals.lastReleaseAt — a published release, not just a commit */
	lastReleaseAt?: string | Date | null;
	/** the scanned Stellar SDK pin: "current" | "supported" | "deprecated" | "unknown" */
	versionStatus?: string | null;
	/** contractInterface.length — how much contract surface the repo exports */
	contractInterfaceCount?: number | null;
	/** codeScanState === "scanned" — whether the code facts above were actually
	 * gathered. Absence of a scan must never read as failing the scan. */
	codeScanned?: boolean;
	/**
	 * How many packages this repo publishes that the REGISTRY confirms came
	 * from it (jsr.io's `githubRepository`, npm's `repository.url`).
	 *
	 * The strongest cheap evidence a library is usable: somebody can install it,
	 * and an independent party vouches for where it came from. Measured
	 * 2026-09-07 on a 25-repo judged-hackathon sample: 18 declared a package.json
	 * name (so the declaration is worthless), and ZERO were verified-published.
	 * fazzatti/colibri publishes nine on JSR and had no way to say so.
	 *
	 * Null/0 is never a penalty — most good repos here are Rust contracts, Go
	 * services or C++ that publish no JS package at all.
	 */
	publishedPackageCount?: number | null;
}

export interface RepoGrade {
	score: number; // 0-100
	label: "high" | "medium" | "low";
	freshness: number; // 0-1
	traction: number; // 0-1
	authority: number; // 0-1
	ownMerit: number; // 0-1
}

const DAY_MS = 86_400_000;

/**
 * Orgs that publish the protocol itself. ONE definition — repo-search imports
 * this for its ranking tiebreak, so the grade and the ranker can never disagree
 * about who is first-party.
 */
export const FIRST_PARTY_OWNERS = new Set([
	// Verified 2026-09-07 against the GitHub API — every entry must be a real
	// SDF ORGANISATION. `soroban` (type=User, 0 repos, created 2014) and
	// `stellardevelopmentfoundation` (type=User, 1 repo, no name or company)
	// were in this list and are NOT SDF: they are unrelated personal accounts
	// holding the names. Harmless while the set only broke search ties; not
	// harmless once it grants 0.95 corroboration, +0.4 authority, exemption from
	// the Stellar-relevance discount and uncapped indexing of everything they
	// publish.
	"stellar", // org "Stellar" — stellar.org
	"stellar-deprecated", // org "Stellar (Deprecated Repositories)" — stellar.org
	// "Experiments at the frontier of the Stellar Development Foundation"
	// (the org's own description). 30 repos, every one Stellar, none funded and
	// none starred: henyey (a pure-Rust Stellar Core), stellar-spec (protocol
	// specifications), zig-/c-soroban-sdk, contract-verifications, and
	// stellar-raven itself. 18 of the 30 were absent from the index entirely.
	"stellar-experimental",
]);

/** Accepts "owner" or "owner/name". */
export function isFirstParty(owner: string | null | undefined): boolean {
	if (!owner) return false;
	return FIRST_PARTY_OWNERS.has(owner.split("/")[0].toLowerCase());
}

/**
 * Observable per-repo activity state, derived at serve time — never stored, so
 * it can't go stale, and never guessed (the repo-stale ≠ defunct lesson):
 *   archived   — the OWNER's own declaration; the only death verdict we make
 *   active     — a known commit within 45 days
 *   maintained — within 180 days
 *   dormant    — older than 180 days (a KNOWN date; an observation, not a verdict)
 *   unknown    — no commit date held; absence of evidence, never evidence of death
 */
export type RepoActivityState =
	| "active"
	| "maintained"
	| "dormant"
	| "archived"
	| "unknown";

export const REPO_ACTIVITY_STATES: readonly RepoActivityState[] = [
	"active",
	"maintained",
	"dormant",
	"archived",
	"unknown",
];

export function activityStateOf(
	lastCommitAt: string | Date | null | undefined,
	isArchived: boolean | null | undefined,
): RepoActivityState {
	if (isArchived) return "archived";
	if (!lastCommitAt) return "unknown";
	const t = new Date(lastCommitAt).getTime();
	if (!Number.isFinite(t)) return "unknown";
	const ageDays = (Date.now() - t) / DAY_MS;
	if (ageDays <= 45) return "active";
	if (ageDays <= 180) return "maintained";
	return "dormant";
}

/**
 * What KIND of repo a row is — derived at read time from signals the row
 * already serves, never stored, so a consumer can tell a hackathon demo from
 * a shipped product without re-deriving it from six fields. First match wins;
 * kindBasis names the deciding signal so the label can be weighed
 * (nameLooksTemplate is the one heuristic — everything else is a stored fact).
 */
export type RepoKind =
	| "archived"
	| "fork"
	| "hackathon"
	| "template-or-tutorial"
	| "contract"
	| "application"
	| "code";

/** Precedence order. */
export const REPO_KINDS: readonly RepoKind[] = [
	"archived",
	"fork",
	"template-or-tutorial",
	"contract",
	"application",
	"hackathon",
	"code",
];

export type RepoKindBasis =
	| "isArchived"
	| "isFork"
	| "judgedHackathon"
	| "nameLooksTemplate"
	| "isDeployableContract"
	| "projectSlug"
	| "none";

/** The code scanner's own template/scaffold name test (scripts/scan/fetch-repo-code.ts
 * imports it) — one regex, so the served label and the scaffoldClone flag agree. */
export const TEMPLATE_NAME_RE =
	/(hello[-_]?world|template|boilerplate|scaffold|quickstart|starter|example|tutorial)/i;

/** Tests only the segment after the last "/" — an owner called example-org must not count. */
export function nameLooksTemplate(name: string | null | undefined): boolean {
	return TEMPLATE_NAME_RE.test(name?.split("/").pop() ?? "");
}

export interface RepoKindInput {
	isArchived?: boolean | null;
	isFork?: boolean | null;
	judgedHackathon?: string | null;
	/** short name or owner/name */
	name?: string | null;
	/** the SERVED codeVerified.isDeployableContract (infra pin applied); unscanned = not a contract */
	isDeployableContract?: boolean | null;
	/** linked directory product */
	projectSlug?: string | null;
}

export function repoKindOf(input: RepoKindInput): {
	kind: RepoKind;
	kindBasis: RepoKindBasis;
} {
	if (input.isArchived) return { kind: "archived", kindBasis: "isArchived" };
	if (input.isFork) return { kind: "fork", kindBasis: "isFork" };
	if (nameLooksTemplate(input.name))
		return { kind: "template-or-tutorial", kindBasis: "nameLooksTemplate" };
	if (input.isDeployableContract)
		return { kind: "contract", kindBasis: "isDeployableContract" };
	if (input.projectSlug)
		return { kind: "application", kindBasis: "projectSlug" };
	// A judged hackathon entry that is neither a deployable contract nor a
	// listed product. One that BECAME a directory product is an application
	// above — the product link outranks where the code was first submitted.
	if (input.judgedHackathon)
		return { kind: "hackathon", kindBasis: "judgedHackathon" };
	return { kind: "code", kindBasis: "none" };
}

// 1.0 within ~90 days, linearly decaying to 0 by ~2 years stale.
function freshnessOf(lastCommitAt?: string | Date | null): number {
	if (!lastCommitAt) return 0;
	const t = new Date(lastCommitAt).getTime();
	if (!Number.isFinite(t)) return 0;
	const ageDays = (Date.now() - t) / DAY_MS;
	if (ageDays <= 90) return 1;
	if (ageDays >= 730) return 0;
	return 1 - (ageDays - 90) / (730 - 90);
}

// Log-scaled stars, saturating around 1,000 stars → 1.0.
function tractionOf(stars?: number | null): number {
	const s = Math.max(0, stars ?? 0);
	return Math.min(1, Math.log10(s + 1) / 3);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * How much of this repo's popularity is evidence about STELLAR?
 *
 * 1.0 when the scan found Stellar code, or when nobody has scanned (missing
 * data is never a penalty). Heavily discounted when the scan affirmatively
 * found none: those stars were earned somewhere else.
 */
function stellarRelevance(input: RepoGradeInput): number {
	if (input.stellarProof == null) return 1; // not scanned — no verdict, no penalty
	if (input.stellarProof !== "none") return 1;
	// A repo the protocol org publishes, or that a human named THE answer for a
	// Stellar concept, cannot be "not about Stellar" — the scanner's proof test
	// looks for an SDK import, and the ecosystem's own foundations don't import
	// themselves. stellar/js-xdr is the XDR codec every SDK is built on and
	// imports no soroban-sdk; it was discounted to a quarter of its evidence and
	// scored 39 next to hackathon entries at 68.
	if (input.firstParty || input.curatedCanonical) return 1;
	// Scanned, and no Stellar code found. Depth can still rescue it if the
	// scanner recorded some, otherwise its stars barely count here.
	const c = typeof input.codeDepth === "number" ? clamp01(input.codeDepth) : 0;
	return 0.25 + 0.45 * c;
}

/**
 * Evidence FROM THE CODE that this repo is maintained software rather than a
 * snapshot somebody pushed once.
 *
 * Every input is a fact the scanner read out of the tree — a test suite, a CI
 * config, a published release, the Stellar SDK version actually pinned. None of
 * it is a proxy for who paid for the work. This is the point of scanning 10,876
 * repos, and until 2026-09-07 none of these four facts reached the score.
 *
 * Absence is never punished here: an unscanned repo returns 0 and simply wins
 * nothing, because 0 is also the floor for "we never looked". A deprecated SDK
 * pin IS punished, but separately (see deprecatedPenalty) — clamping it to 0
 * inside this function would make "pins a dead SDK" indistinguishable from
 * "never scanned".
 */
export function codeEvidence(input: RepoGradeInput): number {
	let e = 0;
	if (input.testsPresent) e += 0.3;
	if (input.ciPresent) e += 0.2;
	// A release is the difference between code that exists and code that ships.
	// DECAY, not a cliff: at 365 days exactly this used to swing 0.3 → 0, which
	// rewards an annual re-tag and punishes a correct codec that ships every 18
	// months. Full credit inside a year, fading to nothing at three.
	if (input.lastReleaseAt) {
		const t = new Date(input.lastReleaseAt).getTime();
		if (Number.isFinite(t)) {
			const days = (Date.now() - t) / DAY_MS;
			const f = days <= 365 ? 1 : days >= 1095 ? 0 : 1 - (days - 365) / 730;
			e += 0.3 * f;
		}
	}
	if (input.versionStatus === "current") e += 0.2;
	else if (input.versionStatus === "supported") e += 0.12;
	// Exported contract surface — a repo that defines 48 callable contract
	// methods is a reference for how to write them; one that defines none isn't.
	const iface = Math.max(0, input.contractInterfaceCount ?? 0);
	if (iface > 0) e += Math.min(0.15, 0.01 * iface);
	// Relevance-weighted, exactly as traction is. A green CI badge on a repo the
	// scanner affirmatively found no Stellar code in is evidence of good
	// engineering somewhere else — keybase/client (9,248 stars, tests, CI,
	// releases, no Stellar code) rose 60 → 72 on this signal before the weight
	// was applied, closing on the JS SDK it must never approach. Unscanned repos
	// return 1 and are not punished.
	return clamp01(e) * stellarRelevance(input);
}

/**
 * A repo pinned to a Stellar SDK we have marked deprecated is a worse reference
 * than one that is merely unscanned, and no number of stars fixes that — an
 * agent copying from it copies a dead API. Affirmative finding only: "unknown"
 * (5,356 repos) is not a verdict and costs nothing. 400 repos pin a dead SDK.
 */
function deprecatedPenalty(input: RepoGradeInput): number {
	return input.versionStatus === "deprecated" ? 0.75 : 1;
}

/**
 * Does anything OUTSIDE a repo's own claims say it is an answer?
 *
 * Independent evidence streams, strongest bid wins — deliberately NOT a ladder
 * with money near the top. It used to be one, and the ranking it produced was
 * indefensible: the code-driven lifts (a judge's review, Soroban code depth)
 * were MULTIPLIED by this, so a repo we had read, tested, and verified was
 * discounted by up to 55% for the sole offence of being unfunded.
 *
 * Funding is real evidence and it stays. It is now one bid among several rather
 * than the ceiling, because it answers a different question than the one we
 * ask: an award says somebody believed in this in the past, not that the code
 * works now. The streams below are genuinely independent of each other — a
 * human naming it, the protocol org publishing it, the code being maintained
 * software, a written note, money, a crowd — so taking the max is honest: any
 * ONE of them is sufficient corroboration, and a repo needs no funder to earn
 * a full reading of its own source.
 */
function corroboration(input: RepoGradeInput): number {
	let best = 0.45; // nothing outside the repo vouches for it
	const bid = (v: number) => {
		if (v > best) best = v;
	};
	if (input.curatedCanonical) bid(1); // a human named it THE answer
	// SDF publishes the protocol; its repos ARE the reference. They are never
	// SCF-funded, so all 212 of them sat on the floor above until 2026-09-07.
	if (input.firstParty) bid(0.95);
	// The repo's OWN tree, bidding on the question "does anything OUTSIDE this
	// repo vouch for it". It is not nothing — but it is not corroboration
	// either, and it used to bid up to 0.95, tying with the protocol foundation.
	//
	// Every input is cheap: a `foo.test.ts` containing `assert(true)`, a CI YAML
	// that echoes ok, an annual `gh release create`, a pinned SDK you never
	// compile against. Tests + CI + release + current pin = 1.0 before the
	// clamp. An afternoon of GitHub cosmetics bought a 0.95 corroboration, and
	// that is why a 5/5-judged hackathon on the official starter kit still
	// measured 81/high after the funding fix — the very inversion this file
	// exists to remove, four points shaved off it.
	//
	// Capped at 0.62 now: better than nothing vouching for it, below a written
	// note, well below anything a stranger cannot mint in an afternoon.
	bid(0.45 + 0.17 * codeEvidence(input));
	// A registry serving this repo's package, and naming this repo as its
	// source, is an independent party attesting the thing ships and is
	// installable. Stronger than a note (which is us) and than money (which is
	// a past decision), below a human naming it canonical and below the
	// protocol org publishing it.
	if ((input.publishedPackageCount ?? 0) > 0) bid(0.88);
	if ((input.knowledgeNoteCount ?? 0) > 0) bid(0.8);
	if (input.scfAwarded || (input.projectProminence ?? 0) > 0) bid(0.8);
	if ((input.stargazerCount ?? 0) >= 10) bid(0.7); // the crowd noticed
	return best;
}

export function repoGrade(input: RepoGradeInput): RepoGrade {
	// Velocity-adjusted freshness (repo-intel blend, answer-key calibrated):
	// date freshness says WHEN the last commit was; commits90d says how alive
	// the repo is within that band. 1 commit → 0.85x, 30+/90d → 1.0x. The
	// swing is deliberately small (≤ ~2 score points) — a tie-breaker among
	// active repos, never a rank-upheaver; null = 1.0x (no data, no penalty).
	const velocityAdj =
		typeof input.commits90d === "number" && Number.isFinite(input.commits90d)
			? 0.85 + 0.15 * Math.min(Math.max(input.commits90d, 0) / 30, 1)
			: 1;
	const freshness = freshnessOf(input.lastCommitAt) * velocityAdj;
	// Both code-driven lifts below bypass ownMerit by design (the code IS the
	// merit) — which also meant they bypassed recency, so a repo with deep
	// verified code and no commits for a year scored identically to one shipping
	// daily. A stable library legitimately needs few commits, so this is a
	// gentle tilt with a high floor, not the full freshness decay.
	const liveness = 0.75 + 0.25 * freshness;
	// Traction, weighted by whether those stars are about STELLAR. A scan that
	// affirmatively found no Stellar code means this repo's popularity says
	// nothing about its value as a Stellar reference; an unscanned repo is not
	// punished, because absence of evidence is not evidence.
	// ADOPTION HAS MORE THAN ONE VISIBLE PROXY, and stars are the weakest of
	// them for a library. Until 2026-09-07 this term was stars alone, which made
	// it a 30%-of-ownMerit slot NOTHING else could fill: a repo with every code
	// signal maxed, ten knowledge notes and a human calling it canonical still
	// capped at 76 on 3 stars, while the identical repo with 700 stars reached
	// 89. That is the same popularity bias the rest of this file removes, just
	// at lower magnitude, and no amount of evidence could reach past it.
	//
	// The other two proxies are deliberately NOT cheap:
	//   · a registry serving this repo's package — someone can install it, and
	//     an independent party names this repo as the source. In a 25-repo
	//     judged-hackathon sample, 18 declared a package.json name and ZERO were
	//     verified-published; a name is free, a namespace is not.
	//   · a human naming it canonical — a person's read of the domain, which is
	//     exactly the knowledge a star count is a poor stand-in for.
	// Both are capped below what real popularity earns, so a published library
	// sits under a 1,000-star SDK on this term rather than beside it.
	const distribution =
		(input.publishedPackageCount ?? 0) > 0
			? Math.min(0.88, 0.55 + 0.11 * (input.publishedPackageCount ?? 0))
			: 0;
	const adoption = Math.max(
		tractionOf(input.stargazerCount),
		distribution,
		input.curatedCanonical ? 0.8 : 0,
	);
	const traction = adoption * stellarRelevance(input);
	const hasDesc = input.hasDescription ? 1 : 0;
	const hasTopics = (input.topicCount ?? 0) > 0 ? 1 : 0;
	const engaged = (input.openIssues ?? 0) > 0 ? 1 : 0;

	// Does the repo stand on its OWN as a reference? A 0-star, undocumented
	// sub-repo scores low here no matter whose org it's under.
	//
	// Until 2026-09-07 this was 45% star count — and stars are precisely what a
	// good unfunded library does not have. A repo that ships tagged releases,
	// carries a test suite, runs CI and pins a live SDK has demonstrated its own
	// merit far more directly than a popularity number, so that evidence now
	// carries the same weight as traction and the star term drops to 0.30.
	//
	// Weights renormalize over the signals we actually hold: an unscanned repo
	// is scored on the remaining terms, never scored as though it had failed the
	// code checks. (Unscanned, the star weight lands at 0.30/0.70 ≈ 0.43 — where
	// it was before — so this changes the ranking only where we did the reading.)
	const meritParts: Array<[number, number]> = [
		[0.3, traction],
		[0.22, freshness],
		[0.11, hasDesc],
		[0.04, hasTopics],
		[0.03, engaged],
	];
	const baseWeight = meritParts.reduce((a, [w]) => a + w, 0);
	const baseMerit =
		meritParts.reduce((a, [w, v]) => a + w * v, 0) / baseWeight;
	// MEASURING MUST NEVER COST A REPO. Adding the code term with a zero value
	// made a scanned repo with no test directory score BELOW an identical repo
	// nobody had looked at (1,000 stars, fresh, documented: 57 unscanned vs 40
	// scanned-and-empty). That inverts this file's own doctrine — absence of
	// evidence is not evidence of absence — and penalises the lane doing the
	// work. A scan that finds nothing now lands exactly where no scan lands;
	// only a scan that finds something moves the number.
	const ownMerit = clamp01(
		input.codeScanned
			? Math.max(
					baseMerit,
					(meritParts.reduce((a, [w, v]) => a + w * v, 0) +
						0.3 * codeEvidence(input)) /
						(baseWeight + 0.3),
				)
			: baseMerit,
	);

	// Inherited authority from the owning project/builder.
	let authority = 0;
	// A human naming this repo THE answer for a concept is the strongest
	// external validation we hold, and until 2026-09-07 it earned nothing here:
	// curatedCanonical only gated the codeDepth lift, so stellar/stellar-core —
	// on the canonical list, 3,301 stars — got zero authority, because a C++
	// network implementation has no Soroban SDK depth to be lifted by. It
	// capped at 60 with PERFECT own merit while judged hackathon repos sat at 85.
	if (input.curatedCanonical) authority += 0.45;
	// Curated knowledge notes are external validation in their own right: a
	// human read this repo and wrote down dated, sourced facts about it, which
	// is the same KIND of signal as naming it canonical and a weaker degree of
	// it. Until 2026-09-07 notes only scaled the code-depth and judge lifts, so
	// a repo we had documented six times over earned nothing from any of it —
	// fazzatti/colibri, actively developed, SDK-typed, six notes, scored 35
	// because prominence, funding and canonical status were all absent.
	//
	// Capped low on purpose: notes say somebody looked, not that the ecosystem
	// depends on it, and the cap keeps a heavily-annotated small repo below a
	// canonical one.
	authority += Math.min(0.25, 0.06 * Math.max(0, input.knowledgeNoteCount ?? 0));
	// Shipping installable, registry-verified packages is authority a library
	// earns by being usable. Capped: nine small packages are not nine times the
	// evidence of one, and a monorepo should not out-authority an SDK.
	authority += Math.min(
		0.2,
		0.09 * Math.max(0, input.publishedPackageCount ?? 0),
	);
	// Publishing the protocol is authority. SDF's own repos carry it without any
	// grant, prominence score or curation pass having named them.
	if (input.firstParty) authority += 0.4;
	// Maintained-software evidence read out of the tree — releases, tests, CI, a
	// live SDK pin. This is authority a repo earns by being good, which is the
	// only kind an unfunded project can earn.
	authority += 0.3 * codeEvidence(input);
	if (input.hackathonWinner) authority += 0.35;
	if (input.scfAwarded) authority += 0.25;
	authority += Math.min(0.4, Math.max(0, input.projectProminence ?? 0) / 250); // prominence 100 → +0.4
	authority += Math.min(0.4, Math.max(0, input.builderReputation ?? 0) * 0.4); // builder rep → up to +0.4
	authority = Math.min(1, authority);

	// Authority is a BOOST gated by own merit: a no-merit peripheral repo only
	// gets ~30% of its parent's authority, so flagship plumbing can't ride the
	// org's prominence up to "strong reference".
	const boostedAuthority = authority * (0.3 + 0.7 * ownMerit);

	let composite = 0.6 * ownMerit + 0.4 * boostedAuthority;

	// A code review trumps heuristics. If this repo was judged, blend toward the
	// review: a 5/5 (judge 1.0) becomes a strong reference even at 0 stars; a
	// 1/5 caps it low. Take the better of heuristic vs judge-driven so a repo
	// that's BOTH judged-high and has traction can still climb past judged-only.
	if (
		typeof input.judgeScore === "number" &&
		Number.isFinite(input.judgeScore)
	) {
		const j = Math.max(0, Math.min(1, input.judgeScore));
		// SCALED BY EXTERNAL VALIDATION, exactly as codeDepth is below, and for
		// the same reason. Ungated, a judge score of 1.0 set the score to a flat
		// 85 whatever the repo's own merit — and on 2026-09-07 the top TWELVE
		// repos in the whole index were hackathon submissions with 0-4 stars and
		// no project link, above stellar/freighter, xBull and every SDK.
		//
		// A hackathon review says this submission is GOOD, judged against the
		// other submissions of that hackathon. It does not say the repo is a
		// canonical reference for the ecosystem — the same distinction the
		// codeDepth block draws between REAL and CANONICAL.
		const judgeDriven = (0.05 + 0.8 * j) * corroboration(input) * liveness;
		composite = Math.max(composite, judgeDriven);
	}

	// Code depth trumps heuristics too — parallel to judgeScore. A code-verified
	// deployable contract (codeDepth ~1.0) becomes a strong reference even at 0
	// stars, fixing star-dominance for the long tail of real-but-unstarred repos.
	// That intent is right and is preserved.
	//
	// But UNGATED it was inverted, and this is the field agents actually rank
	// on. codeDepth measures how heavily a repo USES the Stellar SDK — which an
	// APPLICATION answers better than the SDK itself, because a library does not
	// import itself. Measured live 2026-08-30, sorted by repoScore:
	//
	//     85  Andy00L/x402-autopilot        (0 stars, no project)
	//     85  ashfrancis/chickenz           (0 stars, no project)
	//     85  xaviersharwin10/soroban_node_0
	//     ...
	//     76  stellar/js-stellar-sdk
	//
	// Student dApps outranking SDF's own SDK, on the number Scout tells agents
	// to trust. So the code-driven lift is now SCALED BY EXTERNAL VALIDATION —
	// does anything outside the repo's own source say it is an answer? This is
	// the same discipline already applied to `authority` above ("a no-merit
	// peripheral repo only gets ~30% of its parent's authority"): deep code is
	// evidence a repo is REAL, not evidence it is CANONICAL.
	//
	// Deliberately NOT gated on stars alone — that would reinstate the star
	// dominance this branch exists to fix. A curated or SCF-funded or
	// project-linked repo keeps the full lift at zero stars.
	if (typeof input.codeDepth === "number" && Number.isFinite(input.codeDepth)) {
		const c = Math.max(0, Math.min(1, input.codeDepth));
		const codeDriven = (0.1 + 0.7 * c) * corroboration(input) * liveness;
		composite = Math.max(composite, codeDriven);
	}

	if (input.isArchived) composite *= 0.5; // archived = weaker reference
	if (input.isFork) composite *= 0.7; // forks deprioritized
	composite *= deprecatedPenalty(input); // pins a dead Stellar SDK
	composite = clamp01(composite);

	const score = Math.round(composite * 100);
	const label = score >= 70 ? "high" : score >= 40 ? "medium" : "low";
	return {
		score,
		label,
		freshness: Math.round(freshness * 100) / 100,
		traction: Math.round(traction * 100) / 100,
		authority: Math.round(authority * 100) / 100,
		ownMerit: Math.round(ownMerit * 100) / 100,
	};
}
