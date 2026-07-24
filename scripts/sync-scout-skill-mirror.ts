/**
 * Regenerate the inlined Scout SKILL.md mirror from its canonical file.
 *
 * There are two copies of the Scout skill and they serve different consumers:
 *
 *   public/skills/stellar-scout.md   ← CANONICAL. What a user downloads at
 *                                      stellarlight.xyz/skills/stellar-scout.md,
 *                                      and what the Stellar-Light/stellar-scout
 *                                      distribution repo mirrors.
 *   src/lib/stellar-scout-skill.ts   ← inlined mirror, so the /scout page's
 *                                      Copy button writes to the clipboard
 *                                      synchronously (no fetch, no Safari
 *                                      user-activation race).
 *
 * The TS file has always SAID it was a mirror. Nothing enforced it, and on
 * 2026-07-23 they had drifted in BOTH directions: the canonical file carried an
 * `/api/people` row and better audits guidance the mirror lacked, while the
 * mirror carried an SCF cross-link the downloadable file lacked. Two separate
 * edits, each to whichever copy the author happened to open — so the skill our
 * API served and the skill a user installed were different documents.
 *
 * This makes the mirror generated rather than hand-edited. Edit the markdown;
 * run this. A vitest guard fails if they diverge, so the drift cannot return
 * silently.
 *
 * Usage:
 *   pnpm exec tsx scripts/sync-scout-skill-mirror.ts          # write
 *   pnpm exec tsx scripts/sync-scout-skill-mirror.ts --check  # exit 1 if stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MD = join(ROOT, "public/skills/stellar-scout.md");
const TS = join(ROOT, "src/lib/stellar-scout-skill.ts");

const HEADER = `/**
 * Inlined Stellar Scout SKILL.md.
 *
 * GENERATED — do not edit by hand. The canonical copy is
 * public/skills/stellar-scout.md; regenerate with:
 *
 *   pnpm exec tsx scripts/sync-scout-skill-mirror.ts
 *
 * This mirror exists so the /scout page's "Copy" button can write to the
 * clipboard synchronously (no fetch dependency, no Safari user-activation
 * race). A vitest guard fails the build if it drifts from the markdown.
 */
export const STELLAR_SCOUT_SKILL = \``;

/** Escape what a template literal can't hold raw. */
function toTemplate(md: string): string {
	return md
		.replace(/\\/g, "\\\\")
		.replace(/`/g, "\\`")
		.replace(/\$\{/g, "\\${");
}

export function renderMirror(md: string): string {
	return `${HEADER}\n${toTemplate(md.trim())}\n\`;\n`;
}

function main() {
	const md = readFileSync(MD, "utf8");
	const next = renderMirror(md);
	const current = (() => {
		try {
			return readFileSync(TS, "utf8");
		} catch {
			return "";
		}
	})();

	if (process.argv.includes("--check")) {
		if (current === next) {
			console.log("scout skill mirror is in sync with the canonical markdown");
			return;
		}
		console.error(
			"scout skill mirror is STALE.\n" +
				"  canonical: public/skills/stellar-scout.md\n" +
				"  mirror:    src/lib/stellar-scout-skill.ts\n" +
				"  fix:       pnpm exec tsx scripts/sync-scout-skill-mirror.ts",
		);
		process.exit(1);
	}

	if (current === next) {
		console.log("already in sync — nothing written");
		return;
	}
	writeFileSync(TS, next);
	console.log(
		`regenerated src/lib/stellar-scout-skill.ts from public/skills/stellar-scout.md (${md.length} chars)`,
	);
}

if (process.argv[1]?.includes("sync-scout-skill-mirror")) main();
