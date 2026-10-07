import { describe, expect, it } from "vitest";
import { deriveTriageTags } from "../repo-triage";

describe("deriveTriageTags", () => {
	it("tags a dead hackathon project", () => {
		expect(
			deriveTriageTags({
				fullName: "x/hack-demo",
				judgedHackathon: "meridian-2024",
				lastCommitAt: "2024-01-01T00:00:00Z",
			}),
		).toContain("dead-hackathon-project");
	});
	it("a live judged repo is NOT tagged", () => {
		expect(
			deriveTriageTags({
				fullName: "x/active",
				judgedHackathon: "meridian-2025",
				lastCommitAt: new Date().toISOString(),
			}),
		).toEqual([]);
	});
	it("tags farm signals, inert forks, archived, dead long tail", () => {
		expect(deriveTriageTags({ fullName: "x/f", farmScore: 2 })).toContain(
			"farm-signals",
		);
		expect(
			deriveTriageTags({
				fullName: "x/fork",
				isFork: true,
				stars: 0,
				commits90d: 0,
			}),
		).toContain("inert-fork");
		expect(deriveTriageTags({ fullName: "x/a", isArchived: true })).toContain(
			"archived-upstream",
		);
		expect(
			deriveTriageTags({
				fullName: "x/old",
				source: "ec-taxonomy",
				stars: 0,
				lastCommitAt: "2022-01-01T00:00:00Z",
			}),
		).toContain("dead-long-tail");
	});
	it("tutorial-or-template needs no project link and low traction", () => {
		expect(
			deriveTriageTags({
				fullName: "x/soroban-starter",
				name: "soroban-starter",
				stars: 0,
			}),
		).toContain("tutorial-or-template");
		expect(
			deriveTriageTags({
				fullName: "x/soroban-starter",
				name: "soroban-starter",
				stars: 0,
				projectSlug: "real-project",
			}),
		).toEqual([]);
	});
	it("allowlisted canon is never tagged (soroban-examples class)", () => {
		expect(
			deriveTriageTags({
				fullName: "stellar/soroban-examples",
				name: "soroban-examples",
				stars: 0,
				isArchived: true,
			}),
		).toEqual([]);
	});
});
