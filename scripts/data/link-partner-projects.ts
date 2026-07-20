/**
 * Populate partners.projectSlug from the hand-verified identity map — the
 * join that lets partner-owned data (verified on-chain assets, anchor
 * coverage) flow onto the matching directory project.
 *
 * The map itself lives in src/lib/partner-project-identity.ts (with the
 * domain cross-check plumbing that keeps it honest — see that header for
 * the Spectra-near-miss rationale). This script only performs the write;
 * the dry run additionally smoke-checks each pair's domains so a wrong
 * identity is visible BEFORE --execute.
 *
 * Usage:
 *   pnpm exec tsx scripts/data/link-partner-projects.ts             # dry run
 *   pnpm exec tsx scripts/data/link-partner-projects.ts --execute   # write
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import {
	PARTNER_PROJECT_LINKS,
	registrableDomain,
} from "../../src/lib/partner-project-identity";
import configPromise from "../../src/payload.config";

const execute = process.argv.includes("--execute");

async function run() {
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	const payload = await getPayload({ config: configPromise });

	let linked = 0;
	let skipped = 0;
	for (const [partnerSlug, projectSlug] of Object.entries(
		PARTNER_PROJECT_LINKS,
	)) {
		const partner = await payload.find({
			collection: "partner-accounts",
			where: { slug: { equals: partnerSlug } },
			limit: 1,
			depth: 0,
		});
		if (!partner.docs.length) {
			console.log(`SKIP ${partnerSlug}: partner not found`);
			skipped += 1;
			continue;
		}
		const project = await payload.find({
			collection: "projects",
			where: { slug: { equals: projectSlug } },
			limit: 1,
			depth: 0,
			select: { slug: true, name: true, links: true },
		});
		if (!project.docs.length) {
			console.log(`SKIP ${partnerSlug}: project '${projectSlug}' not found`);
			skipped += 1;
			continue;
		}
		// Authoring-time identity smoke check (report-only): a domain mismatch
		// between the two sides is the Spectra-near-miss smell. WARN, don't
		// stop — the full verdict incl. the verified allowlist lives in
		// scripts/data/check-partner-project-identity.ts.
		const partnerDom = registrableDomain(
			(partner.docs[0] as { websiteUrl?: string | null }).websiteUrl,
		);
		const projectDom = registrableDomain(
			(project.docs[0] as { links?: { website?: string | null } }).links
				?.website,
		);
		if (partnerDom && projectDom && partnerDom !== projectDom) {
			console.log(
				`  WARN ${partnerSlug} → ${projectSlug}: domain mismatch (${partnerDom} vs ${projectDom}) — verify identity or allowlist in src/lib/partner-project-identity.ts`,
			);
		}
		const current = (partner.docs[0] as { projectSlug?: string | null })
			.projectSlug;
		if (current === projectSlug) {
			console.log(`  ok ${partnerSlug} → ${projectSlug} (already set)`);
			continue;
		}
		console.log(
			`${execute ? "WRITE" : "would write"} ${partnerSlug} → ${projectSlug}${current ? ` (was ${current})` : ""}`,
		);
		if (execute) {
			await payload.update({
				collection: "partner-accounts",
				id: (partner.docs[0] as { id: string | number }).id,
				data: { projectSlug },
			});
			linked += 1;
		}
	}
	console.log(
		`\n${execute ? "Linked" : "Would link"}: ${execute ? linked : Object.keys(PARTNER_PROJECT_LINKS).length - skipped} | skipped: ${skipped}`,
	);
	if (!execute) console.log("Dry run. --execute to write.");
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
