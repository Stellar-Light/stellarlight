/**
 * Risky instructions in a skill's text: a SKILL.md is instructions an agent
 * executes literally, fetched live from repos and a registry we do not
 * review, so a compromised upstream could tell Raven to run a payload, leak
 * a key, or ignore its user. Pure, so the serving guard and the lane share
 * one rule.
 *
 * Each rule is narrow on purpose. Honest skills call APIs with curl, tell
 * people never to share a secret key, and install SDKs from npm; none of
 * that is flagged. What is: running a download, running decoded bytes,
 * installing from a bare URL, steering the agent against its instructions
 * or its user, sending a secret somewhere, and characters that hide text.
 *
 * Every regex runs per line with bounded or single-class repetition: the
 * text is an attacker's, and a pattern that backtracks would stall the read
 * that serves every other skill.
 */

export const SKILL_RULES = [
	"runs-download",
	"runs-decoded",
	"installs-from-url",
	"steers-the-agent",
	"sends-a-secret",
	"hidden-characters",
] as const;
export type SkillRule = (typeof SKILL_RULES)[number];

export interface SkillFinding {
	rule: SkillRule;
	/** 1-based line of the text. The text itself is never echoed: what is
	 * served about a finding is Scout's words, not the skill's. */
	line: number;
}

const SHELL = String.raw`(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh|fish|python3?|node|perl|ruby|iex|invoke-expression|pwsh|powershell)\b`;

const LINE_RULES: Array<[SkillRule, RegExp[]]> = [
	[
		"runs-download",
		[
			// curl ... | sh, iwr ... | iex
			new RegExp(
				String.raw`\b(?:curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod)\b[^|\n]*\|\s*${SHELL}`,
				"i",
			),
			// bash -c "$(curl ...)", sh <(wget ...)
			/\b(?:sh|bash|zsh)\s+(?:-c\s+["']?\$\(|<\()\s*(?:curl|wget)\b/i,
			// download, then mark it executable
			/\b(?:curl|wget)\b[^\n]{0,200}?(?:&&|;)\s*chmod\s+\+x\b/i,
		],
	],
	[
		"runs-decoded",
		[
			new RegExp(
				String.raw`\bbase64\s+(?:-d|-D|--decode)\b[^|\n]*\|\s*${SHELL}`,
				"i",
			),
			/\beval\s*\(\s*(?:atob|Buffer\.from|unescape|decodeURIComponent)\s*\(/i,
			/\bnew\s+Function\s*\(\s*(?:atob|Buffer\.from)\s*\(/i,
		],
	],
	[
		"installs-from-url",
		[
			/\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add)\b[^\n]{0,200}?\s(?:https?:\/\/|git\+)/i,
			/\bpip3?\s+install\b[^\n]{0,200}?\s(?:https?:\/\/|git\+)/i,
		],
	],
	[
		"steers-the-agent",
		[
			/\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+)?(?:of\s+)?(?:the\s+|your\s+)?(?:previous|prior|above|earlier|preceding|system)\s+(?:instructions|prompts?|rules|messages|guidelines)\b/i,
			/\bwithout\s+(?:telling|asking|informing|notifying|alerting)\s+the\s+user\b/i,
			// Keeping the user in the dark, not advice about what to suggest:
			// "never tell the user to install a browser" is honest UX copy.
			/\b(?:do\s+not|don'?t|never)\s+(?:tell|inform|notify|alert)\s+the\s+user\s+(?:about|that|what|you|this|of|where)\b/i,
			/\byou\s+are\s+now\s+(?:in\s+)?(?:developer|dan|jailbreak|unrestricted|god)\b/i,
		],
	],
	[
		"sends-a-secret",
		[
			// A secret and a place to send it, on one line.
			/(?:private\s+key|secret\s+key|seed\s+phrase|mnemonic|id_rsa|\.ssh\/|\.aws\/credentials|\bS[A-Z2-7]{55}\b)[^\n]{0,160}?(?:https?:\/\/|curl\s|wget\s|fetch\s*\(|webhook)/i,
			/(?:curl\s[^\n]{0,80}?(?:-d|--data|-F)\b|fetch\s*\(|webhook)[^\n]{0,160}?(?:private\s+key|secret\s+key|seed\s+phrase|mnemonic|id_rsa|\.ssh\/|\.aws\/credentials)/i,
		],
	],
];

/** Bidirectional controls and zero-width characters that hide text from a
 * reader while an agent still reads it. Joiners (U+200C, U+200D) are left
 * alone: emoji and several scripts use them honestly. */
const HIDDEN = /[\u202A-\u202E\u2066-\u2069\u200B\u2060\u180E]|(?<!^)\uFEFF/u;

/** A risky line as compared across versions: trimmed, whitespace
 * collapsed, lowercased. */
export const normalizeLine = (line: string) =>
	line.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 4000);

/** The findings a reviewed copy did not already carry. A skill keeps the
 * honest risky lines it was accepted with (an official installer piped to
 * sh); only a line that is new since, or a skill never accepted, counts.
 * `accepted` null = no reviewed copy on record, so every finding is new. */
export function newFindings(
	text: string,
	accepted: readonly string[] | null,
): SkillFinding[] {
	const found = scanSkill(text);
	if (!accepted) return found;
	const known = new Set(accepted);
	const lines = text.split("\n");
	return found.filter((f) => !known.has(normalizeLine(lines[f.line - 1])));
}

/** The normalized risky lines of a text: what a review accepts with it. */
export function riskyLines(text: string): string[] {
	const lines = text.split("\n");
	return [
		...new Set(scanSkill(text).map((f) => normalizeLine(lines[f.line - 1]))),
	];
}

/** Every finding in a skill's text, at most one per rule and line. */
export function scanSkill(text: string): SkillFinding[] {
	const out: SkillFinding[] = [];
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// One long line cannot stall the scan: rules read its first 4,000
		// characters, and a payload long enough to need more is itself odd.
		const head = line.length > 4000 ? line.slice(0, 4000) : line;
		for (const [rule, patterns] of LINE_RULES)
			if (patterns.some((p) => p.test(head))) out.push({ rule, line: i + 1 });
		if (HIDDEN.test(line)) out.push({ rule: "hidden-characters", line: i + 1 });
	}
	return out;
}
