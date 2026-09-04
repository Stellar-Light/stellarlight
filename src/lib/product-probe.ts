/** Evidence that a DEPLOYED product actually does Stellar work.
 *
 * `site-liveness` only records that a page answered — a parked domain, a
 * "coming soon" splash and a dead product's marketing site all pass it. This
 * looks at what the live surface actually contains, so the claim moves from
 * "the domain resolves" to "the product references Stellar infrastructure".
 *
 * Deliberately NOT called verification. It observes an integration; it does
 * not exercise a user flow, and it is never evidence that the product WORKS.
 * That distinction is the whole reason it is a separate tier from
 * human-verified, which means a person looked.
 */

/** Markers specific enough that a marketing page about Stellar won't match.
 *  The bare word "stellar" is deliberately absent — it is the name of the
 *  network, so it appears on every page that merely mentions it. */
const MARKERS: Array<{ re: RegExp; kind: string }> = [
	{ re: /horizon(?:-testnet)?\.stellar\.org/i, kind: "horizon-endpoint" },
	{ re: /soroban[-.]rpc|rpc\.stellar\.org|mainnet\.sorobanrpc\.com/i, kind: "soroban-rpc" },
	{ re: /@stellar\/stellar-sdk|stellar-base|js-stellar-sdk|stellar_sdk/i, kind: "stellar-sdk" },
	{ re: /Public Global Stellar Network ; September 2015/, kind: "network-passphrase" },
	{ re: /@creit\.tech\/stellar-wallets-kit|freighter-api|albedo\.link/i, kind: "wallet-integration" },
	{ re: /\bG[A-Z2-7]{55}\b/, kind: "stellar-address" },
	{ re: /\bC[A-Z2-7]{55}\b/, kind: "contract-id" },
];

/** Unambiguous: these phrases only appear when there is no product at all. */
const PLACEHOLDER_HARD =
	/domain (?:is )?for sale|buy this domain|parked (?:free )?(?:by|at)|this domain (?:is|has been) registered|default web page|welcome to nginx|apache2 (?:ubuntu |debian )?default page|account suspended|site not found/i;

/** Ambiguous ALONE: a shipping product routinely labels an unreleased section
 *  "Coming Soon". sendana's real product page says
 *  "Businesses — Coming Soon" and was wrongly read as parked. These count only
 *  on a page with almost no other content, i.e. an actual splash. */
const PLACEHOLDER_SOFT = /coming soon|under construction|launching soon/i;

/** Visible text length below which a page is a splash, not a product. */
const SPLASH_TEXT_CHARS = 1200;

/** Rough visible-text length: strip script/style, then tags. */
function visibleTextLength(html: string): number {
	return html
		.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim().length;
}

/** A page that answered but is not a product — or null when it is one. */
export function placeholderReason(html: string): string | null {
	const hard = html.match(PLACEHOLDER_HARD);
	if (hard) return `parked page ("${hard[0].toLowerCase()}")`;
	const soft = html.match(PLACEHOLDER_SOFT);
	if (soft) {
		const len = visibleTextLength(html);
		if (len < SPLASH_TEXT_CHARS)
			return `splash page ("${soft[0].toLowerCase()}", ${len} chars of text)`;
	}
	return null;
}

export interface ProbeResult {
	/** null = no Stellar evidence found (NOT proof there is none). */
	kind: string | null;
	detail: string;
	/** Where the evidence was seen — the citation for the award. */
	url: string | null;
	/** true when we could not look at all; never treated as a negative. */
	couldNotCheck: boolean;
}

const TOML_PATH = "/.well-known/stellar.toml";
/** Bounded so one heavy site cannot hold the lane open. */
const MAX_BUNDLES = 6;

async function get(
	url: string,
	timeoutMs: number,
): Promise<{ ok: boolean; status: number; body: string } | null> {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			signal: ctrl.signal,
			redirect: "follow",
			headers: {
				// Plain fetch UAs get blocked or served a challenge page, which
				// would read as "no evidence" rather than "could not look".
				"user-agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
				accept: "text/html,application/xhtml+xml,text/plain,*/*",
			},
		});
		const body = (await res.text()).slice(0, 400_000);
		return { ok: res.ok, status: res.status, body };
	} catch {
		return null;
	} finally {
		clearTimeout(t);
	}
}

/** Probe one product URL. Never throws; an unreachable site is could-not-check. */
export async function probeProduct(
	rawUrl: string,
	timeoutMs = 12_000,
): Promise<ProbeResult> {
	let origin: string;
	try {
		origin = new URL(rawUrl).origin;
	} catch {
		return { kind: null, detail: "unparseable url", url: null, couldNotCheck: true };
	}

	// SEP-1 first: a stellar.toml is the strongest single signal a product can
	// publish, and it is a Stellar-specific file nothing else serves by accident.
	const toml = await get(origin + TOML_PATH, timeoutMs);
	if (toml?.ok && /\[\[CURRENCIES\]\]|ACCOUNTS|SIGNING_KEY|NETWORK_PASSPHRASE/i.test(toml.body))
		return {
			kind: "sep1-toml",
			detail: "publishes a SEP-1 stellar.toml",
			url: origin + TOML_PATH,
			couldNotCheck: false,
		};

	const page = await get(rawUrl, timeoutMs);
	if (!page) return { kind: null, detail: "unreachable", url: null, couldNotCheck: true };
	if (!page.ok)
		return {
			kind: null,
			detail: `HTTP ${page.status}`,
			url: null,
			couldNotCheck: true,
		};
	const parked = placeholderReason(page.body);
	if (parked)
		return {
			kind: null,
			detail: `${parked} — answered, but is not a product`,
			url: rawUrl,
			couldNotCheck: false,
		};

	for (const m of MARKERS)
		if (m.re.test(page.body))
			return {
				kind: m.kind,
				detail: `live page references ${m.kind.replace(/-/g, " ")}`,
				url: rawUrl,
				couldNotCheck: false,
			};

	// A single-page app imports the SDK in its bundle, not in the HTML shell,
	// so stopping at the served markup would read almost every real product as
	// "no evidence". Follow a bounded number of same-origin scripts.
	const scripts = [...page.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)]
		.map((m) => m[1])
		.filter((src) => !/^https?:\/\//i.test(src) || src.startsWith(origin))
		.slice(0, MAX_BUNDLES);
	for (const src of scripts) {
		let abs: string;
		try {
			abs = new URL(src, rawUrl).toString();
		} catch {
			continue;
		}
		if (new URL(abs).origin !== origin) continue;
		const js = await get(abs, timeoutMs);
		if (!js?.ok) continue;
		for (const m of MARKERS)
			if (m.re.test(js.body))
				return {
					kind: m.kind,
					detail: `app bundle references ${m.kind.replace(/-/g, " ")}`,
					url: abs,
					couldNotCheck: false,
				};
	}

	return {
		kind: null,
		detail: `no Stellar marker in the served HTML or ${scripts.length} same-origin bundle(s)`,
		url: rawUrl,
		couldNotCheck: false,
	};
}
