/**
 * Experiments Lab — engine #2 of the self-improvement system.
 *
 * A registry of in-flight experiments. Each runs behind a FLAG that defaults
 * OFF, so a variant is live-testable (via `?exp=<id>` or an `X-Experiments`
 * header, or a global env canary) WITHOUT changing what agents / prod see.
 * The loop: propose → run behind the flag → the eval harness scores it vs
 * baseline (scripts/experiment-eval.ts) → graduate (flip `defaultOn` → ship in
 * the contract) or kill. The live board is at /experiments.
 *
 * Guardrail: an experiment is only "won" against a GROUND-TRUTH metric — never
 * an adversarial "is it better?" vibe (see the repo's over-rotation lesson).
 */

export type ExperimentStatus =
	| "proposed"
	| "running"
	| "won"
	| "lost"
	| "graduated";

export interface Experiment {
	id: string;
	title: string;
	hypothesis: string;
	metric: string;
	status: ExperimentStatus;
	/** Default when no flag is passed. false = OFF (not exposed to agents/prod). */
	defaultOn: boolean;
	/** Env var (=1) that force-enables it globally — a canary before graduation. */
	envFlag?: string;
	since: string;
}

export const EXPERIMENTS: Experiment[] = [
	{
		id: "partner-compliance-api",
		title: "Expose partner compliance to the agent API",
		hypothesis:
			"Adding compliance (licenses, KYC, Travel Rule, currencies) to GET /api/partners lets an agent answer 'which anchors are licensed / Travel-Rule compliant / support MXN' from the API alone — closing the profile-only gap so Raven can use it.",
		metric:
			"Golden compliance questions: the variant response carries the answer (e.g. Yellow Card + Bitso flagged travelRule=true, licenses present); baseline can't answer at all.",
		status: "running",
		// NOT exposed to agents/prod yet (boxy: "don't expose it yet"). Test via
		// ?exp=partner-compliance-api. Graduate by flipping this to true + adding
		// `compliance` to the OpenAPI spec.
		defaultOn: false,
		envFlag: "EXP_PARTNER_COMPLIANCE_API",
		since: "2026-07-07",
	},
	{
		id: "partner-onchain-live",
		title: "Expose on-chain 'live on Stellar' proof to the agent API",
		hypothesis:
			"Adding domain-matched on-chain reality (each anchor's OWN issued assets' holders, payment count, stellar.expert rating) to GET /api/partners gives agents the git-free trust signal closed-source anchors otherwise lack — distinguishing a live issuer (Zeam ZARZ ~181k holders, Anclap PEN ~42k) from a barely-used one (AUDD NZDSC 5 holders / 0 payments).",
		metric:
			"Ground truth: the variant carries onchain[] for domain-verified issuers (Etherfuse CETES, MYKOBO's OWN EURC not Circle's, Anclap PEN) with holders/payments > 0; baseline carries no onchain field at all. No misattribution (an anchor merely USING USDC has no USDC onchain entry).",
		status: "running",
		// NOT exposed to agents/prod yet (boxy: "don't expose it yet"). Test via
		// ?exp=partner-onchain-live. Graduate by flipping this to true + adding
		// `onchain` to the OpenAPI spec + republishing the client/MCP surfaces.
		defaultOn: false,
		envFlag: "EXP_PARTNER_ONCHAIN_LIVE",
		since: "2026-07-07",
	},
	{
		id: "scale-model-quality-products",
		title: "Quality-as-product: sell verified data quality, Scale-AI style",
		hypothesis:
			"The engine system's measurements (recall floors, data-truth cross-checks vs SCF/DeepWiki, demand-side OK rate, corpus health) are themselves the product: a public /quality scoreboard + a monthly per-consumer quality report + a DATA_SLA.md turn 'our data is good' from a claim into a verifiable contract — the trust layer that makes stellarlight the default data dependency for Raven and future agents.",
		metric:
			"Ground truth: (1) every scoreboard number traces to a committed engine artifact (no hand-set values); (2) a cold outsider can verify one claim end-to-end from the page alone; (3) first consumer report answers 'what changed for YOUR queries this month' from Engine D data. Adoption signal: Tyler/Raven cites or links the scoreboard.",
		status: "proposed",
		// Design brief: improvements/ideas/idea-scale-model.md. Not a request-flag
		// experiment (it's a surface, not a response variant) — the flag stays
		// off until the /quality page ships behind it.
		defaultOn: false,
		since: "2026-07-10",
	},
];

export const experimentById = (id: string): Experiment | undefined =>
	EXPERIMENTS.find((e) => e.id === id);

/**
 * Is an experiment ON for THIS request? Precedence: per-request opt-in
 * (`?exp=a,b` query or `X-Experiments: a,b` header) → global env canary →
 * the experiment's `defaultOn`. Lets anyone trial a variant on a single
 * request without affecting anyone else.
 */
export function isExperimentOn(
	id: string,
	req?: { url?: string; headers?: { get(name: string): string | null } },
): boolean {
	const exp = experimentById(id);
	if (!exp) return false;

	const optedIn = new Set<string>();
	try {
		if (req?.url) {
			const p = new URL(req.url).searchParams.get("exp");
			if (p) for (const x of p.split(",")) optedIn.add(x.trim());
		}
		const h = req?.headers?.get("x-experiments");
		if (h) for (const x of h.split(",")) optedIn.add(x.trim());
	} catch {
		// bad URL/header → ignore, fall through to defaults
	}
	if (optedIn.has(id)) return true;
	if (exp.envFlag && process.env[exp.envFlag] === "1") return true;
	return exp.defaultOn;
}
