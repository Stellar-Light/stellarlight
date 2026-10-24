/**
 * Byte identity for stored submissions with no hackathon parameter (lane
 * J2, check d). Live production runs the base code (apiVersion 1.9.101 at
 * capture), so its bodies are the base's answers. Each captured body's
 * review object and generatedAt go back through the lane's GET handler,
 * the composition (buildHackathonReview) and the clock pinned to them; the
 * handler's text must equal the captured bytes. No database, no network.
 *
 *   STORED_OUT=<dir of stored-N.json and stored-N.link> npx vitest run \
 *     --config improvements/audits/2026-10-23-judging-review/vitest.measure.config.mts stored-replay
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const DIR = process.env.STORED_OUT ?? "";
const state = vi.hoisted(() => ({ review: null as unknown }));

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({})),
}));
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => []),
}));
vi.mock("@/lib/hackathon-review", () => ({
	buildHackathonReview: vi.fn(async () => state.review),
}));

afterEach(() => vi.useRealTimers());

describe.skipIf(!DIR)(
	"stored reviews without hackathon are byte identical",
	() => {
		const files = DIR
			? readdirSync(DIR).filter((f) => /^stored-\d+\.json$/.test(f))
			: [];
		it.each(files)("%s", async (file) => {
			const live = readFileSync(join(DIR, file), "utf8");
			const link = readFileSync(
				join(DIR, file.replace(".json", ".link")),
				"utf8",
			);
			const parsed = JSON.parse(live) as {
				meta: { generatedAt: string };
				review: unknown;
			};
			state.review = parsed.review;
			vi.useFakeTimers({
				toFake: ["Date"],
				now: new Date(parsed.meta.generatedAt),
			});
			const { GET } = await import("@/app/api/hackathons/review/route");
			const res = await GET(
				new NextRequest(
					`https://x.test/api/hackathons/review?link=${encodeURIComponent(link)}`,
				),
			);
			expect(res.status).toBe(200);
			const text = await res.text();
			expect(text.length).toBe(live.length);
			expect(text === live).toBe(true);
		});
	},
);
