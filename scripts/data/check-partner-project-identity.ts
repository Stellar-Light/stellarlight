/**
 * Report-only partner→project identity cross-check — the Spectra-near-miss
 * guard for the PARTNER_PROJECT_LINKS identity map.
 *
 * Every map entry was hand-verified when it landed, but identities DRIFT
 * after verification: either side's website can change, and a lapsed domain
 * can be re-registered by a stranger (the boss-pay incident: the project's
 * listed domain later 301-redirected to unrelated gambling/streaming
 * sites). This script re-asserts the join against the LIVE public API on
 * every run: for each mapped pair it compares the partner's websiteUrl with
 * the project's links.website on registrable domain (eTLD+1). Same domain →
 * still the same real-world entity. Different domain → either a
 * human-verified company/product split (ALLOWED_DOMAIN_MISMATCHES, keyed by
 * the EXACT domain pair so any further drift re-flags) or a failure a human
 * must review.
 *
 * READ-ONLY: fetches the public API, prints a table, never writes, never
 * auto-fixes. Exit 1 when any non-allowlisted mismatch is found
 * (CI-friendly), 0 otherwise. Missing data is a warning, not a failure.
 *
 *   SCOUT_BASE=https://stellarlight.xyz pnpm exec tsx scripts/data/check-partner-project-identity.ts
 */
import {
	ALLOWED_DOMAIN_MISMATCHES,
	PARTNER_PROJECT_LINKS,
	registrableDomain,
} from "../../src/lib/partner-project-identity";

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";

// biome-ignore lint/suspicious/noExplicitAny: dynamic JSON
async function j(path: string): Promise<any> {
	// One retry on transient failure (self-audit precedent: a single network
	// blip across ~40 sequential fetches must not manufacture a red run).
	for (let attempt = 0; ; attempt++) {
		try {
			const r = await fetch(`${BASE}${path}`, {
				headers: { "user-agent": "stellarlight-identity-check" },
			});
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return await r.json();
		} catch (e) {
			if (attempt >= 1) throw e;
			await new Promise((res) => setTimeout(res, 3000));
		}
	}
}

type Verdict = "PASS" | "ALLOWED" | "WARN" | "FAIL";

let passes = 0;
let allowed = 0;
let warns = 0;
let fails = 0;

function row(
	partnerSlug: string,
	projectSlug: string,
	partnerDom: string,
	projectDom: string,
	verdict: Verdict,
	note = "",
) {
	if (verdict === "PASS") passes++;
	else if (verdict === "ALLOWED") allowed++;
	else if (verdict === "WARN") warns++;
	else fails++;
	console.log(
		`  ${partnerSlug.padEnd(24)} ${projectSlug.padEnd(20)} ${(partnerDom || "—").padEnd(24)} ${(projectDom || "—").padEnd(24)} ${verdict}${note ? ` — ${note}` : ""}`,
	);
}

async function main() {
	console.log(`Partner→project identity cross-check → ${BASE}\n`);
	console.log(
		`  ${"PARTNER".padEnd(24)} ${"PROJECT".padEnd(20)} ${"PARTNER DOMAIN".padEnd(24)} ${"PROJECT DOMAIN".padEnd(24)} VERDICT`,
	);

	const partnersBySlug = new Map<string, { websiteUrl?: string | null }>();
	try {
		const d = await j("/api/partners?all=1&limit=100");
		for (const p of d.partners ?? []) partnersBySlug.set(p.slug, p);
	} catch (e) {
		// A guard that is blind must not report green.
		console.error(`\nFATAL: partners fetch failed: ${String(e)}`);
		process.exit(1);
	}

	for (const [partnerSlug, projectSlug] of Object.entries(
		PARTNER_PROJECT_LINKS,
	)) {
		const partner = partnersBySlug.get(partnerSlug);
		if (!partner) {
			row(
				partnerSlug,
				projectSlug,
				"",
				"",
				"WARN",
				"not in live /api/partners",
			);
			continue;
		}
		let project: { links?: { website?: string | null } } | undefined;
		try {
			const d = await j(
				`/api/projects/search?q=${encodeURIComponent(projectSlug)}&limit=10`,
			);
			project = (d.projects ?? []).find(
				(p: { slug: string; canonicalSlug?: string }) =>
					p.slug === projectSlug || p.canonicalSlug === projectSlug,
			);
		} catch (e) {
			row(
				partnerSlug,
				projectSlug,
				"",
				"",
				"WARN",
				`project search failed: ${String(e)}`,
			);
			continue;
		}
		if (!project) {
			row(
				partnerSlug,
				projectSlug,
				"",
				"",
				"WARN",
				"project not resolvable via /api/projects/search",
			);
			continue;
		}
		const partnerDom = registrableDomain(partner.websiteUrl);
		const projectDom = registrableDomain(project.links?.website);
		if (!partnerDom || !projectDom) {
			row(
				partnerSlug,
				projectSlug,
				partnerDom,
				projectDom,
				"WARN",
				!partnerDom
					? "partner has no websiteUrl"
					: "project has no links.website",
			);
			continue;
		}
		const allow = ALLOWED_DOMAIN_MISMATCHES[partnerSlug];
		if (partnerDom === projectDom) {
			if (allow)
				row(
					partnerSlug,
					projectSlug,
					partnerDom,
					projectDom,
					"WARN",
					"domains now MATCH — stale allowlist entry, remove it",
				);
			else row(partnerSlug, projectSlug, partnerDom, projectDom, "PASS");
		} else if (
			allow &&
			allow.partner === partnerDom &&
			allow.project === projectDom
		) {
			row(
				partnerSlug,
				projectSlug,
				partnerDom,
				projectDom,
				"ALLOWED",
				allow.reason,
			);
		} else {
			row(
				partnerSlug,
				projectSlug,
				partnerDom,
				projectDom,
				"FAIL",
				allow
					? "domains drifted AWAY from the allowlisted pair — re-verify identity"
					: "domains disagree — verify this is the same real-world entity",
			);
		}
	}

	console.log(
		`\n${passes} pass | ${allowed} allowed | ${warns} warn | ${fails} FAIL (of ${Object.keys(PARTNER_PROJECT_LINKS).length} mapped pairs)`,
	);
	if (fails) {
		console.log(
			"Non-allowlisted mismatch(es). Verify identity BY HAND; if legitimate, add an EXACT-domain entry to ALLOWED_DOMAIN_MISMATCHES with evidence. Never auto-fix.",
		);
		process.exit(1);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
