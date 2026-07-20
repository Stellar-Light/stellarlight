import { describe, expect, it } from "vitest";
import { parseFields, pickFields } from "../http-params";

// ?fields= projection (openapi@1.8.10): rows shrink to the requested keys,
// identity keys always survive, unknown names degrade silently (additive
// contract — a renamed field must not break a caller), meta is untouched
// because routes only ever map the rows array.
describe("parseFields", () => {
	it("absent/empty → null (full row)", () => {
		expect(parseFields(null)).toBeNull();
		expect(parseFields("")).toBeNull();
		expect(parseFields(" , ,")).toBeNull();
	});

	it("splits, trims, lowercases", () => {
		const set = parseFields(" Name, tvlUSD ,slug");
		expect(set).not.toBeNull();
		expect([...(set as Set<string>)].sort()).toEqual([
			"name",
			"slug",
			"tvlusd",
		]);
	});
});

describe("pickFields", () => {
	const row = {
		id: "p1",
		slug: "blend",
		name: "Blend",
		tvlUSD: 12345,
		onchain: { contracts: [{ address: "C..." }] },
		shortDescription: "lending",
	};

	it("null wanted → row unchanged (absent fields= is the old contract)", () => {
		expect(pickFields(row, null)).toBe(row);
	});

	it("projects to requested keys, case-insensitive", () => {
		const out = pickFields(row, parseFields("name,TVLUSD"));
		expect(Object.keys(out).sort()).toEqual(["id", "name", "slug", "tvlUSD"]);
	});

	it("identity keys always kept even when not requested", () => {
		const out = pickFields(row, parseFields("shortDescription"));
		expect(out.id).toBe("p1");
		expect(out.slug).toBe("blend");
		expect(out.name).toBeUndefined();
	});

	it("unknown names ignored, never throw", () => {
		const out = pickFields(row, parseFields("name,noSuchField"));
		expect(Object.keys(out).sort()).toEqual(["id", "name", "slug"]);
	});

	it("nested objects are whole-key selections", () => {
		const out = pickFields(row, parseFields("onchain"));
		expect(out.onchain).toEqual(row.onchain);
	});

	it("rows without slug keep their own identity keys (repos/builders)", () => {
		const repo = { fullName: "org/repo", url: "https://x", stars: 5 };
		const out = pickFields(repo, parseFields("stars"));
		expect(Object.keys(out).sort()).toEqual(["fullName", "stars", "url"]);
	});
});
