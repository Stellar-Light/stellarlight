/**
 * Corpus coverage check (sls-055 / #533) — the CLASS guard for canonical
 * page families.
 *
 *   pnpm exec tsx scripts/eval/corpus-coverage-check.ts [--json] [--out=path]
 *
 * For every row in the CANONICAL_PAGES registry (src/lib/canonical-pages.ts)
 * this asserts the corpus actually carries the page: ≥1 research-docs chunk
 * whose `url` matches the row's canonical URL AND, for EACH registered
 * signature phrase, ≥1 of those chunks whose content contains it
 * (case-insensitive). A family member going missing, a page moving, or a
 * renderer change that drops the quotable wording ("self-funded, pays taxes",
 * "a Delaware non-profit corporation", "portfolio totaling over $100m")
 * fails the row — the weekly tracker goes red WITHOUT waiting for a
 * downstream consumer filing (the sls-020 → sls-055 lesson: patching one
 * family member and stopping leaves the class open).
 *
 * DB-backed (research-docs has no public listing endpoint), read-only,
 * report-only — same access pattern as engine-b-corpus.ts. Runs weekly in
 * engine-c-health.yml (continue-on-error; the Engine C report renders the
 * section and reds the run on failures).
 *
 * Exit codes: 0 all rows covered, 1 any row failed, 2 no DB credentials.
 */
import { writeFileSync } from "node:fs";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import { CANONICAL_PAGES } from "../../src/lib/canonical-pages";
import configPromise from "../../src/payload.config";

const JSON_OUT = process.argv.includes("--json");
const OUT_FILE = process.argv
	.find((x) => x.startsWith("--out="))
	?.slice("--out=".length);

interface RowResult {
	id: string;
	family: string;
	source: string;
	url: string;
	ingestedBy: string;
	chunkCount: number;
	missingSignatures: string[];
	status: "OK" | "MISSING_PAGE" | "MISSING_SIGNATURE";
}

const normUrl = (u: string) => (u ?? "").replace(/\/+$/, "").toLowerCase();

async function run() {
	if (!process.env.DATABASE_URI) {
		const msg =
			"corpus-coverage-check: no DATABASE_URI — cannot inspect the corpus (degraded)";
		if (JSON_OUT || OUT_FILE) {
			const out = JSON.stringify({ degraded: true, reason: msg }, null, 2);
			if (OUT_FILE) writeFileSync(OUT_FILE, out);
			if (JSON_OUT) console.log(out);
		} else {
			console.error(msg);
		}
		process.exit(2);
	}

	const payload = await getPayload({ config: configPromise });
	const rows: RowResult[] = [];

	for (const page of CANONICAL_PAGES) {
		// Match on the URL prefix-free equality (trailing-slash tolerant) but
		// query broadly by the row's exact stored URL first — every ingester
		// writes the registry URL verbatim.
		const found = await payload.find({
			collection: "research-docs",
			where: {
				and: [
					{ source: { equals: page.source } },
					{ url: { equals: page.url } },
				],
			},
			limit: 200,
			depth: 0,
			select: { url: true, content: true },
			overrideAccess: true,
		});
		let docs = found.docs as unknown as Array<{ url: string; content: string }>;
		if (docs.length === 0) {
			// Trailing-slash / case drift fallback: scan the source's URLs.
			const all = await payload.find({
				collection: "research-docs",
				where: { source: { equals: page.source } },
				limit: 10_000,
				depth: 0,
				select: { url: true, content: true },
				overrideAccess: true,
			});
			docs = (
				all.docs as unknown as Array<{ url: string; content: string }>
			).filter((d) => normUrl(d.url) === normUrl(page.url));
		}

		if (docs.length === 0) {
			rows.push({
				id: page.id,
				family: page.family,
				source: page.source,
				url: page.url,
				ingestedBy: page.ingestedBy,
				chunkCount: 0,
				missingSignatures: [...page.signatures],
				status: "MISSING_PAGE",
			});
			continue;
		}

		const union = docs
			.map((d) => d.content ?? "")
			.join("\n")
			.toLowerCase();
		const missing = page.signatures.filter(
			(s) => !union.includes(s.toLowerCase()),
		);
		rows.push({
			id: page.id,
			family: page.family,
			source: page.source,
			url: page.url,
			ingestedBy: page.ingestedBy,
			chunkCount: docs.length,
			missingSignatures: missing,
			status: missing.length ? "MISSING_SIGNATURE" : "OK",
		});
	}

	const failed = rows.filter((r) => r.status !== "OK");
	const report = {
		generatedAt: new Date().toISOString(),
		total: rows.length,
		ok: rows.length - failed.length,
		failed: failed.length,
		rows,
	};

	const json = JSON.stringify(report, null, 2);
	if (OUT_FILE) writeFileSync(OUT_FILE, json);
	if (JSON_OUT) {
		console.log(json);
	} else {
		console.log(
			`\nCorpus coverage — canonical page families (${report.ok}/${report.total} OK)\n${"─".repeat(72)}`,
		);
		for (const r of rows) {
			const icon = r.status === "OK" ? "✓" : "✗";
			const detail =
				r.status === "OK"
					? `${r.chunkCount} chunk(s)`
					: r.status === "MISSING_PAGE"
						? `NO chunks for url (${r.ingestedBy})`
						: `signature(s) missing: ${r.missingSignatures.map((s) => `"${s}"`).join(", ")}`;
			console.log(
				`${icon} ${r.id.padEnd(32)} [${r.family}/${r.source}] ${detail}`,
			);
		}
	}

	process.exit(failed.length ? 1 : 0);
}

run().catch((e) => {
	console.error("FATAL:", e);
	process.exit(1);
});
