/** 2026-11-12: /api/analyze?dimension=toolchain served "deprecated 1284 of
 * 5865" under a basis reading "Soroban-SDK toolchain status per scanned repo",
 * and each deprecatedRepos row carried only its sorobanSdkVersion. The count
 * was Rust OR JS: 881 of those repos pin a soroban-sdk that is not deprecated
 * and are deprecated only through their JavaScript Stellar dependency. An external
 * README then cited "1,285 on a deprecated soroban-sdk". These pin the split:
 * one count per SDK line, the combined one, and a reason on every row. Repo
 * search rows carry the same per-SDK reading. */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { spec } from "@/lib/openapi-spec";
import { searchRepos } from "@/lib/repo-search";
import {
	JS_SDK_ASOF,
	JS_SDK_SUPPORTED_FLOOR_MAJOR,
	PUBLISHER_DEPRECATED_JS_PACKAGES,
	SUPPORTED_FLOOR_MAJOR,
	TABLE_ASOF,
} from "@/lib/soroban-versions";

type Doc = Record<string, unknown>;
const h = vi.hoisted(() => ({
	docs: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: {
			collection: string;
			select?: Record<string, boolean>;
		}) => {
			// Apply the select the way the database does: a field the route's
			// select leaves out reads as undefined.
			const docs = (h.docs[args.collection] ?? []).map((r) =>
				args.select && Object.values(args.select).some(Boolean)
					? Object.fromEntries(
							Object.entries(r).filter(([k]) => args.select?.[k]),
						)
					: r,
			);
			return { docs, totalDocs: docs.length };
		},
		create: vi.fn(async () => ({})),
	})),
}));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const { GET } = await import("@/app/api/analyze/route");
const toolchain = async () =>
	(
		(await (
			await GET(
				new NextRequest(
					"https://stellarlight.xyz/api/analyze?dimension=toolchain",
				),
			)
		).json()) as Doc
	).toolchain as Doc;

const repo = (
	fullName: string,
	sdk: string,
	js: string | null,
	stored: string,
) => ({
	fullName,
	projectSlug: null,
	sorobanSdkVersion: sdk,
	stellarJsDep: js,
	versionStatus: stored,
	ciPresent: true,
	testsPresent: false,
});

beforeEach(() => {
	h.docs = {
		repos: [
			// supported soroban-sdk, deprecated JS package: the 881-repo case
			repo("a/js-only", "26", "stellar-sdk@^10.4.1", "deprecated"),
			repo(
				"b/rust-only",
				"20.5.0",
				"@stellar/stellar-sdk@^17.0.0",
				"deprecated",
			),
			repo("c/both", "20.0.0", "stellar-sdk@^9.0.0", "deprecated"),
			// stored "current" from the 2026-08-11 table, when 27 was newest
			repo("d/fresh-27", "27.0.2", null, "current"),
			repo("e/newest", "29.0.1", "@stellar/stellar-sdk@^17.4.0", "current"),
		],
	};
});

describe("analyze toolchain: one count per SDK line", () => {
	it("serves the soroban-sdk, JS SDK and combined deprecated counts apart", async () => {
		const t = await toolchain();
		expect((t.bySorobanSdkStatus as Doc).deprecated).toBe(2);
		expect((t.byJsSdkStatus as Doc).deprecated).toBe(2);
		expect(t.deprecatedTotal).toBe(3);
		expect((t.byVersionStatus as Doc).deprecated).toBe(3);
	});

	it("gives every deprecated row its reason and both SDK versions", async () => {
		const rows = (await toolchain()).deprecatedRepos as Doc[];
		const by = Object.fromEntries(rows.map((r) => [r.fullName, r]));
		expect(by["a/js-only"]).toMatchObject({
			sorobanSdkVersion: "26",
			sorobanSdkStatus: "supported",
			stellarJsDep: "stellar-sdk@^10.4.1",
			jsSdkStatus: "deprecated",
			deprecatedBy: "js-sdk",
		});
		expect(by["b/rust-only"].deprecatedBy).toBe("soroban-sdk");
		expect(by["c/both"].deprecatedBy).toBe("both");
		expect(rows).toHaveLength(3);
	});

	it("derives status from the stored versions with the deployed table, not the stored status", async () => {
		const t = await toolchain();
		// d/fresh-27 was stored "current"; with 28 and 29 tabled it is supported.
		expect((t.bySorobanSdkStatus as Doc).current).toBe(1);
		expect((t.bySorobanSdkStatus as Doc).supported).toBe(2);
		expect((t.byVersionStatus as Doc).current).toBe(1);
	});

	it("the basis no longer calls the combined count a soroban-sdk status", async () => {
		const basis = String((await toolchain()).basis);
		expect(basis).not.toMatch(/^Soroban-SDK toolchain status per scanned repo/);
		expect(basis).toMatch(/either/i);
		expect(basis).toMatch(/bySorobanSdkStatus/);
		// The served package list is the code's, not a hand copy of it.
		expect(basis).toContain(
			`deprecated: ${[...PUBLISHER_DEPRECATED_JS_PACKAGES].join(", ")})`,
		);
		// byJsSdkStatus covers only repos that pin soroban-sdk.
		expect(basis).toMatch(/not an ecosystem-wide JavaScript count/);
	});

	it("lists rows deprecated on the soroban-sdk line before JS-only rows", async () => {
		// A consumer built its deprecated-version list from this sample, and a
		// JS-only row carrying soroban-sdk 27 marked every repo on 27 critical.
		// a/js-only is first in store order; it must come last.
		const rows = (await toolchain()).deprecatedRepos as Doc[];
		expect(rows.map((r) => r.deprecatedBy)).toEqual([
			"soroban-sdk",
			"both",
			"js-sdk",
		]);
	});

	it("fills the capped sample with soroban-sdk rows before any JS-only row", async () => {
		h.docs.repos = [
			...Array.from({ length: 60 }, (_, i) =>
				repo(`js/${i}`, "27.0.2", "stellar-sdk@^10.4.1", "deprecated"),
			),
			...Array.from({ length: 55 }, (_, i) =>
				repo(`rust/${i}`, "20.5.0", null, "deprecated"),
			),
		];
		const t = await toolchain();
		const rows = t.deprecatedRepos as Doc[];
		expect(rows).toHaveLength(50);
		expect(rows.every((r) => r.deprecatedBy === "soroban-sdk")).toBe(true);
		expect(t.deprecatedTotal).toBe(115);
		expect(t.deprecatedListTruncated).toBe(true);
	});

	it("keeps the fields an existing consumer parses: meta.generatedAt and each row's sorobanSdkVersion", async () => {
		const body = (await (
			await GET(
				new NextRequest(
					"https://stellarlight.xyz/api/analyze?dimension=toolchain",
				),
			)
		).json()) as Doc;
		expect(typeof (body.meta as Doc).generatedAt).toBe("string");
		const rows = (body.toolchain as Doc).deprecatedRepos as Doc[];
		expect(rows.map((r) => r.sorobanSdkVersion)).toEqual([
			"20.5.0",
			"20.0.0",
			"26",
		]);
	});

	it("serves the deprecation rule itself, so no consumer infers it from the sample", async () => {
		expect((await toolchain()).deprecationRule).toEqual({
			sorobanSdkMajorBelow: SUPPORTED_FLOOR_MAJOR,
			jsSdkMajorBelow: JS_SDK_SUPPORTED_FLOOR_MAJOR,
			jsDeprecatedPackages: [...PUBLISHER_DEPRECATED_JS_PACKAGES],
			sorobanSdkTableAsOf: TABLE_ASOF,
			jsSdkTableAsOf: JS_SDK_ASOF,
		});
	});

	it("never serves a scanner's non-JS marker as the JS dependency", async () => {
		h.docs.repos.push(
			repo("f/rust-infra", "20.0.0", "rust-infra:cargo.toml", "deprecated"),
		);
		const rows = (await toolchain()).deprecatedRepos as Doc[];
		const row = rows.find((r) => r.fullName === "f/rust-infra");
		expect(row).toMatchObject({
			stellarJsDep: null,
			jsSdkStatus: "unknown",
			deprecatedBy: "soroban-sdk",
		});
	});

	it("declares every new field in the spec", () => {
		// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
		const s: any = (spec as any).paths["/api/analyze"].get.responses["200"]
			.content["application/json"].schema;
		const t = s.properties.toolchain.properties;
		for (const k of [
			"sorobanSdkMajorBelow",
			"jsSdkMajorBelow",
			"jsDeprecatedPackages",
			"sorobanSdkTableAsOf",
			"jsSdkTableAsOf",
		])
			expect(t.deprecationRule.properties[k], k).toBeDefined();
		for (const k of ["bySorobanSdkStatus", "byJsSdkStatus", "deprecationRule"])
			expect(t[k], k).toBeDefined();
		const row = t.deprecatedRepos.items.properties;
		for (const k of [
			"sorobanSdkStatus",
			"stellarJsDep",
			"jsSdkStatus",
			"deprecatedBy",
		])
			expect(row[k], k).toBeDefined();
		expect(row.deprecatedBy.enum).toEqual(["soroban-sdk", "js-sdk", "both"]);
	});
});

describe("repo search codeVerified: the per-SDK reading", () => {
	it("serves both SDK statuses, the JS dependency, and a combined status from the deployed table", async () => {
		const doc = {
			fullName: "a/js-only",
			description: "a soroban wallet",
			primaryLanguage: "Rust",
			topics: [],
			repoScore: 50,
			stars: 1,
			codeScanState: "scanned",
			stellarProof: "cargo-sdk",
			codeSymbols: [],
			sorobanSdkVersion: "27.0.2",
			stellarJsDep: "stellar-sdk@^10.4.1",
			versionStatus: "current",
		};
		// biome-ignore lint/suspicious/noExplicitAny: mock payload
		const payload: any = {
			find: async () => ({ docs: [doc], totalDocs: 1 }),
		};
		const { repos } = await searchRepos(payload, "wallet", { limit: 5 });
		expect(repos[0].codeVerified).toMatchObject({
			sorobanSdkVersion: "27.0.2",
			sorobanSdkStatus: "supported",
			stellarJsDep: "stellar-sdk@^10.4.1",
			jsSdkStatus: "deprecated",
			versionStatus: "deprecated",
		});
	});
});
