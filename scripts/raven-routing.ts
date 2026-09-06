/**
 * The routing-accuracy eval — does Raven route a real user's NATURAL question to
 * the RIGHT scout op? The through-Raven feeder (raven-loop) DRIVES the op itself,
 * so it measures data+envelope but never Raven's routing. This asks Raven's
 * `search` tool (its codemode discovery index, built from our OpenAPI text) the
 * question a real user would type, and checks whether the op that SHOULD answer
 * it lands in the top hits — the piece that catches "our purpose-built op exists
 * but a builder's question lands on stellarDocs/lumenloop instead".
 *
 *   RAVEN_MCP=… RAVEN_TOKEN=… pnpm exec tsx scripts/raven-routing.ts
 *   # or: set -a; . <scratchpad>/raven.env; set +a; pnpm exec tsx scripts/raven-routing.ts
 *
 * SCORED ON THE INTENDED OP (2026-09-05). A question passes only when one of
 * ITS expected operation ids is within the top-3 scout hits. "Some scout op
 * appeared" is not a hit: the 2026-09-03 persona battery scored that way and
 * called 12/32 reachable while compareHackathons was the "hit" for "most
 * active contributors". Each graded row records `rank` (1-based position of
 * the first expected op among scout hits, null = absent) and `topAll` (top-3
 * ids across every service), and each miss carries a `missClass` with the
 * evidence behind it. Evidence comes from scripts/eval/raven-scorer-replica.ts
 * (Raven's own scoring math) run over two texts: OURS (the current spec) and
 * the consumer's ACTUAL view (the description the gateway serves + the routing
 * keywords in Raven's committed manifest). The live ranking is the truth; the
 * replica explains it, and the artifact reports how often it reproduces the
 * live score exactly so its own drift is visible.
 * CLASSES, IN PRECEDENCE ORDER (scripts/eval/raven-miss-class.ts, tested at
 * tests/int/raven-miss-class.int.spec.ts):
 *   catalog-lag        the question uses words our current text carries and
 *                      the text Raven indexes does not, and our current text
 *                      would route it (replica rank ≤ 3) — wait for the
 *                      re-baseline, never "fix" it twice. FIRST: text upstream
 *                      has not absorbed is not our collision and not our
 *                      vocabulary hole, whatever else the ranking looks like.
 *                      Every lag miss carries `evidence.lagEvidence` — the
 *                      words our spec ships that the LIVE description lacks
 *   no-scout-op        no scout hit at all (a bare name: no field carries the
 *                      token, so every scout op gates out) — upstream, named-
 *                      entity routing is Raven's alias pack, not our text
 *   id-noun-exclusion  another op's id noun is in the question and that op
 *                      outranked the intended one — Raven weighs id/name at
 *                      12/10 vs description 5; upstream (#124), vocabulary
 *                      on our side does not fix it
 *   named-entity       the only words the intended op lacks are project
 *                      names (the directory's own resolver says so) —
 *                      upstream, same mechanism as no-scout-op
 *   vocabulary         no collision, no lag; the intended op's text lacks
 *                      ordinary words of the question (listed) — ours to fix
 *   outscored          no collision, no lag, nothing missing, still lost on
 *                      score to a sibling — a ranking contest, reported as is
 *   could-not-check    the directory resolver could not say whether a missing
 *                      word is a project name — the class is UNKNOWN, and the
 *                      run says so instead of falling open into `vocabulary`
 *                      and sending someone to edit correct text over a blip
 * Bank errors (a wrong expectation) are fixed in the BANK with a comment,
 * never carried as a class the artifact could hide behind.
 *
 * CATALOG-LAG HONESTY: a newly-shipped op Raven hasn't re-baselined yet is NOT
 * routable through no fault of ours (feedback_catalog_lag_is_not_drift). So we
 * first read Raven's live catalog and only grade a question whose expected op is
 * ALREADY cataloged — a lagging op is skipped, never a finding. The same rule
 * applies to TEXT: a description or x-routing change Raven has not absorbed yet
 * is the catalog-lag class above, not a vocabulary gap.
 *
 * LOCAL RUN ONLY — token from env only, never hardcoded/logged/written.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isSyntheticQuery } from "../src/lib/improvement-ledger";
import { spec } from "../src/lib/openapi-spec";
import { isFabricatedProbe } from "./eval/battery-banks";
import {
	classifyMiss,
	MISS_CLASSES,
	type MissClass,
	type NameVerdict,
} from "./eval/raven-miss-class";
import {
	buildScoutEntries,
	explain,
	idNounCollisions,
	lagTokens,
	liveScoutEntry,
	type ScoutEntry,
	scoutRanking,
} from "./eval/raven-scorer-replica";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "improvements/engine/raven-routing-latest.json");
// The REAL questions: Engine D mines what consumers actually ask + miss. The
// engine asks Raven THOSE (ranked by frequency), not only a curated bank.
const DEMAND = join(
	ROOT,
	"improvements/engine/weekly/engine-d-demand-latest.json",
);
/** Raven's committed catalog — the only place its routing keywords are visible. */
const MANIFEST_URL =
	"https://raw.githubusercontent.com/stellar-experimental/stellar-raven/main/catalog/manifest.json";
/** Our live API — the directory's resolver decides whether a word is a project name. */
const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const URL = process.env.RAVEN_MCP || "https://agents.stellar.buzz/mcp";
/** The token lives durably at ~/.config/stellarlight/raven.token. Requiring it
 *  in the env only meant every local run refused, or — worse, the truth
 *  battery's version of this bug — sent unauthenticated requests and reported
 *  the 401s as slice errors while printing "0 fail". */
const TOKEN =
	process.env.RAVEN_TOKEN ||
	(() => {
		try {
			return readFileSync(
				join(homedir(), ".config/stellarlight/raven.token"),
				"utf8",
			).trim();
		} catch {
			return undefined;
		}
	})();
if (!URL || !TOKEN) {
	console.error(
		"raven-routing: RAVEN_MCP and RAVEN_TOKEN must be in the env (source your scratchpad raven.env). LOCAL RUN ONLY.",
	);
	process.exit(2);
}

/** Builder personas of the 2026-09-03 hand battery: brand-new, knows-a-little,
 *  experienced, SDF-level. Items without one are the capability/demand banks. */
type Persona = "T1" | "T2" | "T3" | "T4";
const PERSONAS: Persona[] = ["T1", "T2", "T3", "T4"];

interface BankItem {
	q: string;
	/** Every scout op that truly holds the answer — any one in the top hits = pass. */
	expect: string[];
	note: string;
	persona?: Persona;
}

/** Natural questions a real SDF-agent user types → the scout op that should win.
 *  Grounded in a live interrogation of Raven's `search`. `expect` lists all ops
 *  that would be a correct route (any one in the top hits = pass). */
const BANK: BankItem[] = [
	// ── capability coverage: every scout op should win its natural question ──
	{
		q: "biggest stablecoins on Stellar by market cap",
		expect: ["getStablecoins"],
		note: "market-cap ranked stablecoins",
	},
	{
		q: "which are the largest stablecoins issued on Stellar",
		expect: ["getStablecoins"],
		note: "stablecoin supply ranking",
	},
	{
		q: "is Blend audited and by whom",
		expect: ["listAudits"],
		note: "audit registry lookup",
	},
	{
		q: "security audit reports for Soroban projects",
		expect: ["listAudits"],
		note: "audit registry",
	},
	{
		q: "who is Tyler van der Hoeven",
		expect: ["getPeople", "getBuilders"],
		note: "person/builder lookup",
	},
	{
		q: "find developers who work at the Stellar Development Foundation",
		expect: ["getPeople", "getBuilders"],
		note: "people index",
	},
	{
		// The BANK was wrong here, not the router. /api/partners?all=true holds
		// 5 rows with partnerType=wallet; /api/projects/search?type=Wallet
		// reports total 64. Expecting getPartners asked the router to return 5
		// instead of 64 — strictly worse — and our own spec says so: getPartners
		// notFor carries "projects/products that were BUILT -> searchProjects",
		// and searchProjects exampleQuestions has the near-verbatim "Which
		// wallets exist on Stellar and how do they differ?". The router obeyed
		// the contract and the probe called it a defect.
		q: "what wallets support Stellar",
		expect: ["searchProjects", "getPartners"],
		note: "wallets — the directory holds 64, the partner list 5",
	},
	{
		// Same call as the wallets probe above: type=Anchor holds 43 project rows
		// vs 29 anchor partners — both surfaces genuinely answer "ramps", so
		// either route is correct and expecting only the smaller one graded the
		// router down for obeying the spec.
		q: "on and off ramps for Stellar payments",
		expect: ["getPartners", "searchProjects"],
		note: "anchors/ramps — partners 29, type=Anchor projects 43",
	},
	{
		q: "top Stellar projects by GitHub activity",
		expect: ["getLeaderboard"],
		note: "activity leaderboard",
	},
	{
		q: "find Soroban lending and money-market protocols",
		expect: ["searchProjects"],
		note: "project directory",
	},
	{
		q: "recent Stellar hackathon winners",
		expect: ["getHackathons", "getHackathon"],
		note: "hackathons",
	},
	{
		q: "explain the soroban examples repository",
		expect: ["explainRepo"],
		note: "repo explainer",
	},
	// ── NEW capability probes (ops never routing-tested before) ──
	{
		q: "open RFPs bounties and grants on Stellar",
		expect: ["getRfps"],
		note: "RFPs/grants",
	},
	{
		q: "which project categories are most crowded or underbuilt",
		expect: ["getClusters"],
		note: "whitespace/clusters",
	},
	{
		q: "ecosystem overview: total projects funding and hackathons",
		expect: ["analyzeEcosystem"],
		note: "ecosystem analytics",
	},
	{
		q: "compare the Meridian and Consensus hackathons",
		expect: ["compareHackathons"],
		note: "hackathon compare",
	},
	{
		q: "total value locked in Stellar DeFi protocols",
		expect: ["getLeaderboard", "analyzeEcosystem"],
		note: "TVL ranking",
	},
	{
		q: "find open source Rust repositories for Soroban",
		expect: ["searchRepos"],
		note: "code search",
	},
	{
		q: "how does Soroban authorization work",
		expect: ["searchResearch"],
		note: "research/docs corpus",
	},
	{
		q: "what changed recently in the Stellar Scout API",
		expect: ["getChangelog"],
		note: "changelog",
	},
	{
		q: "which AI agent skills are available for Stellar",
		expect: ["listSkills"],
		note: "skills marketplace",
	},
	// ── real demand Raven ACTUALLY gets (from api-usage telemetry) ──
	{
		// passkey-kit is a code KIT — its repos ARE the product, so searchRepos
		// returning kalepail/passkey-kit is a correct route for the bare name,
		// not a miss. searchProjects stays first-choice; either passes.
		q: "passkey-kit",
		expect: ["searchProjects", "searchRepos"],
		note: "demand: project by name (kit → repo route also correct)",
	},
	{
		// A NAMED project: the directory lookup answers it, and resolveProject
		// is the op built for names — a name that matches nothing current comes
		// back with its successor and status evidence instead of a miss.
		q: "reflector oracle on Stellar",
		expect: ["searchProjects", "resolveProject"],
		note: "demand: oracle project by name",
	},
	{
		// Re-pointed from "octoplace", which the directory does not hold: the
		// live endpoint answers in semantic mode with the advisory "NEIGHBOURS,
		// not matches". A name-lookup probe aimed at a name we do not carry
		// tests CURATION and reports it as a ROUTING defect — the probe can only
		// pass if someone adds the project. "freighter" is held and matches
		// strict, so this now tests the thing it was written to test.
		//
		// A BARE name has no vocabulary to route on: Raven's gate needs the
		// literal token in some indexed field, and no operation text carries
		// project names. resolveProject is the scout op for bare names, so it is
		// expected here — and this probe is expected to keep missing as
		// no-scout-op until Raven routes named entities (upstream class, with
		// #124), which is exactly what the artifact should keep saying.
		q: "freighter",
		expect: ["resolveProject", "searchProjects"],
		note: "demand: project by bare name (held, strict match)",
	},
	{
		q: "zk-snark",
		expect: ["searchRepos", "searchProjects"],
		note: "demand: tech/repo search (22×)",
	},
	{
		// Re-checked 2026-09-05 against the data, not just the description: the
		// live open rows are SCF sponsor briefs ("Stellar-compatible LayerZero
		// DVN", "x402 Facilitator with Bazaar Discovery") — funded build
		// opportunities, i.e. the BOUNTY half of this question. No scout op
		// holds jobs or freelance gigs, and the spec routes the worker side
		// here by contract (getBuilders.notFor). So getRfps stays the intended
		// op; "jobs" in its description is the over-claim, not this expectation.
		q: "jobs bounties and freelance work for Stellar contributors",
		expect: ["getRfps"],
		note: "demand: jobs/bounties (2×) — RFP briefs are the bounty half",
	},
	// ── prior-art over hackathon prototypes (searchHackathonBuilds, #693) ──
	// LAGGING until Raven re-baselines its catalog — the eval skips a not-yet-
	// cataloged op rather than flagging it, then starts grading once it lands.
	{
		q: "has anyone built a recurring payments protocol at a Stellar hackathon",
		expect: ["searchHackathonBuilds"],
		note: "prior-art: hackathon prototype lookup",
	},
	{
		q: "what prediction markets were built at Stellar hackathons",
		expect: ["searchHackathonBuilds"],
		note: "prior-art: hackathon builds by topic",
	},
	{
		q: "winning zero-knowledge privacy builds at Stellar hackathons",
		expect: ["searchHackathonBuilds"],
		note: "prior-art: winning hackathon builds",
	},
	// ── CODE / programming: a dev question must reach a CODE op (searchRepos
	// example, explainRepo deep-dive, searchResearch docs) — NOT the project
	// directory or off-Stellar docs. This is why the repos + DeepWiki were indexed.
	{
		q: "show me a Rust example of a Soroban token contract",
		expect: ["searchRepos"],
		note: "code: example repo by language",
	},
	{
		q: "find the Stellar JavaScript and TypeScript SDK repositories",
		expect: ["searchRepos"],
		note: "code: SDK repos",
	},
	{
		q: "flash loan implementation on Soroban",
		expect: ["searchRepos"],
		note: "code: example repo (xycloans)",
	},
	{
		// Narrowed 2026-09-05: searchRepos finds the Blend repo, it does not hold
		// HOW the pool computes a rate — only explainRepo (DeepWiki over the
		// source) answers the question as asked. Accepting the repo search
		// graded a first hop as the answer.
		q: "how does the Blend lending pool calculate interest rates in the code",
		expect: ["explainRepo"],
		note: "code: deep repo mechanism (DeepWiki)",
	},
	{
		q: "explain how passkey-kit verifies a WebAuthn signature on Soroban",
		expect: ["explainRepo", "searchRepos"],
		note: "code: deep repo mechanism (DeepWiki)",
	},
	{
		// Same call as the JS-SDK probe below: bare "how do I write" phrasing
		// correctly routes to stellarDocs (the official contract-authoring docs
		// live there, and that isn't a scout op). The scout-owned version of the
		// question is "find me example contract CODE", which searchRepos exists
		// for — so the probe now asks that.
		q: "find example Soroban smart contract repos written in Rust",
		expect: ["searchRepos"],
		note: "code: example contract repos (how-to phrasing belongs to stellarDocs)",
	},
	{
		q: "how does cross-contract invocation and authorization work in Soroban",
		expect: ["searchResearch", "searchRepos"],
		note: "code: concept/docs",
	},
	{
		// NOT "how do I submit a tx with the JS SDK" — that phrasing correctly
		// routes to stellarDocs.search_sdk_cli_tools_docs (Stellar's OWN SDK docs
		// are the best source for using the official SDK, and that isn't a scout
		// op). Expecting our op to beat the official docs there was a mis-specified
		// probe. The scout-owned version of the question is "find me the example
		// CODE", which is what searchRepos exists for.
		q: "find a JavaScript example repo for building and submitting a Stellar transaction",
		expect: ["searchRepos"],
		note: "code: JS example repo (how-to phrasing belongs to stellarDocs)",
	},
	// ── builder personas (the 2026-09-03 hand battery, now graded on the
	// INTENDED op). Four askers, eight questions each; the four whose answer
	// lives in the docs (no scout op holds it) sit in ADVERSARIAL as observed
	// rows, so the graded denominators are 7 / 5 / 8 / 8. Every `expect` was
	// checked against the DATA, not the description: an op is listed only when
	// its rows carry the answer, and both are listed when two do.
	{
		q: "is anyone actually building on Stellar or is it dead?",
		expect: ["getLeaderboard", "analyzeEcosystem"],
		note: "T1: activity — the activity leaderboard or the EC developer trend (dimension=developers) both answer",
		persona: "T1",
	},
	{
		q: "what can you actually build on Stellar?",
		expect: ["getClusters", "searchProjects"],
		note: "T1: what exists, by category — the cluster map or the directory market map",
		persona: "T1",
	},
	{
		q: "does Stellar have NFTs?",
		expect: ["searchProjects", "getClusters"],
		note: "T1: NFT roster (type filter) or the category count",
		persona: "T1",
	},
	{
		q: "what wallet should I use for Stellar?",
		expect: ["searchProjects", "getPartners"],
		note: "T1: wallets — same call as the wallets probe above (directory 64, partners 5)",
		persona: "T1",
	},
	{
		q: "are there any Stellar hackathons coming up?",
		expect: ["getHackathons"],
		note: "T1: upcoming events",
		persona: "T1",
	},
	{
		q: "who gives out grants for building on Stellar?",
		expect: ["getRfps", "scfPitch", "searchResearch"],
		note: "T1: grants — the open briefs/round (getRfps, scfPitch) or the SCF program itself (research corpus)",
		persona: "T1",
	},
	{
		q: "show me some example Stellar projects I can copy",
		expect: ["searchRepos", "searchProjects"],
		note: "T1: code to fork — repos first; directory rows carry indexed repos inline",
		persona: "T1",
	},
	{
		q: "is Soroswap or SDEX the main DEX on Stellar?",
		expect: ["searchProjects", "getLeaderboard"],
		note: "T2: DEX roster by name, or the TVL ranking (sort=tvl)",
		persona: "T2",
	},
	{
		// The one word searchProjects lacks here is "soroban" — and adding it
		// was measured (replica, 2026-09-05) to make the widest op capture
		// listAudits' "security audit reports for Soroban projects" (#1, the
		// intended op pushed to #2) and climb into ranks 4-8 on five code/docs
		// questions: 8 of the bank's 14 Soroban questions shifted. Raven
		// delists ops for exactly that (sls-078), so the miss is recorded as
		// vocabulary and deliberately left unfixed.
		q: "which Stellar wallets support Soroban contracts?",
		expect: ["searchProjects"],
		note: "T2: wallets by capability (routing-surface-check win-probe); carries the 'contracts' id noun; the missing word is the platform name — fix declined, see comment",
		persona: "T2",
	},
	{
		q: "what oracle should I use for prices on Stellar?",
		expect: ["searchProjects"],
		note: "T2: oracle roster (type=Oracle)",
		persona: "T2",
	},
	{
		q: "has anyone built a lending protocol on Soroban already?",
		expect: ["searchProjects", "vetIdea", "searchHackathonBuilds"],
		note: "T2: prior art — shipped (directory), the composite, or hackathon prototypes",
		persona: "T2",
	},
	{
		q: "what stablecoins are actually live on Stellar?",
		expect: ["getStablecoins"],
		note: "T2: stablecoin registry",
		persona: "T2",
	},
	{
		q: "which Stellar projects had a smart contract audit published in the last year?",
		expect: ["listAudits"],
		note: "T3: audit registry (win-probe); carries the 'projects' and 'contract' id nouns",
		persona: "T3",
	},
	{
		q: "how does Blend calculate interest accrual?",
		expect: ["explainRepo"],
		note: "T3: code mechanism (win-probe)",
		persona: "T3",
	},
	{
		q: "which repos use soroban-sdk version 22?",
		expect: ["searchRepos"],
		note: "T3: repo index by toolchain",
		persona: "T3",
	},
	{
		q: "who are the most active Stellar contributors outside SDF?",
		expect: ["getBuilders"],
		note: "T3: builders are ordered by their joined 90-day commit activity — the 09-03 'hit' here was compareHackathons",
		persona: "T3",
	},
	{
		q: "which anchors actually implement SEP-24?",
		expect: ["getPartners"],
		note: "T3: partner rows carry `seps` read from each anchor's stellar.toml",
		persona: "T3",
	},
	{
		q: "show me Soroban contracts that have been audited by Certora",
		expect: ["listAudits", "listContracts"],
		note: "T3: auditor filter, or contract rows joined to their audit records",
		persona: "T3",
	},
	{
		// The 09-03 hint said "changelog" — that is the API-surface changelog
		// (getChangelog), which does not hold ecosystem change. The change FEED
		// (rows moved since a time) and the funding snapshot delta do.
		q: "what changed in the Stellar ecosystem in the last month?",
		expect: ["getChanges", "analyzeEcosystem"],
		note: "T3: change feed since a time, or the funding snapshotDelta — not getChangelog",
		persona: "T3",
	},
	{
		q: "which Stellar repos are archived or unmaintained?",
		expect: ["searchRepos"],
		note: "T3: repo activityState",
		persona: "T3",
	},
	{
		q: "which SCF-funded projects are now inactive or abandoned?",
		expect: ["searchProjects"],
		note: "T4: ?scfAwarded=1&status=Inactive (an exampleQuestion verbatim)",
		persona: "T4",
	},
	{
		q: "how much has the Stellar Community Fund awarded in total?",
		expect: ["analyzeEcosystem"],
		note: "T4: SCF funding total (win-probe)",
		persona: "T4",
	},
	{
		q: "what percentage of hackathon winners are still building?",
		expect: ["analyzeEcosystem", "compareHackathons", "getHackathon"],
		note: "T4: post-hackathon status funnel / cohort durability / per-event outcome stats — searchHackathonBuilds (the 09-03 top hit) carries no still-building state",
		persona: "T4",
	},
	{
		q: "which verticals on Stellar have the least competition?",
		expect: ["getClusters", "analyzeEcosystem"],
		note: "T4: whitespace — crowdedness scores or dimension=gaps",
		persona: "T4",
	},
	{
		q: "how many SCF-funded projects have no public repository?",
		expect: ["searchProjects"],
		note: "T4: scfAwarded=1 rows carry indexed repos inline; meta.counts answers how-many",
		persona: "T4",
	},
	{
		q: "which Stellar projects have the most on-chain usage?",
		expect: ["listContracts", "searchProjects"],
		note: "T4: contract rows rank live usage first; project rows carry `onchain` inline (getLeaderboard has no usage sort)",
		persona: "T4",
	},
	{
		q: "what is the total value locked across Stellar DeFi?",
		expect: ["analyzeEcosystem", "getLeaderboard"],
		note: "T4: TVL rollup or sort=tvl",
		persona: "T4",
	},
	{
		q: "which SCF rounds produced the most lasting projects?",
		expect: ["searchProjects", "analyzeEcosystem"],
		note: "T4: composable — project rows carry scf.awardedRounds + status; analyze byRound is the round rollup (count + USD, no status)",
		persona: "T4",
	},
];

// Adversarial / edge questions — chosen to THROW Raven off: off-topic, no-such-
// capability, cross-chain, negation, typos. We RECORD what routed (observed, not
// graded): there's no single "right" scout op, so a scout hit here isn't per se
// a finding — but a confident scout route to an off-topic/absent-capability
// question is worth eyeballing (does Raven over-claim, or hand off honestly?).
const ADVERSARIAL: Array<{ q: string; note: string; persona?: Persona }> = [
	{
		q: "what is the current price of XLM",
		note: "no price-feed capability — should NOT confidently claim a scout op",
	},
	{ q: "tell me about Solana", note: "off-topic (not Stellar)" },
	{ q: "how do I buy Bitcoin", note: "off-topic" },
	{
		q: "compare Ethereum and Stellar total value locked",
		note: "cross-chain — Ethereum half is out of scope",
	},
	{
		q: "Stellar projects that are NOT funded by SCF",
		note: "negation — easy to invert",
	},
	{
		q: "sorobon lending protcols",
		note: "typos — should still fuzzy-route to searchProjects",
	},
	{
		q: "list all Stellar mainnet validators",
		note: "validator-set capability we don't have",
	},
	{
		q: "who is the CEO of the Stellar Development Foundation",
		note: "person → getPeople (Denelle Dixon)",
	},
	// Persona questions whose answer lives in the docs — no scout op holds it,
	// so a scout op on top would be an over-claim, not a hit. Observed only.
	{
		q: "how do I make a smart contract on Stellar?",
		note: "T1: docs how-to (stellarDocs) — no scout op holds it",
		persona: "T1",
	},
	{
		q: "can I use Solidity on Stellar?",
		note: "T2: docs feasibility — no scout op holds it",
		persona: "T2",
	},
	{
		q: "what is the difference between Horizon and Soroban RPC?",
		note: "T2: docs concept — no scout op holds it",
		persona: "T2",
	},
	{
		q: "how do I get testnet USDC on Stellar?",
		note: "T2: docs how-to — no scout op holds it",
		persona: "T2",
	},
];

const TOP_K = 3; // the op must land in the top-K scout hits to count as routed

let _id = 0;
async function rpc(method: string, params: unknown, session?: string) {
	_id += 1;
	const res = await fetch(URL as string, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			"User-Agent": "curl/8.6.0",
			Authorization: `Bearer ${TOKEN}`,
			...(session ? { "Mcp-Session-Id": session } : {}),
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: _id, method, params }),
	});
	const sid = res.headers.get("Mcp-Session-Id");
	const raw = await res.text();
	let json = raw;
	if (
		raw.startsWith("event:") ||
		raw.includes("\ndata:") ||
		raw.startsWith("data:")
	) {
		for (const line of raw.split("\n"))
			if (line.startsWith("data:")) {
				json = line.slice(5).trim();
				break;
			}
	}
	try {
		return { body: JSON.parse(json) as Record<string, unknown>, sid };
	} catch {
		return { body: null, sid };
	}
}

/** First text content block of a tools/call result (Raven appends coaching
 *  prose after the JSON on some tools, so parse the leading value only). */
function firstText(body: Record<string, unknown> | null): string {
	return (
		((body?.result as { content?: Array<{ text?: string }> })?.content ?? [])[0]
			?.text ?? ""
	);
}
function parseLeadingJson<T>(text: string, fallback: T): T {
	try {
		return JSON.parse(text) as T;
	} catch {
		const end = Math.max(text.lastIndexOf("]"), text.lastIndexOf("}"));
		if (end < 0) return fallback;
		try {
			return JSON.parse(text.slice(0, end + 1)) as T;
		} catch {
			return fallback;
		}
	}
}

/** Raven's committed catalog/manifest.json — descriptions + routing keywords. */
interface Manifest {
	generatedAt?: string;
	entries?: Array<{
		id: string;
		description?: string;
		routingKeywords?: string[];
	}>;
}

interface Hit {
	id: string;
	service: string;
	score: number;
}
function hitsOf(body: Record<string, unknown> | null): Hit[] {
	const text = (
		(body?.result as { content?: Array<{ text?: string }> })?.content ?? []
	)
		.map((c) => c.text ?? "")
		.join("\n");
	try {
		return (JSON.parse(text).hits ?? []) as Hit[];
	} catch {
		return [];
	}
}

interface OpEvidence {
	op: string;
	/** Live 1-based rank among scout hits, null = not returned. */
	liveRank: number | null;
	/** Replica rank among scout ops on OUR current text. */
	replicaRankOurs: number | null;
	/** Replica rank on the text Raven indexes (null when its keywords are unknown). */
	replicaRankLive: number | null;
	/** Question words our text carries and the indexed text does not. */
	lagTokens: string[];
	/** Words of our WHOLE spec text for this op (description + routing keywords)
	 *  that the text Raven indexes lacks — the lag itself, question-independent. */
	specNotLive: string[];
	score: number | null;
	gate: number;
	coverage: number;
	missing: string[];
	missingWords: string[];
	exactPhrase: boolean;
	rescued: boolean;
}

interface Miss {
	query: string;
	persona?: Persona;
	expect: string[];
	rank: null;
	topScout: string[];
	topAll: string[];
	note: string;
	missClass: MissClass;
	evidence: {
		/** Id nouns of OTHER ops in the question that outranked the intended op live. */
		collisions: Array<{
			noun: string;
			token: string;
			op: string;
			rank: number;
		}>;
		/** Replica scoring of each cataloged expected op on this question. */
		intended: OpEvidence[];
		/** The scout op that won live, with its live score and replica scores. */
		winner: {
			op: string;
			liveScore: number;
			replicaScoreLive: number | null;
			replicaScoreOurs: number | null;
		} | null;
		/** Missing words the directory resolver recognises as project names. */
		projectNames: string[];
		/** Only on catalog-lag: what our spec carries that the LIVE text does not. */
		lagEvidence?: Array<{
			op: string;
			/** Words OF THIS QUESTION ours carries and the indexed text lacks. */
			inQuestion: string[];
			/** Words of our whole spec text for the op the live text lacks. */
			inSpecNotLive: string[];
		}>;
		/** Only on could-not-check: which resolver call failed, and why. */
		resolverError?: string;
	};
}

const OURS = buildScoutEntries(spec);
const ourEntry = (op: string) => OURS.find((e) => e.name === op);

/** Is this word a project name? The directory's own resolver decides.
 *  An error is NOT "no" — it returns `{ error }` so the classifier can fail
 *  closed into could-not-check instead of blaming our vocabulary. */
async function isProjectName(word: string): Promise<NameVerdict> {
	try {
		const res = await fetch(
			`${BASE}/api/projects/resolve?q=${encodeURIComponent(word)}`,
			{ signal: AbortSignal.timeout(10_000) },
		);
		if (!res.ok) return { error: `resolve HTTP ${res.status}` };
		const body = (await res.json()) as { found?: boolean };
		return body.found === true;
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
}

async function main() {
	const init = await rpc("initialize", {
		protocolVersion: "2025-03-26",
		capabilities: {},
		clientInfo: { name: "sl-raven-routing", version: "1" },
	});
	const sid = init.sid ?? "";
	await rpc("notifications/initialized", {}, sid).catch(() => {});

	// Raven's live scout catalog (same vocabulary-union sweep as the drift guard)
	// — an op absent here is LAGGING, and questions expecting it are skipped.
	const sweepCode = `const qs=["projects search directory","repos code search","builders people leaderboard","hackathons compare winners","research corpus semantic","skills marketplace list","partners anchors match","clusters topics analyze ecosystem","changelog status health","audits security reports stablecoins market cap","people person lookup identity","rfps grants open","feedback submit","explain repo deepwiki","resolve renamed superseded project name","contracts registry mainnet verified","changes data rows changed","vet idea competitors","pitch scf round","repo trust maintained","hackathon brief","rwa assets tokenized","verify claim"];const rs=await Promise.all(qs.map(q=>codemode.search(q,{service:"scout",limit:20})));const ids=new Set();for(const r of rs)for(const h of (r.hits??[]))if(h.id&&h.id.startsWith("scout."))ids.add(h.id);return [...ids].sort();`;
	const sweep = await rpc(
		"tools/call",
		{ name: "execute", arguments: { code: sweepCode } },
		sid,
	);
	const catalog = new Set(
		parseLeadingJson<string[]>(firstText(sweep.body), []).map((id) =>
			id.replace(/^scout\./, ""),
		),
	);

	// The consumer's ACTUAL view: the description the gateway serves per op
	// (authoritative), plus the routing keywords from Raven's committed
	// manifest when it carries the same description. This is what the
	// catalog-lag class is measured against.
	const descCode = `const c=await codemode.catalog();const es=Array.isArray(c)?c:(c.entries??c.items??[]);return es.filter(e=>e.id&&e.id.startsWith("scout.")).map(e=>({id:e.id,description:e.description}));`;
	const desc = await rpc(
		"tools/call",
		{ name: "execute", arguments: { code: descCode } },
		sid,
	);
	const liveDescriptions = parseLeadingJson<
		Array<{ id: string; description: string }>
	>(firstText(desc.body), []);
	let manifest: Manifest | null = null;
	try {
		const res = await fetch(MANIFEST_URL, {
			signal: AbortSignal.timeout(20_000),
		});
		if (res.ok) manifest = (await res.json()) as Manifest;
	} catch {}
	const LIVE = new Map<string, ReturnType<typeof liveScoutEntry>>();
	for (const d of liveDescriptions) {
		const m = manifest?.entries?.find((e) => e.id === d.id) ?? null;
		LIVE.set(
			d.id.replace(/^scout\./, ""),
			liveScoutEntry(d.id, d.description, m),
		);
	}
	const liveEntries = [...LIVE.values()];
	const laggingOps = OURS.filter((o) => {
		const l = LIVE.get(o.name);
		return l && lagTokens(o.description, o, l).length > 0;
	}).map((o) => ({
		op: o.name,
		unseenLive: lagTokens(o.description, o, LIVE.get(o.name) as ScoutEntry),
	}));
	console.log(
		`raven-routing: Raven catalog has ${catalog.size} scout ops (${liveDescriptions.length} descriptions read, manifest ${manifest?.generatedAt ?? "unavailable"}, keywords known for ${liveEntries.filter((e) => e.keywordsKnown).length}); ${laggingOps.length} op description(s) lag our spec: ${laggingOps.map((l) => l.op).join(", ") || "none"}`,
	);
	console.log(
		`raven-routing: grading ${BANK.length} natural questions on the INTENDED op (top-${TOP_K} scout hits)…\n`,
	);

	interface Result {
		query: string;
		persona?: Persona;
		expect: string[];
		rank: number | null;
		topScout: string[];
		topAll: string[];
		pass: boolean;
	}
	const results: Result[] = [];
	const misses: Miss[] = [];
	const lagging: Array<{ query: string; expect: string[] }> = [];
	// Replica self-check: for every live scout hit whose indexed keywords are
	// known, does the replica reproduce Raven's score exactly?
	const agreement = { compared: 0, exact: 0, within5pct: 0 };

	for (const item of BANK) {
		const cataloged = item.expect.filter((op) => catalog.has(op));
		if (cataloged.length === 0) {
			lagging.push({ query: item.q, expect: item.expect });
			console.log(
				`  · [lag] "${item.q}" — ${item.expect.join("/")} not yet in Raven's catalog, skipped`,
			);
			continue;
		}
		const r = await rpc(
			"tools/call",
			{ name: "search", arguments: { query: item.q } },
			sid,
		);
		const hits = hitsOf(r.body);
		const scoutScored = hits
			.filter((h) => h.service === "scout")
			.map((h) => ({ op: h.id.replace(/^scout\./, ""), score: h.score }));
		const scoutHits = scoutScored.map((s) => s.op);
		for (const s of scoutScored) {
			const live = LIVE.get(s.op);
			if (!live?.keywordsKnown) continue;
			const rep = explain(live, item.q).score;
			agreement.compared++;
			if (rep === s.score) agreement.exact++;
			if (rep !== null && Math.abs(rep - s.score) <= 0.05 * s.score)
				agreement.within5pct++;
		}
		const topScout = scoutHits.slice(0, TOP_K);
		const topAll = hits.slice(0, 3).map((h) => h.id);
		const idx = scoutHits.findIndex((op) => cataloged.includes(op));
		const rank = idx < 0 ? null : idx + 1;
		const pass = rank !== null && rank <= TOP_K;
		results.push({
			query: item.q,
			...(item.persona ? { persona: item.persona } : {}),
			expect: item.expect,
			rank,
			topScout,
			topAll,
			pass,
		});
		if (pass) {
			process.stdout.write(".");
			continue;
		}

		// ── classify the miss from evidence ──
		const liveRank = (op: string) => {
			const i = scoutHits.indexOf(op);
			return i < 0 ? null : i + 1;
		};
		const rankOurs = scoutRanking(OURS, item.q);
		const rankLive = scoutRanking(
			liveEntries.filter((e) => e.keywordsKnown),
			item.q,
		);
		const intended: OpEvidence[] = cataloged.map((op) => {
			const ours = ourEntry(op);
			const live = LIVE.get(op);
			const ex = ours
				? explain(ours, item.q)
				: {
						score: null,
						gate: 0,
						coverage: 0,
						missing: [],
						missingWords: [],
						exactPhrase: false,
						rescued: false,
					};
			const ro = rankOurs.indexOf(op);
			const rl = rankLive.indexOf(op);
			// Unknown live keywords are assumed equal to ours, so lag is then
			// measured on descriptions only — never blamed on invisible text.
			const liveForLag =
				ours && live
					? live.keywordsKnown
						? live
						: { ...live, routingKeywords: ours.routingKeywords }
					: null;
			return {
				op,
				liveRank: liveRank(op),
				replicaRankOurs: ro < 0 ? null : ro + 1,
				replicaRankLive: live?.keywordsKnown ? (rl < 0 ? null : rl + 1) : null,
				lagTokens:
					ours && liveForLag ? lagTokens(item.q, ours, liveForLag) : [],
				specNotLive:
					ours && liveForLag
						? lagTokens(
								[ours.description, ...ours.routingKeywords].join(" "),
								ours,
								liveForLag,
							)
						: [],
				...ex,
			};
		});
		const bestLiveRank = Math.min(
			...intended.map((i) => i.liveRank ?? Number.POSITIVE_INFINITY),
		);
		const collisions = idNounCollisions(item.q, OURS, new Set(item.expect))
			.map((c) => ({ ...c, rank: liveRank(c.op) }))
			.filter((c): c is typeof c & { rank: number } => c.rank !== null)
			.filter((c) => c.rank < bestLiveRank);
		const winnerOp = scoutHits[0];
		const winnerLive = winnerOp ? LIVE.get(winnerOp) : undefined;
		const winner = winnerOp
			? {
					op: winnerOp,
					liveScore: scoutScored[0].score,
					replicaScoreLive: winnerLive?.keywordsKnown
						? explain(winnerLive, item.q).score
						: null,
					replicaScoreOurs: ourEntry(winnerOp)
						? explain(ourEntry(winnerOp) as ScoutEntry, item.q).score
						: null,
				}
			: null;
		// Our current text would route it (top-K on the replica) and the text
		// Raven indexes lacks words of the question that ours carries.
		const lagged = intended.filter(
			(i) =>
				i.lagTokens.length > 0 &&
				i.replicaRankOurs !== null &&
				i.replicaRankOurs <= TOP_K &&
				(i.replicaRankLive === null || i.replicaRankLive > TOP_K),
		);
		const best = [...intended].sort(
			(a, b) =>
				a.missingWords.length - b.missingWords.length ||
				b.coverage - a.coverage,
		)[0];
		// catalog-lag FIRST (see scripts/eval/raven-miss-class.ts): text upstream
		// has not absorbed yet is not an id-noun collision and not a hole in our
		// vocabulary, whatever else the live ranking looks like.
		const { missClass, projectNames, resolverError } = await classifyMiss({
			scoutHits,
			collisions,
			lagged,
			best,
			resolveProjectName: isProjectName,
		});
		// Every lag miss carries what our spec says and the live text doesn't —
		// both the question's words (why THIS question missed) and the whole
		// op's (the lag itself, so the re-baseline has something to check).
		const lagEvidence = lagged.map((l) => ({
			op: l.op,
			inQuestion: l.lagTokens,
			inSpecNotLive: l.specNotLive,
		}));

		misses.push({
			query: item.q,
			...(item.persona ? { persona: item.persona } : {}),
			expect: item.expect,
			rank: null,
			topScout,
			topAll,
			note: item.note,
			missClass,
			evidence: {
				collisions,
				intended,
				winner,
				projectNames,
				...(missClass === "catalog-lag" ? { lagEvidence } : {}),
				...(resolverError ? { resolverError } : {}),
			},
		});
		const why =
			missClass === "catalog-lag"
				? `${lagged[0].op} would rank #${lagged[0].replicaRankOurs} on our text; Raven's text lacks [${lagged[0].lagTokens.join(", ")}] (live rank ${lagged[0].replicaRankLive ?? "gated/unknown"}); spec words absent from the live description: [${lagEvidence[0].inSpecNotLive.join(", ") || "none"}]`
				: missClass === "no-scout-op"
					? "no scout hit at all"
					: missClass === "id-noun-exclusion"
						? `noun "${collisions[0].token}" → ${collisions[0].op} live #${collisions[0].rank}`
						: missClass === "named-entity"
							? `${best.op} lacks only project names [${projectNames.join(", ")}]`
							: missClass === "vocabulary"
								? `${best.op} lacks [${best.missingWords.join(", ")}] (coverage ${best.coverage}, gate ${best.gate}, replica rank ${best.replicaRankOurs ?? "gated"})`
								: missClass === "could-not-check"
									? `unclassified — ${resolverError}`
									: `${best.op} covers every word, replica rank ${best.replicaRankOurs ?? "gated"}, lost to ${winnerOp} live`;
		console.log(
			`\n  ✗ [${missClass}${item.persona ? ` ${item.persona}` : ""}] "${item.q}"\n      want ${cataloged.join("/")} · got top-${TOP_K} scout: ${topScout.join(", ") || "none"} · all: ${topAll.join(", ")}\n      ${why}`,
		);
	}

	// ── DEMAND phase: the questions REAL users ask most and we MISS ──────────────
	// Not a curated list — the actual high-frequency misses Engine D mined from
	// api-usage. Ask Raven each: does OUR directory (a scout op) even get REACHED
	// in the top hits, or does a frequently-asked question route entirely to
	// docs/lumenloop? A miss here is weighted by how OFTEN it's asked.
	let demand: Array<{ query: string; hits: number }> = [];
	try {
		const dd = JSON.parse(readFileSync(DEMAND, "utf8")) as {
			misses?: Array<{ query?: string; hits?: number; class?: string }>;
		};
		demand = (dd.misses ?? [])
			.map((m) => ({
				query: String(m.query ?? ""),
				hits: Number(m.hits ?? 0),
				// engine-d already decided whether each miss is a ranking problem
				// or a hole in the corpus. Dropping that verdict here re-graded
				// every curation gap as a consumer routing defect.
				cls: String(m.class ?? ""),
			}))
			.filter(
				(m) =>
					m.query &&
					!isSyntheticQuery(m.query) &&
					// same fabricated-canary filter the ledger uses — this lane
					// reads engine-d's misses, so it inherits the same six
					!isFabricatedProbe(m.query) &&
					// A BARE NAME we do not hold is not a routing defect. Six rows
					// — openx402, hypertron, planbok, vigente, cointracker, alypay —
					// sat open on the routing surface as consumer defects no routing
					// change could ever close. Verified live: each returns
					// matchMode "semantic" with the advisory "NEIGHBOURS, not
					// matches ... the answer is no". Routing to searchProjects was
					// correct; we simply do not have the project. They stay as
					// engine-d curation findings, which is the surface that can act.
					//
					// Length is the discriminator, and it is doing real work rather
					// than approximating: engine-d stamps GAP by probing the live API
					// with the whole literal sentence against a substring-matched
					// `q`, so a natural-language question is stamped GAP even when we
					// hold the answer. "what disbursement or payout providers can i
					// integrate on stellar?" is GAP and yet returns five rows (SDP,
					// DCM, ElementPay) — a genuine routing finding that must survive
					// this filter. Only short bare names are skipped.
					!(
						(m.cls === "GAP" || m.cls === "EMPTY") &&
						m.query.trim().split(/\s+/).length <= 2
					),
			)
			.sort((a, b) => b.hits - a.hits)
			.slice(0, 15);
	} catch {}
	const demandMisses: Array<{ query: string; hits: number; topAll: string[] }> =
		[];
	if (demand.length) {
		console.log(
			`\n\nraven-routing: demand — ${demand.length} most-asked-and-missed real queries, does OUR directory get reached?`,
		);
		for (const d of demand) {
			const r = await rpc(
				"tools/call",
				{ name: "search", arguments: { query: d.query } },
				sid,
			);
			const hits = hitsOf(r.body);
			const topAll = hits.slice(0, 3).map((h) => h.id);
			const scoutRank = hits.findIndex((h) => h.service === "scout");
			const reached = scoutRank >= 0 && scoutRank < TOP_K;
			if (reached) {
				process.stdout.write(".");
			} else {
				demandMisses.push({ query: d.query, hits: d.hits, topAll });
				console.log(
					`\n  ✗ [${d.hits}×] "${d.query.slice(0, 46)}" → ${topAll[0] ?? "none"} (no scout op in top-${TOP_K})`,
				);
			}
		}
	}

	// ── ADVERSARIAL: questions built to THROW Raven off — observed, not graded ──
	const adversarial: Array<{
		query: string;
		persona?: Persona;
		top: string;
		topScout: string | null;
		note: string;
	}> = [];
	console.log(
		`\n\nraven-routing: adversarial — how does Raven route trick questions?`,
	);
	for (const a of ADVERSARIAL) {
		const r = await rpc(
			"tools/call",
			{ name: "search", arguments: { query: a.q } },
			sid,
		);
		const hits = hitsOf(r.body);
		const top = hits[0]?.id ?? "none";
		const topScout = hits.find((h) => h.service === "scout")?.id ?? null;
		adversarial.push({
			query: a.q,
			...(a.persona ? { persona: a.persona } : {}),
			top,
			topScout,
			note: a.note,
		});
		console.log(`  · "${a.q.slice(0, 46)}" → ${top}`);
	}

	const graded = results.length;
	const passed = results.filter((r) => r.pass).length;
	// A zero denominator is VACUOUS, not a pass. `okRate: 1` on an empty catalog
	// parse (or a bank every item of which was lag-skipped) reads as 100% routed
	// on every dashboard downstream — the artifact must say it graded nothing.
	const vacuous = graded === 0;
	const okRate = vacuous ? null : Math.round((passed / graded) * 100) / 100;
	const byPersona = Object.fromEntries(
		PERSONAS.map((p) => {
			const rows = results.filter((r) => r.persona === p);
			const ok = rows.filter((r) => r.pass).length;
			return [
				p,
				{
					graded: rows.length,
					passed: ok,
					failed: rows.length - ok,
					rate: rows.length ? Math.round((ok / rows.length) * 100) / 100 : null,
				},
			];
		}),
	);
	const missClasses = Object.fromEntries(
		MISS_CLASSES.map((c) => [
			c,
			misses.filter((m) => m.missClass === c).length,
		]),
	);
	const artifact = {
		generatedAt: new Date().toISOString(),
		gateway: URL,
		scoring: {
			basis: `intended-op: PASS only when one of the item's expected operation ids is within the top-${TOP_K} scout hits; rank = 1-based position of the first expected op among scout hits (null = not returned)`,
			evidence:
				"missClass evidence comes from scripts/eval/raven-scorer-replica.ts — Raven's lexical scoring math run over our current spec text AND over the text Raven indexes (live descriptions + manifest routing keywords); the live ranking is the truth, the replica explains it",
			classes: MISS_CLASSES,
		},
		catalogView: {
			descriptionsRead: liveDescriptions.length,
			manifestGeneratedAt: manifest?.generatedAt ?? null,
			keywordsKnownFor: liveEntries.filter((e) => e.keywordsKnown).length,
			laggingOps, // ops whose live description lacks words ours carries
		},
		replicaAgreement: agreement,
		frame: {
			graded,
			passed,
			vacuous,
			failed: misses.length,
			lagging: lagging.length,
			demandChecked: demand.length,
			demandMissed: demandMisses.length,
			byPersona,
		},
		okRate,
		missClasses,
		results,
		misses,
		lagging, // cataloged-lag skips — surfaced for context, NOT findings
		demandMisses, // real high-frequency questions whose answer isn't OUR directory
		adversarial, // trick questions — observed routing, not graded
	};
	writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
	console.log(
		vacuous
			? `\n\nraven-routing: vacuous — nothing graded (0 of ${BANK.length} bank items reached a cataloged op; ${lagging.length} lag-skipped). okRate is null, NOT 100%.`
			: `\n\nraven-routing: intended-op ${passed}/${graded} routed (${(okRate as number) * 100}%) · ${misses.length} miss(es) · ${lagging.length} lagging`,
	);
	console.log(
		`  by persona: ${PERSONAS.map((p) => `${p} ${byPersona[p].passed}/${byPersona[p].graded}`).join(" · ")}`,
	);
	console.log(
		`  miss classes: ${Object.entries(missClasses)
			.map(([c, n]) => `${c} ${n}`)
			.join(" · ")}`,
	);
	console.log(
		`  replica vs live score: exact ${agreement.exact}/${agreement.compared}, within 5% ${agreement.within5pct}/${agreement.compared}`,
	);
	console.log(
		`raven-routing: demand ${demand.length - demandMisses.length}/${demand.length} most-asked queries reach our directory · ${demandMisses.length} don't`,
	);
	console.log("  wrote → improvements/engine/raven-routing-latest.json");
	console.log(
		"  next: pnpm exec tsx scripts/improvement-ledger.ts   (ingests misses as surface:consumer)",
	);
}

main().catch((e) => {
	console.error("raven-routing failed:", e instanceof Error ? e.message : e);
	process.exit(1);
});
