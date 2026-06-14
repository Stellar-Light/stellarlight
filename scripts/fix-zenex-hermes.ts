/** Fix the Hermes→Zenex rename. Zenex (live record) was SCF-funded (SCF #32,
 * $150K, Financial Protocols) but shows scf=false and its description still
 * opens "Hermes is a decentralized perpetual exchange…". Tag Zenex SCF + clean
 * the description; retire the stale duplicate Hermes record (Draft). Verified by
 * the audit (SCF #32 + GitHub rename zenith-protocols/hermes). Dry-run default. */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
const EXECUTE = process.argv.includes("--execute");
const ZENEX_ID = "6a2da020213eeb05b49587c4";
const HERMES_ID = "69b035c62d04b7c0f26da663";
const protect = (d: any) => ({
  verificationLevel: d.verificationLevel === "Unverified" ? "Verified (Community)" : d.verificationLevel,
  provenance: { ...(d.provenance || {}), source: "AdminEdit" },
});
async function main() {
  const payload = await getPayload({ config: await configPromise });
  const zenex: any = await payload.findByID({ collection: "projects", id: ZENEX_ID, depth: 0 });
  const hermes: any = await payload.findByID({ collection: "projects", id: HERMES_ID, depth: 0 }).catch(() => null);
  console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
  console.log(`  Zenex: name=${zenex?.name} scf.awarded=${zenex?.scf?.awarded} status=${zenex?.status}`);
  console.log(`         desc="${String(zenex?.shortDescription).slice(0, 70)}…"`);
  console.log(`  Hermes (dupe): ${hermes ? `name=${hermes.name} status=${hermes.status} scf=${hermes?.scf?.awarded}` : "NOT FOUND at that id"}`);
  const newDesc = String(zenex.shortDescription || "").replace(/^\s*Hermes\b/, "Zenex (formerly Hermes)");
  console.log(`  → Zenex desc becomes: "${newDesc.slice(0, 70)}…"`);
  console.log(`  → Zenex scf.awarded=true, totalAwarded=150000; Hermes → Draft`);
  if (!EXECUTE) { console.log("DRY RUN — no changes."); process.exit(0); }
  await payload.update({ collection: "projects", id: ZENEX_ID, data: {
    shortDescription: newDesc,
    scf: { ...(zenex.scf || {}), awarded: true, totalAwarded: 150000 },
    ...protect(zenex),
  }});
  if (hermes) await payload.update({ collection: "projects", id: HERMES_ID, data: { status: "Draft", ...protect(hermes) } });
  console.log("DONE: Zenex tagged SCF + description cleaned; Hermes dupe retired.");
  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
