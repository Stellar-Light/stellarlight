/**
 * searchHackathonBuilds and analyzeHackathonSubmissions report one count for
 * one set. L2-04 (live 1.9.116, 2026-11-04): "how many RWA builds are there
 * across Stellar hackathons" read 64 from search and 65 from analyze. One
 * submission, AgroChain LATAM, entered two ideathons; search counted it once
 * and analyze once per event entry. Both now count submissions.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { GET as analyzeGET } from "@/app/api/hackathons/analyze/route";
import { GET as searchGET } from "@/app/api/hackathons/builds/route";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import { PROJECT_TYPES } from "@/lib/project-types";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => null),
}));
vi.mock("@/lib/hackathon-build-semantic", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-build-semantic")>()),
	semanticBuildScores: vi.fn(async () => null),
}));
const index: IndexedBuild[] = [];
// As the index is built: each row of a submission carries its types.
vi.mock("@/lib/hackathon-builds", async (orig) => {
	const m = await orig<typeof import("@/lib/hackathon-builds")>();
	return {
		...m,
		getHackathonBuildsIndex: vi.fn(async () => m.sameFactsPerSubmission(index)),
	};
});

// Saved from the live API (1.9.116, 2026-11-04): every entry of the 24
// submissions entered in more than one event. Columns: id | name | event |
// ended | track | W = placed | types (- = not categorized) | packages (- =
// repo not read). Dashes in names became hyphens (the repo's no-dash rule).
const MULTI_ENTRY = `
dorahacks-buidl-19599 | ChainLab | build-on-stellar | 2025-03-31 | Better Access |  | SDK | -
dorahacks-buidl-19599 | ChainLab | telluscoop-ideaton | 2025-08-10 | Track Abierto |  | SDK | -
dorahacks-buidl-24691 | RemittEase AI: Intelligent Cross-Border Finance Platform with Reflector | build-on-stellar | 2025-03-31 | Better Finance |  |  | -
dorahacks-buidl-24691 | RemittEase AI: Intelligent Cross-Border Finance Platform with Reflector | stellar-hacks-kale-reflector | 2025-09-08 | Composability |  |  | -
dorahacks-buidl-27408 | ArtChain: Collaborative Digital Art Platform on Stellar Blockchain | stellar-hacks-blend | 2025-07-07 | Main Track |  | SDK | -
dorahacks-buidl-27408 | ArtChain: Collaborative Digital Art Platform on Stellar Blockchain | telluscoop-ideaton | 2025-08-10 | Track Abierto |  | SDK | -
dorahacks-buidl-27412 | EduChain-Decentralized-LearningCredentials | stellar-hacks-blend | 2025-07-07 | Main Track |  | Security | stellar-sdk
dorahacks-buidl-27412 | EduChain-Decentralized-LearningCredentials | telluscoop-ideaton | 2025-08-10 | Track Abierto |  | Security | stellar-sdk
dorahacks-buidl-27426 | Paralyx Protocol | stellar-hacks-blend | 2025-07-07 | Main Track |  |  | @stellar/stellar-sdk,soroban-sdk,stellar-sdk
dorahacks-buidl-27426 | Paralyx Protocol | stellar-hacks-paltalabs | 2025-08-07 |  |  |  | @stellar/stellar-sdk,soroban-sdk,stellar-sdk
dorahacks-buidl-27438 | Blend Pool Creator | stellar-hacks-blend | 2025-07-07 | Main Track | W | Lending | @blend-capital/blend-sdk,@creit.tech/stellar-wallets-kit,@stellar/freighter-api,@stellar/stellar-sdk
dorahacks-buidl-27438 | Blend Pool Creator | stellar-hacks-paltalabs | 2025-08-07 |  |  | Lending | @blend-capital/blend-sdk,@creit.tech/stellar-wallets-kit,@stellar/freighter-api,@stellar/stellar-sdk
dorahacks-buidl-30677 | Verbex | ideatontelluscoop | 2025-10-04 | Track Universitario |  |  | -
dorahacks-buidl-30677 | Verbex | stellar-hacks-paltalabs | 2025-08-07 |  | W |  | -
dorahacks-buidl-30677 | Verbex | telluscoop-ideaton | 2025-08-10 | Track Abierto |  |  | -
dorahacks-buidl-30703 | xLP Farm Protocol | stellar-hacks-paltalabs | 2025-08-07 |  |  | Lending | soroban-sdk,soroban-token-sdk
dorahacks-buidl-30703 | xLP Farm Protocol | telluscoop-ideaton | 2025-08-10 | Track Abierto |  | Lending | soroban-sdk,soroban-token-sdk
dorahacks-buidl-30959 | AgroChain LATAM | ideatontelluscoop | 2025-10-04 | Track Universitario |  | RWA |
dorahacks-buidl-30959 | AgroChain LATAM | telluscoop-ideaton | 2025-08-10 | Track Abierto |  | RWA |
dorahacks-buidl-31669 | Blitz - QR Code Auction Platform | buildonstellarchile | 2026-03-06 | Track: Video Pitch + Mockup - Ideas en Etapa Temprana |  |  | @stellar/freighter-api,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-31669 | Blitz - QR Code Auction Platform | buildonstellarhack | 2025-08-27 |  |  | SDK | @stellar/freighter-api,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-31669 | Blitz - QR Code Auction Platform | ideaton2026 | 2026-01-06 | Producto / Soluciones en Stellar |  | SDK | @stellar/freighter-api,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-35563 | ISIS - Intelligent System for Income & Spending | codigoraiz2025 | 2025-10-30 | Inclusión Financiera y Economía Local |  |  | @soroswap/sdk,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-35563 | ISIS - Intelligent System for Income & Spending | stellarhack | 2025-11-23 | Track 1: Stellar Scale |  |  | @soroswap/sdk,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-36220 | litus | ideaton2026 | 2026-01-06 | Producto / Soluciones en Stellar |  | SDK | @creit.tech/stellar-wallets-kit,@stellar/design-system,@stellar/stellar-sdk,@stellar/stellar-xdr-json,soroban-sdk,stellar-xdr
dorahacks-buidl-36220 | litus | scaffoldstellar | 2025-11-10 | All BUIDLs |  | SDK | @creit.tech/stellar-wallets-kit,@stellar/design-system,@stellar/stellar-sdk,@stellar/stellar-xdr-json,soroban-sdk,stellar-xdr
dorahacks-buidl-36308 | Stellar-Tipz | ideaton2026 | 2026-01-06 | Producto / Soluciones en Stellar |  |  | @creit.tech/stellar-wallets-kit,@stellar/freighter-api,@stellar/prettier-config,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-36308 | Stellar-Tipz | scaffoldstellar | 2025-11-10 | All BUIDLs |  |  | @creit.tech/stellar-wallets-kit,@stellar/freighter-api,@stellar/prettier-config,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-36321 | Trustfall | scaffoldstellar | 2025-11-10 | All BUIDLs |  |  | @creit.tech/stellar-wallets-kit,@stellar/design-system,@stellar/stellar-sdk,@stellar/stellar-xdr-json,soroban-sdk,stellar-xdr
dorahacks-buidl-36321 | Trustfall | stellar-hacks-zk | 2026-07-03 |  |  |  | @creit.tech/stellar-wallets-kit,@stellar/design-system,@stellar/stellar-sdk,@stellar/stellar-xdr-json,soroban-sdk,stellar-xdr
dorahacks-buidl-36325 | PayPulse: Offline-First Bluetooth Payments on Stellar | buildonstellarchile | 2026-03-06 | Track: Video Pitch + Mockup - Ideas en Etapa Temprana |  | Payments | @creit.tech/stellar-wallets-kit,@stellar/stellar-sdk,stellar-sdk
dorahacks-buidl-36325 | PayPulse: Offline-First Bluetooth Payments on Stellar | ideaton2026 | 2026-01-06 | Producto / Soluciones en Stellar |  | Payments | @creit.tech/stellar-wallets-kit,@stellar/stellar-sdk,stellar-sdk
dorahacks-buidl-36325 | PayPulse: Offline-First Bluetooth Payments on Stellar | scaffoldstellar | 2025-11-10 | All BUIDLs |  | Payments | @creit.tech/stellar-wallets-kit,@stellar/stellar-sdk,stellar-sdk
dorahacks-buidl-36737 | Vants | ideaton2026 | 2026-01-06 | Producto / Soluciones en Stellar |  | Payments | -
dorahacks-buidl-36737 | Vants | stellarhack | 2025-11-23 | Track 2: Stellar Genesis |  | Payments | -
dorahacks-buidl-38039 | Hive | buildonstellarchile | 2026-03-06 | Track: Video Pitch + Mockup - Ideas en Etapa Temprana | W |  | -
dorahacks-buidl-38039 | Hive | ideaton2026 | 2026-01-06 | Producto / Soluciones en Stellar |  |  | -
dorahacks-buidl-38050 | CertiX | buildonstellarchile | 2026-03-06 | Track: Video Pitch + Mockup - Ideas en Etapa Temprana |  |  | -
dorahacks-buidl-38050 | CertiX | ideaton2026 | 2026-01-06 | Producto / Soluciones en Stellar |  |  | -
dorahacks-buidl-39847 | Zkgram | buildonstellarchile | 2026-03-06 | Track: Video Pitch + Mockup - Ideas en Etapa Temprana |  |  | -
dorahacks-buidl-39847 | Zkgram | stellar-hacks-zk-gaming | 2026-02-23 | All BUIDLs |  |  | -
dorahacks-buidl-39905 | DarkWater ZK | buildonstellarchile | 2026-03-06 | Track: Video Pitch + Mockup - Ideas en Etapa Temprana |  | Gaming | @stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-39905 | DarkWater ZK | stellar-hacks-zk-gaming | 2026-02-23 | All BUIDLs |  | Gaming | @stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-42694 | Propulsor | stellar-agents-x402-stripe-mpp | 2026-04-13 | All BUIDLs |  |  | @stellar/freighter-api,@stellar/stellar-sdk,@x402/core,@x402/express,@x402/stellar,soroban-sdk
dorahacks-buidl-42694 | Propulsor | stellar-hacks-zk | 2026-07-03 |  |  | Security | @stellar/freighter-api,@stellar/stellar-sdk,@x402/core,@x402/express,@x402/stellar,soroban-sdk
dorahacks-buidl-45260 | AnchorVault: Trustless On-Chain Remittance Liquidity Routing | stellar-hacks-zk | 2026-07-03 |  |  |  | @creit.tech/stellar-wallets-kit,@stellar/freighter-api,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-45260 | AnchorVault: Trustless On-Chain Remittance Liquidity Routing | stellar-pulso-hackathon | 2026-07-01 | 🇦🇷 PULSO Argentina |  | Payments | @creit.tech/stellar-wallets-kit,@stellar/freighter-api,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-46220 | MedVault | stellar-hacks-zk | 2026-07-03 |  |  | Security | @creit.tech/stellar-wallets-kit,@stellar/freighter-api,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-46220 | MedVault | stellar-pulso-hackathon | 2026-07-01 | 🇨🇴 PULSO Colombia |  | Security | @creit.tech/stellar-wallets-kit,@stellar/freighter-api,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-46228 | Piilo | stellar-hacks-zk | 2026-07-03 |  |  | Security | @stellar/freighter-api,@stellar/stellar-sdk,soroban-sdk
dorahacks-buidl-46228 | Piilo | stellar-pulso-hackathon | 2026-07-01 | 🇧🇷 PULSO Brasil |  | Security | @stellar/freighter-api,@stellar/stellar-sdk,soroban-sdk
`;
// The 12 rows of the three events whose stored rows are their winners only.
const WINNERS_ONLY = `
curated-apac-stellar-hackathon-2026-olio | Olio | apac-stellar-hackathon-2026 | 2026-07-24T23:59:00.000Z | Payment & Consumer Application | W | - | -
curated-build-on-stellar-philippines-2026-abotpera | AbotPera | build-on-stellar-philippines-2026 | 2026-05-24T15:59:00.000Z |  | W | - | -
curated-build-on-stellar-philippines-2026-axial | Axial | build-on-stellar-philippines-2026 | 2026-05-24T15:59:00.000Z |  | W | - | -
curated-build-on-stellar-philippines-2026-pinkraft | PinkRaft | build-on-stellar-philippines-2026 | 2026-05-24T15:59:00.000Z |  | W | - | -
curated-build-on-stellar-philippines-2026-sobre | Sobre | build-on-stellar-philippines-2026 | 2026-05-24T15:59:00.000Z |  | W | - | -
curated-build-on-stellar-philippines-2026-tyfi | TyFi | build-on-stellar-philippines-2026 | 2026-05-24T15:59:00.000Z |  | W | - | -
curated-hackmeridian-2025-4bridge | 4Bridge | hackmeridian-2025 | 2025-09-16T15:00:00.000Z | Open Innovation | W | - | -
curated-hackmeridian-2025-lance | Lance | hackmeridian-2025 | 2025-09-16T15:00:00.000Z | Composability | W | - | -
curated-hackmeridian-2025-panorama-block | Panorama Block | hackmeridian-2025 | 2025-09-16T15:00:00.000Z | Composability | W | - | -
curated-hackmeridian-2025-star-lends | Star Lends | hackmeridian-2025 | 2025-09-16T15:00:00.000Z | Composability | W | - | -
curated-hackmeridian-2025-stellar-forge | Stellar Forge | hackmeridian-2025 | 2025-09-16T15:00:00.000Z | Open Innovation | W | - | -
curated-hackmeridian-2025-the-simple-fund | The Simple Fund | hackmeridian-2025 | 2025-09-16T15:00:00.000Z | Open Innovation | W | - | -
`;

const list = (v: string) => (v === "-" ? undefined : v ? v.split(",") : []);
const entry = (line: string): IndexedBuild => {
	const [id, name, slug, endedAt, track, won, types, stack] = line
		.split("|")
		.map((s) => s.trim());
	const categories = list(types);
	const packages = list(stack);
	return {
		id,
		name,
		description: null,
		githubUrl: null,
		demoUrl: null,
		videoUrl: null,
		track: track || null,
		hackathonPlacement: won ? "Winner" : null,
		award: null,
		isWinner: !!won,
		voteCount: null,
		url: `https://dorahacks.io/buidl/${id}`,
		source: "dorahacks",
		hackathon: { title: slug, slug, endedAt: endedAt || null },
		// As the index builds it: name, description, track and award.
		haystack: `${name} ${track}`.toLowerCase(),
		...(categories
			? { categories: categories.map((type) => ({ type, score: 0.8 })) }
			: {}),
		...(packages ? { stack: packages } : {}),
	};
};
const rows = (table: string) => table.trim().split("\n").map(entry);
const saved = rows(MULTI_ENTRY);
// Every type, so no category's check is 0 against 0: one submission entered
// in two events carrying it, as AgroChain LATAM carries RWA.
const everyType = PROJECT_TYPES.flatMap((type, i) =>
	["stellar-hacks-blend", "stellar-hacks-paltalabs"].map((event) =>
		entry(
			`typed-${i} | ${type} build | ${event} | 2025-08-07 | | | ${type} | -`,
		),
	),
);

const search = async (params: Record<string, string>) => {
	const qs = new URLSearchParams({ ...params, limit: "1" });
	const res = await searchGET(
		new NextRequest(`https://x.test/api/hackathons/builds?${qs}`),
	);
	expect(res.status).toBe(200);
	return (await res.json()).meta.counts as {
		indexedBuilds: number;
		matched: number;
		entries: number;
	};
};
const analyze = async (params: Record<string, string>) => {
	const qs = new URLSearchParams(params);
	const res = await analyzeGET(
		new NextRequest(`https://x.test/api/hackathons/analyze?${qs}`),
	);
	expect(res.status).toBe(200);
	return res.json();
};
const use = (...sets: IndexedBuild[][]) =>
	index.splice(0, index.length, ...sets.flat());

describe("search and analyze count one set the same way", () => {
	it("L2-04: an RWA submission entered in two ideathons is one RWA build", async () => {
		use(saved);
		// AgroChain LATAM, in both ideathons.
		expect(await search({ category: "RWA" })).toMatchObject({
			matched: 1,
			entries: 2,
		});
		const asValue = await analyze({ facet: "category", value: "RWA" });
		expect(asValue.total.values[0].builds).toBe(1);
		expect((await analyze({ category: "RWA" })).total.builds).toBe(1);
		// Each event still counts its own entry.
		const groups = (
			await analyze({ facet: "category", value: "RWA", by: "event" })
		).groups as Array<{ value: string; values: Array<{ builds: number }> }>;
		expect(
			groups
				.filter((g) => g.values[0].builds)
				.map((g) => [g.value, g.values[0].builds]),
		).toEqual([
			["telluscoop-ideaton", 1],
			["ideatontelluscoop", 1],
		]);
	});

	it("agrees for every category, event, track, package and winnersOnly", async () => {
		use(saved, everyType);
		const all = index;
		const events = [...new Set(all.map((b) => b.hackathon.slug))];
		const tracks = [...new Set(all.flatMap((b) => (b.track ? [b.track] : [])))];
		const packages = [...new Set(all.flatMap((b) => b.stack ?? []))];
		// [filter param, its value, the facet that counts it, its value]
		const as =
			(param: string, facet: string) =>
			(v: string): [string, string, string, string] => [param, v, facet, v];
		const cases = [
			...PROJECT_TYPES.map(as("category", "category")),
			...events.map(as("hackathon", "event")),
			...tracks.map(as("track", "track")),
			...packages.map(as("package", "package")),
			["winnersOnly", "1", "placement", "winner"],
		];
		for (const [param, filter, facet, value] of cases) {
			const why = `${param}=${filter}`;
			const s = await search({ [param]: filter });
			expect(s.matched, why).toBeGreaterThan(0);
			expect((await analyze({ [param]: filter })).total.builds, why).toBe(
				s.matched,
			);
			const v = await analyze({ facet, value });
			expect(v.total.values[0].builds, why).toBe(s.matched);
			// A type's check tells the units apart: some submission of it
			// entered two events.
			if (param === "category")
				expect(s.entries, why).toBeGreaterThan(s.matched);
		}
		// Several events at once: each submission's own events together.
		const bySubmission = new Map<string, string[]>();
		for (const b of saved)
			bySubmission.set(b.id, [
				...(bySubmission.get(b.id) ?? []),
				b.hackathon.slug,
			]);
		for (const slugs of new Set(
			[...bySubmission.values()].map((s) => s.join(",")),
		)) {
			const s = await search({ hackathon: slugs });
			expect(s.entries, slugs).toBeGreaterThan(s.matched);
			expect((await analyze({ hackathon: slugs })).total.builds, slugs).toBe(
				s.matched,
			);
		}
		// No filter: the same total, field and index size.
		const s = await search({});
		const a = await analyze({});
		expect(a.total.builds).toBe(s.matched);
		expect(a.total.field).toBe(s.matched);
		expect(a.meta.counts.indexedBuilds).toBe(s.indexedBuilds);
		expect(s.indexedBuilds).toBe(new Set(all.map((b) => b.id)).size);
	});

	it("counts placement once per submission, as winnersVsOthers and search do", async () => {
		use(saved);
		// Blend Pool Creator, Verbex and Hive placed in one event each and
		// entered another unplaced.
		const p = await analyze({ facet: "placement" });
		expect(p.total).toMatchObject({ builds: 24, known: 24 });
		const values = p.total.values as Array<{
			value: string;
			builds: number;
			winners: number;
		}>;
		expect(values.map((v) => [v.value, v.builds, v.winners])).toEqual([
			["not placed", 21, 0],
			["winner", 3, 3],
		]);
		expect(values[1].builds).toBe((await search({ winnersOnly: "1" })).matched);
		const groups = (await analyze({ facet: "category", by: "placement" }))
			.groups as Array<{ value: string; field: number }>;
		expect(groups.map((g) => [g.value, g.field])).toEqual([
			["not placed", 21],
			["winner", 3],
		]);
		const lift = (await analyze({ facet: "category" })).winnersVsOthers;
		expect(lift.winnersKnown + lift.othersKnown).toBe(24);
	});

	it("reads a winner's types off its submission: winners of a type are that type among winners", async () => {
		// No live case: the sync types each row from its own embedding, so a
		// winner's type can sit only on its unplaced row.
		use([
			entry("w | Winner | ev-a | 2025-07-07 | | W | - | -"),
			entry("w | Winner | ev-b | 2025-08-07 | | | RWA | -"),
			entry("o | Other | ev-b | 2025-08-07 | | | RWA | -"),
		]);
		expect((await search({ category: "RWA", winnersOnly: "1" })).matched).toBe(
			1,
		);
		const asValue = await analyze({ facet: "category", value: "RWA" });
		expect(asValue.total.values[0]).toMatchObject({ builds: 2, winners: 1 });
		const amongWinners = await analyze({
			winnersOnly: "1",
			facet: "category",
			value: "RWA",
		});
		expect(amongWinners.total.values[0].builds).toBe(1);
	});

	it("matches q on every entry, then counts each submission once", async () => {
		use(saved);
		// AgroChain LATAM and Verbex hold Track Abierto on an entry search did
		// not show across events, and search missed them.
		const tracks = saved.flatMap((b) => (b.track ? [b.track] : []));
		for (const q of new Set(["abierto", ...tracks])) {
			const s = await search({ q, mode: "keyword" });
			expect(s.matched, q).toBeGreaterThan(0);
			const a = await analyze({ q, mode: "keyword" });
			expect(a.total.builds, q).toBe(s.matched);
		}
		expect((await search({ q: "abierto", mode: "keyword" })).matched).toBe(6);
	});

	it("differs only by the winners-only rows analyze leaves out and counts in its warning", async () => {
		use(saved, rows(WINNERS_ONLY));
		const leftOut = (warnings: string[] = []) =>
			Number(
				warnings
					.join(" ")
					.match(
						/left out of every count and share: (?:the )?(\d+) rows?/,
					)?.[1] ?? 0,
			);
		const sets: Record<string, string>[] = [
			{},
			{ winnersOnly: "1" },
			{ track: "Composability" },
			{ category: "Security" },
		];
		for (const params of sets) {
			const s = await search(params);
			const a = await analyze(params);
			expect(
				a.total.builds + leftOut(a.meta.warnings),
				JSON.stringify(params),
			).toBe(s.matched);
		}
		// Alone, such an event keeps its count.
		for (const hackathon of [
			"hackmeridian-2025",
			"build-on-stellar-philippines-2026",
		])
			expect((await analyze({ hackathon })).total.builds).toBe(
				(await search({ hackathon })).matched,
			);
	});
});
