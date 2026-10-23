import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeEcosystemGaps, GAP_PROJECT_SELECT } from "@/lib/ecosystem-gaps";
import { buildHackathonBrief } from "@/lib/hackathon-brief";
import type { IndexedBuild } from "@/lib/hackathon-builds";
import { spec } from "@/lib/openapi-spec";
import {
	buildScfPitch,
	countWentQuiet,
	fundedInVertical,
} from "@/lib/scf-pitch";
import { buildVetIdea } from "@/lib/vet-idea";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../scripts/contract/served-shape";

vi.mock("@/lib/scf-rounds", () => ({
	fetchScfRounds: vi.fn(async () => ({ roundsInProgress: [] })),
}));
// The submissions index the prior-art search reads; an Error fails the read.
let buildsIndex: IndexedBuild[] | Error = [];
vi.mock("@/lib/hackathon-builds", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-builds")>()),
	getHackathonBuildsIndex: vi.fn(async () => {
		if (buildsIndex instanceof Error) throw buildsIndex;
		return buildsIndex;
	}),
}));
vi.mock("@/lib/hackathon-build-semantic", async (orig) => ({
	...(await orig<typeof import("@/lib/hackathon-build-semantic")>()),
	semanticBuildScores: vi.fn(
		async () => new Map([["dorahacks-buidl-1", 0.82]]),
	),
}));
// Search by meaning is mocked to run, so vetIdea would call the reranker if
// the shell exported VOYAGE_API_KEY: keep these cases off the live API.
beforeEach(() => {
	vi.stubEnv("VOYAGE_API_KEY", "");
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe("funded peers count every funded project", () => {
	const docs = Array.from({ length: 12 }, (_, i) => ({
		slug: `p${i}`,
		name: `P${i}`,
		types: ["Payments"],
		scf: { awarded: true, totalAwarded: (i + 1) * 1000 },
	}));

	it("counts and totals all of them, largest first", () => {
		const f = fundedInVertical(docs, "Payments");
		expect(f.count).toBe(12);
		expect(f.totalAwardedUSD).toBe(78_000);
		expect(f.peers[0].slug).toBe("p11");
	});

	it("ignores other verticals and unfunded rows", () => {
		const f = fundedInVertical(
			[
				...docs,
				{ slug: "x", types: ["Wallet"], scf: { awarded: true } },
				{ slug: "y", types: ["Payments"] },
			],
			"Payments",
		);
		expect(f.count).toBe(12);
	});
});

describe("prior attempts that went quiet", () => {
	it("counts dormant and archived repos, not maintained or active ones", () => {
		expect(
			countWentQuiet([
				{ activityState: "active" },
				{ activityState: "maintained" },
				{ activityState: "dormant" },
				{ activityState: "archived" },
				{ activityState: "unknown" },
			]),
		).toBe(2);
	});
});

describe("the gap computation's field list", () => {
	it("keeps what it needs to count a hackathon winner", () => {
		const full = {
			slug: "w",
			name: "W",
			types: ["Payments"],
			status: "Live",
			scf: { awarded: false },
			hackathonPlacement: "1st",
			description: "not selected",
		};
		// What a Payload select of GAP_PROJECT_SELECT hands back.
		const selected = Object.fromEntries(
			Object.keys(GAP_PROJECT_SELECT).map((k) => [
				k,
				full[k as keyof typeof full],
			]),
		);
		const gaps = computeEcosystemGaps([selected], ["Payments"]);
		expect(
			gaps.byType.find((c) => c.type === "Payments")?.hackathonWinners,
		).toBe(1);
	});
});

describe("funding without a vertical", () => {
	const payload = { find: async () => ({ docs: [], totalDocs: 0 }) } as never;

	it("is null, not zero, when the idea maps to no vertical", async () => {
		// The count never runs without a vertical; it used to read 0 and $0.
		const r = await buildScfPitch(payload, "fans fund artists");
		expect(r.vertical).toBeNull();
		expect(r.fundedPeers).toBeNull();
		expect(r.fundingBar).toBeNull();
	});

	it("is counted, even to zero, when it does", async () => {
		const r = await buildScfPitch(payload, "lending protocol for stablecoins");
		expect(r.vertical).toBe("Lending");
		expect(r.fundedPeers).toEqual([]);
		expect(r.fundingBar).toMatchObject({
			fundedProjects: 0,
			totalAwardedUSD: 0,
		});
	});
});

// scfPitch's report, reviewSubmission's review.pitch and hackathonBrief's
// report all serve this vet block; the spec declared none of priorArt.builds,
// buildsMode or competitors.projects[].via (contract audit, 2026-10-20).
// vetIdea, whose computation it is, served via undeclared too.
describe("the spec declares the vet block every composite serves", () => {
	const project = (
		slug: string,
		types: string[],
		shortDescription: string,
	) => ({
		slug,
		name: slug,
		status: "Live",
		types,
		prominence: 0,
		shortDescription,
	});
	const rows = [
		project("lendco", ["Lending"], "A lending protocol for stablecoins."),
		project("stabledesk", ["Wallet"], "A stablecoin lending desk."),
	];
	const payload = {
		find: async ({ collection }: { collection: string }) =>
			collection === "projects"
				? { docs: structuredClone(rows), totalDocs: rows.length }
				: { docs: [], totalDocs: 0 },
	} as never;
	const winner: IndexedBuild = {
		id: "dorahacks-buidl-1",
		name: "StableLend",
		description: "A lending protocol for stablecoins on Soroban.",
		githubUrl: "https://github.com/acme/stablelend",
		demoUrl: null,
		videoUrl: null,
		track: null,
		hackathonPlacement: "1st Place",
		award: null,
		isWinner: true,
		voteCount: null,
		url: "https://dorahacks.io/buidl/1",
		source: "dorahacks",
		hackathon: { title: "Stellar Hacks", slug: "hacks", endedAt: "2026-04-13" },
		haystack: "stablelend a lending protocol for stablecoins on soroban.",
		project: { slug: "lendco", name: "lendco", status: "Live" },
	};
	const undeclared = (path: string, body: unknown) =>
		undeclaredInServed(spec, responseSchema(spec, path), body);
	const served = async () => {
		const pitch = await buildScfPitch(
			payload,
			"lending protocol for stablecoins",
		);
		const brief = await buildHackathonBrief(
			payload,
			"lending protocol for stablecoins",
		);
		const vet = await buildVetIdea(payload, "lending protocol for stablecoins");
		return {
			pitch,
			undeclared: {
				scfPitch: undeclared("/api/scf-pitch", { report: pitch }),
				reviewSubmission: undeclared("/api/hackathons/review", {
					review: { pitch },
				}),
				hackathonBrief: undeclared("/api/hackathon-brief", { report: brief }),
				vetIdea: undeclared("/api/vet-idea", { report: vet }),
			},
		};
	};
	const none = {
		scfPitch: [],
		reviewSubmission: [],
		hackathonBrief: [],
		vetIdea: [],
	};

	it("with builds found by meaning and both routes to a competitor", async () => {
		buildsIndex = [winner];
		const { pitch, undeclared } = await served();
		// The fixture reaches every field the audit named.
		expect(pitch.vet.competitors.projects.map((p) => p.via)).toEqual([
			"vertical",
			"scored",
		]);
		expect(pitch.vet.priorArt.buildsMode).toBe("hybrid");
		expect(pitch.vet.priorArt.builds?.[0]).toMatchObject({
			id: "dorahacks-buidl-1",
			similarity: 0.82,
		});
		expect(undeclared).toEqual(none);
	});

	it("with the submissions index unreadable", async () => {
		buildsIndex = new Error("store down");
		const { pitch, undeclared } = await served();
		expect(pitch.vet.priorArt.builds).toBeNull();
		expect(pitch.vet.priorArt.buildsMode).toBeNull();
		expect(undeclared).toEqual(none);
	});
});
