/**
 * Replay of /api/projects/search for the dead-protocol guard (lane DQ1).
 *
 * Runs the real GET handler over the 30 captured live pages (capture.mjs):
 * each page's rows are the candidate documents for its query, every other
 * read is empty, the clock is pinned and the vector rung is off. Run on the
 * base commit and on the lane commit; compare.mjs checks the criteria.
 *
 *   REPLAY_CAPTURE=<capture.json> REPLAY_SCENARIO=A|B|C \
 *   REPLAY_PROTOCOLS=<llama protocols.json> REPLAY_OUT=<out.json> \
 *   npx vitest run --config improvements/audits/2026-10-23-dead-protocol-guard/vitest.replay.config.mts
 *
 * Scenarios (the documents, never the code):
 *   A  the rows as the live API served them (no stored listing anywhere).
 *   B  A plus the llamaListing the enrich-tvl lane writes from the captured
 *      DefiLlama list under today's mapping (allbridge -> allbridge-core).
 *   C  B after the Allbridge row fix: llamaSlugs allbridge-next, tvlUSD
 *      null, its listing, the curated description, routes and networks
 *      cleared.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const env = (k: string) => {
	const v = process.env[k];
	if (!v) throw new Error(`set ${k}`);
	return v;
};
const capture = JSON.parse(readFileSync(env("REPLAY_CAPTURE"), "utf8"));
const scenario = env("REPLAY_SCENARIO");
const CHECKED_AT = "2026-10-23T18:04:09.000Z"; // the DefiLlama capture

type Doc = Record<string, unknown> & { slug: string; llamaSlugs?: unknown };
type Protocol = {
	slug: string;
	deprecated?: boolean | null;
	deadFrom?: string | null;
	tvl?: number | null;
	parentProtocol?: string | null;
};

// The lane's rule (llamaListingOf after review), restated so this file runs
// unchanged on the base commit, where src/lib/status-checks.ts does not exist.
const retired = (p: Protocol) => p.deprecated === true || !!p.deadFrom;
function listingOf(slugs: string[], all: Protocol[]) {
	const bySlug = new Map(all.map((p) => [p.slug, p]));
	const found = slugs.map((s) => bySlug.get(s)).filter(Boolean) as Protocol[];
	if (found.some((p) => !retired(p)))
		return { state: "listed", deadFrom: null };
	if (!found.length) return { state: "not-found", deadFrom: null };
	if (found.length < slugs.length) return { state: "partial", deadFrom: null };
	const liveParents = new Set(
		all
			.filter((q) => q.parentProtocol && !retired(q))
			.map((q) => q.parentProtocol),
	);
	const dead = (p: Protocol) =>
		!!p.deadFrom ||
		(!(typeof p.tvl === "number" && p.tvl > 0) &&
			!(p.parentProtocol && liveParents.has(p.parentProtocol)));
	if (!found.every(dead)) return { state: "superseded", deadFrom: null };
	const dates = found
		.map((p) => p.deadFrom)
		.filter(Boolean)
		.sort() as string[];
	return { state: "deprecated", deadFrom: dates.at(-1) ?? null };
}

const protocols: Protocol[] =
	scenario === "A"
		? []
		: (JSON.parse(readFileSync(env("REPLAY_PROTOCOLS"), "utf8")) as Protocol[]);

const ALLBRIDGE_FIX =
	"Allbridge is a cross-chain bridge provider. Its stablecoin bridge, Allbridge Core, brought native USDC transfers to Stellar on Soroban through liquidity pools; Core was exploited for about $1.65M on 2026-07-19 and its pools were discontinued in July 2026. The relaunched Core routes transfers through Circle's CCTP and LayerZero's OFT, and its Stellar support is unavailable pending an audit of the Stellar CCTP implementation. Allbridge also offers a newer bridge, Allbridge Next.";

function docsFor(rows: Doc[]): Doc[] {
	return rows.map((r) => {
		const doc: Doc = { ...r };
		const slugs = Array.isArray(r.llamaSlugs) ? (r.llamaSlugs as string[]) : [];
		if (scenario === "C" && r.slug === "allbridge") {
			doc.llamaSlugs = ["allbridge-next"];
			doc.tvlUSD = null;
			doc.shortDescription = ALLBRIDGE_FIX;
			doc.routes = [];
			doc.supportedNetworks = [];
			doc.llamaListing = {
				...listingOf(["allbridge-next"], protocols),
				checkedAt: CHECKED_AT,
			};
		} else if (scenario !== "A" && slugs.length)
			doc.llamaListing = {
				...listingOf(slugs, protocols),
				checkedAt: CHECKED_AT,
			};
		return doc;
	});
}

let candidates: Doc[] = [];
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(
			async (a: {
				collection: string;
				limit?: number;
				select?: { embedding?: boolean };
			}) => {
				const docs =
					a.collection === "projects" &&
					a.limit === 0 &&
					a.select?.embedding === false
						? candidates
						: [];
				return { docs, totalDocs: docs.length };
			},
		),
	})),
}));

const out: Record<
	string,
	{ status: number; sha256: string; rows: Record<string, string> }
> = {};

describe(`projects search replay, scenario ${scenario}`, () => {
	beforeEach(() => {
		vi.useFakeTimers({ now: new Date("2026-10-23T21:00:00.000Z") });
		vi.stubEnv("VOYAGE_API_KEY", "");
	});
	afterAll(() => {
		vi.useRealTimers();
		writeFileSync(env("REPLAY_OUT"), `${JSON.stringify(out, null, 1)}\n`);
	});

	for (const [q, page] of Object.entries(
		capture.pages as Record<string, { projects: Doc[] }>,
	)) {
		it(q, async () => {
			candidates = docsFor(page.projects);
			vi.resetModules();
			const { GET } = await import("@/app/api/projects/search/route");
			const pending = GET(
				new NextRequest(
					`https://x.test/api/projects/search?q=${encodeURIComponent(q)}`,
				),
			);
			await vi.advanceTimersByTimeAsync(10_000);
			const res = await pending;
			const text = await res.text();
			const body = JSON.parse(text);
			// generatedAt carries the advanced fake clock; it is not row data.
			const stable = text.replace(/"generatedAt":"[^"]+"/, "");
			out[q] = {
				status: res.status,
				sha256: createHash("sha256").update(stable).digest("hex"),
				rows: Object.fromEntries(
					(body.projects ?? []).map((p: { slug: string }) => [
						p.slug,
						JSON.stringify(p),
					]),
				),
			};
			expect(res.status).toBe(200);
		});
	}
});
