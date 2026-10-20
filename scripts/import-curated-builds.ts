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
import { CURATED_BUILD_ID } from "../src/lib/hackathon-build-links";
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
		return dup || !events.has(b.hackathonSlug) || !CURATED_BUILD_ID.test(b.id);
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
	const expected = new Map<string, Record<string, unknown>>();
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
			// Written as null when empty, so a second run clears a value the
			// file corrected (outside review, 2026-10-20).
			track: b.track ?? null,
			placement: b.placement ?? null,
			vision: b.description ?? null,
			githubUrl: b.githubUrl ?? null,
			demoUrl: b.demoUrl ?? null,
			hiddenUpstream: false,
		};
		expected.set(entryKey, facts);
		const old = stored.get(entryKey);
		const diff = Object.entries(facts).filter(
			([k, v]) => !sameValue(old?.[k], v),
		);
		if (old && !diff.length) {
			same++;
			continue;
		}
		// The dry run shows exactly what would be written.
		console.log(`  ${old ? "update" : "create"} ${entryKey}`);
		for (const [k, v] of diff)
			console.log(
				`      ${k}: ${JSON.stringify(old?.[k] ?? null)} -> ${JSON.stringify(v)}`,
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
	// A curated row no longer in the file (a renamed or withdrawn winner) is
	// hidden, never deleted, so it stops being served and can come back.
	const orphans = (
		await payload.find({
			collection: "hackathon-builds",
			where: {
				and: [
					{ buildId: { like: "curated-" } },
					{ hackathonSlug: { in: [...events.keys()] } },
					{ entryKey: { not_in: keys } },
					{ hiddenUpstream: { not_equals: true } },
				],
			},
			limit: 100,
			depth: 0,
			context: CONTEXT,
		})
	).docs as unknown as Array<Record<string, unknown>>;
	for (const o of orphans) {
		console.log(`  hide ${o.entryKey}: no longer in curated-builds.ts`);
		if (!EXECUTE) continue;
		try {
			await payload.update({
				collection: "hackathon-builds",
				id: String(o.id),
				data: { hiddenUpstream: true, lastSeenAt: now },
				context: CONTEXT,
			});
		} catch (e) {
			failed++;
			console.error(`  ✗ hide ${o.entryKey}: ${(e as Error).message}`);
		}
	}
	console.log(
		`\n${CURATED_BUILDS.length} curated rows: ${created} created, ${updated} updated, ${same} unchanged, ${orphans.length} to hide, ${failed} failed`,
	);
	if (!EXECUTE) {
		console.log("dry run: nothing written. Re-run with --execute to write.");
		return;
	}
	// Read back every field, not just the key: Payload drops a field it does
	// not know without an error, so a row can land without its write-up.
	const back = await read();
	const wrong = [...expected].flatMap(([k, facts]) => {
		const row = back.get(k);
		if (!row) return [`${k}: not stored`];
		return Object.entries(facts)
			.filter(([f, v]) => !sameValue(row[f], v))
			.map(
				([f, v]) =>
					`${k}.${f}: stored ${JSON.stringify(row[f] ?? null)}, wrote ${JSON.stringify(v)}`,
			);
	});
	if (failed || wrong.length) {
		console.error(
			`✗ ${failed} write(s) failed; ${wrong.length} field(s) wrong:`,
		);
		for (const w of wrong) console.error(`  ${w}`);
		process.exitCode = 1;
	} else
		console.log(`${back.size} curated row(s) stored, every field read back`);
}

/** Equal as stored: a field written as null may read back absent. */
function sameValue(stored: unknown, wrote: unknown): boolean {
	if (wrote === null || wrote === false)
		return stored === wrote || stored === null || stored === undefined;
	return JSON.stringify(stored) === JSON.stringify(wrote);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
