/** Status-provenance BACKFILL (sls-024, with sls-028/-029/-037 rows).
 *
 * The provenance fields shipped for sls-024 (statusAsOf / statusBasis /
 * statusSourceUrl on `projects`) exist in the contract but are populated on
 * ~1 record (dtcc) — hundreds of `Live` labels still carry no qualifier, so a
 * consumer can't tell an operator announcement from a checked product surface
 * from an unverified seed label. This script backfills the three fields from
 * evidence the repo ALREADY holds — it never invents provenance:
 *
 *   R1 status-fix-flips      STATUS_FIX rows (curation-maps.ts) whose flip has
 *                            been applied → basis from the row (else
 *                            human-verified: every flip was owner-reviewed),
 *                            asOf = the dated evidence note, sourceUrl only
 *                            when the row names one.
 *   R2 oracle-onchain        band + lightecho (sls-029): deployed MAINNET
 *                            contract evidence already cited in
 *                            curate-projects' SUPPORTED_NETWORKS comments →
 *                            onchain-activity + the evidence URL.
 *   R3 irl-uncertainty       IRL (sls-028 / issue #515): keep Live, add
 *                            site-liveness provenance + an explicit
 *                            inconclusive-operator-surface note INSTEAD of a
 *                            status downgrade.
 *   R4 rarible-partial       rarible (sls-037): re-assert the evm-only
 *                            supportedNetworks precision fix (exact-sync,
 *                            no-op when already applied) + site-liveness
 *                            provenance + a partial-deployment note.
 *   R5 liveness-survivors    WEBSITE_FIXES rows (liveness triage 2026-07-10):
 *                            the product surface was verified alive →
 *                            site-liveness @ 2026-07-10, sourceUrl = the
 *                            verified live URL.
 *   R6 curated-seeds         SEEDS rows: the status label was inherited from
 *                            the seed wave's research → source-inherited @ the
 *                            wave date (only while the record still carries
 *                            the seeded status + AdminEdit provenance).
 *   R7 human-confirmed       boxy/owner-confirmed rows outside STATUS_FIX
 *                            (keybase, the mark-defunct DAO targets, the
 *                            tricorn→Utexo live confirmation) → human-verified.
 *   R8 source-inherited-bulk any remaining ACTIVE record (Live/Development/
 *                            Pre-Release) whose provenance.source is
 *                            LumenloopSeed or UserSubmitted and whose
 *                            statusBasis is empty → source-inherited, asOf =
 *                            provenance.firstSeenAt. This is the honest floor
 *                            sls-024 asks for: the lumenloop mapper hardcodes
 *                            status "Live" for every synced entry, so the
 *                            label demonstrably came from the seed source and
 *                            must say so instead of reading as verified.
 *
 * Records matching NO rule stay untouched and are counted in the plan.
 * All field writes are FILL-IF-EMPTY (an existing statusBasis/statusAsOf/
 * statusSourceUrl/lifecycle.note is never overwritten), so re-runs no-op and a
 * later manual correction is never clobbered. supportedNetworks (rarible only)
 * is exact-sync with an equality no-op, same as curate-projects.
 *
 * WRITE PATH: raw Mongo $set on exactly the planned fields (the db-space.ts
 * rawDb pattern) instead of payload.update — the projects afterChange hook
 * writes a transparency-log entry containing the FULL before/after doc
 * (including the 1024-dim embedding) per update, which at backfill scale
 * (potentially >1k records) would dump tens of MB into the space-capped M0
 * cluster. The uploaded plan JSON (--out) is the audit record for this wave.
 *
 *   pnpm exec tsx scripts/data/backfill-status-provenance.ts                # dry run
 *   pnpm exec tsx scripts/data/backfill-status-provenance.ts --execute      # writes
 *   pnpm exec tsx scripts/data/backfill-status-provenance.ts --out=plan.json
 */
import { writeFileSync } from "node:fs";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";
import {
	SEEDS,
	STATUS_FIX,
	type StatusBasis,
	WEBSITE_FIXES,
} from "./curation-maps";

const EXECUTE = process.argv.includes("--execute");
const OUT = process.argv
	.find((a) => a.startsWith("--out="))
	?.slice("--out=".length);

/** First ISO date named in an evidence note ("Confirmed defunct 2026-07-10 …"). */
const dateFromNote = (note?: string): string | undefined =>
	note?.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1];

/** R1 rows that carry no dated note in STATUS_FIX — provenance grounded in the
 * map's own per-row evidence comments (see curation-maps.ts). */
const STATUS_FIX_PROVENANCE: Record<
	string,
	{ basis: StatusBasis; asOf: string; sourceUrl?: string }
> = {
	// helixlabs.org homepage: "Helix is not live on any chain other than
	// Canton"; Stellar listed as roadmap — the operator's own statement.
	helix: {
		basis: "operator-announcement",
		asOf: "2026-07-09",
		sourceUrl: "https://helixlabs.org/",
	},
	// warp-drive.xyz has no app/mainnet claim; GitHub milestone language
	// ("Preparation for bringing WarpDrive to Stellar — Milestone 1").
	warpdrive: {
		basis: "site-liveness",
		asOf: "2026-07-09",
		sourceUrl: "https://warp-drive.xyz/",
	},
	// boxy human-confirmed dead 2026-07-09 + DefiLlama TVL $93 on a lending
	// protocol + repo last push 2025-10 — site resolves but the product is a
	// zombie.
	slender: {
		basis: "human-verified",
		asOf: "2026-07-09",
		sourceUrl: "https://defillama.com/protocol/slender",
	},
};

/** R7: human/owner-confirmed verdicts recorded OUTSIDE curate-projects
 * (mark-inactive-projects.ts CURATED_INACTIVE, mark-defunct.ts TARGETS,
 * curate-projects REBRANDS). Guarded on the status the verdict produced. */
const HUMAN_CONFIRMED: Array<{
	slugs: string[];
	requireStatus: string[];
	asOf: string;
	sourceUrl?: string;
	note?: string;
}> = [
	{
		// scripts/mark-inactive-projects.ts CURATED_INACTIVE (hand-verified;
		// last asserted by the 2026-07-05 mark-inactive Action run).
		slugs: ["keybase"],
		requireStatus: ["Inactive"],
		asOf: "2026-07-05",
		note: "Keybase's Stellar wallet integration is defunct — Keybase was acquired by Zoom in 2020 and the integration is no longer maintained (hand-verified, curated inactive).",
	},
	// scripts/mark-defunct.ts TARGETS (owner domain knowledge, applied by the
	// 2026-06-20 mark-defunct Action run; those records were parked as Draft,
	// so only a later Inactive state gets stamped — Draft rows are unserved).
	{
		slugs: ["communidao", "communi-dao"],
		requireStatus: ["Inactive"],
		asOf: "2026-06-20",
	},
	{
		slugs: ["lumosdao", "lumos-dao"],
		requireStatus: ["Inactive"],
		asOf: "2026-06-20",
	},
	{
		slugs: ["instantdao", "instant-dao"],
		requireStatus: ["Inactive"],
		asOf: "2026-06-20",
	},
	{
		slugs: ["enerdao", "ener-dao"],
		requireStatus: ["Inactive"],
		asOf: "2026-06-20",
	},
	{
		slugs: ["thehubdao", "the-hub", "the-hub-dao", "thehub"],
		requireStatus: ["Inactive"],
		asOf: "2026-06-20",
	},
	{
		// curate-projects REBRANDS: tricorn live as Utexo, boxy-confirmed
		// 2026-07-09 (tricorn.network 301s → mint.utexo.com; Coinspect audit).
		slugs: ["tricorn"],
		requireStatus: ["Live"],
		asOf: "2026-07-09",
		sourceUrl: "https://mint.utexo.com",
	},
];

/** R6: seed-wave dates ("their provenance date"). Default = the SCF-awardee
 * seed wave (improvements/waves/scf-seed-wave-2026-07-10.md); overrides per
 * the seed rows' own evidence comments in curation-maps.ts. */
const SEED_WAVE_DATES: Record<string, string> = {
	"passkey-kit": "2026-07-11", // 2026-07-11 audit seed
	"spectra-finance": "2026-07-09", // boxy 2026-07-09 launching-vs-launched seed
	eurau: "2026-07-11", // sls-034 stablecoin-coverage wave
	ylds: "2026-07-11",
	pyusd: "2026-07-11",
	mgusd: "2026-07-11",
};
const DEFAULT_SEED_DATE = "2026-07-10";

/** The liveness-triage wave date (improvements/waves/liveness-report-2026-07-10.md):
 * every WEBSITE_FIXES row's product surface was verified alive on this date. */
const LIVENESS_WAVE_DATE = "2026-07-10";

type Plan = {
	rule: string;
	basis: StatusBasis;
	asOf?: string;
	sourceUrl?: string;
	note?: string;
	/** exact-sync networks (rarible only) */
	networks?: string[];
	/** only stamp when the record's current status is one of these */
	requireStatus: string[];
};

/** Explicit per-slug derivations (R1–R7). First entry per slug wins. */
function buildExplicitPlans(): Map<string, Plan> {
	const plans = new Map<string, Plan>();
	const add = (slug: string, plan: Plan) => {
		if (!plans.has(slug)) plans.set(slug, plan);
	};

	// R2 — sls-029: deployed-mainnet-contract evidence already cited in the
	// SUPPORTED_NETWORKS comments (curate-projects.ts).
	add("band", {
		rule: "R2-oracle-onchain",
		basis: "onchain-activity",
		asOf: "2026-07-11",
		// Official oracle-providers page listing Band's deployed mainnet
		// contract CCQXWMZVM3KRTXTUPTN53YHL272QGKF32L7XEDNZ2S6OSUFK3NFBGG5M.
		sourceUrl:
			"https://developers.stellar.org/docs/data/oracles/oracle-providers",
		requireStatus: ["Live"],
	});
	add("lightecho", {
		rule: "R2-oracle-onchain",
		basis: "onchain-activity",
		asOf: "2026-07-11",
		// README documents the deployed mainnet contract
		// CDOR3QD27WAAF4TK4MO33TGQXR6RPNANNVLOY277W2XVV6ZVJ6X6X42T.
		sourceUrl: "https://github.com/bp-ventures/lightecho-stellar-oracle",
		note: "Mainnet oracle contract is deployed (on-chain evidence); the observed price state was ~4 months stale as of 2026-07-10 (sls-029 probe). Deployment evidence, not feed freshness.",
		requireStatus: ["Live"],
	});

	// R3 — sls-028 / issue #515: explicit uncertainty state instead of a
	// status downgrade. The operator site is up but does not by itself
	// substantiate the recorded Stellar product.
	add("irl", {
		rule: "R3-irl-uncertainty",
		basis: "site-liveness",
		asOf: "2026-07-13",
		sourceUrl: "https://irl.energy/",
		note: "The linked operator site (irl.energy) currently presents IRL as a culture/events community and does not by itself substantiate the recorded Stellar loyalty/collectibles product (issue #515 recheck 2026-07-13). This does not establish the Stellar integration is gone — the operator surface alone is inconclusive; treat the product description as unverified against the current site.",
		requireStatus: ["Live"],
	});

	// R4 — sls-037: rarible partial deployment. Re-asserts the evm-only
	// precision fix (exact-sync; no-op when already applied) and records the
	// entity-Live basis + the relationship-vs-deployment distinction.
	add("rarible", {
		rule: "R4-rarible-partial",
		basis: "site-liveness",
		asOf: "2026-07-11",
		sourceUrl: "https://rarible.com/",
		note: "Rarible's Stellar connection is an integration relationship (SCF award + Rarible protocol STELLAR schema evidence, sls-037); public Stellar marketplace support was not verifiable on Rarible's live API/UI as of 2026-07-11, so supportedNetworks lists verified deployments only (evm).",
		networks: ["evm"],
		requireStatus: ["Live"],
	});

	// R1 — STATUS_FIX flips (only once the flip has been applied: current
	// status === fix.to). basis defaults to human-verified: every row was
	// owner-reviewed (boxy-approved liveness triage / boxy-confirmed deaths /
	// dual-lane verified repurposed domains).
	for (const [slug, fix] of Object.entries(STATUS_FIX)) {
		const override = STATUS_FIX_PROVENANCE[slug];
		add(slug, {
			rule: "R1-status-fix",
			basis: fix.basis ?? override?.basis ?? "human-verified",
			asOf: fix.asOf ?? override?.asOf ?? dateFromNote(fix.note),
			sourceUrl: fix.sourceUrl ?? override?.sourceUrl,
			requireStatus: [fix.to],
		});
	}

	// R7 — human/owner-confirmed verdicts outside STATUS_FIX.
	for (const row of HUMAN_CONFIRMED) {
		for (const slug of row.slugs) {
			add(slug, {
				rule: "R7-human-confirmed",
				basis: "human-verified",
				asOf: row.asOf,
				sourceUrl: row.sourceUrl,
				note: row.note,
				requireStatus: row.requireStatus,
			});
		}
	}

	// R5 — liveness-triage survivors: the death-list false positives whose
	// product surface was verified alive on 2026-07-10 (WEBSITE_FIXES).
	for (const [slug, website] of Object.entries(WEBSITE_FIXES)) {
		add(slug, {
			rule: "R5-liveness-survivor",
			basis: "site-liveness",
			asOf: LIVENESS_WAVE_DATE,
			sourceUrl: website,
			requireStatus: ["Live"],
		});
	}

	// R6 — curated seeds: label inherited from the seed wave's research.
	// Guarded on the seeded status + AdminEdit provenance (the create path),
	// so a record that pre-existed the seed or was re-statused since is left
	// to other rules / untouched.
	for (const seed of SEEDS) {
		add(seed.slug, {
			rule: "R6-curated-seed",
			basis: "source-inherited",
			asOf: SEED_WAVE_DATES[seed.slug] ?? DEFAULT_SEED_DATE,
			requireStatus: [seed.status],
		});
	}

	return plans;
}

const PROJECT_SELECT = {
	slug: true,
	status: true,
	statusBasis: true,
	statusAsOf: true,
	statusSourceUrl: true,
	provenance: true,
	lifecycle: true,
	supportedNetworks: true,
	canonicalSlug: true,
} as const;

// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
type Doc = any;

/** Fill-if-empty diff: returns only the fields this plan may set on this doc. */
function diffFor(doc: Doc, plan: Plan): Record<string, unknown> {
	const set: Record<string, unknown> = {};
	if (!doc.statusBasis) set.statusBasis = plan.basis;
	if (!doc.statusAsOf && plan.asOf)
		set.statusAsOf = new Date(`${plan.asOf}T00:00:00.000Z`);
	if (!doc.statusSourceUrl && plan.sourceUrl)
		set.statusSourceUrl = plan.sourceUrl;
	if (plan.note && !doc.lifecycle?.note) set["lifecycle.note"] = plan.note;
	if (plan.networks) {
		const cur: string[] = Array.isArray(doc.supportedNetworks)
			? doc.supportedNetworks
			: [];
		if (cur.join(",") !== plan.networks.join(","))
			set.supportedNetworks = plan.networks;
	}
	return set;
}

// biome-ignore lint/suspicious/noExplicitAny: reaching the raw mongo handle (db-space.ts pattern)
function rawDb(payload: any): any {
	return (
		payload?.db?.connection?.db ?? payload?.db?.connections?.[0]?.db ?? null
	);
}

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const db = rawDb(payload);
	if (!db) {
		console.error("Could not reach the raw Mongo handle.");
		process.exit(1);
	}
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}\n`,
	);

	const ruleHits: Record<string, number> = {};
	const skips: Record<string, number> = {};
	const bump = (m: Record<string, number>, k: string) => {
		m[k] = (m[k] ?? 0) + 1;
	};
	const writes: Array<{
		slug: string;
		rule: string;
		set: Record<string, unknown>;
	}> = [];
	const considered = new Set<string>();

	const findBySlug = async (slug: string): Promise<Doc | null> => {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			select: PROJECT_SELECT,
			overrideAccess: true,
		});
		return r.docs[0] ?? null;
	};

	// ── explicit rules (R1–R7) ──
	console.log("── Explicit rules (R1–R7) ──");
	const plans = buildExplicitPlans();
	for (const [slug, plan] of plans) {
		considered.add(slug);
		const doc = await findBySlug(slug);
		if (!doc) {
			console.log(`  WARN: no project "${slug}" (${plan.rule}) — skipped`);
			bump(skips, "not-found");
			continue;
		}
		if (!plan.requireStatus.includes(doc.status)) {
			console.log(
				`  ${slug}: status '${doc.status}' ∉ [${plan.requireStatus.join(", ")}] (${plan.rule}) — skip (flipped/retired elsewhere)`,
			);
			bump(skips, "status-mismatch");
			continue;
		}
		const set = diffFor(doc, plan);
		if (!Object.keys(set).length) {
			bump(skips, "already-provenanced");
			console.log(`  ${slug}: already provenanced (${plan.rule}), no-op`);
			continue;
		}
		console.log(
			`  ${slug}: ${plan.rule} → ${Object.entries(set)
				.map(
					([k, v]) =>
						`${k}=${Array.isArray(v) ? `[${v.join(",")}]` : String(v).slice(0, 60)}`,
				)
				.join(" · ")}`,
		);
		bump(ruleHits, plan.rule);
		writes.push({ slug, rule: plan.rule, set });
	}

	// ── R8: source-inherited bulk over remaining ACTIVE records ──
	console.log("\n── R8 source-inherited bulk (active + seed-sourced) ──");
	let page = 1;
	let scanned = 0;
	for (;;) {
		const r = await payload.find({
			collection: "projects",
			where: { status: { in: ["Live", "Development", "Pre-Release"] } },
			limit: 500,
			page,
			depth: 0,
			sort: "slug",
			select: PROJECT_SELECT,
			overrideAccess: true,
		});
		for (const doc of r.docs as Doc[]) {
			scanned++;
			if (considered.has(doc.slug)) continue; // explicit rule owns it
			if (doc.canonicalSlug) {
				bump(skips, "lineage-shadow");
				continue;
			}
			if (doc.statusBasis) {
				bump(skips, "already-provenanced");
				continue;
			}
			const source = doc.provenance?.source;
			if (source !== "LumenloopSeed" && source !== "UserSubmitted") {
				bump(skips, "no-derivable-evidence");
				continue;
			}
			const firstSeen: string | undefined = doc.provenance?.firstSeenAt;
			const set: Record<string, unknown> = {
				statusBasis: "source-inherited" satisfies StatusBasis,
			};
			if (!doc.statusAsOf && firstSeen) set.statusAsOf = new Date(firstSeen);
			bump(ruleHits, "R8-source-inherited-bulk");
			writes.push({ slug: doc.slug, rule: "R8-source-inherited-bulk", set });
		}
		if (!r.hasNextPage) break;
		page++;
	}
	console.log(
		`  scanned ${scanned} active records; ${ruleHits["R8-source-inherited-bulk"] ?? 0} bulk write(s) planned`,
	);

	// ── plan summary ──
	console.log("\n── Plan ──");
	for (const [rule, n] of Object.entries(ruleHits).sort())
		console.log(`  ${rule}: ${n}`);
	console.log("  skips:");
	for (const [k, n] of Object.entries(skips).sort())
		console.log(`    ${k}: ${n}`);
	console.log(`\n${writes.length} write(s) planned.`);

	if (OUT) {
		writeFileSync(
			OUT,
			JSON.stringify(
				{
					generatedAt: new Date().toISOString(),
					mode: EXECUTE ? "execute" : "dry-run",
					ruleHits,
					skips,
					writes,
				},
				null,
				2,
			),
		);
		console.log(`Plan written to ${OUT}`);
	}

	if (!EXECUTE) {
		console.log("DRY RUN — none applied.");
		process.exit(process.exitCode ?? 0);
	}

	// Per-write isolation (curate-projects precedent): a bad row fails loudly,
	// the rest still land. Raw $set on exactly the planned fields — see the
	// header for why this path skips the transparency-log afterChange hook.
	let failed = 0;
	const col = db.collection("projects");
	for (const w of writes) {
		try {
			const res = await col.updateOne({ slug: w.slug }, { $set: w.set });
			if (res.matchedCount !== 1) throw new Error("no document matched slug");
			console.log(`  wrote: ${w.slug}`);
		} catch (err) {
			failed++;
			console.error(`  FAILED: ${w.slug} — ${String(err)}`);
		}
	}
	if (failed) {
		console.error(`\n${failed} write(s) FAILED — fix and re-run.`);
		process.exitCode = 1;
	}
	console.log(
		`\nDONE: ${writes.length - failed}/${writes.length} write(s) applied.`,
	);
	process.exit(process.exitCode ?? 0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
