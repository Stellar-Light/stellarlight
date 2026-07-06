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
const OWNER_CONFIRMED_DEAD: string[] = [
	// own site is now a service-retirement notice (accounts closed, users moved
	// to Boss Money) — the company itself confirms it's dead. Owner-confirmed 2026-07-06.
	"anchor-elroy-app",
	// built on Interledger / Open Payments, NOT Stellar — dropped from the
	// Stellar anchor directory (not dead, just not Stellar). Owner-confirmed 2026-07-06.
	"anchor-wallet-guru",
];
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
// Fill-only-if-EMPTY metadata enrichment for real payment companies that were
// seeded thin (name only, no tagline). Thin DB data was NOT deadness — these
// are real, operating payment/anchor cos. Facts gathered 2026-07-06 from each
// company's OWN site + Stellar/SDF/SCF sources (cite-or-null; NOTHING invented).
// None publish a usable stellar.toml at their marketing domain, so structured
// SEP/asset data stays honestly empty — this fills human-readable metadata only.
// NEVER overwrites a partner-entered value.
const PARTNER_ENRICH: Record<
	string,
	{ tagline?: string; sectors?: string[]; regions?: string[]; country?: string }
> = {
	"anchor-alfred-pay": {
		tagline:
			"Stablecoin-to-local-rails cross-border payments across Latin America",
		sectors: ["payments"],
		regions: ["latam"],
	},
	"anchor-cash-abroad": {
		tagline:
			"Instant MXN–USDC conversion and cross-border payments for LatAm businesses",
		sectors: ["payments"],
		regions: ["latam"],
		country: "Mexico",
	},
	"anchor-coca-wallet": {
		tagline:
			"Non-custodial MPC wallet with a Visa card for crypto and fiat spending",
		sectors: ["payments"],
		regions: ["global"],
		country: "United Arab Emirates",
	},
	"anchor-ping": {
		tagline:
			"Global dollar and crypto accounts — receive and manage money anywhere",
		sectors: ["payments"],
		regions: ["latam"],
		country: "Argentina",
	},
	"anchor-trace-finance": {
		tagline: "Payments and stablecoin infrastructure for Brazil and LatAm",
		sectors: ["payments"],
		regions: ["latam"],
		country: "Brazil",
	},
	"anchor-boss-pay": {
		tagline:
			"Stellar-based wallet to store, send and exchange money across Africa",
		sectors: ["payments"],
		regions: ["africa"],
		country: "United States",
	},
	"anchor-blox-global": {
		tagline:
			"Financial operating system for moving and managing stablecoins globally",
		sectors: ["payments"],
		regions: ["global"],
		country: "United States",
	},
	"anchor-ripe-money": {
		tagline: "Stablecoin off-ramp for Asia — pay and get paid without a bank",
		sectors: ["payments"],
		regions: ["asia"],
		country: "Singapore",
	},
};

// Explicit URL CORRECTIONS — OVERWRITE a stored URL that is wrong or unsafe.
// boss-pay's seeded domain bossmoney.africa was hijacked (2026-07-06: 301s to a
// Turkish gambling site super-bahis.live); the live product is bossmoney.com.
// This is the ONLY place a non-empty field is overwritten — and only for safety.
const URL_CORRECTIONS: Record<string, string> = {
	"anchor-boss-pay": "https://www.bossmoney.com",
};
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
	if (
		OWNER_CONFIRMED_DEAD.length === 0 &&
		PILOT_SLUGS.length === 0 &&
		Object.keys(PARTNER_ENRICH).length === 0 &&
		Object.keys(URL_CORRECTIONS).length === 0
	) {
		console.error(
			"All lists are empty — nothing to do. Fill OWNER_CONFIRMED_DEAD / PILOT_SLUGS / PARTNER_ENRICH / URL_CORRECTIONS first (owner-confirmed only).",
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

	console.log("\n── Metadata enrichment (fill-if-empty; real payment cos) ──");
	for (const [slug, e] of Object.entries(PARTNER_ENRICH)) {
		const d = bySlug.get(slug);
		if (!d) {
			console.log(`  WARN: no partner with slug "${slug}" — skipped`);
			continue;
		}
		const data: Record<string, unknown> = {};
		const notes: string[] = [];
		if (e.tagline && !d.tagline) {
			data.tagline = e.tagline;
			notes.push(`tagline → "${e.tagline}"`);
		}
		if (e.sectors && (!d.sectors || d.sectors.length === 0)) {
			data.sectors = e.sectors;
			notes.push(`sectors → ${e.sectors.join("/")}`);
		}
		if (e.regions && (!d.regions || d.regions.length === 0)) {
			data.regions = e.regions;
			notes.push(`regions → ${e.regions.join("/")}`);
		}
		if (e.country && !d.country) {
			data.country = e.country;
			notes.push(`country → ${e.country}`);
		}
		if (Object.keys(data).length === 0) {
			console.log(`  ${d.name} (${slug}) — already complete, no-op`);
			continue;
		}
		console.log(`  ${d.name} (${slug}) — ${notes.join(" · ")}`);
		writes.push({ id: d.id, slug, data, note: notes.join(", ") });
	}

	console.log("\n── URL corrections (OVERWRITE unsafe/wrong URLs) ──");
	for (const [slug, url] of Object.entries(URL_CORRECTIONS)) {
		const d = bySlug.get(slug);
		if (!d) {
			console.log(`  WARN: no partner with slug "${slug}" — skipped`);
			continue;
		}
		if (d.websiteUrl === url) {
			console.log(`  ${d.name} (${slug}) — already ${url}, no-op`);
			continue;
		}
		console.log(
			`  ${d.name} (${slug}) — websiteUrl: ${d.websiteUrl ?? "(none)"} → ${url}`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { websiteUrl: url },
			note: `url fix → ${url}`,
		});
	}

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
