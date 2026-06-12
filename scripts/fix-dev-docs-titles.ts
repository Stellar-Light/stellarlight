/**
 * Fix junky titles on dev-docs chunks already in the corpus.
 *
 *   node --env-file=.env.local --import tsx scripts/fix-dev-docs-titles.ts          # DRY RUN
 *   node --env-file=.env.local --import tsx scripts/fix-dev-docs-titles.ts --apply  # write
 *
 * The dev-docs ingester stamped every chunk of a page with that page's <title>.
 * Listing/archive pages (tag indexes, dated meeting pages, section indexes)
 * have nav titles — "58 posts tagged developer", "2026-04-16", "Meeting Notes"
 * — so real content (e.g. the x402/MPP explainer) ends up under a useless
 * title. A retrieved chunk's title is the citation/artifact an agent shows, so
 * a junk title degrades the answer even when the content is gold.
 *
 * The ingester now salvages titles at write time; this back-fills existing rows:
 *   RETITLE — junky title + a real `section` heading → set title = section
 *             (non-destructive; the content is untouched).
 *   DELETE  — /tags/ aggregation pages: their content is a verbatim duplicate
 *             of the canonical page we already keep, so they're pure dupes.
 *
 * Dry run prints both buckets for review before --apply. RETITLE never loses
 * content; DELETE only removes exact-duplicate aggregation rows.
 */

import config from "@payload-config";
import { config as loadEnv } from "dotenv";
import { getPayload } from "payload";

loadEnv({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const PAGE = 500;

function isJunkyDocTitle(t: string): boolean {
	const s = t.trim();
	return (
		s.length < 3 ||
		/^\d{4}-\d{2}-\d{2}$/.test(s) ||
		/^\d+\s+posts?\s+tagged/i.test(s) ||
		/^meeting notes$/i.test(s)
	);
}

function firstHeading(body: string): string | null {
	const m = body.match(/^#{1,6}\s+(.+)$/m);
	if (!m) return null;
	return m[1].trim().replace(/​/g, "").trim() || null;
}

function selfCheck() {
	const junky = [
		"2026-04-16",
		"58 posts tagged developer",
		"Meeting Notes",
		"",
	];
	const ok = [
		"x402 on Stellar",
		"SEP-24: Hosted Deposit and Withdrawal",
		"Agentic Payments",
	];
	const badJunky = junky.filter((t) => !isJunkyDocTitle(t));
	const badOk = ok.filter((t) => isJunkyDocTitle(t));
	if (badJunky.length || badOk.length) {
		console.error("SELF-CHECK FAILED — refusing to run.", { badJunky, badOk });
		process.exit(1);
	}
	console.log("self-check ok\n");
}

async function main() {
	selfCheck();
	const payload = await getPayload({ config });

	const retitle: Array<{ id: string; from: string; to: string }> = [];
	const deletes: Array<{ id: string; url: string; title: string }> = [];
	let scanned = 0;
	let page = 1;

	for (;;) {
		const res = await payload.find({
			collection: "research-docs",
			where: { source: { equals: "dev-docs" } },
			limit: PAGE,
			page,
			depth: 0,
			select: { title: true, section: true, url: true, content: true },
		});
		for (const doc of res.docs) {
			scanned++;
			// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
			const d = doc as any;
			const url = String(d.url ?? "");
			const title = String(d.title ?? "");

			// Aggregation/index pages — tag indexes and the meetings index (incl.
			// paginated). Their chunks are verbatim dupes of the canonical
			// individual pages we keep, so retitling them just makes duplicate
			// results; delete instead.
			const isAggregation =
				url.includes("/tags/") ||
				/\/meetings\/?$/.test(url) ||
				/\/meetings\/page\//.test(url);
			if (isAggregation) {
				deletes.push({ id: d.id, url, title: title.slice(0, 40) });
				continue;
			}
			if (isJunkyDocTitle(title)) {
				const section = String(d.section ?? "").trim();
				const candidate =
					section && !isJunkyDocTitle(section)
						? section
						: firstHeading(String(d.content ?? ""));
				// Only retitle to a genuinely descriptive title — never swap one
				// junk title (generic) for another (a bare date).
				if (candidate && candidate !== title && !isJunkyDocTitle(candidate)) {
					retitle.push({ id: d.id, from: title, to: candidate.slice(0, 70) });
				}
			}
		}
		if (!res.hasNextPage) break;
		page++;
	}

	console.log(`Scanned ${scanned} dev-docs chunks`);
	console.log(
		`  RETITLE: ${retitle.length}   DELETE(/tags/): ${deletes.length}\n`,
	);

	console.log("RETITLE sample:");
	for (const r of retitle.slice(0, 20)) {
		console.log(`  "${r.from}"  →  "${r.to}"`);
	}
	console.log("\nDELETE sample (/tags/ aggregation dupes):");
	for (const d of deletes.slice(0, 12)) {
		console.log(`  [${d.title}] ${d.url}`);
	}

	if (!APPLY) {
		console.log(
			`\nDRY RUN — re-run with --apply to retitle ${retitle.length} and delete ${deletes.length}.`,
		);
		process.exit(0);
	}

	let retitled = 0;
	for (const r of retitle) {
		try {
			await payload.update({
				collection: "research-docs",
				id: r.id,
				data: { title: r.to },
				overrideAccess: true,
				depth: 0,
			});
			retitled++;
		} catch (e) {
			console.error(
				`  retitle failed ${r.id}:`,
				e instanceof Error ? e.message : e,
			);
		}
	}
	let removed = 0;
	for (const d of deletes) {
		try {
			await payload.delete({
				collection: "research-docs",
				id: d.id,
				overrideAccess: true,
			});
			removed++;
		} catch (e) {
			console.error(
				`  delete failed ${d.id}:`,
				e instanceof Error ? e.message : e,
			);
		}
	}
	console.log(
		`\nDone. Retitled ${retitled}/${retitle.length}, deleted ${removed}/${deletes.length}.`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
