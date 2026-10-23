import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DoraHacksHackathon } from "@/lib/integrations/dorahacks";
import sitemap from "../sitemap";

let listing: DoraHacksHackathon[] | Error = [];
let collection: Array<{ slug: string }> = [];
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: { collection: string }) => ({
			docs: args.collection === "hackathons" ? collection : [],
		}),
	})),
}));
vi.mock("@/lib/integrations/sdf-skills", () => ({
	fetchSdfSkillNames: vi.fn(async () => []),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => {
		if (listing instanceof Error) throw listing;
		return listing;
	}),
}));

const event = (uname: string) => ({ uname }) as DoraHacksHackathon;
const eventUrls = async () =>
	(await sitemap())
		.map((u) => u.url)
		.filter((u) => u.startsWith("https://stellarlight.xyz/hackathons/"));

describe("sitemap event pages", () => {
	beforeEach(() => {
		listing = [];
		collection = [];
	});

	it("lists every event the API opens, once", async () => {
		listing = [event("hackmeridian-2026"), event("stellar-hacks-zk")];
		collection = [{ slug: "stellar-hacks-zk" }];
		expect(await eventUrls()).toEqual([
			"https://stellarlight.xyz/hackathons/stellar-hacks-zk",
			"https://stellarlight.xyz/hackathons/hackmeridian-2026",
		]);
	});

	it("a failed listing read drops the events, not the sitemap", async () => {
		listing = new Error("DoraHacks down");
		const urls = (await sitemap()).map((u) => u.url);
		expect(urls).toContain("https://stellarlight.xyz/hackathons");
		expect(await eventUrls()).toEqual([]);
	});
});
