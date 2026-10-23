/**
 * Demand report (2026-10-23): attribution of calls a Cloudflare Worker makes
 * (the CF-Worker header), and the admin-only aggregate built from the
 * api-usage log. The report must carry counts and terms only, never a
 * stored query string.
 */
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn(async () => ({}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ create })),
}));

import { cfWorkerZone, logApiHit } from "../api-usage";
import {
	buildDemandReport,
	clientClass,
	queryTerms,
	type UsageGroup,
} from "../demand-report";

afterEach(() => create.mockClear());

describe("cfWorkerZone", () => {
	it("reads the zone a Worker subrequest names", () => {
		expect(cfWorkerZone("stellar.buzz")).toBe("stellar.buzz");
		expect(cfWorkerZone(" Stellar.Buzz ")).toBe("stellar.buzz");
		expect(cfWorkerZone("abc.workers.dev")).toBe("abc.workers.dev");
	});

	it("records nothing for an absent or malformed header", () => {
		expect(cfWorkerZone(null)).toBeUndefined();
		expect(cfWorkerZone("")).toBeUndefined();
		expect(cfWorkerZone("not a zone")).toBeUndefined();
		expect(cfWorkerZone("<script>.com")).toBeUndefined();
		expect(cfWorkerZone(`${"a".repeat(120)}.com`)).toBeUndefined();
	});
});

describe("logApiHit attribution", () => {
	const flush = () => new Promise((r) => setTimeout(r, 0));

	it("stores the CF-Worker zone and the partial flag", async () => {
		const req = new NextRequest("https://x.test/api/research?q=a", {
			headers: { "cf-worker": "stellar.buzz" },
		});
		logApiHit({ req, endpoint: "/api/research", partial: true });
		await flush();
		const data = (create.mock.calls[0] as unknown[])[0] as {
			data: Record<string, unknown>;
		};
		expect(data.data.cfWorker).toBe("stellar.buzz");
		expect(data.data.partial).toBe(true);
		expect(data.data.uaBucket).toBe("other");
	});

	it("leaves both out when the request carries neither", async () => {
		const req = new NextRequest("https://x.test/api/research?q=a");
		logApiHit({ req, endpoint: "/api/research" });
		await flush();
		const data = (create.mock.calls[0] as unknown[])[0] as {
			data: Record<string, unknown>;
		};
		expect("cfWorker" in data.data).toBe(false);
		expect("partial" in data.data).toBe(false);
	});
});

describe("clientClass", () => {
	it("names a Worker by its zone, before any User-Agent bucket", () => {
		expect(clientClass({ cfWorker: "stellar.buzz", uaBucket: "other" })).toBe(
			"cf-worker:stellar.buzz",
		);
		expect(clientClass({ uaBucket: "claude" })).toBe("claude");
		expect(clientClass({})).toBe("other");
	});
});

describe("queryTerms", () => {
	it("splits, drops filler, counts a word once per query", () => {
		expect(queryTerms("how does the fee bump fee work? sep-10")).toEqual([
			"fee",
			"bump",
			"sep",
			"10",
		]);
	});

	it("drops tokens shaped like keys, addresses or hashes", () => {
		const key = `s${"a1".repeat(27)}`;
		expect(queryTerms(`blend ${key} sk1234abcd5678ef`)).toEqual(["blend"]);
	});
});

const g = (over: Partial<UsageGroup>): UsageGroup => ({
	endpoint: "/api/research",
	n: 1,
	...over,
});

describe("buildDemandReport", () => {
	const groups: UsageGroup[] = [
		// Raven: research, 10 calls, 4 empty, 1 partial, all with status 200
		g({
			cfWorker: "stellar.buzz",
			uaBucket: "other",
			query: "how do fee bump transactions work",
			status: 200,
			empty: false,
			partial: false,
			n: 5,
		}),
		g({
			cfWorker: "stellar.buzz",
			uaBucket: "other",
			query: "fee bump sponsorship rules",
			status: 200,
			empty: true,
			partial: false,
			n: 4,
		}),
		g({
			cfWorker: "stellar.buzz",
			uaBucket: "other",
			query: "secret seed sbxq9z8y7x6w5v4u3t2 lookup",
			status: 200,
			empty: false,
			partial: true,
			n: 1,
		}),
		// Raven: contracts, 3 calls, one 503, no resultCount or partial logged
		g({
			cfWorker: "stellar.buzz",
			uaBucket: "other",
			endpoint: "/api/contracts",
			status: 200,
			n: 2,
		}),
		g({
			cfWorker: "stellar.buzz",
			uaBucket: "other",
			endpoint: "/api/contracts",
			status: 503,
			n: 1,
		}),
		// A Claude client, 2 calls, one 429
		g({
			uaBucket: "claude",
			endpoint: "/api/projects/search",
			query: "blend",
			status: 200,
			empty: false,
			n: 1,
		}),
		g({
			uaBucket: "claude",
			endpoint: "/api/projects/search",
			status: 429,
			n: 1,
		}),
	];
	const report = buildDemandReport(groups, { minTermCount: 5, topTerms: 10 });
	const raven = report.clients.find(
		(c) => c.client === "cf-worker:stellar.buzz",
	);
	const claude = report.clients.find((c) => c.client === "claude");

	it("counts calls per client and per operation, busiest first", () => {
		expect(report.clients.map((c) => [c.client, c.calls])).toEqual([
			["cf-worker:stellar.buzz", 13],
			["claude", 2],
		]);
		expect(raven?.operations.map((o) => [o.endpoint, o.calls])).toEqual([
			["/api/research", 10],
			["/api/contracts", 3],
		]);
	});

	it("rates empty, partial and error over the calls that recorded each", () => {
		const research = raven?.operations[0];
		expect(research).toMatchObject({
			emptyCalls: 4,
			emptyBasis: 10,
			emptyRate: 0.4,
			partialCalls: 1,
			partialBasis: 10,
			partialRate: 0.1,
			errorCalls: 0,
			errorRate: 0,
		});
		const contracts = raven?.operations[1];
		// No resultCount or partial recorded: unknown, not zero.
		expect(contracts).toMatchObject({
			emptyBasis: 0,
			emptyRate: null,
			partialBasis: 0,
			partialRate: null,
			errorCalls: 1,
			statusBasis: 3,
		});
		expect(contracts?.errorRate).toBeCloseTo(1 / 3);
		expect(claude?.operations[0]).toMatchObject({
			rejectedCalls: 1,
			errorCalls: 0,
		});
	});

	it("lists, per operation, only terms asked at least minTermCount times", () => {
		expect(raven?.operations[0].topTerms).toEqual([
			{ term: "bump", calls: 9 },
			{ term: "fee", calls: 9 },
			{ term: "transactions", calls: 5 },
		]);
		expect(raven?.operations[0].termBasis).toBe(10);
		expect(raven?.operations[1]).toMatchObject({ termBasis: 0, topTerms: [] });
		expect(claude?.operations[0].topTerms).toEqual([]);
	});

	it("never carries a stored query string or a rare or key-shaped term", () => {
		const out = JSON.stringify(report);
		for (const q of groups.map((x) => x.query).filter(Boolean)) {
			expect(out).not.toContain(q as string);
		}
		for (const rare of ["sponsorship", "rules", "secret", "seed", "blend"]) {
			expect(out).not.toContain(`"${rare}"`);
		}
		expect(out).not.toContain("sbxq9z8y7x6w5v4u3t2");
	});
});
