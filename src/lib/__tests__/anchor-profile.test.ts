/**
 * searchProjects' anchorProfile follows the partner rows' rules (#1909): the
 * join copied a partner's raw assets, seps and rampTypes, so a curated
 * anchor read `seps: []` beside its ramps (the spec's "proprietary ramp"
 * claim) and `profileState: "profiled"` ("verified-filled") with no
 * stellar.toml read recorded. The join never even selected the read stamps.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { spec } from "@/lib/openapi-spec";
import { ANCHOR_PROFILE_SELECT, anchorProfileOf } from "@/lib/partner-public";

const READ = {
	tomlSourceUrl: "https://read.example/.well-known/stellar.toml",
	tomlFetchedAt: "2026-09-29",
};
const anchor = (over: Record<string, unknown>) => ({
	name: "Anchor X",
	slug: "anchor-x",
	country: "Mexico",
	regions: ["latam"],
	assets: [{ code: "USDC" }],
	seps: [],
	rampTypes: ["on-ramp", "off-ramp"],
	tomlSourceUrl: null,
	tomlFetchedAt: null,
	...over,
});

describe("anchorProfile", () => {
	it("keeps a curated anchor's toml facts unknown and calls it not profiled", () => {
		const p = anchorProfileOf(anchor({}));
		expect(p.assets).toBeNull();
		expect(p.seps).toBeNull();
		expect(p.rampTypes).toEqual(["on-ramp", "off-ramp"]);
		expect(p.profileState).toBe("not-profiled");
	});

	it.each([
		["a date without its URL", { tomlFetchedAt: "2026-09-29" }],
		["a URL without its date", { tomlSourceUrl: READ.tomlSourceUrl }],
	])("treats %s as no read", (_, over) => {
		const p = anchorProfileOf(anchor(over));
		expect(p.seps).toBeNull();
		expect(p.profileState).toBe("not-profiled");
	});

	it("serves a recorded read's facts, and [] only when it found none", () => {
		const read = anchorProfileOf(anchor({ ...READ, seps: ["sep-24"] }));
		expect(read).toMatchObject({
			assets: ["USDC"],
			seps: ["sep-24"],
			profileState: "profiled",
		});
		const none = anchorProfileOf(
			anchor({ ...READ, assets: [], seps: [], rampTypes: [] }),
		);
		expect(none).toMatchObject({
			assets: [],
			seps: [],
			rampTypes: null,
			profileState: "profiled",
		});
	});

	it("serves null for curated lists nobody recorded", () => {
		const p = anchorProfileOf(anchor({ regions: [], rampTypes: [] }));
		expect(p.regions).toBeNull();
		expect(p.rampTypes).toBeNull();
	});

	it("reads the read stamps, and the route builds every profile with it", () => {
		expect(ANCHOR_PROFILE_SELECT).toMatchObject({
			tomlSourceUrl: true,
			tomlFetchedAt: true,
		});
		const route = readFileSync(
			join(process.cwd(), "src/app/api/projects/search/route.ts"),
			"utf8",
		);
		expect(route).toContain("select: ANCHOR_PROFILE_SELECT");
		expect(route).toContain("anchorProfileOf(d)");
	});

	it("declares the nulls it can serve", () => {
		const found: Array<Record<string, { nullable?: boolean }>> = [];
		const walk = (n: unknown) => {
			if (!n || typeof n !== "object") return;
			const o = n as Record<string, unknown>;
			const ap = (o.properties as Record<string, unknown> | undefined)
				?.anchorProfile as {
				properties?: Record<string, { nullable?: boolean }>;
			};
			if (ap?.properties) found.push(ap.properties);
			for (const v of Object.values(o)) walk(v);
		};
		walk(spec);
		expect(found.length).toBeGreaterThan(0);
		for (const f of found)
			for (const k of ["regions", "assets", "seps", "rampTypes"])
				expect(f[k]?.nullable, `anchorProfile.${k} must be nullable`).toBe(
					true,
				);
	});
});
