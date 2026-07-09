/** READ-ONLY by default. Targeted, owner-reviewed edits to project records —
 * the projects counterpart to curate-partners.ts. Only touches the exact slugs
 * listed below; never bulk-edits.
 *
 *   pnpm exec tsx scripts/data/curate-projects.ts            # dry run
 *   pnpm exec tsx scripts/data/curate-projects.ts --execute  # writes
 *
 * DESCRIPTION_FIXES — overwrite shortDescription for a specific slug. Used to
 * close directory-omission findings where a record's prose is stale/incomplete
 * (e.g. sls-017: LOBSTR's record omitted its XRP Ledger support, so a consumer
 * synthesizing from directory data alone concluded "Stellar-only" by omission).
 * Every value is grounded in the provider's own current site copy — no
 * fabrication.
 */
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

const DESCRIPTION_FIXES: Record<string, string> = {
	// boxy 2026-07-09: CCTP entry read like a bridge product; it's the RAIL.
	// An agent answering "how do I bridge USDC to Stellar" should name CCTP
	// as the mechanism and a bridge built on it as the actionable route.
	"circle-cctp-cross-chain-transfer-protocol":
		"Circle's Cross-Chain Transfer Protocol (CCTP), live on Stellar since May 2026. Moves native USDC between Stellar and 23+ chains (Ethereum, Solana, Base, Arbitrum, Optimism) via a 1:1 burn-and-mint model rather than wrapped or locked assets, settling in seconds. CCTP is bridging INFRASTRUCTURE, not a user-facing bridge: there is no Circle-hosted bridge app — builders integrate it (and pass execution metadata via Hooks), and end-users move USDC through bridges built on it, e.g. Rozo's Intent Bridge on Stellar.",
	// sls-017: lobstr.co self-describes as a "Stellar & XRPL Wallet" (by Ultra
	// Stellar); the record previously said "Stellar wallet" only.
	lobstr:
		"LOBSTR is a widely used non-custodial wallet for the Stellar and XRP Ledger (XRPL) networks, by Ultra Stellar, on iOS, Android, web and a browser extension. Users hold, send, receive, buy and swap XLM, USDC, XRP and network assets, make peer-to-peer payments, trade on the DEX/SDEX, use fiat on/off-ramps, and claim a federation address (username*lobstr.co). LOBSTR Vault adds multisig.",
	// raven#8 / sls-018 (data half): the record described only the flagship
	// Stablebonds product; Etherfuse FX — their Mexico USDC↔MXN on/off-ramp
	// API (etherfuse/ramp-api-example; wholesale bps-level pricing per their
	// public docs) — was invisible prose-wise. Multi-product companies get
	// BOTH products named so neither is hidden behind the dominant one.
	etherfuse:
		"Etherfuse is a multi-product company on Stellar: it issues Stablebonds — tokenized government treasury bonds (Mexican CETES, US Treasuries and others) that give yield-bearing onchain exposure to sovereign debt and underpin treasury-management apps such as Bando — and operates Etherfuse FX, a Mexico fiat on/off-ramp API for programmatic USDC↔MXN conversion at wholesale bps-level pricing, built for wallets and apps to integrate.",
};

// raven#8 / sls-018 (data half): multi-product projects are indexable under
// EVERY capability they demonstrably have, not a single dominant category.
// ADDITIVE — merges into `types`, never removes. Grounded in the provider's
// own products (Etherfuse FX = a live Mexico on/off-ramp API).
const TYPES_ADD: Record<string, string[]> = {
	etherfuse: ["Anchor"],
	// boxy 2026-07-09: Rozo's Intent Bridge is a LAUNCHED product ("USDC and
	// USDT across Base, Stellar, Solana, Ethereum, BNB" — rozo.ai homepage,
	// linked not coming-soon; Hacken audit of ROZO Intents in our corpus).
	// Typed Payments-only, so every bridge/EVM query missed it — the same
	// multi-product secondary-capability class as etherfuse (sls-018).
	rozo: ["Bridge"],
	// boxy 2026-07-09: CCTP is bridging INFRA (burn-and-mint rail bridge
	// builders integrate), not a user-facing bridge app. Keep Bridge so
	// corridor queries still learn it exists; add the taxonomy truth.
	"circle-cctp-cross-chain-transfer-protocol": ["Infrastructure"],
};

/** Launch-status corrections (boxy 2026-07-09: "some are in process of
 * launching while allbridge has launched"). Each row is grounded in the
 * project's OWN current materials — never a staleness heuristic:
 *  - helix: helixlabs.org homepage — "Helix is not live on any chain other
 *    than Canton"; Stellar listed under "Next rails — roadmap targets, not
 *    live" (docs plan Soroban TESTNET in phase 1).
 *  - warpdrive: warp-drive.xyz has no app/mainnet claim; GitHub milestone
 *    language ("Preparation for bringing WarpDrive to Stellar — Milestone 1").
 * Writes only when the stored status matches the WRONG value, so a later
 * manual correction is never clobbered; rows retire once applied. */
const STATUS_FIX: Record<string, { from: string; to: string }> = {
	helix: { from: "Live", to: "Development" },
	warpdrive: { from: "Live", to: "Development" },
};

/** Review finding 27 one-shot corrections — OVERWRITES coverage.countries for
 * rows the 2026-07-07 sync mis-wrote with the partner's incorporation country.
 * Grounding per row: [] = the corridor is regional/global (the partner record's
 * `regions` carries it; a wrong single country is worse than honest absence).
 * bitso's corridors are proven by its own CNBV/GFSC compliance currencies
 * (MXN/BRL/ARS/COP). Rows retire (no-op) once applied — equality-checked. */
const COVERAGE_COUNTRY_FIX: Record<string, string[]> = {
	"boss-pay": [], // HQ=US; corridors = Africa/LatAm remittance (regions field)
	"ripe-money": [], // HQ=Singapore; "off-ramp for Asia"
	"coca-wallet": [], // HQ=UAE; global wallet
	"blox-global": [], // HQ=US; "stablecoins globally"
	bitso: ["Mexico", "Brazil", "Argentina", "Colombia"],
};

// sls-017 (durable half): chains a project supports, lowercase. Fill-if-empty —
// so omission ≠ negation on wallet/multichain records.
const SUPPORTED_NETWORKS: Record<string, string[]> = {
	lobstr: ["stellar", "xrpl"],
	"ultra-stellar": ["stellar", "xrpl"],
	// Bridge corridor matrix (boxy 2026-07-09: "same issue for Solana?" — yes).
	// Every row below verified from PRIMARY sources on 2026-07-09 (vendor
	// docs/APIs, quotes in the PR): the original Beacon-Q3 seeds were
	// [stellar, evm] only, hiding real Solana/Tron/XRPL/... corridors.
	// "evm" is the umbrella users' chain-names map onto via the search
	// synonym layer (ethereum/polygon/base/bnb/arbitrum → evm).
	// This list is EXACT-SYNC for its slugs (see apply loop): the canonical
	// place to update a listed project's networks is HERE, not the admin.
	allbridge: ["stellar", "evm", "solana", "tron", "sui"], // docs-core.allbridge.io + live SRB USDC pool on core API
	"circle-cctp-cross-chain-transfer-protocol": [
		"stellar", // CCTP V2 domain 27 (standard transfer)
		"evm",
		"solana",
		"sui",
		"aptos",
		"noble",
		"starknet",
	], // developers.circle.com/cctp/concepts/supported-chains-and-domains
	axelar: ["stellar", "evm", "solana", "sui", "xrpl"], // axelar-chains-config mainnet.json: stellar mainnet contracts deployed
	rozo: ["stellar", "evm", "solana"], // rozo.ai/llms.txt: pay-in/out Ethereum/Arbitrum/Base/BSC/Polygon/Solana/Stellar; "Stellar CCTP V2 is live on ROZO"
	spacewalk: ["stellar", "polkadot", "kusama"], // pendulumchain.org: Pendulum (Polkadot) + Amplitude (Kusama), launched
	stronghold: ["stellar", "evm", "xrpl"], // gateway.stronghold.co/bridge (SHx-only: Stellar⇄Ethereum + XRPL leg live)
	"templar-protocol": ["stellar", "bitcoin", "evm", "near"], // templarfi.org/blog/stellar launch post; bridgeless (NEAR chain sigs)
	warpdrive: ["stellar", "evm"], // warp-drive.xyz targets Base/Ethereum/Optimism/BNB — NOT yet launched (see STATUS_FIX)
	helix: ["canton"], // helixlabs.org: "not live on any chain other than Canton"; Stellar = roadmap (see STATUS_FIX)
	zkcross: ["stellar", "evm"],
};

const ASOF = new Date().toISOString().slice(0, 10);
const csv = (s?: string | null): string[] =>
	s
		? String(s)
				.split(",")
				.map((x) => x.trim())
				.filter(Boolean)
		: [];

async function main() {
	if (
		Object.keys(DESCRIPTION_FIXES).length === 0 &&
		Object.keys(SUPPORTED_NETWORKS).length === 0
	) {
		console.error("Nothing to do — no fixes configured.");
		process.exit(1);
	}
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}\n`,
	);

	const writes: Array<{
		id: string;
		slug: string;
		data: Record<string, unknown>;
	}> = [];

	console.log("── Description fixes (overwrite shortDescription) ──");
	for (const [slug, desc] of Object.entries(DESCRIPTION_FIXES)) {
		const res = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = res.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project with slug "${slug}" — skipped`);
			continue;
		}
		if (d.shortDescription === desc) {
			console.log(`  ${slug}: already up to date, skip`);
			continue;
		}
		console.log(`  ${slug}:`);
		console.log(`    old: ${d.shortDescription ?? "(none)"}`);
		console.log(`    new: ${desc}`);
		writes.push({ id: d.id, slug, data: { shortDescription: desc } });
	}

	// ── sls-012: structured anchor coverage, synced from the partner record ──
	// The partner directory already carries structured seps / currencies /
	// country; project rows (searchProjects category=Anchor) only had prose.
	// Copy them onto the matching project (fill-if-empty), dated with asOf.
	console.log("\n── Coverage from partner records (fill-if-empty) ──");
	const partnersRes = await payload.find({
		collection: "partner-accounts",
		where: { status: { equals: "published" } },
		limit: 300,
		depth: 0,
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	for (const pt of partnersRes.docs as any[]) {
		const seps: string[] = pt.seps ?? [];
		const currencies = csv(pt.compliance?.currencies);
		// Review 2026-07-08 finding 27: pt.country is the partner's primary
		// JURISDICTION (incorporation/HQ), NOT its fiat corridor — copying it
		// wrote "United States" as boss-pay's corridor (its corridors are
		// Africa/LatAm) and "Singapore" for ripe-money (Asia off-ramp). Corridor
		// countries now come ONLY from the explicit grounded map below; the sync
		// carries currencies (compliance-grounded) + SEPs (toml-grounded), which
		// ARE corridor facts.
		const countries: string[] = [];
		if (!seps.length && !currencies.length && !countries.length) continue;
		// Partner slug is often `anchor-<name>`; the project slug is `<name>`.
		const candidates = [pt.slug, String(pt.slug).replace(/^anchor-/, "")];
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		let proj: any = null;
		for (const slug of candidates) {
			const r = await payload.find({
				collection: "projects",
				where: { slug: { equals: slug } },
				limit: 1,
				depth: 0,
				overrideAccess: true,
			});
			if (r.docs[0]) {
				proj = r.docs[0];
				break;
			}
		}
		if (!proj) continue;
		const ex = proj.coverage ?? {};
		if (ex.countries?.length || ex.currencies?.length || ex.seps?.length) {
			console.log(`  ${proj.slug}: coverage already set, skip`);
			continue;
		}
		console.log(
			`  ${proj.slug} ← ${pt.slug}: seps=${seps.join("/") || "-"} ccy=${currencies.join("/") || "-"} countries=${countries.join("/") || "-"}`,
		);
		writes.push({
			id: proj.id,
			slug: proj.slug,
			data: { coverage: { countries, currencies, seps, asOf: ASOF } },
		});
	}

	// ── raven#8 / sls-018: additive types for multi-product projects ──
	console.log("\n── Types add (merge, never remove) ──");
	for (const [slug, addTypes] of Object.entries(TYPES_ADD)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const existing: string[] = Array.isArray(d.types) ? d.types : [];
		const missing = addTypes.filter((t) => !existing.includes(t));
		if (!missing.length) {
			console.log(
				`  ${slug}: types already include ${addTypes.join("/")}, skip`,
			);
			continue;
		}
		const next = [...existing, ...missing];
		console.log(
			`  ${slug}: types [${existing.join(", ")}] → [${next.join(", ")}]`,
		);
		writes.push({ id: d.id, slug, data: { types: next } });
	}

	// ── raven#8 sweep (REPORT-ONLY): other dual-identity ramp providers ──
	// Partners with anchor type / ramp capability whose matching PROJECT record
	// lacks the Anchor type — the same pattern that hid Etherfuse. Prints
	// candidates for owner review; add confirmed ones to TYPES_ADD. Never writes.
	console.log("\n── Dual-identity sweep (report-only, no writes) ──");
	{
		const anchorsRes = await payload.find({
			collection: "partner-accounts",
			where: { status: { equals: "published" } },
			limit: 300,
			depth: 0,
			overrideAccess: true,
		});
		let candidates = 0;
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		for (const pt of anchorsRes.docs as any[]) {
			const isRampCapable =
				pt.partnerType === "anchor" ||
				(Array.isArray(pt.rampTypes) && pt.rampTypes.length > 0);
			if (!isRampCapable) continue;
			const slugCands = [pt.slug, String(pt.slug).replace(/^anchor-/, "")];
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			let proj: any = null;
			for (const slug of slugCands) {
				const r = await payload.find({
					collection: "projects",
					where: { slug: { equals: slug } },
					limit: 1,
					depth: 0,
					overrideAccess: true,
				});
				if (r.docs[0]) {
					proj = r.docs[0];
					break;
				}
			}
			if (!proj) continue;
			const types: string[] = Array.isArray(proj.types) ? proj.types : [];
			if (types.includes("Anchor") || proj.category === "Anchor") continue;
			candidates++;
			console.log(
				`  CANDIDATE ${proj.slug}: category=${proj.category} types=[${types.join(", ")}] ← partner ${pt.slug} (type=${pt.partnerType}, ramps=${(pt.rampTypes ?? []).join("/") || "-"})`,
			);
		}
		if (!candidates)
			console.log(
				"  (none — all ramp-capable partners' projects carry Anchor)",
			);
	}

	// ── finding 27: corridor-country corrections (OVERWRITE, equality-guarded) ──
	console.log("\n── Coverage country corrections (finding 27) ──");
	for (const [slug, fix] of Object.entries(COVERAGE_COUNTRY_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur: string[] = d.coverage?.countries ?? [];
		if (JSON.stringify(cur) === JSON.stringify(fix)) {
			console.log(`  ${slug}: already corrected, skip`);
			continue;
		}
		console.log(
			`  ${slug}: countries [${cur.join(", ")}] → [${fix.join(", ")}]`,
		);
		writes.push({
			id: d.id,
			slug,
			data: { coverage: { ...(d.coverage ?? {}), countries: fix, asOf: ASOF } },
		});
	}

	// ── sls-017 (durable): supportedNetworks (fill-if-empty) ──
	// ── launch-status corrections (from-guarded, retire once applied) ──
	console.log("\n── Status fixes (from-guarded) ──");
	for (const [slug, fix] of Object.entries(STATUS_FIX)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (d.status !== fix.from) {
			console.log(
				`  ${slug}: status '${d.status}' ≠ '${fix.from}', skip (retired or manually set)`,
			);
			continue;
		}
		console.log(`  ${slug}: status ${fix.from} → ${fix.to}`);
		writes.push({ id: d.id, slug, data: { status: fix.to } });
	}

	console.log("\n── Supported networks (fill-if-empty) ──");
	for (const [slug, nets] of Object.entries(SUPPORTED_NETWORKS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		const cur: string[] = Array.isArray(d.supportedNetworks)
			? d.supportedNetworks
			: [];
		// EXACT-SYNC for curated slugs: the matrix above is the source of
		// truth (primary-source-verified). Equality no-ops keep reruns clean.
		if (cur.join(",") === nets.join(",")) {
			console.log(`  ${slug}: already in sync, skip`);
			continue;
		}
		console.log(`  ${slug}: [${cur.join(", ")}] → [${nets.join(", ")}]`);
		writes.push({ id: d.id, slug, data: { supportedNetworks: nets } });
	}

	console.log(`\n${writes.length} write(s) planned.`);
	if (!EXECUTE) {
		console.log("DRY RUN — none applied.");
		process.exit(0);
	}
	for (const w of writes) {
		await payload.update({
			collection: "projects",
			id: w.id,
			data: w.data,
			overrideAccess: true,
		});
		console.log(`  wrote: ${w.slug}`);
	}
	console.log(`\nDONE: ${writes.length} write(s) applied.`);
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
