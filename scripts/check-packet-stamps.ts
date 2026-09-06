/**
 * Re-probe every human-verified packet stamp against its own deciding URL.
 *
 * On 2026-09-05 the high-confidence tier of the verification packets was
 * applied, and two of its Live stamps were wrong within hours:
 *
 *   - orbitcdp: the packet read the page's marketing banner "Live on Stellar"
 *     while the protocol stats on that same page were empty dashes (oUSD
 *     Minted —, Collateral Locked —, Borrow APY —).
 *   - skyhitz: a page title plus a fresh commit, over 0.00 balances.
 *
 * Eight more stamps were withdrawn the same day for thin evidence. What every
 * one of them had in common is that the deciding page was read ONCE, by hand,
 * and the stamp then stood on its own as a durable claim. A stamp is a claim
 * about a live product; the page it was read from keeps moving, and nothing
 * was watching it.
 *
 * This guard is that watch, and nothing more. It does not grade a project and
 * it never writes a status: it re-fetches each stamp's OWN `sourceUrl` and
 * asks whether that page still supports the stamp. A contradiction is a
 * finding for a human, not an auto-flip — the orbitcdp lesson cuts both ways,
 * and a machine reading a banner is exactly the failure being guarded here.
 *
 * CALIBRATED, not assumed. The first cut of this guard — wind-down words
 * matched anywhere on the page, three em-dashes anywhere, any thin body —
 * contradicted 19 of 55 rows, and reading all 19 pages by hand found not one
 * true positive: "no longer with us" in a payout explainer, "Shut down the
 * interactive container" in a README, punctuation dashes in a blog post, and
 * three client-rendered pages whose HTML is a mount div. So each test is
 * pinned to the two pages that motivated the guard (orbitcdp, skyhitz) and
 * against all 55 stamps: see FOLD and DASH_LIMIT for the separating margins.
 * A guard that cries wolf on a third of its rows is a guard nobody reads.
 *
 * Trinary, like the other guards: HOLDS / CONTRADICTED (or REVIVED) /
 * COULD-NOT-CHECK. A 403, a 429, a timeout or a DNS failure is never a
 * contradiction — a page we could not read says nothing about the product,
 * and reading it as red would train people to ignore red. Blind on more than
 * half the rows exits 2, so a run that could not look is never green.
 *
 *   pnpm exec tsx scripts/check-packet-stamps.ts           # human table
 *   pnpm exec tsx scripts/check-packet-stamps.ts --json    # machine output
 *
 * Exit 0 clean · 1 a CONTRADICTED or REVIVED row (declared signal) · 2 blind.
 */

import { writeFileSync } from "node:fs";
import { STATUS_FIX } from "./data/curation-maps";

const OUT = "improvements/audits/packet-stamps-latest.json";
const JSON_OUT = process.argv.includes("--json");
const TIMEOUT_MS = 25_000;
const CONCURRENCY = 4;
const GAP_MS = 400;

// A real browser string. Half of these hosts serve a challenge page or a bare
// 403 to anything that announces itself as a script, and a challenge page is a
// COULD-NOT-CHECK we would rather not manufacture.
const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Wind-down language. Any one of these IN THE FOLD contradicts a Live stamp
 * and CONFIRMS an Inactive one. Matched case-insensitively on readable text.
 *
 * In the fold, and not anywhere on the page, because the first cut of this
 * guard searched the whole document and every one of its eight marker hits
 * was ordinary product copy: blindpay's payout explainer ("The money is no
 * longer with us"), keystone's recovery FAQ ("no longer functional"), the
 * stellar/quickstart README ("Shut down the interactive container"), beans'
 * FAQ ("More currency options are coming soon"). Broad words, read out of
 * position, exclude everything. */
const DEAD_MARKERS = [
	"winding down",
	"no longer",
	"shut down",
	"shutting down",
	"discontinued",
	"sunset",
	"is for sale",
	"parked",
	"site not found",
	"deployment unavailable",
	"coming soon",
	"waitlist",
];

/**
 * The fold: the readable text a visitor sees before scrolling. Both the marker
 * test and the dash test run HERE only — the product state is claimed at the
 * top of the page, and a blog archive further down is not evidence about it.
 *
 * 600 chars, calibrated on the rows this guard actually watches: the three
 * genuine wind-down pages put their marker at char 0 (basement), 12
 * (soundness) and 326 (code4rena), while the eight false hits sat between
 * 1,495 and 37,188. Anything in [327, 1494] separates them; 600 has margin
 * on both sides.
 */
const FOLD = 600;

/**
 * orbitcdp's tell: a stats block whose every value is an em-dash placeholder
 * (oUSD Minted —, Collateral Locked —, Borrow APY —).
 *
 * 5, and only in the fold, because 3-anywhere fired on 8 live sites whose
 * dashes were punctuation — rarible's populated floor-price table (20),
 * spydra's numbered blog list (12), giveth's prose (5). Measured in the fold:
 * the two pages that motivated this guard read 8 (orbitcdp) and 7 (skyhitz);
 * the highest of the 55 live rows is 3 (splito's title and subhead).
 */
const DASH_LIMIT = 5;

const APP_STORE = /(^|\.)(apps\.apple\.com|play\.google\.com)$/i;

export type StampVerdict =
	| "HOLDS"
	| "CONTRADICTED"
	| "REVIVED"
	| "COULD-NOT-CHECK";

export interface StampRow {
	slug: string;
	to: string;
	sourceUrl: string;
	httpStatus: number | null;
	verdict: StampVerdict;
	reason: string;
	checkedAt: string;
}

/** Tags, scripts and the handful of entities that carry the dash test. */
export function readableText(html: string): string {
	return html
		.replace(
			/<(script|style|noscript|svg|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
			" ",
		)
		.replace(/<!--[\s\S]*?-->/g, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/&(?:mdash|#8212|#x2014);/gi, "—")
		.replace(/&(?:ndash|#8211|#x2013);/gi, "–")
		.replace(/&(?:nbsp|#160);/gi, " ")
		.replace(/&(?:quot|#34);/gi, '"')
		.replace(/&(?:apos|#0?39);/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&amp;/gi, "&")
		.replace(/\s+/g, " ")
		.trim();
}

const titleOf = (html: string): string =>
	readableText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");

/** Standalone em/en dashes — an empty metric, not a hyphenated word. */
const countDashes = (text: string): number =>
	(text.match(/(?:^|\s)[—–](?=\s|$)/g) ?? []).length;

const findMarker = (text: string): string | undefined => {
	const lower = text.toLowerCase();
	return DEAD_MARKERS.find((m) => lower.includes(m));
};

/** A store listing whose last release is older than this is not a live
 *  product signal (plutope's 95-day-old build was the tier's flagged case). */
const STORE_RELEASE_WINDOW_DAYS = 120;

/** apps.apple.com listing → the iTunes lookup API's release date, or null when
 *  the id is unparseable or the lookup failed (then the page verdict applies). */
async function appleReleaseDate(url: string): Promise<string | null> {
	const id = /\/id(\d+)/.exec(url)?.[1];
	if (!id) return null;
	const cc = /apps\.apple\.com\/([a-z]{2})\//i.exec(url)?.[1] ?? "us";
	try {
		const res = await fetch(
			`https://itunes.apple.com/lookup?id=${id}&country=${cc}`,
			{
				headers: { "user-agent": UA },
				signal: AbortSignal.timeout(TIMEOUT_MS),
			},
		);
		if (!res.ok) return null;
		const body = (await res.json()) as {
			results?: Array<{ currentVersionReleaseDate?: string }>;
		};
		return body.results?.[0]?.currentVersionReleaseDate ?? null;
	} catch {
		return null;
	}
}

/** A stamp whose deciding URL is a JSON-RPC endpoint (stamped from getHealth). */
const isRpcUrl = (url: string): boolean =>
	/\/\/rpc\.|\/soroban\b|stellar_soroban|\.g\.alchemy\.com\/v2\//i.test(url);

/** POST getHealth to a JSON-RPC endpoint; null when it did not answer JSON-RPC
 *  (then the page verdict applies). Alchemy's demo key needs its docs Origin. */
async function rpcHealth(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"user-agent": UA,
				...(/alchemy\.com/i.test(url)
					? { origin: "https://www.alchemy.com" }
					: {}),
			},
			body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		const body = (await res.json()) as { result?: { status?: string } };
		return body.result?.status ?? null;
	} catch {
		return null;
	}
}

const isAppStore = (url: string): boolean => {
	try {
		return APP_STORE.test(new URL(url).hostname);
	} catch {
		return false;
	}
};

/** slug → the letters a store listing would carry, for the title test. */
const squash = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * The whole verdict, as a pure function of what came back — so it can be
 * tested without a network, which is the only way the dashed-stats rule and
 * the app-store exception ever get exercised on purpose.
 */
export function judgeStamp(p: {
	slug: string;
	to: string;
	sourceUrl: string;
	httpStatus: number | null;
	html: string;
	error?: string;
	/** apps.apple.com only: currentVersionReleaseDate from the iTunes lookup
	 *  API (ISO). The listing's release recency IS the product signal; the
	 *  HTML title never reliably names the row (boss-revolution's listing is
	 *  "BOSS Money Transfer", a false contradiction on the first run). */
	storeReleasedAt?: string | null;
	/** JSON-RPC endpoints only: the getHealth result status from a POST probe
	 *  ("healthy" HOLDS). A GET on an RPC host answers 401/405 and says nothing
	 *  about the service — ankr and lightsail on the first re-tuned run. */
	rpcHealth?: string | null;
}): { verdict: StampVerdict; reason: string } {
	if (p.rpcHealth !== undefined && p.rpcHealth !== null) {
		return p.rpcHealth === "healthy"
			? { verdict: "HOLDS", reason: "JSON-RPC getHealth: healthy" }
			: {
					verdict: "CONTRADICTED",
					reason: `JSON-RPC getHealth reports "${p.rpcHealth}"`,
				};
	}
	// Blocked or unreachable. Its own state in BOTH directions: a 403 is the
	// host refusing us, not the product dying, and a dead-looking silence is
	// not evidence a retired site is still retired either.
	if (p.error || p.httpStatus === null) {
		// A domain that no longer resolves is a real death signal; a TLS or
		// timeout failure is no verdict at all. Both arrive here as an
		// exception, so the reason has to say which — the sweep that could not
		// tell them apart reported both as "unreachable".
		const dns =
			p.error &&
			/ENOTFOUND|EAI_AGAIN|getaddrinfo|dns|name not resolved/i.test(p.error);
		return {
			verdict: "COULD-NOT-CHECK",
			reason: dns
				? `${p.error} — domain does not resolve (a death signal for a human to confirm, never an auto-flip)`
				: (p.error ?? "no response"),
		};
	}
	if (
		p.httpStatus === 401 ||
		p.httpStatus === 403 ||
		p.httpStatus === 405 ||
		p.httpStatus === 429
	)
		return {
			verdict: "COULD-NOT-CHECK",
			reason: `HTTP ${p.httpStatus} — refused this probe, not judged (a 401/405 on a GET is an endpoint's method or auth policy, not a product state)`,
		};
	// 5xx is the server failing on this request, not the product ending. The
	// weak-basis sweep (2026-09-06) called a Heroku dyno's 503 a death; one
	// run of a 5xx says nothing in either direction.
	if (p.httpStatus >= 500)
		return {
			verdict: "COULD-NOT-CHECK",
			reason: `HTTP ${p.httpStatus} — server error, not a product state`,
		};

	const text = readableText(p.html);
	const fold = text.slice(0, FOLD);
	const marker = findMarker(fold);
	const ok = p.httpStatus >= 200 && p.httpStatus < 300;

	if (!ok)
		return p.to === "Inactive"
			? { verdict: "HOLDS", reason: `HTTP ${p.httpStatus}` }
			: { verdict: "CONTRADICTED", reason: `HTTP ${p.httpStatus}` };

	// A 200 that renders itself in the browser — a mount div and a bundle — is
	// a page we did NOT read, not a page with nothing on it. albedo.link
	// (6 readable chars), withobsrvr.com (63) and stellar.broker (104) are all
	// live products whose HTML says nothing; calling them dead would be this
	// instrument mistaking its own blindness for a finding. A ≤300-char 200
	// with no script at all is still a contradiction — that one really is bare.
	if (text.length <= 300 && /<script\b/i.test(p.html))
		return {
			verdict: "COULD-NOT-CHECK",
			reason: `client-rendered shell (${text.length} chars readable, needs a browser)`,
		};

	if (p.to === "Inactive") {
		// A death that came back is worth a human look, never an auto-flip.
		if (marker) return { verdict: "HOLDS", reason: `still says "${marker}"` };
		if (text.length <= 300)
			return {
				verdict: "HOLDS",
				reason: `thin page (${text.length} chars readable)`,
			};
		return {
			verdict: "REVIVED",
			reason: `serves 200 with ${text.length} chars and no wind-down marker — re-grade by hand`,
		};
	}

	// to === "Live"

	// App-store listings are chrome, not a product page: the store's own nav
	// and legal text clears any length bar, and its layout is full of dashes.
	// The listing existing under the app's name IS the signal.
	if (isAppStore(p.sourceUrl)) {
		const title = titleOf(p.html);
		if (p.storeReleasedAt) {
			const days = Math.round(
				(Date.now() - Date.parse(p.storeReleasedAt)) / 86_400_000,
			);
			return days <= STORE_RELEASE_WINDOW_DAYS
				? {
						verdict: "HOLDS",
						reason: `store release ${p.storeReleasedAt.slice(0, 10)} (${days}d ago) — "${title.slice(0, 60)}"`,
					}
				: {
						verdict: "CONTRADICTED",
						reason: `last store release ${p.storeReleasedAt.slice(0, 10)} is ${days}d ago (window ${STORE_RELEASE_WINDOW_DAYS}d) — "${title.slice(0, 60)}"`,
					};
		}
		// No lookup data (Play Store, or the lookup failed but the page served):
		// the listing existing under the row's own URL is the signal; the store's
		// chrome is full of dashes and generic "no longer" copy, so no other test.
		return title
			? { verdict: "HOLDS", reason: `store listing "${title.slice(0, 80)}"` }
			: { verdict: "COULD-NOT-CHECK", reason: "store page without a title" };
	}

	if (text.length <= 300)
		return {
			verdict: "CONTRADICTED",
			reason: `body is ${text.length} chars after tag-strip`,
		};
	if (marker)
		return { verdict: "CONTRADICTED", reason: `fold says "${marker}"` };
	const dashes = countDashes(fold);
	if (dashes >= DASH_LIMIT)
		return {
			verdict: "CONTRADICTED",
			reason: `${dashes} empty-metric dashes above the fold — the orbitcdp shape`,
		};
	return { verdict: "HOLDS", reason: `200, ${text.length} chars, no markers` };
}

/** The stamps this guard is responsible for: applied from a verification
 * packet or a re-grade, on human-verified basis, with a URL that decided it. */
export function packetStamps(): Array<{
	slug: string;
	to: string;
	sourceUrl: string;
}> {
	return Object.entries(STATUS_FIX)
		.filter(
			([, v]) =>
				v.basis === "human-verified" &&
				/^(Verification packet|Re-graded)/.test(v.note ?? "") &&
				!!v.sourceUrl,
		)
		.map(([slug, v]) => ({
			slug,
			to: v.to,
			sourceUrl: v.sourceUrl as string,
		}));
}

/** Exported so a sibling lane probes with the SAME instrument. The weak-basis
 *  sweep of 2026-09-06 reimplemented this in a throwaway script and reproduced
 *  bugs this file had already fixed: it did not follow 308s (eleven live sites
 *  read as dead), it called a 503 a death, and it could not tell a dead domain
 *  from a timeout. One prober, one set of corrections. */
export async function probe(s: {
	slug: string;
	to: string;
	sourceUrl: string;
}): Promise<StampRow> {
	let httpStatus: number | null = null;
	let html = "";
	let error: string | undefined;
	try {
		const res = await fetch(s.sourceUrl, {
			headers: { "user-agent": UA, accept: "text/html,*/*" },
			redirect: "follow",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
		httpStatus = res.status;
		html = await res.text();
	} catch (e) {
		error = String((e as Error).message ?? e).slice(0, 140);
	}
	const storeReleasedAt = /apps\.apple\.com/i.test(s.sourceUrl)
		? await appleReleaseDate(s.sourceUrl)
		: null;
	// A rate-limited store page (429) still judges when the lookup answered.
	if (storeReleasedAt && (httpStatus === 429 || httpStatus === 403)) {
		httpStatus = 200;
		error = undefined;
	}
	const health = isRpcUrl(s.sourceUrl) ? await rpcHealth(s.sourceUrl) : null;
	if (health) {
		httpStatus = 200;
		error = undefined;
	}
	const { verdict, reason } = judgeStamp({
		...s,
		httpStatus,
		html,
		error,
		storeReleasedAt,
		rpcHealth: health,
	});
	return {
		slug: s.slug,
		to: s.to,
		sourceUrl: s.sourceUrl,
		httpStatus,
		verdict,
		reason,
		checkedAt: new Date().toISOString(),
	};
}

async function main() {
	const stamps = packetStamps();
	const rows: StampRow[] = [];
	for (let i = 0; i < stamps.length; i += CONCURRENCY) {
		rows.push(
			...(await Promise.all(stamps.slice(i, i + CONCURRENCY).map(probe))),
		);
		if (i + CONCURRENCY < stamps.length)
			await new Promise((r) => setTimeout(r, GAP_MS));
	}
	rows.sort((a, b) => a.slug.localeCompare(b.slug));

	const count = (v: StampVerdict) => rows.filter((r) => r.verdict === v).length;
	const tally = {
		checked: rows.length,
		holds: count("HOLDS"),
		contradicted: count("CONTRADICTED"),
		revived: count("REVIVED"),
		couldNotCheck: count("COULD-NOT-CHECK"),
	};
	const report = {
		generatedAt: new Date().toISOString(),
		source: "scripts/check-packet-stamps.ts",
		rule: "Each human-verified packet stamp is re-fetched at its own deciding sourceUrl. A contradiction is a finding for a human, never an auto-flip; a page we could not read is never a contradiction.",
		tally,
		rows,
	};
	writeFileSync(OUT, `${JSON.stringify(report, null, "\t")}\n`);

	if (JSON_OUT) console.log(JSON.stringify(report, null, "\t"));
	else {
		for (const r of rows)
			console.log(
				`  ${r.verdict === "HOLDS" ? "✓" : r.verdict === "COULD-NOT-CHECK" ? "?" : "✗"} ${r.slug.padEnd(34)}${r.to.padEnd(9)}${String(r.httpStatus ?? "-").padEnd(5)}${r.verdict.padEnd(17)}${r.reason}`,
			);
	}
	console.log(
		`\n${tally.contradicted + tally.revived ? "RED" : tally.couldNotCheck * 2 > tally.checked ? "BLIND" : "GREEN"}: ${tally.holds} holds · ${tally.contradicted} contradicted · ${tally.revived} revived · ${tally.couldNotCheck} could-not-check (of ${tally.checked})`,
	);

	// A contradiction or a revival is the declared signal. Blind on more than
	// half is an instrument failure and gets its own code, so nobody reads a
	// run that could not look as a run that found nothing.
	process.exit(
		tally.contradicted + tally.revived > 0
			? 1
			: tally.couldNotCheck * 2 > tally.checked
				? 2
				: 0,
	);
}

if (process.argv[1]?.includes("check-packet-stamps"))
	main().catch((e) => {
		console.error("check-packet-stamps FAILED (script bug):", e);
		process.exit(3);
	});
