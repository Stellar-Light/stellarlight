/**
 * The Raven catalog drift guard (scripts/check-raven-drift.ts) separates the
 * operations Raven's own exposure policy excludes from drift. On 2026-11-04
 * it called seven of them uncataloged ("their index, past grace") because it
 * read a list typed on 2026-07-21 instead of Raven's policy (review
 * 2026-11-05). It reads the policy with the gate replica's reader.
 */
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Stubbed before the import: no test may reach Raven or GitHub.
const fetchMock = vi.hoisted(() => {
	const mock = vi.fn(
		async (..._args: unknown[]) => new Response("", { status: 599 }),
	);
	vi.stubGlobal("fetch", mock);
	return mock;
});

import {
	classifySpecOps,
	loadRavenExposure,
	main,
} from "../../../scripts/check-raven-drift";

// Raven's src/policy/scout-exposure.ts layout at fec1c79, fixture data.
const POLICY = `export const EXCLUDED_SCOUT_OPERATIONS = new Map([
  ["POST /api/feedback", "submitFeedback"],
  ["GET /api/feedback", "getFeedbackSchema"],
  ["POST /api/partners/onboard", "partnerOnboard"],
  // Keep review excluded until its routing repair passes.
  ["GET /api/hackathons/review", "reviewSubmission"],
  ["GET /api/hackathons/builds/{id}", "getHackathonSubmission"]
]);
export const OPTIONAL_EXCLUDED_SCOUT_OPERATIONS = new Map<string, string>([
  ["GET /api/sources/locate", "locateSource"]
]);
export const SCOUT_PATHS_ABSENT_FROM_SPEC = new Set(["/api/repos"]);
`;

const get = (operationId: string, extra: Record<string, unknown> = {}) => ({
	get: { operationId, ...extra },
});
const SPEC = {
	paths: {
		"/api/feedback": {
			get: { operationId: "getFeedbackSchema" },
			post: { operationId: "submitFeedback", "x-side-effecting": true },
		},
		"/api/partners/onboard": {
			post: { operationId: "partnerOnboard", "x-side-effecting": true },
		},
		"/api/partners/submit": {
			post: { operationId: "submitThing", "x-side-effecting": true },
		},
		"/api/hackathons/review": get("reviewSubmission"),
		"/api/hackathons/builds/{id}": {
			parameters: [{ name: "id", in: "path" }],
			...get("getHackathonSubmission"),
		},
		"/api/hackathons/builds": get("searchHackathonBuilds"),
		"/api/sources/locate": get("locateSource"),
		"/api/projects": get("searchProjects"),
	},
};

const roots: string[] = [];
afterEach(() => {
	vi.unstubAllEnvs();
	fetchMock.mockClear();
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe("check-raven-drift", () => {
	it("expects only what Raven means to serve, and lists its exclusions apart", () => {
		const excluded = new Set([
			"POST /api/feedback",
			"GET /api/feedback",
			"POST /api/partners/onboard",
			"GET /api/hackathons/review",
			"GET /api/hackathons/builds/{id}",
			"GET /api/sources/locate",
		]);
		const { ops, excludedByPolicy, pathByOp } = classifySpecOps(SPEC, excluded);
		expect(ops).toEqual(["searchHackathonBuilds", "searchProjects"]);
		expect(excludedByPolicy).toEqual([
			"getFeedbackSchema",
			"getHackathonSubmission",
			"locateSource",
			"partnerOnboard",
			"reviewSubmission",
			"submitFeedback",
		]);
		// A side-effecting op Raven's policy does not name is still not
		// expected in the catalog, and is not called Raven's exclusion.
		expect([...ops, ...excludedByPolicy]).not.toContain("submitThing");
		expect(pathByOp.get("searchProjects")).toBe("/api/projects");
	});

	it("reads both exclusion maps from a Raven clone with the replica's reader", async () => {
		const dir = mkdtempSync(join(tmpdir(), "raven-drift-"));
		roots.push(dir);
		mkdirSync(join(dir, "src/policy"), { recursive: true });
		writeFileSync(join(dir, "src/policy/scout-exposure.ts"), POLICY);
		vi.stubEnv("RAVEN_DIR", dir);
		const { source, excluded } = await loadRavenExposure();
		expect(source).toBe(join(dir, "src/policy/scout-exposure.ts"));
		expect([...excluded]).toEqual([
			"POST /api/feedback",
			"GET /api/feedback",
			"POST /api/partners/onboard",
			"GET /api/hackathons/review",
			"GET /api/hackathons/builds/{id}",
			"GET /api/sources/locate",
		]);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("reads Raven's main branch over HTTP when no clone is given", async () => {
		vi.stubEnv("RAVEN_DIR", "");
		fetchMock.mockResolvedValueOnce(new Response(POLICY));
		const { source, excluded } = await loadRavenExposure();
		const url =
			"https://raw.githubusercontent.com/stellar-experimental/stellar-raven/main/src/policy/scout-exposure.ts";
		expect(fetchMock.mock.calls[0]?.[0]).toBe(url);
		expect(source).toBe(url);
		expect(excluded.has("GET /api/hackathons/review")).toBe(true);
		expect(excluded.size).toBe(6);
	});

	it("fails instead of guessing when the policy cannot be read", async () => {
		vi.stubEnv("RAVEN_DIR", "");
		fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));
		await expect(loadRavenExposure()).rejects.toThrow("HTTP 503");
		fetchMock.mockResolvedValueOnce(
			new Response("export const EXCLUDED_SCOUT_OPERATIONS = exclusions();\n"),
		);
		await expect(loadRavenExposure()).rejects.toThrow(
			"src/policy/scout-exposure.ts: EXCLUDED_SCOUT_OPERATIONS is not a new Map(...) over a literal",
		);
	});
});

// Review 2026-11-05 (second round): both could-not-check exits left the last
// run's artifact in place, so /api/quality kept its verdict and date.
describe("check-raven-drift when it cannot look", () => {
	const run = async () => {
		const dir = mkdtempSync(join(tmpdir(), "raven-drift-run-"));
		roots.push(dir);
		const out = join(dir, "artifact.json");
		vi.stubEnv("HOME", dir);
		vi.stubEnv("RAVEN_MCP_TOKEN", "");
		vi.stubEnv("RAVEN_TOKEN", "");
		const exit = vi.spyOn(process, "exit").mockImplementation(((
			code: number,
		) => {
			throw new Error(`exit ${code}`);
		}) as never);
		try {
			await expect(main(["node", "x", "--json", out])).rejects.toThrow(
				"exit 2",
			);
		} finally {
			exit.mockRestore();
		}
		return JSON.parse(readFileSync(out, "utf8"));
	};
	const interlock = async (artifact: unknown) => {
		vi.resetModules();
		vi.doMock("../../../improvements/audits/raven-drift-latest.json", () => ({
			default: artifact,
		}));
		const { getGuardRows } = await import("../quality-artifacts");
		vi.doUnmock("../../../improvements/audits/raven-drift-latest.json");
		return getGuardRows(new Date()).find((r) => r.key === "raven-interlock");
	};

	it("writes checked: false with the reason when Raven's policy cannot be read", async () => {
		vi.stubEnv("RAVEN_DIR", "");
		fetchMock.mockResolvedValue(new Response("", { status: 503 }));
		const artifact = await run();
		expect(artifact.checked).toBe(false);
		expect(artifact.notes[0]).toContain(
			"could not read Raven's exposure policy",
		);
		const row = await interlock(artifact);
		expect(row?.value).toBe("not checked");
		expect(row?.ok).toBe(false);
		expect(row?.details[0]).toContain("HTTP 503");
	});

	it("writes checked: false with the reason when there is no Raven credential", async () => {
		const dir = mkdtempSync(join(tmpdir(), "raven-drift-"));
		roots.push(dir);
		mkdirSync(join(dir, "src/policy"), { recursive: true });
		writeFileSync(join(dir, "src/policy/scout-exposure.ts"), POLICY);
		vi.stubEnv("RAVEN_DIR", dir);
		fetchMock.mockResolvedValue(new Response(JSON.stringify(SPEC)));
		const artifact = await run();
		expect(artifact.checked).toBe(false);
		expect(artifact.catalogOps).toBeNull();
		expect(artifact.notes[0]).toContain("no Raven credential");
		const row = await interlock(artifact);
		expect(row?.value).toBe("not checked");
		expect(row?.measure).toEqual({
			value: 0,
			of: null,
			unit: "operations checked",
		});
		expect(row?.details[0]).toContain("no Raven credential");
	});
});
