/**
 * Which project owns a repo discovered by expanding a bare-org GitHub link.
 *
 * A bare-org link (github.com/luanlabs) fans out to every repo in the org, and
 * the org was attributed wholesale to ONE project — the most prominent of the
 * projects linking it. That is right when an org hosts one product and wrong
 * whenever a studio ships several: LuanLabs builds both Wagent and Fluxity, so
 * luanlabs/fluxity-api, luanlabs/fluxity-interface and luanlabs/fluxity.finance
 * were served under project Wagent while their own descriptions said Fluxity
 * (stellar-raven sls-068). A consumer reading that field attributes one
 * company's source code to another product.
 *
 * The repo name already says who it belongs to. When a sibling project sharing
 * the org is named by the repo, that sibling wins over the org's prominence
 * winner.
 */

export interface OrgSibling {
	slug: string;
	name?: string | null;
	prominence?: number | null;
}

/** Lowercase alphanumerics only: "fluxity.finance" → "fluxityfinance". */
function squash(s: string): string {
	return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Shortest identifier that can claim a repo. Below this, common fragments
 * ("api", "web", "app") would let an unrelated project capture a sibling's
 * repos — the same misattribution in the other direction.
 */
const MIN_CLAIM_LENGTH = 4;

/**
 * The sibling a repo NAMES, or null when none does.
 *
 * A sibling claims the repo when the repo name begins with the sibling's slug
 * or display name. Longest match wins, so "wagent-payment" goes to `wagent`
 * even if a shorter sibling also matched. Ties break on prominence, then slug,
 * so the result never depends on project ordering.
 */
export function repoNameOwner(
	repoName: string,
	siblings: OrgSibling[],
): OrgSibling | null {
	const repo = squash(repoName);
	if (!repo) return null;
	let best: { sib: OrgSibling; len: number } | null = null;
	for (const sib of siblings) {
		for (const raw of [sib.slug, sib.name ?? ""]) {
			const id = squash(raw);
			if (id.length < MIN_CLAIM_LENGTH) continue;
			if (!repo.startsWith(id)) continue;
			if (
				!best ||
				id.length > best.len ||
				(id.length === best.len &&
					((sib.prominence ?? 0) > (best.sib.prominence ?? 0) ||
						((sib.prominence ?? 0) === (best.sib.prominence ?? 0) &&
							sib.slug < best.sib.slug)))
			) {
				best = { sib, len: id.length };
			}
		}
	}
	return best?.sib ?? null;
}
