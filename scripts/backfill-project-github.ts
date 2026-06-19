/**
 * Backfill missing `links.github` on project records so their repos get indexed
 * + surfaced. A project with no GitHub link contributes zero code references.
 *
 * PRECISION-FIRST: writes ONLY a hand-verified allowlist (the dry-run audit
 * proved blind website-extraction injects junk — turbolong→blend-capital,
 * 3 projects→wix the site-builder, etc.). Each entry below was confirmed to be
 * the project's own org/repo. SDF SDKs are pinned to the SPECIFIC repo, not
 * github.com/stellar, so enrich-repos org-expansion doesn't flood them with
 * hundreds of unrelated Stellar repos.
 *
 * Only fills projects that currently LACK a github link (never overwrites).
 * Edit survives the lumenloop sync via provenance.source=AdminEdit +
 * verificationLevel bump (the sync's overwrite guard is an OR over those two).
 * Re-run enrich-repos afterwards to index the newly-linked repos.
 *
 *   pnpm exec tsx scripts/backfill-project-github.ts            # dry run / audit
 *   pnpm exec tsx scripts/backfill-project-github.ts --execute  # write
 */
import "dotenv/config";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

// Hand-verified: slug → exact github url (org-level for dedicated orgs;
// specific repo for SDKs that live inside a big multi-repo org).
const CURATED: Record<string, string> = {
	// Real Stellar-native OSS — owner-level (enrich-repos stellar-gate keeps it clean)
	noether: "https://github.com/NoetherDEX",
	arcane: "https://github.com/arcane-finance-defi",
	rabet: "https://github.com/rabetofficial",
	"solar-wallet": "https://github.com/satoshipay",
	"hot-wallet": "https://github.com/hot-dao",
	"orbit-finance": "https://github.com/zenith-protocols",
	"soroban-hub": "https://github.com/Creit-Tech",
	cypher: "https://github.com/CypherD-IO",
	blockeden: "https://github.com/blockedenhq",
	// usdx/eurx/gbpx (FxDAO stablecoins) removed — FxDAO is no longer active;
	// un-promoted via scripts/revert-fxdao.ts.
	glousd: "https://github.com/Glo-Foundation",
	// SDKs / tooling — pinned to the SPECIFIC repo (avoid github.com/stellar flood)
	"stellar-cli": "https://github.com/stellar/stellar-cli",
	"go-stellar-sdk": "https://github.com/stellar/go",
	"javascript-stellar-sdk": "https://github.com/stellar/js-stellar-sdk",
	"soroban-rust-sdk": "https://github.com/stellar/rs-soroban-sdk",
	"typescript-wallet-sdk": "https://github.com/stellar/typescript-wallet-sdk",
	"stellar-quickstart": "https://github.com/stellar/quickstart",
	"net-stellar-sdk": "https://github.com/Beans-BV/dotnet-stellar-sdk",
	"ios-stellar-sdk": "https://github.com/Soneso/stellar-ios-mac-sdk",
	"java-stellar-sdk": "https://github.com/lightsail-network/java-stellar-sdk",
};

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

	// biome-ignore lint/suspicious/noExplicitAny: payload doc
	const projects = (await payload.find({ collection: "projects", pagination: false, depth: 0 }))
		.docs as any[];
	const bySlug = new Map(projects.map((p) => [p.slug, p]));

	let wrote = 0, already = 0, missing = 0, skipHasGh = 0;
	for (const [slug, gh] of Object.entries(CURATED)) {
		const p = bySlug.get(slug);
		if (!p) {
			console.log(`  ?  ${slug.padEnd(26)} — NOT FOUND in directory`);
			missing++;
			continue;
		}
		if (p.links?.github?.trim()) {
			console.log(`  =  ${slug.padEnd(26)} already has github (${p.links.github}) — skip`);
			skipHasGh++;
			continue;
		}
		console.log(`  ${EXECUTE ? "✔" : "→"}  ${slug.padEnd(26)} → ${gh}`);
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: p.id,
				data: {
					links: { ...(p.links ?? {}), github: gh },
					provenance: { ...(p.provenance ?? {}), source: "AdminEdit" },
					...(p.verificationLevel === "Unverified" || !p.verificationLevel
						? { verificationLevel: "Verified (Community)" }
						: {}),
				},
			});
			wrote++;
		} else {
			already++;
		}
	}

	console.log(
		`\n${EXECUTE ? `DONE: wrote ${wrote}` : `DRY RUN: would write ${already}`}; ${skipHasGh} already had github; ${missing} slugs not found.`,
	);
	console.log("→ Re-run the enrich-repos Action next to index the newly-linked repos.");
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
