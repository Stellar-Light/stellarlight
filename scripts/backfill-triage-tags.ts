/**
 * Backfill triage tags across the WHOLE repos collection — including the
 * EC-taxonomy corpus, which the project-scoped enrich loop never touches
 * (found 2026-08-15: deriveTriageTags was wired into enrich-repos' per-
 * project write, so rows with no owning project — the exact long tail
 * triage exists for — would never tag).
 *
 *   pnpm exec tsx scripts/backfill-triage-tags.ts             # dry run
 *   pnpm exec tsx scripts/backfill-triage-tags.ts --execute   # write
 *
 * ZERO GitHub API calls: tags derive purely from STORED signals
 * (src/lib/repo-triage.ts), so this can run full-corpus any time without
 * touching the scan budget. Discipline: only-write-if-different, per-write
 * read-back (the silent-drop class), zero-work red (an all-skip sweep over
 * a corpus KNOWN to contain dead long tail means derivation broke).
 */
import "./load-env";

import { getPayload } from "payload";
import { deriveTriageTags } from "../src/lib/repo-triage";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

async function main(): Promise<number> {
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
	const payload = await getPayload({ config: await configPromise });

	let page = 1;
	let seen = 0;
	let wouldTag = 0;
	let written = 0;
	let cleared = 0;
	let mismatches = 0;
	const tagCounts = new Map<string, number>();

	for (;;) {
		const res = await payload.find({
			collection: "repos",
			limit: 500,
			page,
			depth: 0,
			// context.internal: without it the afterRead privacy hook strips
			// triageTags from THIS read too, so "existing" is always empty and
			// every run re-tags the same rows (the 1,855-repeats symptom).
			context: { internal: true },
			select: {
				fullName: true,
				lastCommitAt: true,
				stars: true,
				isFork: true,
				isArchived: true,
				farmScore: true,
				judgedHackathon: true,
				hackathonWinner: true,
				source: true,
				projectSlug: true,
				description: true,
				name: true,
				activitySignals: true,
				triageTags: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		const docs = res.docs as any[];
		for (const d of docs) {
			seen += 1;
			const tags = deriveTriageTags({
				fullName: String(d.fullName ?? ""),
				lastCommitAt: d.lastCommitAt ?? null,
				stars: d.stars ?? null,
				isFork: d.isFork ?? null,
				isArchived: d.isArchived ?? null,
				farmScore: d.farmScore ?? null,
				judgedHackathon: d.judgedHackathon ?? null,
				hackathonWinner: d.hackathonWinner ?? null,
				source: d.source ?? null,
				projectSlug: d.projectSlug ?? null,
				description: d.description ?? null,
				name: d.name ?? null,
				commits90d: d.activitySignals?.commits90d ?? null,
			});
			const existing: string[] = Array.isArray(d.triageTags) ? d.triageTags : [];
			const same =
				tags.length === existing.length && tags.every((t) => existing.includes(t));
			if (same) continue;
			if (tags.length) wouldTag += 1;
			else cleared += 1;
			for (const t of tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
			if (!EXECUTE) continue;
			await payload.update({
				collection: "repos",
				id: String(d.id),
				data: { triageTags: tags },
			});
			// One-time ground-truth probe on the very first write: the hooked
			// read (with context) vs the adapter-level read (no hooks — cannot
			// lie). Disambiguates hook-bypass failure from true non-persistence.
			if (written === 0) {
				const hooked = (await payload.findByID({
					collection: "repos",
					id: String(d.id),
					depth: 0,
					context: { internal: true },
					// biome-ignore lint/suspicious/noExplicitAny: probe
				})) as any;
				// biome-ignore lint/suspicious/noExplicitAny: adapter probe
				const raw = (await (payload.db as any).findOne({
					collection: "repos",
					where: { id: { equals: String(d.id) } },
				})) as any;
				console.log(
					`PROBE ${d.fullName}: sent=${JSON.stringify(tags)} hooked=${JSON.stringify(hooked?.triageTags)} rawdb=${JSON.stringify(raw?.triageTags)} tier-control=${JSON.stringify(hooked?.tier)}`,
				);
			}
			// Read-back every 25th write (sampled proof against silent drops).
			if (written % 25 === 0) {
				const check = (await payload.findByID({
					collection: "repos",
					id: String(d.id),
					depth: 0,
					// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
				})) as any;
				const got: string[] = Array.isArray(check?.triageTags)
					? check.triageTags
					: [];
				if (!(got.length === tags.length && tags.every((t) => got.includes(t)))) {
					mismatches += 1;
					console.error(`  ✗ read-back mismatch ${d.fullName}`);
				}
			}
			written += 1;
		}
		if (!res.hasNextPage) break;
		page += 1;
	}

	console.log(`\nswept ${seen} repos`);
	console.log(
		`${EXECUTE ? "tagged" : "would tag"}: ${wouldTag} · cleared (came back to life): ${cleared} · read-back mismatches: ${mismatches}`,
	);
	for (const [t, n] of [...tagCounts.entries()].sort((a, b) => b[1] - a[1]))
		console.log(`  ${t}: ${n}`);

	if (mismatches > 0) return 1;
	if (seen > 5000 && wouldTag === 0 && cleared === 0) {
		// A corpus this size with ZERO triage changes means derivation broke,
		// not that 12k repos are all pristine.
		console.error("RED: zero-work sweep over a corpus known to contain dead tail");
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
