/**
 * Live measurement (lane J2): reviewSubmission with
 * hackathon=hackmeridian-2026 on public repos that are not stored
 * submissions, through the real GET handler and the real live GitHub read.
 *
 * No database: the store is mocked to hold no submission and no malware
 * hold. The SCF round state is the one live scfPitch served (read from
 * stellarlight.xyz before the run, SCF_ROUND_FILE), so the only outbound
 * calls are read-only GitHub GETs. Repos run one at a time, 3 seconds apart;
 * each is asked twice, cold then from the read's cache.
 *
 *   GITHUB_TOKEN=<token> MEASURE_OUT=<dir> SCF_ROUND_FILE=<json> \
 *   MEASURE_REPOS=owner/a,owner/b npx vitest run \
 *     --config improvements/audits/2026-10-23-judging-review/vitest.measure.config.mts measure
 *
 * All requests come from one caller, whose share is a quarter of a server's
 * hourly live-read budget (60 calls, 15 reads): a set larger than that runs
 * in more than one process.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const OUT = process.env.MEASURE_OUT ?? "";
const ROUND = process.env.SCF_ROUND_FILE ?? "";
/** MEASURE_REPOS (owner/name, comma separated) names the set. There is no
 * default: the labels name individuals' repos by pseudonym only, and the
 * map from pseudonym to repo is not kept in the repository. */
const REPOS = (process.env.MEASURE_REPOS ?? "").split(",").filter(Boolean);

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(async () => ({ docs: [] })),
	})),
}));
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => []),
}));
vi.mock("@/lib/held-repos", async (orig) => ({
	...(await orig<typeof import("@/lib/held-repos")>()),
	heldRepoNames: vi.fn(async () => new Set<string>()),
}));
vi.mock("@/lib/scf-rounds", () => ({
	fetchScfRounds: vi.fn(async () => {
		const live = JSON.parse(
			readFileSync(process.env.SCF_ROUND_FILE ?? "", "utf8"),
		) as {
			open: Array<{
				round: number;
				phase: string;
				submissionDeadline: string | null;
			}>;
		};
		return {
			currentRound: live.open[0]?.round ?? null,
			currentPhase: live.open[0]?.phase ?? null,
			lastConcludedRound: null,
			roundsInProgress: live.open,
			submissionWindow: {
				opens: null,
				closes: live.open[0]?.submissionDeadline ?? null,
			},
			fetchedAt: new Date().toISOString(),
		};
	}),
}));

describe.skipIf(!OUT || !ROUND || !process.env.GITHUB_TOKEN || !REPOS.length)(
	"live judging review",
	() => {
		it("reviews the listed repos, cold and warm, inside the budget", async () => {
			const { GET } = await import("@/app/api/hackathons/review/route");
			mkdirSync(OUT, { recursive: true });
			const rows: Array<Record<string, unknown>> = [];
			for (const repo of REPOS) {
				const url = `https://x.test/api/hackathons/review?link=${encodeURIComponent(`https://github.com/${repo}`)}&hackathon=hackmeridian-2026`;
				const t0 = Date.now();
				const cold = await GET(new NextRequest(url));
				const coldMs = Date.now() - t0;
				const body = (await cold.json()) as {
					review?: { repo?: { readMs?: number } };
				};
				const t1 = Date.now();
				const warm = await GET(new NextRequest(url));
				const warmMs = Date.now() - t1;
				await warm.text();
				writeFileSync(
					join(OUT, `${repo.replace("/", "__")}.json`),
					`${JSON.stringify(body, null, 1)}\n`,
				);
				rows.push({
					repo,
					status: cold.status,
					readMs: body.review?.repo?.readMs ?? null,
					coldHandlerMs: coldMs,
					warmHandlerMs: warmMs,
				});
				await new Promise((r) => setTimeout(r, 3000));
			}
			writeFileSync(
				join(OUT, "timings.json"),
				`${JSON.stringify({ at: new Date().toISOString(), rows }, null, 1)}\n`,
			);
			for (const r of rows) {
				expect(r.status, String(r.repo)).toBe(200);
				expect(Number(r.coldHandlerMs), String(r.repo)).toBeLessThan(
					4000 + 250,
				);
			}
		});
	},
);
