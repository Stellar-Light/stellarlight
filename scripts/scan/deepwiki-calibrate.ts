/**
 * DeepWiki calibration cross-check (codeDepth track, gist gap: independent
 * external validation of the answer key).
 *
 *   pnpm exec tsx scripts/scan/deepwiki-calibrate.ts [--json] [--out=path]
 *
 * The depth-eval gate proves our scorer separates the answer key. But the
 * answer key is OUR judgment — if it's miscalibrated, a green gate is a green
 * lie. This asks an INDEPENDENT source (DeepWiki / Cognition-Devin, which has
 * read the actual repo) to classify each answer-key repo as a substantial
 * implementation vs a template/example, and reports where DeepWiki disagrees
 * with our DEEP/SHALLOW label.
 *
 * Agreement = confidence our answer key (and thus the gated model) reflects
 * real code substance, not just our priors. Disagreements are the review
 * queue: either our label is wrong (fix the key) or DeepWiki is (note it).
 * Report-only — no writes, no hard gate (DeepWiki can be wrong too; this is a
 * calibration signal, the sibling of the SCF cross-check).
 */
import { writeFileSync } from "node:fs";
import { askDeepWiki } from "../../src/lib/deepwiki";
import {
	DEEP,
	JS_DEEP,
	JS_SHALLOW,
	type LabeledRepo,
	SHALLOW,
} from "./depth-labels";

const JSON_OUT = process.argv.includes("--json");
const OUT_FILE = process.argv
	.find((x) => x.startsWith("--out="))
	?.slice("--out=".length);

const QUESTION =
	"Classify this repository in ONE word on the FIRST line, then one sentence of reasoning. " +
	"Is it primarily (A) a SUBSTANTIAL implementation with significant custom application/protocol logic, " +
	"or (B) a TEMPLATE — a starter, example, tutorial, boilerplate, or thin demo with little original logic? " +
	"Answer with exactly SUBSTANTIAL or TEMPLATE on the first line.";

type Verdict = "SUBSTANTIAL" | "TEMPLATE" | "UNCLEAR";

function classify(answer: string): Verdict {
	// First non-empty line carries the one-word verdict; fall back to whole text.
	const head = (answer.split(/\n/).find((l) => l.trim()) ?? "").toUpperCase();
	const body = answer.toUpperCase();
	const sub = /\bSUBSTANTIAL\b/.test(head) || /\bSUBSTANTIAL\b/.test(body);
	const tmpl =
		/\bTEMPLATE\b|\bBOILERPLATE\b|\bTUTORIAL\b|\bEXAMPLE\b|\bSTARTER\b|\bDEMO\b/.test(
			head,
		);
	if (sub && !tmpl) return "SUBSTANTIAL";
	if (tmpl && !sub) return "TEMPLATE";
	// head ambiguous → lean on which appears first in the body
	const iSub = body.indexOf("SUBSTANTIAL");
	const iTmpl = body.search(/TEMPLATE|BOILERPLATE|TUTORIAL|STARTER/);
	if (iSub >= 0 && (iTmpl < 0 || iSub < iTmpl)) return "SUBSTANTIAL";
	if (iTmpl >= 0 && (iSub < 0 || iTmpl < iSub)) return "TEMPLATE";
	return "UNCLEAR";
}

interface Row {
	fullName: string;
	label: "DEEP" | "SHALLOW";
	lang: "rust" | "js";
	deepwiki: Verdict;
	agree: boolean | null; // null = UNCLEAR / not indexed
	snippet: string;
}

async function run(
	list: LabeledRepo[],
	label: "DEEP" | "SHALLOW",
	lang: "rust" | "js",
	out: Row[],
) {
	// DeepWiki is a shared free service — small pool, sequential-ish.
	let idx = 0;
	async function worker() {
		for (;;) {
			const i = idx++;
			if (i >= list.length) return;
			const { fullName } = list[i];
			const ans = await askDeepWiki(fullName, QUESTION, 30_000).catch(
				() => null,
			);
			if (!ans) {
				out.push({
					fullName,
					label,
					lang,
					deepwiki: "UNCLEAR",
					agree: null,
					snippet: "not indexed / no answer",
				});
				continue;
			}
			const v = classify(ans.answer);
			const expected = label === "DEEP" ? "SUBSTANTIAL" : "TEMPLATE";
			out.push({
				fullName,
				label,
				lang,
				deepwiki: v,
				agree: v === "UNCLEAR" ? null : v === expected,
				snippet: ans.answer.replace(/\s+/g, " ").slice(0, 120),
			});
			console.error(`  ${label} ${lang} ${fullName} → ${v}`);
		}
	}
	await Promise.all(Array.from({ length: 3 }, worker));
}

async function main() {
	console.error("DeepWiki calibration cross-check");
	const rows: Row[] = [];
	await run(DEEP, "DEEP", "rust", rows);
	await run(SHALLOW, "SHALLOW", "rust", rows);
	await run(JS_DEEP, "DEEP", "js", rows);
	await run(JS_SHALLOW, "SHALLOW", "js", rows);

	const graded = rows.filter((r) => r.agree !== null);
	const agree = graded.filter((r) => r.agree).length;
	const disagree = graded.filter((r) => !r.agree);
	const unindexed = rows.filter((r) => r.agree === null).length;
	const rate = graded.length ? Math.round((agree / graded.length) * 100) : null;

	const report = {
		frame: {
			total: rows.length,
			graded: graded.length,
			unindexed,
		},
		agreementRate: rate,
		disagreements: disagree.map((r) => ({
			fullName: r.fullName,
			ourLabel: r.label,
			deepwiki: r.deepwiki,
			lang: r.lang,
			snippet: r.snippet,
		})),
	};

	if (OUT_FILE) {
		writeFileSync(OUT_FILE, JSON.stringify(report, null, 1));
		console.error(`  wrote ${OUT_FILE}`);
		return;
	}
	if (JSON_OUT) {
		console.log(JSON.stringify(report, null, 1));
		return;
	}
	console.log(
		`# DeepWiki calibration — ${agree}/${graded.length} agree (${rate}%), ${unindexed} unindexed`,
	);
	console.log(
		`\n## Disagreements (${disagree.length}) — our label vs DeepWiki's independent read\n`,
	);
	console.log("| repo | ours | deepwiki | note |");
	console.log("|---|---|---|---|");
	for (const r of disagree)
		console.log(
			`| ${r.fullName} | ${r.label} | ${r.deepwiki} | ${r.snippet} |`,
		);
	console.log(
		`\nHigh agreement ⇒ the answer key reflects real code substance (an independent source concurs). Each disagreement = review: fix our label, or note DeepWiki's blind spot.`,
	);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL", e);
		process.exit(1);
	});
