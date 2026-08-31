/**
 * Independent calibration of the codeDepth answer key — two graders.
 *
 *   pnpm exec tsx scripts/scan/independent-calibrate.ts [--limit N] [--json] [--out=path]
 *
 * The deepwiki-calibrate lane's first-ever run (2026-08-31, issue #1137)
 * graded 4 of 86 answer-key repos. Not an accuracy number — a COVERAGE number:
 * DeepWiki has simply never indexed the other 82, which is what an answer key
 * built from long-tail repos guarantees. The /quality row has been red on
 * n<20 since July, and re-running the same lane can never fix it, because the
 * binding constraint is the independent source's index, not our lane.
 *
 * So: a second independent grader that can read ANY public repo. Grok (xAI)
 * classifies each unindexed answer-key repo substantial-vs-template from the
 * repo itself, the same question DeepWiki answers for the indexed few. The
 * artifact records WHICH grader judged each row — a DeepWiki verdict and a
 * Grok verdict are different evidence and are never pooled silently.
 *
 * Same stance as deepwiki-calibrate: report-only, no writes to the DB, and a
 * disagreement is a review queue, not proof our label is wrong — the grader
 * can be wrong too. What n>=20 buys is that AGREEMENT starts meaning
 * something: 100% on n=4 is a shrug; the same rate on n=40 is calibration.
 *
 * Grok invocation matches scripts/grok-repo-audit.ts (the measured pattern):
 * single-shot -p with --json-schema, one retry, ~120s timeout, sequential —
 * grok is a metered external service, not a thread pool.
 */
import { execFile } from "node:child_process";
import { writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { askDeepWiki } from "../../src/lib/deepwiki";
import {
	DEEP,
	JS_DEEP,
	JS_SHALLOW,
	type LabeledRepo,
	SHALLOW,
} from "./depth-labels";

const pexec = promisify(execFile);

const JSON_OUT = process.argv.includes("--json");
const OUT_FILE = process.argv
	.find((x) => x.startsWith("--out="))
	?.slice("--out=".length);
const LIMIT = (() => {
	const i = process.argv.indexOf("--limit");
	const n = i >= 0 ? Number(process.argv[i + 1]) : 40;
	return Number.isFinite(n) && n > 0 ? n : 40;
})();

const QUESTION =
	"Is this repository a substantial working implementation with real logic of its own, or is it a template, starter, example set, or tutorial scaffold? Consider the actual code, not the README's claims.";

const SCHEMA = {
	type: "object",
	properties: {
		classification: {
			type: "string",
			enum: ["SUBSTANTIAL", "TEMPLATE", "UNCLEAR"],
		},
		confidence: { type: "number" },
		reason: { type: "string" },
	},
	required: ["classification", "confidence", "reason"],
	additionalProperties: false,
} as const;

type Verdict = "SUBSTANTIAL" | "TEMPLATE" | "UNCLEAR";

interface Row {
	fullName: string;
	label: "DEEP" | "SHALLOW";
	grader: "deepwiki" | "grok" | "none";
	verdict: Verdict;
	agree: boolean | null; // null = ungraded / UNCLEAR
	reason: string;
}

function classifyText(answer: string): Verdict {
	const a = answer.toLowerCase();
	const sub =
		/substantial|full implementation|real logic|production|complete implementation|working implementation/.test(
			a,
		);
	const tmpl = /template|starter|scaffold|example|tutorial|boilerplate/.test(a);
	if (sub && !tmpl) return "SUBSTANTIAL";
	if (tmpl && !sub) return "TEMPLATE";
	return "UNCLEAR";
}

async function askGrok(fullName: string): Promise<{
	classification: Verdict;
	reason: string;
} | null> {
	const prompt = `Audit the GitHub repo ${fullName}. ${QUESTION} JSON only.`;
	for (let attempt = 0; attempt < 2; attempt++) {
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
				{ maxBuffer: 10 * 1024 * 1024, timeout: 150_000 },
			);
			const outer = JSON.parse(stdout) as { text?: string };
			const parsed = JSON.parse(outer.text ?? "{}") as {
				classification?: string;
				reason?: string;
			};
			if (
				parsed.classification === "SUBSTANTIAL" ||
				parsed.classification === "TEMPLATE" ||
				parsed.classification === "UNCLEAR"
			)
				return {
					classification: parsed.classification,
					reason: (parsed.reason ?? "").slice(0, 200),
				};
		} catch {
			// retry once, then give up on this repo — an unreadable repo is
			// ungraded, never a verdict.
		}
	}
	return null;
}

async function main() {
	const key: Array<{ repo: LabeledRepo; label: "DEEP" | "SHALLOW" }> = [
		...DEEP.map((r) => ({ repo: r, label: "DEEP" as const })),
		...JS_DEEP.map((r) => ({ repo: r, label: "DEEP" as const })),
		...SHALLOW.map((r) => ({ repo: r, label: "SHALLOW" as const })),
		...JS_SHALLOW.map((r) => ({ repo: r, label: "SHALLOW" as const })),
	];
	console.error(
		`independent-calibrate: ${key.length} answer-key repos · grok budget ${LIMIT}`,
	);

	const rows: Row[] = [];
	let grokUsed = 0;
	for (const { repo, label } of key) {
		const expected: Verdict = label === "DEEP" ? "SUBSTANTIAL" : "TEMPLATE";
		// Grader 1: DeepWiki, for the few it has indexed.
		const dw = await askDeepWiki(repo.fullName, QUESTION, 30_000).catch(
			() => null,
		);
		if (dw?.answer) {
			const v = classifyText(dw.answer);
			rows.push({
				fullName: repo.fullName,
				label,
				grader: "deepwiki",
				verdict: v,
				agree: v === "UNCLEAR" ? null : v === expected,
				reason: dw.answer.slice(0, 160),
			});
			console.error(`  deepwiki ${repo.fullName}: ${v}`);
			continue;
		}
		// Grader 2: Grok, budgeted.
		if (grokUsed >= LIMIT) {
			rows.push({
				fullName: repo.fullName,
				label,
				grader: "none",
				verdict: "UNCLEAR",
				agree: null,
				reason: "not DeepWiki-indexed; grok budget exhausted",
			});
			continue;
		}
		grokUsed++;
		const gk = await askGrok(repo.fullName);
		if (!gk) {
			rows.push({
				fullName: repo.fullName,
				label,
				grader: "none",
				verdict: "UNCLEAR",
				agree: null,
				reason: "grok failed twice",
			});
			continue;
		}
		rows.push({
			fullName: repo.fullName,
			label,
			grader: "grok",
			verdict: gk.classification,
			agree:
				gk.classification === "UNCLEAR" ? null : gk.classification === expected,
			reason: gk.reason,
		});
		console.error(`  grok     ${repo.fullName}: ${gk.classification}`);
	}

	const graded = rows.filter((r) => r.agree !== null);
	const agreeing = graded.filter((r) => r.agree).length;
	const byGrader = {
		deepwiki: rows.filter((r) => r.grader === "deepwiki" && r.agree !== null)
			.length,
		grok: rows.filter((r) => r.grader === "grok" && r.agree !== null).length,
	};
	const artifact = {
		asOf: new Date().toISOString(),
		source: "scripts/scan/independent-calibrate.ts",
		frame: { answerKey: key.length, graded: graded.length, byGrader },
		agreementRate: graded.length
			? Math.round((agreeing / graded.length) * 100)
			: 0,
		disagreements: graded
			.filter((r) => !r.agree)
			.map((r) => ({
				fullName: r.fullName,
				ourLabel: r.label,
				grader: r.grader,
				verdict: r.verdict,
				reason: r.reason,
			})),
		rows,
	};

	const body = JSON.stringify(artifact, null, "\t");
	if (OUT_FILE) writeFileSync(OUT_FILE, `${body}\n`);
	if (JSON_OUT) console.log(body);
	else {
		console.log(
			`\ngraded ${graded.length}/${key.length} (deepwiki ${byGrader.deepwiki}, grok ${byGrader.grok}) · agreement ${artifact.agreementRate}%`,
		);
		for (const d of artifact.disagreements)
			console.log(
				`  DISAGREE ${d.fullName}: ours=${d.ourLabel} ${d.grader}=${d.verdict} — ${d.reason.slice(0, 90)}`,
			);
	}
}

main().catch((e) => {
	console.error("FATAL:", e?.message ?? e);
	process.exit(1);
});
