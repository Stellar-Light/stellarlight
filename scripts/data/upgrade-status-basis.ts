/**
 * Give inherited status labels a basis that actually discriminates.
 *
 *   npx tsx scripts/data/upgrade-status-basis.ts            # DRY RUN
 *   npx tsx scripts/data/upgrade-status-basis.ts --execute
 *
 * THE PROBLEM (stellar-raven sls-024, four recurrences): `statusBasis` is
 * populated on ~84% of projects with the single value "source-inherited".
 * A field that takes one value carries no information — a consumer cannot
 * tell whether "Live" means an operator said so, a site responded, coins
 * moved on-chain, or a human checked. The enum already has the right values;
 * almost nothing uses them.
 *
 * THE EVIDENCE WE ALREADY HOLD: check-links.ts HEAD-requests every external
 * URL in the directory weekly and records the outcome in `link-checks`. A
 * project whose website answered on a known date is a project whose Live
 * label has a real, dated, citable basis — `site-liveness`, which is exactly
 * what the enum value means. We were collecting the evidence and never
 * joining it to the claim.
 *
 * WHAT THIS DELIBERATELY WILL NOT DO:
 *   - It never changes `status`. A site that fails to answer is NOT proof a
 *     project is dead (a company can outlive its marketing site, and our own
 *     Keybase incident came from treating an inference as a verdict). Failures
 *     are counted and reported here, never written.
 *   - It never overwrites a STRONGER basis. human-verified, onchain-activity
 *     and operator-announcement all outrank a site ping and are left alone.
 *   - It refuses stale evidence. A success from six months ago is not
 *     current grounds for a freshness claim, so checks older than
 *     MAX_EVIDENCE_AGE_DAYS are skipped and the row keeps its weak basis
 *     honestly rather than gaining a flattering one.
 *
 * `statusAsOf` is set to when the site ACTUALLY ANSWERED, not to now — the
 * date has to mean the observation, which is the other half of sls-024.
 */

import "../load-env";
import { getPayload } from "payload";
import { NON_PRODUCT_VERDICTS } from "../../src/lib/page-verdict";

const { default: configPromise } = await import("../../src/payload.config");

const EXECUTE = process.argv.includes("--execute");

/** Bases a site ping is allowed to replace. Anything else outranks it. */
const WEAK = new Set(["source-inherited", "unverified"]);

/** Older than this and a successful check is history, not evidence. */
const MAX_EVIDENCE_AGE_DAYS = 60;

const days = (iso: string) =>
	(Date.now() - new Date(iso).getTime()) / 86_400_000;

/** Compare hosts, ignoring scheme, www and trailing slash. */
function sameTarget(a: string, b: string): boolean {
	const norm = (u: string) =>
		u
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.replace(/\/+$/, "");
	return norm(a) === norm(b);
}

async function main() {
	console.log(
		`status-basis upgrade — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}\n`,
	);
	const payload = await getPayload({ config: await configPromise });

	const [projects, checks] = await Promise.all([
		payload.find({
			collection: "projects",
			limit: 5000,
			depth: 0,
			select: {
				slug: true,
				name: true,
				status: true,
				statusBasis: true,
				statusAsOf: true,
				statusSourceUrl: true,
				links: true,
			},
		}),
		payload.find({
			collection: "link-checks",
			limit: 20000,
			depth: 0,
			select: {
				url: true,
				status: true,
				statusCode: true,
				lastSuccessAt: true,
				lastChecked: true,
				pageVerdict: true,
				pageTitle: true,
				redirectTo: true,
			},
		}),
	]);

	type Check = {
		url?: string;
		status?: string;
		statusCode?: number | null;
		lastSuccessAt?: string | null;
		lastChecked?: string | null;
		pageVerdict?: string | null;
		pageTitle?: string | null;
		redirectTo?: string | null;
	};
	const live: Check[] = (checks.docs as Check[]).filter(
		(c) => c.url && c.lastSuccessAt,
	);
	console.log(
		`${projects.totalDocs} projects · ${checks.totalDocs} link checks (${live.length} with a recorded success)\n`,
	);
	if (live.length === 0) {
		console.error(
			"✗ no successful link checks at all — instrument failure, not an absence of live sites",
		);
		process.exit(1);
	}

	// Every check keyed by target (incl. ones with no success) — the
	// downgrade pass needs the latest verdict even when the site no longer
	// answers at all.
	const allByTarget = new Map<string, Check>();
	for (const c of checks.docs as Check[]) {
		if (!c.url) continue;
		const key = c.url
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.replace(/\/+$/, "");
		allByTarget.set(key, c);
	}
	const byTarget = new Map<string, Check>();
	for (const c of live) {
		const key = (c.url as string)
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.replace(/\/+$/, "");
		const prev = byTarget.get(key);
		// Keep the freshest success for a URL two projects share.
		if (
			!prev ||
			new Date(c.lastSuccessAt as string) >
				new Date(prev.lastSuccessAt as string)
		) {
			byTarget.set(key, c);
		}
	}

	const upgrade: Array<{
		id: string;
		slug: string;
		url: string;
		asOf: string;
	}> = [];
	const nonProduct: Array<{
		slug: string;
		url: string;
		verdict: string;
		title: string;
	}> = [];
	let noWebsite = 0;
	let noCheck = 0;
	let staleEvidence = 0;
	let strongerBasis = 0;

	const noCheckRows: Array<{
		slug: string;
		status: string;
		site: string;
		why: string;
		lastChecked: string;
	}> = [];
	for (const p of projects.docs as Array<{
		id: string;
		slug: string;
		status?: string | null;
		statusBasis?: string | null;
		links?: { website?: string | null } | null;
	}>) {
		const basis = p.statusBasis ?? null;
		if (basis && !WEAK.has(basis)) {
			strongerBasis++;
			continue;
		}
		const site = p.links?.website?.trim();
		if (!site) {
			noWebsite++;
			continue;
		}
		const key = site
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.replace(/\/+$/, "");
		const check = byTarget.get(key);
		if (!check?.lastSuccessAt) {
			noCheck++;
			// The rows no machine lane can ever upgrade. Their latest check (any
			// outcome) says WHY — dead, redirected off-origin, never probed — and
			// that reason is the owner's triage input: relink, verdict Inactive,
			// or leave. A bare count hid 144 of these for a week.
			const latest = allByTarget.get(key);
			noCheckRows.push({
				slug: p.slug,
				status: p.status ?? "?",
				site,
				why: !latest
					? "never-checked"
					: latest.redirectTo
						? `redirect → ${latest.redirectTo}`
						: `${latest.status ?? "?"}${latest.statusCode ? ` ${latest.statusCode}` : ""}${latest.pageVerdict ? ` (${latest.pageVerdict})` : ""}`,
				lastChecked: latest?.lastChecked?.slice(0, 10) ?? "-",
			});
			continue;
		}
		if (days(check.lastSuccessAt) > MAX_EVIDENCE_AGE_DAYS) {
			staleEvidence++;
			continue;
		}
		// stellar-raven #39: a 200 is not a business. Kulipa (shut down
		// 2026-07-29, domain serving a "changing home" placeholder) and
		// GetBlockCard (lapsed domain serving lottery spam) both held a
		// site-liveness basis earned this way. The link check now records
		// what the page served; a non-product verdict is not evidence.
		if (
			check.pageVerdict &&
			NON_PRODUCT_VERDICTS.has(check.pageVerdict as never)
		) {
			nonProduct.push({
				slug: p.slug,
				url: site,
				verdict: check.pageVerdict,
				title: check.pageTitle ?? "",
			});
			continue;
		}
		upgrade.push({
			id: p.id,
			slug: p.slug,
			url: site,
			asOf: check.lastSuccessAt,
		});
	}

	console.log(`already carry a stronger basis : ${strongerBasis}`);
	console.log(`no website link                : ${noWebsite}`);
	console.log(`no successful check for it     : ${noCheck}`);
	console.log(
		`check too old (>${MAX_EVIDENCE_AGE_DAYS}d), left weak : ${staleEvidence}`,
	);
	if (noCheckRows.length) {
		console.log(
			`\n── ${noCheckRows.length} weak rows with NO successful check — owner triage (relink / Inactive / leave) ──`,
		);
		noCheckRows.sort(
			(a, b) => a.why.localeCompare(b.why) || a.slug.localeCompare(b.slug),
		);
		for (const r of noCheckRows)
			console.log(
				`  ${r.slug.padEnd(28)} ${r.status.padEnd(12)} ${r.lastChecked}  ${r.why.padEnd(44)} ${r.site}`,
			);
	}
	console.log(`\n→ ${upgrade.length} rows gain basis=site-liveness\n`);
	for (const u of upgrade.slice(0, 8)) {
		console.log(`   ${u.slug.padEnd(24)} ${u.asOf.slice(0, 10)}  ${u.url}`);
	}
	if (upgrade.length > 8) console.log(`   …and ${upgrade.length - 8} more`);

	// The reverse direction: rows that ALREADY carry site-liveness whose
	// latest check now says the page is not a product lose that basis —
	// down to `unverified`, status untouched, dated to the check. A parked
	// page never was evidence; we stop saying it is. Humans decide death.
	const downgrade: Array<{
		id: string;
		slug: string;
		url: string;
		verdict: string;
		asOf: string;
	}> = [];
	for (const p of projects.docs as Array<{
		id: string;
		slug: string;
		statusBasis?: string | null;
		links?: { website?: string | null } | null;
	}>) {
		if (p.statusBasis !== "site-liveness") continue;
		const site = p.links?.website?.trim();
		if (!site) continue;
		const key = site
			.toLowerCase()
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.replace(/\/+$/, "");
		const check = byTarget.get(key) ?? allByTarget.get(key);
		if (
			!check?.pageVerdict ||
			!NON_PRODUCT_VERDICTS.has(check.pageVerdict as never)
		)
			continue;
		downgrade.push({
			id: p.id,
			slug: p.slug,
			url: site,
			verdict: check.pageVerdict,
			asOf: check.lastSuccessAt ?? new Date().toISOString(),
		});
	}
	if (nonProduct.length) {
		console.log(
			`\n✋ ${nonProduct.length} site(s) answered 2xx but are NOT products — basis NOT upgraded:`,
		);
		for (const n of nonProduct.slice(0, 12))
			console.log(
				`   ${n.slug.padEnd(24)} ${n.verdict.padEnd(16)} ${n.title.slice(0, 50)}`,
			);
	}
	console.log(
		`\n→ ${downgrade.length} site-liveness row(s) DOWNGRADED to unverified (page is not a product)`,
	);
	for (const d of downgrade.slice(0, 12))
		console.log(`   ${d.slug.padEnd(24)} ${d.verdict.padEnd(16)} ${d.url}`);

	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing written. Re-run with --execute.");
		process.exit(0);
	}
	for (const d of downgrade) {
		await payload.update({
			collection: "projects",
			id: d.id,
			data: { statusBasis: "unverified", statusAsOf: d.asOf },
		});
	}

	let wrote = 0;
	for (const u of upgrade) {
		await payload.update({
			collection: "projects",
			id: u.id,
			data: {
				statusBasis: "site-liveness",
				// The date the site ANSWERED — not now. A basis is only worth
				// having if its date refers to the observation behind it.
				statusAsOf: u.asOf,
				statusSourceUrl: u.url,
			},
		});
		wrote++;
	}

	// Read back: payload.update accepts and silently drops unknown keys, so
	// prove the field actually landed rather than trusting the return.
	const after = await payload.find({
		collection: "projects",
		where: { statusBasis: { equals: "site-liveness" } },
		limit: 5000,
		depth: 0,
		select: { slug: true },
	});
	console.log(
		`\nwrote ${wrote} — ${after.totalDocs} rows now carry basis=site-liveness`,
	);
	process.exit(after.totalDocs >= wrote ? 0 : 1);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
