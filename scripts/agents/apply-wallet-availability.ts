/**
 * Applier for curator-agent wallet-availability drafts — the deterministic
 * gate. Reads a REVIEWED, COMMITTED drafts file (merged via PR — the human
 * gate is the diff) and lands entries with the standard writer discipline:
 *
 *   - dry-run DEFAULT; --execute to write;
 *   - writes ONLY where `availability` is currently empty (never overwrites
 *     curated or previously-applied rows);
 *   - every entry must carry storeUrl + checkedAt (evidence mandatory);
 *   - read-back verifies each write (by the doc id just written);
 *   - zero-drafts or zero-work exits 1 (a run that does nothing must not
 *     look like a run that did).
 *
 *   pnpm exec tsx scripts/agents/apply-wallet-availability.ts \
 *     --file improvements/drafts/wallet-availability-2026-08-14.json [--execute]
 */

import "../load-env";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getPayload } from "payload";
import config from "../../src/payload.config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const EXECUTE = process.argv.includes("--execute");
const fileIdx = process.argv.indexOf("--file");
const fileArg = fileIdx === -1 ? undefined : process.argv[fileIdx + 1];
if (!fileArg || fileArg.startsWith("--")) {
	console.error("--file <drafts.json> is required");
	process.exit(1);
}

interface DraftFile {
	generatedAt: string;
	drafts: Array<{
		slug: string;
		entries: Array<{
			platform: string;
			state: string;
			storeUrl: string;
			checkedAt: string;
			note: string;
		}>;
	}>;
}

async function main() {
	const file = JSON.parse(
		readFileSync(join(ROOT, fileArg), "utf8"),
	) as DraftFile;
	if (!file.drafts?.length) {
		console.error("✗ drafts file holds 0 drafts — nothing to apply is a red, not a pass");
		process.exit(1);
	}
	console.log(
		`${EXECUTE ? "EXECUTE" : "DRY RUN"} — ${file.drafts.length} draft(s) from ${fileArg}\n`,
	);
	const payload = await getPayload({ config });
	let applied = 0;
	let skipped = 0;
	let failed = 0;
	for (const d of file.drafts) {
		const bad = d.entries.find(
			(e) => !e.storeUrl || !e.checkedAt || e.state !== "available",
		);
		if (bad) {
			console.log(`  ✗ ${d.slug}: entry missing evidence or non-available state — refused`);
			failed++;
			continue;
		}
		const found = await payload.find({
			collection: "projects",
			where: { slug: { equals: d.slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const doc = found.docs[0] as any;
		if (!doc) {
			console.log(`  ✗ ${d.slug}: no such project — refused`);
			failed++;
			continue;
		}
		if (Array.isArray(doc.availability) && doc.availability.length) {
			console.log(`  – ${d.slug}: availability already populated — never overwrite, skipped`);
			skipped++;
			continue;
		}
		console.log(
			`  ${EXECUTE ? "write" : "would"} ${d.slug}: ${d.entries.map((e) => e.platform).join(", ")}`,
		);
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: doc.id,
				data: { availability: d.entries },
				overrideAccess: true,
			});
			// read back the row we wrote, by id (#843 discipline)
			const back = await payload.findByID({
				collection: "projects",
				id: doc.id,
				depth: 0,
				overrideAccess: true,
			});
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			const got = (back as any).availability;
			if (!Array.isArray(got) || got.length !== d.entries.length) {
				console.log(`  ✗ ${d.slug}: read-back mismatch — write did not persist as sent`);
				failed++;
				continue;
			}
		}
		applied++;
	}
	console.log(
		`\n${EXECUTE ? "DONE" : "PLAN"}: ${applied} applied · ${skipped} already-populated skips · ${failed} refused`,
	);
	if (applied === 0 && failed === 0) {
		console.error("✗ zero work — every draft was a skip; the drafts file is stale");
		process.exit(1);
	}
	process.exit(failed ? 1 : 0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
