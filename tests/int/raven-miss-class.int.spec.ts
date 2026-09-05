import { describe, expect, it } from "vitest";
import {
	classifyMiss,
	type NameVerdict,
} from "../../scripts/eval/raven-miss-class";

const never = async (): Promise<NameVerdict> => {
	throw new Error("resolver must not be called for this class");
};

describe("classifyMiss", () => {
	it("calls catalog-lag FIRST, even with an id-noun collision present", async () => {
		// The old precedence answered id-noun-exclusion here, which points the
		// reader upstream at Raven's weighting instead of at the re-baseline that
		// actually explains the miss.
		const c = await classifyMiss({
			scoutHits: ["searchProjects", "getBuilders"],
			collisions: [{ op: "getBuilders" }],
			lagged: [{ op: "getStablecoins" }],
			best: { missingWords: ["stablecoin"] },
			resolveProjectName: never,
		});
		expect(c.missClass).toBe("catalog-lag");
	});

	it("calls catalog-lag FIRST, even when nothing from scout appeared", async () => {
		const c = await classifyMiss({
			scoutHits: [],
			collisions: [],
			lagged: [{ op: "getStablecoins" }],
			resolveProjectName: never,
		});
		expect(c.missClass).toBe("catalog-lag");
	});

	it("fails CLOSED on a resolver error — never vocabulary", async () => {
		const c = await classifyMiss({
			scoutHits: ["searchProjects"],
			collisions: [],
			lagged: [],
			best: { missingWords: ["blend", "vault"] },
			resolveProjectName: async (w) =>
				w === "blend" ? { error: "resolve HTTP 502" } : false,
		});
		expect(c.missClass).toBe("could-not-check");
		expect(c.resolverError).toContain("blend");
		expect(c.resolverError).toContain("502");
		expect(c.projectNames).toEqual([]);
	});

	it("still separates named-entity from vocabulary when the resolver answers", async () => {
		const names = new Set(["blend"]);
		const input = {
			scoutHits: ["searchProjects"],
			collisions: [],
			lagged: [],
			resolveProjectName: async (w: string) => names.has(w),
		};
		expect(
			(await classifyMiss({ ...input, best: { missingWords: ["blend"] } }))
				.missClass,
		).toBe("named-entity");
		const mixed = await classifyMiss({
			...input,
			best: { missingWords: ["blend", "audited"] },
		});
		expect(mixed.missClass).toBe("vocabulary");
		expect(mixed.projectNames).toEqual(["blend"]);
	});

	it("keeps no-scout-op and id-noun-exclusion below lag but above the rest", async () => {
		expect(
			(
				await classifyMiss({
					scoutHits: [],
					collisions: [{ op: "getBuilders" }],
					lagged: [],
					best: { missingWords: ["x"] },
					resolveProjectName: never,
				})
			).missClass,
		).toBe("no-scout-op");
		expect(
			(
				await classifyMiss({
					scoutHits: ["getBuilders"],
					collisions: [{ op: "getBuilders" }],
					lagged: [],
					best: { missingWords: ["x"] },
					resolveProjectName: never,
				})
			).missClass,
		).toBe("id-noun-exclusion");
		expect(
			(
				await classifyMiss({
					scoutHits: ["getBuilders"],
					collisions: [],
					lagged: [],
					best: { missingWords: [] },
					resolveProjectName: never,
				})
			).missClass,
		).toBe("outscored");
	});
});
