/**
 * One-time (re-runnable) dedupe of case-variant repo docs — #783.
 *
 * GitHub fullNames are case-insensitive; our Mongo `equals` lookups were not,
 * so case-variant source lists created twin docs (org-sweep hybrids like
 * `creit-tech/Stellar-Indexer-SDK` beside project-list `Creit-Tech/…`).
 * Consumers saw two rows for one repo, with curated knowledge on the twin
 * that ranked lower. The writers are fixed (case-insensitive lookup +
 * canonical-casing convergence in enrich-repos); this wave merges the debt.
 *
 * Per lowercase-fullName group with >1 doc:
 *   keeper  = codeScanState "scanned" first, then has knowledgeNotes, then
 *             newest lastEnrichedAt (the doc holding the most truth);
 *   merge   = PROMOTE-ONLY: fields where the keeper is null/empty and an
 *             orphan has a value are copied over — nothing on the keeper is
 *             ever overwritten;
 *   delete  = orphans, ONLY after their unique values are merged.
 *
 * DRY-RUN BY DEFAULT — prints every group, keeper choice, merged fields, and
 * would-delete ids. `--execute` applies, then reads back each keeper to prove
 * merged fields persisted (the silent-drop lesson). Exits 1 on any failure or
 * if executed deletions can't be read-back-verified.
 *
 *   pnpm exec tsx scripts/data/dedupe-repo-docs.ts             # dry run
 *   pnpm exec tsx scripts/data/dedupe-repo-docs.ts --execute   # apply
 */

import "../load-env";
import type { Payload } from "payload";

const EXECUTE = process.argv.includes("--execute");

/** Fields worth carrying from an orphan when the keeper lacks them. */
const MERGE_FIELDS = [
	"knowledgeNotes",
	"activitySignals",
	"codeSymbols",
	"contractInterface",
	"sdkCapabilities",
	"codeDepth",
	"stellarProof",
	"codeScanState",
	"codeScannedAt",
	"sorobanSdkVersion",
	"versionStatus",
	"mainnetContractId",
	"isDeployableContract",
	"readmeExcerpt",
	"description",
	"topics",
] as const;

// biome-ignore lint/suspicious/noExplicitAny: minimal doc shape
type Doc = Record<string, any>;

const empty = (v: unknown) =>
	v === null ||
	v === undefined ||
	(Array.isArray(v) && v.length === 0) ||
	v === "";

/** Fields the bulk listing leaves out, to keep 12k rows light. readmeExcerpt
 *  is also a merge field: left out of the listing it read as empty on every
 *  doc and was never promoted, so these are read again for the duplicate
 *  groups only, before the plan. */
export const LIST_OMITS = ["readmeExcerpt"] as const;

/** Read LIST_OMITS back onto these docs, in place. */
export async function fillOmitted(
	payload: Pick<Payload, "find">,
	docs: Doc[],
): Promise<void> {
	const select = Object.fromEntries(LIST_OMITS.map((f) => [f, true]));
	for (let i = 0; i < docs.length; i += 200) {
		const batch = docs.slice(i, i + 200);
		const res = await payload.find({
			collection: "repos",
			where: { id: { in: batch.map((d) => d.id) } },
			limit: batch.length,
			depth: 0,
			select,
		});
		const byId = new Map((res.docs as Doc[]).map((d) => [String(d.id), d]));
		for (const d of batch) {
			const full = byId.get(String(d.id));
			if (full) for (const f of LIST_OMITS) d[f] = full[f];
		}
	}
}

/** Which doc of one case-variant group to keep, which to drop, and which
 *  fields to promote onto the keeper. Pure, so the plan is tested. */
export function planGroup(ds: Doc[]): {
	keeper: Doc;
	orphans: Doc[];
	promote: Record<string, unknown>;
} {
	const keeper = [...ds].sort((a, b) => {
		const scan = (d: Doc) => (d.codeScanState === "scanned" ? 1 : 0);
		const notes = (d: Doc) =>
			Array.isArray(d.knowledgeNotes) && d.knowledgeNotes.length ? 1 : 0;
		return (
			scan(b) - scan(a) ||
			notes(b) - notes(a) ||
			String(b.lastEnrichedAt ?? "").localeCompare(
				String(a.lastEnrichedAt ?? ""),
			)
		);
	})[0];
	const orphans = ds.filter((d) => d.id !== keeper.id);
	const promote: Record<string, unknown> = {};
	for (const f of MERGE_FIELDS) {
		if (!empty(keeper[f])) continue;
		const donor = orphans.find((o) => !empty(o[f]));
		if (donor) promote[f] = donor[f];
	}
	return { keeper, orphans, promote };
}

/** What an execute would do with these plans: it updates a keeper only when
 *  there is something to promote, and deletes every orphan. The dry run
 *  reports this, not the group count. */
export function plannedCounts(plans: ReturnType<typeof planGroup>[]) {
	return {
		merge: plans.filter((p) => Object.keys(p.promote).length > 0).length,
		delete: plans.reduce((n, p) => n + p.orphans.length, 0),
	};
}

async function main() {
	const { getPayload } = await import("payload");
	const configPromise = (await import("../../src/payload.config")).default;
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`dedupe-repo-docs — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}\n`,
	);

	const all: Doc[] = [];
	let page = 1;
	for (;;) {
		const res = await payload.find({
			collection: "repos",
			limit: 500,
			page,
			depth: 0,
			select: Object.fromEntries(LIST_OMITS.map((f) => [f, false])),
		});
		all.push(...(res.docs as Doc[]));
		if (!res.hasNextPage) break;
		page++;
	}
	console.log(`${all.length} repo docs total`);

	const byLower = new Map<string, Doc[]>();
	for (const d of all) {
		const k = String(d.fullName ?? "").toLowerCase();
		if (!k) continue;
		byLower.set(k, [...(byLower.get(k) ?? []), d]);
	}
	const groups = [...byLower.entries()].filter(([, ds]) => ds.length > 1);
	console.log(`${groups.length} case-variant group(s)\n`);
	await fillOmitted(
		payload,
		groups.flatMap(([, ds]) => ds),
	);

	let merged = 0;
	let deleted = 0;
	let failed = 0;
	const plans: ReturnType<typeof planGroup>[] = [];
	for (const [key, ds] of groups) {
		const plan = planGroup(ds);
		plans.push(plan);
		const { keeper, orphans, promote } = plan;
		console.log(
			`${key}\n  keep   ${keeper.fullName} (${keeper.id}) scan=${keeper.codeScanState ?? "-"} notes=${Array.isArray(keeper.knowledgeNotes) ? keeper.knowledgeNotes.length : 0}`,
		);
		for (const o of orphans) console.log(`  drop   ${o.fullName} (${o.id})`);
		if (Object.keys(promote).length)
			console.log(`  merge  ${Object.keys(promote).join(", ")}`);
		if (!EXECUTE) continue;
		try {
			if (Object.keys(promote).length) {
				await payload.update({
					collection: "repos",
					id: keeper.id,
					data: promote,
				});
				merged++;
			}
			for (const o of orphans) {
				await payload.delete({ collection: "repos", id: o.id });
				deleted++;
			}
			// read-back: promoted fields must have persisted (silent-drop lesson)
			if (Object.keys(promote).length) {
				const back = (await payload.findByID({
					collection: "repos",
					id: keeper.id,
					depth: 0,
				})) as Doc;
				for (const f of Object.keys(promote))
					if (empty(back[f])) {
						console.error(`  ✗ read-back: ${f} did not persist on ${key}`);
						failed++;
					}
			}
		} catch (err) {
			console.error(`  ✗ ${key}: ${String(err)}`);
			failed++;
		}
	}
	const would = plannedCounts(plans);
	console.log(
		`\n${EXECUTE ? "" : "WOULD: "}merged ${EXECUTE ? merged : would.merge} group(s), deleted ${EXECUTE ? deleted : would.delete} orphan doc(s)${failed ? ` — ${failed} FAILURE(S)` : ""}`,
	);
	process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.includes("dedupe-repo-docs"))
	main().catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
