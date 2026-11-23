import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Raven sk-019, sk-027 and sk-028 (Stellar-Light/stellar-scout #13, #14, #15).
// The Scout skill named a fixed list of SDF skills with a `soroban` slug that
// answers 404, gave the Builders directory a fixed size that went stale twice,
// and mixed the feedback write into the read-only guidance. The first fix
// swapped one fixed list for another and kept both feedback operations in the
// default files. These read the files the distribution repo serves.
const read = (f: string) =>
	readFileSync(join(process.cwd(), "public/skills", f), "utf8");
const READ_ONLY = {
	"stellar-scout.md": read("stellar-scout.md"),
	"references/api-reference.md": read("references/api-reference.md"),
	"references/examples.md": read("references/examples.md"),
};
const FEEDBACK = read("references/feedback.md");

/** Lines of every read-only file that match `re`, as `file:line: text`. */
const hits = (re: RegExp) =>
	Object.entries(READ_ONLY).flatMap(([file, text]) =>
		text
			.split("\n")
			.map((line, i) => ({ line, at: `${file}:${i + 1}` }))
			.filter(({ line }) => re.test(line))
			.map(({ line, at }) => `${at}: ${line.trim().slice(0, 120)}`),
	);

// Three catalog slugs in a row, comma or slash separated: a fixed list.
const SLUG =
	"(?:soroban|smart-contracts|dapp|assets|data|standards|agentic-payments|zk-proofs|cross-chain)";
const FIXED_LIST = new RegExp(
	`\\b${SLUG}\\s*[,/]\\s*${SLUG}\\s*[,/]\\s*${SLUG}\\b`,
	"i",
);

describe("the Scout skill's read-only text", () => {
	it("names no fixed SDF skill list or count (sk-027)", () => {
		expect(hits(FIXED_LIST)).toEqual([]);
		expect(hits(/\b(?:7|8|seven|eight) official\b/i)).toEqual([]);
		expect(hits(/~\d+ entries|\d+ entries from \w+ sources/)).toEqual([]);
	});

	it("never uses soroban as a skill slug, and keeps Soroban prose (sk-027)", () => {
		expect(
			hits(/`soroban`|skills\/soroban\b|skills\.stellar\.org\/soroban\b/),
		).toEqual([]);
		// Narrow on purpose: the platform name stays legitimate prose.
		expect(READ_ONLY["stellar-scout.md"]).toContain("Rust on Soroban");
	});

	it("takes the install location from the entry, never from the slug (sk-027)", () => {
		expect(hits(/skills\.stellar\.org\/skills\/\{name\}/)).toEqual([]);
		expect(hits(/one SDF skill|SDF skills catalog/i)).toEqual([]);
		expect(READ_ONLY["references/api-reference.md"]).toMatch(
			/`\.skill\.install`/,
		);
	});

	it("gives the Builders directory no fixed size (sk-028)", () => {
		expect(
			hits(
				/in the dozens|(?:~\s*\d[\d,]*|\d[\d,]*\+?|dozens of|hundreds of|a few hundred)\s+(?:builder\s+)?profiles/i,
			),
		).toEqual([]);
		// It points to the live count and keeps the opt-in guidance.
		expect(READ_ONLY["stellar-scout.md"]).toMatch(
			/`builders` entry in `GET \/api\/status`/,
		);
		expect(READ_ONLY["references/api-reference.md"]).toMatch(
			/`builders` entry in `GET \/api\/status`/,
		);
		expect(READ_ONLY["stellar-scout.md"]).toMatch(/opt-in/);
	});

	it("names neither feedback operation outside the opt-in companion (sk-019)", () => {
		expect(hits(/\/api\/feedback|submit_?feedback/i)).toEqual([]);
		// The companion documents both, and says it writes and is opt-in.
		expect(FEEDBACK).toContain("## `POST /api/feedback`");
		expect(FEEDBACK).toContain("## `GET /api/feedback`");
		const front = FEEDBACK.split("\n---\n")[0];
		expect(front).toMatch(/^side-effects: Writes\./m);
		expect(front).toMatch(/^opt-in: true$/m);
		expect(front).toMatch(/^read-only: false$/m);
	});
});
