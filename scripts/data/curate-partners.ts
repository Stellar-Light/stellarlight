/** READ-ONLY by default. Owner-confirmed partner curation:
 *
 *   1. Archive DEAD partners — sets freshnessStatus="archived" (NOT status):
 *      the profile stays publicly reachable with the red Archived badge, but
 *      drops out of the default directory (quality gate) and AI matching.
 *      NEVER auto-detects deadness — the OWNER_CONFIRMED_DEAD list below is
 *      filled ONLY after the owner confirms each slug (repo-stale/site-up are
 *      not death signals; a human call is).
 *   2. Reconcile the PILOT cohort — pilot=true for PILOT_SLUGS, pilot=false
 *      for any currently-flagged partner not in the list. Pilot partners are
 *      featured first in the directory with a badge (Anke's select set).
 *
 * Hook-safe: neither write touches `status` or `email`, so the invite
 * afterChange hook never fires; the freshness beforeChange stamp only fires
 * for partner-user saves (local API has no user).
 *
 *   pnpm exec tsx scripts/data/curate-partners.ts            # dry run
 *   pnpm exec tsx scripts/data/curate-partners.ts --execute  # writes
 */
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

// ── Owner-confirmed lists — edit these, nothing else ─────────────────────────
// Slugs of partners the OWNER confirmed are dead/defunct (e.g. "ntokens" once
// confirmed). Empty until the owner signs off on the dry-run output.
const OWNER_CONFIRMED_DEAD: string[] = [];
// Slugs of the pilot cohort (the select partners Anke tests with) —
// owner-confirmed 2026-07-06: the original pilot trio.
const PILOT_SLUGS: string[] = ["defindex", "etherfuse", "trustless-work"];
// Fill-only-if-EMPTY enrichment so the pilots pass the directory quality bar
// (tagline + a contact path). Facts only: taglines condensed from their own
// seed descriptions; websites verified live 2026-07-06 (defindex.io 200 "DeFindex:
// Yield Infrastructure…", etherfuse.com + trustlesswork.com from their GitHub
// org profiles). NEVER overwrites a partner-entered value.
const PILOT_ENRICH: Record<string, { tagline: string; websiteUrl: string }> = {
	defindex: {
		tagline: "DeFi yield & index infrastructure on Soroban, by Palta Labs",
		websiteUrl: "https://defindex.io",
	},
	etherfuse: {
		tagline: "Local-currency stablecoins & tokenized-asset infrastructure",
		websiteUrl: "https://www.etherfuse.com",
	},
	"trustless-work": {
		tagline: "Smart-escrow infrastructure on Stellar — escrow-as-a-service",
		websiteUrl: "https://www.trustlesswork.com",
	},
};
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
	if (OWNER_CONFIRMED_DEAD.length === 0 && PILOT_SLUGS.length === 0) {
		console.error(
			"Both lists are empty — nothing to do. Fill OWNER_CONFIRMED_DEAD and/or PILOT_SLUGS first (owner-confirmed only).",
		);
		process.exit(1);
	}
	const payload = await getPayload({ config: await configPromise });
	const all = await payload.find({
		collection: "partner-accounts",
		limit: 300,
		depth: 0,
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	const docs = all.docs as any[];
	const bySlug = new Map(docs.map((d) => [d.slug, d]));
	console.log(`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}`);
	console.log(`Partners in collection: ${docs.length}\n`);

	const writes: Array<{
		id: string;
		slug: string;
		data: Record<string, unknown>;
		note: string;
	}> = [];

	console.log("── Archive (owner-confirmed dead) ──");
	for (const slug of OWNER_CONFIRMED_DEAD) {
		const d = bySlug.get(slug);
		if (!d) {
			console.log(`  WARN: no partner with slug "${slug}" — skipped`);
			continue;
		}
		if (d.freshnessStatus === "archived") {
			console.log(`  ${d.name} (${slug}) — already archived, no-op`);
			continue;
		}
		console.log(
			`  ${d.name} (${slug}) — freshnessStatus: ${d.freshnessStatus ?? "fresh"} → archived`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { freshnessStatus: "archived" },
			note: "archive",
		});
	}
	if (OWNER_CONFIRMED_DEAD.length === 0) console.log("  (list empty)");

	console.log("\n── Pilot cohort reconcile ──");
	const pilotSet = new Set(PILOT_SLUGS);
	for (const slug of PILOT_SLUGS) {
		const d = bySlug.get(slug);
		if (!d) {
			console.log(`  WARN: no partner with slug "${slug}" — skipped`);
			continue;
		}
		const data: Record<string, unknown> = {};
		const notes: string[] = [];
		if (d.pilot !== true) {
			data.pilot = true;
			notes.push("pilot on");
		}
		// Quality-bar enrichment — fill ONLY empty fields, never overwrite.
		const enrich = PILOT_ENRICH[slug];
		if (enrich) {
			if (!d.tagline) {
				data.tagline = enrich.tagline;
				notes.push(`tagline → "${enrich.tagline}"`);
			}
			if (!d.websiteUrl) {
				data.websiteUrl = enrich.websiteUrl;
				notes.push(`websiteUrl → ${enrich.websiteUrl}`);
			}
		}
		if (Object.keys(data).length === 0) {
			console.log(`  ${d.name} (${slug}) — already pilot + complete, no-op`);
			continue;
		}
		console.log(`  ${d.name} (${slug}) — ${notes.join(" · ")}`);
		writes.push({ id: d.id, slug, data, note: notes.join(", ") });
	}
	for (const d of docs) {
		if (d.pilot === true && !pilotSet.has(d.slug)) {
			console.log(
				`  ${d.name} (${d.slug}) — pilot: true → false (not in list)`,
			);
			writes.push({
				id: d.id,
				slug: d.slug,
				data: { pilot: false },
				note: "pilot off",
			});
		}
	}
	if (PILOT_SLUGS.length === 0)
		console.log(
			"  (list empty — existing pilot flags left untouched only if none are set)",
		);

	if (!EXECUTE) {
		console.log(`\nDRY RUN — ${writes.length} write(s) planned, none applied.`);
		process.exit(0);
	}
	for (const w of writes) {
		await payload.update({
			collection: "partner-accounts",
			id: w.id,
			data: w.data,
			overrideAccess: true,
		});
		console.log(`  wrote: ${w.slug} [${w.note}]`);
	}
	console.log(`\nDONE: ${writes.length} write(s) applied.`);
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
