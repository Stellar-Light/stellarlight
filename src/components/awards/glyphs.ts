import type { HighlightGlyph } from "./highlights";

/**
 * How many <i> parts each mechanism is drawn from. awards.css ("Highlight
 * glyphs") addresses them by nth-child, so the count is part of the glyph:
 * one short and a part is missing, one long and a stray mark shows.
 */
export const GLYPH_PARTS: Record<HighlightGlyph, number> = {
	pour: 4,
	flip: 2,
	fan: 3,
	fold: 2,
	charge: 5,
	mic: 5,
	curtain: 3,
	boil: 5,
	tap: 5,
	peel: 3,
	torch: 3,
	door: 4,
	book: 4,
	unbox: 3,
	gather: 5,
	orbit: 3,
	snap: 2,
	clink: 3,
	download: 3,
	pip: 2,
	expand: 3,
	puzzle: 3,
	menu: 3,
	dpad: 5,
	share: 5,
	press: 3,
	reload: 2,
	keypad: 9,
	launch: 2,
	layout: 3,
	shutter: 6,
	cards: 5,
	focus: 4,
	thataway: 3,
	steps: 4,
	domino: 4,
	chain: 9,
	memo: 4,
	stamp: 2,
	tab: 3,
};
