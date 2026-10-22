import { afterEach, describe, expect, it, vi } from "vitest";
import { listedEvents, parseBuildFilters } from "@/lib/hackathon-build-query";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import { fetchAllDoraHacksHackathonsChecked } from "@/lib/integrations/dorahacks";

// The curated collection answers with no rows, so only DoraHacks decides.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ find: async () => ({ docs: [] }) })),
}));

const row = (id: number, uname: string, title: string) => ({
	id,
	uname,
	title,
	timeline_start: 1,
	timeline_end: 2,
});
// What each DoraHacks read lists: org 3853's read alone lists the ideathon.
const listing = (url: string) =>
	url.includes("owner_id=3853")
		? [row(2, "ideatontelluscoop", "Stellar LATAM Ideathon 2")]
		: url.includes("owner_id=3096")
			? [row(1, "stellar-hacks-zk", "Stellar Hacks: Real-World ZK")]
			: [];

/** Every DoraHacks read answers, except the ones `fail` picks. */
function stubDoraHacks(fail: (url: string) => "503" | "timeout" | null) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			const f = fail(url);
			if (f === "timeout")
				throw new DOMException("The operation timed out.", "TimeoutError");
			if (f === "503") return new Response("busy", { status: 503 });
			return new Response(JSON.stringify({ results: listing(url) }), {
				headers: { "content-type": "application/json" },
			});
		}),
	);
}

afterEach(() => vi.unstubAllGlobals());

const indexed = [
	{
		id: "b1",
		name: "b1",
		description: null,
		githubUrl: null,
		demoUrl: null,
		videoUrl: null,
		track: null,
		hackathonPlacement: null,
		award: null,
		isWinner: false,
		voteCount: null,
		url: "https://dorahacks.io/buidl/1",
		source: "dorahacks",
		hackathon: {
			title: "Stellar Hacks: Real-World ZK",
			slug: "stellar-hacks-zk",
			endedAt: "2025-01-01",
		},
		haystack: "b1",
	},
] as IndexedBuild[];
const parse = (qs: string) =>
	parseBuildFilters(new URLSearchParams(qs), "keyword", indexed, listedEvents);

describe("the DoraHacks listing says when one of its reads failed", () => {
	it("is complete only when every read answered, and still serves the reads that did", async () => {
		stubDoraHacks(() => null);
		expect((await fetchAllDoraHacksHackathonsChecked()).complete).toBe(true);

		stubDoraHacks((u) => (u.includes("owner_id=3853") ? "503" : null));
		const partial = await fetchAllDoraHacksHackathonsChecked();
		expect(partial.complete).toBe(false);
		const slugs = partial.hackathons.map((h) => h.uname);
		expect(slugs).toContain("stellar-hacks-zk");
		expect(slugs).not.toContain("ideatontelluscoop");
	});

	it("counts a timed-out read as failed", async () => {
		stubDoraHacks((u) => (u.includes("owner_id=3740") ? "timeout" : null));
		expect((await fetchAllDoraHacksHackathonsChecked()).complete).toBe(false);
	});
});

describe("an event listed only by a DoraHacks read that failed", () => {
	it("is reported as not checked, never refused with a 400", async () => {
		stubDoraHacks((u) => (u.includes("owner_id=3853") ? "503" : null));
		expect(await parse("hackathon=ideatontelluscoop")).toEqual({
			filters: expect.objectContaining({ hackathons: ["ideatontelluscoop"] }),
			warnings: [
				"could not check hackathon 'ideatontelluscoop': the event listing could not be read; 0 matched from it is not evidence that nothing was built",
			],
		});
	});

	it("is a listed event with nothing stored when every read answers", async () => {
		stubDoraHacks(() => null);
		expect(await parse("hackathon=ideatontelluscoop")).toMatchObject({
			warnings: [
				"no submissions are stored for ideatontelluscoop; 0 matched from it is not evidence that nothing was built",
			],
		});
	});
});
