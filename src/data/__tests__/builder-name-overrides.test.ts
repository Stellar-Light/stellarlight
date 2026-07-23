import { describe, expect, it } from "vitest";
import {
	applyBuilderNameOverride,
	BUILDER_NAME_OVERRIDES,
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
