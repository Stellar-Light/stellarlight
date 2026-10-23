/**
 * Default-unchanged replay (lane R, spec 1.9.98).
 *
 * Runs the real GET handlers of /api/projects/search and /api/repos/search
 * over live-shaped fixtures (response rows captured from the live API on
 * 2026-10-23) with the clock pinned, and writes the sha256 and length of each
 * response body to REPLAY_OUT. Run once on the base commit and once on the
 * lane commit: identical hashes prove that a request without `view` answers
 * byte for byte what it answered before.
 *
 *   REPLAY_OUT=<file> npx vitest run \
 *     --config improvements/audits/2026-10-23-compact-views/vitest.replay.config.mts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const DIR = join(process.cwd(), "improvements/audits/2026-10-23-compact-views");
const fixture = (name: string) =>
	JSON.parse(readFileSync(join(DIR, "fixtures", name), "utf8"));
const projectsLive = fixture("projects-search-lending.json");
const reposLive = fixture("repos-search-soroban.json");

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async (_p: unknown, q: string) => ({
		repos: q ? reposLive.repos : [],
		total: q ? reposLive.meta.counts.total : 0,
		canonical: [],
		searched: { tokens: q.split(" "), expandedTerms: [] },
		matchMode: q ? "strict" : "all",
		matchModeLabel: q ? "every query term matched" : "no query",
		warnings: [],
	})),
}));
// Project documents shaped like the live rows; every other read is empty.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async (a: { collection: string; limit?: number }) => {
			const docs =
				a.collection === "projects" && a.limit === 0
					? projectsLive.projects
					: [];
			return { docs, totalDocs: docs.length };
		}),
	})),
}));

const CASES: Array<[string, string]> = [
	["projects", "q=lending"],
	["projects", "q=lending&limit=5"],
	["projects", "q=lending&fields=name,slug,tvlUSD"],
	["projects", "q=lending&country=NG"],
	["projects", ""],
	["repos", "q=soroban"],
	["repos", "q=soroban&limit=5&offset=2"],
	["repos", "q=soroban&fields=stars,repoScore"],
	["repos", "q=soroban&bogus=1"],
	["repos", ""],
];

const out: Record<string, { status: number; chars: number; sha256: string }> =
	{};

async function call(op: string, qs: string) {
	vi.resetModules();
	const { GET } =
		op === "projects"
			? await import("@/app/api/projects/search/route")
			: await import("@/app/api/repos/search/route");
	const pending = GET(new NextRequest(`https://x.test/api/${op}/search?${qs}`));
	await vi.advanceTimersByTimeAsync(10_000);
	const res = await pending;
	return { status: res.status, text: await res.text() };
}

describe("default responses replay", () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date("2026-10-23T12:00:00.000Z") });
		vi.stubEnv("VOYAGE_API_KEY", "");
	});
	afterAll(() => {
		vi.useRealTimers();
		const file = process.env.REPLAY_OUT;
		if (file) writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
	});

	for (const [op, qs] of CASES) {
		it(`${op} ?${qs}`, async () => {
			const { status, text } = await call(op, qs);
			expect(text.length).toBeGreaterThan(0);
			out[`${op} ?${qs}`] = {
				status,
				chars: text.length,
				sha256: createHash("sha256").update(text).digest("hex"),
			};
		});
	}
});
