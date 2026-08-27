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
 * Two verdicts, two histories (lessons class 32 — see src/lib/probe-external):
 *   error   PROVEN broken — 404/410, host does not resolve, connection
 *           refused. A finding on the first run (consecutiveFailures).
 *   blocked NO verdict — bot wall, 5xx, timeout, bad certificate. Proves
 *           nothing on any single run, so it never counts as a failure;
 *           instead consecutiveUnverifiable tracks the streak and
 *           UNVERIFIABLE_RUNS_TO_ESCALATE consecutive runs sets needsReview.
 *           That is how a permanently sick origin still reaches a human
 *           without a transient 503 being reported as a dead link.
 *
 * Usage:
 *   pnpm exec tsx scripts/check-links.ts             # report mode only
 *   pnpm exec tsx scripts/check-links.ts --execute   # actually write to DB
 *
 * Reports the diff so a daily cron can post a Slack/Discord/whatever
 * notification when new failures appear.
 */

import "./load-env";
import { getPayload } from "payload";
import { CURATED_SKILLS } from "../src/lib/integrations/curated-skills";
import {
	type LinkStatus,
	nextLinkHistory,
	UNVERIFIABLE_RUNS_TO_ESCALATE,
} from "../src/lib/link-history";
import { classifyPage, type PageVerdict } from "../src/lib/page-verdict";
import {
	classifyExternalError,
	classifyExternalStatus,
	isBotWall,
} from "../src/lib/probe-external";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const CONCURRENCY = 5;
const TIMEOUT_MS = 10_000;
const USER_AGENT =
	"StellarLightLinkChecker/1.0 (+https://stellarlight.xyz; admin@stellarlight.xyz)";

type Status = LinkStatus;

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
	pageTitle?: string | null;
	pageVerdict?: PageVerdict | null;
	finalHost?: string | null;
}

interface UrlEntry {
	url: string;
	targets: Target[];
}

/* ─── URL collection ─────────────────────────────────────────────────── */

let collectorErrors = 0;

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
		limit: 2000,
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
		limit: 2000,
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
			limit: 2000,
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
		collectorErrors++;
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
		collectorErrors++;
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
		collectorErrors++;
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
		collectorErrors++;
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

/* ─── Page read (what a 2xx actually served) ─────────────────────────── */

const NO_PAGE_READ =
	/(^|\.)(github\.com|x\.com|twitter\.com|linkedin\.com|discord\.(gg|com)|t\.me|medium\.com|youtube\.com|apps\.apple\.com|play\.google\.com|npmjs\.com|crates\.io|jsr\.io)$/i;

/** Bounded GET of the first 64 KB so the verdict can see the title/meta.
 * Skipped for hosts where a page title says nothing about a product. */
async function readPage(
	url: string,
	signal: AbortSignal,
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
		headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*;q=0.5" },
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

async function checkUrl(url: string): Promise<CheckResult> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

	try {
		let res = await fetch(url, {
			method: "HEAD",
			redirect: "manual",
			headers: {
				"User-Agent": USER_AGENT,
				Accept: "*/*",
			},
			signal: controller.signal,
		});
		// A SAME-SITE redirect is a hop, not an outcome. nodies.app answers
		// 308 -> https://www.nodies.app/ which serves 200 — a perfectly live
		// site — but "redirect" never stamps lastSuccessAt (link-history.ts),
		// so every www/apex/https-canonicalizing site sat forever with no
		// successful check, the basis upgrader skipped it, and its row showed
		// Live with no source (386 rows on the 2026-08-27 dry run; guard D's
		// F slice). Follow up to 3 same-site hops and judge the FINAL answer.
		// An OFFSITE redirect stays a first-class result — the parked-domain /
		// hijack detector depends on seeing it (45 found in the 08-21 sweep).
		const sameSite = (a: string, b: string) =>
			a.replace(/^www\./, "") === b.replace(/^www\./, "");
		let hops = 0;
		let cur = url;
		while (
			res.status >= 300 &&
			res.status < 400 &&
			hops < 3 &&
			res.headers.get("location")
		) {
			// resolve against the CURRENT hop — a relative Location on hop 2+
			// must not resolve against the original URL
			const next = new URL(res.headers.get("location") as string, cur);
			if (!sameSite(new URL(url).hostname, next.hostname)) break;
			hops++;
			cur = next.href;
			res = await fetch(cur, {
				method: "HEAD",
				redirect: "manual",
				headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
				signal: controller.signal,
			});
		}

		// Some sites (GitHub for one) return 404/405 on HEAD but 200 on GET.
		// Retry with GET if HEAD says it's broken — but not through a bot wall,
		// where a second request just burns the target's rate limit.
		if (res.status >= 400 && res.status < 500 && !isBotWall(res.status)) {
			const getRes = await fetch(url, {
				method: "GET",
				redirect: "manual",
				headers: { "User-Agent": USER_AGENT, Accept: "*/*" },
				signal: controller.signal,
			});
			return summarize(getRes, url);
		}

		const base = summarize(res, url);
		if (base.status === "ok") {
			// The 2xx is only the beginning of the evidence (class: a 200 is not
			// a business). Read what it served; any failure here leaves the
			// verdict unknown, never downgrades.
			try {
				const page = await readPage(url, controller.signal);
				const finalHost = page.finalUrl
					? new URL(page.finalUrl).hostname
					: null;
				const v = classifyPage({
					title: page.title,
					metaDescription: page.meta,
					bodyStart: page.body,
					requestedHost: new URL(url).hostname,
					finalHost,
				});
				return {
					...base,
					pageTitle: page.title?.slice(0, 120) ?? null,
					pageVerdict: v.verdict,
					finalHost,
				};
			} catch {
				return { ...base, pageVerdict: "unknown" };
			}
		}
		if (base.status === "redirect" && base.redirectTo) {
			const finalHost = new URL(base.redirectTo).hostname;
			const v = classifyPage({
				requestedHost: new URL(url).hostname,
				finalHost,
			});
			return {
				...base,
				finalHost,
				pageVerdict: v.verdict === "offsite-redirect" ? v.verdict : null,
			};
		}
		return base;
	} catch (err) {
		const e = err as Error & { code?: string; cause?: unknown };
		// Class 32: a thrown fetch splits two ways. ENOTFOUND / ECONNREFUSED
		// means the host is GONE — proven broken on the first run. A timeout or
		// a bad certificate means we could not look; the cert error in
		// particular proves a server IS there. Those become `blocked` and are
		// escalated by streak length, not by a single run.
		const { verdict } = classifyExternalError(err);
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
			status: verdict === "absent" ? "error" : "blocked",
			statusCode: null,
			errorReason: reason,
			redirectTo: null,
		};
	} finally {
		clearTimeout(timeout);
	}
}

function summarize(res: Response, requestedUrl: string): CheckResult {
	// Review finding 22/10: fetch normalizes root domains (example.com →
	// example.com/), so keying by res.url split every root URL's identity from
	// its stored record (error path used the cleaned form) — churn + dupes.
	const url = requestedUrl;
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
	// This file had the idea first; isBotWall now shares the set with every
	// other detector (src/lib/probe-external, class 32).
	if (isBotWall(res.status)) {
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
	// A 5xx is the ORIGIN failing, not the link being wrong — one run proves
	// nothing (class 32). It joins the bot walls in `blocked`, and the streak
	// counter escalates it: a URL nobody could verify for
	// UNVERIFIABLE_RUNS_TO_ESCALATE consecutive days sets `needsReview`, so a
	// permanently sick origin still reaches a human instead of resting at
	// "blocked" forever. Only a verdict of `absent` (404/410 here) is an error
	// on sight.
	if (classifyExternalStatus(res.status) !== "absent") {
		return {
			url,
			status: "blocked",
			statusCode: res.status,
			errorReason: `server-error HTTP ${res.status}`,
			redirectTo: null,
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
		`  blocked:  ${blocked} (no verdict this run — bot wall / 5xx / timeout / bad cert)`,
	);
	console.log(`  error:    ${error} (proven broken — 404/410/DNS/refused)\n`);

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

	// Class 32 escalation: no single unverifiable probe is a finding, but a URL
	// nobody has been able to verify for UNVERIFIABLE_RUNS_TO_ESCALATE runs is.
	// Read the stored streaks so the DRY RUN reports this too — otherwise the
	// escalation would only ever be visible after a write.
	const blockedResults = results.filter((r) => r.status === "blocked");
	const streaks = new Map<string, number>();
	if (blockedResults.length > 0) {
		try {
			const prior = await payload.find({
				collection: "link-checks" as any,
				where: { url: { in: blockedResults.map((r) => r.url) } },
				limit: blockedResults.length,
				depth: 0,
			});
			for (const d of prior.docs as Array<{
				url: string;
				consecutiveUnverifiable?: number;
			}>)
				streaks.set(d.url, d.consecutiveUnverifiable ?? 0);
		} catch (err) {
			// A read failure must not sink the run; the streaks are reporting only.
			console.warn(`  (streak lookup skipped: ${(err as Error).message})`);
		}
	}
	const escalated = blockedResults
		.map((r) => ({ r, runs: (streaks.get(r.url) ?? 0) + 1 }))
		.filter(({ runs }) => runs >= UNVERIFIABLE_RUNS_TO_ESCALATE)
		.sort((a, b) => b.runs - a.runs);

	if (escalated.length > 0) {
		console.log(
			`Persistently unverifiable (≥${UNVERIFIABLE_RUNS_TO_ESCALATE} consecutive runs) — THESE ARE FINDINGS:`,
		);
		console.log(
			`  Not proven broken, but nobody has known their state for that many runs.\n`,
		);
		for (const { r, runs } of escalated) {
			console.log(
				`  ${String(`${runs} runs`).padEnd(10)} ${(r.errorReason ?? "unknown").padEnd(24)} ${r.url}`,
			);
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
	let writeFailed = 0;
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
					consecutiveUnverifiable?: number;
					firstUnverifiableAt?: string | null;
			  }
			| undefined;

		const h = nextLinkHistory(prev, r.status, now);

		const data = {
			url: r.url,
			status: r.status,
			// Liveness hardening: persist what the 2xx served. undefined =
			// leave unchanged (Review finding 11) — only overwrite when read.
			...(r.pageVerdict !== undefined
				? {
						pageTitle: r.pageTitle ?? null,
						pageVerdict: r.pageVerdict,
						finalHost: r.finalHost ?? null,
					}
				: {}),
			// Review finding 11: undefined = "leave unchanged" in Payload updates —
			// stale errorReason/redirectTo survived a URL recovering. null CLEARS.
			statusCode: r.statusCode ?? null,
			errorReason: r.errorReason ?? null,
			redirectTo: r.redirectTo ?? null,
			consecutiveFailures: h.consecutiveFailures,
			firstFailedAt: h.firstFailedAt,
			lastSuccessAt: h.lastSuccessAt ?? undefined,
			consecutiveUnverifiable: h.consecutiveUnverifiable,
			firstUnverifiableAt: h.firstUnverifiableAt,
			needsReview: h.needsReview,
			lastChecked: now.toISOString(),
			targets: r.targets.map((t) => ({
				collection: t.collection,
				recordSlug: t.recordSlug,
				recordName: t.recordName,
				field: t.field,
			})),
		};

		// Per-write isolation (2026-07-09): a duplicate-key race or validation
		// error on one URL must not abandon the remaining upserts + cleanup.
		try {
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
		} catch (err) {
			writeFailed++;
			console.error(`  WRITE FAILED: ${r.url} — ${String(err)}`);
		}
	}

	// Review finding 9: if ANY collector failed, its URLs are missing from this
	// run "not because they were removed" — running cleanup would mass-delete
	// their records. Skip cleanup entirely on a partial collection.
	if (collectorErrors > 0) {
		console.warn(
			`Skipping cleanup: ${collectorErrors} collector(s) failed — a partial URL set must not drive deletions.`,
		);
		console.log(
			`Persisted: ${created} created, ${updated} updated, ${writeFailed} write-failed, 0 cleaned up (skipped).`,
		);
		process.exit(0);
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
		`Persisted: ${created} created, ${updated} updated, ${writeFailed} write-failed, ${deleted} cleaned up.`,
	);
	process.exit(writeFailed ? 1 : 0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
