import { describe, expect, it } from "vitest";
import {
	buildConsumerReport,
	queryTerms,
	topDemand,
	type UsageRow,
} from "../consumer-report";

// Query texts an agent sent on someone's behalf. None may reach the public
// report, whole or truncated, in the Markdown or the JSON.
const RAW = [
	"how do i verify a sep-10 challenge for my wallet",
	"is GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H a scam",
	"soroban fuzzing tools for contract audits",
	// Joined at runtime so the secret scanner does not read a fake key as a real one.
	`api key ${["sk", "live", "9f8e7d6c5b4a3210"].join("_")} not working`,
	"tx 3389e9f0f1a65f19736cacf544c2e825313e8447f569233bb8db39aa607c8889 failed",
];

const rows: UsageRow[] = [];
for (let i = 0; i < 6; i++)
	for (const q of RAW)
		rows.push({
			endpoint: "/api/research",
			query: q,
			resultCount: 3,
			createdAt: `2026-10-0${1 + (i % 5)}T00:00:00Z`,
		});
rows.push({ endpoint: "/api/contracts", resultCount: 0 });

const build = () =>
	buildConsumerReport({
		consumer: "raven",
		meta: { label: "Test consumer", buckets: ["other"], caveat: "caveat" },
		rows,
		replayed: topDemand(rows, new Set(["/api/research"]), 25).map((d) => ({
			endpoint: d.endpoint,
			replay:
				d.query === RAW[0]
					? {
							status: "empty" as const,
							returned: 0,
							matchMode: null,
							topConfidence: null,
						}
					: {
							status: "ok" as const,
							returned: 10,
							matchMode: "vector",
							topConfidence: 0.8,
						},
		})),
		changelog: [],
		now: new Date("2026-10-23T00:00:00Z"),
		since: new Date("2026-09-23T00:00:00Z"),
		days: 30,
		base: "https://x.test",
		minTermCount: 3,
		topTerms: 20,
	});

describe("consumer report", () => {
	it("publishes no raw query string, whole or as a 30 character prefix", () => {
		const { report, md } = build();
		const json = JSON.stringify(report).toLowerCase();
		const text = md.toLowerCase();
		for (const q of RAW) {
			for (const needle of [q.toLowerCase(), q.toLowerCase().slice(0, 30)]) {
				expect(text).not.toContain(needle);
				expect(json).not.toContain(needle);
				expect(text).not.toContain(encodeURIComponent(needle));
			}
		}
	});

	it("drops key, hash and address shaped tokens", () => {
		const { report, md } = build();
		const all = `${JSON.stringify(report)}\n${md}`.toLowerCase();
		expect(all).not.toContain("gbrpyhil2ci3");
		expect(all).not.toContain("3389e9f0f1a65f19");
		expect(all).not.toContain("9f8e7d6c5b4a3210");
	});

	it("publishes single terms with counts at or above the minimum", () => {
		const { report } = build();
		const research = report.queryTerms.byEndpoint.find(
			(e) => e.endpoint === "/api/research",
		);
		expect(research?.termBasis).toBe(30);
		expect(research?.terms).toContainEqual({ term: "soroban", calls: 6 });
		expect(research?.terms.every((t) => t.calls >= 3)).toBe(true);
		expect(research?.terms.every((t) => !t.term.includes(" "))).toBe(true);
	});

	it("keeps the replay as counts per endpoint", () => {
		const { report, md } = build();
		expect(report.replaySummary).toMatchObject({ graded: 5, ok: 4 });
		expect(report.replayByEndpoint).toContainEqual(
			expect.objectContaining({ endpoint: "/api/research", empty: 1, ok: 4 }),
		);
		expect(md).toContain("4/5 ok");
	});

	it("queryTerms filters stopwords, short and key shaped tokens", () => {
		expect(queryTerms("how do I use the SEP-10 auth?")).toEqual([
			"sep",
			"10",
			"auth",
		]);
		expect(queryTerms("abc123def456ghi")).toEqual([]);
	});
});
