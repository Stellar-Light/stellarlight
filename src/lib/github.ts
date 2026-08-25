const GQL = "https://api.github.com/graphql";

// Shared field set so the single and BATCHED fetch stay byte-identical.
const REPO_FRAGMENT = `
  fragment RepoFields on Repository {
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
      defaultBranchRef {
        target {
          ... on Commit {
            committedDate
            recent: history(since: $since) { totalCount }
          }
        }
      }
      latestRelease { publishedAt tagName }
      pullRequests(states: OPEN) { totalCount }
  }
`;

const Q_REPO = `
  query RepoInfo($owner: String!, $name: String!, $since: GitTimestamp!) {
    repository(owner: $owner, name: $name) { ...RepoFields }
  }
${REPO_FRAGMENT}`;

// List an owner's (org OR user) public, non-archived repo names, most-recently
// pushed first. Used to expand a bare-org github link (github.com/soroswap) into
// its actual repos — without this, a project that links its GitHub *org* instead
// of a single repo contributes ZERO code references. Best-effort: returns [] on
// any error (unknown login, rate limit) so enrichment degrades gracefully.
const Q_OWNER_REPOS = `
  query OwnerRepos($login: String!) {
    repositoryOwner(login: $login) {
      repositories(first: 100, isFork: false, privacy: PUBLIC,
                   orderBy: {field: PUSHED_AT, direction: DESC}) {
        nodes {
          name
          isArchived
          description
          primaryLanguage { name }
          repositoryTopics(first: 12) { nodes { topic { name } } }
        }
      }
    }
  }
`;

export interface OwnerRepo {
	name: string;
	description: string | null;
	primaryLanguage: string | null;
	topics: string[];
}

// Returns metadata (not just names) so the caller can filter an org's repos to
// the Stellar-relevant ones — a bare-org link to a multi-chain org (Axelar,
// Allbridge) otherwise drags in dozens of non-Stellar repos.
export async function listOwnerRepos(login: string): Promise<OwnerRepo[]> {
	const token =
		process.env.GITHUB_TOKEN?.trim() ||
		process.env.NEXT_PUBLIC_GITHUB_TOKEN?.trim();
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "stellar-ecosystem-directory",
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	try {
		const res = await fetch(GQL, {
			method: "POST",
			headers,
			body: JSON.stringify({ query: Q_OWNER_REPOS, variables: { login } }),
		});
		// biome-ignore lint/suspicious/noExplicitAny: GraphQL response shape
		const data: any = JSON.parse(await res.text());
		if (data?.errors) return []; // unknown login / rate-limited → skip gracefully
		const nodes = data?.data?.repositoryOwner?.repositories?.nodes;
		if (!Array.isArray(nodes)) return [];
		return nodes
			.filter(
				(n: any) => n && n.isArchived !== true && typeof n.name === "string",
			)
			.map((n: any) => ({
				name: n.name as string,
				description: (n.description ?? null) as string | null,
				primaryLanguage: (n.primaryLanguage?.name ?? null) as string | null,
				topics: Array.isArray(n.repositoryTopics?.nodes)
					? n.repositoryTopics.nodes
							.map((t: any) => t?.topic?.name)
							.filter((s: any): s is string => typeof s === "string")
					: [],
			}));
	} catch {
		return [];
	}
}

export async function fetchRepoInfo(owner: string, name: string) {
	const token =
		process.env.GITHUB_TOKEN?.trim() ||
		process.env.NEXT_PUBLIC_GITHUB_TOKEN?.trim();

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "stellar-ecosystem-directory",
	};

	if (token) {
		headers.Authorization = `Bearer ${token.trim()}`;
	}

	// Velocity window for activitySignals.commits90d — commits on the default
	// branch in the 90 days before this fetch.
	const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
	const requestBody = JSON.stringify({
		query: Q_REPO,
		variables: { owner, name, since },
	});

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
				res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0";

			// Handle 401 Unauthorized specifically
			if (res.status === 401) {
				const isFineGrained = token?.startsWith("github_pat_");
				throw new Error(
					`GitHub API error: 401 Unauthorized - Token authentication failed. ` +
						(isFineGrained
							? `For fine-grained tokens (github_pat_), verify: 1) Repository access is set to "All repositories", 2) Permissions include Metadata (read), Contents (read), and Issues (read), 3) Token has not expired.`
							: `Please verify your GITHUB_TOKEN is valid and has not expired.`),
				);
			}

			throw new Error(
				isRateLimit
					? "GitHub API rate limit exceeded"
					: `GitHub API error: ${res.status} - ${responseText || res.statusText}`,
			);
		}
		throw new Error(
			`Failed to parse GitHub API response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
		);
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
						: `Please verify your GITHUB_TOKEN is valid and has not expired.`),
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
				"GitHub API error: 401 Unauthorized - Invalid or expired token. Please verify your GITHUB_TOKEN environment variable is set correctly and the token is valid.",
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

	return normalizeRepoNode(r);
}

// biome-ignore lint/suspicious/noExplicitAny: GraphQL node shape
export function normalizeRepoNode(r: any) {
	const stargazerCount =
		typeof r.stargazerCount === "number"
			? r.stargazerCount
			: parseInt(String(r.stargazerCount || 0), 10) || 0;
	const openIssues =
		typeof r.issues?.totalCount === "number"
			? r.issues.totalCount
			: parseInt(String(r.issues?.totalCount || 0), 10) || 0;
	const topics: string[] = Array.isArray(r.repositoryTopics?.nodes)
		? r.repositoryTopics.nodes
				.map((n: any) => n?.topic?.name)
				.filter((t: any): t is string => typeof t === "string" && t.length > 0)
		: [];
	// First README variant that resolved, capped to keep the index light; this
	// is the biggest recall lever — topics are sparse, READMEs name the tech.
	const readmeRaw: string | null =
		r.readmeMd?.text ??
		r.readmeLower?.text ??
		r.readmeRst?.text ??
		r.readmeTxt?.text ??
		null;
	const readme =
		typeof readmeRaw === "string" && readmeRaw.length > 0
			? readmeRaw.slice(0, 4000)
			: null;

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
		lastCommitAt: (r.defaultBranchRef?.target?.committedDate ??
			r.pushedAt) as string,
		openIssues,
		stargazerCount,
		commits90d: (r.defaultBranchRef?.target?.recent?.totalCount ?? null) as
			| number
			| null,
		lastReleaseAt: (r.latestRelease?.publishedAt ?? null) as string | null,
		releaseTag: (r.latestRelease?.tagName ?? null) as string | null,
		openPRs: (r.pullRequests?.totalCount ?? null) as number | null,
	};
}

export type RepoInfo = ReturnType<typeof normalizeRepoNode>;

// ── Batched repo info (GraphQL aliases) ─────────────────────────────────
// The enrich full pass called fetchRepoInfo once per repo (~2,900
// point-costing queries/pass on ONE shared PAT budget) — the starvation
// class behind the failed waves. Aliases put up to 40 repositories in one
// query against the same REPO_FRAGMENT, so single and batched results stay
// byte-identical through normalizeRepoNode.

const GH_NAME_RE = /^[A-Za-z0-9_.-]+$/;
// 40-alias queries (x4 README blob objects each) drew 502s from GitHub —
// smaller chunks keep the response inside what the API will serve.
export const BATCH_SIZE = 15;

/** Pure query builder (unit-tested): throws on names that could break out
 * of the string literal — GitHub logins/repos are [A-Za-z0-9_.-] only. */
export function buildBatchQuery(
	pairs: { owner: string; name: string }[],
): string {
	const aliases = pairs
		.map((p, i) => {
			if (!GH_NAME_RE.test(p.owner) || !GH_NAME_RE.test(p.name))
				throw new Error(`invalid owner/name: ${p.owner}/${p.name}`);
			return `    r${i}: repository(owner: "${p.owner}", name: "${p.name}") { ...RepoFields }`;
		})
		.join("\n");
	return `\n  query RepoBatch($since: GitTimestamp!) {\n${aliases}\n  }\n${REPO_FRAGMENT}`;
}

let gqlBatchQueries = 0;
let gqlBatchRepos = 0;
export const gqlBatchStats = () => ({
	queries: gqlBatchQueries,
	repos: gqlBatchRepos,
});

export type BatchRepoResult = { info: RepoInfo } | { error: string };

/** Fetch many repos in aliased chunks. Per-alias isolation: one missing/
 * private repo yields {error} for THAT pair with the same message strings
 * fetchRepoInfo throws, so call sites keep identical per-repo semantics.
 * Batch-level failures (auth, rate limit, HTTP) throw — callers fall back
 * to per-repo fetches. */
export async function fetchRepoInfoBatch(
	pairs: { owner: string; name: string }[],
): Promise<BatchRepoResult[]> {
	const token =
		process.env.GITHUB_TOKEN?.trim() ||
		process.env.NEXT_PUBLIC_GITHUB_TOKEN?.trim();
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"User-Agent": "stellar-ecosystem-directory",
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	const since = new Date(Date.now() - 90 * 86_400_000).toISOString();

	const out: BatchRepoResult[] = new Array(pairs.length);
	for (let start = 0; start < pairs.length; start += BATCH_SIZE) {
		const chunk = pairs.slice(start, start + BATCH_SIZE);
		// pre-filter invalid names so one garbage entry can't sink its chunk
		const valid: { pair: (typeof chunk)[number]; idx: number }[] = [];
		chunk.forEach((pair, i) => {
			if (GH_NAME_RE.test(pair.owner) && GH_NAME_RE.test(pair.name))
				valid.push({ pair, idx: start + i });
			else out[start + i] = { error: "Repository not found" };
		});
		if (!valid.length) continue;
		// Per-chunk degradation: one failed chunk (502, transient) leaves ONLY
		// its own slots unfilled — the caller's per-repo fallback covers them.
		// The first live run abandoned the whole 2,900-repo prefetch on one 502.
		// biome-ignore lint/suspicious/noExplicitAny: GraphQL envelope
		let data: any = null;
		for (let attempt = 0; attempt < 2 && !data; attempt++) {
			try {
				const res = await fetch(GQL, {
					method: "POST",
					headers,
					body: JSON.stringify({
						query: buildBatchQuery(valid.map((v) => v.pair)),
						variables: { since },
					}),
				});
				const parsed = JSON.parse(await res.text());
				const topErr = Array.isArray(parsed.errors)
					? // biome-ignore lint/suspicious/noExplicitAny: GraphQL error shape
						parsed.errors.find((e: any) => !e.path)
					: null;
				if (
					topErr?.type === "RATE_LIMITED" ||
					/rate limit/i.test(topErr?.message ?? "")
				)
					throw new Error("GitHub API rate limit exceeded");
				if (!res.ok || (!parsed.data && parsed.errors))
					throw new Error(
						`GitHub API error: ${parsed.errors?.[0]?.message ?? res.status}`,
					);
				data = parsed;
			} catch (e) {
				if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
				else
					console.error(
						`  batch chunk failed (${e instanceof Error ? e.message : e}) — ${valid.length} repo(s) fall back to per-repo`,
					);
			}
		}
		if (!data) continue;
		gqlBatchQueries++;
		gqlBatchRepos += valid.length;
		// biome-ignore lint/suspicious/noExplicitAny: GraphQL error shape
		const errByAlias = new Map<string, any>();
		for (const e of data.errors ?? [])
			if (typeof e.path?.[0] === "string") errByAlias.set(e.path[0], e);
		valid.forEach(({ idx }, i) => {
			const node = data.data?.[`r${i}`];
			if (node) {
				out[idx] = { info: normalizeRepoNode(node) };
				return;
			}
			const e = errByAlias.get(`r${i}`);
			out[idx] = {
				error:
					e?.type === "NOT_FOUND"
						? "Repository not found"
						: e?.type === "FORBIDDEN"
							? "Private repository - access denied"
							: (e?.message ?? "Repository not found"),
			};
		});
	}
	return out;
}
