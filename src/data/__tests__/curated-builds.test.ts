import { describe, expect, it } from "vitest";
import { CURATED_BUILD_ID, parseBuildId } from "@/lib/hackathon-build-links";
import { CURATED_BUILDS } from "../curated-builds";
import { CURATED_HACKATHONS } from "../curated-hackathons";

describe("curated hackathon builds", () => {
	it("each row has a unique curated id and names a curated event", () => {
		const events = new Set(CURATED_HACKATHONS.map((h) => h.uname));
		const ids = CURATED_BUILDS.map((b) => b.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const b of CURATED_BUILDS) {
			expect(b.id).toMatch(CURATED_BUILD_ID);
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

	it("carries Build on Stellar Philippines' five winners as BitPinas heads them", () => {
		const w = CURATED_BUILDS.filter(
			(b) => b.hackathonSlug === "build-on-stellar-philippines-2026",
		);
		expect(w.map((b) => `${b.placement}: ${b.name}`)).toEqual([
			"Champion: AbotPera",
			"1st Runner-Up: PinkRaft",
			"2nd Runner-Up: Axial",
			"Best Use of Stellar: Sobre",
			"Best Use of Stellar: TyFi",
		]);
		expect(w[0].id).toBe("curated-build-on-stellar-philippines-2026-abotpera");
		// BitPinas: low-connectivity and zero-data use, places without stable
		// internet; not a claim about mobile data plans.
		expect(w[0].description).toMatch(
			/little or no connectivity, for rural and remote areas without stable internet/,
		);
		for (const b of w) {
			expect(b.url).toBe(
				"https://bitpinas.com/feature/stellar-rise-in-ph-hackathon-concludes/",
			);
			expect(b.isWinner).toBe(true);
			// BitPinas says what each built; it names no track and links nothing.
			expect(b.description).toBeTruthy();
			expect([b.track, b.githubUrl, b.demoUrl]).toEqual([null, null, null]);
		}
	});

	it("carries the APAC hackathon's one published winner with its track", () => {
		expect(
			CURATED_BUILDS.filter(
				(b) => b.hackathonSlug === "apac-stellar-hackathon-2026",
			),
		).toEqual([
			{
				id: "curated-apac-stellar-hackathon-2026-olio",
				name: "Olio",
				hackathonSlug: "apac-stellar-hackathon-2026",
				track: "Payment & Consumer Application",
				placement: "1st Place",
				isWinner: true,
				description: "Confidential USDC payments app on Stellar.",
				githubUrl: null,
				// The spotlight links Olio's site, and no repo.
				demoUrl: "https://oliopay.xyz/",
				url: "https://www.risein.com/blog/builder-spotlight-from-hackathon-curiosity-to-building-olio-on-stellar",
			},
		]);
	});

	it("writes no em or en dash", () => {
		expect(JSON.stringify(CURATED_BUILDS)).not.toMatch(/[\u2013\u2014]/);
	});

	it("a curated id opens its submission, as a DoraHacks id does", () => {
		expect(parseBuildId("curated-hackmeridian-2025-the-simple-fund")).toBe(
			"curated-hackmeridian-2025-the-simple-fund",
		);
		expect(parseBuildId("dorahacks-buidl-42585")).toBe("dorahacks-buidl-42585");
		// Not ids the generator makes.
		expect(parseBuildId("curated--")).toBeNull();
		expect(parseBuildId("curated-a-")).toBeNull();
		expect(parseBuildId("curated-a--b")).toBeNull();
		expect(parseBuildId("https://dorahacks.io/buidl/42585")).toBe(
			"dorahacks-buidl-42585",
		);
		expect(parseBuildId("curated-")).toBeNull();
		expect(parseBuildId("curated-Bad Id")).toBeNull();
	});
});
