// @vitest-environment node

/**
 * Every moment names its own mechanism, the mock round included: the owner's
 * ask was marks that relate to what the moment says, and a kind-level default
 * had put the same mark on every launch and every reach. A name is only real
 * when awards.css draws it and glyphs.ts says how many parts it has, or the
 * icon box renders empty; and a mechanism no moment names is dead CSS.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLYPH_PARTS } from "./glyphs";
import { NOMINEE_HIGHLIGHTS } from "./highlights";

const css = readFileSync(new URL("./awards.css", import.meta.url), "utf8");

describe("nominee highlight glyphs", () => {
	it("every moment names a glyph the library draws", () => {
		const bad: string[] = [];
		for (const [slug, moments] of Object.entries(NOMINEE_HIGHLIGHTS)) {
			for (const m of moments) {
				if (!m.glyph || !(m.glyph in GLYPH_PARTS))
					bad.push(`${slug}: ${m.headline} (${m.glyph ?? "none"})`);
			}
		}
		expect(bad).toEqual([]);
	});

	it("no sheet repeats a glyph", () => {
		const dup: string[] = [];
		for (const [slug, moments] of Object.entries(NOMINEE_HIGHLIGHTS)) {
			const seen = new Set<string>();
			for (const m of moments) {
				if (seen.has(m.glyph)) dup.push(`${slug}: ${m.glyph}`);
				seen.add(m.glyph);
			}
		}
		expect(dup).toEqual([]);
	});

	it("awards.css draws every glyph, and every glyph is used", () => {
		const undrawn = Object.keys(GLYPH_PARTS).filter(
			(g) => !css.includes(`.awards-sm .sm-hk-${g} `),
		);
		expect(undrawn).toEqual([]);
		const used = new Set(
			Object.values(NOMINEE_HIGHLIGHTS).flatMap((ms) => ms.map((m) => m.glyph)),
		);
		const unused = Object.keys(GLYPH_PARTS).filter(
			(g) => !used.has(g as never),
		);
		expect(unused).toEqual([]);
	});
});
