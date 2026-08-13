import { describe, expect, it } from "vitest";
import { docKindOf, docVersionStatus } from "../doc-freshness";

describe("doc-freshness", () => {
	it("specs are canonical regardless of age", () => {
		expect(docKindOf({ source: "cap" })).toBe("spec");
		expect(docKindOf({ source: "sep" })).toBe("spec");
	});
	it("guides are staleness-sensitive", () => {
		expect(docKindOf({ source: "developers-docs", title: "Getting started with Soroban" })).toBe("guide");
	});
	it("blog posts are articles", () => {
		expect(docKindOf({ source: "sdf-blog" })).toBe("article");
	});
	it("wasm32-unknown-unknown marks content deprecated (the Beacon Q2 case)", () => {
		expect(docVersionStatus("cargo build --target wasm32-unknown-unknown")).toBe("deprecated");
	});
	it("wasm32v1-none is current; version-free prose is null, never unknown", () => {
		expect(docVersionStatus("build with wasm32v1-none")).toBe("current");
		expect(docVersionStatus("Stellar is a payment network.")).toBeNull();
	});
	it("pinned SDK majors go through the dated table", () => {
		expect(docVersionStatus('soroban-sdk = "23.0.0"')).toBeTruthy();
	});
});
