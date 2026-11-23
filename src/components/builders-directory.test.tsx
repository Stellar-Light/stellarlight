// @vitest-environment node

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type BuilderRowData, BuildersDirectory } from "./builders-directory";

const row = (
	handle: string,
	over: Partial<BuilderRowData> = {},
): BuilderRowData => ({
	handle,
	name: handle,
	avatar: null,
	role: null,
	location: null,
	bio: null,
	twitter: null,
	website: null,
	featured: false,
	commits30d: 0,
	passportProjects: 0,
	repos: 0,
	stars: 0,
	commits90d: 0,
	lastCommitAt: null,
	projects: [],
	contributesTo: [],
	languages: [],
	ambassador: null,
	hackathons: null,
	country: null,
	...over,
});
const html = (rows: BuilderRowData[]) =>
	renderToStaticMarkup(<BuildersDirectory rows={rows} total={rows.length} />);

describe("builders directory", () => {
	it("holds back a profile with nothing to show, and says how many", () => {
		const out = html([row("shipper", { bio: "builds things" }), row("blank")]);
		expect(out).toContain("/builders/shipper");
		expect(out).not.toContain("/builders/blank");
		expect(out).toContain("Show 1 empty profile");
	});

	it("never hides a profile whose code could not be read", () => {
		const out = html([row("unread", { repos: null, stars: null })]);
		expect(out).toContain("/builders/unread");
		expect(out).not.toContain("empty profile");
	});

	it("shows everything a tile counts: recent commits alone are substance", () => {
		expect(html([row("pusher", { commits30d: 3 })])).toContain(
			"/builders/pusher",
		);
	});

	it("counts hackathon builders, and a hackathon build alone is substance", () => {
		const out = html([
			row("hacker", {
				hackathons: { builds: 2, wins: 1, events: ["Stellar Hacks: Agents"] },
			}),
			row("other", { bio: "no hackathon", hackathons: null }),
		]);
		expect(out).toContain("/builders/hacker");
		expect(out).toMatch(/Hackathon builders<\/span><span[^>]*>1</);
		expect(out).toContain("2 hackathon builds");
		expect(out).toContain("1 winning build");
	});

	it("shows no hackathon count when the hackathon read did not run", () => {
		const out = html([row("unread", { bio: "x", hackathons: null })]);
		expect(out).not.toContain("Hackathon builders");
		expect(out).toContain("Countries");
	});

	it("does not let a raw commit count outrank a builder with a project", () => {
		// 2026-11-22: 5,713 commits in 90 days on two repos led the page
		const out = html([
			row("committer", { repos: 2, commits90d: 5713 }),
			row("builder", {
				bio: "ships a listed project",
				repos: 9,
				stars: 100,
				commits90d: 200,
				projects: [{ slug: "p", name: "Project" }],
			}),
		]);
		expect(out.indexOf("/builders/builder")).toBeLessThan(
			out.indexOf("/builders/committer"),
		);
	});
});
