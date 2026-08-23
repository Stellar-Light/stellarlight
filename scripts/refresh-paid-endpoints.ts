/**
 * Discover and re-probe the paid HTTP endpoints an agent can pay for on
 * Stellar.
 *
 *   npx tsx scripts/refresh-paid-endpoints.ts            # DRY RUN
 *   npx tsx scripts/refresh-paid-endpoints.ts --execute
 *
 * Two jobs, and the second is the one that matters:
 *
 * DISCOVER — pull candidate URLs from the public registries: Coinbase's
 * x402 Bazaar (the only cross-chain index, where Stellar is 3 hosts of
 * 1,611) and Sextant's Stellar-native discovery layer. Registries are
 * DISCOVERY ONLY. Every one of them lists endpoints that stopped answering
 * months ago, and Sextant's own catalog is currently seeded demo rows.
 *
 * PROBE — request each URL and read the challenge it actually returns. That
 * is the only evidence that an endpoint is payable, and the only way to know
 * WHICH networks it takes: x402 and MPP are shared standards, so "supports
 * x402" tells a Stellar wallet nothing. We record `accepts` verbatim.
 *
 * Never asserts a negative. No challenge read means we could not see the
 * terms — auth wall, wrong method, transport failure — not "unpaid". A row
 * that stops answering keeps its history and gains a failure streak, because
 * an endpoint going dark is the most useful thing this index can report.
 */

import "./load-env";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import type { PaidEndpoint } from "../src/payload-types";

const EXECUTE = process.argv.includes("--execute");
const UA = "stellar-light-paid-endpoints/1.0 (+https://stellarlight.xyz)";

type Accept = {
	network?: string;
	asset?: string;
	amount?: string;
	scheme?: string;
};
type Candidate = {
	url: string;
	title?: string;
	description?: string;
	source: "bazaar" | "sextant" | "mpp-router" | "curated";
	sourceUrl?: string;
};

const isStellar = (n?: string) => !!n && n.toLowerCase().startsWith("stellar");

/** USDC Stellar Asset Contract ids — pubnet and testnet (from @x402/stellar). */
const USDC_SAC = new Set([
	"CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
	"CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
]);

/**
 * RFC 2606 / RFC 6761 reserve these names for documentation and testing, so
 * they are guaranteed never to resolve. Sextant's catalog is 20 rows of
 * `api.fxrates.example`, `mcp.stellartools.example` and friends — its own
 * /health reports 27 seeded and 0 live — and indexing them would add
 * permanently dark rows. A demo listing is not supply.
 */
const RESERVED_HOST =
	/(^|\.)(example|test|invalid|localhost)$|(^|\.)example\.(com|net|org)$/i;

function isReservedDemo(url: string): boolean {
	try {
		return RESERVED_HOST.test(new URL(url).hostname);
	} catch {
		return true;
	}
}

async function jsonOrNull<T>(
	url: string,
	timeoutMs = 20_000,
): Promise<T | null> {
	try {
		const r = await fetch(url, {
			headers: { "User-Agent": UA, accept: "application/json" },
			signal: AbortSignal.timeout(timeoutMs),
		});
		if (!r.ok) return null;
		return (await r.json()) as T;
	} catch {
		return null;
	}
}

/** Coinbase's Bazaar — every resource, kept when any accept names Stellar. */
async function fromBazaar(): Promise<Candidate[]> {
	const out: Candidate[] = [];
	for (let offset = 0; offset < 20_000; offset += 100) {
		const page = await jsonOrNull<{
			items?: Array<{
				resource?: string;
				accepts?: Accept[];
				metadata?: Record<string, unknown>;
			}>;
			pagination?: { total?: number };
		}>(
			`https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?limit=100&offset=${offset}`,
			30_000,
		);
		const items = page?.items ?? [];
		if (!items.length) break;
		for (const it of items) {
			if (!it.resource?.startsWith("http")) continue;
			if (!(it.accepts ?? []).some((a) => isStellar(a.network))) continue;
			out.push({
				url: it.resource,
				title: String((it.metadata as { name?: string })?.name ?? ""),
				source: "bazaar",
				sourceUrl: "https://x402.org/bazaar",
			});
		}
		const total = page?.pagination?.total;
		if (total && offset + 100 >= total) break;
	}
	return out;
}

/** Sextant — Stellar-native discovery (currently seeded, so probe decides). */
async function fromSextant(): Promise<Candidate[]> {
	const d = await jsonOrNull<{
		resources?: Array<Record<string, unknown>>;
		items?: Array<Record<string, unknown>>;
	}>("https://sextants.dev/discovery/resources", 20_000);
	const rows = d?.resources ?? d?.items ?? [];
	const out: Candidate[] = [];
	for (const r of rows) {
		const url = String(r.resource ?? r.url ?? "");
		if (!url.startsWith("http")) continue;
		out.push({
			url,
			title: String(r.title ?? r.name ?? ""),
			description: String(r.description ?? ""),
			source: "sextant",
			sourceUrl: "https://sextants.dev",
		});
	}
	return out;
}

/**
 * mpp-router (Rozo) — the only Stellar-native router found: ~670 upstream
 * services behind one host, every 402 answered with stellar:pubnet USDC and
 * fees sponsored, in both x402 and MPP. Its catalog is a LISTING, so each
 * entry still goes through the same 402 probe as everything else; only the
 * probe is evidence. Templated paths ({id}) cannot be probed as-is.
 */
async function fromMppRouter(): Promise<Candidate[]> {
	const d = await jsonOrNull<{
		base_url?: string;
		services?: Array<Record<string, unknown>>;
	}>("https://apiserver.mpprouter.dev/v1/services/catalog", 20_000);
	const base = String(d?.base_url ?? "https://apiserver.mpprouter.dev").replace(
		/\/$/,
		"",
	);
	const out: Candidate[] = [];
	for (const svc of d?.services ?? []) {
		const path = String(svc.public_path ?? "");
		if (!path.startsWith("/") || path.includes("{")) continue;
		out.push({
			url: base + path,
			title: String(svc.name ?? ""),
			description: String(svc.description ?? ""),
			source: "mpp-router",
			sourceUrl: "https://apiserver.mpprouter.dev/v1/services/catalog",
		});
	}
	return out;
}

/** Read a payment challenge. Returns null when none was offered. */
async function probe(url: string): Promise<{
	status: string;
	protocol: "x402" | "mpp" | "x402+mpp" | "unknown";
	accepts: Accept[];
}> {
	const attempt = async (method: "GET" | "POST") => {
		try {
			const r = await fetch(url, {
				method,
				headers: {
					"User-Agent": UA,
					accept: "application/json",
					...(method === "POST" ? { "content-type": "application/json" } : {}),
				},
				body: method === "POST" ? "{}" : undefined,
				signal: AbortSignal.timeout(20_000),
			});
			return {
				status: String(r.status),
				body: await r.text(),
				headers: r.headers,
			};
		} catch (e) {
			return {
				status: `ERR ${(e as Error).name}`,
				body: "",
				headers: new Headers(),
			};
		}
	};
	let res = await attempt("GET");
	if (res.status !== "402") {
		const post = await attempt("POST");
		if (post.status === "402") res = post;
	}
	const accepts: Accept[] = [];
	let x402 = false;
	let mpp = false;
	try {
		const parsed = JSON.parse(res.body.slice(0, 20_000)) as {
			accepts?: Accept[];
			x402Version?: number;
		};
		for (const a of parsed.accepts ?? []) {
			accepts.push({
				network: a.network,
				asset: a.asset,
				amount:
					(a as { maxAmountRequired?: string }).maxAmountRequired ?? a.amount,
				scheme: a.scheme,
			});
			x402 = true;
		}
		if (parsed.x402Version) x402 = true;
	} catch {}
	// x402 also carries the challenge base64 in a header, and MPP announces
	// itself in WWW-Authenticate with its method name.
	const hdr = res.headers.get("payment-required");
	if (hdr) {
		try {
			const decoded = JSON.parse(
				Buffer.from(hdr, "base64").toString("utf8"),
			) as { accepts?: Accept[] };
			for (const a of decoded.accepts ?? [])
				accepts.push({
					network: a.network,
					asset: a.asset,
					// v1 says maxAmountRequired, v2 says amount
					amount:
						(a as { maxAmountRequired?: string }).maxAmountRequired ?? a.amount,
					scheme: a.scheme,
				});
			x402 = true;
		} catch {}
	}
	const wa = res.headers.get("www-authenticate") ?? "";
	if (/payment/i.test(wa)) {
		mpp = true;
		for (const m of wa.matchAll(/method="?([A-Za-z0-9_:-]+)"?/g))
			accepts.push({ network: m[1], scheme: "mpp" });
	}
	const protocol =
		x402 && mpp ? "x402+mpp" : x402 ? "x402" : mpp ? "mpp" : "unknown";
	return { status: res.status, protocol, accepts };
}

async function mapLimited<T, R>(
	items: T[],
	limit: number,
	fn: (t: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = [];
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(limit, items.length) }, async () => {
			while (i < items.length) {
				const idx = i++;
				out[idx] = await fn(items[idx]);
			}
		}),
	);
	return out;
}

async function main() {
	console.log(
		`paid-endpoint index — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}\n`,
	);
	const payload = await getPayload({ config: await configPromise });

	const [bazaar, sextant, mppRouter] = await Promise.all([
		fromBazaar(),
		fromSextant(),
		fromMppRouter(),
	]);
	console.log(
		`discovered — bazaar (stellar-accepting): ${bazaar.length} · sextant: ${sextant.length} · mpp-router: ${mppRouter.length}`,
	);

	// Anything already indexed is re-probed too: liveness is the product, and
	// a row nobody re-checks is a dead link waiting to be served.
	const existing = await payload.find({
		collection: "paid-endpoints",
		limit: 2000,
		depth: 0,
	});
	const known = existing.docs as Array<{
		id: string;
		url: string;
		source?: string;
		sourceUrl?: string;
		consecutiveFailures?: number;
		lastPaidAt?: string;
	}>;
	const byUrl = new Map(known.map((d) => [d.url, d]));

	const seen = new Map<string, Candidate>();
	let demoSkipped = 0;
	for (const c of [...bazaar, ...sextant, ...mppRouter]) {
		if (isReservedDemo(c.url)) {
			demoSkipped++;
			continue;
		}
		if (!seen.has(c.url)) seen.set(c.url, c);
	}
	if (demoSkipped)
		console.log(
			`skipped ${demoSkipped} reserved/demo host(s) (RFC 2606 — can never resolve)`,
		);
	for (const d of known)
		if (!seen.has(d.url))
			seen.set(d.url, {
				url: d.url,
				source: (d.source as Candidate["source"]) ?? "curated",
				sourceUrl: d.sourceUrl,
			});
	const candidates = [...seen.values()];
	console.log(`probing ${candidates.length} endpoint(s)…\n`);

	const results = await mapLimited(candidates, 8, async (c) => ({
		c,
		r: await probe(c.url),
	}));

	let paid = 0;
	let stellarPayable = 0;
	// The generated collection type is the contract for what we write. A bare
	// Record<string, unknown> compiles here only because the root tsconfig
	// excludes scripts/ — which is exactly how a call to an undefined
	// function shipped on 2026-08-23. See tsconfig.scripts.json.
	type EndpointWrite = Omit<PaidEndpoint, "id" | "createdAt" | "updatedAt">;
	const writes: Array<{ id?: string; data: EndpointWrite }> = [];
	for (const { c, r } of results) {
		const acceptsStellar = r.accepts.some(
			(a) => isStellar(a.network) || a.network === "stellar",
		);
		if (r.status === "402") paid++;
		if (acceptsStellar) stellarPayable++;
		const prev = byUrl.get(c.url);
		// On Stellar the asset is the USDC Stellar Asset Contract address, not
		// the string "USDC"; matching the name alone left every Stellar price null.
		const usd = r.accepts.find(
			(a) =>
				(/usdc|usd/i.test(a.asset ?? "") || USDC_SAC.has(a.asset ?? "")) &&
				a.amount,
		);
		const data: EndpointWrite = {
			url: c.url,
			host: (() => {
				try {
					return new URL(c.url).host;
				} catch {
					return null;
				}
			})(),
			title: c.title || prev?.url || null,
			description: c.description || null,
			protocol: r.protocol,
			acceptsStellar,
			accepts: r.accepts,
			// Base units differ by chain: USDC is 7 decimals on Stellar (SAC),
			// 6 on EVM and Solana. Dividing everything by 1e6 overstated every
			// Stellar price tenfold.
			priceUSD: usd?.amount
				? Number(usd.amount) / (isStellar(usd.network) ? 10_000_000 : 1_000_000)
				: null,
			source: c.source,
			sourceUrl: c.sourceUrl ?? null,
			lastStatus: r.status,
			lastCheckedAt: new Date().toISOString(),
			// Only advance on a real challenge; a silent endpoint keeps the
			// date it last proved itself.
			...(r.status === "402"
				? { lastPaidAt: new Date().toISOString(), consecutiveFailures: 0 }
				: { consecutiveFailures: (prev?.consecutiveFailures ?? 0) + 1 }),
		};
		writes.push({ id: prev?.id, data });
		console.log(
			`  ${r.status.padEnd(5)} ${r.protocol.padEnd(9)} ${acceptsStellar ? "STELLAR" : "       "} ${data.priceUSD != null ? `$${data.priceUSD.toFixed(4)}` : "        "} ${c.url.slice(0, 60)}`,
		);
	}

	console.log(
		`\nprobed ${results.length} · answered 402: ${paid} · payable on Stellar: ${stellarPayable}`,
	);
	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing written. Re-run with --execute.");
		process.exit(0);
	}
	let created = 0;
	let updated = 0;
	for (const w of writes) {
		if (w.id) {
			await payload.update({
				collection: "paid-endpoints",
				id: w.id,
				data: w.data,
			});
			updated++;
		} else {
			await payload.create({
				collection: "paid-endpoints",
				data: w.data,
			});
			created++;
		}
	}
	const after = await payload.count({ collection: "paid-endpoints" });
	console.log(
		`\nwrote ${created} new, ${updated} updated — ${after.totalDocs} endpoints indexed`,
	);
	process.exit(after.totalDocs > 0 ? 0 : 1);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
