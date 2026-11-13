/**
 * enrich-builder-repos made case twins in one run: thisisouvik/Autopilot and
 * thisisouvik/autopilot were created in the same second (2026-10-06). The
 * run's `add` list was built against `known` without adding to it, and the
 * create guard was an exact-case `equals`.
 */
import { describe, expect, it } from "vitest";
import { findRepoDoc, takeUnknown } from "../../../scripts/lib/repo-doc";

describe("takeUnknown", () => {
	it("takes one spelling of a repo per run", () => {
		const known = new Set(["someone/indexed"]);
		expect(
			takeUnknown(known, [
				"thisisouvik/Autopilot",
				"thisisouvik/autopilot",
				"ThisIsOuvik/AUTOPILOT",
				"someone/Indexed",
				"thisisouvik/other",
			]),
		).toEqual(["thisisouvik/Autopilot", "thisisouvik/other"]);
		expect(known.has("thisisouvik/autopilot")).toBe(true);
	});
});

describe("findRepoDoc", () => {
	const stored = [
		{ fullName: "thisisouvik/Autopilot" },
		{ fullName: "x/autopilot-v2" },
	];
	// A stand-in for payload.find with Mongo's semantics: equals is exact,
	// like is a case-insensitive substring.
	const payload = {
		find: async ({
			where,
		}: {
			where: { fullName: Record<string, string> };
		}) => {
			const { equals, like } = where.fullName;
			const docs = stored.filter((d) =>
				equals !== undefined
					? d.fullName === equals
					: d.fullName.toLowerCase().includes(String(like).toLowerCase()),
			);
			return { docs };
		},
	} as unknown as Parameters<typeof findRepoDoc>[0];

	it("finds a stored repo under another letter case", async () => {
		expect(await findRepoDoc(payload, "thisisouvik/autopilot")).toEqual(
			stored[0],
		);
	});
	it("a substring is not a match", async () => {
		expect(await findRepoDoc(payload, "x/autopilot")).toBeUndefined();
	});
});
