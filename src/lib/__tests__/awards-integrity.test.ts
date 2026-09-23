// @vitest-environment node

import type { Payload } from "payload";
/**
 * Pins from the 2026-09-23 vote-recording audit: each test names a way a
 * legitimate ballot was refused, dropped, or double-counted.
 */
import { describe, expect, it, vi } from "vitest";
import {
	type BallotNominee,
	type BallotRound,
	decodeRelayBallots,
	relayBallotOps,
	validateSelections,
} from "../awards/ballot";
import { parseCsv } from "../awards/csv";
import { planReconcile } from "../awards/mirror";
import { readFirstBallotRecord } from "../awards/record";

const round = {
	slug: "i3-2026-nominations",
	status: "open",
	ballotMode: "one-per-category",
	picksPerCategory: 4,
	categories: [{ key: "innovation", name: "Innovation", tagline: null }],
	opensAt: null,
	closesAt: null,
} as unknown as BallotRound;
// the real slate's long tail: four of these do not fit one 64-byte value
const slugs = [
	"soroban-resource-usage-reporter",
	"rivool-finance",
	"stellarchain",
	"centiiv",
];
const nominees: BallotNominee[] = slugs.map((slug) => ({
	category: "innovation",
	slug,
	name: slug,
}));
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
// biome-ignore lint/suspicious/noExplicitAny: op shape
const nameOf = (o: any) => o.body().value().dataName().toString();
// biome-ignore lint/suspicious/noExplicitAny: op shape
const dataValue = (o: any) => o.body().value().dataValue().toString();

describe("relay values never refuse a legitimate slate", () => {
	it("accepts four long slugs (67 bytes joined) — the audit's 9% case", () => {
		const v = validateSelections(round, nominees, { innovation: slugs });
		expect(v.ok).toBe(true);
	});

	it("packs the picks into ≤64-byte chunks and decodes them back in order", () => {
		const ops = relayBallotOps(round, "abcd1234", { innovation: slugs });
		expect(ops.length).toBeGreaterThan(1);
		for (const o of ops)
			expect(Buffer.byteLength(dataValue(o))).toBeLessThanOrEqual(64);
		expect(nameOf(ops[0])).toBe("i3.i3-2026-nominations.abcd1234.innovation");
		expect(nameOf(ops[1])).toBe("i3.i3-2026-nominations.abcd1234.innovation.1");
		const data: Record<string, string> = {};
		for (const o of ops) data[nameOf(o)] = b64(dataValue(o));
		expect(decodeRelayBallots(round, nominees, data).get("abcd1234")).toEqual({
			innovation: slugs,
		});
	});

	it("still writes one entry when the picks fit", () => {
		const ops = relayBallotOps(round, "abcd1234", {
			innovation: ["centiiv", "stellarchain"],
		});
		expect(ops).toHaveLength(1);
		expect(dataValue(ops[0])).toBe("centiiv,stellarchain");
	});

	it("refuses a slug containing a comma, which would split into two nominees", () => {
		const v = validateSelections(
			round,
			[...nominees, { category: "innovation", slug: "a,b", name: "AB" }],
			{ innovation: ["a,b", "centiiv", "stellarchain", "rivool-finance"] },
		);
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.errors.join()).toMatch(/comma/);
	});
});

describe("planReconcile — presence is judged by raw key, not by what decodes", () => {
	const row = {
		address: "GA1",
		ballotId: "aabbccdd",
		selections: { innovation: ["gone-nominee"] },
	};
	it("a present-but-undecodable ballot is a disagreement, not chain-empty", () => {
		const actions = planReconcile(
			[{ ...row, confirmed: true }],
			new Map(), // nothing decodes: its nominee left the pool
			new Set(["aabbccdd"]),
		);
		expect(actions).toEqual([
			{ kind: "differs", address: "GA1", ballotId: "aabbccdd" },
		]);
	});
	it("an unconfirmed reservation whose ballot is on the relay is NOT released", () => {
		const actions = planReconcile(
			[{ ...row, confirmed: false }],
			new Map(),
			new Set(["aabbccdd"]),
		);
		expect(actions[0]).toMatchObject({ kind: "unconfirmed", onRelay: true });
	});
	it("without a presence set it behaves as before", () => {
		const actions = planReconcile([{ ...row, confirmed: true }], new Map());
		expect(actions[0]?.kind).toBe("chain-empty");
	});
});

describe("parseCsv — an Excel byte-order mark does not blank the first column", () => {
	it("strips the BOM", () => {
		const rows = parseCsv("\uFEFFaddress,label\nGABC,pilot-1\n");
		expect(rows[0]?.address).toBe("GABC");
		expect(Object.keys(rows[0] ?? {})).toEqual(["address", "label"]);
	});
});

describe("readFirstBallotRecord — the list the tally and the digest both read", () => {
	it("keeps one confirmed entry per address, oldest first, and skips reservations", async () => {
		const docs = [
			{
				id: "1",
				address: "GA1",
				txHash: "h1",
				selections: { innovation: ["centiiv"] },
				firstSubmittedAt: "2026-09-23T10:00:00.000Z",
				history: [
					{
						txHash: "h1",
						selections: { innovation: ["centiiv"] },
						ballotId: "aaaa1111",
						at: "2026-09-23T10:00:00.000Z",
					},
				],
			},
			{
				id: "2",
				address: "ga1", // same voter, later duplicate row, different case
				txHash: "h2",
				selections: { innovation: ["stellarchain"] },
				firstSubmittedAt: "2026-09-23T11:00:00.000Z",
				history: [
					{
						txHash: "h2",
						selections: { innovation: ["stellarchain"] },
						ballotId: "bbbb2222",
					},
				],
			},
			{
				id: "3",
				address: "GA2",
				txHash: null,
				selections: { innovation: ["rivool-finance"] },
				firstSubmittedAt: "2026-09-23T11:30:00.000Z",
				history: [
					{
						txHash: null,
						selections: { innovation: ["rivool-finance"] },
						ballotId: "cccc3333",
					},
				],
			},
		];
		const payload = {
			find: vi.fn(async () => ({
				docs,
				hasNextPage: false,
				totalDocs: docs.length,
			})),
		} as unknown as Payload;
		const entries = await readFirstBallotRecord(payload, "r1");
		expect(entries.map((e) => [e.address, e.ballotId, e.txHash])).toEqual([
			["GA1", "aaaa1111", "h1"],
		]);
	});
});
