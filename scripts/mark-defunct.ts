/**
 * Hide confirmed-defunct projects from active search. There's no "defunct"
 * status, so we set status → Draft (the search route filters to
 * Development/Pre-Release/Live, so Draft drops out of results + the frontend).
 * Reversible. Stamps provenance.source=AdminEdit + bumps verificationLevel off
 * Unverified so the change survives the lumenloop sync (its overwrite guard is
 * an OR over those two); the verification value is moot while the record is Draft.
 *
 * Curated from user domain knowledge — these are NOT active:
 *   CommuniDAO, LumosDAO, InstantDAO, EnerDAO, The Hub.
 *
 *   pnpm exec tsx scripts/mark-defunct.ts            # dry run
 *   pnpm exec tsx scripts/mark-defunct.ts --execute  # write
 */
import "dotenv/config";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

// name + candidate slugs (matched by slug first, then exact name) so a slug
// guess can't silently miss or mis-hit a different project.
const TARGETS: Array<{ name: string; slugs: string[] }> = [
	{ name: "CommuniDAO", slugs: ["communidao", "communi-dao"] },
	{ name: "LumosDAO", slugs: ["lumosdao", "lumos-dao"] },
	{ name: "InstantDAO", slugs: ["instantdao", "instant-dao"] },
	{ name: "EnerDAO", slugs: ["enerdao", "ener-dao"] },
	{ name: "The Hub", slugs: ["thehubdao", "the-hub", "the-hub-dao", "thehub"] },
];

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}\n`);

	let done = 0, already = 0, missing = 0;
	for (const t of TARGETS) {
		// biome-ignore lint/suspicious/noExplicitAny: payload doc
		let p: any = null;
		for (const slug of t.slugs) {
			const res = await payload.find({
				collection: "projects",
				where: { slug: { equals: slug } },
				limit: 1,
				depth: 0,
			});
			if (res.docs[0]) {
				p = res.docs[0];
				break;
			}
		}
		if (!p) {
			const byName = await payload.find({
				collection: "projects",
				where: { name: { equals: t.name } },
				limit: 1,
				depth: 0,
			});
			p = byName.docs[0] ?? null;
		}
		if (!p) {
			console.log(`  ? ${t.name.padEnd(12)} — NOT FOUND (slugs tried: ${t.slugs.join(", ")})`);
			missing++;
			continue;
		}
		if (p.status === "Draft") {
			console.log(`  = ${t.name.padEnd(12)} "${p.name}" (${p.slug}) already Draft`);
			already++;
			continue;
		}
		console.log(
			`  ${EXECUTE ? "✔" : "→"} ${t.name.padEnd(12)} "${p.name}" (${p.slug}) status=${p.status} → Draft`,
		);
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: p.id,
				data: {
					status: "Draft",
					provenance: { ...(p.provenance ?? {}), source: "AdminEdit" },
					...(p.verificationLevel === "Unverified" || !p.verificationLevel
						? { verificationLevel: "Verified (Community)" }
						: {}),
				},
			});
			done++;
		}
	}

	console.log(
		`\n${EXECUTE ? `DONE: ${done} hidden` : "DRY RUN"}; ${already} already Draft; ${missing} not found.`,
	);
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
