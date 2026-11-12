import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { BRIEF_ROSTER, IDEAS, rfpStatus } from "@/data/ideas";
import { spec } from "@/lib/openapi-spec";
import { officialOpenBriefs, rosterDrift } from "@/lib/rfp-roster";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../scripts/contract/served-shape";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
// The awards page as read on 2026-11-04: SCF #46 in Submission until
// November 9, 2026.
vi.mock("@/lib/scf-rounds", () => ({
	fetchScfRounds: vi.fn(async () => ({
		currentRound: 46,
		currentPhase: "Submission",
		lastConcludedRound: 44,
		roundsInProgress: [
			{ round: 46, phase: "Submission", submissionDeadline: "2026-11-09" },
		],
		submissionWindow: { opens: null, closes: "2026-11-09" },
		fetchedAt: "2026-11-04T21:37:32.000Z",
	})),
}));

const rfps = async (query = "") => {
	const { GET } = await import("@/app/api/rfps/route");
	const res = await GET(new NextRequest(`https://x.test/api/rfps${query}`));
	return res.json();
};

// Live 1.9.116 (sls-096): ?status=open served layerzero-dvn and
// x402-facilitator-bazaar as open in q3-2026, 17 days after SCF's RFP Track
// page dropped them for "October 2026: New Q4 RFPs are coming soon."
describe("the open brief roster follows SCF's RFP Track page", () => {
	it("serves the two Q4 briefs SCF's page lists as open, and keeps the live round", async () => {
		const body = await rfps("?status=open");
		expect(body.meta.activeQuarter).toBe("q4-2026");
		expect(body.meta.activeQuarterLabel).toBe("Q4 2026");
		expect(body.meta.counts.open).toBe(2);
		const briefs = body.rfps.filter(
			(r: { rowType: string }) => r.rowType === "rfp",
		);
		expect(
			briefs.map(
				(r: {
					id: string;
					status: string;
					publishedBrief: { title: string };
				}) => [r.id, r.status, r.publishedBrief.title],
			),
		).toEqual([
			[
				"scf-web-api-analytics",
				"open",
				"Web and API Analytics for Stellar Ecosystem Projects",
			],
			[
				"xdr-cap-coverage-audit",
				"open",
				"XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide",
			],
		]);
		// Pinned to the page version that published them (2026-11-11).
		for (const r of briefs) {
			expect(r.publishedBrief.url, r.id).toBe(
				"https://github.com/stellar/scf-handbook/blob/4cc1fae33d46618cf9193d1467e670fe7a48550a/scf-awards/build-award/rfp-track.md",
			);
			expect(r.publishedBrief.checkedOn, r.id).toBe("2026-11-12");
		}
		// The SCF submission window is a separate fact, still served.
		expect(
			body.rfps
				.filter((r: { rowType: string }) => r.rowType === "scf-round")
				.map((r: { id: string }) => r.id),
		).toEqual(["scf-round-46"]);
		expect(body.meta.scfRound.submissionWindow.closes).toBe("2026-11-09");
		// The roster's basis: the page, and the day it was read.
		expect(body.meta.briefRoster).toEqual({
			source:
				"https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/rfp-track",
			checkedOn: "2026-11-12",
		});
		expect(BRIEF_ROSTER.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("serves the Q3 briefs as closed", async () => {
		const body = await rfps("?quarter=q3-2026");
		expect(
			body.rfps
				.filter((r: { rowType: string }) => r.rowType === "rfp")
				.map((r: { id: string; status: string }) => [r.id, r.status]),
		).toEqual([
			["layerzero-dvn", "closed"],
			["x402-facilitator-bazaar", "closed"],
		]);
	});

	it("declares every key it serves", async () => {
		for (const q of ["", "?status=open", "?q=source%20verification"]) {
			const body = await rfps(q);
			expect(
				undeclaredInServed(spec, responseSchema(spec, "/api/rfps"), body),
				q,
			).toEqual([]);
		}
	});
});

// Live 1.9.116 (sls-105): the closed Q2 row served the idea board's
// "Deterministic Build" summary as its requirements, with no link to the
// brief SCF published, which asks for SEP-58 metadata and an SDF-allowlisted
// trusted build image and rules deterministic Rust compilation research out.
describe("a brief SCF published is linked, apart from the idea summary", () => {
	const PINNED =
		/^https:\/\/github\.com\/stellar\/scf-handbook\/blob\/[0-9a-f]{40}\/scf-awards\/build-award\/rfp-track\.md$/;

	it("links contract-source-verification to its Q2 brief and restates its requirements", async () => {
		const body = await rfps("?q=source%20verification");
		const row = body.rfps.find(
			(r: { id: string }) => r.id === "contract-source-verification",
		);
		expect([row.status, row.quarter]).toEqual(["closed", "q2-2026"]);
		// The idea board's text stays, as the idea summary it is.
		expect(row.technicalRequirements).toMatch(/^Deterministic Build:/);
		const brief = row.publishedBrief;
		expect(brief.title).toBe("Contract Source Verification Service");
		// The last page version that carried the Q2 briefs (2026-07-23).
		expect(brief.url).toBe(
			"https://github.com/stellar/scf-handbook/blob/1e04b79973358e3dea58d821ed6419b50c93370c/scf-awards/build-award/rfp-track.md",
		);
		expect(brief.checkedOn).toBe("2026-11-04");
		const required = brief.functionalRequirements.join(" ");
		for (const field of [
			"bldimg",
			"bldopt",
			"source_repo",
			"source_rev",
			"tarball_url",
			"tarball_sha256",
		])
			expect(required).toContain(field);
		expect(required).toContain("SDF-allowlisted trusted build image");
		expect(brief.outOfScope.join(" ")).toContain(
			"Fully deterministic Rust compilation as a research effort",
		);
	});

	// Review: q read the idea text only, so the brief's own terms found
	// nothing.
	it("finds a brief by the words its published brief uses", async () => {
		for (const q of ["bldimg", "tarball_sha256", "allowlisted"]) {
			const body = await rfps(`?q=${q}`);
			expect(
				body.rfps.map((r: { id: string }) => r.id),
				q,
			).toEqual(["contract-source-verification"]);
		}
	});

	it("links each brief to a commit-pinned copy of the RFP Track page, one per quarter", () => {
		const linked = IDEAS.filter((i) => i.publishedBrief);
		expect(IDEAS.filter((i) => !i.publishedBrief).map((i) => i.id)).toEqual([
			"concentrated-liquidity-amm",
			"soroban-vrf",
			"ai-webide",
		]);
		const copies = new Map<string, Set<string>>();
		for (const i of linked) {
			const b = i.publishedBrief;
			if (!b) continue;
			expect(b.url, i.id).toMatch(PINNED);
			expect(b.checkedOn, i.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(b.title.trim(), i.id).not.toBe("");
			expect(JSON.stringify(b), i.id).not.toMatch(/[\u2013\u2014]/);
			copies.set(i.quarter, (copies.get(i.quarter) ?? new Set()).add(b.url));
		}
		// A quarter's briefs were published together, on one page version.
		for (const [quarter, urls] of copies) expect(urls.size, quarter).toBe(1);
		expect([...copies.keys()]).toEqual([
			"q1-2026",
			"q2-2026",
			"q3-2026",
			"q4-2026",
		]);
	});
});

/** The RFP Track page's markdown in the shapes it has taken: a notice line
 * when there is one, then each brief a <details> block under "Current Open
 * RFPs", up to the next heading. */
const page = (notice: string | null, ...blocks: string[]) =>
	[
		"#### Requirements",
		"",
		"#### Current Open RFPs",
		"",
		...(notice ? [notice, ""] : []),
		...blocks.flatMap((b) => ["<details>", "", b, "", "</details>", ""]),
		"#### Process & Timeline",
		"",
		"<details><summary>Not a brief</summary></details>",
	].join("\n");
const COMING_SOON = "<summary><strong>Coming Soon</strong></summary>\n\n###";
const Q4_NOTICE = "_**October 2026: New Q4 RFPs are coming soon.**_";
const section = (...lines: string[]) =>
	["#### Current Open RFPs", "", ...lines, "", "#### Process & Timeline"].join(
		"\n",
	);

describe("the open briefs the RFP Track page lists", () => {
	it("reads none from the October 2026 page, which says so plainly", () => {
		const official = officialOpenBriefs(
			page(Q4_NOTICE, COMING_SOON, COMING_SOON),
		);
		expect(official).toEqual([]);
	});

	it("reads the two Q4 briefs from the November 2026 page, and they match what is served", () => {
		// 2026-11-11 (handbook 4cc1fae3): no notice line, two bold summaries.
		const official = officialOpenBriefs(
			page(
				null,
				"<summary><strong>Web and API Analytics for Stellar Ecosystem Projects</strong></summary>\n\n### **Web and API Analytics for Stellar Ecosystem Projects**\n\n### 1. Scope of Work",
				"<summary><strong>XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide</strong></summary>\n\n### **XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide**\n\n### 1. Scope of Work",
			),
		);
		expect(official).toEqual([
			"Web and API Analytics for Stellar Ecosystem Projects",
			"XDR/CAP-Coverage Audit Tool and Indexer-Hardening Guide",
		]);
		const ours = IDEAS.filter((i) => rfpStatus(i.quarter) === "open").map(
			(i) => i.publishedBrief?.title ?? i.title,
		);
		expect(rosterDrift(official ?? [], ours)).toEqual({
			notServed: [],
			notListed: [],
		});
	});

	it("reads each brief's title, and flags both directions of drift", () => {
		const official = officialOpenBriefs(
			page(
				"_**July 23, 2026: New Q3 RFPs are open for submissions!**_",
				// Q3 2026: a plain summary, its sections inside the block.
				"<summary>Stellar-compatible LayerZero DVN</summary>\n\n### Stellar-compatible LayerZero DVN\n\n#### 1. Scope of Work",
				// A bold summary, with an entity and a trailing colon (2026-03-24).
				"<summary><strong>C-Address Tooling &#x26; Onboarding :</strong></summary>",
				COMING_SOON,
			),
		);
		expect(official).toEqual([
			"Stellar-compatible LayerZero DVN",
			"C-Address Tooling & Onboarding",
		]);
		expect(
			rosterDrift(official ?? [], [
				"stellar-compatible  layerzero DVN",
				"Prices API",
			]),
		).toEqual({
			notServed: ["C-Address Tooling & Onboarding"],
			notListed: ["Prices API"],
		});
	});

	// Review: a summary on the block's own line, or with an attribute, read
	// as no brief, and an empty list passed as "none open".
	it("reads a summary however its tags are written", () => {
		const one = ["Q4 Prices API"];
		expect(
			officialOpenBriefs(
				section("<details><summary>Q4 Prices API</summary>", "", "</details>"),
			),
		).toEqual(one);
		expect(
			officialOpenBriefs(
				page(null, '<summary class="x">Q4 Prices API</summary>'),
			),
		).toEqual(one);
		expect(
			officialOpenBriefs(
				page(null, "<summary>\n<strong>Q4 Prices API</strong>\n</summary>"),
			),
		).toEqual(one);
		expect(
			officialOpenBriefs(
				section("<DETAILS open><Summary>Q4 Prices API</Summary></DETAILS>"),
			),
		).toEqual(one);
	});

	it("does not count a brief the page marks closed", () => {
		// How the page listed Q1 2026's briefs after they closed.
		expect(
			officialOpenBriefs(
				page(
					"_**April 4, 2025: All Q1 RFPs are closed. Keep an eye out for Q2 RFPs coming soon.**_",
					"<summary><strong>Prices API :</strong> No longer accepting submissions</summary>",
				),
			),
		).toEqual([]);
	});

	it("knows nothing unless the section reads one way: briefs, or a plain none", () => {
		expect(officialOpenBriefs("# RFP Track\n\nMoved.")).toBeNull();
		// No brief, and nothing on the page saying none is open.
		expect(officialOpenBriefs(page(null, COMING_SOON, COMING_SOON))).toBeNull();
		expect(officialOpenBriefs(section("New briefs below."))).toBeNull();
		// A block whose title is not in a summary, a block left open, and a
		// summary outside any block: shapes this does not read.
		expect(
			officialOpenBriefs(page(Q4_NOTICE, "<p>Q4 Prices API</p>")),
		).toBeNull();
		expect(
			officialOpenBriefs(
				section(Q4_NOTICE, "<details>", "<summary>Q4 Prices API</summary>"),
			),
		).toBeNull();
		expect(
			officialOpenBriefs(
				section(Q4_NOTICE, "<summary>Q4 Prices API</summary>"),
			),
		).toBeNull();
	});

	// Review: the check existed and nothing ran it.
	it("runs every night, and a red run is reported", () => {
		const yml = readFileSync(
			join(process.cwd(), ".github/workflows/nightly-health.yml"),
			"utf8",
		);
		const step =
			/- name: [^\n]*\n\s+id: (\w+)\n(?:\s+[^\n]*\n){0,6}?\s+run: pnpm exec tsx scripts\/check-rfp-roster\.ts/.exec(
				yml,
			);
		expect(step?.[1]).toBeTruthy();
		const id = step?.[1] ?? "";
		const env = new RegExp(
			`(\\w+): \\$\\{\\{ steps\\.${id}\\.outcome \\}\\}`,
		).exec(yml)?.[1];
		expect(env).toBeTruthy();
		expect(yml).toContain(
			`[ "$${env}" = "failure" ] && REDS="$REDS rfp-roster"`,
		);
	});
});

// Review: the skill told agents open briefs are "continuously fundable" and
// that no open match means "no current SCF round covers this lane", while
// counts.open is 0 and SCF #46 takes submissions until 2026-11-09.
describe("what the skill tells an agent about open briefs", () => {
	const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
	const skill = read("public/skills/stellar-scout.md");
	const reference = read("public/skills/references/api-reference.md");

	it("never ties the SCF round to the brief list", () => {
		for (const [name, text] of [
			["stellar-scout.md", skill],
			["api-reference.md", reference],
		])
			expect(text, name).not.toMatch(
				/no current SCF round covers this lane|continuously fundable|ready to be funded and built/i,
			);
		// No open match sends the agent to the round's own state.
		expect(skill).toMatch(/0 matches[^\n]*meta\.scfRound/);
		expect(reference).toMatch(/counts\.open[^\n]*0[^\n]*meta\.scfRound/);
	});
});
