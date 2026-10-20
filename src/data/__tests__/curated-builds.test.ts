import { describe, expect, it } from "vitest";
import { parseBuildId } from "@/lib/hackathon-build-links";
import { CURATED_BUILDS } from "../curated-builds";
import { CURATED_HACKATHONS } from "../curated-hackathons";

describe("curated hackathon builds", () => {
	it("each row has a unique curated id and names a curated event", () => {
		const events = new Set(CURATED_HACKATHONS.map((h) => h.uname));
		const ids = CURATED_BUILDS.map((b) => b.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const b of CURATED_BUILDS) {
			expect(b.id).toMatch(/^curated-[a-z0-9-]+$/);
			expect(events.has(b.hackathonSlug), b.id).toBe(true);
			expect(b.url).toMatch(/^https:\/\//);
		}
	});

	it("carries HackMeridian 2025's six winners as SDF's recap places them", () => {
		const w = CURATED_BUILDS.filter(
			(b) => b.hackathonSlug === "hackmeridian-2025",
		);
		expect(w.map((b) => `${b.track}: ${b.placement} ${b.name}`)).toEqual([
			"Open Innovation: 1st Place The Simple Fund",
			"Open Innovation: 2nd Place 4Bridge",
			"Open Innovation: 3rd Place Stellar Forge",
			"Composability: 1st Place Lance",
			"Composability: 2nd Place Star Lends",
			"Composability: 3rd Place Panorama Block",
		]);
		// No repo is linked without proof it is the team's.
		expect(w.every((b) => b.githubUrl === null)).toBe(true);
	});

	it("a curated id opens its submission, as a DoraHacks id does", () => {
		expect(parseBuildId("curated-hackmeridian-2025-the-simple-fund")).toBe(
			"curated-hackmeridian-2025-the-simple-fund",
		);
		expect(parseBuildId("dorahacks-buidl-42585")).toBe("dorahacks-buidl-42585");
		expect(parseBuildId("https://dorahacks.io/buidl/42585")).toBe(
			"dorahacks-buidl-42585",
		);
		expect(parseBuildId("curated-")).toBeNull();
		expect(parseBuildId("curated-Bad Id")).toBeNull();
	});
});
