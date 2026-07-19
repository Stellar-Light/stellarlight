/**
 * Ingest Soroban audit reports from stellarsecurityportal.com into the
 * ResearchDocs corpus. This is the only Stellar-wide repository of
 * security findings — it aggregates audits from Certora, OtterSec,
 * Halborn, OpenZeppelin, Code4rena, Cantina, Runtime Verification,
 * Veridise, CoinFabrik, Coinspect, Hacken, Quarkslab.
 *
 * API surface (confirmed manually, no docs published):
 *   GET https://stellarsecurityportal.com/api/v1/reports/        → list
 *   GET https://stellarsecurityportal.com/api/v1/reports/{id}    → detail
 *
 * The `mdFile` body field comes from PDF text extraction and is
 * mangled — letters are spaced apart, headings split letter-by-letter
 * across lines. We run `reassembleSpacedText()` to recover it before
 * chunking.
 *
 * Citations resolve to https://stellarsecurityportal.com/report/{id}.
 *
 * Usage:
 *   pnpm exec tsx scripts/ingest-soroban-security.ts             # dry run
 *   pnpm exec tsx scripts/ingest-soroban-security.ts --execute   # write
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import {
	canonicalAuditor,
	normalizeIdentityText,
	resolveAuditProjectSlug,
} from "../src/lib/audit-identity";
import {
	type AuditSeverity,
	chunkMarkdown,
	loadExistingChunks,
	type ResearchChunk,
	upsertChunks,
} from "../src/lib/research-ingest";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const limitFlag = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitFlag ? parseInt(limitFlag.split("=")[1], 10) : Infinity;

const API_BASE = "https://stellarsecurityportal.com/api/v1/reports";
const REPORT_URL = (id: number) =>
	`https://stellarsecurityportal.com/report/${id}`;

interface ReportListItem {
	id: number;
	name: string;
	date: string;
	status: string;
	protocolName: string;
	auditorName: string;
	companyName?: string;
}

interface ReportDetail extends ReportListItem {
	mdFile: string;
	binFile?: string;
	image?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
	const r = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": "stellarlight-scout-ingest",
		},
	});
	if (!r.ok) throw new Error(`fetch ${url}: ${r.status}`);
	return (await r.json()) as T;
}

/**
 * The PDF extractor that stellarsecurityportal.com runs on uploaded reports
 * inserts spaces between every glyph and breaks headings into one-letter
 * lines (because the source PDFs use custom letter-spacing). Real word
 * boundaries are double-spaces, intra-word spacing is single. Sample
 * input:
 *
 *     # B
 *     # le
 *     # n
 *     # d
 *     S e c u rity   A s s e s s m e n t
 *
 * Becomes:
 *
 *     # Blend
 *     Security  Assessment
 *
 * Heuristic per non-heading line:
 *   - If >30% of single-space tokens are 1-char, treat as spaced
 *   - Mark runs of 2+ spaces as real word boundaries (\x00)
 *   - Drop single spaces
 *   - Restore real boundaries to single space
 *
 * Heading collapse:
 *   - Consecutive `# x`-style lines at the same level get joined into one
 *     heading; spaces between fragments preserved only when source had
 *     real multi-space.
 */
export function reassembleSpacedText(raw: string): string {
	const lines = raw.split(/\r?\n/);
	const out: string[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		const hMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (hMatch) {
			const level = hMatch[1];
			// Greedily consume consecutive same-level heading lines that
			// each carry tiny fragments (the splitter symptom).
			const frags: string[] = [hMatch[2]];
			let j = i + 1;
			while (j < lines.length) {
				const nxt = lines[j].match(/^(#{1,6})\s+(.*)$/);
				if (!nxt || nxt[1] !== level) break;
				// Only merge if EITHER side looks like a fragment (≤ 4 chars,
				// no terminal punctuation). Otherwise treat as a real heading.
				const lastFrag = frags[frags.length - 1];
				const nxtFrag = nxt[2];
				const looksFragmented = lastFrag.length <= 4 || nxtFrag.length <= 4;
				if (!looksFragmented) break;
				frags.push(nxtFrag);
				j += 1;
			}
			const joined = collapseSpacedRun(frags.join("")).trim();
			out.push(`${level} ${joined}`);
			i = j;
			continue;
		}
		out.push(collapseSpacedRun(line));
		i += 1;
	}

	// Final pass: collapse 3+ blank lines → 2
	return out
		.join("\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** Per-line spaced-letter collapse using the 2+ space = real-boundary rule. */
function collapseSpacedRun(line: string): string {
	const trimmed = line.replace(/\s+$/g, "");
	if (!trimmed) return "";

	// Tokenize on single space; if >30% of tokens are 1-char, treat as spaced
	const tokens = trimmed.split(" ");
	const singles = tokens.filter((t) => t.length === 1).length;
	if (tokens.length < 5 || singles / tokens.length < 0.3) return line;

	// Mark word boundaries (2+ spaces), drop single intra-word spaces,
	// then restore boundaries as a single space.
	const BOUND = "\x00";
	return trimmed
		.replace(/ {2,}/g, BOUND)
		.replace(/ /g, "")
		.replace(new RegExp(BOUND, "g"), " ")
		.replace(/\s+/g, " ")
		.trim();
}

/** Map a section heading to a severity bucket. */
function inferSeverity(section: string | null): AuditSeverity {
	if (!section) return "unknown";
	const s = section.toLowerCase();
	if (/\bcritical\b/.test(s)) return "critical";
	if (/\bhigh(?:\s|-|$)/.test(s)) return "high";
	if (/\bmed(?:ium)?\b/.test(s)) return "medium";
	if (/\blow\b/.test(s)) return "low";
	if (/\b(info(?:rmational)?|note|notes)\b/.test(s)) return "informational";
	return "unknown";
}

/**
 * Backup severity inference from chunk body content. Used when the
 * section heading was lost (most reports — see findings doc).
 *
 * Two-tier match per severity bucket:
 *   1. EXPLICIT labels — `Severity: High`, `[H-NN]` finding IDs,
 *      `category of HIGH`. These are author-intent signals; **1 hit is
 *      enough** to assign the severity.
 *   2. AMBIENT phrases — "high risk finding", "critical issue", etc.
 *      Common in narrative prose; **require ≥2 hits** to avoid TOCs
 *      and exec summaries that name-drop "critical" rhetorically.
 *
 * Combined score = (explicit × 2) + ambient. Top bucket wins; ties
 * resolved by Object.entries ordering, which prefers critical →
 * informational (severity-conservative).
 */
function inferSeverityFromBody(content: string): AuditSeverity {
	const c = content;
	const count = (re: RegExp) => (c.match(re) || []).length;
	type Sev = Exclude<AuditSeverity, "unknown">;
	// Auditor-specific patterns observed in the corpus:
	//   Halborn:      "// HIGH" / "// CRITICAL" tail-of-section markers
	//   PDF-doubled:  "HHIIGGHH" / "CCRRIITTIICCAALL" letter-doubling
	//                 from per-glyph PDF extraction with letter-spacing
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
		// Explicit ≥1 OR ambient ≥2 qualifies. Explicit weighted 2×.
		if (exp >= 1) scores[sev] = exp * 2 + amb;
		else if (amb >= 2) scores[sev] = amb;
	}
	const top = (Object.entries(scores) as Array<[Sev, number]>).sort(
		([, a], [, b]) => b - a,
	)[0];
	return top[1] >= 1 ? top[0] : "unknown";
}

/**
 * Promote section-like H1 headings to H2 so the chunker actually splits
 * on them. Source PDFs use # for every heading regardless of nesting; the
 * shared chunker only honors ## boundaries.
 *
 * Match list covers the common section names across all 13 auditors plus
 * finding-ID prefixes (e.g. "# [A1] …", "# OS-BCL-ADV-00 …").
 */
function promoteAuditHeadings(md: string): string {
	const promoters = [
		/^# (\d+\s*[—\-.:]\s*)/gm, // "# 02—Scope" / "# 1. Foo"
		/^# (Findings|Vulnerabilities|Recommendations|Observations|Issues)\b/gim,
		/^# (Executive\s*Summary|Overview|Scope|Methodology|Disclaimer|Introduction|Appendix|Appendices|Conclusion|Summary\s+of\s+Findings|Detailed\s+Findings)\b/gim,
		/^# (Critical|High|Medium|Low|Informational|Info|Severity)(\s|$)/gim,
		/^# (\[[A-Z]?\d+\]\s*)/gm, // "# [A1] Foo"
		/^# ([A-Z]{2,}-[A-Z]{2,}-[A-Z]{2,}-\d+\s*)/gm, // "# OS-BCL-ADV-00 Foo"
		/^# (F-\d{4}-\d+\s*)/gm, // Hacken "# F-2026-15609 Foo"
		/^# ([A-Z]{3}\d{3}\s+)/gm, // Coinspect "# TRI001 Foo"
	];
	for (const re of promoters) md = md.replace(re, "## $1");
	return md;
}

async function run() {
	const startedAt = Date.now();
	// Crawl-observation time for this run — stamped on every chunk we fetch, so
	// the corpus can answer "when did we last SEE this report at the portal?"
	// (Distinct from publishedAt = the report's own date. Without it, refresh
	// recency for the audit source is unmeasurable from the API — the gap the
	// coverage report's freshness lane surfaced once it stopped conflating
	// content-age with refresh-staleness. Same pattern as ingest-sdf-org.)
	const observedAtIso = new Date(startedAt).toISOString();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log("source: stellarsecurityportal.com\n");

	console.log("Fetching report list…");
	const list = await fetchJson<ReportListItem[]>(`${API_BASE}/`);
	const approved = list.filter((r) => r.status === "approved");
	const targets = approved.slice(0, LIMIT);
	console.log(
		`  ${list.length} total, ${approved.length} approved, processing ${targets.length}`,
	);

	const payload = execute ? await getPayload({ config: configPromise }) : null;
	const existing = payload
		? await loadExistingChunks(payload, "audit")
		: new Map();
	if (payload) {
		const total = [...existing.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing audit chunks in collection\n`);
	}

	const allChunks: ResearchChunk[] = [];
	interface RegistryRow {
		reportId: number;
		title: string;
		reportUrl: string;
		auditor: string;
		protocol: string;
		projectSlug: string | null;
		linkBasis: "name-exact" | "alias" | "unmatched" | null;
		linkMapped: boolean;
		publishedAt: string;
		observedAt: string;
		chunksIndexed: number;
	}
	const registryRows: RegistryRow[] = [];
	let reportErrors = 0;
	let tooShort = 0;

	for (const meta of targets) {
		try {
			process.stdout.write(
				`[${meta.id}] ${meta.protocolName} / ${meta.auditorName}… `,
			);
			const detail = await fetchJson<ReportDetail>(`${API_BASE}/${meta.id}`);
			if (!detail.mdFile || detail.mdFile.length < 500) {
				console.log("no body, skip");
				tooShort += 1;
				continue;
			}
			const reassembled = reassembleSpacedText(detail.mdFile);
			console.log(`${detail.mdFile.length}→${reassembled.length} chars`);
			if (reassembled.length < 500) {
				tooShort += 1;
				continue;
			}
			const parentDocId = `audit-${meta.id}`;
			// Identity hygiene: the portal ships homoglyphs ("\u0421oinspect" with a
			// Cyrillic Es), trailing whitespace, and lowercase firm names — repair
			// before anything becomes a title, tag, or filterable field.
			const auditorClean = canonicalAuditor(meta.auditorName);
			const protocolClean = normalizeIdentityText(meta.protocolName);
			const title = `${protocolClean} — ${auditorClean}${
				meta.name ? ` (${normalizeIdentityText(meta.name)})` : ""
			}`;
			const url = REPORT_URL(meta.id);
			const tags = [
				"audit",
				auditorClean.toLowerCase().replace(/\s+/g, "-"),
				protocolClean.toLowerCase().replace(/\s+/g, "-"),
			];
			const md = promoteAuditHeadings(`# ${title}\n\n${reassembled}`);
			const chunks = chunkMarkdown({
				md,
				parentDocId,
				title,
				url,
				tags,
				publishedAt: meta.date,
			});
			// Stamp audit-specific metadata onto every chunk. Severity
			// prefers the section heading; falls back to body-content scan
			// (most audit PDFs come out with H1-only and lose section info).
			for (const c of chunks) {
				// Re-stamped every run, even when the content hash is unchanged
				// (upsertChunks' metadata-only path — no re-embed cost).
				c.observedAt = observedAtIso;
				c.auditor = auditorClean;
				c.protocol = protocolClean;
				const fromHeading = inferSeverity(c.section);
				c.severity =
					fromHeading !== "unknown"
						? fromHeading
						: inferSeverityFromBody(c.content);
			}
			allChunks.push(...chunks);
			const link = resolveAuditProjectSlug(protocolClean);
			registryRows.push({
				reportId: meta.id,
				title,
				reportUrl: url,
				auditor: auditorClean,
				protocol: protocolClean,
				projectSlug: link.slug,
				linkBasis: link.basis,
				linkMapped: link.mapped,
				publishedAt: meta.date,
				observedAt: observedAtIso,
				chunksIndexed: chunks.length,
			});
		} catch (err) {
			console.log(`✗ ${(err as Error).message}`);
			reportErrors += 1;
		}
	}

	const stats = { new: 0, updated: 0, unchanged: 0, toEmbed: 0 };
	for (const c of allChunks) {
		const prev = existing.get(c.parentDocId)?.get(c.chunkIndex);
		if (prev && prev.contentHash === c.contentHash) stats.unchanged += 1;
		else if (prev) {
			stats.updated += 1;
			stats.toEmbed += 1;
		} else {
			stats.new += 1;
			stats.toEmbed += 1;
		}
	}

	console.log(`\nChunks: ${allChunks.length} total`);
	console.log(
		`  new: ${stats.new} | updated: ${stats.updated} | unchanged: ${stats.unchanged}`,
	);
	console.log(
		`  to embed: ${stats.toEmbed} | report errors: ${reportErrors} | too short: ${tooShort}`,
	);

	// ---- Structured registry (audits collection) ----------------------------
	// One row per report, so agents can enumerate/filter audits instead of
	// hoping vector retrieval surfaces the right chunk. Linked to directory
	// projects via the hand-verified alias map in src/lib/audit-identity.ts.
	const linked = registryRows.filter((r) => r.projectSlug);
	const untriaged = registryRows.filter((r) => !r.linkMapped);
	console.log(
		`\nRegistry: ${registryRows.length} reports — ${linked.length} linked to projects, ${
			registryRows.filter((r) => r.linkBasis === "unmatched").length
		} verified no-match, ${untriaged.length} UNTRIAGED`,
	);
	for (const r of untriaged) {
		console.log(
			`  UNTRIAGED: [${r.reportId}] ${r.protocol} — needs alias-map entry`,
		);
	}

	if (!execute || !payload) {
		console.log("\nDry run. --execute to embed + write.");
		return;
	}

	// Resolve display names for linked projects in one query.
	const linkedSlugs = [...new Set(linked.map((r) => r.projectSlug as string))];
	const nameBySlug = new Map<string, string>();
	if (linkedSlugs.length) {
		const projDocs = await payload.find({
			collection: "projects",
			where: { slug: { in: linkedSlugs } },
			limit: linkedSlugs.length,
			depth: 0,
			select: { slug: true, name: true },
		});
		for (const d of projDocs.docs as Array<{ slug: string; name: string }>) {
			nameBySlug.set(d.slug, d.name);
		}
	}

	let regCreated = 0;
	let regUpdated = 0;
	for (const r of registryRows) {
		const { linkMapped: _drop, ...rest } = r;
		const data = {
			...rest,
			projectName: r.projectSlug
				? (nameBySlug.get(r.projectSlug) ?? null)
				: null,
		};
		const prior = await payload.find({
			collection: "audits",
			where: { reportId: { equals: r.reportId } },
			limit: 1,
			depth: 0,
		});
		if (prior.docs.length) {
			await payload.update({
				collection: "audits",
				id: (prior.docs[0] as { id: string | number }).id,
				data,
			});
			regUpdated += 1;
		} else {
			await payload.create({ collection: "audits", data });
			regCreated += 1;
		}
	}
	console.log(`Registry upsert: ${regCreated} created, ${regUpdated} updated`);

	const r = await upsertChunks({
		payload,
		source: "audit",
		chunks: allChunks,
		existing,
	});
	console.log(
		`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — errors: ${r.errors}`,
	);
}

// Tiny self-test for the reassembler when run with --test (no API, no DB).
if (args.includes("--test")) {
	const sample = `# B\n# le\n# n\n# d\n# C\n# a\n# p\n# ita\n# l\n\nS e c u rity   A s s e s s m e n t\nF e b r u a ry  2 9 th , 2 0 2 4`;
	console.log("INPUT:\n" + sample + "\n");
	console.log("OUTPUT:\n" + reassembleSpacedText(sample));
	process.exit(0);
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
