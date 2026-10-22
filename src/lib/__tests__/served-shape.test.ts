/**
 * scripts/contract/served-shape.ts: what a served body carries that its
 * schema does not declare. A silent pass here would let a route test claim
 * conformance it never checked.
 */
import { describe, expect, it } from "vitest";
import { undeclaredInServed } from "../../../scripts/contract/served-shape";

const spec = {
	paths: {},
	components: {
		schemas: {
			Row: { type: "object", properties: { id: { type: "string" } } },
		},
	},
};
const check = (schema: unknown, value: unknown) =>
	undeclaredInServed(spec, schema, value);

describe("undeclaredInServed", () => {
	it("names an undeclared field, an undeclared null and a value outside its enum", () => {
		const schema = {
			type: "object",
			properties: {
				a: { type: "string", enum: ["x"] },
				b: { type: "integer" },
			},
		};
		expect(check(schema, { a: "y", b: null, c: 1 })).toEqual([
			"undeclared field: $.c",
			"undeclared null: $.b",
			'value not in enum: $.a = "y"',
		]);
	});

	it("a $ref that resolves to nothing is a finding, not a pass", () => {
		expect(
			check({ $ref: "#/components/schemas/Missing" }, { id: "1" }),
		).toEqual(["unresolvable $ref: $ (#/components/schemas/Missing)"]);
		expect(check({ $ref: "#/components/schemas/Row" }, { id: "1" })).toEqual(
			[],
		);
	});

	it("an object or array served where the schema declares no properties or items is a finding", () => {
		const schema = {
			type: "object",
			properties: {
				meta: { type: "object", description: "anything" },
				rows: { type: "array" },
			},
		};
		expect(check(schema, { meta: { a: 1 }, rows: [1] })).toEqual([
			"undeclared items: $.rows[] (the schema declares none)",
			"undeclared shape: $.meta (the schema declares no properties)",
		]);
		// Served empty, they carry nothing undeclared.
		expect(check(schema, { meta: {}, rows: [] })).toEqual([]);
	});

	it("an open map allows any key, and its declared children are still judged", () => {
		const schema = {
			type: "object",
			additionalProperties: true,
			properties: { n: { type: "integer" } },
		};
		expect(check(schema, { anything: { deep: 1 }, n: null })).toEqual([
			"undeclared null: $.n",
		]);
	});
});
