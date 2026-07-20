/**
 * Populate partners.projectSlug from the hand-verified identity map below —
 * the join that lets partner-owned data (verified on-chain assets, anchor
 * coverage) flow onto the matching directory project.
 *
 * Identity matching is the Spectra-near-miss class: a partner and a project
 * with similar names are NOT automatically the same entity. Every entry in
 * the map was verified (name + description agreement, fan-out pass
 * 2026-07-20) before landing here; partners absent from the map stay
 * unlinked on purpose.
 *
 * Usage:
 *   pnpm exec tsx scripts/data/link-partner-projects.ts             # dry run
 *   pnpm exec tsx scripts/data/link-partner-projects.ts --execute   # write
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const execute = process.argv.includes("--execute");

/** partnerSlug → directory projectSlug. Verified-only; see file header. */
export const PARTNER_PROJECT_LINKS: Record<string, string> = {
	albedo: "albedo",
	"anchor-alfred-pay": "alfred",
	"anchor-anclap": "anclap",
	"anchor-bitso": "bitso",
	"anchor-blox-global": "blox",
	"anchor-boss-pay": "boss-pay",
	"anchor-cash-abroad": "cash-abroad",
	"anchor-clickspesa": "clickspesa",
	"anchor-coca-wallet": "coca",
	"anchor-coins-ph": "coins-ph",
	"anchor-elroy-app": "elroy",
	"anchor-fonbnk": "fonbnk",
	"anchor-honey-coin": "honey-coin",
	"anchor-moneygram": "moneygram",
	"anchor-mykobo": "mykobo",
	"anchor-ping": "ping",
	"anchor-ripe-money": "ripe",
	"anchor-trace-finance": "trace",
	"anchor-wallet-guru": "wallet-guru",
	"anchor-yellow-card": "yellow-card",
	aquarius: "aquarius",
	audd: "audd",
	blend: "blend",
	certora: "certora",
	defindex: "defindex",
	etherfuse: "etherfuse",
	"franklin-templeton": "benji",
	freighter: "freighter",
	"gmo-zcom-trust": "gyen",
	halborn: "halborn",
	"hana-wallet": "hana",
	lobstr: "lobstr",
	ntokens: "brl",
	ottersec: "ottersec",
	"phoenix-protocol": "phoenix",
	reflector: "reflector",
	"runtime-verification": "runtime-verification",
	soroswap: "soroswap",
	stellarexpert: "stellar-expert",
	"trustless-work": "trustless-work",
	veridise: "veridise",
	"xbull-wallet": "xbull",
};

async function run() {
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	const payload = await getPayload({ config: configPromise });

	let linked = 0;
	let skipped = 0;
	for (const [partnerSlug, projectSlug] of Object.entries(
		PARTNER_PROJECT_LINKS,
	)) {
		const partner = await payload.find({
			collection: "partners",
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
			select: { slug: true, name: true },
		});
		if (!project.docs.length) {
			console.log(`SKIP ${partnerSlug}: project '${projectSlug}' not found`);
			skipped += 1;
			continue;
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
				collection: "partners",
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
