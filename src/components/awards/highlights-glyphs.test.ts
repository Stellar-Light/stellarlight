// @vitest-environment node

/**
 * Every 2026 nominee moment names its own mechanism: the owner's ask was
 * "more specific" icons, and a moment falling back to its kind's default is
 * the generic case coming back.
 */
import { describe, expect, it } from "vitest";
import { NOMINEE_HIGHLIGHTS } from "./highlights";

const MOCK = new Set([
	"decaf",
	"beans",
	"elsa",
	"meru",
	"etherfuse",
	"blend",
	"sorobanhooks",
	"defindex",
	"allbridge",
	"usdc-swap",
	"rubic",
]);

describe("nominee highlight glyphs", () => {
	it("every real nominee moment names a glyph", () => {
		const bare: string[] = [];
		for (const [slug, moments] of Object.entries(NOMINEE_HIGHLIGHTS)) {
			if (MOCK.has(slug)) continue;
			for (const m of moments)
				if (!m.glyph) bare.push(`${slug}: ${m.headline}`);
		}
		expect(bare).toEqual([]);
	});

	it("no sheet repeats a glyph", () => {
		const dup: string[] = [];
		for (const [slug, moments] of Object.entries(NOMINEE_HIGHLIGHTS)) {
			if (MOCK.has(slug)) continue;
			const seen = new Set<string>();
			for (const m of moments) {
				const g = m.glyph ?? m.kind;
				if (seen.has(g)) dup.push(`${slug}: ${g}`);
				seen.add(g);
			}
		}
		expect(dup).toEqual([]);
	});
});
