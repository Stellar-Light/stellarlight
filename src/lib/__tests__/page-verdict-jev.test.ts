import { describe, expect, it } from "vitest";
import { jevPageReading } from "../page-verdict";

const kind = (choice: string, p?: number) => ({
	type: "choice" as const,
	choice,
	...(p === undefined ? {} : { probabilities: { [choice]: p } }),
});
const same = (probability: number) => ({
	type: "boolean" as const,
	probability,
});

describe("jevPageReading", () => {
	it("keeps a confident non-product kind", () => {
		expect(
			jevPageReading({ kind: kind("parked", 0.97), same_project: same(0.4) })
				.kind,
		).toBe("parked");
	});
	it("reads a confident 'not this project' as unrelated, even on a working site", () => {
		expect(
			jevPageReading({ kind: kind("product", 0.95), same_project: same(0.03) })
				.kind,
		).toBe("unrelated");
	});
	it("keeps a confident product that is this project", () => {
		expect(
			jevPageReading({ kind: kind("product", 0.95), same_project: same(0.9) })
				.kind,
		).toBe("product");
	});
	it("is unknown below the bar and when probabilities are absent", () => {
		expect(
			jevPageReading({ kind: kind("shut_down", 0.6), same_project: same(0.5) })
				.kind,
		).toBe("unknown");
		expect(
			jevPageReading({ kind: kind("shut_down"), same_project: same(0.5) }).kind,
		).toBe("unknown");
	});
});
