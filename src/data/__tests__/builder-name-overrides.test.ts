import { describe, expect, it } from "vitest";
import { codeDerivedBuilderRow } from "../../lib/builder-code-derived";
import {
	applyBuilderNameOverride,
	BUILDER_NAME_OVERRIDES,
	handleForName,
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
