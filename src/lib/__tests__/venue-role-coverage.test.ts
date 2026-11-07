/**
 * The nightly guard behind sls-113 (#1905): a Live DEX row with no venueRole
 * drops out of every venue count without a word, so each one must be
 * classified, re-typed, moved off Live, or excused in VENUE_ROLE_UNRESOLVED
 * with a dated reason. scripts/check-record-completeness.ts (S4) files every
 * row this returns as a nightly failure.
 */
import { describe, expect, it } from "vitest";
import {
	VENUE_ROLE,
	VENUE_ROLE_UNRESOLVED,
} from "../../../scripts/data/curation-maps";
import { unclassifiedLiveDexRows } from "../venue-role-coverage";

const row = (slug: string, over: Record<string, unknown> = {}) => ({
	slug,
	status: "Live",
	types: ["DEX"],
	venueRole: null,
	...over,
});
const slugs = (rows: { slug: string }[]) => rows.map((r) => r.slug);

describe("unclassifiedLiveDexRows", () => {
	it("returns a Live DEX row with no role and no documented reason", () => {
		expect(slugs(unclassifiedLiveDexRows([row("a")], {}))).toEqual(["a"]);
	});
	it("passes a row with a role, a documented reason, another status or no DEX type", () => {
		const rows = [
			row("role", { venueRole: "amm" }),
			row("why"),
			row("retired", { status: "Inactive" }),
			row("wallet", { types: ["Wallet"] }),
			row("untyped", { types: null }),
		];
		expect(
			unclassifiedLiveDexRows(rows, { why: "2026-11-07: reason" }),
		).toEqual([]);
	});
	it("checks status and type itself, so a filter the route dropped cannot pass a row", () => {
		const rows = [row("live"), row("dev", { status: "Development" })];
		expect(slugs(unclassifiedLiveDexRows(rows, {}))).toEqual(["live"]);
	});
	it("a blank reason or an inherited key documents nothing", () => {
		const rows = [row("blank"), row("constructor"), row("toString")];
		expect(slugs(unclassifiedLiveDexRows(rows, { blank: "  " }))).toEqual([
			"blank",
			"constructor",
			"toString",
		]);
	});
});

describe("VENUE_ROLE_UNRESOLVED", () => {
	// Empty on 2026-11-07, when every row had a recorded state; this holds the
	// next entry to the same shape.
	it("every reason is dated, and no classified row is also excused", () => {
		for (const [slug, why] of Object.entries(VENUE_ROLE_UNRESOLVED)) {
			expect(why, slug).toMatch(/\b20\d\d-\d\d-\d\d\b/);
			expect(VENUE_ROLE[slug], slug).toBeUndefined();
		}
	});
});
