import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spec } from "../openapi-spec";
import { DEPLOYMENT_NETWORKS, pickDeployment } from "../project-deployment";

/** sls-079: deployment is a separate, evidence-backed fact beside status.
 * These tests pin the semantics the field's honesty depends on. */
describe("pickDeployment semantics", () => {
	it("no stored group serves an explicit unknown, never a guess", () => {
		expect(pickDeployment(null)).toEqual({
			network: "unknown",
			basis: null,
			sourceUrl: null,
			asOf: null,
		});
		expect(pickDeployment(undefined).network).toBe("unknown");
		expect(pickDeployment({}).network).toBe("unknown");
	});

	it("an unrecognized stored network degrades to unknown, not passthrough", () => {
		expect(pickDeployment({ network: "devnet" }).network).toBe("unknown");
	});

	it("unknown carries NO provenance — basis/sourceUrl describe evidence and unknown means there is none", () => {
		const out = pickDeployment({
			network: "unknown",
			basis: "stale-junk",
			sourceUrl: "https://example.com",
			asOf: "2026-01-01",
		});
		expect(out).toEqual({
			network: "unknown",
			basis: null,
			sourceUrl: null,
			asOf: null,
		});
	});

	it("evidenced networks pass provenance through untouched", () => {
		expect(
			pickDeployment({
				network: "testnet",
				basis: "human-verified",
				sourceUrl: "https://stellars.finance/assets/index-3HEaNhUX.js",
				asOf: "2026-08-28",
			}),
		).toEqual({
			network: "testnet",
			basis: "human-verified",
			sourceUrl: "https://stellars.finance/assets/index-3HEaNhUX.js",
			asOf: "2026-08-28",
		});
		expect(pickDeployment({ network: "mainnet" })).toEqual({
			network: "mainnet",
			basis: null,
			sourceUrl: null,
			asOf: null,
		});
	});
});

describe("deployment contract parity", () => {
	it("the spec's network enum and the serializer's are the same set", () => {
		// The response schema sits behind a $ref; resolve it through components.
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const anySpec: any = spec;
		let schema =
			anySpec.paths["/api/projects/search"].get.responses["200"].content[
				"application/json"
			].schema;
		const deref = (node: any): any =>
			node?.$ref
				? anySpec.components.schemas[node.$ref.replace(/^.*\//, "")]
				: node;
		schema = deref(schema);
		const item = deref(schema.properties.projects.items);
		const specEnum: string[] =
			item.properties.deployment.properties.network.enum;
		expect([...specEnum].sort()).toEqual([...DEPLOYMENT_NETWORKS].sort());
	});

	it("every search-route row builder uses the ONE shared serializer (the sls-079 three-builder drift class)", () => {
		const route = readFileSync(
			join(process.cwd(), "src/app/api/projects/search/route.ts"),
			"utf8",
		);
		const builders = route.match(/statusConfidence: factConfidence\(/g) ?? [];
		// The serializer must receive the row's slug, or the registry fill
		// (sls-023) silently never applies — a bare pickDeployment(x.deployment)
		// would satisfy a looser regex while serving unknown for every issuer.
		const shared =
			route.match(
				/deployment: pickDeployment\((\w+)\.deployment, \1\.slug\)/g,
			) ?? [];
		// One pickDeployment call per row builder; an inline `deployment: {`
		// block in the route would be the drift class reopening.
		expect(shared.length).toBe(builders.length);
		expect(route).not.toMatch(/deployment: \{\s*\n\s*network:/);
	});
});
