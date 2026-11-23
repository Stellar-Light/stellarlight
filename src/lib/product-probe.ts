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
import { thirdPartyHost } from "./page-verdict";

/** Markers specific enough that a marketing page about Stellar won't match.
 *  The bare word "stellar" is deliberately absent — it is the name of the
 *  network, so it appears on every page that merely mentions it. */
const MARKERS: Array<{ re: RegExp; kind: string }> = [
	// Public network hosts only. horizon-testnet.stellar.org and an RPC host
	// on the test network are no product on Stellar (audit 2026-11-23), and a
	// bare "soroban-rpc" names no network. An RPC host counts when it names
	// both soroban and mainnet: "rpc.mainnet" alone is an EVM chain's
	// (nouns.build, team.finance). A public RPC named otherwise is missed, not
	// misread. friendbot is testnet-only and is no marker.
	{ re: /horizon\.stellar\.org/i, kind: "horizon-endpoint" },
	{
		re: /soroban[\w.-]*mainnet|mainnet[\w.-]*soroban|(?<![\w.-])rpc\.stellar\.org/i,
		kind: "soroban-rpc",
	},
	{
		re: /@stellar\/stellar-sdk|stellar-base|js-stellar-sdk|stellar_sdk/i,
		kind: "stellar-sdk",
	},
	{
		re: /Public Global Stellar Network ; September 2015/,
		kind: "network-passphrase",
	},
	{
		re: /@creit\.tech\/stellar-wallets-kit|freighter-api|varial-sdk|albedo\.link/i,
		kind: "wallet-integration",
	},
	{ re: /\bG[A-Z2-7]{55}\b/, kind: "stellar-address" },
	{ re: /\bC[A-Z2-7]{55}\b/, kind: "contract-id" },
];
// ponytail: the SDK, address and passphrase markers do not name a network (a
// bundled SDK carries both passphrases as constants), so an app built only
// for testnet still passes on them (zentra and lumen-later did on 2026-11-23:
// their bundles name only test network endpoints). Telling the two apart
// needs the network an address lives on (Horizon), not a regex.

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
	/** The stellar.toml URL when it answered and is no public network
	 *  evidence: it declares a test network, is an HTML document (an SPA's
	 *  index.html), or is not served (404/410). A reading, unlike a marker
	 *  not found, which a bundle past the read cut can hide. */
	rejected?: string;
}

const TOML_PATH = "/.well-known/stellar.toml";
const PUBLIC_PASSPHRASE = "Public Global Stellar Network ; September 2015";
/** An HTML document, never a toml. An SPA that answers every path with its
 *  index.html has the word "accounts" in its markup; 9 of 16 "tomls" with no
 *  passphrase cited by Live rows on 2026-11-23 were that HTML. */
const HTML_DOC = /^﻿?\s*<(?:!doctype|html)/i;
/** A SEP-1 key at the start of a line that names the product's accounts or a
 *  Stellar service it runs (federation, transfer, KYC, web auth). stellarterm
 *  serves only FEDERATION_SERVER: a federation server is Stellar
 *  infrastructure on its own domain, so it counts. A toml with only
 *  [DOCUMENTATION] or VERSION names none: not evidence, and not rejected. */
const SEP1_KEY =
	/^\s*(?:\[\[CURRENCIES\]\]|[A-Z0-9_]*(?:ACCOUNTS|SIGNING_KEY|NETWORK_PASSPHRASE|_SERVER|_ENDPOINT)[A-Z0-9_]*\s*=)/m;
const TOML_PASSPHRASE = /^\s*NETWORK_PASSPHRASE\s*=\s*["']([^"']*)["']/m;
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
	// A page on somebody else's host is about the project, not the product:
	// its origin's toml is the host's (lumenshade read SDF's sample toml off
	// its SCF page) and its markup is the host's (a repo README naming the
	// SDK). Nothing read there is this product's integration.
	const host = thirdPartyHost(rawUrl);
	if (host)
		return {
			kind: null,
			detail: `third-party host ${host}: its pages and stellar.toml describe the host, not the product`,
			url: null,
			couldNotCheck: false,
		};
	let origin: string;
	try {
		origin = new URL(rawUrl).origin;
	} catch {
		return {
			kind: null,
			detail: "unparseable url",
			url: null,
			couldNotCheck: true,
		};
	}

	// SEP-1 first: a stellar.toml is the strongest single signal a product can
	// publish, and it is a Stellar-specific file nothing else serves by accident.
	const toml = await get(origin + TOML_PATH, timeoutMs);
	const tomlIsHtml = !!toml?.ok && HTML_DOC.test(toml.body);
	if (toml?.ok && !tomlIsHtml && SEP1_KEY.test(toml.body)) {
		// The product's own word on its network. A test network toml is no
		// product on Stellar, and that is what the page would show too, so the
		// probe stops here. SEP-1 lets a public network toml omit the key: of
		// the 7 real tomls without it cited on 2026-11-23, 6 name an account
		// that exists on the public network and none names one only on testnet,
		// so absence is read as the public network, as SEP-1 intends.
		const network = toml.body.match(TOML_PASSPHRASE)?.[1];
		if (network !== undefined && network !== PUBLIC_PASSPHRASE)
			return {
				kind: null,
				detail: `its stellar.toml declares ${/^Test SDF/.test(network) ? "the test network" : "a network other than the public one"} ("${network}")`,
				url: origin + TOML_PATH,
				couldNotCheck: false,
				rejected: origin + TOML_PATH,
			};
		return {
			kind: "sep1-toml",
			detail: "publishes a SEP-1 stellar.toml",
			url: origin + TOML_PATH,
			couldNotCheck: false,
		};
	}
	// It answered and is no toml: an HTML document, or not served. Any other
	// 200 (a WAF interstitial, a toml naming no service) and a 403 or a
	// timeout are no reading that the file is gone.
	const tomlRejected =
		tomlIsHtml || toml?.status === 404 || toml?.status === 410
			? { rejected: origin + TOML_PATH }
			: {};

	const page = await get(rawUrl, timeoutMs);
	if (!page)
		return {
			kind: null,
			detail: "unreachable",
			url: null,
			couldNotCheck: true,
		};
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
			detail: `${parked}: answered, but is not a product`,
			url: rawUrl,
			couldNotCheck: false,
			...tomlRejected,
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
		...tomlRejected,
	};
}
