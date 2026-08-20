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
			},
		}),
	]);

	type Check = {
		url?: string;
		status?: string;
		lastSuccessAt?: string | null;
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
	let noWebsite = 0;
	let noCheck = 0;
	let staleEvidence = 0;
	let strongerBasis = 0;

	for (const p of projects.docs as Array<{
		id: string;
		slug: string;
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
			continue;
		}
		if (days(check.lastSuccessAt) > MAX_EVIDENCE_AGE_DAYS) {
			staleEvidence++;
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
	console.log(`\n→ ${upgrade.length} rows gain basis=site-liveness\n`);
	for (const u of upgrade.slice(0, 8)) {
		console.log(`   ${u.slug.padEnd(24)} ${u.asOf.slice(0, 10)}  ${u.url}`);
	}
	if (upgrade.length > 8) console.log(`   …and ${upgrade.length - 8} more`);

	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing written. Re-run with --execute.");
		process.exit(0);
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
