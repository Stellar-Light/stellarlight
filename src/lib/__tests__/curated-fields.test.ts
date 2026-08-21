import { describe, expect, it } from "vitest";
import { withoutCuratedFields } from "../utils/curated-fields";

/** Lessons class 32 — the daily lumenloop sync spread the whole upstream feed
 * record over curated projects, so every curated field was reverted within 24h
 * of a curate run while both jobs logged success. These assert the protection,
 * using the exact records that were silently reverted in production. */
describe("withoutCuratedFields", () => {
	// The real shape the lumenloop mapper produces (mapLumenloopEntry).
	const feed = () => ({
		name: "Tezoro",
		shortDescription: "feed copy",
		category: "User-Facing App",
		types: ["Bridge"],
		status: "Live",
		verificationLevel: "Unverified",
		links: {
			website: "https://feed.example",
			github: "https://github.com/feed",
			docs: undefined,
			twitter: "@feed",
		},
		github: { orgLogin: "feed", repos: [{ owner: "feed", name: "x" }] },
	});

	it("drops a curated top-level field so the feed cannot revert it", () => {
		// tezoro: TYPES_SET says ["Lending"]; the feed kept re-asserting ["Bridge"].
		const { data, protectedFields } = withoutCuratedFields(
			feed(),
			new Set(["types"]),
		);
		expect("types" in data).toBe(false);
		expect(protectedFields).toEqual(["types"]);
		// everything else still refreshes
		expect(data.category).toBe("User-Facing App");
		expect(data.name).toBe("Tezoro");
	});

	it("drops only the curated sub-key of a dotted path", () => {
		const { data, protectedFields } = withoutCuratedFields(
			feed(),
			new Set(["links.website"]),
		);
		expect("website" in (data.links as object)).toBe(false);
		// siblings keep syncing — one curated link must not freeze the object
		expect((data.links as { github?: string }).github).toBe(
			"https://github.com/feed",
		);
		expect(protectedFields).toEqual(["links.website"]);
	});

	it("protects status — the mapper hardcodes Live, which resurrected dead projects", () => {
		const { data, protectedFields } = withoutCuratedFields(
			feed(),
			new Set(["status"]),
		);
		expect("status" in data).toBe(false);
		expect(protectedFields).toEqual(["status"]);
	});

	it("handles several owned fields at once", () => {
		const { data, protectedFields } = withoutCuratedFields(
			feed(),
			new Set(["types", "shortDescription", "links.docs", "github"]),
		);
		expect("types" in data).toBe(false);
		expect("shortDescription" in data).toBe(false);
		expect("github" in data).toBe(false);
		expect("docs" in (data.links as object)).toBe(false);
		expect(protectedFields).toEqual([
			"github",
			"links.docs",
			"shortDescription",
			"types",
		]);
	});

	it("is a no-op when nothing is curated — uncurated records still sync fully", () => {
		const input = feed();
		const { data, protectedFields } = withoutCuratedFields(input, new Set());
		expect(data).toBe(input);
		expect(protectedFields).toEqual([]);
	});

	it("ignores paths the feed does not map (cannot clobber what it never wrote)", () => {
		// supportedNetworks/productKind are curated but absent from the feed patch.
		const { data, protectedFields } = withoutCuratedFields(
			feed(),
			new Set(["supportedNetworks", "links.discord"]),
		);
		expect(protectedFields).toEqual([]);
		expect(data.types).toEqual(["Bridge"]);
	});

	it("does not mutate the caller's object", () => {
		const input = feed();
		withoutCuratedFields(input, new Set(["types", "links.website"]));
		expect(input.types).toEqual(["Bridge"]);
		expect(input.links.website).toBe("https://feed.example");
	});

	// Raven #39 (2026-08-21): NAME_FIXES registers renames so the nightly
	// feed cannot revert them. The mapper writes `name` at top level; the
	// stripper must drop it when owned.
	it("strips a registered name so the feed cannot undo a rename", () => {
		const { data, protectedFields } = withoutCuratedFields(
			feed(),
			new Set(["name"]),
		);
		expect("name" in data).toBe(false);
		expect(protectedFields).toEqual(["name"]);
	});
});
