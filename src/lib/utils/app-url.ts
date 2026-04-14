/**
 * Canonical public URL for this app (no trailing slash).
 *
 * Used for Open Graph / Twitter metadata, sitemaps, absolute links, and any
 * server-side fetch that targets our own origin.
 *
 * Resolution order (server-side):
 *   1. NEXT_PUBLIC_APP_URL  (if set and not a localhost value)
 *   2. On Vercel + production env  → https://{VERCEL_PROJECT_PRODUCTION_URL}
 *   3. On Vercel (preview/other)   → https://{VERCEL_URL}
 *   4. On Vercel (no deploy host)  → https://{VERCEL_PROJECT_PRODUCTION_URL}
 *   5. NEXT_PUBLIC_APP_URL even if localhost (local dev)
 *   6. http://localhost:3000  (absolute fallback)
 *
 * This intentionally ignores a localhost value from NEXT_PUBLIC_APP_URL when
 * running on Vercel, so a misconfigured env var can't poison production OG
 * tags. NEXT_PUBLIC_* values are inlined at build time, so localhost values
 * baked into a Vercel build would otherwise follow us into production.
 *
 * Note: the VERCEL_* system env vars are not NEXT_PUBLIC, so this function
 * only returns the correct value on the server. Client code should prefer
 * `window.location.origin`.
 */
export function getAppUrl(): string {
	const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");
	const isLocalhost = (url: string) =>
		/^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(url);

	const envUrl = process.env.NEXT_PUBLIC_APP_URL
		? stripTrailingSlash(process.env.NEXT_PUBLIC_APP_URL)
		: "";

	// 1. Explicit non-localhost URL wins.
	if (envUrl && !isLocalhost(envUrl)) {
		return envUrl;
	}

	// 2-4. On Vercel, derive the URL from the platform's system env vars so a
	// missing/localhost NEXT_PUBLIC_APP_URL can't break production OG.
	if (process.env.VERCEL) {
		const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
		const deployHost = process.env.VERCEL_URL;
		const vercelEnv = process.env.VERCEL_ENV;

		if (vercelEnv === "production" && prodHost) {
			return `https://${prodHost}`;
		}
		if (deployHost) {
			return `https://${deployHost}`;
		}
		if (prodHost) {
			return `https://${prodHost}`;
		}
	}

	// 5-6. Local dev fallbacks.
	return envUrl || "http://localhost:3000";
}
