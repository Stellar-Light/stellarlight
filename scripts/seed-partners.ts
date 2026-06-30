/**
 * Seed the partner DIRECTORY with curated, factual entries so /api/partners
 * stops returning empty (Raven's #1 flagged gap). Blends three sources:
 *   (a) curated audit firms (public facts)
 *   (b) anchors already in OUR project directory (fetched live → stays open/data-driven)
 *   (c) — LumenLoop entities left for a follow-up batch
 *
 *   pnpm exec tsx scripts/seed-partners.ts            # DRY RUN (prints, no writes)
 *   pnpm exec tsx scripts/seed-partners.ts --execute  # create (idempotent)
 *
 * ADDITIVE + IDEMPOTENT: only ever CREATES a partner whose slug doesn't exist;
 * never updates or deletes. Safe to re-run, and cannot affect any other
 * collection or endpoint (so it can't break Raven's other lanes).
 *
 * These entities haven't self-onboarded, so they're seeded `published` +
 * `verified: false` (honest curated provenance) and carry ONLY plain facts
 * (name, type, sector, website, one-line description). Every subjective field
 * (pricing, SLA, capacity, exact services) is left EMPTY — that's the
 * partner's to fill via the portal. We don't put words in their mouth.
 */

import { config as loadEnv } from "dotenv";
import { randomBytes } from "node:crypto";
import { getPayload } from "payload";
import config from "@payload-config";

// Local dev reads .env.local; in CI the workflow injects DATABASE_URI via env.
loadEnv({ path: ".env.local" });

const EXECUTE = process.argv.includes("--execute");
const SITE = process.env.SCOUT_BASE ?? "https://stellarlight.xyz";

interface SeedPartner {
	name: string;
	slug: string;
	partnerType: string;
	sectors: string[];
	description: string;
	websiteUrl?: string | null;
}

// (a) Curated audit firms — only firms with a real Stellar/Soroban footprint.
const AUDIT_FIRMS: SeedPartner[] = [
	{
		name: "Veridise",
		slug: "veridise",
		partnerType: "audit-firm",
		sectors: ["defi"],
		description:
			"Smart-contract security audits + formal verification. Audited Stellar Soroban Core (the V-SOR Veridise reports).",
		websiteUrl: "https://veridise.com",
	},
	{
		name: "OtterSec",
		slug: "ottersec",
		partnerType: "audit-firm",
		sectors: ["defi"],
		description: "Security audit firm covering Soroban / Stellar ecosystem smart contracts.",
		websiteUrl: "https://osec.io",
	},
	{
		name: "Runtime Verification",
		slug: "runtime-verification",
		partnerType: "audit-firm",
		sectors: ["defi"],
		description:
			"Formal-verification and audit firm; has reviewed Stellar/Soroban protocol components.",
		websiteUrl: "https://runtimeverification.com",
	},
	{
		name: "Certora",
		slug: "certora",
		partnerType: "audit-firm",
		sectors: ["defi"],
		description: "Formal-verification security audits for smart contracts.",
		websiteUrl: "https://www.certora.com",
	},
	{
		name: "Halborn",
		slug: "halborn",
		partnerType: "audit-firm",
		sectors: ["defi"],
		description: "Blockchain security audits and penetration testing.",
		websiteUrl: "https://www.halborn.com",
	},
];

// (b) Anchors already curated in OUR directory — fetched live so the set tracks
// the directory rather than a hardcoded copy.
async function fetchAnchors(): Promise<SeedPartner[]> {
	try {
		const res = await fetch(`${SITE}/api/projects/search?category=Anchor&limit=50`);
		if (!res.ok) return [];
		const json = (await res.json()) as {
			projects?: Array<{
				name: string;
				slug: string;
				shortDescription?: string | null;
				url?: string | null;
				links?: { website?: string | null };
			}>;
		};
		return (json.projects ?? [])
			.filter((p) => p.name && p.slug)
			.map((p) => ({
				name: p.name,
				// Namespace the slug so it never collides with a project slug.
				slug: `anchor-${p.slug}`,
				partnerType: "anchor",
				sectors: ["payments"],
				description:
					p.shortDescription ?? `${p.name} — Stellar anchor (fiat on/off-ramp).`,
				websiteUrl: p.links?.website ?? p.url ?? null,
			}));
	} catch {
		return [];
	}
}

async function main() {
	const anchors = await fetchAnchors();
	const all = [...AUDIT_FIRMS, ...anchors];
	console.log(
		`Assembled ${all.length} curated partners: ${AUDIT_FIRMS.length} audit firms + ${anchors.length} anchors\n`,
	);

	if (!EXECUTE) {
		console.log("DRY RUN — would create (slug · type · website · name):");
		for (const p of all) {
			console.log(`  ${p.slug.padEnd(28)} ${p.partnerType.padEnd(12)} ${p.websiteUrl ?? "—"}  ${p.name}`);
		}
		console.log("\nRe-run with --execute to write. Idempotent: existing slugs are skipped.");
		process.exit(0);
	}

	const payload = await getPayload({ config });
	let created = 0;
	let skipped = 0;
	for (const p of all) {
		const existing = await payload.find({
			collection: "partner-accounts",
			where: { slug: { equals: p.slug } },
			limit: 1,
			depth: 0,
		});
		if (existing.docs.length > 0) {
			skipped++;
			continue;
		}
		await payload.create({
			collection: "partner-accounts",
			data: {
				email: `curated+${p.slug}@stellarlight.xyz`,
				password: randomBytes(18).toString("base64url"),
				name: p.name,
				slug: p.slug,
				partnerType: p.partnerType as never,
				sectors: p.sectors as never,
				description: p.description,
				websiteUrl: p.websiteUrl ?? undefined,
				status: "published",
				verified: false,
			},
		});
		created++;
		console.log(`  ✓ ${p.name} (${p.slug})`);
	}
	console.log(`\nDone. created=${created} skipped=${skipped} total=${all.length}`);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
