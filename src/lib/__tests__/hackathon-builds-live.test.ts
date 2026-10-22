import { describe, expect, it, vi } from "vitest";
import type { DoraHacksSubmission } from "@/lib/integrations/dorahacks";

// The store does not answer, so the index is the live DoraHacks read.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));
const sub = (id: string, name: string): DoraHacksSubmission => ({
	id,
	name,
	description: null,
	githubUrl: null,
	demoUrl: null,
	videoUrl: null,
	track: "Genesis - Build with Stellar",
	hackathonPlacement: null,
	award: null,
	isWinner: false,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id.replace(/\D/g, "")}`,
	source: "dorahacks",
});
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => [
		{
			id: 2405,
			title: "Hack+ Alebrije | CDMX 2026",
			uname: "alebrije2026",
			start_time: Date.UTC(2026, 2, 20) / 1000,
			end_time: Date.UTC(2026, 2, 22) / 1000,
			bonus_price: 8000,
			hackers_count: 190,
			winner_announced: false,
			status: 2,
			source: "dorahacks",
		},
	]),
	fetchHackathonSubmissions: vi.fn(async () => [
		sub("dorahacks-buidl-41502", "GIBBOR"),
		sub("dorahacks-buidl-41339", "Nomilar"),
	]),
}));

describe("the live read, when the store does not answer", () => {
	it("serves a win named off DoraHacks as the stored read does", async () => {
		const { buildHackathonBuildsIndex } = await import(
			"@/lib/hackathon-builds"
		);
		const idx = await buildHackathonBuildsIndex();
		expect(
			idx.map((b) => [
				b.name,
				b.isWinner,
				b.hackathonPlacement,
				b.winnerSource,
			]),
		).toEqual([
			[
				"GIBBOR",
				true,
				"Winner",
				"https://bafs-newsletter.beehiiv.com/p/b-news-from-mexico-city-to-lima-this-month-s-web3-route",
			],
			["Nomilar", false, null, undefined],
		]);
	});
});
