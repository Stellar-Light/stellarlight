/**
 * Shared /ask partner-intent detection — used by BOTH the ask-search client
 * and the /api/ask/answer route. They must build the IDENTICAL /api/partners
 * URL or the answer's citations won't line up with the cards the user sees.
 */

// Map a natural-language question to a partner type so "who can audit my
// contract" reliably surfaces the audit firms, "find an anchor" the anchors —
// partner keyword-search alone misses verbose questions.
export const PARTNER_INTENT: { re: RegExp; type: string }[] = [
	{ re: /audit|security review|secure (my|the)|pen ?test|vulnerab|formal verif/i, type: "audit-firm" },
	{ re: /\banchor\b|on.?ramp|off.?ramp|fiat|cash.?(in|out)|remittance/i, type: "anchor" },
	{ re: /\bwallet\b|custody|custodian/i, type: "wallet" },
	{ re: /infra(structure)?|\brpc\b|\bnode\b|indexer/i, type: "infrastructure" },
	{ re: /legal|compliance|regulat|licen[sc]/i, type: "legal" },
	{ re: /market(ing)?|\bagency\b|growth|go.?to.?market/i, type: "agency" },
	{ re: /tooling|\bsdk\b|dev tool/i, type: "tooling" },
];

export function partnerQueryFor(q: string): string {
	const hit = PARTNER_INTENT.find((p) => p.re.test(q));
	return hit ? `type=${hit.type}` : `q=${encodeURIComponent(q)}`;
}
