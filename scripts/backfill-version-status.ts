/**
 * Recompute `versionStatus` for every code-scanned repo from the SDK facts
 * already stored — no GitHub calls, no re-scan.
 *
 *   pnpm exec tsx scripts/backfill-version-status.ts [--execute] [--limit=N]
 *
 * Why this exists. `versionStatus` was derived from the Rust `soroban-sdk`
 * crate alone, and the assignment ran BEFORE the scan had populated
 * `stellarJsDep` — so every repo without a Cargo.toml was stamped "unknown".
 * That was 5,356 of 10,876 scanned repos: 1,598 pin a readable
 * @stellar/stellar-sdk major, and 681 depend on the unscoped `stellar-sdk`
 * package that npm itself serves with a publisher-set deprecation notice.
 *
 * The field became load-bearing on 2026-09-07, when repoScore started reading
 * it — a deprecated pin now costs a repo 25%, because an agent copying from a
 * repo on a Protocol-22-era SDK copies a dead API. A signal that is blind on
 * half the population cannot carry that weight.
 *
 * ONE WRITER: the scanner owns this field, and this backfill calls the exact
 * same `combinedVersionStatus()` the scanner now calls — it repairs history,
 * it does not hold a second opinion. A re-scan of the same repo will land on
 * the same value.
 */
import "./load-env";
import { getPayload } from "payload";
import config from "@payload-config";
import { combinedVersionStatus } from "../src/lib/soroban-versions";

const EXECUTE = process.argv.includes("--execute");
const LIMIT = Number(
	process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0,
);

async function main() {
	const payload = await getPayload({ config });

	let read = 0;
	let moved = 0;
	let wrote = 0;
	const transitions = new Map<string, number>();
	const samples: string[] = [];

	for (let page = 1; page < 200; page++) {
		const res = await payload.find({
			collection: "repos",
			where: { codeScanState: { equals: "scanned" } },
			limit: 200,
			page,
			depth: 0,
			overrideAccess: true,
			context: { internal: true },
		});
		for (const r of res.docs as unknown as Array<Record<string, unknown>>) {
			read++;
			const before = r.versionStatus ? String(r.versionStatus) : "unknown";
			const after = combinedVersionStatus(
				typeof r.sorobanSdkVersion === "string" ? r.sorobanSdkVersion : null,
				typeof r.stellarJsDep === "string" ? r.stellarJsDep : null,
			);
			if (after === before) continue;
			moved++;
			const key = `${before} → ${after}`;
			transitions.set(key, (transitions.get(key) ?? 0) + 1);
			if (samples.length < 25)
				samples.push(
					`  ${before.padEnd(10)} → ${after.padEnd(10)} ${String(r.fullName)}  (${r.stellarJsDep ?? r.sorobanSdkVersion})`,
				);
			if (EXECUTE) {
				await payload.update({
					collection: "repos",
					id: String(r.id),
					data: { versionStatus: after },
					overrideAccess: true,
					context: { internal: true },
				});
				wrote++;
			}
			if (LIMIT && moved >= LIMIT) break;
		}
		if (!res.hasNextPage) break;
		if (LIMIT && moved >= LIMIT) break;
	}

	console.log(`\nscanned repos read: ${read}`);
	console.log(`versionStatus changes: ${moved}`);
	for (const [k, v] of [...transitions.entries()].sort((a, b) => b[1] - a[1]))
		console.log(`  ${k.padEnd(24)} ${v}`);
	console.log("\nsamples:");
	for (const s of samples) console.log(s);
	console.log(
		EXECUTE ? `\nWROTE ${wrote} rows` : "\nDRY RUN — pass --execute to write",
	);

	// End-state assertion: say what is true about the world after this ran,
	// rather than reporting "success" for having finished the loop.
	if (EXECUTE && wrote !== moved) {
		console.error(`FATAL: planned ${moved} writes, wrote ${wrote}`);
		process.exit(1);
	}
	if (read === 0) {
		console.error("FATAL: zero scanned repos read — the query found nothing");
		process.exit(1);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
