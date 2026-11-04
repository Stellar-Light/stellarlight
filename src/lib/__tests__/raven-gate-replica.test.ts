/**
 * The Raven gate replica (scripts/eval/raven-gate-replica.ts), ported from
 * Raven fec1c79. Its self-check rebuilds Raven's committed catalog, but only
 * what Raven's own inventory exercises; these fixtures cover the ported rules
 * that inventory never reaches, and the exit-2 message that names a drifted
 * Raven source (2026-11-04: a parser error used to hide which files changed).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	buildDocsEntries,
	buildScoutEntries,
	changedPortedSources,
	loadPolicy,
	PORTED_FROM_RAVEN,
} from "../../../scripts/eval/raven-gate-replica";

type Json = Record<string, unknown>;

const roots: string[] = [];
function checkout(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), "raven-replica-"));
	roots.push(root);
	for (const [rel, text] of Object.entries(files)) {
		mkdirSync(join(root, rel, ".."), { recursive: true });
		writeFileSync(join(root, rel), text);
	}
	return root;
}
afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// Raven's policy files in their fec1c79 layout, with fixture data.
const POLICY = {
	"src/policy/scout-exposure.ts": `export const EXCLUDED_SCOUT_OPERATIONS = new Map([
  ["GET /api/feedback", "getFeedbackSchema"],
  // Review reads a caller-supplied link.
  ["GET /api/hackathons/review", "reviewSubmission"],
  ["GET /api/hackathons/builds/{id}", "getHackathonSubmission"]
]);
export const OPTIONAL_EXCLUDED_SCOUT_OPERATIONS = new Map<string, string>();
export const SCOUT_PATHS_ABSENT_FROM_SPEC = new Set(["/api/repos"]);
`,
	"scripts/description-notes.mjs":
		"export const SCOUT_DESCRIPTION_SCRUBS = {\n};\n",
	"scripts/exposure.mjs":
		'export const EXCLUDED_LUMENLOOP_OPS = new Set([\n  "request_research"\n]);\n',
	"src/skills/scrub.ts":
		"export const RETIRED_SKILL_REF_RE = /lumenloop-api-[a-z]+/;\n",
};

const param = (name: string, description: string) => ({
	name,
	in: "query",
	description,
	schema: { type: "string" },
});
const SPEC = {
	servers: [{ url: "https://stellarlight.xyz" }],
	paths: {
		"/api/hackathons/compare": {
			get: {
				operationId: "compareHackathons",
				summary: "Compare hackathons",
				description:
					"Side-by-side comparison. Profiles count like reviewSubmission; deltas name the shifts.",
				parameters: [
					param("slugs", "Fetch one build at /api/hackathons/builds/{id}."),
					param(
						"facet",
						"Shape: (getFeedbackSchema, reviewSubmission) lists it.",
					),
				],
			},
		},
		"/api/hackathons/review": {
			get: { operationId: "reviewSubmission" },
			post: { operationId: "postReview" },
		},
		"/api/hackathons/builds/{id}": {
			get: { operationId: "getHackathonSubmission" },
		},
		"/api/hackathons/builds": {
			get: {
				operationId: "searchHackathonBuilds",
				"x-routing": { useWhen: ["open one at /api/hackathons/builds/abc123"] },
			},
		},
		"/api/feedback": { get: { operationId: "getFeedbackSchema" } },
	},
};

describe("raven-gate-replica, ported from Raven fec1c79", () => {
	const policy = loadPolicy(checkout(POLICY), { entries: [] });
	const problems: string[] = [];
	const entries = buildScoutEntries(SPEC, policy, problems);
	const compare = entries.find((e) => e.id === "scout.compareHackathons");
	const props = (compare?.inputSchema as { properties: Record<string, Json> })
		.properties;

	it("parses an empty typed optional-exclusion Map", () => {
		expect([...policy.excluded.keys()]).toEqual([
			"GET /api/feedback",
			"GET /api/hackathons/review",
			"GET /api/hackathons/builds/{id}",
		]);
		expect(policy.optionalExcluded.size).toBe(0);
	});

	it("drops each operation-description clause that names a non-exposed operation", () => {
		expect(compare?.description).toBe(
			"Compare hackathons. Side-by-side comparison. deltas name the shifts.",
		);
	});

	it("labels a templated excluded path by its last literal segment", () => {
		expect(props.slugs?.description).toBe(
			"Fetch one build at upstream builds.",
		);
	});

	it("closes the gap a removed name list leaves", () => {
		expect(props.facet?.description).toBe("Shape: lists it.");
	});

	it("holds an unreviewed method at any excluded path, not only optional ones", () => {
		expect(problems).toContain(
			"unreviewed Scout op at an excluded path: POST /api/hackathons/review",
		);
	});

	it("treats a concrete value in a templated excluded path as a leak", () => {
		expect(problems).toContain(
			'ADR-0003 leak: scout.searchHackathonBuilds x-routing.useWhen emits excluded scout endpoint path "/api/hackathons/builds/{id}"',
		);
	});

	it("builds Mintlify docs entries with title words from /docs/ prefixes only", () => {
		const docs = buildDocsEntries(
			{
				service: "stellarDocs",
				catalogHints: { kind: "operation" },
				backend: { apiBase: "https://api.mintlify.com", candidateWindow: 50 },
				operations: [
					{
						id: "stellarDocs.a",
						description: "A",
						mintlify: { include: ["/docs/build/"] },
					},
					{
						id: "stellarDocs.b",
						description: "B",
						mintlify: { include: ["/meetings/"] },
					},
				],
			},
			{
				titles: [
					{ path: "/docs/build/muxed", title: "Muxed accounts" },
					{ path: "/meetings/2026-01-01", title: "Protocol meeting" },
				],
			},
			[],
		);
		expect(docs[0]?.transport).toMatchObject({
			type: "mintlify",
			apiBase: "https://api.mintlify.com",
			candidateWindow: 50,
			mintlify: { include: ["/docs/build/"] },
		});
		expect(docs[0]?.keywords).toEqual(["muxed", "accounts"]);
		expect(docs[1]?.keywords).toBeUndefined();
	});
});

describe("raven-gate-replica names drifted Raven sources", () => {
	const sha = (text: string) => createHash("sha256").update(text).digest("hex");

	it("lists changed and missing files, never identical ones", () => {
		const dir = checkout({ "same.ts": "a", "edited.ts": "b" });
		expect(
			changedPortedSources(dir, {
				"same.ts": sha("a"),
				"edited.ts": sha("a"),
				"gone.ts": sha("a"),
			}),
		).toEqual(["edited.ts", "gone.ts (missing)"]);
	});

	it("names them in the exit-2 message when Raven's policy layout cannot be parsed", () => {
		const empty = '{"cases": []}';
		const dir = checkout({
			"catalog/manifest.json": '{"entries": []}',
			"eval/routing-cases.json": empty,
			"eval/skills-cases.json": empty,
			"eval/holdout-cases.json": empty,
			"eval/protocol-history-cases.json":
				'{"positiveCases": [], "controlCases": []}',
			"eval/gates.json": "{}",
			"inventory/stellar-light.json": "{}",
			"inventory/stellar-docs-titles.json": '{"titles": []}',
			"specs/stellar-docs.json": "{}",
			"src/policy/scout-exposure.ts":
				"export const EXCLUDED_SCOUT_OPERATIONS = exclusions();\n",
			"scripts/build-catalog.mjs": "edited upstream",
		});
		let status = 0;
		let stderr = "";
		try {
			execFileSync(
				"pnpm",
				["exec", "tsx", "scripts/eval/raven-gate-replica.ts", "--raven", dir],
				{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
			);
		} catch (e) {
			({ status, stderr } = e as { status: number; stderr: string });
		}
		expect(status).toBe(2);
		expect(stderr).toContain(
			'raven-gate-replica failed: scout-exposure.ts: "EXCLUDED_SCOUT_OPERATIONS = new Map(...)" not found',
		);
		expect(stderr).toContain(
			"ported Raven sources changed since fec1c79: src/catalog/vendor/search-scoring.ts (missing),",
		);
		for (const path of Object.keys(PORTED_FROM_RAVEN))
			expect(stderr).toContain(
				path === "scripts/build-catalog.mjs" ? `${path},` : `${path} (missing)`,
			);
	}, 60_000);
});
