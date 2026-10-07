/**
 * /api/hackathon-brief — the pure parts. The composite is otherwise a join of
 * builders that have their own tests; what is new here is (1) which
 * contracts domain an idea resolves to, (2) how a TrustReport is trimmed to
 * fit an agent's result budget, and (3) that whatNotToClaim is DERIVED from
 * the brief's own facts, not a static list.
 */
import { describe, expect, it } from "vitest";
import { CODE_DOMAINS } from "../code-domains";
import {
	contractDomainFor,
	deriveWhatNotToClaim,
	summarizeTrust,
	VERTICAL_TO_CONTRACT_DOMAIN,
} from "../hackathon-brief";
import type { TrustReport } from "../trust-report";

describe("contractDomainFor", () => {
	it("every mapped domain is a real CODE_DOMAINS value (closed set; unknown values 400 on /api/contracts)", () => {
		for (const d of Object.values(VERTICAL_TO_CONTRACT_DOMAIN))
			expect(CODE_DOMAINS as readonly string[]).toContain(d);
	});

	it("idea text beats the vertical: an oracle for RWA prices is oracle, not RWA→null", () => {
		expect(contractDomainFor("price oracle for tokenized RWA", "RWA")).toEqual({
			domain: "oracle",
			basis: "idea text names the oracle domain",
		});
	});

	it("falls back to the vertical's closest domain, and says so", () => {
		const r = contractDomainFor("credit for small merchants", "Lending");
		expect(r.domain).toBe("defi-lending");
		expect(r.basis).toMatch(/closest code domain to the Lending vertical/);
	});

	it("verticals with no code-domain axis resolve to null with an honest basis", () => {
		const r = contractDomainFor("cross-chain bridge to Ethereum", "Bridge");
		expect(r.domain).toBeNull();
		expect(r.basis).toMatch(/Bridge vertical has no code-domain axis/);
	});

	it("no vertical and no hint → null, never a guessed domain", () => {
		const r = contractDomainFor("a social app for cat owners", null);
		expect(r.domain).toBeNull();
		expect(r.basis).toMatch(/did not resolve/);
	});
});

const trust = (over: Partial<TrustReport> = {}): TrustReport => ({
	repo: {
		fullName: "blend-capital/blend-contracts-v2",
		url: "https://github.com/blend-capital/blend-contracts-v2",
		stars: 100,
		lastCommitAt: "2026-08-01T00:00:00.000Z",
		isArchived: false,
		tier: "quality",
		activityState: "active",
	},
	project: { slug: "blend", name: "Blend" },
	codeTruth: {
		scanState: "scanned",
		scannedAt: "2026-08-10T00:00:00.000Z",
		stellarProof: "cargo-sdk",
		codeDepth: 0.9,
		codeDomains: ["defi-lending"],
		sdkCapabilities: ["contract-invoke"],
		interfaceSize: 42,
		contractInterface: Array.from(
			{ length: 42 },
			(_, i) => `Pool.fn${i}(a: u32) -> u32`,
		),
		mainnetContractId: "CABC…",
	},
	usage: {
		contracts: 1,
		events: 1000,
		eventsDelta: 10,
		subinvocations: 50,
		asOf: "2026-08-17",
	},
	audits: {
		count: 2,
		latest: {
			auditor: "Certora",
			publishedAt: "2025-08-13",
			title: "Blend v2",
		},
		reports: [
			{ auditor: "Certora", publishedAt: "2025-08-13", title: "Blend v2" },
			{ auditor: "Certora", publishedAt: "2025-05-31", title: "FV" },
		],
	},
	auditDrift: {
		latestAuditAt: "2025-08-13",
		lastCommitAt: "2026-08-01",
		daysOfDrift: 353,
	},
	succession: {
		successorRepo: null,
		predecessors: ["blend-capital/blend-contracts"],
	},
	signals: ["scanned", "deep-code", "audited", "code-changed-since-audit"],
	...over,
});

describe("summarizeTrust", () => {
	it("drops the full contractInterface (the budget-buster) but keeps its size and a link to the full report", () => {
		const s = summarizeTrust(trust());
		expect("contractInterface" in s.codeTruth).toBe(false);
		expect(s.codeTruth.interfaceSize).toBe(42);
		expect(s.fullReport).toBe(
			"/api/repos/trust?repo=blend-capital%2Fblend-contracts-v2",
		);
	});
	it("keeps audit count + latest, drops the per-report list; keeps signals verbatim", () => {
		const s = summarizeTrust(trust());
		expect(s.audits).toEqual({
			count: 2,
			latest: {
				auditor: "Certora",
				publishedAt: "2025-08-13",
				title: "Blend v2",
			},
		});
		expect(s.signals).toContain("code-changed-since-audit");
	});
});

describe("deriveWhatNotToClaim", () => {
	const base = () => ({
		idea: "x",
		vertical: "Lending" as string | null,
		vet: {
			competitors: { repos: [], projects: [] },
			maturity: { auditedProjects: 1, liveOnMainnetRepos: 1, basis: "b" },
			priorArt: { repos: [], note: "" },
			gap: null as null | ({ basis: string } & Record<string, unknown>),
		},
		builds: [],
		startFrom: [] as ReturnType<typeof summarizeTrust>[],
		liveContracts: {
			domain: "defi-lending",
			basis: "b",
			contracts: [{}] as never[],
			note: "",
		},
		funding: {
			round: { source: "live" as "live" | "unavailable", open: [], note: "" },
			fundedPeers: [],
			fundingBar: { fundedProjects: 0, totalAwardedUSD: 0, basis: "b" },
		},
	});

	it("says nothing it cannot ground: a clean brief yields no cautions", () => {
		// biome-ignore lint/suspicious/noExplicitAny: test shape
		expect(deriveWhatNotToClaim(base() as any)).toEqual([]);
	});

	it("each caution is triggered by the specific fact it stands on", () => {
		const b = base();
		b.vet.gap = { basis: "b" };
		b.vet.maturity.auditedProjects = 0;
		b.startFrom = [summarizeTrust(trust())]; // has auditDrift > 0
		b.liveContracts.contracts = [];
		b.funding.round.source = "unavailable";
		b.vertical = null;
		// biome-ignore lint/suspicious/noExplicitAny: test shape
		const out = deriveWhatNotToClaim(b as any);
		expect(out.some((s) => /SUPPLY-side/.test(s))).toBe(true);
		expect(out.some((s) => /never that a protocol is unaudited/.test(s))).toBe(
			true,
		);
		expect(out.some((s) => /not a safety score/.test(s))).toBe(true);
		expect(out.some((s) => /changed since/.test(s))).toBe(true);
		expect(out.some((s) => /no verified contract on record/.test(s))).toBe(
			true,
		);
		expect(out.some((s) => /do not say the round is closed/.test(s))).toBe(
			true,
		);
		expect(
			out.some((s) => /did not resolve to a Stellar vertical/.test(s)),
		).toBe(true);
	});
});
