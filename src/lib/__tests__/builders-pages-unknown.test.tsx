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

const state = { total: 1, failRepos: false };
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
		find: async (args: { collection: string }) => {
			if (args.collection === "builders")
				// one row read, and the database's count of every match
				return {
					docs: [profile],
					totalDocs: state.total,
					hasNextPage: state.total > 1,
				};
			if (state.failRepos && args.collection === "repos")
				throw new Error("socket hang up");
			return { docs: [], totalDocs: 0, hasNextPage: false };
		},
	})),
}));
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => {
		throw new Error("offline");
	}),
}));

const directory = async () => {
	const { default: BuildersPage } = await import(
		"@/app/(frontend)/builders/page"
	);
	return renderToStaticMarkup(await BuildersPage());
};

describe("builder pages say unknown, never zero or none", () => {
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
