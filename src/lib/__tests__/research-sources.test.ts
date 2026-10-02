import { describe, expect, it } from "vitest";
import { requestedSources } from "../research-sources";

const sp = (q: string) => new URLSearchParams(q);

describe("requestedSources", () => {
	it("leaves a single-source or unscoped request to the single path", () => {
		expect(requestedSources(sp("q=x"))).toBeNull();
		expect(requestedSources(sp("q=x&source=cap"))).toBeNull();
	});
	it("reads a comma in source as several sources, in order", () => {
		expect(requestedSources(sp("q=x&source=cap,sep,dev-docs"))).toEqual([
			"cap",
			"sep",
			"dev-docs",
		]);
	});
	it("reads sources, trims, drops empties and duplicates, and folds in source", () => {
		expect(
			requestedSources(sp("sources=cap,%20cap,,sep%20&source=audit")),
		).toEqual(["cap", "sep", "audit"]);
		expect(requestedSources(sp("sources="))).toEqual([]);
	});
});
