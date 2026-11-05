// @vitest-environment node

/**
 * /builders and /builders/<login> say when they do not know. A failed or cut
 * activity read rendered as no repos and sorted as zero (the directory read
 * it with `?? 0`), and the profile said the person had no public code. The
 * directory's size was the rows a `limit: 1000` read returned, not the
 * profiles the mirror holds.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = {
	total: 1,
	failRepos: false,
	// the profile page's own reads, each failing on its own
	failOrg: false,
	failIndex: false,
	ownsRepo: true,
};
// a repo the profile owns, so the page goes on to its org and SCF reads
const owned = {
	owner: "pubdev",
	fullName: "pubdev/app",
	url: "https://github.com/pubdev/app",
	projectSlug: "pp",
	lastCommitAt: "2026-10-01T00:00:00Z",
};
const profile = {
	id: "pubdev",
	github_username: "pubdev",
	display_name: "Pub Dev",
	visibility: "public",
	projects: [],
	stats: { totalCommits30d: 0 },
};
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: {
			collection: string;
			where?: Record<string, unknown>;
		}) => {
			if (args.collection === "builders")
				// one row read, and the database's count of every match
				return {
					docs: [profile],
					totalDocs: state.total,
					hasNextPage: state.total > 1,
				};
			if (args.collection === "repos") {
				if (state.failRepos) throw new Error("socket hang up");
				const docs = state.ownsRepo ? [owned] : [];
				return { docs, totalDocs: docs.length, hasNextPage: false };
			}
			// the page's org-projects read is the one keyed on github.orgLogin
			if (
				state.failOrg &&
				args.collection === "projects" &&
				"github.orgLogin" in (args.where ?? {})
			)
				throw new Error("socket hang up");
			return { docs: [], totalDocs: 0, hasNextPage: false };
		},
	})),
}));
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => {
		if (state.failIndex) throw new Error("offline");
		return [];
	}),
}));

const directory = async () => {
	const { default: BuildersPage } = await import(
		"@/app/(frontend)/builders/page"
	);
	return renderToStaticMarkup(await BuildersPage());
};

const profilePage = async () => {
	const { default: BuilderPage } = await import(
		"@/app/(frontend)/builders/[username]/page"
	);
	return renderToStaticMarkup(
		await BuilderPage({ params: Promise.resolve({ username: "pubdev" }) }),
	);
};

describe("builder pages say unknown, never zero or none", () => {
	it("/builders/<login> says its SCF grants are unknown when that read fails", async () => {
		state.failOrg = true;
		const html = await profilePage();
		state.failOrg = false;
		expect(html).toContain("SCF grants for Pub Dev could not be read just now");
	});

	it("/builders/<login> says hackathon submissions are unknown, never that none matched", async () => {
		state.failIndex = true;
		state.ownsRepo = false;
		const html = await profilePage();
		state.failIndex = false;
		state.ownsRepo = true;
		expect(html).toContain(
			"Hackathon submissions for Pub Dev could not be read just now",
		);
		expect(html).not.toContain("no hackathon submissions matched");
	});

	it("/builders states the directory's true size when its read stops at the ceiling", async () => {
		state.total = 1500;
		const html = await directory();
		state.total = 1;
		expect(html).toContain("1,500 developers building on Stellar");
		expect(html).toContain("Showing the newest 1 of them");
	});

	it("/builders says code activity is unknown when its read fails", async () => {
		state.failRepos = true;
		const html = await directory();
		state.failRepos = false;
		expect(html).toContain("Code activity could not be read just now");
		expect(html).toContain("/builders/pubdev");
	});

	it("/builders/<login> says it could not read code activity, not that there is none", async () => {
		state.failRepos = true;
		const { default: BuilderPage } = await import(
			"@/app/(frontend)/builders/[username]/page"
		);
		const html = renderToStaticMarkup(
			await BuilderPage({ params: Promise.resolve({ username: "pubdev" }) }),
		);
		state.failRepos = false;
		expect(html).toContain("could not be read just now");
		expect(html).not.toContain("No public code");
	});
});
