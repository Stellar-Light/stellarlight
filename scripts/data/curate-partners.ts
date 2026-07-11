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
	// 2026-07-09: hanawallet.io 301s permanently to hana.money (rebrand; live).
	"hana-wallet": "https://hana.money",
};

/** F6 part 2 (audit root #6 / lessons class 23): tagline backfill for rows the
 * default quality bar hid — ALL 5 wallets + ALL 4 protocols returned total:0
 * ("none exist") on type filters. FILL-IF-EMPTY ONLY: tagline is a
 * partner-owned manual field; we never overwrite one a partner set. Every
 * line below is VERBATIM from the partner's own site (hero/meta), fetched +
 * verified 2026-07-09; xbull-wallet deliberately absent (its site is a v2
 * coming-soon teaser — stamping that on a live wallet would mislead). */
const TAGLINE_BACKFILL: Record<string, string> = {
	freighter:
		"Browse, connect, and use Stellar apps — all in one place. Non-custodial Stellar wallet for browser and mobile.",
	lobstr: "Simple & Secure Stellar & XRPL Wallet",
	albedo:
		"Albedo provides a safe and reliable way to use Stellar accounts without trusting anyone with your secret key.",
	"hana-wallet":
		"Swap, spend, and grow your crypto assets all in one simple app.",
	blend:
		"Decentralized lending pools created by users, DAOs, and institutions.",
	soroswap: "Soroswap is the first DEX aggregator on Stellar.",
	aquarius:
		"Aquarius is Stellar's DeFi Hub. Swap instantly, provide liquidity, earn rewards, and take part in governance.",
	"phoenix-protocol":
		"Empowered by Soroban's technology, Phoenix is pioneering the ultimate DeFi Hub within Stellar's vibrant ecosystem.",
	reflector: "Decentralized price oracle for Stellar Network",
	stellarexpert: "Stellar XLM block explorer and analytics platform",
	"aps-money": "We handle the payments. You handle the business.",
	finclusive: "To Be Inclusive, You Must Know Your Customers!",
	"anchor-clickspesa":
		"Payments, financial and risk management solutions for businesses in Tanzania",
	"anchor-coins-ph": "Pay. Send. Trade — The Super App for Filipinos",
	"anchor-honey-coin": "The future of international finance.",
	"anchor-fonbnk": "The stablecoin settlement layer for global commerce.",
	"anchor-yellow-card": "The Infrastructure for Modern Money Movement",
	"anchor-bitso": "Discover what your money is capable of",
};

// VERIFIED compliance + corridor facts — the decision-critical signals for a
// closed-source anchor. Gathered 2026-07-06 from each partner's OWN site /
// official regulator registries (cite-or-null; NOTHING inferred). A license is
// listed ONLY where the company states it or a regulator publishes it. Curator-
// maintained → the whole `compliance` group is overwritten on each run.
type Compliance = {
	licenses?: Array<{ authority: string; jurisdiction?: string; type?: string }>;
	kycRequired?: boolean;
	travelRule?: boolean;
	currencies?: string;
	settlementTime?: string;
	notableCustomers?: string;
};
const COMPLIANCE_ENRICH: Record<string, Compliance> = {
	"anchor-yellow-card": {
		licenses: [
			{
				authority: "FinCEN",
				jurisdiction: "United States",
				type: "MSB registration",
			},
			{
				authority: "KNF",
				jurisdiction: "Poland (EU)",
				type: "Virtual currencies register (RDWW-1069)",
			},
			{ authority: "NBFIRA", jurisdiction: "Botswana", type: "VASP license" },
			{
				authority: "FSCA",
				jurisdiction: "South Africa",
				type: "Category I FSP (crypto assets)",
			},
		],
		kycRequired: true,
		travelRule: true,
		notableCustomers: "Visa",
	},
	"anchor-mykobo": {
		licenses: [
			{
				authority: "GIFI",
				jurisdiction: "Poland",
				type: "Registered VASP (RDWW-1590)",
			},
		],
		kycRequired: true,
		currencies: "EUR",
		settlementTime: "<1hr",
		notableCustomers: "LOBSTR, StellarX, Beans, Honeycoin",
	},
	"anchor-bitso": {
		licenses: [
			{
				authority: "GFSC",
				jurisdiction: "Gibraltar",
				type: "DLT Provider authorization",
			},
			{
				authority: "CNBV",
				jurisdiction: "Mexico",
				type: "IFPE (Fintech Law) via Nvio Pagos",
			},
		],
		kycRequired: true,
		travelRule: true,
		currencies: "MXN, BRL, ARS, COP, USD",
	},
	"anchor-anclap": {
		licenses: [
			{
				authority: "CNV",
				jurisdiction: "Argentina",
				type: "Registered PSAV/VASP (N°95)",
			},
		],
		kycRequired: true,
		settlementTime: "instant",
	},
	"anchor-coins-ph": {
		licenses: [
			{
				authority: "Bangko Sentral ng Pilipinas (BSP)",
				jurisdiction: "Philippines",
				type: "EMI + EPFS licenses",
			},
		],
		kycRequired: true,
		currencies: "PHP",
		settlementTime: "instant",
	},
	"anchor-moneygram": {
		licenses: [
			{
				authority: "FinCEN",
				jurisdiction: "United States",
				type: "MSB registration",
			},
			{
				authority: "NY DFS",
				jurisdiction: "United States (New York)",
				type: "Money Transmitter license",
			},
		],
		kycRequired: true,
	},
	etherfuse: {
		kycRequired: true,
		currencies: "USD, MXN",
		settlementTime: "instant",
		notableCustomers: "Shinhan Securities, BBVA, Felix Pago, Pago46, Brale",
	},
	finclusive: { kycRequired: true, currencies: "USD" },
	clpx: { currencies: "CLP", settlementTime: "<5s" },
};

/**
 * Founding year of the operating entity. VERIFIED, cite-or-null — only where a
 * reliable source confirms it (company site / Crunchbase / LinkedIn / registry;
 * NOT a domain-registration guess). Fill-if-empty: never overwrites a year a
 * partner set themselves. Powers the "Since {year}" trust chip on profiles.
 */
const FOUNDED_YEARS: Record<string, number> = {
	// filled from research (cite-or-null)
};

/** raven#8 / sls-018 (data half): ramp capability for providers whose ramp is a
 * PROPRIETARY API rather than SEP-6/24 — the stellar.toml enrichment can never
 * pick those up, so they need a curated, grounded entry. Fill-if-empty on
 * rampTypes; addAssets/addServices append rows not already present (never
 * remove or overwrite). Grounding required per entry (the provider's own docs). */
const RAMP_ENRICH: Record<
	string,
	{
		rampTypes: ("on-ramp" | "off-ramp")[];
		addAssets?: string[];
		addServices?: string[];
	}
> = {
	// Etherfuse FX: Mexico USDC↔MXN on/off-ramp API (etherfuse/ramp-api-example;
	// their public docs + raven#8: bps-level pricing, both directions).
	etherfuse: { rampTypes: ["on-ramp", "off-ramp"], addAssets: ["USDC"] },
	// sls-021: HoneyCoin's ramp is a proprietary API (honeycoin.app publishes
	// NO stellar.toml — verified 404 on /.well-known/stellar.toml 2026-07-11),
	// so toml enrichment never fills its capability fields and off-ramp /
	// mobile-money matching omitted it despite the description carrying the
	// facts. Grounded in its own pages 2026-07-11: honeycoin.app home
	// ("seamless on and off-ramps for USDC, USDT, and local currencies";
	// KES/USD/GHS/NGN virtual accounts; OTC desk), honeycoin.app/coverage +
	// docs.honeycoin.app (mobile-money charge API — M-Pesa Kenya/Ethiopia,
	// Airtel Money KE/TZ/UG/RW, MTN MoMo UG/RW, Halopesa/Vodacom/Tigo TZ,
	// Telebirr ET — plus bank rails across 18+ African markets). `seps` stays
	// honestly empty: no SEP-6/24/31 server is published.
	"anchor-honey-coin": {
		rampTypes: ["on-ramp", "off-ramp"],
		addAssets: ["USDC", "USDT"],
		addServices: [
			"mobile-money-on-off-ramp",
			"m-pesa-airtel-mtn-momo-rails",
			"usdc-usdt-off-ramp-africa",
			"virtual-accounts-kes-usd-ghs-ngn",
		],
	},
	// sls-049: Bitso's profile served all-empty capability arrays while its
	// description asserts live USDC↔fiat corridors. Bitso serves NO stellar.toml
	// (bitso.com/.well-known/stellar.toml → marketing redirect, checked
	// 2026-07-11) — its ramp is the exchange platform/API, so the toml enricher
	// can never fill it. Grounded in Bitso's OWN sources: bitso.com/blog/
	// usdc-stellar (2026-06-11, "You can send, receive, transfer, deposit and
	// withdraw your USDC with the Stellar network") + docs.bitso.com
	// "Withdrawing USDC on Stellar". Fiat legs (MXN/BRL/ARS/COP) are already on
	// the compliance group above; SEPs stay empty (Bitso publishes no SEP
	// endpoints — profileState/anchorProfileBasis explain empty-vs-unknown).
	"anchor-bitso": { rampTypes: ["on-ramp", "off-ramp"], addAssets: ["USDC"] },
};
// ──────────────────────────────────────────────────────────────────────────────

async function main() {
	if (
		OWNER_CONFIRMED_DEAD.length === 0 &&
		PILOT_SLUGS.length === 0 &&
		Object.keys(PARTNER_ENRICH).length === 0 &&
		Object.keys(URL_CORRECTIONS).length === 0 &&
		Object.keys(FOUNDED_YEARS).length === 0 &&
		Object.keys(RAMP_ENRICH).length === 0
	) {
		console.error(
			"All lists are empty — nothing to do. Fill OWNER_CONFIRMED_DEAD / PILOT_SLUGS / PARTNER_ENRICH / URL_CORRECTIONS / FOUNDED_YEARS first (owner-confirmed only).",
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

	// ── raven#8 / sls-018: ramp capability for proprietary-API ramps ──
	console.log(
		"\n── Ramp enrichment (fill-if-empty rampTypes; append assets) ──",
	);
	for (const [slug, e] of Object.entries(RAMP_ENRICH)) {
		const d = bySlug.get(slug);
		if (!d) {
			console.log(`  WARN: no partner with slug "${slug}" — skipped`);
			continue;
		}
		const data: Record<string, unknown> = {};
		const notes: string[] = [];
		if (!Array.isArray(d.rampTypes) || d.rampTypes.length === 0) {
			data.rampTypes = e.rampTypes;
			notes.push(`rampTypes → ${e.rampTypes.join("/")}`);
		}
		if (e.addAssets?.length) {
			// assets is an array of { code } rows; append codes not already present.
			// biome-ignore lint/suspicious/noExplicitAny: Payload array-field rows
			const rows: any[] = Array.isArray(d.assets) ? d.assets : [];
			const have = new Set(
				rows.map((r) => String(r?.code ?? "").toUpperCase()).filter(Boolean),
			);
			const add = e.addAssets.filter((c) => !have.has(c.toUpperCase()));
			if (add.length) {
				data.assets = [...rows, ...add.map((code) => ({ code }))];
				notes.push(`assets += ${add.join("/")}`);
			}
		}
		if (e.addServices?.length) {
			// services is an array of { tag } rows (the matcher's weighted
			// capability tags); append tags not already present — never removes
			// or overwrites a partner-entered tag.
			// biome-ignore lint/suspicious/noExplicitAny: Payload array-field rows
			const rows: any[] = Array.isArray(d.services) ? d.services : [];
			const have = new Set(
				rows.map((r) => String(r?.tag ?? "").toLowerCase()).filter(Boolean),
			);
			const add = e.addServices.filter((t) => !have.has(t.toLowerCase()));
			if (add.length) {
				data.services = [...rows, ...add.map((tag) => ({ tag }))];
				notes.push(`services += ${add.join("/")}`);
			}
		}
		if (Object.keys(data).length === 0) {
			console.log(`  ${d.name} (${slug}) — already complete, no-op`);
			continue;
		}
		console.log(`  ${d.name} (${slug}) — ${notes.join(" · ")}`);
		writes.push({ id: d.id, slug, data, note: notes.join(", ") });
	}

	console.log("\n── URL corrections (OVERWRITE unsafe/wrong URLs) ──");
	// ── tagline backfill (fill-if-empty; partner-owned field stays sticky) ──
	console.log("\n── Tagline backfill (fill-if-empty) ──");
	for (const [slug, tagline] of Object.entries(TAGLINE_BACKFILL)) {
		const r = await payload.find({
			collection: "partner-accounts",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no partner "${slug}" — skipped`);
			continue;
		}
		if (d.tagline) {
			console.log(`  ${slug}: tagline already set, skip`);
			continue;
		}
		console.log(`  ${slug}: tagline ← "${tagline.slice(0, 60)}…"`);
		writes.push({
			id: d.id,
			slug,
			data: { tagline },
			note: "tagline backfill",
		});
	}

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

	// Logo backfill — many partners are ALSO in the projects directory, which
	// already has the correct curated logo. Their partner logoUrl (from
	// stellar.toml) is often missing or wrong. Copy the matching project's logo
	// (join on slug, stripping the "anchor-" prefix) so cards/profiles/concierge
	// all show the SAME logo as the projects page. OVERWRITES — the project logo
	// is the source of truth here.
	console.log(
		"\n── Logo backfill (fill-if-empty from matching project logos) ──",
	);
	const APP = "https://stellarlight.xyz";
	const wantedProjectSlugs = [
		...new Set(docs.map((d) => String(d.slug).replace(/^anchor-/, ""))),
	];
	const projects = await payload.find({
		collection: "projects",
		where: { slug: { in: wantedProjectSlugs } },
		limit: 500,
		depth: 1,
		overrideAccess: true,
		select: { slug: true, logo: true },
	});
	const projLogo = new Map<string, string>();
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	for (const pr of projects.docs as any[]) {
		const logo = pr.logo;
		let url = "";
		if (logo && typeof logo === "object") {
			if (logo.url) url = String(logo.url);
			else if (logo.filename) url = `/api/media/file/${logo.filename}`;
		}
		if (url) {
			const abs = url.startsWith("http") ? url : `${APP}${url}`;
			projLogo.set(String(pr.slug).toLowerCase(), abs);
		}
	}
	let logoNoop = 0;
	for (const d of docs) {
		const key = String(d.slug)
			.replace(/^anchor-/, "")
			.toLowerCase();
		const logo = projLogo.get(key);
		if (!logo) continue;
		if (d.logoUrl === logo) {
			logoNoop++;
			continue;
		}
		// Review 2026-07-08 finding 26: this OVERWROTE partner-set logos on every
		// run. Fill-if-empty now — the project logo seeds a missing partner logo,
		// but a logo the partner chose is theirs.
		if (d.logoUrl) {
			logoNoop++;
			continue;
		}
		console.log(
			`  ${d.name} (${d.slug}) — logoUrl: ${d.logoUrl ?? "(none)"} → ${logo}`,
		);
		writes.push({
			id: d.id,
			slug: d.slug,
			data: { logoUrl: logo },
			note: "logo ← project",
		});
	}
	if (projLogo.size === 0) console.log("  (no matching project logos found)");
	else console.log(`  (${logoNoop} already correct, no-op)`);

	console.log("\n── Compliance & corridors (VERIFIED; fill-if-empty) ──");
	for (const [slug, comp] of Object.entries(COMPLIANCE_ENRICH)) {
		const d = bySlug.get(slug);
		if (!d) {
			console.log(`  WARN: no partner with slug "${slug}" — skipped`);
			continue;
		}
		const summary = [
			comp.licenses?.length ? `${comp.licenses.length} license(s)` : "",
			comp.kycRequired ? "KYC" : "",
			comp.travelRule ? "Travel Rule" : "",
			comp.currencies ? `ccy:${comp.currencies}` : "",
			comp.settlementTime ? `settle:${comp.settlementTime}` : "",
			comp.notableCustomers ? "customers" : "",
		]
			.filter(Boolean)
			.join(" · ");
		// Review 2026-07-08 finding 25: this used to OVERWRITE the whole group on
		// every run, reverting any compliance edit made after the hardcoded
		// snapshot date. Fill-if-empty now: seed once, then the record (admin or
		// partner edits) is the source of truth. Re-asserting updated facts =
		// update the map AND clear the group in admin (deliberate two-step).
		const hasCompliance =
			(d.compliance?.licenses?.length ?? 0) > 0 ||
			d.compliance?.kycRequired != null ||
			!!d.compliance?.currencies;
		if (hasCompliance) {
			console.log(`  ${d.name} (${slug}) — compliance already set, skip`);
			continue;
		}
		console.log(`  ${d.name} (${slug}) — compliance → ${summary}`);
		writes.push({
			id: d.id,
			slug,
			data: { compliance: comp },
			note: "compliance",
		});
	}

	console.log("\n── Founded year (VERIFIED; fill-if-empty) ──");
	for (const [slug, year] of Object.entries(FOUNDED_YEARS)) {
		const d = bySlug.get(slug);
		if (!d) {
			console.log(`  WARN: no partner with slug "${slug}" — skipped`);
			continue;
		}
		if (d.foundedYear) {
			console.log(
				`  ${d.name} (${slug}) — foundedYear already ${d.foundedYear}, skip`,
			);
			continue;
		}
		console.log(`  ${d.name} (${slug}) — foundedYear → ${year}`);
		writes.push({
			id: d.id,
			slug,
			data: { foundedYear: year },
			note: `founded ${year}`,
		});
	}

	if (!EXECUTE) {
		console.log(`\nDRY RUN — ${writes.length} write(s) planned, none applied.`);
		process.exit(0);
	}
	// Per-write isolation (2026-07-09 curate-projects incident: one
	// ValidationError aborted a 13-write batch). A bad row fails loudly;
	// the rest still land.
	let failed = 0;
	for (const w of writes) {
		try {
			await payload.update({
				collection: "partner-accounts",
				id: w.id,
				data: w.data,
				overrideAccess: true,
			});
			console.log(`  wrote: ${w.slug} [${w.note}]`);
		} catch (err) {
			failed++;
			console.error(`  FAILED: ${w.slug} — ${String(err)}`);
		}
	}
	if (failed) {
		console.error(`\n${failed} write(s) FAILED — fix and re-run.`);
		process.exitCode = 1;
	}
	console.log(`\nDONE: ${writes.length} write(s) applied.`);
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
