/**
 * Grok repo-audit lane — an INDEPENDENT, cross-vendor second opinion on the
 * verdicts our own engine computes.
 *
 * Everything that grades a repo today is ours: codeProofTier, deriveTriageTags,
 * farmScore. All calibrated the same way, so they share blind spots (the
 * AssemblyScript/PHP/Dart proof gaps found 2026-08-30 were invisible to every
 * one of them at once). A model from a different vendor is a genuine control:
 * where Grok and our signals AGREE, confidence is real; where they diverge,
 * that pair is exactly what a human should look at.
 *
 * This does NOT auto-write anything to the corpus. It emits an audit artifact
 * (the /quality shape) and a divergence list. Acting on a divergence is a
 * curator decision, gated by a human — an independent model is a witness, not
 * an authority.
 *
 *   node scripts/grok-repo-audit.ts --limit 30            # sample newest-scanned
 *   node scripts/grok-repo-audit.ts --repos a/b,c/d       # explicit set
 *   node scripts/grok-repo-audit.ts --limit 30 --json     # artifact to stdout
 *
 * Cost: ~$0.014/repo (Grok 4, measured). A 30-repo calibration run is ~$0.40.
 * Needs `grok` on PATH and authenticated (grok login).
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);
const API = process.env.STELLARLIGHT_API ?? "https://stellarlight.xyz";
const JSON_OUT = process.argv.includes("--json");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) : 30;
const MIN_CONFIDENCE = 0.5; // below this, Grok is guessing from priors, not
// investigating — its own low confidence says so. Counting those would repeat
// the deepwiki n=3 mistake: a number that cannot be wrong measures nothing.
const reposArg = process.argv.indexOf("--repos");
const EXPLICIT =
	reposArg >= 0 ? (process.argv[reposArg + 1] ?? "").split(",").filter(Boolean) : [];

type Row = {
	fullName: string;
	tier?: string;
	stellarProof?: string;
	isArchived?: boolean;
	farmScore?: number;
	stars?: number;
	primaryLanguage?: string;
};

const SCHEMA = {
	type: "object",
	properties: {
		classification: {
			type: "string",
			enum: ["canonical-infra", "active-project", "template-examples", "dead"],
		},
		confidence: { type: "number" },
		reason: { type: "string" },
	},
	required: ["classification", "confidence", "reason"],
};

/** Our engine's verdict, collapsed to Grok's four-way vocabulary, so the two
 * can be compared at all. Deliberately coarse — we are measuring gross
 * agreement, not splitting hairs. */
function ourView(r: Row): string {
	if (r.tier === "archive" || (r.farmScore ?? 0) >= 2) return "dead";
	if (r.tier === "quality") return "canonical-infra";
	// community: template-ish if a template/example, else active. We can't see
	// triageTags (internal, stripped on read), so this is a soft mapping.
	return "active-project";
}

async function askGrok(fullName: string): Promise<{
	classification: string;
	confidence: number;
	reason: string;
} | null> {
	const prompt = `Audit the GitHub repo ${fullName} in the context of the Stellar blockchain ecosystem. Classify it as exactly one of: canonical-infra (an official SDK, protocol, or core tool the ecosystem depends on), active-project (a live product or app under real development), template-examples (a starter, scaffold, tutorial, or example set not meant to be a maintained product), or dead (archived, abandoned, or a low-effort/farmed repo). Judge from what the repo actually is, not its name. JSON only.`;
	try {
		const { stdout } = await pexec(
			"grok",
			[
				"-p",
				prompt,
				"--json-schema",
				JSON.stringify(SCHEMA),
				"--output-format",
				"json",
			],
			{ maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
		);
		const outer = JSON.parse(stdout) as { text?: string };
		return JSON.parse(outer.text ?? "{}");
	} catch (e) {
		return { retry: (e as Error).message } as never;
	}
}

async function askGrokRetrying(fullName: string) {
	// One retry: single-shot Grok fails transiently (timeout, rate blip) often
	// enough that a bare failure would silently shrink the sample.
	const first = await askGrok(fullName);
	if (first && !("retry" in (first as object))) return first;
	const second = await askGrok(fullName);
	if (second && !("retry" in (second as object))) return second;
	console.error(`  ${fullName}: grok failed twice — skipping`);
	return null;
}

async function fetchSample(): Promise<Row[]> {
	if (EXPLICIT.length) {
		const out: Row[] = [];
		for (const n of EXPLICIT) {
			const r = await fetch(
				`${API}/api/repos?where%5BfullName%5D%5Bequals%5D=${encodeURIComponent(n)}&limit=1&depth=0`,
			);
			const d = (await r.json()) as { docs?: Row[] };
			if (d.docs?.[0]) out.push(d.docs[0]);
		}
		return out;
	}
	const r = await fetch(
		`${API}/api/repos?where%5BcodeScanState%5D%5Bequals%5D=scanned&limit=${LIMIT}&depth=0&sort=-updatedAt`,
	);
	const d = (await r.json()) as { docs?: Row[] };
	return d.docs ?? [];
}

async function main() {
	const rows = await fetchSample();
	if (!JSON_OUT) console.log(`auditing ${rows.length} repos with Grok…\n`);
	const results: Array<{
		repo: string;
		ours: string;
		grok: string;
		confidence: number;
		agree: boolean;
		reason: string;
	}> = [];
	for (const row of rows) {
		const g = await askGrokRetrying(row.fullName);
		if (!g) continue;
		if (g.confidence < MIN_CONFIDENCE) {
			if (!JSON_OUT)
				console.log(
					`  · ${row.fullName.padEnd(42)} SKIPPED (grok confidence ${g.confidence} — did not investigate)`,
				);
			continue;
		}
		const ours = ourView(row);
		const agree = ours === g.classification;
		results.push({
			repo: row.fullName,
			ours,
			grok: g.classification,
			confidence: g.confidence,
			agree,
			reason: g.reason,
		});
		if (!JSON_OUT)
			console.log(
				`  ${agree ? "✓" : "✗"} ${row.fullName.padEnd(42)} ours=${ours.padEnd(16)} grok=${g.classification}`,
			);
	}

	const graded = results.length;
	const agreed = results.filter((r) => r.agree).length;
	const divergences = results.filter((r) => !r.agree);
	const artifact = {
		asOf: new Date().toISOString(),
		source: "scripts/grok-repo-audit.ts",
		model: "grok",
		graded,
		agreed,
		agreementRate: graded ? Math.round((agreed / graded) * 100) : 0,
		skippedLowConfidence: rows.length - graded,
		divergences,
	};

	if (JSON_OUT) {
		console.log(JSON.stringify(artifact, null, 2));
	} else {
		console.log(
			`\nagreement: ${agreed}/${graded} (${artifact.agreementRate}%) — an independent vendor vs our engine`,
		);
		if (divergences.length) {
			console.log("\nDIVERGENCES (a human should look at these):");
			for (const d of divergences)
				console.log(
					`  ${d.repo}: ours=${d.ours} grok=${d.grok} (${d.confidence}) — ${d.reason.slice(0, 90)}`,
				);
		}
	}
}

main().catch((e) => {
	console.error("FATAL:", e?.message ?? e);
	process.exit(1);
});
