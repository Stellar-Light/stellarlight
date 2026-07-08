/**
 * Dedupe cross-link (sls-008): stamp a duplicate/rename record's `canonicalSlug`
 * so consumers resolve it to the canonical project instead of getting a
 * contradictory answer from a stale row.
 *
 * Motivating case: `orbit-finance` (Inactive, unfunded) and `orbitcdp` (Live,
 * SCF $280k) are one lineage — same site (orbitcdp.finance) and GitHub org
 * (zenith-protocols). A name lookup on "Orbit Finance" surfaces the unfunded
 * row and answers "not SCF-funded", opposite to the truth. Pointing
 * orbit-finance.canonicalSlug → orbitcdp lets a consumer follow the lineage.
 *
 * Purely ADDITIVE and non-destructive:
 *   - only writes the `canonicalSlug` field; never deletes, never edits status
 *     (orbit-finance is already Inactive from the defunct-down-rank pass).
 *   - refuses to point at a canonical slug that doesn't exist (no ghost links).
 *   - refuses self-links (duplicate === canonical).
 *   - idempotent: skips a pair already pointing at the right slug.
 *
 *   npx tsx scripts/link-canonical-slug.ts            # dry run (report only)
 *   npx tsx scripts/link-canonical-slug.ts --execute  # write canonicalSlug
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

// Verified duplicate → canonical pairs. Add a row only after confirming the two
// records are the same lineage (same site/org/team), not merely a name overlap.
const PAIRS: Array<{ duplicate: string; canonical: string; note: string }> = [
	{
		duplicate: "orbit-finance",
		canonical: "orbitcdp",
		note: "same team Zenith Protocols; identical site orbitcdp.finance + github zenith-protocols (sls-008)",
	},
];

async function findBySlug(
	payload: Awaited<ReturnType<typeof getPayload>>,
	slug: string,
) {
	const res = await payload.find({
		collection: "projects",
		where: { slug: { equals: slug } },
		limit: 1,
		depth: 0,
		select: { slug: true, name: true, status: true, canonicalSlug: true },
	});
	return res.docs[0] as
		| {
				id: string;
				slug: string;
				name: string;
				status: string;
				canonicalSlug?: string | null;
		  }
		| undefined;
}

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`link-canonical-slug — ${EXECUTE ? "EXECUTE (writing)" : "DRY RUN (no writes)"}`,
	);

	let wrote = 0;
	let skipped = 0;
	let blocked = 0;

	for (const { duplicate, canonical, note } of PAIRS) {
		if (duplicate === canonical) {
			console.log(`✗ ${duplicate}: self-link refused`);
			blocked++;
			continue;
		}
		const dup = await findBySlug(payload, duplicate);
		const can = await findBySlug(payload, canonical);
		if (!dup) {
			console.log(`✗ ${duplicate}: duplicate record not found — skipped`);
			blocked++;
			continue;
		}
		if (!can) {
			console.log(
				`✗ ${duplicate} → ${canonical}: canonical record NOT found — refusing ghost link`,
			);
			blocked++;
			continue;
		}
		if (dup.canonicalSlug === canonical) {
			console.log(`· ${duplicate} → ${canonical}: already linked — skip`);
			skipped++;
			continue;
		}
		console.log(
			`→ ${duplicate} (${dup.status}) → ${canonical} (${can.status})` +
				`${dup.canonicalSlug ? ` [was ${dup.canonicalSlug}]` : ""}  — ${note}`,
		);
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: dup.id,
				data: { canonicalSlug: canonical },
				overrideAccess: true,
			});
			wrote++;
		}
	}

	console.log(
		`\n${EXECUTE ? "wrote" : "would write"}: ${EXECUTE ? wrote : PAIRS.length - skipped - blocked} · already-linked: ${skipped} · blocked: ${blocked}`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
