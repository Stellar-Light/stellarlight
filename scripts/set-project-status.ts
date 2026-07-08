/** READ-ONLY by default. Set a project's status by slug — e.g. Draft to retire
 * a defunct project (Draft is filtered out of every public API result). Also
 * sets provenance=AdminEdit + verif off Unverified so the lumenloop sync won't
 * revert/re-create it. SLUG + STATUS via env. --execute writes. */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const SLUG = (process.env.SLUG || "").trim();
const STATUS = (process.env.STATUS || "").trim();
const VALID = ["Draft", "Development", "Pre-Release", "Live", "Inactive"];

async function main() {
	if (!SLUG || !VALID.includes(STATUS)) {
		console.error(`Need SLUG + STATUS in {${VALID.join(", ")}}`);
		process.exit(1);
	}
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "projects",
		where: { slug: { equals: SLUG } },
		limit: 1,
		depth: 0,
	});
	const doc: any = res.docs[0];
	if (!doc) {
		console.error(`No project with slug "${SLUG}"`);
		process.exit(1);
	}

	const newVerif =
		doc.verificationLevel === "Unverified"
			? "Verified (Community)"
			: doc.verificationLevel;
	console.log(`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}`);
	console.log(`  ${doc.name} (${doc.slug})`);
	console.log(`    status:            ${doc.status} → ${STATUS}`);
	console.log(`    provenance.source: ${doc.provenance?.source} → AdminEdit`);
	console.log(
		`    verificationLevel: ${doc.verificationLevel} → ${newVerif}   [sync-protect]`,
	);
	if (!EXECUTE) {
		console.log("\nDRY RUN — no changes.");
		process.exit(0);
	}

	await payload.update({
		collection: "projects",
		id: doc.id,
		data: {
			status: STATUS,
			verificationLevel: newVerif,
			provenance: { ...(doc.provenance || {}), source: "AdminEdit" },
		},
	});
	console.log(`\nDONE: ${doc.name} → ${STATUS} (sync-protected).`);
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
