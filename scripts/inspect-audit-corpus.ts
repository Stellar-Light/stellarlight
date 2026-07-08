/**
 * L1 audit corpus inspection — no DB writes, no embeds.
 * Pulls every sorobansecurity report, runs the reassembler+chunker,
 * and writes inspection artifacts to /tmp:
 *   - /tmp/audit-samples.md      first/middle/last chunk per report
 *   - /tmp/audit-stats.md        per-report stats + severity histogram
 *   - /tmp/audit-suspicious.md   reports with low recovery or weird patterns
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { writeFileSync } from "node:fs";
import { type AuditSeverity, chunkMarkdown } from "../src/lib/research-ingest";
import { reassembleSpacedText } from "./ingest-soroban-security";

const API = "https://sorobansecurity.com/api/v1/reports";

// Inline copies of inference + heading promotion (intentional duplication;
// the inspector lives alongside the ingest script and shares its rules).
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
// Mirrors scripts/ingest-soroban-security.ts:inferSeverityFromBody.
// Two-tier match: explicit labels need 1 hit, ambient phrases need ≥2.
function inferSeverityFromBody(content: string): AuditSeverity {
	const c = content;
	const count = (re: RegExp) => (c.match(re) || []).length;
	type Sev = Exclude<AuditSeverity, "unknown">;
	const explicit: Record<Sev, () => number> = {
		critical: () =>
			count(/\bseverity\s*:?\s*critical\b/gi) +
			count(/\bcritical\s*[-]?\s*severity\b/gi) +
			count(/\b(?:rating|category)\s+of\s+critical\b/gi) +
			count(/\[C-?\d+\]/g),
		high: () =>
			count(/\bseverity\s*:?\s*high\b/gi) +
			count(/\bhigh\s*[-]?\s*severity\b/gi) +
			count(/\b(?:rating|category)\s+of\s+high\b/gi) +
			count(/\[H-?\d+\]/g),
		medium: () =>
			count(/\bseverity\s*:?\s*med(?:ium)?\b/gi) +
			count(/\bmed(?:ium)?\s*[-]?\s*severity\b/gi) +
			count(/\b(?:rating|category)\s+of\s+med(?:ium)?\b/gi) +
			count(/\[M-?\d+\]/g),
		low: () =>
			count(/\bseverity\s*:?\s*low\b/gi) +
			count(/\blow\s*[-]?\s*severity\b/gi) +
			count(/\b(?:rating|category)\s+of\s+low\b/gi) +
			count(/\[L-?\d+\]/g),
		informational: () =>
			count(/\bseverity\s*:?\s*info(?:rmative|rmational)?\b/gi) +
			count(
				/\binfo(?:rmative|rmational)\s*[-]?\s*(?:severity|finding|issue|note)s?\b/gi,
			) +
			count(/\bseverity\s+(?:warning|note)\b/gi) +
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
function promoteAuditHeadings(md: string): string {
	const promoters = [
		/^# (\d+\s*[—\-.:]\s*)/gm,
		/^# (Findings|Vulnerabilities|Recommendations|Observations|Issues)\b/gim,
		/^# (Executive\s*Summary|Overview|Scope|Methodology|Disclaimer|Introduction|Appendix|Appendices|Conclusion|Summary\s+of\s+Findings|Detailed\s+Findings)\b/gim,
		/^# (Critical|High|Medium|Low|Informational|Info|Severity)(\s|$)/gim,
		/^# (\[[A-Z]?\d+\]\s*)/gm,
		/^# ([A-Z]{2,}-[A-Z]{2,}-[A-Z]{2,}-\d+\s*)/gm,
	];
	for (const re of promoters) md = md.replace(re, "## $1");
	return md;
}
function pickSeverity(section: string | null, content: string): AuditSeverity {
	const h = inferSeverity(section);
	return h !== "unknown" ? h : inferSeverityFromBody(content);
}

async function main() {
	const list = (await (await fetch(`${API}/`)).json()) as Array<{
		id: number;
		name: string;
		date: string;
		status: string;
		protocolName: string;
		auditorName: string;
	}>;
	const approved = list.filter((r) => r.status === "approved");
	console.log(`Inspecting ${approved.length} reports…\n`);

	const sampleOut: string[] = ["# Audit chunk samples\n"];
	const statsOut: string[] = [
		"# Audit corpus stats\n",
		"| ID | Protocol | Auditor | Date | Raw chars | Reassembled | Chunks | Sev: C/H/M/L/I/? | Avg chunk | Max chunk |",
		"|---|---|---|---|---|---|---|---|---|---|",
	];
	const suspicious: string[] = [
		"# Suspicious reports (flagged for human review)\n",
	];

	const totals = {
		reports: 0,
		chunks: 0,
		severity: {
			critical: 0,
			high: 0,
			medium: 0,
			low: 0,
			informational: 0,
			unknown: 0,
		} as Record<AuditSeverity, number>,
		runtogetherRatioSum: 0,
		nearLimitChunks: 0,
	};

	for (const meta of approved) {
		const detail = (await (await fetch(`${API}/${meta.id}`)).json()) as {
			mdFile: string;
		};
		const raw = detail.mdFile ?? "";
		if (raw.length < 500) {
			suspicious.push(
				`- **#${meta.id} ${meta.protocolName} / ${meta.auditorName}** — empty/tiny body (${raw.length} chars)`,
			);
			continue;
		}
		const reassembled = reassembleSpacedText(raw);
		const chunks = chunkMarkdown({
			md: promoteAuditHeadings(
				`# ${meta.protocolName} — ${meta.auditorName}\n\n${reassembled}`,
			),
			parentDocId: `audit-${meta.id}`,
			title: `${meta.protocolName} — ${meta.auditorName}`,
			url: `https://sorobansecurity.com/report/${meta.id}`,
			tags: ["audit"],
			publishedAt: meta.date,
		});

		// Severity tally for this report
		const sev: Record<AuditSeverity, number> = {
			critical: 0,
			high: 0,
			medium: 0,
			low: 0,
			informational: 0,
			unknown: 0,
		};
		for (const c of chunks) {
			const s = pickSeverity(c.section, c.content);
			sev[s] += 1;
			totals.severity[s] += 1;
			if (c.content.length > 5500) totals.nearLimitChunks += 1;
		}

		// Quality heuristic: % of words that are unrealistically long (>30 chars)
		// = signal of "BlendCapital"-style run-together text
		const allText = chunks.map((c) => c.content).join(" ");
		const words = allText.split(/\s+/).filter((w) => /^[A-Za-z]+$/.test(w));
		const longWords = words.filter((w) => w.length > 30).length;
		const longWordRatio = words.length ? longWords / words.length : 0;
		totals.runtogetherRatioSum += longWordRatio;

		const avgChunkSize = chunks.length
			? Math.round(
					chunks.reduce((s, c) => s + c.content.length, 0) / chunks.length,
				)
			: 0;
		const maxChunkSize = chunks.reduce(
			(m, c) => Math.max(m, c.content.length),
			0,
		);

		totals.reports += 1;
		totals.chunks += chunks.length;

		statsOut.push(
			`| ${meta.id} | ${meta.protocolName} | ${meta.auditorName} | ${meta.date.slice(0, 10)} | ${raw.length} | ${reassembled.length} | ${chunks.length} | ${sev.critical}/${sev.high}/${sev.medium}/${sev.low}/${sev.informational}/${sev.unknown} | ${avgChunkSize} | ${maxChunkSize} |`,
		);

		if (longWordRatio > 0.15) {
			suspicious.push(
				`- **#${meta.id} ${meta.protocolName} / ${meta.auditorName}** — ${(longWordRatio * 100).toFixed(1)}% words > 30 chars (run-together text, search will be weaker)`,
			);
		}
		if (sev.unknown / Math.max(1, chunks.length) > 0.8 && chunks.length > 3) {
			suspicious.push(
				`- **#${meta.id} ${meta.protocolName} / ${meta.auditorName}** — ${sev.unknown}/${chunks.length} chunks tagged \`unknown\` severity (heading structure not recovered)`,
			);
		}

		// Sample chunks: first, middle, last
		const samples = [
			chunks[0],
			chunks[Math.floor(chunks.length / 2)],
			chunks[chunks.length - 1],
		].filter(Boolean);
		sampleOut.push(
			`\n## #${meta.id} ${meta.protocolName} / ${meta.auditorName} (${meta.date.slice(0, 10)})`,
		);
		sampleOut.push(
			`Raw: ${raw.length} chars → reassembled: ${reassembled.length} → ${chunks.length} chunks, long-word ratio: ${(longWordRatio * 100).toFixed(1)}%`,
		);
		for (let i = 0; i < samples.length; i++) {
			const c = samples[i];
			const which = ["first", "middle", "last"][i];
			sampleOut.push(
				`\n### ${which} chunk (idx=${c.chunkIndex}, section="${c.section ?? ""}", sev=${pickSeverity(c.section, c.content)})`,
			);
			sampleOut.push("```");
			sampleOut.push(c.content.slice(0, 800));
			if (c.content.length > 800)
				sampleOut.push(`… (+${c.content.length - 800} more chars)`);
			sampleOut.push("```");
		}
	}

	// Summary footer
	statsOut.push("");
	statsOut.push("## Totals");
	statsOut.push(`- Reports processed: ${totals.reports}`);
	statsOut.push(`- Chunks total: ${totals.chunks}`);
	statsOut.push(
		`- Severity: critical=${totals.severity.critical} high=${totals.severity.high} medium=${totals.severity.medium} low=${totals.severity.low} informational=${totals.severity.informational} unknown=${totals.severity.unknown}`,
	);
	statsOut.push(
		`- Avg long-word ratio across reports: ${((totals.runtogetherRatioSum / totals.reports) * 100).toFixed(1)}% (<5% = clean, >15% = degraded)`,
	);
	statsOut.push(
		`- Chunks near MAX_CHARS limit (>5500): ${totals.nearLimitChunks} / ${totals.chunks}`,
	);
	statsOut.push(
		`- Estimated embed cost: $${((totals.chunks * 250 * 0.06) / 1_000_000).toFixed(4)} (assuming ~250 tokens/chunk)`,
	);

	writeFileSync("/tmp/audit-samples.md", sampleOut.join("\n"));
	writeFileSync("/tmp/audit-stats.md", statsOut.join("\n"));
	writeFileSync("/tmp/audit-suspicious.md", suspicious.join("\n"));

	console.log("Wrote:");
	console.log("  /tmp/audit-samples.md");
	console.log("  /tmp/audit-stats.md");
	console.log("  /tmp/audit-suspicious.md");
	console.log("");
	console.log("Totals:");
	console.log(`  ${totals.reports} reports, ${totals.chunks} chunks`);
	console.log(
		`  severity: C=${totals.severity.critical} H=${totals.severity.high} M=${totals.severity.medium} L=${totals.severity.low} I=${totals.severity.informational} ?=${totals.severity.unknown}`,
	);
	console.log(
		`  avg long-word ratio: ${((totals.runtogetherRatioSum / totals.reports) * 100).toFixed(1)}%`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
