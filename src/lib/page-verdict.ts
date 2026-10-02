/**
 * Page verdict — is the thing a URL serves a PRODUCT, or a corpse wearing
 * a 200?
 *
 * The weekly link check HEAD-requests every website and `site-liveness`
 * is stamped on any row whose site answered. A HEAD cannot see what it
 * answered WITH. On 2026-08-21 an SDF reviewer caught Raven recommending
 * Kulipa first for card services: it had shut down 2026-07-29, but
 * kulipa.xyz still returned 200 with a "changing home / join our waitlist"
 * page, so we called it Live on a site-liveness basis. The same sweep found
 * GetBlockCard (lapsed domain now serving lottery spam), 0xauth (a casino),
 * stellar-battle and triiyo ("is for sale | HugeDomains"), and zilt and
 * sorosan serving an unbuilt "Create Next App" scaffold — 23 placeholders,
 * 45 off-site redirects, all `Live`. A 200 is not a business.
 *
 * Pure and deliberately conservative: "unknown" is the honest default and
 * never triggers anything. Only patterns that are close to unambiguous get
 * a non-product verdict, because this feeds a basis DOWNGRADE (never a
 * status change) and a false "parked" costs a live project its evidence.
 */
import { choiceConfidence, type JevAnswer, type JevQuestion } from "./jev";
import { registrableDomain } from "./partner-project-identity";

export type PageVerdict =
	| "product"
	| "placeholder"
	| "parked"
	| "spam"
	| "scaffold"
	| "offsite-redirect"
	| "unknown";

export interface PageSignals {
	title?: string | null;
	metaDescription?: string | null;
	/** First ~1–2 KB of visible body text, if the caller extracted it. */
	bodyStart?: string | null;
	/** Host the check requested. */
	requestedHost?: string | null;
	/** Host that finally answered (after redirects). */
	finalHost?: string | null;
}

const PARKED =
	/\b(domain (is )?for sale|buy this domain|this domain (is|may be) for sale|hugedomains|sedo\.com|dan\.com|afternic|parked (domain|by)|expireddomains|domain has expired|renew (this|your) domain)\b/i;
const SPAM =
	/\b(togel|toto (togel|macau)|slot gacor|situs (slot|judi|partner)|bocoran|casino|judi online|bandar|c\u1ed5ng game|rbxto|poker online|betting)\b/i;
const SCAFFOLD =
	/^(create next app|react app|vite \+ react|welcome to nginx!?|apache2 (debian|ubuntu) default page|it works!?|index of \/|default web site page|document)$/i;
const PLACEHOLDER =
	/\b(coming soon|under construction|site is under construction|we('| a)re changing home|changing home|home changing|launching soon|stay tuned|join (our|the) waitlist|waitlist only)\b/i;

/** The offsite-redirect test compares these, so a wrong answer here is a wrong
 * VERDICT. `parts.slice(-2)` read every Brazilian host as "com.br", so a
 * redirect from one .com.br site to an unrelated one compared EQUAL and the
 * hop was never flagged — a page that had moved to somebody else's business
 * went on being judged on its own content. Same shape for co.uk, com.au and
 * the rest. src/lib/partner-project-identity.ts already carries the suffix
 * list and its tests; three directory rows sit on .com.br today. */
function registrable(host: string | null | undefined): string {
	const h = (host ?? "")
		.toLowerCase()
		.replace(/^www\./, "")
		.replace(/:\d+$/, "");
	return registrableDomain(h) || h;
}

/** Classify what a URL served. See the file header for why this exists. */
export function classifyPage(s: PageSignals): {
	verdict: PageVerdict;
	reason: string | null;
} {
	const title = (s.title ?? "").trim();
	const meta = (s.metaDescription ?? "").trim();
	const head = `${title} ${meta}`.trim();
	const body = (s.bodyStart ?? "").slice(0, 1500);

	if (
		s.requestedHost &&
		s.finalHost &&
		registrable(s.requestedHost) !== registrable(s.finalHost)
	) {
		// A rebrand and a hijack look identical here; both need a human.
		return {
			verdict: "offsite-redirect",
			reason: `${registrable(s.requestedHost)} → ${registrable(s.finalHost)}`,
		};
	}
	const parked = PARKED.exec(head) ?? PARKED.exec(body);
	if (parked) return { verdict: "parked", reason: parked[0] };
	const spam = SPAM.exec(head);
	if (spam) return { verdict: "spam", reason: spam[0] };
	if (title && SCAFFOLD.test(title))
		return { verdict: "scaffold", reason: title };
	// Placeholder needs the TITLE or META to say so — a body mention of a
	// waitlist is ordinary marketing on a live product and must not count.
	const ph = PLACEHOLDER.exec(head);
	if (ph && head.length < 160) return { verdict: "placeholder", reason: ph[0] };
	if (title || meta) return { verdict: "product", reason: null };
	return { verdict: "unknown", reason: null };
}

/** Verdicts that mean "this page is not evidence the product is alive". */
export const NON_PRODUCT_VERDICTS: ReadonlySet<PageVerdict> = new Set([
	"placeholder",
	"parked",
	"spam",
	"scaffold",
	"offsite-redirect",
]);

// Moved from scripts/check-links.ts (2026-10-03) so every reader of a page
// (the weekly link check, the typed-decision eval) judges the same bytes.
export const NO_PAGE_READ =
	/(^|\.)(github\.com|x\.com|twitter\.com|linkedin\.com|discord\.(gg|com)|t\.me|medium\.com|youtube\.com|apps\.apple\.com|play\.google\.com|npmjs\.com|crates\.io|jsr\.io)$/i;

/** Bounded GET of the first 64 KB so the verdict can see the title/meta.
 * Skipped for hosts where a page title says nothing about a product. */
export async function readPage(
	url: string,
	signal: AbortSignal,
	userAgent: string,
): Promise<{
	title: string | null;
	meta: string | null;
	body: string | null;
	finalUrl: string | null;
}> {
	const host = new URL(url).hostname;
	if (NO_PAGE_READ.test(host))
		return { title: null, meta: null, body: null, finalUrl: null };
	const res = await fetch(url, {
		method: "GET",
		redirect: "follow",
		headers: { "User-Agent": userAgent, Accept: "text/html,*/*;q=0.5" },
		signal,
	});
	const reader = res.body?.getReader();
	let html = "";
	if (reader) {
		const dec = new TextDecoder();
		while (html.length < 65_536) {
			const { value, done } = await reader.read();
			if (done) break;
			html += dec.decode(value, { stream: true });
		}
		try {
			await reader.cancel();
		} catch {}
	}
	const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	const m = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(
		html,
	);
	const body = html
		.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.slice(0, 1500);
	const clean = (x: string | undefined) =>
		x ? x.replace(/\s+/g, " ").trim().slice(0, 200) : null;
	return {
		title: clean(t?.[1]),
		meta: clean(m?.[1]),
		body,
		finalUrl: res.url || null,
	};
}

// ── Jev: the pages classifyPage leaves open ─────────────────────────────────
// classifyPage settles only near-unambiguous pages and calls the rest
// "product" or "unknown". A shutdown notice written in prose, a domain now
// serving somebody else's business, a pivot: no regex catches those. Jev reads
// the page against the project record and answers with a probability, and a
// reading below the bar is "unknown", the same honest default as above.

/** The questions Jev answers about one page. */
export const PAGE_QUESTIONS: Record<"kind" | "same_project", JevQuestion> = {
	kind: {
		type: "choice",
		instructions:
			"What does this web page show, judged against the project record?",
		criteria: {
			product:
				"A working site for this project's product or the company that makes it: a marketing site, app, docs or dashboard.",
			shut_down:
				"The project says it has shut down, been discontinued or sunset, or is no longer operating or taking users.",
			parked: "A parked, for-sale, expired or registrar placeholder domain.",
			unrelated:
				"A different business, a taken-over domain, spam, gambling, or content unrelated to the project.",
			placeholder:
				"A coming-soon, waitlist-only, under-construction, empty, error or default server page.",
		},
	},
	same_project: {
		type: "boolean",
		instructions:
			"Is this page about the same project as the record, by name or by what it does?",
	},
};

export type JevPageKind =
	| "product"
	| "shut_down"
	| "parked"
	| "unrelated"
	| "placeholder";

export const JEV_NON_PRODUCT: ReadonlySet<string> = new Set([
	"shut_down",
	"parked",
	"unrelated",
	"placeholder",
]);

/** The state Jev reads: the record, then what the page served. */
export function pageJevState(
	project: { name: string; description?: string | null; website: string },
	page: {
		title: string | null;
		meta: string | null;
		body: string | null;
		finalUrl: string | null;
	},
): Record<string, unknown> {
	return {
		project: {
			name: project.name,
			description: project.description ?? null,
			website: project.website,
		},
		page: {
			finalUrl: page.finalUrl,
			title: page.title,
			metaDescription: page.meta,
			text: page.body,
		},
	};
}

/** Jev's reading of a page, kept only when it clears the bar. A confident
 * non-product kind wins; a confident "not this project" reads as unrelated
 * (a working site for somebody else is not evidence for this row). */
export function jevPageReading(
	a: Record<"kind" | "same_project", JevAnswer>,
	bar = 0.9,
): {
	kind: JevPageKind | "unknown";
	p: number | null;
	sameProject: number | null;
} {
	const p = choiceConfidence(a.kind);
	const choice = a.kind.type === "choice" ? a.kind.choice : null;
	const sameProject =
		a.same_project.type === "boolean" ? a.same_project.probability : null;
	const confident = choice !== null && p !== null && p >= bar;
	if (confident && JEV_NON_PRODUCT.has(choice))
		return { kind: choice as JevPageKind, p, sameProject };
	if (sameProject !== null && sameProject <= 1 - bar)
		return { kind: "unrelated", p: 1 - sameProject, sameProject };
	if (confident && choice === "product")
		return { kind: "product", p, sameProject };
	return { kind: "unknown", p, sameProject };
}
