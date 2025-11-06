import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchRepoInfo } from "../../src/lib/github";

// Mock fetch globally
global.fetch = vi.fn();

describe("GitHub aggregation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("fetchRepoInfo", () => {
		it("should fetch repo info from GitHub GraphQL API", async () => {
			const mockResponse = {
				data: {
					repository: {
						url: "https://github.com/stellar/js-stellar-sdk",
						issues: { totalCount: 5 },
						pushedAt: "2024-01-15T10:30:00Z",
						defaultBranchRef: {
							target: {
								committedDate: "2024-01-15T10:25:00Z",
							},
						},
					},
				},
			};

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await fetchRepoInfo("stellar", "js-stellar-sdk");

			expect(result).toEqual({
				url: "https://github.com/stellar/js-stellar-sdk",
				lastCommitAt: "2024-01-15T10:25:00Z",
				openIssues: 5,
			});

			expect(global.fetch).toHaveBeenCalledWith(
				"https://api.github.com/graphql",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"Content-Type": "application/json",
						"User-Agent": "stellar-ecosystem-directory",
					}),
				}),
			);
		});

		it("should use pushedAt when defaultBranchRef is missing", async () => {
			const mockResponse = {
				data: {
					repository: {
						url: "https://github.com/stellar/repo",
						issues: { totalCount: 3 },
						pushedAt: "2024-01-20T15:45:00Z",
						defaultBranchRef: null,
					},
				},
			};

			(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				json: async () => mockResponse,
			});

			const result = await fetchRepoInfo("stellar", "repo");

			expect(result.lastCommitAt).toBe("2024-01-20T15:45:00Z");
		});
	});

	describe("aggregation logic", () => {
		it("should aggregate max lastCommitAt across multiple repos", () => {
			const repos = [
				{ lastCommitAt: "2024-01-10T10:00:00Z", openIssues: 2 },
				{ lastCommitAt: "2024-01-15T10:30:00Z", openIssues: 5 },
				{ lastCommitAt: "2024-01-12T14:20:00Z", openIssues: 3 },
			];

			const lastTs = Math.max(
				...repos.map((r) =>
					r.lastCommitAt ? new Date(r.lastCommitAt).getTime() : 0,
				),
			);

			const lastActivityAt =
				lastTs > 0 ? new Date(lastTs).toISOString() : null;

			expect(lastActivityAt).toBe("2024-01-15T10:30:00.000Z");
		});

		it("should sum openIssues across multiple repos", () => {
			const repos = [
				{ openIssues: 2 },
				{ openIssues: 5 },
				{ openIssues: 3 },
			];

			const openIssuesTotal = repos.reduce(
				(sum, r) => sum + (r.openIssues || 0),
				0,
			);

			expect(openIssuesTotal).toBe(10);
		});

		it("should handle repos with null lastCommitAt", () => {
			const repos = [
				{ lastCommitAt: "2024-01-10T10:00:00Z", openIssues: 2 },
				{ lastCommitAt: null, openIssues: 5 },
				{ lastCommitAt: "2024-01-12T14:20:00Z", openIssues: 3 },
			];

			const lastTs = Math.max(
				...repos.map((r) =>
					r.lastCommitAt ? new Date(r.lastCommitAt).getTime() : 0,
				),
			);

			const lastActivityAt =
				lastTs > 0 ? new Date(lastTs).toISOString() : null;

			expect(lastActivityAt).toBe("2024-01-12T14:20:00.000Z");
		});
	});

	describe("cache freshness check", () => {
		it("should consider cache fresh if within 6 hours", () => {
			const now = Date.now();
			const fetchedAt = new Date(now - 3 * 60 * 60 * 1000).toISOString(); // 3 hours ago

			const fresh =
				fetchedAt &&
				Date.now() - new Date(fetchedAt).getTime() < 6 * 60 * 60 * 1000;

			expect(fresh).toBe(true);
		});

		it("should consider cache stale if older than 6 hours", () => {
			const now = Date.now();
			const fetchedAt = new Date(now - 7 * 60 * 60 * 1000).toISOString(); // 7 hours ago

			const fresh =
				fetchedAt &&
				Date.now() - new Date(fetchedAt).getTime() < 6 * 60 * 60 * 1000;

			expect(fresh).toBe(false);
		});

		it("should handle missing fetchedAt", () => {
			const fetchedAt = null;

			const fresh =
				fetchedAt &&
				Date.now() - new Date(fetchedAt).getTime() < 6 * 60 * 60 * 1000;

			expect(fresh).toBe(false);
		});
	});
});

