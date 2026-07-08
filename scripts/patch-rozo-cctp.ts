/**
 * Patch the Rozo project record to reflect its live cross-chain USDC bridge
 * (bridge.rozo.ai), so keyword + semantic search surface it for bridge / CCTP
 * / cross-chain queries. Verified 2026-06-13 (multi-source + adversarial): the
 * bridge is live mainnet beta (Stellar↔Base/Ethereum/Solana); the "Circle CCTP
 * v2" framing is Rozo's own claim (client code routes via Rozo's intent API),
 * so the wording attributes it rather than asserting it.
 *
 * Also: sets provenance.source=AdminEdit and bumps verificationLevel off
 * "Unverified" so the lumenloop sync (which only overwrites LumenloopSeed /
 * Unverified records) SKIPS Rozo and this edit persists. Re-embeds with the new
 * text. DRY RUN by default; --execute writes. Run via Action (prod creds + key).
 */
import { getPayload } from "payload";
import { embed } from "../src/lib/embed";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const ROZO_ID = "69b035ea2d04b7c0f26dada6";

const NEW_DESCRIPTION =
	"Rozo (rozo.ai) is an intent-based stablecoin payments network on Stellar — Rozo Intent Pay lets a payer pay from any chain or token while the merchant receives USDC/EURC. As of 2026 it also runs a live cross-chain USDC bridge (bridge.rozo.ai, mainnet beta) moving native USDC between Stellar and Base, Ethereum, and Solana, which Rozo describes as built on Circle CCTP v2.";
const NEW_TAGS = ["Bridge", "Cross-Chain", "CCTP", "USDC"];

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const doc: any = await payload.findByID({
		collection: "projects",
		id: ROZO_ID,
		depth: 0,
	});

	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}\n`,
	);
	console.log("CURRENT:");
	console.log(
		"  name:",
		doc.name,
		"| category:",
		doc.category,
		"| status:",
		doc.status,
	);
	console.log(
		"  provenance.source:",
		doc.provenance?.source,
		"| verificationLevel:",
		doc.verificationLevel,
	);
	console.log("  tags:", JSON.stringify(doc.tags));
	console.log(
		"  shortDescription:",
		String(doc.shortDescription).slice(0, 90),
		"…",
	);
	console.log(
		"  has embedding:",
		Array.isArray(doc.embedding) ? doc.embedding.length + "-dim" : "no",
	);

	// merge tags (handle string[] or object[])
	let mergedTags = doc.tags;
	if (Array.isArray(doc.tags)) {
		if (doc.tags.length === 0 || typeof doc.tags[0] === "string") {
			mergedTags = Array.from(new Set([...(doc.tags || []), ...NEW_TAGS]));
		} else if (typeof doc.tags[0] === "object" && doc.tags[0]) {
			const key =
				"tag" in doc.tags[0] ? "tag" : "name" in doc.tags[0] ? "name" : null;
			if (key) {
				const have = new Set(doc.tags.map((t: any) => t[key]));
				mergedTags = [
					...doc.tags,
					...NEW_TAGS.filter((t) => !have.has(t)).map((t) => ({ [key]: t })),
				];
			}
		}
	} else {
		mergedTags = NEW_TAGS;
	}

	// sync-protection: skip-condition is source===LumenloopSeed OR verif===Unverified.
	const newVerif =
		doc.verificationLevel === "Unverified"
			? "Verified (Community)"
			: doc.verificationLevel;

	const tagStr = (mergedTags || [])
		.map((t: any) => (typeof t === "string" ? t : t.tag || t.name || ""))
		.join(" ");
	const embedText =
		`${doc.name}. ${NEW_DESCRIPTION}. ${doc.category}. ${tagStr}`.slice(
			0,
			4000,
		);

	console.log("\nPROPOSED:");
	console.log("  shortDescription →", NEW_DESCRIPTION.slice(0, 90), "…");
	console.log("  tags →", JSON.stringify(mergedTags));
	console.log(
		"  provenance.source → AdminEdit  (was",
		doc.provenance?.source + ")",
	);
	console.log(
		"  verificationLevel →",
		newVerif,
		"(was",
		doc.verificationLevel + ")  [protects from sync]",
	);
	console.log("  re-embed text →", embedText.slice(0, 90), "…");

	if (!EXECUTE) {
		console.log("\nDRY RUN — no changes.");
		process.exit(0);
	}

	const vec = await embed(embedText);
	await payload.update({
		collection: "projects",
		id: ROZO_ID,
		data: {
			shortDescription: NEW_DESCRIPTION,
			tags: mergedTags,
			embedding: vec,
			verificationLevel: newVerif,
			provenance: { ...(doc.provenance || {}), source: "AdminEdit" },
		},
	});
	console.log("\nDONE: Rozo patched + re-embedded (1024-dim).");
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
