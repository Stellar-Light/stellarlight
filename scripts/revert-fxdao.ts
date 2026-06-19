/**
 * Revert the FxDAO promotion. The backfill added github=FxDAO + bumped usdx/eurx/
 * gbpx to Verified (Community), but FxDAO is no longer active — presenting a
 * defunct issuer's stablecoins as verified + pulling its repos into the index is
 * wrong. This un-promotes the three projects (drop the github link I added,
 * revert verification to Unverified) and removes any indexed FxDAO repos.
 *
 *   pnpm exec tsx scripts/revert-fxdao.ts            # dry run
 *   pnpm exec tsx scripts/revert-fxdao.ts --execute  # write
 */
import "dotenv/config";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const SLUGS = ["usdx", "eurx", "gbpx"];

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"} — reverting FxDAO promotion\n`);

	// 1. Un-promote the three projects: drop the github link, revert verification.
	for (const slug of SLUGS) {
		const res = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
		});
		// biome-ignore lint/suspicious/noExplicitAny: payload doc
		const p = res.docs[0] as any;
		if (!p) {
			console.log(`  ? ${slug} — not found`);
			continue;
		}
		console.log(
			`  ${slug.padEnd(8)} github=${p.links?.github || "(none)"} verification=${p.verificationLevel} → unset github + Unverified`,
		);
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: p.id,
				data: {
					links: { ...(p.links ?? {}), github: "" },
					verificationLevel: "Unverified",
				},
			});
		}
	}

	// 2. Remove any indexed FxDAO repos (by owner, or linked to these slugs).
	const repoRes = await payload.find({
		collection: "repos",
		where: { or: [{ owner: { like: "FxDAO" } }, { projectSlug: { in: SLUGS } }] },
		limit: 500,
		depth: 0,
	});
	console.log(`\n  FxDAO repos indexed: ${repoRes.docs.length}`);
	// biome-ignore lint/suspicious/noExplicitAny: payload doc
	for (const r of repoRes.docs as any[])
		console.log(`    - ${r.fullName} (projectSlug=${r.projectSlug ?? "—"})`);
	if (EXECUTE) {
		// biome-ignore lint/suspicious/noExplicitAny: payload doc
		for (const r of repoRes.docs as any[])
			await payload.delete({ collection: "repos", id: r.id });
	}

	console.log(
		`\n${EXECUTE ? "DONE" : "DRY RUN"}: un-promoted ${SLUGS.length} FxDAO projects; ${EXECUTE ? "deleted" : "would delete"} ${repoRes.docs.length} FxDAO repos.`,
	);
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
