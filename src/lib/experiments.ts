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
