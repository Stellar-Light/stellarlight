import { describe, expect, it } from "vitest";
import {
	findingIdentifierTargets,
	identifierIsPresent,
} from "../research-rank";

describe("findingIdentifierTargets", () => {
	it("finds an audit finding id in a query", () => {
		expect(findingIdentifierTargets("what is V-SOR-VUL-002")).toEqual([
			"V-SOR-VUL-002",
		]);
	});

	it("finds the longer four-group form", () => {
		expect(findingIdentifierTargets("V-SOR-APP-VUL-003 details")).toEqual([
			"V-SOR-APP-VUL-003",
		]);
	});

	it("is case-insensitive and dedupes", () => {
		expect(
			findingIdentifierTargets("v-sor-vul-002 and again V-SOR-VUL-002"),
		).toEqual(["V-SOR-VUL-002"]);
	});

	it("does NOT match CAP/SEP — those are url-pinned documents, handled apart", () => {
		expect(findingIdentifierTargets("CAP-0038")).toEqual([]);
		expect(findingIdentifierTargets("what does SEP-0010 do")).toEqual([]);
	});

	it("ignores ordinary prose", () => {
		expect(
			findingIdentifierTargets("how do soroban auth patterns work"),
		).toEqual([]);
		expect(findingIdentifierTargets(undefined)).toEqual([]);
	});
});

describe("identifierIsPresent", () => {
	it("is true only on a verbatim hit", () => {
		expect(
			identifierIsPresent("V-SOR-VUL-002", [
				"The finding V-SOR-VUL-002 concerns authorization.",
			]),
		).toBe(true);
	});

	it("is case-insensitive", () => {
		expect(identifierIsPresent("V-SOR-VUL-002", ["see v-sor-vul-002"])).toBe(
			true,
		);
	});

	it("a near neighbour is NOT a hit — the whole point of sls-071", () => {
		// The boilerplate that outscored the real identifier held no id at all.
		expect(
			identifierIsPresent("V-SOR-APP-VUL-003", [
				"Findings are classified by severity and category.",
				"The finding V-SOR-VUL-002 concerns authorization.",
			]),
		).toBe(false);
	});

	it("tolerates null and undefined chunk text", () => {
		expect(identifierIsPresent("V-SOR-VUL-002", [null, undefined])).toBe(false);
	});
});
