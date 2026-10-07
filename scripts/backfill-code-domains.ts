/**
 * Re-derive codeDomains for every scanned repo from STORED evidence
 * (contractInterface + stellarDeps + sdkCapabilities) — zero GitHub calls.
 *
 * Domains normally derive at scan time; when the classifier registry gains
 * markers (2026-08-15: the AMM router surface — domain=defi-amm served 0
 * while soroswap sat scanned with 48 fns), already-scanned repos need this
 * offline pass instead of a full rescan.
 *
 *   pnpm exec tsx scripts/backfill-code-domains.ts             # dry run
 *   pnpm exec tsx scripts/backfill-code-domains.ts --execute   # write
 *
 * Discipline: only-write-if-different, context.internal on reads (the #896
 * class — without it any privacy-stripped field reads blind), sampled
 * read-back, zero-work red only when the corpus holds no domains at all.
 */
import "./load-env";

import { getPayload } from "payload";
import { deriveCodeDomains } from "../src/lib/code-domains";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

async function main(): Promise<number> {
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
	const payload = await getPayload({ config: await configPromise });

	let page = 1;
	let seen = 0;
	let changed = 0;
	let written = 0;
	let alreadyLabeled = 0;
	let mismatches = 0;
	const domainCounts = new Map<string, number>();

	for (;;) {
		const res = await payload.find({
			collection: "repos",
			where: { codeScanState: { equals: "scanned" } },
			limit: 500,
			page,
			depth: 0,
			context: { internal: true },
			select: {
				fullName: true,
				stellarDeps: true,
				sdkCapabilities: true,
				contractInterface: true,
				codeDomains: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		const docs = res.docs as any[];
		for (const d of docs) {
			seen += 1;
			const next = deriveCodeDomains({
				stellarDeps: d.stellarDeps ?? null,
				sdkCapabilities: d.sdkCapabilities ?? null,
				contractInterface: d.contractInterface ?? null,
			});
			const cur: string[] = Array.isArray(d.codeDomains) ? d.codeDomains : [];
			if (cur.length) alreadyLabeled += 1;
			const same =
				next.length === cur.length && next.every((x) => cur.includes(x));
			if (same) continue;
			changed += 1;
			for (const x of next) domainCounts.set(x, (domainCounts.get(x) ?? 0) + 1);
			console.log(`  ${d.fullName}: [${cur.join(",")}] → [${next.join(",")}]`);
			if (!EXECUTE) continue;
			await payload.update({
				collection: "repos",
				id: String(d.id),
				data: { codeDomains: next },
			});
			if (written % 10 === 0) {
				const check = (await payload.findByID({
					collection: "repos",
					id: String(d.id),
					depth: 0,
					context: { internal: true },
					// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
				})) as any;
				const got: string[] = Array.isArray(check?.codeDomains)
					? check.codeDomains
					: [];
				if (
					!(got.length === next.length && next.every((x) => got.includes(x)))
				) {
					mismatches += 1;
					console.error(`  ✗ read-back mismatch ${d.fullName}`);
				}
			}
			written += 1;
		}
		if (!res.hasNextPage) break;
		page += 1;
	}

	console.log(`\nswept ${seen} scanned repos`);
	console.log(
		`${EXECUTE ? "rewrote" : "would rewrite"}: ${changed} · already labeled: ${alreadyLabeled} · read-back mismatches: ${mismatches}`,
	);
	for (const [x, n] of [...domainCounts.entries()].sort((a, b) => b[1] - a[1]))
		console.log(`  ${x}: ${n}`);

	if (mismatches > 0) return 1;
	if (seen > 1000 && changed === 0 && alreadyLabeled === 0) {
		console.error(
			"RED: zero domains across a scanned corpus — derivation broke",
		);
		return 1;
	}
	return 0;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
