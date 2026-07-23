/** One definition of what a third-party HTTP probe PROVED.
 *
 * Every detector that reaches outside our own infrastructure — npm, a project's
 * website, a partner's stellar.toml, a consumer's catalog — has to answer the
 * same question: does this response prove the thing is GONE, or only that we
 * could not see it right now? Getting that wrong in the "gone" direction is how
 * a detector cries wolf, and a detector that cries wolf is worse than one that
 * misses: it trains every reader to skim past the red.
 *
 * We shipped that bug three ways before extracting this:
 *  - self-audit's npm check read ANY non-ok status as "version missing", so a
 *    transient registry 504 (2026-07-23) reported two published, installable
 *    versions as absent — while another version, probed seconds later in the
 *    same loop, passed.
 *  - report-liveness counted HTTP 5xx, request timeouts, EAI_AGAIN and invalid
 *    TLS certificates as positive evidence a project was DEAD, feeding a
 *    shortlist whose whole purpose is deciding what to demote.
 *  - check-links had the right idea first (401/403/429/999 → a distinct
 *    "blocked" bucket that never pollutes the error count) but applied it only
 *    to bot walls, and never retried.
 *
 * The rule this file encodes: **only an answer that means "this resource does
 * not exist" is absence.** A server that is broken, slow, walled, or
 * unreachable proves nothing about the resource behind it.
 *
 * See improvements/lessons/README.md class 32.
 */

/** What the probe proved. Three states, never two — collapsing `unverifiable`
 * into `absent` is the bug this module exists to prevent. */
export type ExternalVerdict =
	/** The resource answered. It exists. */
	| "present"
	/** The origin answered "this does not exist" (404/410, or DNS/connection
	 * refusal for a whole host). This is the only verdict that is a FINDING. */
	| "absent"
	/** We could not see it: server error, timeout, bot wall, network failure.
	 * NOT evidence of absence — must never fail a gate on its own. */
	| "unverifiable";

export type ExternalProbe = {
	verdict: ExternalVerdict;
	/** HTTP status, or null when no response was received at all. */
	status: number | null;
	/** Short human-readable reason, for report lines. */
	detail: string;
	/** Attempts actually made (2 when an unverifiable result was retried). */
	attempts: number;
};

/** Statuses that mean "a bot is being walled", not "the resource is missing".
 * 999 is LinkedIn's. */
const BOT_WALL = new Set([401, 403, 429, 999]);

/** Is this status a bot wall — i.e. proof a server is there and declining to
 * talk to us? Exported so check-links' four-bucket report shares ONE definition
 * of the walled set with this module. */
export function isBotWall(status: number): boolean {
	return BOT_WALL.has(status);
}

/** Classify an HTTP status. Exported for detectors that run their own fetch
 * orchestration (HEAD-then-GET fallbacks, redirect bookkeeping) but still want
 * the shared verdict. */
export function classifyExternalStatus(status: number): ExternalVerdict {
	if (status >= 200 && status < 300) return "present";
	// A redirect means a server answered and the content MOVED. Following it is
	// the caller's business; "moved" is never "absent".
	if (status >= 300 && status < 400) return "present";
	if (BOT_WALL.has(status)) return "unverifiable";
	// The only statuses that assert non-existence.
	if (status === 404 || status === 410) return "absent";
	// Everything else — 4xx we may have caused (400/405/408/451) and every 5xx —
	// says something about the request or the server, not about the resource.
	return "unverifiable";
}

/** Classify a thrown fetch error. Host-level absence (the name doesn't resolve,
 * or nothing is listening) is real evidence of death — the swplug/plutus
 * precedent in curate-projects. Everything else is transport noise. */
export function classifyExternalError(err: unknown): {
	verdict: ExternalVerdict;
	detail: string;
} {
	const e = err as Error & { code?: string; cause?: unknown };
	const msg = String(e?.cause ?? e?.message ?? e ?? "");
	const code = e?.code ?? msg.match(/\b(E[A-Z_]{3,})\b/)?.[1] ?? "";

	// Name does not resolve / nothing accepts the connection → the host is gone.
	if (/ENOTFOUND|ECONNREFUSED|ERR_NAME_NOT_RESOLVED|NXDOMAIN/i.test(msg + code))
		return { verdict: "absent", detail: code || "DNS/connection failure" };

	// EAI_AGAIN is the resolver failing TEMPORARILY — the single most commonly
	// misread code, and the reason this function exists separately from the
	// status classifier.
	if (/EAI_AGAIN/i.test(msg + code))
		return { verdict: "unverifiable", detail: "EAI_AGAIN (resolver failure)" };
	if (/abort/i.test(msg) || e?.name === "AbortError")
		return { verdict: "unverifiable", detail: "timeout" };
	// A certificate error proves a server IS there, presenting a bad cert.
	if (/certificate|CERT_|SSL|TLS/i.test(msg + code))
		return { verdict: "unverifiable", detail: code || "tls-cert-invalid" };
	return { verdict: "unverifiable", detail: (code || msg).slice(0, 60) };
}

export type ProbeOptions = {
	method?: "GET" | "HEAD";
	timeoutMs?: number;
	userAgent?: string;
	redirect?: RequestRedirect;
	/** Retry ONCE on an unverifiable result (default true). `present` and
	 * `absent` are stable answers and are never retried. */
	retry?: boolean;
	retryDelayMs?: number;
	/** Injected in tests. */
	fetchImpl?: typeof fetch;
	sleepImpl?: (ms: number) => Promise<void>;
};

const DEFAULT_UA =
	"Mozilla/5.0 (compatible; StellarLightProbe/1.0; +https://stellarlight.xyz)";

/** Probe a third-party URL and say what it PROVED.
 *
 * Retries once on `unverifiable` — the transient case is exactly the one worth
 * a second look, and re-asking a 404 just wastes a request. */
export async function probeExternal(
	url: string,
	opts: ProbeOptions = {},
): Promise<ExternalProbe> {
	const {
		method = "GET",
		timeoutMs = 12_000,
		userAgent = DEFAULT_UA,
		redirect = "follow",
		retry = true,
		retryDelayMs = 3_000,
		fetchImpl = fetch,
		sleepImpl = (ms: number) => new Promise((r) => setTimeout(r, ms)),
	} = opts;

	const maxAttempts = retry ? 2 : 1;
	let last: ExternalProbe = {
		verdict: "unverifiable",
		status: null,
		detail: "not attempted",
		attempts: 0,
	};

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), timeoutMs);
		try {
			const res = await fetchImpl(url, {
				method,
				redirect,
				signal: ctrl.signal,
				headers: { "User-Agent": userAgent, Accept: "*/*" },
			});
			const verdict = classifyExternalStatus(res.status);
			last = {
				verdict,
				status: res.status,
				detail: `HTTP ${res.status}`,
				attempts: attempt,
			};
		} catch (err) {
			const { verdict, detail } = classifyExternalError(err);
			last = { verdict, status: null, detail, attempts: attempt };
		} finally {
			clearTimeout(timer);
		}

		if (last.verdict !== "unverifiable") return last;
		if (attempt < maxAttempts) await sleepImpl(retryDelayMs);
	}
	return last;
}
