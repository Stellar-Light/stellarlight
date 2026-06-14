/** Apply the data-content-pass: 15 description fixes, 3 re-tags (SCF/category),
 * 4 new flagship records (Rabet/QuickNode/Validation Cloud/Squid). Content is
 * the web-verified output in scripts/data/content-pass.json. Existing-record
 * edits are sync-protected (AdminEdit). Dry-run default; --execute writes. */
import { readFileSync } from "node:fs";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import { generateSlug } from "../src/lib/utils/normalize";

const EXECUTE = process.argv.includes("--execute");
const data = JSON.parse(readFileSync("scripts/data/content-pass.json", "utf8"));
const protect = (d: any) => ({
  verificationLevel: d.verificationLevel === "Unverified" ? "Verified (Community)" : d.verificationLevel,
  provenance: { ...(d.provenance || {}), source: "AdminEdit" },
});

async function main() {
  const payload = await getPayload({ config: await configPromise });
  const find = async (slug: string) =>
    (await payload.find({ collection: "projects", where: { slug: { equals: slug } }, limit: 1, depth: 0 })).docs[0] as any;
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

  console.log(`— DESCRIPTION UPDATES (${data.descUpdates.length}) —`);
  for (const u of data.descUpdates) {
    const doc = await find(u.slug);
    if (!doc) { console.log(`  ⚠ not found: ${u.slug}`); continue; }
    console.log(`  ${doc.name} (${u.slug}): "${u.shortDescription.slice(0, 64)}…"`);
    if (EXECUTE) await payload.update({ collection: "projects", id: doc.id, data: { shortDescription: u.shortDescription, ...protect(doc) } });
  }

  console.log(`\n— RE-TAGS (${data.retags.length}) —`);
  for (const t of data.retags) {
    const doc = await find(t.slug);
    if (!doc) { console.log(`  ⚠ not found: ${t.slug}`); continue; }
    const patch: any = { ...protect(doc) };
    if (t.category) patch.category = t.category;
    if (t.scfAwarded !== undefined) patch.scf = { ...(doc.scf || {}), awarded: t.scfAwarded, ...(t.scfTotalAwardedUSD !== undefined ? { totalAwarded: t.scfTotalAwardedUSD } : {}) };
    console.log(`  ${doc.name} (${t.slug}): ${JSON.stringify({ category: t.category, scf: t.scfAwarded, usd: t.scfTotalAwardedUSD })}`);
    if (EXECUTE) await payload.update({ collection: "projects", id: doc.id, data: patch });
  }

  console.log(`\n— NEW RECORDS (${data.newRecords.length}) —`);
  for (const n of data.newRecords) {
    const slug = generateSlug(n.name);
    if (await find(slug)) { console.log(`  • ${n.name} (${slug}) already exists — skip`); continue; }
    console.log(`  + CREATE ${n.name} (${slug}) [${n.category}] ${n.website}`);
    if (EXECUTE) await payload.create({ collection: "projects", data: {
      name: n.name, slug, category: n.category, status: "Live",
      verificationLevel: "Verified (Community)",
      provenance: { source: "AdminEdit" },
      ...(n.website ? { links: { website: n.website } } : {}),
      ...(n.shortDescription ? { shortDescription: n.shortDescription } : {}),
    }});
  }
  console.log(`\n${EXECUTE ? "DONE." : "DRY RUN — no changes."}`);
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
