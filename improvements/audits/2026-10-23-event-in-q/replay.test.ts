/**
 * Event-in-q replay (lane U). Runs the real GET handler of
 * /api/hackathons/builds over a capture from capture.mjs: the captured
 * browse rows as the stored index (indexedFromStored, as
 * ../2026-10-23-build-matching/replay.mts builds it), each query's live
 * meaning scores as the meaning map, the captured event listing as the
 * DoraHacks listing, and the clock pinned. Writes every response body, one
 * per line, to REPLAY_OUT_DIR:
 *   frozen.jsonl: every frozen builds-search query (capture.mjs `frozen`),
 *     default (hybrid, limit 20), limit 100, keyword and meaning;
 *   probes.jsonl: every probe of probes.json, limit 20;
 *   missing.json: meaning lookups the capture could not answer.
 * Run it once on the base commit and once on this branch, then `cmp` the
 * two frozen.jsonl files; summarize.mjs reads the probes.
 *
 *   REPLAY_LIVE=<live.json> REPLAY_OUT_DIR=<dir> npx vitest run \
 *     --config improvements/audits/2026-10-23-event-in-q/vitest.replay.config.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { HackathonBuild } from "@/payload-types";

type Row = {
	id: string;
	name: string;
	description: string | null;
	track: string | null;
	award: string | null;
	hackathon: string;
	hackathonSlug: string;
	endedAt: string | null;
	placement: string | null;
	isWinner: boolean;
	votes: number | null;
	url: string | null;
	githubUrl: string | null;
	demoUrl: string | null;
	project?: { slug: string; name: string; basis?: string } | null;
	stack?: string[];
};
type Ranking = {
	meta: { mode?: { served?: string } } | null;
	rows: Array<{ id: string; similarity?: number }>;
};

const live = JSON.parse(readFileSync(process.env.REPLAY_LIVE ?? "", "utf8"));
const probes = JSON.parse(
	readFileSync(
		join(
			process.cwd(),
			"improvements/audits/2026-10-23-event-in-q/probes.json",
		),
		"utf8",
	),
);
const OUT = process.env.REPLAY_OUT_DIR ?? "";
const missing = new Set<string>();

const AT = "2026-10-23T00:00:00.000Z";
const stored = (r: Row) =>
	({
		id: r.id,
		buildId: r.id,
		name: r.name,
		vision: r.description,
		track: r.track,
		award: r.award,
		placement: r.placement,
		isWinner: r.isWinner,
		hackathonSlug: r.hackathonSlug,
		hackathonTitle: r.hackathon,
		endedAt: r.endedAt,
		url: r.url ?? "",
		githubUrl: r.githubUrl,
		demoUrl: r.demoUrl,
		firstSeenAt: AT,
		lastSeenAt: AT,
		updatedAt: AT,
		createdAt: AT,
		...(r.stack ? { stack: r.stack, stackReadAt: AT } : {}),
		...(r.project !== undefined
			? {
					linkCheckedAt: AT,
					projectSlug: r.project?.slug ?? null,
					projectName: r.project?.name ?? null,
					projectLinkBasis: r.project?.basis ?? null,
				}
			: {}),
	}) as unknown as HackathonBuild;

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ find: async () => ({ docs: [] }) })),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
		hackathons: (
			live.events as Array<{ slug: string; name: string; source: string }>
		).map((e, i) => ({
			id: i + 1,
			uname: e.slug,
			title: e.name,
			source: e.source,
		})),
		complete: true,
	})),
}));
vi.mock("@/lib/hackathon-builds", async (orig) => {
	const mod = await orig<typeof import("@/lib/hackathon-builds")>();
	const pool = (live.corpus as Row[]).map((r) => ({
		...mod.indexedFromStored(stored(r)),
		voteCount: r.votes,
	}));
	return { ...mod, getHackathonBuildsIndex: vi.fn(async () => pool) };
});
vi.mock("@/lib/hackathon-build-semantic", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-build-semantic")>()),
	semanticBuildScores: vi.fn(
		async (q: string, opts?: { winnersOnly?: boolean }) => {
			const key = `${opts?.winnersOnly ? "w|" : ""}${q.trim().toLowerCase()}`;
			const r = live.rankings[key] as Ranking | undefined;
			if (!r) {
				missing.add(key);
				return null;
			}
			// Live could not search by meaning: neither can the replay.
			if (r.meta?.mode?.served === "keyword") return null;
			return new Map(
				r.rows
					.filter((x) => x.similarity !== undefined)
					.map((x) => [x.id, x.similarity as number]),
			);
		},
	),
}));

async function call(qs: string) {
	const { GET } = await import("@/app/api/hackathons/builds/route");
	const res = await GET(
		new NextRequest(`https://x.test/api/hackathons/builds?${qs}`),
	);
	return { status: res.status, body: await res.text() };
}

const frozen: string[] = [];
for (const f of live.frozen as Array<{ q: string; winnersOnly?: boolean }>) {
	const base = new URLSearchParams({ q: f.q });
	if (f.winnersOnly) base.set("winnersOnly", "1");
	for (const extra of [
		{},
		{ limit: "100" },
		{ mode: "keyword" },
		{ mode: "meaning" },
	]) {
		const qs = new URLSearchParams([
			...base,
			...Object.entries(extra),
		]).toString();
		if (!frozen.includes(qs)) frozen.push(qs);
	}
}

describe("event-in-q replay", () => {
	beforeAll(() => {
		vi.useFakeTimers({
			now: new Date("2026-10-23T15:00:00.000Z"),
			toFake: ["Date"],
		});
		// No outbound call: without a key the reranker is not attempted.
		vi.stubEnv("VOYAGE_API_KEY", "");
	});
	afterAll(() => {
		vi.useRealTimers();
		writeFileSync(
			join(OUT, "missing.json"),
			`${JSON.stringify([...missing].sort(), null, 1)}\n`,
		);
	});

	it(`frozen queries (${frozen.length} requests)`, async () => {
		const lines: string[] = [];
		for (const qs of frozen)
			lines.push(JSON.stringify({ qs, ...(await call(qs)) }));
		writeFileSync(join(OUT, "frozen.jsonl"), `${lines.join("\n")}\n`);
		expect(lines.length).toBe(frozen.length);
	});

	it("probes", async () => {
		const lines: string[] = [];
		for (const p of probes.probes as Array<{
			id: string;
			q: string;
			params?: Record<string, string>;
		}>) {
			const qs = new URLSearchParams({
				q: p.q,
				...(p.params ?? {}),
				limit: "20",
			}).toString();
			lines.push(JSON.stringify({ id: p.id, qs, ...(await call(qs)) }));
		}
		writeFileSync(join(OUT, "probes.jsonl"), `${lines.join("\n")}\n`);
		expect(lines.length).toBe(probes.probes.length);
	});
});
