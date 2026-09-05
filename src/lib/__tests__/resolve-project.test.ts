import { describe, expect, it } from "vitest";
import {
	queryToKey,
	type ResolvableProject,
	resolveProject,
} from "../resolve-project";

const P = (
	o: Partial<ResolvableProject> & { slug: string },
): ResolvableProject =>
	({ name: o.slug, status: "Live", ...o }) as ResolvableProject;

// Shaped after the real rows: passport → stellar-passport is a live
// supersession in the directory today; keybase is inactive with no successor.
const SET: ResolvableProject[] = [
	P({ slug: "stellar-passport", name: "Stellar Passport" }),
	P({
		slug: "passport",
		name: "Passport",
		status: "Inactive",
		canonicalSlug: "stellar-passport",
	}),
	P({
		slug: "keybase",
		name: "Keybase",
		status: "Inactive",
		statusSourceUrl: "https://keybase.io/",
		statusAsOf: "2026-07-01",
		statusBasis: "human-verified",
	}),
	P({ slug: "vesseo", name: "Vesseo", aliases: ["Vibrant"] }),
	P({ slug: "blend", name: "Blend" }),
];

describe("queryToKey", () => {
	it("pulls the slug out of a pasted project url", () => {
		expect(queryToKey("https://stellarlight.xyz/project/blend")).toBe("blend");
	});
	it("passes a bare name through", () => {
		expect(queryToKey("Blend")).toBe("Blend");
	});
});

describe("resolveProject", () => {
	it("follows a successor pointer to what replaced it", () => {
		const r = resolveProject("passport", SET);
		expect(r.found).toBe(true);
		expect(r.superseded).toBe(true);
		expect(r.subject?.slug).toBe("passport");
		expect(r.current?.slug).toBe("stellar-passport");
	});

	it("a current project resolves to itself and is not superseded", () => {
		const r = resolveProject("blend", SET);
		expect(r.superseded).toBe(false);
		expect(r.current?.slug).toBe("blend");
	});

	it("matches an alias and says that is how it matched", () => {
		const r = resolveProject("Vibrant", SET);
		expect(r.current?.slug).toBe("vesseo");
		expect(r.matchedOn).toBe("alias");
	});

	it("a miss is an explicit answer, not silence", () => {
		const r = resolveProject("some-1990s-startup", SET);
		expect(r.found).toBe(false);
		expect(r.note).toContain("NOT TRACKED HERE");
	});

	it("never claims a miss means the thing is defunct", () => {
		expect(resolveProject("unknown-thing", SET).note).toContain(
			"never that it is defunct",
		);
	});

	it("refuses to pick between two projects sharing a name", () => {
		const dupes = [
			P({ slug: "a", name: "Nova" }),
			P({ slug: "b", name: "Nova" }),
		];
		const r = resolveProject("nova", dupes);
		expect(r.found).toBe(false);
		expect(r.note).toContain("more than one project");
	});

	it("flags an inactive status we cannot source", () => {
		const r = resolveProject("passport", SET);
		expect(r.evidence?.unsourced).toBe(true);
		// The dead row carries no source, so the answer says so out loud.
		expect(r.note).toContain("unverified record");
	});

	it("does not flag one we can source", () => {
		const r = resolveProject("keybase", SET);
		expect(r.evidence?.unsourced).toBe(false);
		expect(r.evidence?.statusSourceUrl).toBe("https://keybase.io/");
	});

	it("inactive with no successor says so without claiming none exists", () => {
		const r = resolveProject("keybase", SET);
		expect(r.superseded).toBe(false);
		expect(r.note).toContain("not a claim nothing succeeded it");
	});

	it("survives a dangling successor pointer instead of throwing", () => {
		const r = resolveProject("gone", [
			P({ slug: "gone", status: "Inactive", canonicalSlug: "never-existed" }),
		]);
		expect(r.found).toBe(true);
		expect(r.current?.slug).toBe("gone");
	});

	it("survives a supersession cycle", () => {
		const r = resolveProject("x", [
			P({ slug: "x", canonicalSlug: "y" }),
			P({ slug: "y", canonicalSlug: "x" }),
		]);
		expect(r.found).toBe(true);
		expect(["x", "y"]).toContain(r.current?.slug);
	});

	it("resolves a pasted url the same as a bare slug", () => {
		const r = resolveProject("https://stellarlight.xyz/project/passport", SET);
		expect(r.current?.slug).toBe("stellar-passport");
	});
});

// One owner, one status for a duplicate (2026-09-05): both lanes now park a
// merged twin at Draft instead of Inactive. Resolution must not care — it
// reads the WHOLE collection (no status filter) and follows canonicalSlug, so
// the old name keeps resolving to the survivor.
describe("a Draft shadow still resolves to its canonical", () => {
	const SET_DRAFT: ResolvableProject[] = [
		P({ slug: "stellar-passport", name: "Stellar Passport" }),
		P({
			slug: "passport",
			name: "Passport",
			status: "Draft",
			canonicalSlug: "stellar-passport",
		}),
	];

	it("by slug", () => {
		const r = resolveProject("passport", SET_DRAFT);
		expect(r.found).toBe(true);
		expect(r.superseded).toBe(true);
		expect(r.current?.slug).toBe("stellar-passport");
	});

	it("by name", () => {
		const r = resolveProject("Passport", SET_DRAFT);
		expect(r.current?.slug).toBe("stellar-passport");
		expect(r.subject?.status).toBe("Draft"); // hidden, and said so — not dead
	});
});
