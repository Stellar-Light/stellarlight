/**
 * S8 mirrored-content repair: one contentHash under >1 distinct URL.
 *
 *   pnpm exec tsx scripts/fix-corpus-mirrors.ts             # DRY RUN (default)
 *   pnpm exec tsx scripts/fix-corpus-mirrors.ts --execute   # delete + read back
 *
 * Grouping and classification live in src/lib/corpus-mirrors.ts — the same
 * mirrorGroups() the corpus-health sweep (scripts/eval/engine-b-corpus.ts)
 * reports from, so what this script sees is exactly what the guard counts.
 *
 * Dispositions (see corpus-mirrors.ts):
 *   republication        → ACTIONABLE: drop the mirror URL's chunks, keep the
 *                          canonical. Requires POSITIVE proof (HTTP redirect
 *                          from mirror → canonical, or mirror dead + canonical
 *                          live). Probed live in dry-run too, so the printed
 *                          plan is the executed plan.
 *   template-siblings /
 *   boilerplate-overlap /
 *   ambiguous            → ENUMERATED ONLY, never touched. Distinct documents
 *                          sharing text (template READMEs, identical release
 *                          notes, SEP-6/24 guide pages) are real docs; deleting
 *                          any of them erases a document's existence.
 *
 * SAFE by construction: deletes only whole-doc-identical same-source pairs
 * with proof; every delete is read back (row must be GONE) and the kept URL's
 * chunks are re-counted after; exit 1 on any mismatch.
 */

import "./load-env";
import config from "@payload-config";
import { getPayload } from "payload";
import {
	mirrorComponents,
	classifyMirrorComponent,
	digitSiblingPaths,
	mirrorGroups,
	type UrlProbe,
} from "../src/lib/corpus-mirrors";

const EXECUTE = process.argv.includes("--execute");
const PAGE = 1000;

async function probe(url: string): Promise<UrlProbe> {
	try {
		const res = await fetch(url, {
			method: "HEAD",
			redirect: "follow",
			headers: { "User-Agent": "stellarlight-scout-ingest" },
		});
		// Some hosts 405 HEAD — retry as GET (body discarded).
		if (res.status === 405) {
			const g = await fetch(url, {
				redirect: "follow",
				headers: { "User-Agent": "stellarlight-scout-ingest" },
			});
			return { status: g.status, finalUrl: g.url };
		}
		return { status: res.status, finalUrl: res.url };
	} catch {
		return { status: 0, finalUrl: url }; // unreachable ≠ dead — no proof
	}
}

function selfCheck() {
	// digit-sibling slugs are never a republication pair.
	if (
		!digitSiblingPaths(
			"https://g.com/r/releases/tag/v22.0.10",
			"https://g.com/r/releases/tag/v23.5.2",
		)
	)
		throw new Error("selfCheck: digitSiblingPaths missed release tags");
	// redirect proof picks the canonical.
	const byUrl = new Map([
		[
			"https://s.org/blog/a-old",
			{ source: "sdf-blog", hashes: new Set(["h1"]) },
		],
		[
			"https://s.org/blog/a-new",
			{ source: "sdf-blog", hashes: new Set(["h1"]) },
		],
	]);
	const d = classifyMirrorComponent(
		["https://s.org/blog/a-old", "https://s.org/blog/a-new"],
		byUrl,
		new Map([
			[
				"https://s.org/blog/a-old",
				{ status: 200, finalUrl: "https://s.org/blog/a-new" },
			],
			[
				"https://s.org/blog/a-new",
				{ status: 200, finalUrl: "https://s.org/blog/a-new" },
			],
		]),
	);
	if (d.kind !== "republication" || d.keep !== "https://s.org/blog/a-new")
		throw new Error(`selfCheck: redirect proof failed (${JSON.stringify(d)})`);
	console.log("self-check ok\n");
}

async function main() {
	selfCheck();
	console.log(
		`Corpus mirror repair (S8) — ${EXECUTE ? "EXECUTE (deletes + read-backs)" : "DRY RUN"}`,
	);
	const payload = await getPayload({ config });

	const rows: Array<{
		id: string | number;
		url: string;
		source: string;
		contentHash?: string | null;
	}> = [];
	for (let page = 1; ; page++) {
		const res = await payload.find({
			collection: "research-docs",
			limit: PAGE,
			page,
			depth: 0,
			select: { url: true, source: true, contentHash: true },
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: narrow select shape
		rows.push(...(res.docs as any[]));
		if (!res.hasNextPage) break;
	}

	const groups = mirrorGroups(rows);
	console.log(
		`Scanned ${rows.length} chunks — ${groups.length} mirrored hash group(s) (the sweep's S8 count).\n`,
	);

	const components = mirrorComponents(rows);

	// Per-URL doc shape (all chunks, mirrored or not — whole-doc identity).
	const byUrl = new Map<string, { source: string; hashes: Set<string> }>();
	const idsByUrl = new Map<string, Array<string | number>>();
	for (const r of rows) {
		const d = byUrl.get(r.url) ?? { source: r.source, hashes: new Set() };
		if (r.contentHash) d.hashes.add(r.contentHash);
		byUrl.set(r.url, d);
		idsByUrl.set(r.url, [...(idsByUrl.get(r.url) ?? []), r.id]);
	}

	// Probe only the pairs that could be republications (2-URL, same source,
	// not digit-siblings) — a handful of requests, not hundreds.
	const probes = new Map<string, UrlProbe>();
	for (const urls of components) {
		if (urls.length !== 2) continue;
		const [a, b] = urls;
		if (byUrl.get(a)?.source !== byUrl.get(b)?.source) continue;
		if (digitSiblingPaths(a, b)) continue;
		for (const u of urls) if (!probes.has(u)) probes.set(u, await probe(u));
	}

	const tally: Record<string, number> = {};
	const drops: Array<{ url: string; keep: string; reason: string }> = [];
	for (const urls of [...components].sort(
		(x, y) => y.length - x.length,
	)) {
		const groupHashes = groups.filter((g) =>
			g.urls.some((u) => urls.includes(u)),
		);
		const disp = classifyMirrorComponent(urls, byUrl, probes);
		tally[disp.kind] = (tally[disp.kind] ?? 0) + 1;
		console.log(
			`  [${disp.kind}] ${groupHashes.length} shared hash(es) — ${disp.reason}`,
		);
		for (const u of urls) {
			const mark =
				disp.kind === "republication"
					? u === disp.keep
						? "KEEP  "
						: "DELETE"
					: "keep  ";
			console.log(
				`      ${mark} ${u} (${idsByUrl.get(u)?.length ?? 0} chunks)`,
			);
		}
		if (disp.kind === "republication")
			drops.push({ url: disp.drop, keep: disp.keep, reason: disp.reason });
	}

	console.log(
		`\nDispositions: ${Object.entries(tally)
			.map(([k, n]) => `${k}=${n}`)
			.join("  ")}`,
	);
	const dropRows = drops.reduce(
		(s, d) => s + (idsByUrl.get(d.url)?.length ?? 0),
		0,
	);
	console.log(
		`Actionable: ${drops.length} mirror URL(s) → ${dropRows} chunk row(s) to delete. Everything else is enumerated only.`,
	);

	if (!EXECUTE) {
		console.log("\nDRY RUN — no deletes. Re-run with --execute to apply.");
		return;
	}

	let deleted = 0;
	const failed: Array<{ id: string | number; error: string }> = [];
	for (const d of drops) {
		for (const id of idsByUrl.get(d.url) ?? []) {
			try {
				await payload.delete({
					collection: "research-docs",
					id,
					overrideAccess: true,
				});
				let still: unknown = null;
				try {
					still = await payload.findByID({
						collection: "research-docs",
						id,
						depth: 0,
						overrideAccess: true,
						disableErrors: true,
					});
				} catch {
					still = null;
				}
				if (still) throw new Error("read-back: row still present");
				deleted++;
			} catch (err) {
				failed.push({ id, error: String(err) });
			}
		}
		// The kept URL must still hold its chunks — prove it with a count.
		const keptCount = await payload.count({
			collection: "research-docs",
			where: { url: { equals: d.keep } },
			overrideAccess: true,
		});
		console.log(
			`  kept ${d.keep}: ${keptCount.totalDocs} chunk(s) still present`,
		);
		if (keptCount.totalDocs === 0)
			failed.push({ id: d.keep, error: "kept URL has 0 chunks after repair" });
	}
	console.log(
		`\nDONE: ${deleted}/${dropRows} mirror rows deleted + verified gone; ${failed.length} failed.`,
	);
	for (const f of failed) console.log(`  FAILED ${f.id}: ${f.error}`);
	if (failed.length) process.exitCode = 1;
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
