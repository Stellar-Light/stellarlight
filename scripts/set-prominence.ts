/** READ-ONLY by default. Sets the editorial `prominence` search-ranking boost
 * (0-100) on canonical/flagship project records so /api/projects/search lifts
 * them above tail records that merely contain the query word. Also nudges
 * verificationLevel off "Unverified" (these are vetted flagships) and stamps
 * provenance=AdminEdit so the lumenloop sync won't clobber the curation.
 * --execute writes; dry-run prints the plan. */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

// slug → prominence. Tiers: 90 canonical pick for its category · 80–85 leading ·
// 70–75 established · 60 notable/new. Derived from the 24-intent discoverability
// sweep + wallet audit (the flagship set per category).
const PROM: Record<string, number> = {
	// wallets
	freighter: 90, lobstr: 90, xbull: 90,
	albedo: 80, rabet: 78, hana: 76, vesseo: 78, "solar-wallet": 70,
	klever: 60, "bitget-wallet": 60, "hot-wallet": 60, ledger: 62, trezor: 62,
	walletconnect: 58, fordefi: 60, "cactus-link": 55,
	// stablecoins / issuers
	circle: 90, brale: 72, "glo-dollar": 66,
	// DEX / AMM
	soroswap: 90, aquarius: 85, phoenix: 80, comet: 70,
	stellarterm: 72, stellarbroker: 74,
	// lending / yield
	blend: 90, slender: 80, orbitcdp: 70, defindex: 78,
	// oracles
	reflector: 90, dia: 84, band: 82, "redstone-finance": 80, lightecho: 72,
	// bridges / interop
	allbridge: 88, axelar: 84, spacewalk: 70, stronghold: 64,
	"circle-cctp-cross-chain-transfer-protocol": 66,
	// RWA
	benji: 88, ondo: 85, wisdomtree: 80, etherfuse: 78, spiko: 78, redswan: 70,
	// anchors / payments / remittance
	moneygram: 90, bitso: 84, "yellow-card": 80, fonbnk: 76,
	beans: 70, "felix-pago": 70, chipper: 68, decaf: 66,
	"stellar-disbursement-platform-sdp": 72,
	// custody
	dfns: 80, "ultra-stellar": 74, bitgo: 72,
};

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}  (${Object.keys(PROM).length} records)\n`);
	let done = 0, skipped = 0, missing = 0;
	for (const [slug, prominence] of Object.entries(PROM)) {
		const res = await payload.find({ collection: "projects", where: { slug: { equals: slug } }, limit: 1, depth: 0 });
		// biome-ignore lint/suspicious/noExplicitAny: doc shape
		const doc: any = res.docs[0];
		if (!doc) { console.log(`  ⚠ NOT FOUND: ${slug}`); missing++; continue; }
		if (doc.prominence === prominence) { console.log(`  • ${doc.name} (${slug}) already ${prominence} — skip`); skipped++; continue; }
		console.log(`  ${doc.name} (${slug}): prominence ${doc.prominence ?? 0} → ${prominence}`);
		if (EXECUTE) {
			await payload.update({ collection: "projects", id: doc.id, data: {
				prominence,
				verificationLevel: doc.verificationLevel === "Unverified" ? "Verified (Community)" : doc.verificationLevel,
				provenance: { ...(doc.provenance || {}), source: "AdminEdit" },
			}});
			done++;
		}
	}
	console.log(`\n${EXECUTE ? `DONE: ${done} updated, ${skipped} already-set, ${missing} not-found.` : `DRY RUN — ${Object.keys(PROM).length - skipped - missing} would change, ${skipped} already-set, ${missing} not-found.`}`);
	process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
