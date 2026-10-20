/**
 * Store the curated hackathon submissions (src/data/curated-builds.ts), from
 * events off DoraHacks such as HackMeridian, as hackathon builds, so search,
 * prior art, briefs, event pages and submission detail serve them.
 *
 *   pnpm exec tsx scripts/import-curated-builds.ts            # dry run, writes nothing
 *   pnpm exec tsx scripts/import-curated-builds.ts --execute  # write
 *
 * The one writer of `curated-` rows: the DoraHacks sync writes only rows it
 * reads from DoraHacks rosters and never touches these. Upserts by entryKey,
 * writes only a row that changed, and never deletes. A field the data file
 * leaves null never blanks a stored value.
 */

import "./load-env";
import { getPayload } from "payload";
import { CURATED_BUILDS } from "../src/data/curated-builds";
import { CURATED_HACKATHONS } from "../src/data/curated-hackathons";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
// internal: the read-back sees every field; includeSecurityHeld: a held
// repo's link is read as stored, not withheld (HackathonBuilds afterRead).
const CONTEXT = { internal: true, includeSecurityHeld: true };

async function main() {
	const events = new Map(CURATED_HACKATHONS.map((h) => [h.uname, h]));
	const ids = new Set<string>();
	const bad = CURATED_BUILDS.filter((b) => {
		const dup = ids.has(b.id);
		ids.add(b.id);
		return (
			dup || !events.has(b.hackathonSlug) || !/^curated-[a-z0-9-]+$/.test(b.id)
		);
	});
	if (bad.length) {
		console.error(
			`✗ rows with a duplicate or non-curated id, or naming no curated event: ${bad.map((b) => b.id).join(", ")}`,
		);
		process.exitCode = 1;
		return;
	}
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`import-curated-builds: ${EXECUTE ? "EXECUTE, rows are written" : "dry run, writes nothing"}`,
	);
	const now = new Date().toISOString();
	const keyOf = (b: (typeof CURATED_BUILDS)[number]) =>
		`${b.id}@${b.hackathonSlug}`;
	const keys = CURATED_BUILDS.map(keyOf);
	const read = async () =>
		new Map(
			(
				await payload.find({
					collection: "hackathon-builds",
					where: { entryKey: { in: keys } },
					limit: keys.length,
					depth: 0,
					context: CONTEXT,
				})
			).docs.map((d) => [
				String(d.entryKey),
				d as unknown as Record<string, unknown>,
			]),
		);
	const stored = await read();
	let created = 0;
	let updated = 0;
	let same = 0;
	let failed = 0;
	for (const b of CURATED_BUILDS) {
		const ev = events.get(b.hackathonSlug);
		if (!ev) continue;
		const entryKey = keyOf(b);
		const facts: Record<string, unknown> = {
			buildId: b.id,
			entryKey,
			name: b.name,
			hackathonSlug: b.hackathonSlug,
			hackathonTitle: ev.title,
			endedAt: new Date(ev.end_time * 1000).toISOString(),
			url: b.url,
			isWinner: b.isWinner,
			...(b.track ? { track: b.track } : {}),
			...(b.placement ? { placement: b.placement } : {}),
			...(b.description ? { vision: b.description } : {}),
			...(b.githubUrl ? { githubUrl: b.githubUrl } : {}),
			...(b.demoUrl ? { demoUrl: b.demoUrl } : {}),
		};
		const old = stored.get(entryKey);
		const changed =
			!old ||
			Object.entries(facts).some(
				([k, v]) => JSON.stringify(old[k]) !== JSON.stringify(v),
			);
		if (!changed) {
			same++;
			continue;
		}
		console.log(
			`  ${old ? "update" : "create"} ${entryKey}: ${b.name} (${b.track ?? "no track"}, ${b.placement ?? "entry"})`,
		);
		if (!EXECUTE) {
			if (old) updated++;
			else created++;
			continue;
		}
		try {
			if (old)
				await payload.update({
					collection: "hackathon-builds",
					id: String(old.id),
					data: { ...facts, lastSeenAt: now },
					context: CONTEXT,
				});
			else
				await payload.create({
					collection: "hackathon-builds",
					data: { ...facts, firstSeenAt: now, lastSeenAt: now } as never,
					context: CONTEXT,
				});
			if (old) updated++;
			else created++;
		} catch (e) {
			failed++;
			console.error(`  ✗ ${entryKey}: ${(e as Error).message}`);
		}
	}
	console.log(
		`\n${CURATED_BUILDS.length} curated rows: ${created} created, ${updated} updated, ${same} unchanged, ${failed} failed`,
	);
	if (!EXECUTE) {
		console.log("dry run: nothing written. Re-run with --execute to write.");
		return;
	}
	// Read back: a row that did not land is a submission nobody can find.
	const back = await read();
	const missing = keys.filter((k) => !back.has(k));
	if (failed || missing.length) {
		console.error(
			`✗ ${failed} write(s) failed; ${missing.length} row(s) not stored: ${missing.join(", ")}`,
		);
		process.exitCode = 1;
	} else console.log(`${back.size} curated row(s) stored`);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
