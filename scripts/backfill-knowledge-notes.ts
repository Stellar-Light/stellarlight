/**
 * Stamp curated knowledge notes onto their repo rows — directly from the
 * registry, zero GitHub calls.
 *
 * The enrich loop only writes knowledgeNotes for PROJECT-LINKED repos (the
 * third instance of the project-scoped-writer class, found 2026-08-16:
 * sushi-labs/sushiswap enriched "success" with zero notes stamped). This
 * backfill covers every registry-keyed repo regardless of linkage, with the
 * same audits crosslink enrich would build.
 *
 *   pnpm exec tsx scripts/backfill-knowledge-notes.ts             # dry run
 *   pnpm exec tsx scripts/backfill-knowledge-notes.ts --execute   # write
 */
import "./load-env";

import { getPayload } from "payload";
import {
	type AuditRecord,
	buildKnowledgeNotes,
	REPO_KNOWLEDGE_NOTES,
} from "../src/lib/repo-knowledge";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

async function main(): Promise<number> {
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
	const payload = await getPayload({ config: await configPromise });

	let stamped = 0;
	let same = 0;
	let missing = 0;
	let mismatches = 0;

	for (const key of Object.keys(REPO_KNOWLEDGE_NOTES)) {
		const res = await payload.find({
			collection: "repos",
			where: { fullName: { equals: key } },
			limit: 1,
			depth: 0,
			context: { internal: true },
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		const d = res.docs[0] as any;
		if (!d) {
			console.log(`  missing row: ${key}`);
			missing += 1;
			continue;
		}
		const slug: string | null = d.projectSlug ? String(d.projectSlug) : null;
		const auditsByProject = new Map<string, AuditRecord[]>();
		if (slug) {
			const ares = await payload.find({
				collection: "audits",
				where: { projectSlug: { equals: slug } },
				limit: 100,
				depth: 0,
			});
			auditsByProject.set(
				slug,
				// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
				(ares.docs as any[]).map((a) => ({
					projectSlug: slug,
					auditor: a.auditor ? String(a.auditor) : null,
					publishedAt: a.publishedAt ? String(a.publishedAt) : null,
				})),
			);
		}
		const notes = buildKnowledgeNotes(
			String(d.fullName),
			slug,
			auditsByProject,
			{
				lastCommitAt: d.lastCommitAt ?? null,
				codeInUse: d.codeInUse ?? null,
			},
		);
		const cur = JSON.stringify(
			// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
			(d.knowledgeNotes ?? []).map((n: any) => n.note),
		);
		const next = JSON.stringify(notes.map((n) => n.note));
		if (cur === next) {
			same += 1;
			continue;
		}
		console.log(
			`  ${d.fullName}: ${(d.knowledgeNotes ?? []).length} → ${notes.length} notes`,
		);
		if (!EXECUTE) continue;
		await payload.update({
			collection: "repos",
			id: String(d.id),
			data: { knowledgeNotes: notes },
		});
		const check = (await payload.findByID({
			collection: "repos",
			id: String(d.id),
			depth: 0,
			context: { internal: true },
			// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		})) as any;
		if ((check?.knowledgeNotes ?? []).length !== notes.length) {
			mismatches += 1;
			console.error(`  ✗ read-back mismatch ${d.fullName}`);
		}
		stamped += 1;
	}

	console.log(
		`\nregistry keys: ${Object.keys(REPO_KNOWLEDGE_NOTES).length} · ${EXECUTE ? "stamped" : "would stamp"}: ${stamped || "(dry)"} · unchanged: ${same} · missing rows: ${missing} · mismatches: ${mismatches}`,
	);
	return mismatches > 0 ? 1 : 0;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
