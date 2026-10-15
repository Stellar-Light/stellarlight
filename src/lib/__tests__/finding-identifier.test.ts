import { describe, expect, it } from "vitest";
import {
	advisoryIdentifierTargets,
	exactKeyReport,
	exactKeysOf,
	exactMissNote,
	exactPin,
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

// sls-090: CVE-2026-24889 and GHSA-96xm-fv9w-pf3f returned neighbours that
// carried neither id, with no exactMiss.
describe("advisoryIdentifierTargets", () => {
	it("finds CVE and GHSA ids in GitHub's casing", () => {
		expect(
			advisoryIdentifierTargets("cve-2026-24889 aka ghsa-96XM-fv9w-pf3f"),
		).toEqual(["CVE-2026-24889", "GHSA-96xm-fv9w-pf3f"]);
	});

	it("never reads a finding id or a CAP as an advisory", () => {
		expect(advisoryIdentifierTargets("V-SOR-VUL-002 and CAP-0038")).toEqual([]);
		expect(findingIdentifierTargets("GHSA-96xm-fv9w-pf3f")).toEqual([]);
		expect(findingIdentifierTargets("CVE-2026-24889")).toEqual([]);
	});

	it("pins a chunk that carries the id in its text or link", () => {
		const pin = exactPin("GHSA-96xm-fv9w-pf3f");
		expect(
			pin({
				url: "https://github.com/stellar/rs-soroban-sdk/releases/tag/v25.0.2",
				title: "rs-soroban-sdk v25.0.2",
				content:
					"Fix range bound overflow (https://github.com/stellar/rs-soroban-sdk/security/advisories/GHSA-96xm-fv9w-pf3f)",
			}),
		).toBe(true);
		expect(
			pin({
				url: "https://github.com/stellar/rs-soroban-sdk/releases/tag/v25.3.2",
				title: "rs-soroban-sdk v25.3.2",
				content: "unrelated release notes",
			}),
		).toBe(false);
	});
});

// The audit of the first sls-090 fix: exactMiss claimed scope-wide absence
// from the served rows alone, and a substring test read CVE-2026-2488 as
// present inside CVE-2026-24889.
describe("exact-key report", () => {
	const advisory = {
		url: "https://github.com/stellar/rs-soroban-sdk/security/advisories/GHSA-96xm-fv9w-pf3f",
		title: "rs-soroban-sdk GHSA-96xm-fv9w-pf3f (CVE-2026-24889)",
		content: "Overflow in Bytes::slice.",
	};
	const release = {
		url: "https://github.com/stellar/rs-soroban-sdk/releases/tag/v25.0.2",
		title: "rs-soroban-sdk v25.0.2",
		content: "Fix range bound overflow.",
	};

	it("matches an id only as a whole token", () => {
		expect(identifierIsPresent("CVE-2026-2488", [advisory.title])).toBe(false);
		expect(identifierIsPresent("CVE-2026-24889", [advisory.title])).toBe(true);
		expect(exactPin("CVE-2026-2488")(advisory)).toBe(false);
	});

	it("a key on the page is found", () => {
		const r = exactKeyReport({
			query: "CVE-2026-24889",
			scope: [advisory],
			served: [advisory],
			lookupFailed: false,
		});
		expect(r).toEqual({ exactMiss: null, heldNotServed: [] });
	});

	it("a key held but left off the page is said, never called absent", () => {
		const r = exactKeyReport({
			query: "GHSA-x2hw-px52-wp4m CVE-2026-24889 rs-soroban-sdk v25.0.2",
			scope: [advisory, release],
			served: [],
			lookupFailed: false,
		});
		expect(r.heldNotServed).toEqual([
			"CVE-2026-24889",
			"rs-soroban-sdk v25.0.2",
		]);
		expect(r.exactMiss?.identifiers).toEqual(["GHSA-x2hw-px52-wp4m"]);
	});

	it("a miss after a failed lookup is unchecked, not absent", () => {
		const r = exactKeyReport({
			query: "CVE-2099-00001",
			scope: [],
			served: [],
			lookupFailed: true,
		});
		expect(r.exactMiss?.note).toMatch(/unknown/);
		expect(r.exactMiss?.note).not.toMatch(/No document in the searched scope/);
	});

	it("each row names the exact keys it carries; [] is a neighbour", () => {
		const q = "CVE-2026-24889 rs-soroban-sdk v25.0.2";
		expect(exactKeysOf(q, advisory)).toEqual(["CVE-2026-24889"]);
		expect(exactKeysOf(q, release)).toEqual(["rs-soroban-sdk v25.0.2"]);
		expect(exactKeysOf("CVE-2026-2488", advisory)).toEqual([]);
		// No exact key in the query: the field stays absent.
		expect(exactKeysOf("soroban bytes overflow", advisory)).toBeNull();
	});

	it("a release-tag miss says only that no release document carries it", () => {
		const note = exactMissNote(["rs-soroban-sdk v22.0.0"], false);
		expect(note).toMatch(/No release document titled rs-soroban-sdk v22.0.0/);
		expect(note).not.toMatch(/infer content/);
	});
});
