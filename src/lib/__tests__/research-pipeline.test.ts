import { describe, expect, it } from "vitest";
import {
	buildResearchVectorPipeline,
	cosineVectorScore,
	researchOverfetch,
} from "../research-pipeline";

const EMBEDDING = [0.1, 0.2, 0.3];

function vs(pipeline: Record<string, unknown>[]) {
	return pipeline[0].$vectorSearch as {
		limit: number;
		numCandidates: number;
	};
}

describe("buildResearchVectorPipeline", () => {
	it("unfiltered: pool size unchanged, no post-match stages", () => {
		const p = buildResearchVectorPipeline({
			queryEmbedding: EMBEDDING,
			limit: 25,
		});
		expect(vs(p).limit).toBe(researchOverfetch(25)); // 200
		expect(p).toHaveLength(2); // $vectorSearch + $project only
		expect(p.some((s) => "$match" in s)).toBe(false);
	});

	it("source-filtered: widens the vector stage, then re-trims after $match", () => {
		// The sls-019 dedup leak: the generic top-200 pool held chunks of only
		// 7 distinct CAP docs after the source $match — the per-doc collapse
		// then refilled the page with duplicates. The filtered pipeline must
		// survey a deeper pool BEFORE the match and trim AFTER it, so the wire
		// payload stays bounded at the same overfetch.
		const p = buildResearchVectorPipeline({
			queryEmbedding: EMBEDDING,
			limit: 25,
			sourceFilter: "cap",
		});
		expect(vs(p).limit).toBeGreaterThan(researchOverfetch(25));
		const matchIdx = p.findIndex((s) => "$match" in s);
		const limitIdx = p.findIndex((s) => "$limit" in s);
		expect(matchIdx).toBeGreaterThan(0);
		expect(limitIdx).toBe(matchIdx + 1); // trim AFTER the source match
		expect(p[limitIdx].$limit).toBe(researchOverfetch(25));
		expect(p[matchIdx].$match).toEqual({ source: "cap" });
	});

	it("stays under Atlas' $vectorSearch bounds at the max page size", () => {
		const p = buildResearchVectorPipeline({
			queryEmbedding: EMBEDDING,
			limit: 25,
			sourceFilter: "cap",
		});
		expect(vs(p).limit).toBeLessThanOrEqual(10_000);
		expect(vs(p).numCandidates).toBeLessThanOrEqual(10_000);
		expect(vs(p).numCandidates).toBeGreaterThanOrEqual(vs(p).limit);
	});
});

describe("cosineVectorScore", () => {
	// Atlas cosine vectorSearchScore = (1 + cosine) / 2 — supplemented chunks
	// must land on the SAME scale as pool chunks or ranking silently biases
	// by fetch path.
	it("matches the Atlas (1 + cosine) / 2 scale", () => {
		expect(cosineVectorScore([1, 0], [1, 0])).toBeCloseTo(1); // identical
		expect(cosineVectorScore([1, 0], [0, 1])).toBeCloseTo(0.5); // orthogonal
		expect(cosineVectorScore([1, 0], [-1, 0])).toBeCloseTo(0); // opposite
	});

	it("is magnitude-invariant (true cosine, not dot product)", () => {
		expect(cosineVectorScore([2, 0], [7, 0])).toBeCloseTo(1);
	});

	it("returns null for missing, mismatched, or degenerate vectors", () => {
		expect(cosineVectorScore([1, 0], null)).toBeNull();
		expect(cosineVectorScore([1, 0], undefined)).toBeNull();
		expect(cosineVectorScore([1, 0], [1, 0, 0])).toBeNull(); // dim mismatch
		expect(cosineVectorScore([0, 0], [1, 0])).toBeNull(); // zero norm
		expect(cosineVectorScore([], [])).toBeNull();
	});
});
