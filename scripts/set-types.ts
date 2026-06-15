/** READ-ONLY by default. Tags flagship projects with their `types` (Wallet, DEX,
 * Lending, …) so /api/projects/search can intent-scope ranking: a record only gets
 * the big "is the queried category" boost when its type matches the query. Fixes
 * the cross-category bleed where a high-prominence custody/yield/DEX record (DFNS,
 * DeFindex, StellarTerm) led q=wallet. Sync-protected (AdminEdit). --execute writes. */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

// slug → types[]. Only what the record fundamentally IS (the end-user/builder intent).
// Oracles intentionally left untyped — q=oracle has no intent-type and already ranks
// right by prominence. Custody/MPC infra → "Security" (NOT Wallet) so it leaves q=wallet.
const TYPES: Record<string, string[]> = {
	// --- RPC providers + faucet tools (new RPC / Faucet types — intent-scoped) ---
	"validation-cloud": ["RPC"], quicknode: ["RPC"], nodies: ["RPC"], nownodes: ["RPC"],
	alchemy: ["RPC"], blockdaemon: ["RPC"], liquify: ["RPC"], gatewayfm: ["RPC"],
	infstones: ["RPC"], ankr: ["RPC"], onfinality: ["RPC"], getblock: ["RPC"],
	exaion: ["RPC"], "horizon-as-a-service": ["RPC"],
	obsrvr: ["RPC", "Indexer"], "lightsail-network-quasar": ["RPC", "Indexer"],
	friendbot: ["Faucet"], "stellar-cli": ["Faucet"], "stellar-quickstart": [],
	"stellar-laboratory": ["SDK", "Explorer", "Faucet"],
	// --- deferred-categories curation (SDK/RPC/indexer/faucet/identity/gaming) ---
	"javascript-stellar-sdk": ["SDK"],
	"soroban-rust-sdk": ["SDK"],
	"typescript-wallet-sdk": ["SDK"],
	"java-stellar-sdk": ["SDK"],
	"ios-stellar-sdk": ["SDK"],
	"net-stellar-sdk": ["SDK"],
	"getblock": [],
	"lightsail-network-quasar": ["SDK", "Indexer"],
	"python-stellar-sdk": ["SDK"],
	"stellar-php-sdk": ["SDK"],
	"kmp-stellar-sdk": ["SDK"],
	"obsrvr": ["Indexer"],
	"space-and-time": ["Indexer", "Analytics"],
	"zettablock": ["Indexer", "Analytics"],
	"streamingfast": ["Indexer", "Analytics"],
	"flipside": ["Analytics", "Indexer"],
	"stellar-laboratory": ["SDK", "Explorer"],
	"idos": ["Security"],
	"chaincerts": ["Security"],
	"didstellar": ["Security"],
	"reclaim": ["Security"],
	"scorechain": ["Security", "Analytics"],
	"stellar-passport": ["Security", "Wallet"],
	"kale": ["Gaming"],
	"warmancer": ["Gaming", "NFT", "AI"],
	"beamable": ["Gaming", "SDK"],
	"katagames": ["Gaming", "SDK"],
	"stellar-unity-developer-kit": ["Gaming", "SDK"],
	"nebulavrf": ["Gaming", "NFT", "SDK"],
	"cyberbrawl": ["Gaming", "NFT"],
	"open-gamefi-sdk": ["Gaming", "SDK"],
	"vaquita": [],

	// end-user wallets
	freighter: ["Wallet"], lobstr: ["Wallet"], xbull: ["Wallet"], albedo: ["Wallet"],
	rabet: ["Wallet"], hana: ["Wallet"], vesseo: ["Wallet"], "solar-wallet": ["Wallet"],
	klever: ["Wallet"], "bitget-wallet": ["Wallet"], "hot-wallet": ["Wallet"],
	ledger: ["Wallet"], trezor: ["Wallet"], beans: ["Wallet", "Payments"],
	// custody / MPC / multisig infra — NOT end-user wallets
	dfns: ["Security"], bitgo: ["Security"], fordefi: ["Security"],
	"cactus-link": ["Security"], "ultra-stellar": ["Security"],
	// DEX / AMM
	soroswap: ["DEX"], aquarius: ["DEX"], phoenix: ["DEX"], comet: ["DEX"],
	stellarterm: ["DEX"], stellarbroker: ["DEX"],
	// lending / yield
	blend: ["Lending"], slender: ["Lending"], orbitcdp: ["Lending"], defindex: ["Lending"],
	// bridges / interop
	allbridge: ["Bridge"], axelar: ["Bridge"], spacewalk: ["Bridge"], stronghold: ["Bridge"],
	"circle-cctp-cross-chain-transfer-protocol": ["Bridge"],
	// RWA
	benji: ["RWA"], ondo: ["RWA"], wisdomtree: ["RWA"], etherfuse: ["RWA"],
	spiko: ["RWA"], redswan: ["RWA"],
	// anchors / on-off ramps
	moneygram: ["Anchor"], bitso: ["Anchor"], "yellow-card": ["Anchor"], fonbnk: ["Anchor"],
	// stablecoin issuers / platforms
	circle: ["Stablecoin"], brale: ["Stablecoin"], "glo-dollar": ["Stablecoin"],
	// payments / remittance
	"felix-pago": ["Payments"], chipper: ["Payments"], decaf: ["Payments"],
	"stellar-disbursement-platform-sdp": ["Payments"],
	// oracles: no "Oracle" type exists, and the lumenloop sync mislabeled these
	// (DIA=[Bridge,AI], Band=[Bridge], Reflector=[SDK]) — clear the wrong tags so
	// they stop polluting q=bridge / q=sdk. q=oracle ranks them by prominence.
	reflector: [], dia: [], band: [], "redstone-finance": [], lightecho: [],
};

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}  (${Object.keys(TYPES).length} records)\n`);
	let done = 0, skipped = 0, missing = 0;
	for (const [slug, types] of Object.entries(TYPES)) {
		const res = await payload.find({ collection: "projects", where: { slug: { equals: slug } }, limit: 1, depth: 0 });
		// biome-ignore lint/suspicious/noExplicitAny: doc shape
		const doc: any = res.docs[0];
		if (!doc) { console.log(`  ⚠ NOT FOUND: ${slug}`); missing++; continue; }
		const cur = Array.isArray(doc.types) ? [...doc.types].sort().join(",") : "";
		if (cur === [...types].sort().join(",")) { console.log(`  • ${doc.name} (${slug}) already [${types}] — skip`); skipped++; continue; }
		console.log(`  ${doc.name} (${slug}): [${doc.types ?? ""}] → [${types}]`);
		if (EXECUTE) {
			await payload.update({ collection: "projects", id: doc.id, data: {
				types,
				verificationLevel: doc.verificationLevel === "Unverified" ? "Verified (Community)" : doc.verificationLevel,
				provenance: { ...(doc.provenance || {}), source: "AdminEdit" },
			}});
			done++;
		}
	}
	console.log(`\n${EXECUTE ? `DONE: ${done} updated, ${skipped} already-set, ${missing} not-found.` : `DRY RUN — ${Object.keys(TYPES).length - skipped - missing} would change, ${skipped} already-set, ${missing} not-found.`}`);
	process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
