/**
 * @stellar-light/api-client — typed TypeScript client for the Stellar
 * Scout API (https://stellarlight.xyz/api/openapi.json).
 *
 * Zero runtime dependencies — native fetch, works in Node 20+, browsers,
 * and edge runtimes. For autonomous agents and aggregators that consume
 * the API directly; human-driven MCP clients (Claude Desktop, Cursor)
 * should use @stellar-light/scout-mcp instead.
 *
 *   import { ScoutClient } from "@stellar-light/api-client";
 *
 *   const scout = new ScoutClient();
 *   const { projects } = await scout.searchProjects({ q: "stablecoin", scfAwarded: true });
 *
 * Types are generated from the live OpenAPI spec (src/schema.ts via
 * openapi-typescript). Regenerate with `pnpm generate` when the spec
 * changes.
 */

import type { components, paths } from "./schema";

export type { components, paths };

/** Re-exported component schemas for consumer convenience. */
export type Project = components["schemas"]["Project"];
export type ProjectSearchResponse = components["schemas"]["ProjectSearchResponse"];
export type Repo = components["schemas"]["Repo"];
export type RepoSearchResponse = components["schemas"]["RepoSearchResponse"];
export type StatusResponse = components["schemas"]["StatusResponse"];
export type HackathonsResponse = components["schemas"]["HackathonsResponse"];
export type HackathonDetailResponse = components["schemas"]["HackathonDetailResponse"];
export type FeedbackRequest = components["schemas"]["FeedbackRequest"];

/** Query params, lifted from the generated paths for ergonomic call sites. */
export type SearchProjectsParams = NonNullable<
	paths["/api/projects/search"]["get"]["parameters"]["query"]
>;
export type SearchReposParams = NonNullable<
	paths["/api/repos/search"]["get"]["parameters"]["query"]
>;
export type GetHackathonsParams = NonNullable<
	paths["/api/hackathons"]["get"]["parameters"]["query"]
>;
export type GetBuildersParams = NonNullable<
	paths["/api/builders"]["get"]["parameters"]["query"]
>;
export type GetRfpsParams = NonNullable<
	paths["/api/rfps"]["get"]["parameters"]["query"]
>;
export type SearchResearchParams = NonNullable<
	paths["/api/research"]["get"]["parameters"]["query"]
>;
export type ListSkillsParams = NonNullable<
	paths["/api/skills"]["get"]["parameters"]["query"]
>;
export type GetClustersParams = NonNullable<
	paths["/api/clusters"]["get"]["parameters"]["query"]
>;
export type AnalyzeEcosystemParams = NonNullable<
	paths["/api/analyze"]["get"]["parameters"]["query"]
>;
export type GetLeaderboardParams = NonNullable<
	paths["/api/leaderboard"]["get"]["parameters"]["query"]
>;

export interface ScoutClientOptions {
	/** API origin. Defaults to https://stellarlight.xyz */
	baseUrl?: string;
	/** Request timeout in ms. Defaults to 30_000. */
	timeoutMs?: number;
	/** Extra headers sent with every request (e.g. identify your agent). */
	headers?: Record<string, string>;
	/** Custom fetch implementation (testing / instrumented runtimes). */
	fetch?: typeof globalThis.fetch;
}

/** Thrown on any non-2xx response. Carries status + parsed error body. */
export class ScoutApiError extends Error {
	readonly status: number;
	readonly url: string;
	readonly body: unknown;

	constructor(status: number, url: string, body: unknown) {
		const detail =
			body && typeof body === "object" && "error" in body
				? ` — ${(body as { error: string }).error}`
				: "";
		super(`Scout API ${status} on ${url}${detail}`);
		this.name = "ScoutApiError";
		this.status = status;
		this.url = url;
		this.body = body;
	}
}

const DEFAULT_BASE_URL = "https://stellarlight.xyz";
const CLIENT_VERSION = "1.1.0";

export class ScoutClient {
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly headers: Record<string, string>;
	private readonly fetchImpl: typeof globalThis.fetch;

	constructor(options: ScoutClientOptions = {}) {
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
		this.timeoutMs = options.timeoutMs ?? 30_000;
		this.headers = {
			"user-agent": `stellar-light-api-client/${CLIENT_VERSION}`,
			...options.headers,
		};
		this.fetchImpl = options.fetch ?? globalThis.fetch;
	}

	/** Service health, data-source freshness, endpoint enumeration. */
	getStatus(): Promise<StatusResponse> {
		return this.get("/api/status");
	}

	/** Search 741+ curated Stellar projects (prior art / competitor lookup). */
	searchProjects(params: SearchProjectsParams = {}): Promise<ProjectSearchResponse> {
		return this.get("/api/projects/search", params);
	}

	/**
	 * Search ~1,900 indexed-and-scored Stellar GitHub repos by tech/keyword —
	 * the code layer beneath the project directory. Ranked by repoScore
	 * (freshness + traction + hackathon/SCF/builder authority).
	 */
	searchRepos(params: SearchReposParams = {}): Promise<RepoSearchResponse> {
		return this.get("/api/repos/search", params);
	}

	/** List Stellar hackathons (curated + DoraHacks merged feed). */
	getHackathons(params: GetHackathonsParams = {}): Promise<HackathonsResponse> {
		return this.get("/api/hackathons", params);
	}

	/** Full detail for one hackathon by slug. */
	getHackathon(slug: string): Promise<HackathonDetailResponse> {
		return this.get(`/api/hackathons/${encodeURIComponent(slug)}`);
	}

	/** Side-by-side comparison of 2–5 hackathons with a deltas block. */
	compareHackathons(slugs: string[]): Promise<Record<string, unknown>> {
		// The API parses ?slugs=a,b (comma-separated), not repeated params.
		return this.get("/api/hackathons/compare", { slugs: slugs.join(",") });
	}

	/** Search Stellar builder profiles (Stellar Passport directory). */
	getBuilders(params: GetBuildersParams = {}): Promise<Record<string, unknown>> {
		return this.get("/api/builders", params);
	}

	/** Open + closed SCF-funded sponsor briefs. */
	getRfps(params: GetRfpsParams = {}): Promise<Record<string, unknown>> {
		return this.get("/api/rfps", params);
	}

	/** Vector search over the 4,541-chunk Stellar research corpus. */
	searchResearch(params: SearchResearchParams): Promise<Record<string, unknown>> {
		return this.get("/api/research", params);
	}

	/** Merged AI-skill catalog (SDF + curated + community). */
	listSkills(params: ListSkillsParams = {}): Promise<Record<string, unknown>> {
		return this.get("/api/skills", params);
	}

	/** One skill's full content + metadata by slug. */
	getSkill(name: string): Promise<Record<string, unknown>> {
		return this.get(`/api/skills/${encodeURIComponent(name)}`);
	}

	/** Topic clusters with log-scaled crowdedness scores. */
	getClusters(params: GetClustersParams = {}): Promise<Record<string, unknown>> {
		return this.get("/api/clusters", params);
	}

	/** Cross-event analytics rollup (hackathons + categories + funding). */
	analyzeEcosystem(params: AnalyzeEcosystemParams = {}): Promise<Record<string, unknown>> {
		return this.get("/api/analyze", params);
	}

	/** Electric Capital developer-activity stats + project leaderboard. */
	getLeaderboard(params: GetLeaderboardParams = {}): Promise<Record<string, unknown>> {
		return this.get("/api/leaderboard", params);
	}

	/** Report wrong / missing / misleading data to the curator queue. */
	submitFeedback(
		body: FeedbackRequest,
	): Promise<{ ok: boolean; id: string; message?: string }> {
		return this.request("/api/feedback", { method: "POST", body });
	}

	/* ── transport ──────────────────────────────────────────────────── */

	private get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
		return this.request<T>(path, { method: "GET", params });
	}

	private async request<T>(
		path: string,
		init: {
			method: "GET" | "POST";
			params?: Record<string, unknown>;
			body?: unknown;
		},
	): Promise<T> {
		const url = new URL(this.baseUrl + path);
		for (const [key, value] of Object.entries(init.params ?? {})) {
			if (value === undefined || value === null) continue;
			// Arrays (e.g. compare slugs) serialize as repeated params
			if (Array.isArray(value)) {
				for (const v of value) url.searchParams.append(key, String(v));
			} else {
				url.searchParams.set(key, String(value));
			}
		}

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.timeoutMs);
		try {
			const res = await this.fetchImpl(url.toString(), {
				method: init.method,
				headers: {
					accept: "application/json",
					...(init.body !== undefined && {
						"content-type": "application/json",
					}),
					...this.headers,
				},
				...(init.body !== undefined && { body: JSON.stringify(init.body) }),
				signal: controller.signal,
			});

			const body = await res.json().catch(() => null);
			if (!res.ok) {
				throw new ScoutApiError(res.status, url.toString(), body);
			}
			return body as T;
		} finally {
			clearTimeout(timer);
		}
	}
}
