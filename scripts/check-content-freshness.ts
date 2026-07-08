/**
 * Content-freshness guard. Fails if OUR authored, prescriptive how-to content
 * (skills, examples, references, package READMEs) contains a known-stale Stellar
 * CLI / build command. Static repo scan — complements the live-API Guard
 * (scripts/self-audit.ts) and the API⇄spec drift check.
 *
 *   pnpm exec tsx scripts/check-content-freshness.ts
 *
 * Scope is deliberately OUR content only — NOT the SDF skills we proxy live at
 * /api/skills (that content is SDF's to keep current; when they fix it, our
 * proxy reflects it). This exists because the ecosystem's live pain right now
 * is agents parroting stale playbooks (wasm32-unknown-unknown, keys generate
 * --global). We must never be a source of that.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

interface Rule {
	re: RegExp;
	why: string;
}

// Each rule is an UNAMBIGUOUSLY stale command form (not a stylistic nit —
// `--source` is intentionally NOT here: it still works as an alias for
// `--source-account` in current stellar-cli).
const RULES: Rule[] = [
	{
		re: /wasm32-unknown-unknown/,
		why: "deprecated Soroban build target — current is `wasm32v1-none` (wasm32-unknown-unknown is unsupported on Rust 1.82+)",
	},
	{
		re: /keys\s+generate[^\n]*--global/,
		why: "`stellar keys generate` no longer has a `--global` flag",
	},
	{
		re: /\bsoroban\s+(contract|keys|network|config|lab)\s+\w/,
		why: "the `soroban` CLI was renamed — use `stellar contract` / `stellar keys` / `stellar network`",
	},
];

// OUR authored content. Dirs are walked (*.md/*.ts/*.tsx); files scanned as-is.
const TARGETS = [
	"public/skills",
	"references",
	"src/lib/stellar-scout-skill.ts",
	"src/lib/stellar-developer-activity-skill.ts",
	"scout-mcp/README.md",
	"api-client/README.md",
	"README.md",
];

function filesUnder(path: string): string[] {
	let st: ReturnType<typeof statSync>;
	try {
		st = statSync(path);
	} catch {
		return []; // target may not exist in every checkout — skip quietly
	}
	if (st.isFile()) return [path];
	const out: string[] = [];
	for (const entry of readdirSync(path)) {
		const full = join(path, entry);
		const s = statSync(full);
		if (s.isDirectory()) out.push(...filesUnder(full));
		else if (/\.(md|ts|tsx|mdx)$/.test(entry)) out.push(full);
	}
	return out;
}

function main() {
	const hits: Array<{ file: string; line: number; text: string; why: string }> =
		[];
	const files = new Set(TARGETS.flatMap(filesUnder));
	for (const file of files) {
		const lines = readFileSync(file, "utf8").split("\n");
		lines.forEach((text, i) => {
			for (const rule of RULES) {
				if (rule.re.test(text)) {
					hits.push({ file, line: i + 1, text: text.trim(), why: rule.why });
				}
			}
		});
	}

	console.log(
		`Content-freshness guard — scanned ${files.size} authored files.`,
	);
	if (hits.length === 0) {
		console.log("✅ No stale Stellar CLI / build commands found.");
		process.exit(0);
	}
	console.error(`\n❌ ${hits.length} stale command(s) in authored content:\n`);
	for (const h of hits) {
		console.error(`  ${h.file}:${h.line}`);
		console.error(`    ${h.text}`);
		console.error(`    → ${h.why}\n`);
	}
	process.exit(1);
}

main();
