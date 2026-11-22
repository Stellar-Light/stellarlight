/**
 * The Raven gate replica (scripts/eval/raven-gate-replica.ts), ported from
 * Raven c41c0f9. Its self-check rebuilds Raven's committed catalog, but only
 * what Raven's own inventory exercises; these fixtures cover the ported rules
 * that inventory never reaches, and the exit-2 message that names a drifted
 * Raven source (2026-11-04: a parser error used to hide which files changed).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
	assembleCatalog,
	buildDocsEntries,
	buildScoutEntries,
	changedPortedSources,
	loadPolicy,
	PORTED_AT,
	PORTED_CODE_IN_POLICY,
	PORTED_FROM_RAVEN,
	protocolTargetProblem,
} from "../../../scripts/eval/raven-gate-replica";
import { scoutExposure } from "../../../scripts/eval/raven-policy";

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

// Raven's policy files in their c41c0f9 layout, with fixture data.
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

describe("raven-gate-replica, ported from Raven c41c0f9", () => {
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

// Review 2026-11-05: a pattern over the source text stopped at a "]);" inside
// a comment and returned a shorter policy with no error.
describe("raven-gate-replica reads Raven's policy whole, or not at all", () => {
	const policyWith = (files: Record<string, string>) =>
		loadPolicy(checkout({ ...POLICY, ...files }), { entries: [] });

	it("reads every exclusion past a comment that holds ]); and typed Maps and Sets", () => {
		const p = policyWith({
			"src/policy/scout-exposure.ts": `export const EXCLUDED_SCOUT_OPERATIONS = new Map([
  ["GET /api/feedback", "getFeedbackSchema"],
  // Keep review excluded (see the audit]);
  ["GET /api/hackathons/review", "reviewSubmission"]
]);
export const OPTIONAL_EXCLUDED_SCOUT_OPERATIONS = new Map<string, string>([
  ["GET /api/sources/locate", "locateSource"]
]);
export const SCOUT_PATHS_ABSENT_FROM_SPEC = new Set<string>(["/api/repos"]);
`,
		});
		expect([...p.excluded]).toEqual([
			["GET /api/feedback", "getFeedbackSchema"],
			["GET /api/hackathons/review", "reviewSubmission"],
		]);
		expect([...p.optionalExcluded.keys()]).toEqual(["GET /api/sources/locate"]);
		expect([...p.absentPaths]).toEqual(["/api/repos"]);
	});

	it("reads scrub needles that hold a bracket, quoted keys, a wrapped Set and a regex", () => {
		const p = policyWith({
			"scripts/description-notes.mjs": `export const SCOUT_DESCRIPTION_SCRUBS = {
  // Drop the chat pointer.
  matchPartners: ["; see [the chat] page"],
  "getStatus": [" or to discover endpoints"]
};
`,
			"scripts/exposure.mjs":
				'export const EXCLUDED_LUMENLOOP_OPS = new Set(\n  [\n    "request_research", // paid\n    "research_result"\n  ]\n);\n',
			"src/skills/scrub.ts":
				"export const RETIRED_SKILL_REF_RE =\n  /lumenloop-api-[a-z]+|lumenloop-mcp-connect/;\n",
		});
		expect(p.scrubs).toEqual({
			matchPartners: ["; see [the chat] page"],
			getStatus: [" or to discover endpoints"],
		});
		expect(p.excludedLumenloop).toEqual([
			"request_research",
			"research_result",
		]);
		expect(p.retiredSkillRe.source).toBe(
			"lumenloop-api-[a-z]+|lumenloop-mcp-connect",
		);
	});

	it.each([
		[
			"export const EXCLUDED_SCOUT_OPERATIONS = new Map(ENTRIES);",
			"EXCLUDED_SCOUT_OPERATIONS holds a value that is not an array literal",
		],
		[
			'export const EXCLUDED_SCOUT_OPERATIONS = new Map([...BASE, ["GET /x", "y"]]);',
			"EXCLUDED_SCOUT_OPERATIONS holds a value that is not an array literal",
		],
		[
			'export const EXCLUDED_SCOUT_OPERATIONS = new Map([["GET /x", NAME]]);',
			"EXCLUDED_SCOUT_OPERATIONS holds a value that is not a string literal",
		],
		[
			'export const EXCLUDED_SCOUT_OPERATIONS = new Map([["GET /x", "y"]]);',
			"OPTIONAL_EXCLUDED_SCOUT_OPERATIONS is not declared with a value",
		],
	])("refuses %j", (source, why) => {
		expect(() =>
			policyWith({
				"src/policy/scout-exposure.ts": `${source}\nexport const SCOUT_PATHS_ABSENT_FROM_SPEC = new Set();\n`,
			}),
		).toThrow(`src/policy/scout-exposure.ts: ${why};`);
	});

	// Review 2026-11-05 (second round): a truncated file parsed to a shorter
	// literal, and a later change to a declaration was invisible.
	const EXPOSURE = POLICY["src/policy/scout-exposure.ts"];
	it.each([
		[
			"src/policy/scout-exposure.ts",
			EXPOSURE.slice(0, EXPOSURE.indexOf("]);")),
			"src/policy/scout-exposure.ts: does not parse (']' expected.)",
		],
		[
			"src/policy/scout-exposure.ts",
			EXPOSURE.replace("export const EXCLUDED", "export let EXCLUDED"),
			"EXCLUDED_SCOUT_OPERATIONS is not declared const",
		],
		[
			"src/policy/scout-exposure.ts",
			`${EXPOSURE}EXCLUDED_SCOUT_OPERATIONS.set("GET /api/x", "x");\n`,
			"EXCLUDED_SCOUT_OPERATIONS is changed by .set()",
		],
		[
			"src/policy/scout-exposure.ts",
			`${EXPOSURE}if (process.env.X) SCOUT_PATHS_ABSENT_FROM_SPEC.delete("/api/repos");\n`,
			"SCOUT_PATHS_ABSENT_FROM_SPEC is changed by .delete()",
		],
		[
			"scripts/description-notes.mjs",
			'export const SCOUT_DESCRIPTION_SCRUBS = {\n  getStatus: ["x"]\n};\ndelete SCOUT_DESCRIPTION_SCRUBS.getStatus;\n',
			"SCOUT_DESCRIPTION_SCRUBS has a member deleted",
		],
		[
			"scripts/description-notes.mjs",
			'export const SCOUT_DESCRIPTION_SCRUBS = {};\nSCOUT_DESCRIPTION_SCRUBS["getStatus"] = ["x"];\n',
			"SCOUT_DESCRIPTION_SCRUBS is assigned to",
		],
		[
			"scripts/description-notes.mjs",
			'export const SCOUT_DESCRIPTION_SCRUBS = {};\nObject.assign(SCOUT_DESCRIPTION_SCRUBS, { getStatus: ["x"] });\n',
			"SCOUT_DESCRIPTION_SCRUBS is changed by Object.assign()",
		],
		[
			"scripts/exposure.mjs",
			'export var EXCLUDED_LUMENLOOP_OPS = new Set(["request_research"]);\n',
			"EXCLUDED_LUMENLOOP_OPS is not declared const",
		],
	])("refuses %s holding %j", (file, source, why) => {
		expect(() => policyWith({ [file]: source })).toThrow(why);
	});

	// Policy is data: read at run time, shape checked, hashed into the report,
	// never pinned like ported code (review 2026-11-05, second round).
	it("pins ported code only, and records each policy file's sha256 as read", () => {
		for (const path of [
			"src/policy/scout-exposure.ts",
			"scripts/exposure.mjs",
			"src/skills/scrub.ts",
		])
			expect(PORTED_FROM_RAVEN).not.toHaveProperty([path]);
		const sha = (t: string) => createHash("sha256").update(t).digest("hex");
		expect(policyWith({}).files).toEqual(
			Object.fromEntries(
				Object.entries(POLICY).map(([path, text]) => [path, sha(text)]),
			),
		);
	});
});

// Raven's own rules at c41c0f9, including their gaps: the replica predicts
// what Raven does, so a rule stricter than Raven's would hold a spec Raven
// accepts. Review 2026-11-05 asked for each of these inputs.
describe("raven-gate-replica keeps Raven's exact leak and clause rules", () => {
	const policy = loadPolicy(checkout(POLICY), { entries: [] });
	const build = (ops: Record<string, Json>) => {
		const problems: string[] = [];
		const paths = Object.fromEntries(
			Object.entries(ops).map(([id, op]) => [
				`/api/probe/${id}`,
				{ get: { operationId: id, ...op } },
			]),
		);
		const entries = buildScoutEntries({ paths }, policy, problems);
		return { problems, entries };
	};

	// Raven src/policy/scout-exposure.ts findExcludedScoutPath, at c41c0f9: a
	// templated segment matches [^\s/`)\]]+ and the path must then end
	// (?![\w-]|\/[\w{%-]). A further path segment ("/files") makes it a
	// different path; a bare trailing slash does not. Each expectation below
	// is what Raven's own function returned for that string at c41c0f9 (at
	// fec1c79 the rule was (?![\w/-]) and the two trailing-slash rows were
	// false).
	it.each([
		["Fetch /api/hackathons/builds/abc123 for the write-up", true],
		["Fetch /api/hackathons/builds/abc123?x=1", true],
		["Fetch /api/hackathons/builds/abc123/ for the write-up", true],
		["Fetch /api/hackathons/builds/abc123/files", false],
		["Fetch /api/hackathons/builds/abc123/?x=1", true],
		["GET /API/HACKATHONS/BUILDS/abc", true],
	])("x-routing %j is a leak to Raven: %s", (text, leak) => {
		const { problems } = build({ probe: { "x-routing": { useWhen: [text] } } });
		expect(
			problems.includes(
				'ADR-0003 leak: scout.probe x-routing.useWhen emits excluded scout endpoint path "/api/hackathons/builds/{id}"',
			),
		).toBe(leak);
	});

	// EXCLUDED_SCOUT_PATHS also holds the paths the spec must not list at all
	// (SCOUT_PATHS_ABSENT_FROM_SPEC), so a bare /api/repos is a leak and the
	// exposed /api/repos/search under it is not. Raven's own answers, c41c0f9.
	it.each([
		["List them via /api/repos for the catalog", true],
		["GET /api/repos?q=x", true],
		["see /api/repos/", true],
		["/API/REPOS.", true],
		["see /api/repos/search", false],
		["the /api/repositories list", false],
	])("x-routing %j names the unlisted path to Raven: %s", (text, leak) => {
		const { problems } = build({ probe: { "x-routing": { useWhen: [text] } } });
		expect(
			problems.includes(
				'ADR-0003 leak: scout.probe x-routing.useWhen emits excluded scout endpoint path "/api/repos"',
			),
		).toBe(leak);
	});

	// description-notes.mjs dropNonExposedScoutClauses: clauses end at . ! ? or
	// ; followed by whitespace, or at a newline; a clause naming a non-exposed
	// operation or an excluded path goes whole, and a concrete id is no name.
	it.each([
		[
			"Side-by-side. Profiles count like reviewSubmission;deltas name the shifts.",
			"Side-by-side.",
		],
		[
			"Side-by-side (see reviewSubmission). Deltas name the shifts.",
			"Deltas name the shifts.",
		],
		[
			"Use compareHackathons or reviewSubmission for this. Deltas name the shifts.",
			"Deltas name the shifts.",
		],
		[
			"Read one at /api/hackathons/builds/abc123. Deltas name the shifts.",
			"Read one at /api/hackathons/builds/abc123. Deltas name the shifts.",
		],
	])("description %j scores as %j", (description, scored) => {
		const { entries } = build({ probe: { description } });
		expect(entries[0]?.description).toBe(scored);
	});
});

describe("raven-gate-replica names drifted Raven sources", () => {
	const sha = (text: string) => createHash("sha256").update(text).digest("hex");

	it("does not start a run when its path only contains the script's name", async () => {
		const argv1 = process.argv[1];
		const exit = vi.spyOn(process, "exit").mockImplementation((() => {
			throw new Error("process.exit");
		}) as never);
		process.argv[1] =
			"/tmp/raven-gate-replica-row/node_modules/vitest/vitest.mjs";
		try {
			vi.resetModules();
			await import("../../../scripts/eval/raven-gate-replica");
			await new Promise((r) => setTimeout(r, 50));
			expect(exit).not.toHaveBeenCalled();
		} finally {
			process.argv[1] = argv1;
			exit.mockRestore();
		}
	});

	it("exits 2 with the usage line alone when no checkout is given", () => {
		const env = { ...process.env };
		delete env.RAVEN_DIR;
		let status = 0;
		let stderr = "";
		try {
			execFileSync(
				"pnpm",
				["exec", "tsx", "scripts/eval/raven-gate-replica.ts"],
				{
					encoding: "utf8",
					env,
					stdio: ["ignore", "pipe", "pipe"],
				},
			);
		} catch (e) {
			({ status, stderr } = e as { status: number; stderr: string });
		}
		expect(status).toBe(2);
		expect(stderr.trim()).toMatch(/^usage: raven-gate-replica --raven /);
		expect(stderr).not.toContain("ported Raven sources");
	}, 60_000);

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
			"raven-gate-replica failed: src/policy/scout-exposure.ts: EXCLUDED_SCOUT_OPERATIONS is not a new Map(...) over a literal",
		);
		expect(stderr).toContain(
			`ported Raven sources changed since ${PORTED_AT}: src/catalog/vendor/search-scoring.ts (missing),`,
		);
		expect(stderr).toContain("src/policy/scout-exposure.ts (code unreadable)");
		const edited = ["scripts/build-catalog.mjs"];
		for (const path of Object.keys(PORTED_FROM_RAVEN))
			expect(stderr).toContain(
				edited.includes(path) ? `${path},` : `${path} (missing)`,
			);
	}, 60_000);
});

// build-super-spec.mjs runs the leak guard over the whole spec codemode.spec()
// returns: every exposed operation's parameters, request body and responses,
// the components they reach and the tag list, descriptions scrubbed first.
// Each row is what Raven's own build did at c41c0f9 with the same change
// planted in its Scout inventory (12 of 12 agreed, 2026-11-22).
describe("raven-gate-replica runs Raven's leak guard over the super spec", () => {
	const policy = loadPolicy(checkout(POLICY), { entries: [] });
	const superSpec = (op: Json, rest: Json = {}) => {
		const problems: string[] = [];
		buildScoutEntries(
			{
				...rest,
				paths: {
					"/api/probe": { get: { operationId: "probe", ...op } },
					...((rest.paths as Json | undefined) ?? {}),
				},
			},
			policy,
			problems,
		);
		return problems.filter((line) => line.includes("super-spec"));
	};
	const notFound = (media: Json) => ({
		responses: {
			"404": {
				description: "Not found",
				content: { "application/json": media },
			},
		},
	});
	const ref = (name: string) =>
		notFound({ schema: { $ref: `#/components/schemas/${name}` } });
	const leak = (what: string) => [
		`ADR-0003 leak: specs/super-spec.json emits ${what}`,
	];

	it.each([
		[
			"an example in a 404 response",
			notFound({ example: "see /api/repos?x=1" }),
			{},
			'excluded scout endpoint path "/api/repos"',
		],
		[
			"a parameter example",
			{
				parameters: [
					{
						name: "p",
						in: "query",
						schema: { type: "string" },
						example: "/api/feedback",
					},
				],
			},
			{},
			'excluded scout endpoint path "/api/feedback"',
		],
		[
			"an enum value",
			{
				parameters: [
					{
						name: "p",
						in: "query",
						schema: { type: "string", enum: ["/api/hackathons/review"] },
					},
				],
			},
			{},
			'excluded scout endpoint path "/api/hackathons/review"',
		],
		[
			"a reachable component describing the unlisted path",
			ref("Err"),
			{
				components: {
					schemas: { Err: { description: "List them at /api/repos." } },
				},
			},
			'excluded scout endpoint path "/api/repos"',
		],
		[
			"a tag description",
			{},
			{ tags: [{ name: "probe", description: "see /api/repos" }] },
			'excluded scout endpoint path "/api/repos"',
		],
		[
			"a component named like an excluded operation",
			ref("ReviewSubmission"),
			{ components: { schemas: { ReviewSubmission: { type: "object" } } } },
			'excluded scout operation name "ReviewSubmission"',
		],
	])("holds on %s", (_label, op, rest, what) => {
		expect(superSpec(op, rest)).toEqual(leak(what));
	});

	it.each([
		[
			"a component description Raven rewrites before the guard",
			ref("Err"),
			{
				components: {
					schemas: { Err: { description: "GET /api/feedback is separate." } },
				},
			},
		],
		[
			"a response header description naming an excluded operation",
			{
				responses: {
					"404": {
						description: "Not found",
						headers: {
							"X-Probe": { description: "Use reviewSubmission instead." },
						},
					},
				},
			},
			{},
		],
		[
			"a component nothing exposed reaches",
			{},
			{ components: { schemas: { Orphan: { example: "/api/repos" } } } },
		],
		[
			"an excluded operation's own text",
			{},
			{
				paths: {
					"/api/feedback": {
						get: {
							operationId: "getFeedbackSchema",
							description: "see /api/repos",
						},
					},
				},
			},
		],
	])("passes %s", (_label, op, rest) => {
		expect(superSpec(op, rest)).toEqual([]);
	});

	it("holds on a reference no component answers", () => {
		expect(superSpec(ref("NoSuch"))).toEqual([
			'super-spec: dangling component reference "#/components/schemas/scout.NoSuch"',
		]);
	});

	// Second review, 2026-11-22: five more rows where Raven's real build and
	// the first port disagreed (21 of 21 agree now, both builds run).
	it("holds on a description that ends on an excluded path with no id", () => {
		// In JSON the closing quote stands where the id would: a match.
		expect(
			superSpec({ description: "Fetch one build at /api/hackathons/builds/" }),
		).toEqual(
			leak('excluded scout endpoint path "/api/hackathons/builds/{id}"'),
		);
	});

	it("holds on a server address that names the unlisted path", () => {
		expect(
			superSpec(
				{},
				{ servers: [{ url: "https://stellarlight.xyz/api/repos" }] },
			),
		).toEqual(leak('excluded scout endpoint path "/api/repos"'));
	});

	it("holds on a pointer that is not a $ref: only $refs are renamed", () => {
		expect(
			superSpec(
				notFound({
					schema: {
						oneOf: [{ $ref: "#/components/schemas/Err" }],
						discriminator: {
							propertyName: "error",
							mapping: { a: "#/components/schemas/Err" },
						},
					},
				}),
				{ components: { schemas: { Err: { type: "object" } } } },
			),
		).toEqual([
			'super-spec: dangling component reference "#/components/schemas/Err"',
		]);
	});

	// Raven stubs a 200 schema whose rendered type is longer than 2,000
	// characters down to its top-level field names, so text inside it never
	// reaches this guard; a short one is kept whole.
	const ok = (properties: Json) => ({
		responses: {
			"200": {
				description: "OK",
				content: {
					"application/json": { schema: { type: "object", properties } },
				},
			},
		},
	});
	const beside = {
		probe: { $ref: "#/components/schemas/Err", description: "see /api/repos" },
	};
	const err = { components: { schemas: { Err: { type: "object" } } } };
	const padding = Object.fromEntries(
		Array.from({ length: 30 }, (_, i) => [
			`field${i}`,
			{ type: "string", description: "x".repeat(80) },
		]),
	);

	it("holds on a key beside a $ref in a short 200 schema", () => {
		expect(superSpec(ok(beside), err)).toEqual(
			leak('excluded scout endpoint path "/api/repos"'),
		);
	});

	it("passes the same key once the 200 schema is long enough to be stubbed", () => {
		expect(superSpec(ok({ ...beside, ...padding }), err)).toEqual([]);
	});
});

// build-catalog.mjs guardedExtractKeywords guards every exclusion source, the
// entry id among them (second review, 2026-11-22: an exposed operation named
// like an excluded one passed the whole gate).
describe("raven-gate-replica guards the keyword exclusion sources", () => {
	const policy = loadPolicy(checkout(POLICY), { entries: [] });
	it("holds an exposed operation that takes an excluded operation's name", () => {
		const problems: string[] = [];
		buildScoutEntries(
			{
				paths: {
					"/api/changes": {
						get: {
							operationId: "reviewSubmission",
							"x-routing": { useWhen: ["what changed lately"] },
							responses: {
								"200": {
									description: "OK",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: { changes: { type: "array" } },
											},
										},
									},
								},
							},
						},
					},
				},
			},
			policy,
			problems,
		);
		expect(problems).toContain(
			'ADR-0003 leak: scout.reviewSubmission keyword exclusion source emits excluded scout operation name "reviewSubmission"',
		);
	});
});

// src/policy/scout-exposure.ts holds data, read live, and code the replica
// ports. The reviewer of 2026-11-22 found the leak rule had missed a path set
// added in that file's code: its code is now hashed apart from its data.
describe("raven-gate-replica hashes the code inside Raven's exposure file", () => {
	const file = (ops: string, rest: string) =>
		`export const EXCLUDED_SCOUT_OPERATIONS = new Map([${ops}]);
export const OPTIONAL_EXCLUDED_SCOUT_OPERATIONS = new Map<string, string>();
export const SCOUT_PATHS_ABSENT_FROM_SPEC = new Set(["/api/repos"]);
${rest}`;
	const paths =
		"export const EXCLUDED_SCOUT_PATHS = new Set([...SCOUT_PATHS_ABSENT_FROM_SPEC]);\n";
	const code = (ops: string, rest: string) =>
		scoutExposure(file(ops, rest)).code;
	const base = code('["GET /a", "a"]', paths);

	it("keeps one hash while only the data, the comments or the layout change", () => {
		expect(
			code(
				'\n  ["GET /a", "a"],\n  // reviewed\n  ["GET /b", "b"]\n',
				`/** why */\n// see /x//y\n${paths}`,
			),
		).toBe(base);
	});

	it("changes when a set is put together differently", () => {
		expect(
			code(
				'["GET /a", "a"]',
				paths.replace(
					"[...SCOUT",
					"[...EXCLUDED_SCOUT_OPERATIONS.keys(), ...SCOUT",
				),
			),
		).not.toBe(base);
	});

	it("reads a // inside a pattern as code, not as a comment", () => {
		const pattern = (re: string) =>
			code('["GET /a", "a"]', `${paths}export const R = ${re};\n`);
		expect(pattern("/[//]b/")).not.toBe(pattern("/[//]c/"));
	});

	it("is pinned for the commit the replica was ported from", () => {
		expect(PORTED_CODE_IN_POLICY["src/policy/scout-exposure.ts"]).toMatch(
			/^[a-f0-9]{64}$/,
		);
	});
});

// Raven validates the rebuilt manifest before any lane runs (search.ts
// refinedCatalogSchema, types.ts). Third review, 2026-11-22: each of these
// passed the replica while Raven's own loader threw.
describe("raven-gate-replica runs the checks of Raven's manifest load", () => {
	const policy = loadPolicy(checkout(POLICY), { entries: [] });
	const load = (paths: Json) => {
		const problems: string[] = [];
		const scout = buildScoutEntries({ paths }, policy, problems);
		const built = problems.length;
		assembleCatalog(
			{
				manifest: { entries: [] },
				docsSpec: {
					service: "stellarDocs",
					catalogHints: { kind: "operation" },
					backend: {},
					operations: [],
				},
				docsTitles: { titles: [] },
				policy,
			},
			scout,
			problems,
		);
		return problems.slice(built);
	};
	const get = (operationId: string, schema: unknown = { type: "object" }) => ({
		get: {
			operationId,
			responses: { "200": { content: { "application/json": { schema } } } },
		},
	});

	it("passes two plain operations", () => {
		expect(load({ "/api/a": get("getA"), "/api/b": get("getB") })).toEqual([]);
	});

	it("holds two operations that share an id", () => {
		expect(load({ "/api/a": get("same"), "/api/b": get("same") })).toContain(
			"duplicate catalog id: scout.same",
		);
	});

	it("holds a name that is not a legal identifier", () => {
		expect(load({ "/api/a": get("get-a") })).toEqual([
			'operation scout.get-a has terminal name "get-a" which is not a legal JS identifier (sandbox fn name)',
		]);
	});

	it.each([
		["the boolean true", true],
		["an array", [{ type: "object" }]],
	])("holds a 200 schema that is %s", (_label, schema) => {
		expect(load({ "/api/a": get("getA", schema) })).toEqual([
			"scout.getA outputSchema is neither an object nor null",
		]);
	});

	// transportSchema: base is a string (fourth review, 2026-11-22).
	it("holds a server address that is not a string", () => {
		const problems: string[] = [];
		buildScoutEntries(
			{ servers: [{ url: 123 }], paths: { "/api/a": get("getA") } },
			policy,
			problems,
		);
		expect(problems).toContain(
			"servers[0].url is not a string: Raven's manifest load rejects each Scout entry's transport.base",
		);
	});

	// run-routing.mjs: the protocol-history target is one searchable operation.
	it.each([
		[[{ id: "scout.searchResearch", kind: "operation" }], null],
		[[], 0],
		[[{ id: "scout.searchResearch", kind: "operation", searchable: false }], 0],
		[[{ id: "scout.searchResearch", kind: "skill" }], 1],
	] as const)("judges the protocol-history target over %j", (entries, n) => {
		expect(
			protocolTargetProblem(
				entries as unknown as Parameters<typeof protocolTargetProblem>[0],
				"scout.searchResearch",
			),
		).toBe(
			n === null
				? null
				: `protocol-history target "scout.searchResearch" resolves to ${n} searchable operation entries`,
		);
	});
});
