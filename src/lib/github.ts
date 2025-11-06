const GQL = "https://api.github.com/graphql";

const Q_REPO = `
  query RepoInfo($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      url
      issues(states: OPEN) { totalCount }
      stargazerCount
      pushedAt
      defaultBranchRef { target { ... on Commit { committedDate } } }
    }
  }
`;

export async function fetchRepoInfo(owner: string, name: string) {
	const token = process.env.GITHUB_TOKEN;
	const res = await fetch(GQL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": "stellar-ecosystem-directory",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
		body: JSON.stringify({ query: Q_REPO, variables: { owner, name } }),
	});

	// Parse response even if status is not OK to check GraphQL errors
	let data: any;
	try {
		data = await res.json();
	} catch {
		// If we can't parse JSON, it's a real HTTP error
		if (!res.ok) {
			const isRateLimit =
				res.status === 403 &&
				res.headers.get("x-ratelimit-remaining") === "0";
			throw new Error(
				isRateLimit
					? "GitHub API rate limit exceeded"
					: `GitHub API error: ${res.status}`,
			);
		}
		throw new Error("Failed to parse GitHub API response");
	}

	// Check for GraphQL errors first (these can occur even with 200 OK)
	if (data.errors) {
		const errorMsg = data.errors[0]?.message || "GraphQL error";
		const errorType = data.errors[0]?.type || "";

		// Only mark as private if GraphQL explicitly says so
		if (
			errorMsg.includes("not accessible") ||
			errorMsg.includes("private") ||
			errorType === "FORBIDDEN"
		) {
			throw new Error("Private repository - access denied");
		}

		// Rate limit via GraphQL
		if (errorMsg.includes("rate limit") || errorType === "RATE_LIMITED") {
			throw new Error("GitHub API rate limit exceeded");
		}

		// Repository not found
		if (errorMsg.includes("not found") || errorType === "NOT_FOUND") {
			throw new Error("Repository not found");
		}

		throw new Error(`GitHub GraphQL error: ${errorMsg}`);
	}

	// Handle HTTP errors after parsing GraphQL errors
	// Note: GitHub GraphQL API usually returns 200 even with errors,
	// so non-200 statuses are uncommon but possible
	if (!res.ok) {
		const ratelimitRemaining = res.headers.get("x-ratelimit-remaining");
		const isRateLimit =
			res.status === 403 &&
			ratelimitRemaining !== null &&
			ratelimitRemaining === "0";

		// If we have GraphQL errors but also HTTP error, prefer GraphQL error message
		if (data.errors) {
			const errorMsg = data.errors[0]?.message || "GraphQL error";
			throw new Error(`GitHub API error: ${errorMsg}`);
		}

		throw new Error(
			isRateLimit
				? "GitHub API rate limit exceeded"
				: res.status === 403
					? `GitHub API error: 403 Forbidden (check rate limits or token permissions)`
					: res.status === 404
						? "Repository not found"
						: `GitHub API error: ${res.status}`,
		);
	}

	const r = data?.data?.repository;

	if (!r) {
		throw new Error("Repository not found");
	}

	return {
		url: r.url as string,
		lastCommitAt:
			(r.defaultBranchRef?.target?.committedDate ??
				r.pushedAt) as string,
		openIssues: (r.issues?.totalCount ?? 0) as number,
		stargazerCount: (r.stargazerCount ?? 0) as number,
	};
}

