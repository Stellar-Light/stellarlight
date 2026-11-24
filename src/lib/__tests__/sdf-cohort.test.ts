// @vitest-environment node

/**
 * The SDF cohort is served to named partners only. The gate: no key, or a
 * partner key not named in COHORT_PARTNERS, gets a 401 with one line and
 * nothing else; a named partner's key gets the data. A journey comes back
 * oldest first with every event's evidence, strength and basis. The funnel
 * counts on a fixture the way the register counts on the real data.
 */
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { GET as journeyGET } from "@/app/api/cohort/journey/route";
import { GET as projectsGET } from "@/app/api/cohort/projects/route";
import { GET as retentionGET } from "@/app/api/cohort/retention/route";
import {
	type CohortBundle,
	type CohortProject,
	cohortRetention,
	encryptBundle,
	journeyOf,
} from "../sdf-cohort";

const fixture = vi.hoisted(() => ({ buf: null as Buffer | null }));
vi.mock("node:fs", async (orig) => {
	const fs = await orig<typeof import("node:fs")>();
	const readFileSync = ((path: unknown, ...rest: unknown[]) =>
		String(path).endsWith("cohort.json.gz.enc") && fixture.buf
			? fixture.buf
			: (fs.readFileSync as (...a: unknown[]) => unknown)(
					path,
					...rest,
				)) as typeof fs.readFileSync;
	return { ...fs, default: { ...fs, readFileSync }, readFileSync };
});

const KEY = Buffer.alloc(32, 7).toString("base64");

/** The fields the gate, filters and aggregates read; the rest stay absent. */
function proj(over: Partial<CohortProject>): CohortProject {
	return {
		name: null,
		inCohort: true,
		category: null,
		status: null,
		scfAwarded: true,
		firstScfAward: null,
		firstAwardType: null,
		firstAwardSize: null,
		buildAwards: null,
		mainnetTranchePaid: null,
		launchBasis: null,
		launchEvidence: null,
		launchBeforeFirstAward: null,
		launchKnownDate: null,
		launchKnownBasis: null,
		day180Reading: null,
		operatingNow: null,
		observable: null,
		gaps: [],
		...over,
	} as CohortProject;
}

const BUNDLE: CohortBundle = {
	asOf: "2026-11-23",
	retentionAsOf: "2026-11-24",
	builtAt: "2026-11-24T00:00:00.000Z",
	sources: ["fixture"],
	register: [],
	projects: [
		// dated launch a year ago, operating
		proj({
			slug: "alpha",
			name: "Alpha",
			status: "Live",
			category: "Tooling",
			firstScfAward: "2024-05-01",
			firstAwardType: "build",
			launchEvidence: "on-chain",
			launchKnownBasis: "dated",
			launchKnownDate: "2025-06-01",
			operatingNow: "on-chain",
		}),
		// launch known only from SCF's payment, 30 days ago
		proj({
			slug: "beta",
			status: "Live",
			category: "Anchor",
			firstScfAward: "2025-01-10",
			firstAwardType: "legacy",
			launchEvidence: "none",
			launchKnownBasis: "scf-mainnet-paid-by",
			launchKnownDate: "2026-10-25",
			mainnetTranchePaid: true,
			operatingNow: "none",
		}),
		// SCF-funded, no launch evidence
		proj({
			slug: "gamma",
			status: "Inactive",
			firstScfAward: "2024-02-01",
			launchEvidence: "none",
		}),
		// not SCF
		proj({ slug: "delta", status: "Live", scfAwarded: false }),
	],
	journey: {
		alpha: [
			[
				"2025-06-01",
				"day",
				null,
				"launched",
				"contract created on mainnet",
				"CABC",
				"https://api.stellarindex.io/v1/contracts/CABC",
				"stellarindex",
				"strong",
				"ledger close time",
			],
			[
				"2024-05-01",
				"day",
				null,
				"funded",
				"SCF award",
				"round 27, 45000 USD",
				"https://communityfund.stellar.org/project/alpha",
				"SCF public award record",
				"strong",
				"SCF round decision date",
			],
			[
				"2025-11-28",
				"day",
				null,
				"other",
				"day 180 after launch",
				"activity seen (commits)",
				null,
				"computed",
				"derived",
				"launch date plus 180 days",
			],
		],
	},
	scfPages: [],
};

function req(path: string, headers: Record<string, string> = {}) {
	return new NextRequest(`https://stellarlight.xyz${path}`, {
		headers: { "x-forwarded-for": "203.0.113.50", ...headers },
	});
}

beforeAll(() => {
	process.env.SCOUT_PARTNER_KEYS = "sdf:sk_cohort_ok, other:sk_other";
	process.env.COHORT_PARTNERS = "sdf";
	process.env.COHORT_DATA_KEY = KEY;
	fixture.buf = encryptBundle(BUNDLE, KEY);
});

describe("cohort key gate", () => {
	const routes = [
		["/api/cohort/projects", projectsGET],
		["/api/cohort/journey?slug=alpha", journeyGET],
		["/api/cohort/retention", retentionGET],
	] as const;

	it.each(routes)("%s: no key is a 401 and nothing else", async (path, get) => {
		const res = await get(req(path));
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({
			error: "A cohort partner key is required.",
			hint: "Send it as Authorization: Bearer <key> or x-api-key.",
		});
		expect(res.headers.get("x-ratelimit-limit")).toBeNull();
	});

	it.each(routes)(
		"%s: a partner key not named in COHORT_PARTNERS is a 401",
		async (path, get) => {
			for (const h of [
				{ authorization: "Bearer sk_other" } as Record<string, string>,
				{ "x-api-key": "sk_other" },
				{ authorization: "Bearer sk_cohort_o" },
			]) {
				const res = await get(req(path, h));
				expect(res.status).toBe(401);
				expect(Object.keys(await res.json()).sort()).toEqual(["error", "hint"]);
			}
		},
	);

	it.each(routes)(
		"%s: a named partner's key reads the data, never cached",
		async (path, get) => {
			for (const h of [
				{ authorization: "Bearer sk_cohort_ok" } as Record<string, string>,
				{ "x-api-key": "sk_cohort_ok" },
			]) {
				const res = await get(req(path, h));
				expect(res.status).toBe(200);
				expect(res.headers.get("cache-control")).toBe("private, no-store");
				const body = await res.json();
				expect(body.meta.asOf).toBe("2026-11-23");
				expect(body.meta.cannotSee.length).toBeGreaterThan(0);
			}
		},
	);

	it("a key that does not open the bundle is a 503, never data", async () => {
		process.env.COHORT_DATA_KEY = Buffer.alloc(32, 9).toString("base64");
		try {
			const res = await retentionGET(
				req("/api/cohort/retention", { "x-api-key": "sk_cohort_ok" }),
			);
			expect(res.status).toBe(503);
		} finally {
			process.env.COHORT_DATA_KEY = KEY;
		}
	});
});

describe("cohort projects", () => {
	const ok = { "x-api-key": "sk_cohort_ok" };
	it("filters and pages, and rejects values it does not know", async () => {
		const body = await (
			await projectsGET(
				req("/api/cohort/projects?scfAwarded=true&awardType=build", ok),
			)
		).json();
		expect(body.projects.map((p: CohortProject) => p.slug)).toEqual(["alpha"]);
		expect(body.meta.counts).toEqual({ returned: 1, total: 1 });
		for (const q of ["awardType=grant", "status=Dead", "category=Nope", "x=1"])
			expect(
				(await projectsGET(req(`/api/cohort/projects?${q}`, ok))).status,
			).toBe(400);
	});
});

describe("cohort journey", () => {
	it("is oldest first and keeps every event's evidence, strength and basis", async () => {
		const res = await journeyGET(
			req("/api/cohort/journey?slug=alpha", { "x-api-key": "sk_cohort_ok" }),
		);
		const body = await res.json();
		expect(body.events.map((e: { event: string }) => e.event)).toEqual([
			"SCF award",
			"contract created on mainnet",
			"day 180 after launch",
		]);
		expect(body.events[0]).toEqual({
			date: "2024-05-01",
			datePrecision: "day",
			dateUpper: null,
			stage: "funded",
			event: "SCF award",
			detail: "round 27, 45000 USD",
			evidenceUrl: "https://communityfund.stellar.org/project/alpha",
			source: "SCF public award record",
			strength: "strong",
			basis: "SCF round decision date",
		});
		expect(body.meta.counts).toEqual({ events: 3, withEvidenceUrl: 2 });
		expect(journeyOf(BUNDLE, "delta")).toEqual([]);
		expect(journeyOf(BUNDLE, "nope")).toBeNull();
		expect(
			(
				await journeyGET(
					req("/api/cohort/journey?slug=nope", { "x-api-key": "sk_cohort_ok" }),
				)
			).status,
		).toBe(404);
	});
});

describe("cohort funnel", () => {
	it("counts SCF-funded, launch known, past day 180, operating now", () => {
		const r = cohortRetention(BUNDLE);
		expect(r.funnel.map((s) => [s.stage, s.projects, s.of])).toEqual([
			["SCF-funded", 3, 4],
			["Launch known", 2, 3],
			["Past day 180", 1, 2],
			["Operating now", 1, 1],
		]);
		expect(r.scfConfirmedRetention).toMatchObject({
			paidInFull: 1,
			launchAtLeast180DaysOld: 0,
		});
	});
});
