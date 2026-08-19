import { describe, expect, it } from "vitest";
import { parseCsv, slugFromCell } from "../awards/csv";

describe("parseCsv", () => {
	it("lower-cases headers and trims cells", () => {
		expect(parseCsv("Project, Category \nDecaf, impact ")).toEqual([
			{ project: "Decaf", category: "impact" },
		]);
	});

	it("keeps commas inside quoted fields — blurbs are full sentences", () => {
		const rows = parseCsv(
			'project,blurb\nDecaf,"Payments, remittances, and more"',
		);
		expect(rows[0].blurb).toBe("Payments, remittances, and more");
	});

	it("unescapes doubled quotes", () => {
		const rows = parseCsv('project,blurb\nDecaf,"They call it ""the rail"""');
		expect(rows[0].blurb).toBe('They call it "the rail"');
	});

	it("handles CRLF and a trailing newline from a spreadsheet export", () => {
		const rows = parseCsv("project,category\r\nDecaf,impact\r\n");
		expect(rows).toHaveLength(1);
		expect(rows[0]).toEqual({ project: "Decaf", category: "impact" });
	});

	it("drops blank lines rather than emitting empty nominees", () => {
		expect(parseCsv("project,category\nDecaf,impact\n\n,\n")).toHaveLength(1);
	});

	it("returns nothing for a header with no data rows", () => {
		expect(parseCsv("project,category\n")).toEqual([]);
	});

	it("tolerates a short row — missing trailing columns read as empty", () => {
		expect(parseCsv("project,category,blurb\nDecaf,impact")).toEqual([
			{ project: "Decaf", category: "impact", blurb: "" },
		]);
	});
});

describe("slugFromCell", () => {
	it("pulls the slug out of a pasted project URL", () => {
		expect(
			slugFromCell("https://stellarlight.xyz/project/trustless-work"),
		).toBe("trustless-work");
	});
	it("passes a bare slug or name through untouched", () => {
		expect(slugFromCell("decaf")).toBe("decaf");
		expect(slugFromCell("Trustless Work")).toBe("Trustless Work");
	});
});
