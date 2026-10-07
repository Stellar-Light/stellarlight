/**
 * Guard: the repos collection holds ONE row per repo.
 *
 * Duplicate rows are how the 2026-08-28 census found 381 copies (some repos
 * stored 20×): a writer that looks a repo up under one name and writes it
 * under another creates a fresh copy every pass, and nothing red-lined. This
 * guard is that red line. It groups rows by lowercase fullName — which
 * catches exact duplicates AND case-variant twins, the two shapes the class
 * has actually produced — and exits 1 the moment any group holds more than
 * one row, printing every cluster so the finding is actionable.
 *
 * Read-only. Runs after every enrich-repos wave (the writer guards its own
 * class at its own cadence) and after a dedupe --execute as the read-back.
 *
 *   pnpm exec tsx scripts/data/check-repo-dupes.ts
 */
import "../load-env";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

async function main() {
	const payload = await getPayload({ config: await configPromise });

	const names: string[] = [];
	let page = 1;
	for (;;) {
		const res = await payload.find({
			collection: "repos",
			limit: 1000,
			page,
			depth: 0,
			select: { fullName: true },
		});
		for (const d of res.docs as Array<{ fullName?: string }>) {
			if (d.fullName) names.push(d.fullName);
		}
		if (!res.hasNextPage) break;
		page++;
	}

	const byLower = new Map<string, string[]>();
	for (const n of names) {
		const k = n.toLowerCase();
		byLower.set(k, [...(byLower.get(k) ?? []), n]);
	}
	const clusters = [...byLower.entries()].filter(([, v]) => v.length > 1);
	const extraRows = clusters.reduce((a, [, v]) => a + v.length - 1, 0);

	console.log(
		`repo-dupes: ${names.length} rows · ${byLower.size} distinct fullNames · ${clusters.length} duplicate cluster(s) · ${extraRows} extra row(s)`,
	);
	if (clusters.length === 0) {
		console.log("✓ one row per repo");
		process.exit(0);
	}
	for (const [key, v] of clusters.sort((a, b) => b[1].length - a[1].length)) {
		const variants = [...new Set(v)];
		console.log(
			`  ✗ ${key} × ${v.length}${variants.length > 1 ? ` (case variants: ${variants.join(", ")})` : ""}`,
		);
	}
	console.log(
		"\nA duplicate cluster means a writer is creating instead of upserting (the rename-loop class, see scripts/enrich-repos.ts findRepoDoc). Clear the debt with scripts/data/dedupe-repo-docs.ts and find which writer regressed.",
	);
	process.exit(1);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
