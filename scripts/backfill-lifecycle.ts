/**
 * Historical-archive backfill (lean lifecycle: wasLive + note). Turns a bare
 * `status: Inactive` into ecosystem memory so a consumer asking "what CDPs are
 * on Stellar?" can be told "OrbitCDP WAS a live CDP protocol that shut down"
 * instead of getting silence.
 *
 * Purely ADDITIVE and non-destructive: only writes the `lifecycle` group; never
 * deletes, never changes status. Idempotent (skips a project already carrying
 * the same note). Add a row per verified defunct/changed project.
 *
 *   npx tsx scripts/backfill-lifecycle.ts            # dry run (report only)
 *   npx tsx scripts/backfill-lifecycle.ts --execute  # write lifecycle
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

// slug → { wasLive, note }. Only add a project after confirming its history.
// Keep notes factual and dated — agents quote them verbatim.
const ENTRIES: Array<{ slug: string; wasLive: boolean; note: string }> = [
	{
		slug: "orbitcdp",
		wasLive: true,
		note: "Live CDP (collateralized-debt-position) protocol on Soroban; SCF-funded ($280k, rounds 21/25/29). Shut down in 2026 — team pivoted to Zenex.",
	},
];

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(`backfill-lifecycle — ${EXECUTE ? "EXECUTE (writing)" : "DRY RUN (no writes)"}`);

	let wrote = 0;
	let skipped = 0;
	let missing = 0;

	for (const { slug, wasLive, note } of ENTRIES) {
		const res = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			select: { slug: true, name: true, status: true, lifecycle: true },
		});
		// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
		const doc = res.docs[0] as any;
		if (!doc) {
			console.log(`✗ ${slug}: not found — skipped`);
			missing++;
			continue;
		}
		const cur = doc.lifecycle || {};
		if (cur.wasLive === wasLive && (cur.note || "") === note) {
			console.log(`· ${slug}: lifecycle already set — skip`);
			skipped++;
			continue;
		}
		console.log(`→ ${doc.name} (${doc.status}): wasLive=${wasLive} · note="${note.slice(0, 70)}…"`);
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: doc.id,
				data: { lifecycle: { wasLive, note } },
				overrideAccess: true,
			});
			wrote++;
		}
	}

	console.log(
		`\n${EXECUTE ? "wrote" : "would write"}: ${EXECUTE ? wrote : ENTRIES.length - skipped - missing} · already-set: ${skipped} · missing: ${missing}`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
