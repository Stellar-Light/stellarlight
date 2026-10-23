/**
 * Full-events-unchanged replay (lane V).
 *
 * Runs the real GET handlers of compareHackathons, getHackathon,
 * analyzeHackathonSubmissions and searchHackathonBuilds over an index
 * captured from the live API (capture.mts), with the clock pinned and no
 * database, and writes each response body's sha256 and length to
 * REPLAY_OUT. Run once on the base tree and once on the lane's. Each
 * request is classed by the events it names: full (every one's stored rows
 * are a full listing), names-unstored (one has nothing stored) or
 * names-winners-only. Every full request must hash the same.
 *
 *   CAPTURE_DIR=<capture> REPLAY_OUT=<file> [REPLAY_BODIES=<dir>] npx vitest run \
 *     --config improvements/audits/2026-10-23-winners-only-coverage/vitest.replay.config.mts
 *
 * REPLAY_BODIES, when set, also gets every event page and every body of a
 * request that names a winners-only event, for the fidelity check and the
 * sweep (sweep.mts). Keep it out of the repo: bodies carry third-party
 * project text.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import type { DoraHacksHackathon } from "@/lib/integrations/dorahacks";

const CAP = process.env.CAPTURE_DIR ?? "";
const OUT = process.env.REPLAY_OUT ?? "";
const BODIES = process.env.REPLAY_BODIES ?? "";
const NOW = new Date("2026-10-23T15:10:00.000Z");

type Json = Record<string, unknown>;
const read = (p: string): Json =>
	JSON.parse(readFileSync(join(CAP, p), "utf8")) as Json;

const state = vi.hoisted(() => ({
	index: [] as unknown[],
	events: [] as unknown[],
	stored: new Map<string, unknown>(),
	hidden: new Map<string, unknown[]>(),
	projects: [] as unknown[],
}));

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/hackathon-build-semantic", () => ({
	BUILD_SEMANTIC_FLOOR: 0.68,
	semanticBuildScores: vi.fn(async () => null),
	similarToBuild: vi.fn(async () => null),
}));
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => state.index),
}));
vi.mock("@/lib/integrations/dorahacks", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/dorahacks")>()),
	fetchAllDoraHacksHackathons: vi.fn(async () => state.events),
	fetchAllDoraHacksHackathonsChecked: vi.fn(async () => ({
		hackathons: state.events,
		complete: true,
	})),
	fetchHackathonSubmissions: vi.fn(async () => []),
}));
// No database: the curated collection is empty (as in production), the
// stored event pages and hidden winners come from the captured detail.
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: vi.fn(
			async (a: {
				collection: string;
				where?: {
					slug?: { equals?: string };
					and?: Array<{ hackathonSlug?: { equals?: string } }>;
				};
			}) => {
				if (a.collection === "hackathon-events") {
					const d = state.stored.get(a.where?.slug?.equals ?? "");
					return { docs: d ? [d] : [], totalDocs: d ? 1 : 0 };
				}
				if (a.collection === "hackathon-builds") {
					const slug = a.where?.and?.[0]?.hackathonSlug?.equals ?? "";
					const docs = state.hidden.get(slug) ?? [];
					return { docs, totalDocs: docs.length };
				}
				// The curated roster's SCF read, as the live page answered it.
				if (a.collection === "projects")
					return { docs: state.projects, totalDocs: state.projects.length };
				return { docs: [], totalDocs: 0 };
			},
		),
	})),
}));

// ---- the captured index, events and pages ------------------------------
const list = read("list.json").hackathons as Json[];
const indexed = (
	read("analyze-event.json").total as { values: Array<{ value: string }> }
).values.map((v) => v.value);
const measured = new Map(
	(
		((read("analyze-category.json").meta as Json).facet as Json)
			.measured as Array<{ type: string; precision: number; recall: number }>
	).map((m) => [m.type, { precision: m.precision, recall: m.recall }]),
);
const detail = new Map(
	list.map((h) => [String(h.slug), read(`detail/${String(h.slug)}.json`)]),
);
const at = (date: unknown) =>
	Math.floor(Date.parse(`${String(date)}T12:00:00Z`) / 1000);
const announced = (note: unknown): boolean | null =>
	/^Not announced upstream: DoraHacks/.test(String(note))
		? false
		: /^DoraHacks lists this event's winners as announced/.test(String(note))
			? true
			: null;

state.events = list.map((r): DoraHacksHackathon => {
	const d = detail.get(String(r.slug)) as Json;
	const stats = (d.hackathon as Json).stats as Json;
	const org = r.organizer as { id: string; name: string } | null;
	return {
		id: Number(String(r.id).replace(/^dorahacks-/, "")),
		title: String(r.name),
		uname: String(r.slug),
		description: (r.description as string | null) ?? undefined,
		start_time: at(r.startDate),
		end_time: at(r.endDate),
		bonus_price: (r.prizePoolUSD as number | undefined) ?? 0,
		hackers_count: (r.hackersCount as number | undefined) ?? 0,
		winner_announced: announced(stats.winnersNote),
		status: r.status === "completed" ? 2 : 1,
		organization: org
			? {
					id: Number(String(org.id).replace(/^dorahacks-org-/, "")),
					name: org.name,
				}
			: undefined,
		external_url: (r.externalUrl as string | null) ?? undefined,
		source: r.source as "dorahacks" | "curated",
	} as DoraHacksHackathon;
});

for (const [slug, d] of detail) {
	const h = d.hackathon as Json;
	const stats = h.stats as Json;
	const rules = h.rules as Json | undefined;
	if (rules || stats.upstreamSubmissions != null)
		state.stored.set(slug, {
			id: `event-${slug}`,
			slug,
			title: h.name,
			description: h.description,
			upstreamSubmissions: stats.upstreamSubmissions ?? null,
			...(rules
				? {
						detailReadAt: rules.readAt,
						repoRequired: rules.repoRequired,
						videoRequired: rules.videoRequired,
						submissionQuestions: rules.submissionQuestions,
						requirementsSection: rules.requirements,
						judgingSection: rules.judgingCriteria,
					}
				: {}),
		});
	// A roster winner's linked project and its SCF record (null = no record).
	for (const w of d.winners as Json[])
		if (typeof w.slug === "string" && "scfAwarded" in w)
			state.projects.push({
				slug: w.slug,
				...(w.scfAwarded === null ? {} : { scf: { awarded: w.scfAwarded } }),
			});
	const hidden = (stats.hiddenWinners as Json[] | null) ?? [];
	state.hidden.set(
		slug,
		hidden.map((x, i) => ({
			buildId: `hidden-${slug}-${i}`,
			placement: x.placement ?? null,
			award: x.award ?? null,
		})),
	);
}

const CURATED = /^curated-[a-z0-9]+(?:-[a-z0-9]+)*$/;
for (const slug of indexed) {
	const d = detail.get(slug) as Json;
	const subs = new Map(
		(d.submissions as Json[]).map((s) => [String(s.id), s] as const),
	);
	const wins = new Map(
		(d.winners as Json[]).map((s) => [String(s.id), s] as const),
	);
	// In the order the live page lists them: the store's order.
	const order = [...subs.keys()];
	const rows = (read(`builds/${slug}.json`) as unknown as Json[]).sort(
		(a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)),
	);
	for (const r of rows) {
		const id = String(r.id);
		const description = (r.description as string | null) ?? null;
		const track = (r.track as string | null) ?? null;
		const award = (r.award as string | null) ?? null;
		const b: IndexedBuild = {
			id,
			name: String(r.name),
			description,
			githubUrl: (r.githubUrl as string | null) ?? null,
			...(r.security
				? { security: r.security as { held: true; note: string } }
				: {}),
			demoUrl: (r.demoUrl as string | null) ?? null,
			videoUrl: (subs.get(id)?.videoUrl as string | null) ?? null,
			track,
			hackathonPlacement: (r.placement as string | null) ?? null,
			award,
			isWinner: !!r.isWinner,
			...(wins.get(id)?.winnerSource
				? { winnerSource: String(wins.get(id)?.winnerSource) }
				: {}),
			voteCount: null,
			url: String(r.url),
			source: "dorahacks",
			hackathon: {
				title: String(r.hackathon),
				slug: String(r.hackathonSlug),
				endedAt: (r.endedAt as string | null) ?? null,
			},
			haystack:
				`${String(r.name)} ${description ?? ""} ${track ?? ""} ${award ?? ""}`.toLowerCase(),
			...("project" in r
				? { project: r.project as IndexedBuild["project"] }
				: {}),
			...(r.stack ? { stack: r.stack as string[] } : {}),
			...(r.categories
				? {
						categories: (r.categories as string[]).map((type) => ({
							type,
							score: 1,
							...measured.get(type),
						})),
					}
				: {}),
			...(r.afterEvent === "repo not found" ? { repoMissing: true } : {}),
			...("lastCommitAt" in r
				? {
						activity: {
							lastCommitAt: (r.lastCommitAt as string | null) ?? null,
							archived: r.afterEvent === "archived",
						},
					}
				: {}),
		};
		state.index.push(b);
	}
}

// Each event's coverage, read off the captured rows (not off the code under
// test): winners-only when every stored row is a curated winner.
const rowsOf = (slug: string) =>
	(state.index as IndexedBuild[]).filter((b) => b.hackathon.slug === slug);
const coverage = (slug: string): "full" | "winners-only" | "none" => {
	const rows = rowsOf(slug);
	if (!rows.length) return "none";
	return rows.every((b) => b.isWinner && CURATED.test(b.id))
		? "winners-only"
		: "full";
};
const slugs = list.map((h) => String(h.slug));

// ---- the requests -------------------------------------------------------
type Req = { key: string; route: string; qs: string; names: string[] };
const reqs: Req[] = [];
for (let i = 0; i < slugs.length; i++)
	for (let j = i + 1; j < slugs.length; j++)
		reqs.push({
			key: `compare?slugs=${slugs[i]},${slugs[j]}`,
			route: "compare",
			qs: `slugs=${slugs[i]},${slugs[j]}`,
			names: [slugs[i], slugs[j]],
		});
const three = [
	"hackmeridian-2025",
	"build-on-stellar-philippines-2026",
	"apac-stellar-hackathon-2026",
];
reqs.push({
	key: `compare?slugs=${three.join(",")}`,
	route: "compare",
	qs: `slugs=${three.join(",")}`,
	names: three,
});
for (const s of slugs)
	reqs.push({ key: `event/${s}`, route: "event", qs: s, names: [s] });
for (const s of indexed) {
	for (const qs of [
		`hackathon=${s}&facet=category`,
		`hackathon=${s}&facet=library&by=track`,
	])
		reqs.push({ key: `analyze?${qs}`, route: "analyze", qs, names: [s] });
	reqs.push({
		key: `builds?hackathon=${s}`,
		route: "builds",
		qs: `hackathon=${s}`,
		names: [s],
	});
}
// Over every event: these name the winners-only events too.
for (const qs of [
	"facet=event&top=30",
	"facet=category&by=event",
	"facet=placement",
	"winnersOnly=1&facet=package",
])
	reqs.push({ key: `analyze?${qs}`, route: "analyze", qs, names: indexed });
// Sets that mix full and winners-only rows, or hold winners-only rows alone,
// reached by a track or a hackathon value.
for (const [qs, names] of [
	["track=open%20innovation&facet=placement", ["hackmeridian-2025"]],
	[
		"track=composability&facet=placement",
		["hackmeridian-2025", "stellar-hacks-kale-reflector"],
	],
	[
		"hackathon=stellar-hacks-zk,hackmeridian-2025&facet=category",
		["stellar-hacks-zk", "hackmeridian-2025"],
	],
] as const)
	reqs.push({
		key: `analyze?${qs}`,
		route: "analyze",
		qs,
		names: [...names],
	});

const results: Record<
	string,
	{ class: string; status: number; chars: number; sha256: string }
> = {};

async function call(r: Req): Promise<{ status: number; text: string }> {
	if (r.route === "event") {
		const { GET } = await import("@/app/api/hackathons/[slug]/route");
		const res = await GET(
			new NextRequest(`https://x.test/api/hackathons/${r.qs}`),
			{ params: Promise.resolve({ slug: r.qs }) },
		);
		return { status: res.status, text: await res.text() };
	}
	const mod =
		r.route === "compare"
			? await import("@/app/api/hackathons/compare/route")
			: r.route === "analyze"
				? await import("@/app/api/hackathons/analyze/route")
				: await import("@/app/api/hackathons/builds/route");
	const res = await mod.GET(
		new NextRequest(`https://x.test/api/hackathons/${r.route}?${r.qs}`),
	);
	return { status: res.status, text: await res.text() };
}

describe("replay", () => {
	it("answers every request", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(NOW);
		if (BODIES) mkdirSync(BODIES, { recursive: true });
		for (const r of reqs) {
			const cls = r.names.some((s) => coverage(s) === "winners-only")
				? "names-winners-only"
				: r.names.some((s) => coverage(s) === "none")
					? "names-unstored"
					: "full";
			const { status, text } = await call(r);
			results[r.key] = {
				class: cls,
				status,
				chars: text.length,
				sha256: createHash("sha256").update(text).digest("hex"),
			};
			// Every event page too: the fidelity check reads them against the
			// captured live pages.
			if (BODIES && (cls === "names-winners-only" || r.route === "event"))
				writeFileSync(
					join(BODIES, `${r.key.replace(/[^a-z0-9=&,.-]+/gi, "_")}.json`),
					text,
				);
		}
		vi.useRealTimers();
		expect(Object.keys(results)).toHaveLength(reqs.length);
	});
});

afterAll(() => {
	if (!OUT) return;
	const events = Object.fromEntries(slugs.map((s) => [s, coverage(s)]));
	writeFileSync(
		OUT,
		`${JSON.stringify({ capturedNow: NOW.toISOString(), events, results }, null, 1)}\n`,
	);
});
