// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "../awards/csv";

describe("toCsv", () => {
	it("round-trips through parseCsv", () => {
		const rows = [
			{ address: "GAAA", impact: "decaf", note: "plain" },
			{ address: "GBBB", impact: "beans", note: 'has "quotes", a comma' },
			{ address: "GCCC", impact: "meru", note: "line\nbreak" },
		];
		const back = parseCsv(toCsv(rows));
		expect(back).toHaveLength(3);
		expect(back[1].note).toBe('has "quotes", a comma');
		expect(back[2].note).toBe("line\nbreak");
	});

	it("quotes only what needs quoting", () => {
		const out = toCsv([{ a: "plain", b: "with,comma" }], ["a", "b"]);
		expect(out).toBe('a,b\r\nplain,"with,comma"\r\n');
	});

	it("defuses values a spreadsheet would run as a formula", () => {
		// a ballot export is opened in Airtable and Excel; =/+/-/@ lead a formula
		const out = toCsv([{ v: "=1+1" }, { v: "@SUM(A1)" }], ["v"]);
		expect(out).toContain("'=1+1");
		expect(out).toContain("'@SUM(A1)");
	});

	it("keeps a stable column set across ragged rows", () => {
		const out = toCsv([{ a: "1" }, { b: "2" }]);
		expect(out.split("\r\n")[0]).toBe("a,b");
		expect(out.split("\r\n")[1]).toBe("1,");
	});

	it("writes empty for null and undefined, not the words", () => {
		const out = toCsv([{ a: null, b: undefined, c: 0 }], ["a", "b", "c"]);
		expect(out).toBe("a,b,c\r\n,,0\r\n");
	});
});
