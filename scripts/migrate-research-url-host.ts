/**
 * One-off migration (sls-003): repoint research-docs citation URLs off the
 * rebranded audit host (sorobansecurity.com → stellarsecurityportal.com).
 *
 * The audit ingest dedupes by contentHash, so a re-ingest leaves the stored
 * `url` unchanged when only the host moved — this updates the url field in place.
 * Idempotent, never deletes. Dry-run by default; --execute to write.
 *
 *   npx tsx scripts/migrate-research-url-host.ts             # dry run (count only)
 *   npx tsx scripts/migrate-research-url-host.ts --execute   # repoint
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const OLD = "sorobansecurity.com";
const NEW = "stellarsecurityportal.com";

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const { totalDocs } = await payload.count({
		collection: "research-docs",
		where: { url: { contains: OLD } },
	});
	console.log(`${totalDocs} research-docs chunk(s) reference ${OLD}`);
	if (!EXECUTE) {
		console.log("Dry run — re-run with --execute to repoint.");
		return;
	}
	let updated = 0;
	// Updated docs leave the `contains OLD` filter, so always fetch the first page.
	for (;;) {
		const r = await payload.find({
			collection: "research-docs",
			where: { url: { contains: OLD } },
			limit: 200,
			depth: 0,
			select: { url: true },
		});
		if (!r.docs.length) break;
		for (const d of r.docs as Array<{ id: string; url: string }>) {
			await payload.update({
				collection: "research-docs",
				id: d.id,
				data: { url: String(d.url).split(OLD).join(NEW) },
			});
			updated += 1;
		}
		console.log(`  …${updated} repointed`);
	}
	console.log(`Done. Repointed ${updated} citation(s) → ${NEW}.`);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL", e);
		process.exit(1);
	});
