/**
 * Store the curated hackathon submissions (src/data/curated-builds.ts), from
 * events off DoraHacks such as HackMeridian, as hackathon builds, so search,
 * prior art, briefs, event pages and submission detail serve them: the
 * winners named by the page that names them, and HackMeridian 2026's records
 * from HackProof (src/data/hackmeridian-2026-hackproof.json).
 *
 *   pnpm exec tsx scripts/import-curated-builds.ts            # dry run, writes nothing
 *   pnpm exec tsx scripts/import-curated-builds.ts --execute  # write
 *
 * The one writer of `curated-` rows' own fields (src/lib/curated-import.ts
 * names them): the DoraHacks sync writes only the fields it derives (stack,
 * activity, project link, embedding, categories). Upserts by entryKey and
 * writes only a row that changed. A field the data file leaves empty is
 * written as null, so a correction clears it. A curated row no longer in the
 * files is hidden (hiddenUpstream), never deleted. Every write is read back.
 */

import "./load-env";
import { getPayload } from "payload";
import { CURATED_BUILDS, HACKPROOF_BUILDS } from "../src/data/curated-builds";
import { CURATED_HACKATHONS } from "../src/data/curated-hackathons";
import {
	badCuratedRows,
	planCuratedImport,
	sameValue,
} from "../src/lib/curated-import";
import configPromise from "../src/payload.config";
import { exitAfterFlush } from "./lib/exit-after-flush";

const EXECUTE = process.argv.includes("--execute");
// internal: the read-back sees every field; includeSecurityHeld: a held
// repo's link is read as stored, not withheld (HackathonBuilds afterRead).
const CONTEXT = { internal: true, includeSecurityHeld: true };
const ROWS = [...CURATED_BUILDS, ...HACKPROOF_BUILDS];

async function main() {
	const events = new Map(CURATED_HACKATHONS.map((h) => [h.uname, h]));
	const bad = badCuratedRows(ROWS, events);
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
	const keys = ROWS.map((b) => `${b.id}@${b.hackathonSlug}`);
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
	// A curated row no longer in the files (a renamed or withdrawn winner, a
	// record a refresh dropped) is hidden, never deleted, so it stops being
	// served and can come back.
	const orphans = (
		await payload.find({
			collection: "hackathon-builds",
			where: {
				// Any event: a curated row whose event left the file is an orphan too.
				and: [
					{ buildId: { like: "curated-" } },
					{ entryKey: { not_in: keys } },
					{ hiddenUpstream: { not_equals: true } },
				],
			},
			pagination: false,
			depth: 0,
			context: CONTEXT,
		})
	).docs as unknown as Array<Record<string, unknown>>;
	// The dry run shows exactly what would be written.
	const plan = planCuratedImport(ROWS, events, await read(), orphans);
	for (const line of plan.lines) console.log(line);
	let failed = 0;
	if (EXECUTE) {
		for (const w of plan.writes) {
			try {
				if (w.id)
					await payload.update({
						collection: "hackathon-builds",
						id: w.id,
						data: { ...w.facts, lastSeenAt: now },
						context: CONTEXT,
					});
				else
					await payload.create({
						collection: "hackathon-builds",
						data: {
							...w.facts,
							firstSeenAt: now,
							lastSeenAt: now,
						} as never,
						context: CONTEXT,
					});
			} catch (e) {
				failed++;
				console.error(`  ✗ ${w.entryKey}: ${(e as Error).message}`);
			}
		}
		for (const o of orphans) {
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
	}
	console.log(
		`\n${ROWS.length} curated rows: ${plan.created} created, ${plan.updated} updated, ${plan.unchanged} unchanged, ${orphans.length} to hide, ${failed} failed`,
	);
	if (!EXECUTE) {
		console.log("dry run: nothing written. Re-run with --execute to write.");
		return;
	}
	// Read back every field, not just the key: Payload drops a field it does
	// not know without an error, so a row can land without its write-up.
	const back = await read();
	// The hides too: a withdrawn row still served is the failure this guards.
	const stillServed = orphans.length
		? (
				await payload.find({
					collection: "hackathon-builds",
					where: {
						and: [
							{ id: { in: orphans.map((o) => o.id) } },
							{ hiddenUpstream: { not_equals: true } },
						],
					},
					pagination: false,
					depth: 0,
					context: CONTEXT,
				})
			).docs.map(
				(d) =>
					`${String((d as { entryKey?: string }).entryKey)}: still served after hide`,
			)
		: [];
	const wrong = [
		...stillServed,
		...[...plan.expected].flatMap(([k, facts]) => {
			const row = back.get(k);
			if (!row) return [`${k}: not stored`];
			return Object.entries(facts)
				.filter(([f, v]) => !sameValue(row[f], v))
				.map(
					([f, v]) =>
						`${k}.${f}: stored ${JSON.stringify(row[f] ?? null)}, wrote ${JSON.stringify(v)}`,
				);
		}),
	];
	if (failed || wrong.length) {
		console.error(
			`✗ ${failed} write(s) failed; ${wrong.length} field(s) wrong:`,
		);
		for (const w of wrong) console.error(`  ${w}`);
		process.exitCode = 1;
	} else
		console.log(`${back.size} curated row(s) stored, every field read back`);
}

// Exit only after the plan has flushed: a plain process.exit cut the dry
// run's plan and summary short on the CI runner (2026-11-07).
main()
	.then(() => exitAfterFlush(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		exitAfterFlush(1);
	});
