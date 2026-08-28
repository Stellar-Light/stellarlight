import { describe, expect, it } from "vitest";
import { spec } from "../openapi-spec";

/** sls-077: the verify request accepted `issued` while the 200 response enum
 * still read audited/live/maintained — two hand-maintained copies of one
 * enum, drifted. A generated consumer could not project a valid live
 * response from the contract, and Raven gates exposure of GET /api/verify on
 * exactly this. The spec now declares ONE shared enum; this test pins the
 * two projections of it to each other so the drift class cannot reopen. */
describe("verifyClaim claim-type enum parity (sls-077)", () => {
	// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
	const op: any = (spec as any).paths["/api/verify"].get;

	it("request type enum and 200 claim.type enum are the same set", () => {
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const param = op.parameters.find((p: any) => p.name === "type");
		const requestEnum: string[] = param.schema.enum;
		const responseEnum: string[] =
			op.responses["200"].content["application/json"].schema.properties.claim
				.properties.type.enum;
		expect([...responseEnum].sort()).toEqual([...requestEnum].sort());
	});

	it("every live claim family is in the enum", () => {
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const param = op.parameters.find((p: any) => p.name === "type");
		for (const t of ["audited", "live", "maintained", "issued"])
			expect(param.schema.enum).toContain(t);
	});
});
