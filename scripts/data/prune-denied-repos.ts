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
	const deletedIds: string[] = [];
	/** Rows stored under exactly this name, any letter case, held or not.
	 * `like` also matches longer names (web3-antivirus/bitcoin is inside
	 * web3-antivirus/bitcoin-development-grant-agreement), so the window is
	 * wide and the exact match is made here. */
	const rowsNamed = async (fullName: string) =>
		(
			(
				await payload.find({
					collection: "repos",
					where: { fullName: { like: fullName } },
					limit: 500,
					depth: 0,
					context: { includeSecurityHeld: true },
				})
			).docs as Array<{ id: string; fullName: string }>
		).filter((d) => d.fullName.toLowerCase() === fullName);
	for (const [fullName, reason] of DENIED_REPOS) {
		const exact = await rowsNamed(fullName);
		for (const d of exact) {
			console.log(`  ${d.fullName}\n     why: ${reason}`);
			if (EXECUTE) {
				await payload.delete({ collection: "repos", id: d.id });
				deletedIds.push(String(d.id));
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
	if (EXECUTE) {
		// Read back: a delete that did not take leaves a denied repo served.
		// First the deleted rows themselves, by id, so the check does not
		// lean on the finder that chose them; then every denied name again.
		const left: string[] = deletedIds.length
			? (
					(
						await payload.find({
							collection: "repos",
							where: { id: { in: deletedIds } },
							limit: deletedIds.length,
							depth: 0,
							context: { includeSecurityHeld: true },
						})
					).docs as Array<{ fullName: string }>
				).map((d) => d.fullName.toLowerCase())
			: [];
		for (const [fullName] of DENIED_REPOS)
			if (!left.includes(fullName) && (await rowsNamed(fullName)).length)
				left.push(fullName);
		if (left.length) {
			console.error(`✗ still indexed after the delete: ${left.join(", ")}`);
			process.exit(1);
		}
		console.log(
			`read back: none of the ${DENIED_REPOS.size} denied names is indexed`,
		);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
