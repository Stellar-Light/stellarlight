import { describe, expect, it } from "vitest";
import { codeDerivedBuilderRow } from "../../lib/builder-code-derived";
import {
	applyBuilderNameOverride,
	BUILDER_NAME_OVERRIDES,
	handleForName,
	nameCandidatesFor,
} from "../builder-name-overrides";

describe("applyBuilderNameOverride — real name for handle-only builders", () => {
	it("overlays the real name when the profile is thin (displayName === handle)", () => {
		// the bug: kalepail's profile falls back to the handle, so "Tyler van der
		// Hoeven" matches no field and the person is unfindable by name.
		const out = applyBuilderNameOverride({
			githubUsername: "kalepail",
			displayName: "kalepail",
			bio: null,
		});
		expect(out.displayName).toBe("Tyler van der Hoeven");
		expect(out.bio).toContain("stellar-raven");
	});

	it("overlays when displayName is empty too", () => {
		const out = applyBuilderNameOverride({
			githubUsername: "kalepail",
			displayName: "",
			bio: null,
		});
		expect(out.displayName).toBe("Tyler van der Hoeven");
	});

	it("does NOT clobber a real stored name (a claimed/curated DB name wins)", () => {
		const out = applyBuilderNameOverride({
			githubUsername: "kalepail",
			displayName: "Tyler v.",
			bio: "my own bio",
		});
		expect(out.displayName).toBe("Tyler v.");
		expect(out.bio).toBe("my own bio");
	});

	it("is a no-op for an uncurated handle", () => {
		const out = applyBuilderNameOverride({
			githubUsername: "somebody-else",
			displayName: "somebody-else",
			bio: null,
		});
		expect(out.displayName).toBe("somebody-else");
	});

	it("every override maps to a non-empty real name distinct from the handle", () => {
		for (const [handle, ov] of Object.entries(BUILDER_NAME_OVERRIDES)) {
			expect(ov.name.trim().length).toBeGreaterThan(0);
			expect(ov.name.toLowerCase()).not.toBe(handle.toLowerCase());
		}
	});
});

describe("handleForName — resolve a real-name query back to the handle", () => {
	it("resolves the full name (order-free) to the handle", () => {
		expect(handleForName("tyler van der hoeven")).toBe("kalepail");
		expect(handleForName("Tyler Van Der Hoeven")).toBe("kalepail");
		expect(handleForName("hoeven tyler van der")).toBe("kalepail");
	});
	it("does NOT over-resolve a bare first name or an unrelated query", () => {
		expect(handleForName("tyler")).toBeNull();
		expect(handleForName("some random person")).toBeNull();
		expect(handleForName("")).toBeNull();
	});
});

describe("codeDerivedBuilderRow — carries the real name", () => {
	it("names the code-derived row with the curated real name", () => {
		const row = codeDerivedBuilderRow("kalepail", [
			{ owner: "kalepail", fullName: "kalepail/passkey-kit", repoScore: 9 },
			{ owner: "kalepail", fullName: "kalepail/stellar-raven", repoScore: 8 },
		]);
		expect(row?.githubUsername).toBe("kalepail"); // handle preserved
		expect(row?.displayName).toBe("Tyler van der Hoeven"); // findable by name
	});
});

describe("nameCandidatesFor — suggest without resolving", () => {
	it("offers the curated person for a bare first name", () => {
		// handleForName REFUSES this (one token can't identify a person) and that
		// refusal is correct — but the answer to "we won't guess" is a named
		// suggestion, not a stonewall.
		expect(nameCandidatesFor("tyler").map((c) => c.name)).toEqual([
			"Tyler van der Hoeven",
		]);
	});

	it("offers on a surname alone", () => {
		expect(nameCandidatesFor("hoeven").map((c) => c.handle)).toEqual([
			"kalepail",
		]);
	});

	it("offers on the handle itself", () => {
		expect(nameCandidatesFor("kalepail").map((c) => c.handle)).toEqual([
			"kalepail",
		]);
	});

	it("stays silent for an unrelated query", () => {
		// A suggestion nobody asked for is noise; these must not surface a person.
		expect(nameCandidatesFor("reflector")).toEqual([]);
		expect(nameCandidatesFor("octoplace")).toEqual([]);
		expect(nameCandidatesFor("stablecoin")).toEqual([]);
	});

	it("ignores stopword-length noise rather than matching on it", () => {
		// "van"/"der" are ≤3 chars and appear in the curated name; matching on
		// them would fire the suggestion for half the queries in the log.
		expect(nameCandidatesFor("van")).toEqual([]);
		expect(nameCandidatesFor("der")).toEqual([]);
	});

	it("handles empty and tiny queries without throwing", () => {
		expect(nameCandidatesFor("")).toEqual([]);
		expect(nameCandidatesFor("ty")).toEqual([]);
	});
});
