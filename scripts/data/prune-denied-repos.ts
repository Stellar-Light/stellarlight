/**
 * Remove indexed repos named in DENIED_REPOS (src/lib/repo-allowlist.ts).
 *
 *   npx tsx scripts/data/prune-denied-repos.ts            # DRY RUN
 *   npx tsx scripts/data/prune-denied-repos.ts --execute
 *
 * The denylist stops every pass from re-adding a row; this removes the rows
 * that got in before the entry existed. Deletes ONLY exact denylist matches
 * (case-insensitive fullName), prints each one with its reason first.
 */

import "../load-env";
import { getPayload } from "payload";
import { DENIED_REPOS } from "../../src/lib/repo-allowlist";
import configPromise from "../../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

async function main() {
	console.log(`prune denied repos — ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);
	const payload = await getPayload({ config: await configPromise });
	let removed = 0;
	for (const [fullName, reason] of DENIED_REPOS) {
		const r = await payload.find({
			collection: "repos",
			where: { fullName: { like: fullName } },
			limit: 10,
			depth: 0,
		});
		const exact = (r.docs as Array<{ id: string; fullName: string }>).filter(
			(d) => d.fullName.toLowerCase() === fullName,
		);
		for (const d of exact) {
			console.log(`  ${d.fullName}\n     why: ${reason}`);
			if (EXECUTE) {
				await payload.delete({ collection: "repos", id: d.id });
				removed++;
			}
		}
		if (!exact.length)
			console.log(`  ${fullName}: not indexed (nothing to do)`);
	}
	console.log(
		EXECUTE
			? `\nremoved ${removed}`
			: "\nDRY RUN — nothing deleted. Re-run with --execute.",
	);
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
