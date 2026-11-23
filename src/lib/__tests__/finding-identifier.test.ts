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
		// A finding id usually sits in the chunk text, not the title.
		const report = {
			url: "https://example.com/audits/soroban-report",
			title: "Soroban SDK audit report",
			content: "V-SOR-VUL-002: missing authorization check in transfer.",
		};
		expect(exactKeysOf("V-SOR-VUL-002", report)).toEqual(["V-SOR-VUL-002"]);
		// No exact key in the query: the field stays absent.
		expect(exactKeysOf("soroban bytes overflow", advisory)).toBeNull();
	});

	it("a GHSA id is one key, never also a finding id", () => {
		// GHSA-c9fg-jmpq-2345 holds C9FG-JMPQ-2345, which reads as a finding id.
		expect(findingIdentifierTargets("GHSA-c9fg-jmpq-2345")).toEqual([]);
		const r = exactKeyReport({
			query: "GHSA-c9fg-jmpq-2345",
			scope: [],
			served: [],
			lookupFailed: false,
		});
		expect(r.exactMiss?.identifiers).toEqual(["GHSA-c9fg-jmpq-2345"]);
	});

	it("a release-tag miss says only that no release document carries it", () => {
		const note = exactMissNote(["rs-soroban-sdk v22.0.0"], false);
		expect(note).toMatch(/No release document titled rs-soroban-sdk v22.0.0/);
		expect(note).not.toMatch(/infer content/);
	});
});

// sls-118: a proposal number (SLP-0006, CAP-0077, SEP-0010) names a whole
// document, so every chunk of that proposal carries it, and a chunk of another
// document that cites it does not: the citation is a neighbour, not the record.
describe("proposal numbers are exact keys", () => {
	const slpHeader = {
		url: "https://github.com/stellar/stellar-protocol/blob/master/limits/slp-0006.md",
		title: "Freeze YieldBlox Exploit Stellar Accounts",
		content:
			"SLP-0006: Freeze YieldBlox Exploit Stellar Accounts. Status: Final. Created: 2026-05-07.",
	};
	const slpBody = {
		...slpHeader,
		content:
			"## Rationale\n\nThe frozen ledger keys stop the exploit accounts.",
	};
	const cap = {
		url: "https://github.com/stellar/stellar-protocol/blob/master/core/cap-0077.md",
		title: "CAP-0077: Ability to freeze ledger keys via network configuration",
		content: "Used on Mainnet by SLP-0006 and SLP-0008.",
	};
	const sep = {
		url: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md",
		title: "Stellar Web Authentication",
		content: "This SEP defines the standard way for clients to authenticate.",
	};

	it("every chunk of the named proposal carries its number", () => {
		expect(exactKeysOf("SLP-0006 freeze YieldBlox", slpHeader)).toEqual([
			"SLP-0006",
		]);
		expect(exactKeysOf("slp-6", slpBody)).toEqual(["SLP-0006"]);
		expect(exactKeysOf("sep-10 web auth", sep)).toEqual(["SEP-0010"]);
	});

	it("a document that cites the number is a neighbour", () => {
		expect(exactKeysOf("SLP-0006", cap)).toEqual([]);
		expect(exactKeysOf("CAP-0077 SLP-0006", cap)).toEqual(["CAP-0077"]);
		expect(exactKeysOf("CAP-0077 SLP-0006", slpBody)).toEqual(["SLP-0006"]);
	});

	it("a proposal the scope lacks is a miss, one held off the page is said", () => {
		const r = exactKeyReport({
			query: "CAP-0099 SEP-0010",
			scope: [sep],
			served: [],
			lookupFailed: false,
		});
		expect(r.heldNotServed).toEqual(["SEP-0010"]);
		expect(r.exactMiss?.identifiers).toEqual(["CAP-0099"]);
		expect(r.exactMiss?.note).toMatch(/No proposal document CAP-0099/);
		expect(r.exactMiss?.note).not.toMatch(/verbatim/);
		const failed = exactKeyReport({
			query: "CAP-0099",
			scope: [],
			served: [],
			lookupFailed: true,
		});
		expect(failed.exactMiss?.note).toMatch(/unknown/);
	});

	it("only a hyphen, or a capital prefix and a space, names a proposal", () => {
		const capRow = {
			url: "https://github.com/stellar/stellar-protocol/blob/master/core/cap-0100.md",
			title: "CAP-0100",
			content: "",
		};
		const sep41 = {
			url: "https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0041.md",
			title: "Soroban Token Interface",
			content: "",
		};
		for (const q of ["cap-100", "CAP-0100", "CAP 100", "what is Cap-100?"])
			expect(exactKeysOf(q, capRow)).toEqual(["CAP-0100"]);
		for (const q of ["sep-41", "SEP 41", "SEP-0041 token interface"])
			expect(exactKeysOf(q, sep41)).toEqual(["SEP-0041"]);
		expect(exactKeysOf("SLP-0006", slpHeader)).toEqual(["SLP-0006"]);
		// Lowercase prose with a space is not an id: no key, so no miss.
		for (const q of [
			"market cap 100",
			"sep 41 tokens",
			"slp 6",
			"Cap 100",
			"cap100",
		]) {
			expect(exactKeysOf(q, capRow)).toBeNull();
			expect(
				exactKeyReport({ query: q, scope: [], served: [], lookupFailed: false })
					.exactMiss,
			).toBeNull();
		}
	});

	it("a month and year is not a SEP number", () => {
		expect(exactKeysOf("stellar news sep 2026", sep)).toBeNull();
		expect(exactKeysOf("SEP 24 in Sep 2026", sep)).toBeNull();
		expect(exactKeysOf("SEP 2026 roadmap", sep)).toBeNull();
	});
});
