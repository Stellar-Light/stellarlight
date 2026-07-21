import { describe, expect, it } from "vitest";
import { summarize } from "../scf-rounds-guard";

describe("scf-rounds-guard summarize", () => {
	it("reports zero for a clean report (guard passes)", () => {
		const { count, text } = summarize({ roundsOverstated: [] });
		expect(count).toBe(0);
		expect(text).toContain("0 record(s) overstated");
		expect(text).toContain("✓");
	});

	it("counts and lists overstated rows with our vs official sets", () => {
		const { count, text } = summarize({
			roundsOverstated: [
				{
					slug: "boundless",
					ourRounds: [36, 40],
					officialAwardedRounds: [40],
					url: "https://communityfund.stellar.org/project/boundless-xqk",
				},
				{
					slug: "stride",
					ourRounds: [32, 33],
					officialAwardedRounds: [],
					url: "https://communityfund.stellar.org/project/stride-4uu",
				},
			],
		});
		expect(count).toBe(2);
		expect(text).toContain("2 record(s) overstated");
		expect(text).toContain(
			"boundless: ours [#36 #40] → official awarded [#40]",
		);
		// empty official set renders explicitly, never as a blank
		expect(text).toContain(
			"stride: ours [#32 #33] → official awarded [(none awarded)]",
		);
		// points the reader at the fix path
		expect(text).toContain("fix-scf-rounds.yml");
	});

	it("treats a report with no roundsOverstated key as clean (never accuses)", () => {
		expect(summarize({}).count).toBe(0);
		expect(summarize({ overstated: [] }).count).toBe(0);
		expect(summarize(null).count).toBe(0);
	});
});
