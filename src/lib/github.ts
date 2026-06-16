const GQL = "https://api.github.com/graphql";

const Q_REPO = `
  query RepoInfo($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      url
      nameWithOwner
      description
      homepageUrl
      isFork
      isArchived
      issues(states: OPEN) { totalCount }
      stargazerCount
      pushedAt
      primaryLanguage { name }
      repositoryTopics(first: 25) { nodes { topic { name } } }
      readmeMd: object(expression: "HEAD:README.md") { ... on Blob { text } }
      readmeLower: object(expression: "HEAD:readme.md") { ... on Blob { text } }
      readmeRst: object(expression: "HEAD:README.rst") { ... on Blob { text } }
      readmeTxt: object(expression: "HEAD:README") { ... on Blob { text } }
      defaultBranchRef { target { ... on Commit { committedDate } } }
    }
  }
`;

export async function fetchRepoInfo(owner: string, name: string) {
	const token = process.env.GITHUB_TOKEN?.trim() || process.env.NEXT_PUBLIC_GITHUB_TOKEN?.trim();
	
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "stellar-ecosystem-directory",
	};
	
	if (token) {
		headers.Authorization = `Bearer ${token.trim()}`;
	}
	
	const requestBody = JSON.stringify({ query: Q_REPO, variables: { owner, name } });
	
	const res = await fetch(GQL, {
		method: "POST",
		headers,
		body: requestBody,
	});

	// Parse response even if status is not OK to check GraphQL errors
	let data: any;
	let responseText: string | null = null;
	
	try {
		responseText = await res.text();
		data = JSON.parse(responseText);
	} catch (parseError) {
		// If we can't parse JSON, it's a real HTTP error
		if (!res.ok) {
			const isRateLimit =
				res.status === 403 &&
				res.headers.get("x-ratelimit-remaining") === "0";
			
			// Handle 401 Unauthorized specifically
			if (res.status === 401) {
				const isFineGrained = token?.startsWith("github_pat_");
				throw new Error(
					`GitHub API error: 401 Unauthorized - Token authentication failed. ` +
					(isFineGrained 
						? `For fine-grained tokens (github_pat_), verify: 1) Repository access is set to "All repositories", 2) Permissions include Metadata (read), Contents (read), and Issues (read), 3) Token has not expired.`
						: `Please verify your GITHUB_TOKEN is valid and has not expired.`)
				);
			}
			
			throw new Error(
				isRateLimit
					? "GitHub API rate limit exceeded"
					: `GitHub API error: ${res.status} - ${responseText || res.statusText}`,
			);
		}
		throw new Error(`Failed to parse GitHub API response: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
	}

	// Check for GraphQL errors first (these can occur even with 200 OK)
	if (data.errors) {
		const errorMsg = data.errors[0]?.message || "GraphQL error";
		const errorType = data.errors[0]?.type || "";

		// Handle authentication errors
		if (
			errorMsg.includes("Bad credentials") ||
			errorMsg.includes("401") ||
			errorType === "UNAUTHENTICATED"
		) {
			const isFineGrained = token?.startsWith("github_pat_");
			throw new Error(
				`GitHub API error: 401 Unauthorized - ${errorMsg}. ` +
				(isFineGrained
					? `For fine-grained tokens (github_pat_), verify: 1) Repository access is set to "All repositories" (not just specific repos), 2) Permissions include Metadata (read), Contents (read), and Issues (read), 3) Token has not expired. Repository: ${owner}/${name}`
					: `Please verify your GITHUB_TOKEN is valid and has not expired.`)
			);
		}

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

		// Handle 401 Unauthorized
		if (res.status === 401) {
			throw new Error(
				"GitHub API error: 401 Unauthorized - Invalid or expired token. Please verify your GITHUB_TOKEN environment variable is set correctly and the token is valid."
			);
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

	const stargazerCount = typeof r.stargazerCount === 'number' ? r.stargazerCount : (parseInt(String(r.stargazerCount || 0), 10) || 0);
	const openIssues = typeof r.issues?.totalCount === 'number' ? r.issues.totalCount : (parseInt(String(r.issues?.totalCount || 0), 10) || 0);
	const topics: string[] = Array.isArray(r.repositoryTopics?.nodes)
		? r.repositoryTopics.nodes
				.map((n: any) => n?.topic?.name)
				.filter((t: any): t is string => typeof t === "string" && t.length > 0)
		: [];
	// First README variant that resolved, capped to keep the index light; this
	// is the biggest recall lever — topics are sparse, READMEs name the tech.
	const readmeRaw: string | null =
		r.readmeMd?.text ?? r.readmeLower?.text ?? r.readmeRst?.text ?? r.readmeTxt?.text ?? null;
	const readme = typeof readmeRaw === "string" && readmeRaw.length > 0 ? readmeRaw.slice(0, 4000) : null;

	return {
		url: r.url as string,
		nameWithOwner: (r.nameWithOwner ?? null) as string | null,
		description: (r.description ?? null) as string | null,
		homepageUrl: (r.homepageUrl ?? null) as string | null,
		isFork: !!r.isFork,
		isArchived: !!r.isArchived,
		primaryLanguage: (r.primaryLanguage?.name ?? null) as string | null,
		topics,
		readme,
		lastCommitAt:
			(r.defaultBranchRef?.target?.committedDate ??
				r.pushedAt) as string,
		openIssues,
		stargazerCount,
	};
}

