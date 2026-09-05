import { describe, expect, it } from "vitest";
import {
	type ArtifactKind,
	artifactSupports,
} from "../../../scripts/basis-from-deployment";

/** The tier-consistency gate in scripts/basis-from-deployment.ts.
 *
 * The lane copies an already-earned deployment basis onto statusBasis when an
 * artifact backs it. The defect this guards: the artifact was checked for
 * EXISTENCE, never for KIND — so observed asset payments could license
 * "human-verified" (nobody looked) and a toml citation could license
 * "onchain-activity" (nothing was observed on-chain). An artifact only
 * licenses the tier it is evidence of.
 */
const ALL: readonly ArtifactKind[] = [
	"deployment.sourceUrl",
	"receipt",
	"asset payments",
];

describe("artifactSupports", () => {
	it("asset payments back onchain-activity and nothing else", () => {
		expect(artifactSupports("onchain-activity", "asset payments")).toBe(true);
		expect(artifactSupports("human-verified", "asset payments")).toBe(false);
		expect(artifactSupports("product-integration", "asset payments")).toBe(
			false,
		);
	});

	it("a citation or a receipt backs a looked-at tier, never onchain-activity", () => {
		for (const kind of ["deployment.sourceUrl", "receipt"] as const) {
			expect(artifactSupports("human-verified", kind)).toBe(true);
			expect(artifactSupports("product-integration", kind)).toBe(true);
			expect(artifactSupports("onchain-activity", kind)).toBe(false);
		}
	});

	it("no artifact this lane accepts backs repo-activity or an unknown tier", () => {
		for (const kind of ALL) {
			expect(artifactSupports("repo-activity", kind)).toBe(false);
			expect(artifactSupports("official-record", kind)).toBe(false);
			expect(artifactSupports("", kind)).toBe(false);
		}
	});
});
