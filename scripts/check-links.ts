/**
 * Curator Agent — Phase 1: link health checker.
 *
 * HEAD-requests every external URL across the directory, records the
 * result in the LinkChecks Payload collection, and surfaces broken
 * links in the admin UI.
 *
 * Sources scanned:
 *   - projects.links.{website, github, docs, twitter}
 *   - builders.github_username (resolved to URL), .website_url, .twitter_handle
 *   - entities.website, .github, .twitter
 *   - hackathons.externalUrl
 *   - curated-skills.ts: .homepage, .docs, .repository
 *
 * Deduplication by URL — if two projects link to the same docs page,
 * one LinkCheck record carries both target references.
 *
 * Concurrency capped at CONCURRENCY (5) so we don't DDoS small target
 * sites. Timeout per check = TIMEOUT_MS (10s).
 *
 * Idempotent re-runs: existing LinkCheck records get updated in place.
 * URLs that no longer appear anywhere in the directory get deleted
 * (so the dashboard only shows URLs currently referenced).
 *
 * Usage:
 *   pnpm exec tsx scripts/check-links.ts             # report mode only
 *   pnpm exec tsx scripts/check-links.ts --execute   # actually write to DB
 *
 * Reports the diff so a daily cron can post a Slack/Discord/whatever
 * notification when new failures appear.
 */

import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import { CURATED_SKILLS } from "../src/lib/integrations/curated-skills";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const CONCURRENCY = 5;
const TIMEOUT_MS = 10_000;
const USER_AGENT =
	"StellarLightLinkChecker/1.0 (+https://stellarlight.xyz; admin@stellarlight.xyz)";

type Status = "ok" | "redirect" | "blocked" | "error";

interface Target {
	collection: string;
	recordSlug: string;
	recordName?: string;
	field: string;
}

interface CheckResult {
	url: string;
	status: Status;
	statusCode: number | null;
	errorReason: string | null;
	redirectTo: string | null;
}

interface UrlEntry {
	url: string;
	targets: Target[];
}

/* ─── URL collection ─────────────────────────────────────────────────── */

async function collectAllUrls(payload: any): Promise<Map<string, Target[]>> {
	const map = new Map<string, Target[]>();

	const add = (url: string | undefined | null, target: Target) => {
		const cleaned = cleanUrl(url);
		if (!cleaned) return;
		const existing = map.get(cleaned) ?? [];
		// Dedupe per (collection, slug, field) — if the same URL appears
		// twice on one record, count it once
		const key = `${target.collection}:${target.recordSlug}:${target.field}`;
		if (
			!existing.some(
				(t) => `${t.collection}:${t.recordSlug}:${t.field}` === key,
			)
		) {
			existing.push(target);
			map.set(cleaned, existing);
		}
	};

	// Projects
	const projects = await payload.find({
		collection: "projects",
		limit: 1000,
		depth: 0,
	});
	for (const p of projects.docs as Array<{
		slug: string;
		name: string;
		links?: {
			website?: string;
			github?: string;
			docs?: string;
			twitter?: string;
		};
	}>) {
		const ctx = {
			collection: "projects",
			recordSlug: p.slug,
			recordName: p.name,
		};
		add(p.links?.website, { ...ctx, field: "links.website" });
		add(p.links?.github, { ...ctx, field: "links.github" });
		add(p.links?.docs, { ...ctx, field: "links.docs" });
		add(p.links?.twitter, { ...ctx, field: "links.twitter" });
	}

	// Builders
	const builders = await payload.find({
		collection: "builders",
		limit: 1000,
		depth: 0,
	});
	for (const b of builders.docs as Array<{
		id: string;
		github_username?: string;
		website_url?: string;
		twitter_handle?: string;
		display_name?: string;
	}>) {
		const slug = String(b.id);
		const name = b.display_name ?? b.github_username ?? slug;
		const ctx = { collection: "builders", recordSlug: slug, recordName: name };
		if (b.github_username) {
			add(`https://github.com/${b.github_username}`, {
				...ctx,
				field: "github_username",
			});
		}
		add(b.website_url, { ...ctx, field: "website_url" });
		if (b.twitter_handle) {
			const handle = b.twitter_handle.replace(/^@/, "");
			add(`https://twitter.com/${handle}`, { ...ctx, field: "twitter_handle" });
		}
	}

	// Entities (sponsors, hackathon orgs, etc.)
	try {
		const entities = await payload.find({
			collection: "entities",
			limit: 1000,
			depth: 0,
		});
		for (const e of entities.docs as Array<{
			slug?: string;
			name?: string;
			links?: { website?: string; github?: string; twitter?: string };
		}>) {
			const slug = e.slug ?? e.name ?? "?";
			const ctx = {
				collection: "entities",
				recordSlug: slug,
				recordName: e.name,
			};
			add(e.links?.website, { ...ctx, field: "links.website" });
			add(e.links?.github, { ...ctx, field: "links.github" });
			add(e.links?.twitter, { ...ctx, field: "links.twitter" });
		}
	} catch (err) {
		console.warn(`[entities] skipped: ${(err as Error).message}`);
	}

	// Hackathons
	try {
		const hackathons = await payload.find({
			collection: "hackathons",
			limit: 500,
			depth: 0,
		});
		for (const h of hackathons.docs as Array<{
			slug: string;
			name?: string;
			externalUrl?: string;
		}>) {
			add(h.externalUrl, {
				collection: "hackathons",
				recordSlug: h.slug,
				recordName: h.name,
				field: "externalUrl",
			});
		}
	} catch (err) {
		console.warn(`[hackathons] skipped: ${(err as Error).message}`);
	}

	// Curated skills (in code, not DB — but still worth checking)
	for (const s of CURATED_SKILLS) {
		const ctx = {
			collection: "curated-skills",
			recordSlug: s.slug,
			recordName: s.name,
		};
		add(s.homepage, { ...ctx, field: "homepage" });
		add(s.repository, { ...ctx, field: "repository" });
		add(s.docs, { ...ctx, field: "docs" });
	}

	// Community skills (approved only — pending submissions might be in
	// flux, no need to spam them with checks)
	try {
		const community = await payload.find({
			collection: "community-skills",
			where: { status: { equals: "approved" } },
			limit: 500,
			depth: 0,
		});
		for (const s of community.docs as Array<{
			slug: string;
			name?: string;
			homepage?: string;
			repository?: string;
			docs?: string;
		}>) {
			const ctx = {
				collection: "community-skills",
				recordSlug: s.slug,
				recordName: s.name,
			};
			add(s.homepage, { ...ctx, field: "homepage" });
			add(s.repository, { ...ctx, field: "repository" });
			add(s.docs, { ...ctx, field: "docs" });
		}
	} catch (err) {
		console.warn(`[community-skills] skipped: ${(err as Error).message}`);
	}

	// Partners (published only). Post-dates the original WIP — and it's the
	// surface where the one REAL hijacked-URL incident happened (a partner
	// websiteUrl pointing at an unrelated/unsafe page), so these are the
	// highest-value links to watch.
	try {
		const partners = await payload.find({
			collection: "partner-accounts",
			where: { status: { equals: "published" } },
			limit: 300,
			depth: 0,
		});
		for (const pt of partners.docs as Array<{
			slug: string;
			name?: string;
			websiteUrl?: string;
			docsUrl?: string;
		}>) {
			const ctx = {
				collection: "partner-accounts",
				recordSlug: pt.slug,
				recordName: pt.name,
			};
			add(pt.websiteUrl, { ...ctx, field: "websiteUrl" });
			add(pt.docsUrl, { ...ctx, field: "docsUrl" });
		}
	} catch (err) {
		console.warn(`[partner-accounts] skipped: ${(err as Error).message}`);
	}

	return map;
}

function cleanUrl(raw: string | undefined | null): string | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	if (!trimmed) return null;
	// Reject obvious non-URLs
	if (!/^https?:\/\//i.test(trimmed)) return null;
	// Strip trailing slashes for dedup
	return trimmed.replace(/\/+$/, "");
}

/* ─── HTTP check ─────────────────────────────────────────────────────── */

async function checkUrl(url: string): Promise<CheckResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		const res = await fetch(url, {
			method: "HEAD",
			redirect: "manual",
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "*/*",
			},
			signal: controller.signal,
		});

		// Some sites (GitHub for one) return 404/405 on HEAD but 200 on GET.
		// Retry with GET if HEAD says it's broken.
		if (res.status >= 400 && res.status !== 401 && res.status !== 403) {
			const getRes = await fetch(url, {
				method: "GET",
				redirect: "manual",
				headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
				signal: controller.signal,
			});
			return summarize(getRes);
		}

		return summarize(res);
	} catch (err) {
		const e = err as Error & { code?: string; cause?: unknown };
		let reason: string;
		if (e.name === "AbortError") {
			reason = `timeout ${TIMEOUT_MS / 1000}s`;
		} else if (e.code) {
			reason = e.code; // ENOTFOUND, ECONNREFUSED, etc.
		} else if (e.message.includes("certificate")) {
			reason = "tls-cert-invalid";
		} else {
			reason = e.message.slice(0, 80);
		}
		return {
			url,
			status: "error",
			statusCode: null,
			errorReason: reason,
			redirectTo: null,
		};
	} finally {
		clearTimeout(timeout);
	}
}

function summarize(res: Response): CheckResult {
	const url = res.url;
	if (res.status >= 200 && res.status < 300) {
		return {
			url,
			status: "ok",
			statusCode: res.status,
			errorReason: null,
			redirectTo: null,
		};
	}
	// Bot-protection walls (X/Twitter, LinkedIn, Cloudflare challenges): the
	// link may be perfectly alive but unverifiable by a bot. Distinct status so
	// it never pollutes the error count — "can't verify" is not "dead".
	if (
		res.status === 401 ||
		res.status === 403 ||
		res.status === 429 ||
		res.status === 999
	) {
		return {
			url,
			status: "blocked",
			statusCode: res.status,
			errorReason: "bot-protection",
			redirectTo: null,
		};
	}
	if (res.status >= 300 && res.status < 400) {
		const location = res.headers.get("location");
		return {
			url,
			status: "redirect",
			statusCode: res.status,
			errorReason: null,
			redirectTo: location ? new URL(location, url).href : null,
		};
	}
	return {
		url,
		status: "error",
		statusCode: res.status,
		errorReason: res.statusText || `HTTP ${res.status}`,
		redirectTo: null,
	};
}

/* ─── Concurrency control ────────────────────────────────────────────── */

async function runWithConcurrency<T, R>(
	items: T[],
	fn: (item: T) => Promise<R>,
	concurrency: number,
): Promise<R[]> {
	const results: R[] = [];
	let idx = 0;
	const workers = Array.from({ length: concurrency }, async () => {
		while (idx < items.length) {
			const i = idx++;
			results[i] = await fn(items[i]);
		}
	});
	await Promise.all(workers);
	return results;
}

/* ─── Main ───────────────────────────────────────────────────────────── */

async function main() {
	console.log(`Curator Agent — Link health checker`);
	console.log(`Mode: ${EXECUTE ? "EXECUTE (writes to DB)" : "DRY RUN"}\n`);

	const payload = await getPayload({ config: await configPromise });
	const urls = await collectAllUrls(payload);

	const entries: UrlEntry[] = Array.from(urls.entries()).map(
		([url, targets]) => ({
			url,
			targets,
		}),
	);

	console.log(
		`Collected ${entries.length} unique URLs across the directory.\n`,
	);

	const results = await runWithConcurrency(
		entries,
		async ({ url, targets }) => {
			const r = await checkUrl(url);
			return { ...r, targets };
		},
		CONCURRENCY,
	);

	const ok = results.filter((r) => r.status === "ok").length;
	const redirect = results.filter((r) => r.status === "redirect").length;
	const blocked = results.filter((r) => r.status === "blocked").length;
	const error = results.filter((r) => r.status === "error").length;

	console.log(`\nResults:`);
	console.log(`  ok:       ${ok}`);
	console.log(`  redirect: ${redirect}`);
	console.log(
		`  blocked:  ${blocked} (bot-protection — unverifiable, not dead)`,
	);
	console.log(`  error:    ${error}\n`);

	if (error > 0) {
		console.log(`Errors:`);
		for (const r of results.filter((r) => r.status === "error")) {
			const code = r.statusCode
				? `HTTP ${r.statusCode}`
				: (r.errorReason ?? "unknown");
			console.log(`  ${code.padEnd(20)} ${r.url}`);
			for (const t of r.targets) {
				console.log(`      ↳ ${t.collection}/${t.recordSlug}.${t.field}`);
			}
		}
		console.log("");
	}

	if (!EXECUTE) {
		console.log("Dry run — no DB writes. Pass --execute to persist results.\n");
		process.exit(0);
	}

	// Upsert results into LinkChecks collection
	const now = new Date();
	let created = 0;
	let updated = 0;
	for (const r of results) {
		const existing = await payload.find({
			collection: "link-checks" as any,
			where: { url: { equals: r.url } },
			limit: 1,
			depth: 0,
		});
		const prev = existing.docs[0] as
			| {
					id: string;
					status: Status;
					consecutiveFailures: number;
					firstFailedAt?: string | null;
					lastSuccessAt?: string | null;
			  }
			| undefined;

		const isFailingNow = r.status === "error";
		const wasFailing = prev && prev.status !== "ok";

		const consecutiveFailures = isFailingNow
			? (prev?.consecutiveFailures ?? 0) + 1
			: 0;
		const firstFailedAt = isFailingNow
			? wasFailing
				? (prev?.firstFailedAt ?? now.toISOString())
				: now.toISOString()
			: null;
		const lastSuccessAt =
			r.status === "ok" ? now.toISOString() : (prev?.lastSuccessAt ?? null);

		const data = {
			url: r.url,
			status: r.status,
			statusCode: r.statusCode ?? undefined,
			errorReason: r.errorReason ?? undefined,
			redirectTo: r.redirectTo ?? undefined,
			consecutiveFailures,
			firstFailedAt: firstFailedAt ?? undefined,
			lastSuccessAt: lastSuccessAt ?? undefined,
			lastChecked: now.toISOString(),
			targets: r.targets.map((t) => ({
				collection: t.collection,
				recordSlug: t.recordSlug,
				recordName: t.recordName,
				field: t.field,
			})),
		};

		if (prev) {
			await payload.update({
				collection: "link-checks" as any,
				id: prev.id,
				data,
				depth: 0,
			});
			updated++;
		} else {
			await payload.create({
				collection: "link-checks" as any,
				data,
				depth: 0,
			});
			created++;
		}
	}

	// Cleanup — delete LinkCheck records whose URL no longer appears anywhere
	const currentUrls = new Set(results.map((r) => r.url));
	const all = await payload.find({
		collection: "link-checks" as any,
		limit: 5000,
		depth: 0,
	});
	let deleted = 0;
	for (const doc of all.docs as Array<{ id: string; url: string }>) {
		if (!currentUrls.has(doc.url)) {
			await payload.delete({
				collection: "link-checks" as any,
				id: doc.id,
			});
			deleted++;
		}
	}

	console.log(
		`Persisted: ${created} created, ${updated} updated, ${deleted} cleaned up.`,
	);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
