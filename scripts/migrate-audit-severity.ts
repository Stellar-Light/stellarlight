/**
 * One-shot migration: re-tag severity on every existing audit chunk.
 *
 * The first audit ingest wrote severity="unknown" for ~all chunks
 * because the threshold was too conservative (required ≥2 mentions).
 * The updated inferSeverityFromBody (two-tier — explicit labels need
 * only 1 hit, ambient phrases need ≥2) recovers ~117 tags on the same
 * content. Since chunk text is unchanged, this is a pure metadata
 * update — no Voyage cost, no re-embed.
 *
 * Idempotent — running again is a no-op once severity matches.
 *
 * Usage:
 *   pnpm exec tsx scripts/migrate-audit-severity.ts          # dry run
 *   pnpm exec tsx scripts/migrate-audit-severity.ts --execute
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import type { AuditSeverity } from "../src/lib/research-ingest";
import configPromise from "../src/payload.config";

const execute = process.argv.includes("--execute");

// NOTE: severity logic intentionally duplicated from ingest-soroban-security.ts.
// We can't import from there because that module runs its own ingest at the
// top level (no module-vs-script guard). Keep both copies in sync when the
// patterns change.
function inferSeverityFromBody(content: string): AuditSeverity {
	const c = content;
	const count = (re: RegExp) => (c.match(re) || []).length;
	type Sev = Exclude<AuditSeverity, "unknown">;
	const dbl = (word: string) =>
		word
			.split("")
			.map((c) => c + c)
			.join("");
	const explicit: Record<Sev, () => number> = {
		critical: () =>
			count(/\bseverity\s*:?\s*critical\b/gi) +
			count(/\bcritical\s*[-]?\s*severity\b/gi) +
			count(/\b(?:rating|category)\s+of\s+critical\b/gi) +
			count(/\/\/\s*CRITICAL\b/g) +
			count(new RegExp(`\\b${dbl("critical")}\\b`, "gi")) +
			count(/\[C-?\d+\]/g),
		high: () =>
			count(/\bseverity\s*:?\s*high\b/gi) +
			count(/\bhigh\s*[-]?\s*severity\b/gi) +
			count(/\b(?:rating|category)\s+of\s+high\b/gi) +
			count(/\/\/\s*HIGH\b/g) +
			count(new RegExp(`\\b${dbl("high")}\\b`, "gi")) +
			count(/\[H-?\d+\]/g),
		medium: () =>
			count(/\bseverity\s*:?\s*med(?:ium)?\b/gi) +
			count(/\bmed(?:ium)?\s*[-]?\s*severity\b/gi) +
			count(/\b(?:rating|category)\s+of\s+med(?:ium)?\b/gi) +
			count(/\/\/\s*MEDIUM\b/g) +
			count(new RegExp(`\\b${dbl("medium")}\\b`, "gi")) +
			count(/\[M-?\d+\]/g),
		low: () =>
			count(/\bseverity\s*:?\s*low\b/gi) +
			count(/\blow\s*[-]?\s*severity\b/gi) +
			count(/\b(?:rating|category)\s+of\s+low\b/gi) +
			count(/\/\/\s*LOW\b/g) +
			count(new RegExp(`\\b${dbl("low")}\\b`, "gi")) +
			count(/\[L-?\d+\]/g),
		informational: () =>
			count(/\bseverity\s*:?\s*info(?:rmative|rmational)?\b/gi) +
			count(
				/\binfo(?:rmative|rmational)\s*[-]?\s*(?:severity|finding|issue|note)s?\b/gi,
			) +
			count(/\bseverity\s+(?:warning|note)\b/gi) +
			count(/\/\/\s*INFO(?:RMATIONAL)?\b/g) +
			count(new RegExp(`\\b${dbl("info")}`, "gi")) +
			count(/\[I-?\d+\]/g),
	};
	const ambient: Record<Sev, () => number> = {
		critical: () =>
			count(
				/\bcritical(?:\s|-)+(?:finding|vulnerability|issue|risk|bug)s?\b/gi,
			),
		high: () =>
			count(
				/\bhigh(?:\s|-)+(?:risk|impact|priority)\s+(?:finding|vulnerability|issue)?s?\b/gi,
			),
		medium: () =>
			count(
				/\bmed(?:ium)?(?:\s|-)+(?:risk|impact|priority)\s+(?:finding|vulnerability|issue)?s?\b/gi,
			),
		low: () =>
			count(
				/\blow(?:\s|-)+(?:risk|impact|priority)\s+(?:finding|vulnerability|issue)?s?\b/gi,
			),
		informational: () =>
			count(/\binformational\s+(?:finding|note|issue|recommendation)s?\b/gi),
	};
	const scores: Record<Sev, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		informational: 0,
	};
	for (const sev of Object.keys(explicit) as Sev[]) {
		const exp = explicit[sev]();
		const amb = ambient[sev]();
		if (exp >= 1) scores[sev] = exp * 2 + amb;
		else if (amb >= 2) scores[sev] = amb;
	}
	const top = (Object.entries(scores) as Array<[Sev, number]>).sort(
		([, a], [, b]) => b - a,
	)[0];
	return top[1] >= 1 ? top[0] : "unknown";
}

async function run() {
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	const payload = await getPayload({ config: configPromise });

	// Page through all audit chunks (limit=10000 fits in one query)
	const docs = await payload.find({
		collection: "research-docs",
		where: { source: { equals: "audit" } },
		limit: 10000,
		depth: 0,
	});

	console.log(`\nLoaded ${docs.docs.length} audit chunks`);

	const changes: Array<{ id: string; from: AuditSeverity; to: AuditSeverity }> =
		[];
	const histogram: Record<AuditSeverity, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		informational: 0,
		unknown: 0,
	};
	for (const d of docs.docs as Array<{
		id: string;
		content: string;
		severity?: AuditSeverity;
	}>) {
		const newSev = inferSeverityFromBody(d.content);
		const oldSev = d.severity ?? "unknown";
		histogram[newSev] += 1;
		if (oldSev !== newSev) changes.push({ id: d.id, from: oldSev, to: newSev });
	}

	console.log("\nProposed severity distribution:");
	for (const [sev, n] of Object.entries(histogram)) {
		console.log(`  ${sev.padEnd(14)} ${n}`);
	}
	console.log(`\nChanges: ${changes.length} / ${docs.docs.length} chunks`);

	if (!execute) {
		console.log("\nDry run. --execute to write changes.");
		return;
	}

	console.log("\nApplying updates…");
	let errors = 0;
	for (const ch of changes) {
		try {
			await payload.update({
				collection: "research-docs",
				id: ch.id,
				data: { severity: ch.to },
			});
		} catch (err) {
			console.error(`  ✗ ${ch.id}: ${(err as Error).message}`);
			errors += 1;
		}
	}
	console.log(`Done. ${changes.length - errors} updated, ${errors} errors.`);
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
