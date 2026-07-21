/**
 * Decode raw HTML entities in research-doc titles already in the corpus.
 *
 *   node --env-file=.env.local --import tsx scripts/fix-research-entity-titles.ts          # DRY RUN
 *   node --env-file=.env.local --import tsx scripts/fix-research-entity-titles.ts --apply  # write
 *
 * The corpus-health S6 sweep flagged research docs whose titles carry raw
 * entities — "The Stellar Development Foundation&#x27;s 2023 Strategy",
 * "Payments &amp; Anchors" — because the ingesters extracted <title>/og:title
 * text but never decoded it. A title is the citation an agent SHOWS, so a raw
 * `&#x27;` is a visible defect and it splits keyword matching ("foundation's" ≠
 * "foundation&#x27;s"). The ingester now decodes at write time
 * (src/lib/decode-entities.ts, shared); this back-fills the existing rows.
 *
 * SAFE by construction: the ONLY change is decodeHtmlEntities on the title, and
 * a row is planned ONLY when decoding produces a DIFFERENT, non-empty string —
 * so a title with no entities (or an unknown reference the decoder leaves
 * verbatim) is never touched. Content is never altered. Dry run prints every
 * planned change for review; --apply writes with per-row isolation.
 */

import config from "@payload-config";
import { config as loadEnv } from "dotenv";
import { getPayload } from "payload";
import { decodeHtmlEntities } from "../src/lib/decode-entities";

loadEnv({ path: ".env.local" });

const APPLY = process.argv.includes("--apply");
const PAGE = 500;

// Only rows whose title actually holds a character reference are candidates —
// the same shape the decoder acts on (numeric decimal/hex or a named ref).
const ENTITY_RE = /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/;

function selfCheck() {
	const cases: Array<[string, string]> = [
		["Foundation&#x27;s Strategy", "Foundation's Strategy"],
		["Payments &amp; Anchors", "Payments & Anchors"],
		["no entities", "no entities"],
	];
	for (const [input, want] of cases) {
		const got = decodeHtmlEntities(input);
		if (got !== want)
			throw new Error(`selfCheck: decode("${input}") = "${got}" != "${want}"`);
	}
}

async function main() {
	selfCheck();
	console.log(
		`Research entity-title fix — ${APPLY ? "APPLY (writes)" : "DRY RUN"}`,
	);
	const payload = await getPayload({ config });

	const plan: Array<{ id: string; from: string; to: string; url: string }> = [];
	let page = 1;
	let scanned = 0;
	for (;;) {
		const res = await payload.find({
			collection: "research-docs",
			// Push the entity filter into the query so we only pull candidates.
			where: { title: { like: "&" } },
			limit: PAGE,
			page,
			depth: 0,
			select: { title: true, url: true },
			overrideAccess: true,
		});
		for (const d of res.docs as Array<{
			id: string;
			title?: string;
			url?: string;
		}>) {
			scanned++;
			const from = String(d.title ?? "");
			if (!ENTITY_RE.test(from)) continue;
			const to = decodeHtmlEntities(from);
			// Only when decoding actually changed it to a non-empty string.
			if (to === from || !to.trim()) continue;
			plan.push({ id: d.id, from, to, url: String(d.url ?? "") });
		}
		if (!res.hasNextPage) break;
		page++;
	}

	console.log(
		`\nScanned ${scanned} candidate row(s) (title contains '&'); ${plan.length} to decode.\n`,
	);
	// Group by source title for a compact review (titles repeat across chunks);
	// decode is deterministic, so `from` alone keys the pair.
	const byTitle = new Map<string, { to: string; n: number }>();
	for (const p of plan) {
		const g = byTitle.get(p.from) ?? { to: p.to, n: 0 };
		g.n++;
		byTitle.set(p.from, g);
	}
	for (const [from, g] of byTitle) {
		console.log(`  [${g.n}x] "${from}"\n        -> "${g.to}"`);
	}

	if (!APPLY) {
		console.log(
			`\nDRY RUN — no writes. ${plan.length} row(s) across ${byTitle.size} distinct title(s). Re-run with --apply to write.`,
		);
		return;
	}

	let applied = 0;
	const failed: Array<{ id: string; error: string }> = [];
	for (const p of plan) {
		try {
			await payload.update({
				collection: "research-docs",
				id: p.id,
				data: { title: p.to },
				overrideAccess: true,
			});
			applied++;
		} catch (err) {
			failed.push({ id: p.id, error: String(err) });
		}
	}
	console.log(
		`\nDONE: ${applied}/${plan.length} written; ${failed.length} failed.`,
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
