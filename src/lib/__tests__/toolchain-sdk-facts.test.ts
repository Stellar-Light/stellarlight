/** The toolchain block serves the dated SDK facts (src/data/sdk-facts.ts)
 * and the per-major adoption baseline, so a drift checker reads advisories,
 * package moves and deprecated idioms from the same call it already makes
 * instead of inferring them from the capped deprecatedRepos sample. */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	SDK_ADVISORIES,
	SDK_FACTS_ASOF,
	SDK_IDIOMS,
	SDK_PACKAGES,
} from "@/data/sdk-facts";
import { spec } from "@/lib/openapi-spec";

type Doc = Record<string, unknown>;
const h = vi.hoisted(() => ({
	docs: [] as Record<string, unknown>[],
	failJsRead: false,
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		// Applies `where: { field: { exists: true } }` the way the database
		// does, so each read sees its own population.
		find: async (args: { where?: Record<string, { exists?: boolean }> }) => {
			const [field] = Object.keys(args.where ?? {});
			if (field === "stellarJsDep" && h.failJsRead) throw new Error("down");
			const docs = field ? h.docs.filter((r) => r[field] != null) : h.docs;
			return { docs, totalDocs: docs.length };
		},
		create: vi.fn(async () => ({})),
	})),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const { GET } = await import("@/app/api/analyze/route");
const call = () =>
	GET(
		new NextRequest("https://stellarlight.xyz/api/analyze?dimension=toolchain"),
	);

const repo = (sdk: string | null, js: string | null) => ({
	fullName: `o/${sdk}-${js}`,
	projectSlug: null,
	sorobanSdkVersion: sdk,
	stellarJsDep: js,
	ciPresent: true,
	testsPresent: true,
});

beforeEach(() => {
	h.failJsRead = false;
	h.docs = [
		repo("29.0.1", "@stellar/stellar-sdk@^17.4.0"),
		repo("22.0.11", null),
		repo("22", "rust-infra:cargo.toml"),
		// JS-only repos: outside the soroban-sdk population, inside the JS one.
		repo(null, "@stellar/stellar-sdk@^14.2.0"),
		repo(null, "@stellar/stellar-sdk@^14.0.0"),
		repo(null, "@stellar/freighter-api@6.0.1"),
	];
});

describe("toolchain SDK facts", () => {
	it("serves the dated advisories, packages and idioms verbatim", async () => {
		const t = ((await (await call()).json()) as Doc).toolchain as Doc;
		expect(t.factsAsOf).toBe(SDK_FACTS_ASOF);
		expect(t.advisories).toEqual(SDK_ADVISORIES);
		expect(t.packages).toEqual(SDK_PACKAGES);
		expect(t.idioms).toEqual(SDK_IDIOMS);
	});

	it("counts each line's majors over its own population", async () => {
		const t = ((await (await call()).json()) as Doc).toolchain as Doc;
		expect(t.adoption).toMatchObject({
			sorobanSdk: {
				repos: 3,
				readable: 3,
				byMajor: [
					{ major: 29, repos: 1, share: 0.3333 },
					{ major: 22, repos: 2, share: 0.6667 },
				],
			},
			jsSdk: {
				// 5 rows store a JS dependency; rust-infra:cargo.toml is a scanner
				// language marker, not an npm package
				reposWithNpmDependency: 4,
				repos: 3,
				readable: 3,
				byMajor: [
					{ major: 17, repos: 1, share: 0.3333 },
					{ major: 14, repos: 2, share: 0.6667 },
				],
			},
		});
	});

	it("answers 503 when the JS read fails, never a block without the JS line", async () => {
		h.failJsRead = true;
		expect((await call()).status).toBe(503);
	});

	it("declares every key it serves", async () => {
		const t = ((await (await call()).json()) as Doc).toolchain as Doc;
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const schema = (spec as any).paths["/api/analyze"].get.responses["200"]
			.content["application/json"].schema.properties.toolchain.properties;
		for (const k of Object.keys(t)) expect(Object.keys(schema)).toContain(k);
		const adoption = t.adoption as Record<string, Doc>;
		for (const k of Object.keys(adoption))
			expect(Object.keys(schema.adoption.properties)).toContain(k);
		for (const k of Object.keys(adoption.jsSdk))
			expect(
				Object.keys(schema.adoption.properties.jsSdk.properties),
			).toContain(k);
		const adv = (t.advisories as Doc[]).find(
			(a) => a.ghsa === "GHSA-4chv-4c6w-w254",
		);
		for (const k of Object.keys(adv ?? {}))
			expect(Object.keys(schema.advisories.items.properties)).toContain(k);
		for (const k of Object.keys((adv?.alsoAffects as Doc[])[0]))
			expect(
				Object.keys(
					schema.advisories.items.properties.alsoAffects.items.properties,
				),
			).toContain(k);
		for (const k of Object.keys((t.packages as Doc[])[0]))
			expect(Object.keys(schema.packages.items.properties)).toContain(k);
	});

	it("tells a consumer to check the lockfile, never that an unnamed package is clear", async () => {
		const t = ((await (await call()).json()) as Doc).toolchain as Doc;
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const schema = (spec as any).paths["/api/analyze"].get.responses["200"]
			.content["application/json"].schema.properties.toolchain.properties;
		for (const text of [String(t.basis), schema.advisories.description]) {
			expect(text).toMatch(/lockfile|Cargo\.lock/);
			expect(text).not.toMatch(/not covered/);
			expect(text).toMatch(/alsoAffects/);
		}
	});
});
