/** READ-ONLY by default. Applies a batch of project status changes (retire
 * defunct → Draft, dedupe → hide non-keeper, demote → lower status). Each is
 * sync-protected (AdminEdit + verif off Unverified). --execute writes. */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
// [slug, newStatus, reason]
const OPS: [string, string, string][] = [
  ["multiclique", "Draft", "defunct — multiclique.org NXDOMAIN"],
  ["elio-dao", "Draft", "defunct — elio-dao.org NXDOMAIN"],
  ["blend-capital", "Draft", "dupe of 'blend' (keeper has SCF+logo)"],
  ["sushi-swap", "Draft", "dupe of 'sushi'"],
  ["freedom-pay", "Draft", "dupe of 'freedom-pay-wallet' (SCF $150k)"],
  ["soroban-optimsitic-oracle", "Draft", "typo dupe of 'soroban-optimistic-oracle'"],
  ["diadata", "Draft", "dupe of 'dia'"],
  ["raumfi", "Draft", "dupe of 'raum-network'"],
  ["raum-network", "Development", "lower — testnet-only, never shipped mainnet"],
];

async function main() {
  const payload = await getPayload({ config: await configPromise });
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);
  let done = 0, skipped = 0;
  for (const [slug, status, reason] of OPS) {
    const res = await payload.find({ collection: "projects", where: { slug: { equals: slug } }, limit: 1, depth: 0 });
    const doc: any = res.docs[0];
    if (!doc) { console.log(`  ⚠ NOT FOUND: ${slug} — skip (${reason})`); skipped++; continue; }
    if (doc.status === status) { console.log(`  • ${doc.name} (${slug}) already ${status} — skip`); skipped++; continue; }
    console.log(`  ${doc.name} (${slug}): ${doc.status} → ${status}   [${reason}]`);
    if (EXECUTE) {
      await payload.update({ collection: "projects", id: doc.id, data: {
        status,
        verificationLevel: doc.verificationLevel === "Unverified" ? "Verified (Community)" : doc.verificationLevel,
        provenance: { ...(doc.provenance || {}), source: "AdminEdit" },
      }});
      done++;
    }
  }
  console.log(`\n${EXECUTE ? `DONE: ${done} updated, ${skipped} skipped.` : `DRY RUN — ${OPS.length - skipped} would change, ${skipped} skipped.`}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
