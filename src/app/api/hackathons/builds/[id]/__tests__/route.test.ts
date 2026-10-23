import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const umbra = {
	id: "u",
	buildId: "dorahacks-buidl-46541",
	name: "Umbra Wallet",
	hackathonSlug: "stellar-hacks-zk",
	hackathonTitle: "Stellar Hacks: Real-World ZK",
	endedAt: "2025-10-09",
	placement: "3rd Place - $1,250 in XLM",
	award: "$10,000 XLM Prize",
	isWinner: true,
	url: "https://dorahacks.io/buidl/46541",
	firstSeenAt: "2026-10-05T10:20:00.000Z",
	lastSeenAt: "2026-10-05T10:20:00.000Z",
};
// The submission's stored row, and its event's stored winners (an Error
// fails that read).
let doc: Record<string, unknown> = umbra;
let winners:
	| Array<{ hackathonSlug: string; placement: string; award: string }>
	| Error = [];
let winnersQuery: { where?: unknown; select?: unknown } | null = null;
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(
			async (a: {
				collection: string;
				where?: { and?: Array<Record<string, unknown>> };
				select?: unknown;
			}) => {
				if (a.collection !== "hackathon-builds") return { docs: [] };
				if (a.where?.and?.[0]?.buildId) return { docs: [doc] };
				winnersQuery = a;
				if (winners instanceof Error) throw winners;
				return { docs: winners };
			},
		),
	})),
}));

const get = async () => {
	const { GET } = await import("../route");
	return GET(new NextRequest("https://x.test/api/hackathons/builds/46541"), {
		params: Promise.resolve({ id: "46541" }),
	});
};

describe("GET /api/hackathons/builds/{id} award labels", () => {
	beforeEach(() => {
		winnersQuery = null;
		doc = umbra;
	});

	it("serves an award its event's winners of different placements share as awardCategory, a hidden one counted", async () => {
		winners = [
			// Hidden by its team: not served, but its placement is in the award.
			{
				hackathonSlug: "stellar-hacks-zk",
				placement: "1st Place - $5,000 in XLM",
				award: "$10,000 XLM Prize",
			},
			{
				hackathonSlug: "stellar-hacks-zk",
				placement: "3rd Place - $1,250 in XLM",
				award: "$10,000 XLM Prize",
			},
		];
		const res = await get();
		expect(res.status).toBe(200);
		const { build } = await res.json();
		expect([build.award, build.awardCategory, build.prizeUsd]).toEqual([
			null,
			"$10,000 XLM Prize",
			1250,
		]);
		// Every stored winner of the submission's events, hidden ones too.
		expect(winnersQuery).toMatchObject({
			where: {
				and: [
					{ hackathonSlug: { in: ["stellar-hacks-zk"] } },
					{ isWinner: { equals: true } },
				],
			},
			select: { hackathonSlug: true, placement: true, award: true },
		});
	});

	it("keeps an award that is the winner's own prize", async () => {
		// ZK Gaming: one award per winner, its place and amount in the title.
		doc = { ...umbra, placement: "Winners", award: "3rd Place - $1,250" };
		winners = [
			{
				hackathonSlug: "stellar-hacks-zk",
				placement: "Winners",
				award: "3rd Place - $1,250",
			},
		];
		const { build } = await (await get()).json();
		expect([build.award, build.awardCategory]).toEqual([
			"3rd Place - $1,250",
			null,
		]);
	});

	it("reads a title stating more than the placement as a category, its siblings unread", async () => {
		winners = [
			{
				hackathonSlug: "stellar-hacks-zk",
				placement: "3rd Place - $1,250 in XLM",
				award: "$10,000 XLM Prize",
			},
		];
		const { build } = await (await get()).json();
		expect([build.award, build.awardCategory]).toEqual([
			null,
			"$10,000 XLM Prize",
		]);
	});

	it("reads no winners for a submission with no award text, so a failing read can not fail it", async () => {
		doc = { ...umbra, placement: null, award: null, isWinner: false };
		winners = new Error("store timeout");
		const res = await get();
		expect(res.status).toBe(200);
		expect(winnersQuery).toBeNull();
		const { build } = await res.json();
		expect([build.award, build.awardCategory]).toEqual([null, null]);
	});

	it("answers 503 when the event's winners cannot be read, never an unchecked award", async () => {
		winners = new Error("store timeout");
		const res = await get();
		expect(res.status).toBe(503);
		expect(res.headers.get("Retry-After")).toBe("2");
	});
});
